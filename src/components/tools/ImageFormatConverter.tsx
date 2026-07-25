import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Messages {
	selectFiles: string;
	dropHint: string;
	targetFormat: string;
	quality: string;
	convert: string;
	converting: string;
	download: string;
	original: string;
	converted: string;
	noFiles: string;
	errorGeneric: string;
	errorAvifUnsupported: string;
	formatsNote: string;
	remove: string;
	clearAll: string;
	skippedFiles: string;
}

type TargetFormat =
	| 'image/png'
	| 'image/jpeg'
	| 'image/webp'
	| 'image/avif'
	| 'image/bmp'
	| 'image/x-icon'
	| 'image/gif';

const EXTENSION_BY_FORMAT: Record<TargetFormat, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/bmp': 'bmp',
	'image/x-icon': 'ico',
	'image/gif': 'gif',
};

const LOSSY_FORMATS = new Set<TargetFormat>(['image/jpeg', 'image/webp', 'image/avif']);
const WHITE_BACKGROUND_FORMATS = new Set<TargetFormat>(['image/jpeg', 'image/bmp']);
const ICO_MAX_DIMENSION = 256;

interface ImageItem {
	id: string;
	file: File;
	status: 'pending' | 'processing' | 'done' | 'error';
	resultBlob?: Blob;
	errorMessage?: string;
}

class AvifUnsupportedError extends Error {}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isHeic(file: File): boolean {
	const name = file.name.toLowerCase();
	return (
		file.type === 'image/heic' ||
		file.type === 'image/heif' ||
		name.endsWith('.heic') ||
		name.endsWith('.heif')
	);
}

// HEIC/HEIF (the default photo format on iPhones) can't be decoded by
// createImageBitmap in any mainstream browser, so it's pre-converted to PNG
// with heic2any before entering the normal canvas pipeline below. Loaded via
// dynamic import (not a top-level import) so its WASM decoder is only ever
// fetched in the browser, never touched during Astro's build-time SSR pass.
async function toDecodableBlob(file: File): Promise<Blob> {
	if (!isHeic(file)) return file;
	const { default: heic2any } = await import('heic2any');
	const result = await heic2any({ blob: file, toType: 'image/png' });
	return Array.isArray(result) ? result[0] : result;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
			type,
			quality,
		);
	});
}

// BMP has no native canvas.toBlob support in any browser, but the uncompressed
// 24-bit format is simple enough to write by hand from raw pixel data.
function encodeBmp(imageData: ImageData): Blob {
	const { width, height, data } = imageData;
	const rowBytes = width * 3;
	const rowPadding = (4 - (rowBytes % 4)) % 4;
	const rowSize = rowBytes + rowPadding;
	const pixelArraySize = rowSize * height;
	const fileSize = 54 + pixelArraySize;
	const buffer = new ArrayBuffer(fileSize);
	const view = new DataView(buffer);

	view.setUint8(0, 0x42);
	view.setUint8(1, 0x4d);
	view.setUint32(2, fileSize, true);
	view.setUint32(6, 0, true);
	view.setUint32(10, 54, true);

	view.setUint32(14, 40, true);
	view.setInt32(18, width, true);
	view.setInt32(22, height, true);
	view.setUint16(26, 1, true);
	view.setUint16(28, 24, true);
	view.setUint32(30, 0, true);
	view.setUint32(34, pixelArraySize, true);
	view.setInt32(38, 2835, true);
	view.setInt32(42, 2835, true);
	view.setUint32(46, 0, true);
	view.setUint32(50, 0, true);

	let offset = 54;
	for (let y = height - 1; y >= 0; y--) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			view.setUint8(offset++, data[i + 2]);
			view.setUint8(offset++, data[i + 1]);
			view.setUint8(offset++, data[i]);
		}
		for (let p = 0; p < rowPadding; p++) view.setUint8(offset++, 0);
	}

	return new Blob([buffer], { type: 'image/bmp' });
}

