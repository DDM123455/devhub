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
}

type TargetFormat = 'image/png' | 'image/jpeg' | 'image/webp';

const EXTENSION_BY_FORMAT: Record<TargetFormat, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
};

interface ImageItem {
	id: string;
	file: File;
	status: 'pending' | 'processing' | 'done' | 'error';
	resultBlob?: Blob;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function convertImage(file: File, targetFormat: TargetFormat, quality: number): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');

	if (targetFormat === 'image/jpeg') {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error('canvas.toBlob returned null'));
			},
			targetFormat,
			targetFormat === 'image/png' ? undefined : quality,
		);
	});
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

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const newItems: ImageItem[] = Array.from(fileList)
			.filter((file) => file.type.startsWith('image/'))
			.map((file) => ({
				id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
				file,
				status: 'pending' as const,
			}));
		setItems((prev) => [...prev, ...newItems]);
	}, []);

	const handleConvert = useCallback(async () => {
		setIsProcessing(true);
		for (const item of items) {
			if (item.status === 'done') continue;
			setItems((prev) =>
				prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it)),
			);
			try {
				const resultBlob = await convertImage(item.file, targetFormat, quality);
				setItems((prev) =>
					prev.map((it) => (it.id === item.id ? { ...it, status: 'done', resultBlob } : it)),
				);
			} catch {
				setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
			}
		}
		setIsProcessing(false);
	}, [items, targetFormat, quality]);

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

	const canConvert =
		!isProcessing && items.length > 0 && items.some((item) => item.status !== 'done');

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
					accept="image/jpeg,image/png,image/webp"
					multiple
					className="hidden"
					onChange={(event) => handleFiles(event.target.files)}
				/>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

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
				</select>

				{targetFormat !== 'image/png' && (
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

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-2">
					{items.map((item) => (
						<li
							key={item.id}
							className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
						>
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
									<span className="text-destructive"> {messages.errorGeneric}</span>
								)}
							</span>
							{item.status === 'done' && item.resultBlob && (
								<Button type="button" size="sm" onClick={() => handleDownload(item)}>
									{messages.download}
								</Button>
							)}
						</li>
					))}
				</ul>
			)}

			<div>
				<Button type="button" onClick={handleConvert} disabled={!canConvert}>
					{isProcessing ? messages.converting : messages.convert}
				</Button>
			</div>
		</div>
	);
}
