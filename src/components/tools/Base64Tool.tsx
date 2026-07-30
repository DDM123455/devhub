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
	decodeEncodingLabel: string;
	remove: string;
	clearAll: string;
}

type Mode = 'encode' | 'decode';
type Tab = 'text' | 'file';

const EXTENSION_BY_MIME: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/svg+xml': 'svg',
	'image/bmp': 'bmp',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
	'image/avif': 'avif',
	'image/heic': 'heic',
	'image/tiff': 'tiff',
	'application/pdf': 'pdf',
	'text/plain': 'txt',
	'application/json': 'json',
	'application/zip': 'zip',
	'application/x-rar-compressed': 'rar',
	'application/vnd.rar': 'rar',
	'application/x-7z-compressed': '7z',
	'application/gzip': 'gz',
	'application/x-tar': 'tar',
	'audio/mpeg': 'mp3',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/ogg': 'ogg',
	'audio/webm': 'weba',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'font/woff': 'woff',
	'font/woff2': 'woff2',
	'font/ttf': 'ttf',
	'font/otf': 'otf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'text/csv': 'csv',
	'text/html': 'html',
	'text/css': 'css',
	'text/javascript': 'js',
	'application/xml': 'xml',
	'text/markdown': 'md',
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

// `TextEncoder` (used for the encode direction) is UTF-8-only per the Web
// platform spec — there's no browser API to encode into legacy encodings
// client-side, so only the decode direction offers a choice of encodings.
const TEXT_DECODE_ENCODINGS = [
	'utf-8',
	'utf-16le',
	'utf-16be',
	'iso-8859-1',
	'windows-1252',
	'shift_jis',
	'euc-kr',
	'gbk',
	'big5',
	'koi8-r',
] as const;
type TextDecodeEncoding = (typeof TEXT_DECODE_ENCODINGS)[number];

function decodeText(input: string, encoding: TextDecodeEncoding): string {
	const cleaned = input.trim().replace(/\s+/g, '');
	const base64 = fromUrlSafeOrStandard(cleaned);
	const bytes = base64ToBytes(base64);
	return new TextDecoder(encoding, { fatal: true }).decode(bytes);
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
	const [decodeEncoding, setDecodeEncoding] = useState<TextDecodeEncoding>('utf-8');

	const { textOutput, textError } = useMemo(() => {
		if (textInput === '') return { textOutput: '', textError: null as string | null };
		try {
			return {
				textOutput:
					mode === 'encode' ? encodeText(textInput, urlSafe, lineWrap) : decodeText(textInput, decodeEncoding),
				textError: null as string | null,
			};
		} catch {
			return { textOutput: '', textError: mode === 'decode' ? messages.decodeError : null };
		}
	}, [textInput, mode, urlSafe, lineWrap, decodeEncoding, messages.decodeError]);

	const handleSwap = () => {
		setMode((m) => (m === 'encode' ? 'decode' : 'encode'));
		setTextInput(textOutput);
	};

	// File encode state — a list so multiple files can be dropped/selected at
	// once (each read independently; order they finish reading in doesn't
	// matter since each item carries its own id).
	interface EncodedFileItem {
		id: string;
		name: string;
		mime: string;
		base64: string;
		dataUri: string;
	}
	const [encodedFiles, setEncodedFiles] = useState<EncodedFileItem[]>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileEncode = (files: FileList | null) => {
		if (!files) return;
		for (const file of Array.from(files)) {
			const reader = new FileReader();
			reader.onload = () => {
				const dataUri = reader.result as string;
				const parsed = extractDataUri(dataUri);
				const item: EncodedFileItem = {
					id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
					name: file.name,
					mime: file.type || parsed?.mime || 'application/octet-stream',
					base64: parsed?.base64 ?? '',
					dataUri,
				};
				setEncodedFiles((prev) => [...prev, item]);
			};
			reader.readAsDataURL(file);
		}
	};

	const handleRemoveEncoded = (id: string) => {
		setEncodedFiles((prev) => prev.filter((item) => item.id !== id));
	};

	const handleClearEncoded = () => setEncodedFiles([]);

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
						{mode === 'decode' && (
							<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
								{messages.decodeEncodingLabel}
								<select
									value={decodeEncoding}
									onChange={(e) => setDecodeEncoding(e.target.value as TextDecodeEncoding)}
									className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
								>
									{TEXT_DECODE_ENCODINGS.map((enc) => (
										<option key={enc} value={enc}>
											{enc}
										</option>
									))}
								</select>
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
								multiple
								className="hidden"
								onChange={(e) => handleFileEncode(e.target.files)}
							/>
						</div>

						{encodedFiles.length > 0 && (
							<div className="flex flex-col gap-4">
								{encodedFiles.length > 1 && (
									<div>
										<Button type="button" size="sm" variant="ghost" onClick={handleClearEncoded}>
											{messages.clearAll}
										</Button>
									</div>
								)}
								{encodedFiles.map((item) => (
									<div key={item.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate text-sm font-medium text-foreground">{item.name}</span>
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => handleRemoveEncoded(item.id)}
												aria-label={messages.remove}
											>
												✕
											</Button>
										</div>
										{item.mime.startsWith('image/') && (
											<div className="flex flex-col gap-1">
												<span className="text-xs text-muted-foreground">{messages.imagePreviewLabel}</span>
												<img src={item.dataUri} alt={item.name} className="max-h-48 max-w-full rounded-md border border-border object-contain" />
											</div>
										)}
										<div className="flex flex-col gap-1">
											<div className="flex items-center justify-between">
												<span className="text-xs text-muted-foreground">{messages.fileBase64Label}</span>
												<CopyButton value={item.base64} label={messages.copy} copiedLabel={messages.copied} />
											</div>
											<textarea
												readOnly
												value={item.base64}
												rows={4}
												className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs break-all text-foreground"
											/>
										</div>
										<div className="flex flex-col gap-1">
											<div className="flex items-center justify-between">
												<span className="text-xs text-muted-foreground">{messages.fileDataUriLabel}</span>
												<CopyButton value={item.dataUri} label={messages.copy} copiedLabel={messages.copied} />
											</div>
											<textarea
												readOnly
												value={item.dataUri}
												rows={4}
												className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs break-all text-foreground"
											/>
										</div>
									</div>
								))}
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