// ICO has no native canvas.toBlob support either, but since Windows Vista an
// ICO container can simply embed a full PNG image after a tiny 22-byte
// header, so no pixel-level re-encoding is needed here.
async function encodeIco(canvas: HTMLCanvasElement): Promise<Blob> {
	const pngBlob = await canvasToBlob(canvas, 'image/png');
	const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

	const header = new ArrayBuffer(22);
	const view = new DataView(header);
	view.setUint16(0, 0, true);
	view.setUint16(2, 1, true);
	view.setUint16(4, 1, true);
	view.setUint8(6, canvas.width >= 256 ? 0 : canvas.width);
	view.setUint8(7, canvas.height >= 256 ? 0 : canvas.height);
	view.setUint8(8, 0);
	view.setUint8(9, 0);
	view.setUint16(10, 1, true);
	view.setUint16(12, 32, true);
	view.setUint32(14, pngBytes.byteLength, true);
	view.setUint32(18, 22, true);

	return new Blob([header, pngBytes], { type: 'image/x-icon' });
}

// No browser encodes GIF via canvas.toBlob, so a small pure-JS encoder
// (gifenc) handles palette quantization + LZW compression. Dynamic import
// keeps it out of the main bundle until a user actually picks GIF.
async function encodeGif(imageData: ImageData): Promise<Blob> {
	const { quantize, applyPalette, GIFEncoder } = await import('gifenc');
	const palette = quantize(imageData.data, 256);
	const index = applyPalette(imageData.data, palette);
	const gif = GIFEncoder();
	gif.writeFrame(index, imageData.width, imageData.height, { palette });
	gif.finish();
	return new Blob([gif.bytes()], { type: 'image/gif' });
}

