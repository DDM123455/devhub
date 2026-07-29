import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Messages {
	textTabLabel: string;
	fileTabLabel: string;
	encodeOption: string;
	decodeOption: string;
	textInputLabel: string;
	textInputPlaceholderEncode: string;
	textInputPlaceholderDecode: string;
	textOutputLabel: string;
	urlSafeLabel: string;
	lineWrapLabel: string;
	swap: string;
	copy: string;
	copied: string;
	clear: string;
	decodeError: string;
	sizeInfo: string;
	fileEncodeHeading: string;
	fileDropLabel: string;
	fileChoose: string;
	fileBase64Label: string;
	fileDataUriLabel: string;
	fileDecodeHeading: string;
	fileDecodeInputLabel: string;
	fileDecodeInputPlaceholder: string;
	fileMimeLabel: string;
	fileNameLabel: string;
	fileNamePlaceholder: string;
	downloadFile: string;
	fileDecodeError: string;
	imagePreviewLabel: string;
}

type Mode = 'encode' | 'decode';
type Tab = 'text' | 'file';

const EXTENSION_BY_MIME: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/svg+xml': 'svg',
	'application/pdf': 'pdf',
	'text/plain': 'txt',
	'application/json': 'json',
	'application/zip': 'zip',
};

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function toUrlSafe(base64: string): string {
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafeOrStandard(input: string): string {
	const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
	return base64 + '='.repeat((4 - (base64.length % 4)) % 4);
}

function wrapLines(base64: string): string {
	return base64.replace(/(.{76})/g, '$1\n');
}

function encodeText(text: string, urlSafe: boolean, lineWrap: boolean): string {
	const bytes = new TextEncoder().encode(text);
	let base64 = bytesToBase64(bytes);
	if (urlSafe) base64 = toUrlSafe(base64);
	else if (lineWrap) base64 = wrapLines(base64);
	return base64;
}

function decodeText(input: string): string {
	const cleaned = input.trim().replace(/\s+/g, '');
	const base64 = fromUrlSafeOrStandard(cleaned);
	const bytes = base64ToBytes(base64);
	return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function extractDataUri(input: string): { mime: string; base64: string } | null {
	const match = input.trim().match(/^data:([^;,]+)(?:;charset=[^;,]*)?;base64,([\s\S]+)$/);
	if (!match) return null;
	return { mime: match[1], base64: match[2] };
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			disabled={value === ''}
			onClick={() => {
				void navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? copiedLabel : label}
		</Button>
	);
}

export default function Base64Tool({ messages }: { messages: Messages }) {
	const [tab, setTab] = useState<Tab>('text');

	// Text tab state
	const [mode, setMode] = useState<Mode>('encode');
	const [textInput, setTextInput] = useState('');
	const [urlSafe, setUrlSafe] = useState(false);
	const [lineWrap, setLineWrap] = useState(false);

	const { textOutput, textError } = useMemo(() => {
		if (textInput === '') return { textOutput: '', textError: null as string | null };
		try {
			return {
				textOutput: mode === 'encode' ? encodeText(textInput, urlSafe, lineWrap) : decodeText(textInput),
				textError: null as string | null,
			};
		} catch {
			return { textOutput: '', textError: mode === 'decode' ? messages.decodeError : null };
		}
	}, [textInput, mode, urlSafe, lineWrap, messages.decodeError]);

	const handleSwap = () => {
		setMode((m) => (m === 'encode' ? 'decode' : 'encode'));
		setTextInput(textOutput);
	};

	// File encode state
	const [encodedFileName, setEncodedFileName] = useState<string | null>(null);
	const [encodedMime, setEncodedMime] = useState<string | null>(null);
	const [encodedBase64, setEncodedBase64] = useState<string | null>(null);
	const [encodedDataUri, setEncodedDataUri] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileEncode = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUri = reader.result as string;
			const parsed = extractDataUri(dataUri);
			setEncodedFileName(file.name);
			setEncodedMime(file.type || parsed?.mime || 'application/octet-stream');
			setEncodedBase64(parsed?.base64 ?? '');
			setEncodedDataUri(dataUri);
		};
		reader.readAsDataURL(file);
	};

	// File decode state
	const [fileDecodeInput, setFileDecodeInput] = useState('');
	const [fileDecodeMime, setFileDecodeMime] = useState('application/octet-stream');
	const [fileDecodeName, setFileDecodeName] = useState('');
	const [fileDecodeError, setFileDecodeError] = useState<string | null>(null);

	const handleFileDecodeInputChange = (value: string) => {
		setFileDecodeInput(value);
		setFileDecodeError(null);
		const parsed = extractDataUri(value);
		if (parsed) setFileDecodeMime(parsed.mime);
	};

	const decodedPreviewUri = useMemo(() => {
		if (fileDecodeInput.trim() === '') return null;
		const parsed = extractDataUri(fileDecodeInput);
		const base64 = parsed ? parsed.base64 : fileDecodeInput.trim().replace(/\s+/g, '');
		const mime = parsed ? parsed.mime : fileDecodeMime;
		try {
			base64ToBytes(fromUrlSafeOrStandard(base64));
			return `data:${mime};base64,${base64}`;
		} catch {
			return null;
		}
	}, [fileDecodeInput, fileDecodeMime]);

	const handleDownloadDecodedFile = () => {
		setFileDecodeError(null);
		const parsed = extractDataUri(fileDecodeInput);
		const base64 = parsed ? parsed.base64 : fileDecodeInput.trim().replace(/\s+/g, '');
		const mime = parsed ? parsed.mime : fileDecodeMime;
		let bytes: Uint8Array;
		try {
			bytes = base64ToBytes(fromUrlSafeOrStandard(base64));
		} catch {
			setFileDecodeError(messages.fileDecodeError);
			return;
		}
		const blob = new Blob([bytes], { type: mime });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		const ext = EXTENSION_BY_MIME[mime];
		link.download = fileDecodeName.trim() || `file${ext ? '.' + ext : ''}`;
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<Button type="button" size="sm" variant={tab === 'text' ? 'default' : 'outline'} onClick={() => setTab('text')}>
					{messages.textTabLabel}
				</Button>
				<Button type="button" size="sm" variant={tab === 'file' ? 'default' : 'outline'} onClick={() => setTab('file')}>
					{messages.fileTabLabel}
				</Button>
			</div>

			{tab === 'text' && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
					<div className="flex flex-wrap items-center gap-4">
						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant={mode === 'encode' ? 'default' : 'outline'}
								onClick={() => setMode('encode')}
							>
								{messages.encodeOption}
							</Button>
							<Button
								type="button"
								size="sm"
								variant={mode === 'decode' ? 'default' : 'outline'}
								onClick={() => setMode('decode')}
							>
								{messages.decodeOption}
							</Button>
						</div>
						<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<input
								type="checkbox"
								checked={urlSafe}
								onChange={(e) => setUrlSafe(e.target.checked)}
								disabled={mode === 'decode'}
							/>
							{messages.urlSafeLabel}
						</label>
						{mode === 'encode' && (
							<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<input
									type="checkbox"
									checked={lineWrap}
									onChange={(e) => setLineWrap(e.target.checked)}
									disabled={urlSafe}
								/>
								{messages.lineWrapLabel}
							</label>
						)}
					</div>

					<div className="flex flex-col gap-1">
						<label htmlFor="base64-text-input" className="text-sm font-medium text-foreground">
							{messages.textInputLabel}
						</label>
						<textarea
							id="base64-text-input"
							value={textInput}
							onChange={(e) => setTextInput(e.target.value)}
							placeholder={mode === 'encode' ? messages.textInputPlaceholderEncode : messages.textInputPlaceholderDecode}
							rows={6}
							spellCheck={false}
							className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs break-all text-foreground"
						/>
					</div>

					<div className="flex justify-center">
						<Button type="button" size="sm" variant="outline" onClick={handleSwap} disabled={textOutput === ''}>
							{messages.swap}
						</Button>
					</div>

					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<label htmlFor="base64-text-output" className="text-sm font-medium text-foreground">
								{messages.textOutputLabel}
							</label>
							<CopyButton value={textOutput} label={messages.copy} copiedLabel={messages.copied} />
						</div>
						<textarea
							id="base64-text-output"
							readOnly
							value={textOutput}
							rows={6}
							className="w-full rounded-md border border-border bg-muted p-3 font-mono text-xs break-all text-foreground"
						/>
					</div>

					{textError && <p role="alert" className="text-sm text-destructive">{textError}</p>}
					{textInput !== '' && !textError && (
						<p className="text-xs text-muted-foreground">
							{messages.sizeInfo.replace('{{input}}', String(textInput.length)).replace('{{output}}', String(textOutput.length))}
						</p>
					)}

					<div>
						<Button type="button" size="sm" variant="ghost" onClick={() => setTextInput('')}>
							{messages.clear}
						</Button>
					</div>
				</div>
			)}

			{tab === 'file' && (
				<div className="flex flex-col gap-6">
					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.fileEncodeHeading}</span>
						<div
							className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed p-4 transition-colors ${
								isDragOver ? 'border-primary bg-primary/5' : 'border-border'
							}`}
							onDragOver={(e) => {
								e.preventDefault();
								setIsDragOver(true);
							}}
							onDragLeave={() => setIsDragOver(false)}
							onDrop={(e) => {
								e.preventDefault();
								setIsDragOver(false);
								handleFileEncode(e.dataTransfer.files);
							}}
						>
							<p className="text-xs text-muted-foreground">{messages.fileDropLabel}</p>
							<label
								htmlFor="base64-file-input"
								className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
							>
								{messages.fileChoose}
							</label>
							<input
								id="base64-file-input"
								ref={fileInputRef}
								type="file"
								className="hidden"
								onChange={(e) => handleFileEncode(e.target.files)}
							/>
						</div>

						{encodedBase64 !== null && (
							<div className="flex flex-col gap-3">
								{encodedMime?.startsWith('image/') && encodedDataUri && (
									<div className="flex flex-col gap-1">
										<span className="text-xs text-muted-foreground">{messages.imagePreviewLabel}</span>
										<img src={encodedDataUri} alt={encodedFileName ?? ''} className="max-h-48 max-w-full rounded-md border border-border object-contain" />
									</div>
								)}
								<div className="flex flex-col gap-1">
									<div className="flex items-center justify-between">
										<span className="text-xs text-muted-foreground">{messages.fileBase64Label}</span>
										<CopyButton value={encodedBase64} label={messages.copy} copiedLabel={messages.copied} />
									</div>
									<textarea
										readOnly
										value={encodedBase64}
										rows={4}
										className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs break-all text-foreground"
									/>
								</div>
								<div className="flex flex-col gap-1">
									<div className="flex items-center justify-between">
										<span className="text-xs text-muted-foreground">{messages.fileDataUriLabel}</span>
										<CopyButton value={encodedDataUri ?? ''} label={messages.copy} copiedLabel={messages.copied} />
									</div>
									<textarea
										readOnly
										value={encodedDataUri ?? ''}
										rows={4}
										className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs break-all text-foreground"
									/>
								</div>
							</div>
						)}
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.fileDecodeHeading}</span>
						<div className="flex flex-col gap-1">
							<label htmlFor="base64-file-decode-input" className="text-xs text-muted-foreground">
								{messages.fileDecodeInputLabel}
							</label>
							<textarea
								id="base64-file-decode-input"
								value={fileDecodeInput}
								onChange={(e) => handleFileDecodeInputChange(e.target.value)}
								placeholder={messages.fileDecodeInputPlaceholder}
								rows={4}
								spellCheck={false}
								className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs break-all text-foreground"
							/>
						</div>
						<div className="flex flex-wrap gap-3">
							<div className="flex flex-col gap-1">
								<label htmlFor="base64-file-decode-mime" className="text-xs text-muted-foreground">
									{messages.fileMimeLabel}
								</label>
								<input
									id="base64-file-decode-mime"
									type="text"
									value={fileDecodeMime}
									onChange={(e) => setFileDecodeMime(e.target.value)}
									className="rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
								/>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="base64-file-decode-name" className="text-xs text-muted-foreground">
									{messages.fileNameLabel}
								</label>
								<input
									id="base64-file-decode-name"
									type="text"
									value={fileDecodeName}
									onChange={(e) => setFileDecodeName(e.target.value)}
									placeholder={messages.fileNamePlaceholder}
									className="rounded-md border border-border bg-background p-2 text-xs text-foreground"
								/>
							</div>
						</div>
						{decodedPreviewUri && fileDecodeMime.startsWith('image/') && (
							<div className="flex flex-col gap-1">
								<span className="text-xs text-muted-foreground">{messages.imagePreviewLabel}</span>
								<img
									src={decodedPreviewUri}
									alt={fileDecodeName.trim() || messages.imagePreviewLabel}
									className="max-h-48 max-w-full rounded-md border border-border object-contain"
								/>
							</div>
						)}
						<div>
							<Button type="button" size="sm" onClick={handleDownloadDecodedFile} disabled={fileDecodeInput.trim() === ''}>
								{messages.downloadFile}
							</Button>
						</div>
						{fileDecodeError && <p role="alert" className="text-sm text-destructive">{fileDecodeError}</p>}
					</div>
				</div>
			)}
		</div>
	);
}
