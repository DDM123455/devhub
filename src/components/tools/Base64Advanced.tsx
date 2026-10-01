import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	BYTE_FORMATS,
	compressBytes,
	ConvertError,
	decodeToBytes,
	decompressBytes,
	encodeFromBytes,
	type ByteFormat,
	type CompressionKind,
} from '@/lib/base64-extra';
import { useCopyToClipboard } from './useCopyToClipboard';

export interface Base64ExtraMessages {
	// text tab extras
	lineByLine: string;
	lineError: string;
	prettyJson: string;
	analysisHeading: string;
	alphStandard: string;
	alphUrlSafe: string;
	alphMixed: string;
	padPresent: string;
	padMissing: string;
	padNotNeeded: string;
	padMisplaced: string;
	hadWhitespace: string;
	dataUri: string;
	validBase64: string;
	invalidBase64: string;
	badLength: string;
	problemAt: string;
	// advanced tab
	tabAdvanced: string;
	formats: Record<string, string>;
	convertHeading: string;
	convertFrom: string;
	convertTo: string;
	convertInput: string;
	convertOutput: string;
	convertSwap: string;
	convertErrInvalidChar: string;
	convertErrInvalidLength: string;
	convertErrNotText: string;
	convertErrOverflow: string;
	compressHeading: string;
	compressAction: string;
	actionDecompress: string;
	actionCompress: string;
	algorithm: string;
	algAuto: string;
	inputFormat: string;
	outputFormat: string;
	run: string;
	compressNote: string;
	compressDetected: string;
	compressFailed: string;
	compressSizes: string;
	copy: string;
	copied: string;
	copyFailed: string;
}

const fieldClass = 'min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground';
const areaClass = 'w-full rounded-md border border-border bg-background p-2 font-mono text-xs break-all text-foreground';

export function convertErrorText(err: unknown, m: Base64ExtraMessages): string {
	if (err instanceof ConvertError) {
		switch (err.code) {
			case 'invalidChar':
				return m.convertErrInvalidChar.replace('{{char}}', err.char ?? '?').replace('{{index}}', String((err.index ?? 0) + 1));
			case 'invalidLength':
				return m.convertErrInvalidLength;
			case 'notText':
				return m.convertErrNotText;
			case 'overflow':
				return m.convertErrOverflow;
		}
	}
	return m.convertErrInvalidLength;
}

function CopyBtn({ text, m }: { text: string; m: Base64ExtraMessages }) {
	const { copied, failed, copy } = useCopyToClipboard();
	return (
		<Button type="button" size="sm" variant="outline" className="min-h-9" aria-live="polite" disabled={!text} onClick={() => void copy(text)}>
			{copied ? m.copied : failed ? m.copyFailed : m.copy}
		</Button>
	);
}

function FormatSelect({ value, onChange, label, m, id }: { value: ByteFormat; onChange: (v: ByteFormat) => void; label: string; m: Base64ExtraMessages; id: string }) {
	return (
		<label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
			{label}
			<select id={id} value={value} onChange={(e) => onChange(e.target.value as ByteFormat)} className={fieldClass}>
				{BYTE_FORMATS.map((f) => (
					<option key={f} value={f}>
						{m.formats[f] ?? f}
					</option>
				))}
			</select>
		</label>
	);
}