async function convertImage(file: File, targetFormat: TargetFormat, quality: number): Promise<Blob> {
	const decodableBlob = await toDecodableBlob(file);
	const bitmap = await createImageBitmap(decodableBlob);

	let { width, height } = bitmap;
	if (targetFormat === 'image/x-icon' && (width > ICO_MAX_DIMENSION || height > ICO_MAX_DIMENSION)) {
		const scale = ICO_MAX_DIMENSION / Math.max(width, height);
		width = Math.round(width * scale);
		height = Math.round(height * scale);
	}

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');

	if (WHITE_BACKGROUND_FORMATS.has(targetFormat)) {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	switch (targetFormat) {
		case 'image/png':
		case 'image/jpeg':
		case 'image/webp':
			return canvasToBlob(canvas, targetFormat, targetFormat === 'image/png' ? undefined : quality);
		case 'image/avif': {
			const blob = await canvasToBlob(canvas, 'image/avif', quality);
			if (blob.type !== 'image/avif') throw new AvifUnsupportedError();
			return blob;
		}
		case 'image/bmp':
			return encodeBmp(ctx.getImageData(0, 0, canvas.width, canvas.height));
		case 'image/x-icon':
			return encodeIco(canvas);
		case 'image/gif':
			return encodeGif(ctx.getImageData(0, 0, canvas.width, canvas.height));
	}
}

function replaceExtension(fileName: string, targetFormat: TargetFormat): string {
	return `${fileName.replace(/\.[^./\\]+$/, '')}.${EXTENSION_BY_FORMAT[targetFormat]}`;
}

export default function ImageFormatConverter({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [targetFormat, setTargetFormat] = useState<TargetFormat>('image/webp');
	const [quality, setQuality] = useState(0.8);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [skippedCount, setSkippedCount] = useState(0);

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const allFiles = Array.from(fileList);
		const acceptedFiles = allFiles.filter((file) => file.type.startsWith('image/') || isHeic(file));
		setSkippedCount(allFiles.length - acceptedFiles.length);
		const newItems: ImageItem[] = acceptedFiles.map((file) => ({
			id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
			file,
			status: 'pending' as const,
		}));
		setItems((prev) => [...prev, ...newItems]);
	}, []);

	const handleRemove = useCallback((id: string) => {
		setItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const handleClearAll = useCallback(() => {
		setItems([]);
		setSkippedCount(0);
	}, []);

	const handleConvert = useCallback(async () => {
		setIsProcessing(true);
		for (const item of items) {
			setItems((prev) =>
				prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it)),
			);
			try {
				const resultBlob = await convertImage(item.file, targetFormat, quality);
				setItems((prev) =>
					prev.map((it) => (it.id === item.id ? { ...it, status: 'done', resultBlob } : it)),
				);
			} catch (err) {
				const errorMessage =
					err instanceof AvifUnsupportedError ? messages.errorAvifUnsupported : messages.errorGeneric;
				setItems((prev) =>
					prev.map((it) => (it.id === item.id ? { ...it, status: 'error', errorMessage } : it)),
				);
			}
		}
		setIsProcessing(false);
	}, [items, targetFormat, quality, messages.errorAvifUnsupported, messages.errorGeneric]);

	const handleDownload = useCallback(
		(item: ImageItem) => {
			if (!item.resultBlob) return;
			const url = URL.createObjectURL(item.resultBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = replaceExtension(item.file.name, targetFormat);
			link.click();
			URL.revokeObjectURL(url);
		},
		[targetFormat],
	);

	const canConvert = !isProcessing && items.length > 0;

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<div
				className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed p-4 transition-colors ${
					isDragOver ? 'border-primary bg-primary/5' : 'border-border'
				}`}
				onDragOver={(event) => {
					event.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(event) => {
					event.preventDefault();
					setIsDragOver(false);
					handleFiles(event.dataTransfer.files);
				}}
			>
				<label
					htmlFor="image-converter-input"
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{messages.selectFiles}
				</label>
				<input
					id="image-converter-input"
					type="file"
					accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.heic,.heif"
					multiple
					className="hidden"
					onChange={(event) => handleFiles(event.target.files)}
				/>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			{skippedCount > 0 && (
				<p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{messages.skippedFiles.replace('{{count}}', String(skippedCount))}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<label htmlFor="image-converter-format" className="shrink-0 text-sm text-foreground">
					{messages.targetFormat}
				</label>
				<select
					id="image-converter-format"
					value={targetFormat}
					onChange={(event) => setTargetFormat(event.target.value as TargetFormat)}
					className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
				>
					<option value="image/webp">WebP</option>
					<option value="image/jpeg">JPEG</option>
					<option value="image/png">PNG</option>
					<option value="image/avif">AVIF</option>
					<option value="image/gif">GIF</option>
					<option value="image/bmp">BMP</option>
					<option value="image/x-icon">ICO</option>
				</select>

				{LOSSY_FORMATS.has(targetFormat) && (
					<>
						<label htmlFor="image-converter-quality" className="shrink-0 text-sm text-foreground">
							{messages.quality}: {Math.round(quality * 100)}%
						</label>
						<input
							id="image-converter-quality"
							type="range"
							min={0.1}
							max={1}
							step={0.05}
							value={quality}
							onChange={(event) => setQuality(Number(event.target.value))}
							className="w-48"
						/>
					</>
				)}
			</div>

			<p className="text-xs text-muted-foreground">{messages.formatsNote}</p>

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-2">
					{items.map((item) => (
						<li
							key={item.id}
							className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
						>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate text-foreground">{item.file.name}</span>
								<span className="text-muted-foreground">
									{messages.original}: {formatBytes(item.file.size)} ({item.file.type || '—'})
									{item.status === 'done' && item.resultBlob && (
										<>
											{' '}
											→ {messages.converted}: {formatBytes(item.resultBlob.size)} ({targetFormat})
										</>
									)}
									{item.status === 'error' && (
										<span className="text-destructive"> {item.errorMessage ?? messages.errorGeneric}</span>
									)}
								</span>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{item.status === 'done' && item.resultBlob && (
									<Button type="button" size="sm" onClick={() => handleDownload(item)}>
										{messages.download}
									</Button>
								)}
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => handleRemove(item.id)}
									disabled={item.status === 'processing'}
									aria-label={messages.remove}
								>
									✕
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button type="button" onClick={handleConvert} disabled={!canConvert}>
					{isProcessing ? messages.converting : messages.convert}
				</Button>
				{items.length > 0 && (
					<Button type="button" variant="outline" onClick={handleClearAll} disabled={isProcessing}>
						{messages.clearAll}
					</Button>
				)}
			</div>
		</div>
	);
}
