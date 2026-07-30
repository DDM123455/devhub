import { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';

interface Messages {
	selectFiles: string;
	dropHint: string;
	quality: string;
	compress: string;
	compressing: string;
	download: string;
	downloadAll: string;
	original: string;
	compressed: string;
	reduced: string;
	noFiles: string;
	errorGeneric: string;
	remove: string;
	clearAll: string;
	skippedFiles: string;
	resizeToggleLabel: string;
	maxDimensionLabel: string;
	retry: string;
}

interface ImageItem {
	id: string;
	file: File;
	previewUrl: string;
	status: 'pending' | 'processing' | 'done' | 'error';
	compressedBlob?: Blob;
	compressedPreviewUrl?: string;
	compressedSize?: number;
}

// Each compression spins up its own `browser-image-compression` Web Worker —
// running all of them at once for a large batch would spawn dozens of workers
// simultaneously and spike memory, so only this many run concurrently.
const CONCURRENCY = 3;
const MIN_MAX_DIMENSION = 320;
const MAX_MAX_DIMENSION = 4096;
const DEFAULT_MAX_DIMENSION = 1920;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ImageCompressor({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [quality, setQuality] = useState(0.8);
	const [resizeEnabled, setResizeEnabled] = useState(false);
	const [maxDimension, setMaxDimension] = useState(DEFAULT_MAX_DIMENSION);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isZipping, setIsZipping] = useState(false);
	const [skippedCount, setSkippedCount] = useState(0);
	const objectUrls = useRef<Set<string>>(new Set());

	// Every object URL created for a preview (original or compressed) is tracked
	// here and revoked on unmount, since nothing else in this component's
	// lifecycle naturally triggers a revoke for images the user never removes.
	useEffect(() => {
		return () => {
			for (const url of objectUrls.current) URL.revokeObjectURL(url);
		};
	}, []);

	const trackUrl = (url: string) => {
		objectUrls.current.add(url);
		return url;
	};

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const allFiles = Array.from(fileList);
		const imageFiles = allFiles.filter((file) => file.type.startsWith('image/'));
		setSkippedCount(allFiles.length - imageFiles.length);
		const newItems: ImageItem[] = imageFiles.map((file) => ({
			id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
			file,
			previewUrl: trackUrl(URL.createObjectURL(file)),
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

	const compressOne = useCallback(
		async (item: ImageItem) => {
			setItems((prev) =>
				prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it)),
			);
			try {
				if (item.compressedPreviewUrl) {
					URL.revokeObjectURL(item.compressedPreviewUrl);
					objectUrls.current.delete(item.compressedPreviewUrl);
				}
				const compressedBlob = await imageCompression(item.file, {
					maxSizeMB: 10,
					useWebWorker: true,
					initialQuality: quality,
					maxWidthOrHeight: resizeEnabled ? maxDimension : undefined,
				});
				setItems((prev) =>
					prev.map((it) =>
						it.id === item.id
							? {
									...it,
									status: 'done',
									compressedBlob,
									compressedPreviewUrl: trackUrl(URL.createObjectURL(compressedBlob)),
									compressedSize: compressedBlob.size,
								}
							: it,
					),
				);
			} catch {
				setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
			}
		},
		[quality, resizeEnabled, maxDimension],
	);

	const handleCompress = useCallback(async () => {
		setIsProcessing(true);
		// Worker-pool pattern: a fixed number of "lanes" each pull the next
		// pending item off the shared queue as soon as they finish their
		// current one, instead of waiting for the whole batch to finish
		// before starting the next `CONCURRENCY` items.
		let cursor = 0;
		const runLane = async (): Promise<void> => {
			const index = cursor++;
			if (index >= items.length) return;
			await compressOne(items[index]);
			return runLane();
		};
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, runLane));
		setIsProcessing(false);
	}, [items, compressOne]);

	const handleDownload = useCallback((item: ImageItem) => {
		if (!item.compressedBlob) return;
		const url = URL.createObjectURL(item.compressedBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `compressed-${item.file.name}`;
		link.click();
		URL.revokeObjectURL(url);
	}, []);

	const handleDownloadAll = useCallback(async () => {
		const doneItems = items.filter((item) => item.status === 'done' && item.compressedBlob);
		if (doneItems.length === 0) return;
		setIsZipping(true);
		try {
			const zip = new JSZip();
			for (const item of doneItems) {
				zip.file(`compressed-${item.file.name}`, item.compressedBlob!);
			}
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'compressed-images.zip';
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			setIsZipping(false);
		}
	}, [items]);

	const canCompress = !isProcessing && items.length > 0;
	const doneCount = items.filter((item) => item.status === 'done').length;

	const [isDragOver, setIsDragOver] = useState(false);

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
					htmlFor="image-compressor-input"
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{messages.selectFiles}
				</label>
				<input
					id="image-compressor-input"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					multiple
					className="hidden"
					onChange={(event) => handleFiles(event.target.files)}
				/>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			{skippedCount > 0 && (
				<p role="status" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{messages.skippedFiles.replace('{{count}}', String(skippedCount))}
				</p>
			)}

			<div className="flex items-center gap-3">
				<label htmlFor="image-compressor-quality" className="shrink-0 text-sm text-foreground">
					{messages.quality}: {Math.round(quality * 100)}%
				</label>
				<input
					id="image-compressor-quality"
					type="range"
					min={0.1}
					max={1}
					step={0.05}
					value={quality}
					onChange={(event) => setQuality(Number(event.target.value))}
					className="w-48"
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label className="flex items-center gap-1.5 text-sm text-foreground">
					<input
						type="checkbox"
						checked={resizeEnabled}
						onChange={(event) => setResizeEnabled(event.target.checked)}
					/>
					{messages.resizeToggleLabel}
				</label>
				{resizeEnabled && (
					<div className="flex items-center gap-3">
						<label htmlFor="image-compressor-max-dimension" className="shrink-0 text-sm text-foreground">
							{messages.maxDimensionLabel.replace('{{size}}', String(maxDimension))}
						</label>
						<input
							id="image-compressor-max-dimension"
							type="range"
							min={MIN_MAX_DIMENSION}
							max={MAX_MAX_DIMENSION}
							step={32}
							value={maxDimension}
							onChange={(event) => setMaxDimension(Number(event.target.value))}
							className="w-48"
						/>
					</div>
				)}
			</div>

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-3">
					{items.map((item) => (
						<li key={item.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
							<div className="flex flex-wrap items-center gap-3">
								<div className="flex items-center gap-1.5">
									<img
										src={item.previewUrl}
										alt={`${item.file.name} — ${messages.original}`}
										className="size-16 rounded-md border border-border object-cover"
									/>
									{item.status === 'done' && item.compressedPreviewUrl && (
										<>
											<span aria-hidden="true" className="text-muted-foreground">
												→
											</span>
											<img
												src={item.compressedPreviewUrl}
												alt={`${item.file.name} — ${messages.compressed}`}
												className="size-16 rounded-md border border-border object-cover"
											/>
										</>
									)}
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-foreground">{item.file.name}</span>
									<span className="text-muted-foreground">
										{messages.original}: {formatBytes(item.file.size)}
										{item.status === 'done' && item.compressedSize != null && (
											<>
												{' '}
												→ {messages.compressed}: {formatBytes(item.compressedSize)} (
												{messages.reduced.replace(
													'{{percent}}',
													String(Math.round((1 - item.compressedSize / item.file.size) * 100)),
												)}
												)
											</>
										)}
										{item.status === 'error' && (
											<span role="alert" className="text-destructive"> {messages.errorGeneric}</span>
										)}
									</span>
								</div>
								{item.status === 'done' && item.compressedBlob && (
									<Button type="button" size="sm" onClick={() => handleDownload(item)}>
										{messages.download}
									</Button>
								)}
								{item.status === 'error' && (
									<Button type="button" size="sm" variant="outline" onClick={() => void compressOne(item)}>
										{messages.retry}
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
				<Button type="button" onClick={handleCompress} disabled={!canCompress}>
					{isProcessing ? messages.compressing : messages.compress}
				</Button>
				{doneCount > 1 && (
					<Button type="button" variant="secondary" onClick={handleDownloadAll} disabled={isZipping}>
						{messages.downloadAll}
					</Button>
				)}
				{items.length > 0 && (
					<Button
						type="button"
						variant="outline"
						onClick={handleClearAll}
						disabled={isProcessing}
					>
						{messages.clearAll}
					</Button>
				)}
			</div>
		</div>
	);
}