export default function Base64Advanced({ m }: { m: Base64ExtraMessages }) {
	// Convert
	const [from, setFrom] = useState<ByteFormat>('text');
	const [to, setTo] = useState<ByteFormat>('hex');
	const [convInput, setConvInput] = useState('');
	let convOutput = '';
	let convError: string | null = null;
	if (convInput !== '') {
		try {
			convOutput = encodeFromBytes(to, decodeToBytes(from, convInput));
		} catch (err) {
			convError = convertErrorText(err, m);
		}
	}

	// Compress / decompress
	const [action, setAction] = useState<'decompress' | 'compress'>('decompress');
	const [algorithm, setAlgorithm] = useState<CompressionKind | 'auto'>('auto');
	const [inFormat, setInFormat] = useState<ByteFormat>('base64');
	const [outFormat, setOutFormat] = useState<ByteFormat>('text');
	const [zipInput, setZipInput] = useState('');
	const [zipOutput, setZipOutput] = useState('');
	const [zipInfo, setZipInfo] = useState<string | null>(null);
	const [zipError, setZipError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const switchAction = (next: 'decompress' | 'compress') => {
		setAction(next);
		setAlgorithm(next === 'compress' ? 'gzip' : 'auto');
		setInFormat(next === 'compress' ? 'text' : 'base64');
		setOutFormat(next === 'compress' ? 'base64' : 'text');
		setZipOutput('');
		setZipInfo(null);
		setZipError(null);
	};

	const runZip = async () => {
		setZipError(null);
		setZipInfo(null);
		setZipOutput('');
		setBusy(true);
		try {
			const bytes = decodeToBytes(inFormat, zipInput);
			let result: Uint8Array;
			let info: string;
			if (action === 'compress') {
				result = await compressBytes(bytes, algorithm === 'auto' ? 'gzip' : algorithm);
				info = m.compressSizes.replace('{{from}}', String(bytes.length)).replace('{{to}}', String(result.length));
			} else {
				const res = await decompressBytes(bytes, algorithm);
				result = res.bytes;
				info = `${m.compressDetected.replace('{{kind}}', res.kind)} ${m.compressSizes.replace('{{from}}', String(bytes.length)).replace('{{to}}', String(result.length))}`;
			}
			let out: string;
			try {
				out = encodeFromBytes(outFormat, result);
			} catch (err) {
				// Decompressed data that is not text: fall back to Base64 so nothing is lost.
				if (err instanceof ConvertError && err.code === 'notText') {
					out = encodeFromBytes('base64', result);
					info += ' ' + m.convertErrNotText;
				} else throw err;
			}
			setZipOutput(out);
			setZipInfo(info);
		} catch (err) {
			setZipError(err instanceof ConvertError ? convertErrorText(err, m) : m.compressFailed);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{m.convertHeading}</span>
				<div className="flex flex-wrap items-center gap-3">
					<FormatSelect id="b64-conv-from" value={from} onChange={setFrom} label={m.convertFrom} m={m} />
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="min-h-9"
						disabled={convOutput === ''}
						onClick={() => {
							const f = from;
							setFrom(to);
							setTo(f);
							setConvInput(convOutput);
						}}
					>
						{m.convertSwap}
					</Button>
					<FormatSelect id="b64-conv-to" value={to} onChange={setTo} label={m.convertTo} m={m} />
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="b64-conv-input" className="text-xs text-muted-foreground">
						{m.convertInput}
					</label>
					<textarea id="b64-conv-input" value={convInput} onChange={(e) => setConvInput(e.target.value)} rows={4} spellCheck={false} className={areaClass} />
				</div>
				{convError && (
					<p role="alert" className="text-sm text-destructive">
						{convError}
					</p>
				)}
				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<label htmlFor="b64-conv-output" className="text-xs text-muted-foreground">
							{m.convertOutput}
						</label>
						<CopyBtn text={convOutput} m={m} />
					</div>
					<textarea id="b64-conv-output" readOnly value={convOutput} rows={4} className={`${areaClass} bg-muted`} />
				</div>
			</div>

			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{m.compressHeading}</span>
				<p className="text-xs text-muted-foreground">{m.compressNote}</p>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm text-foreground">{m.compressAction}</span>
					<Button type="button" size="sm" className="min-h-9" variant={action === 'decompress' ? 'default' : 'outline'} aria-pressed={action === 'decompress'} onClick={() => switchAction('decompress')}>
						{m.actionDecompress}
					</Button>
					<Button type="button" size="sm" className="min-h-9" variant={action === 'compress' ? 'default' : 'outline'} aria-pressed={action === 'compress'} onClick={() => switchAction('compress')}>
						{m.actionCompress}
					</Button>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<label className="flex items-center gap-2 text-sm text-foreground">
						{m.algorithm}
						<select value={algorithm} onChange={(e) => setAlgorithm(e.target.value as CompressionKind | 'auto')} className={fieldClass}>
							{action === 'decompress' && <option value="auto">{m.algAuto}</option>}
							<option value="gzip">gzip</option>
							<option value="zlib">zlib (deflate)</option>
							<option value="deflate-raw">deflate (raw)</option>
						</select>
					</label>
					<FormatSelect id="b64-zip-in" value={inFormat} onChange={setInFormat} label={m.inputFormat} m={m} />
					<FormatSelect id="b64-zip-out" value={outFormat} onChange={setOutFormat} label={m.outputFormat} m={m} />
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="b64-zip-input" className="text-xs text-muted-foreground">
						{m.convertInput}
					</label>
					<textarea id="b64-zip-input" value={zipInput} onChange={(e) => setZipInput(e.target.value)} rows={4} spellCheck={false} className={areaClass} />
				</div>
				<div>
					<Button type="button" size="sm" className="min-h-9" disabled={busy || zipInput === ''} onClick={() => void runZip()}>
						{m.run}
					</Button>
				</div>
				{zipError && (
					<p role="alert" className="text-sm text-destructive">
						{zipError}
					</p>
				)}
				{zipInfo && (
					<p role="status" className="text-xs text-muted-foreground">
						{zipInfo}
					</p>
				)}
				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<label htmlFor="b64-zip-output" className="text-xs text-muted-foreground">
							{m.convertOutput}
						</label>
						<CopyBtn text={zipOutput} m={m} />
					</div>
					<textarea id="b64-zip-output" readOnly value={zipOutput} rows={5} className={`${areaClass} bg-muted`} />
				</div>
			</div>
		</div>
	);
}
