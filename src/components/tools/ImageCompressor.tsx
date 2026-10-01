import { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BeforeAfterSlider } from '@/components/ui/before-after-slider';
import { EmptyState } from '@/components/ui/empty-state';
import { ImageOff } from 'lucide-react';
import { baseNameOf, computeReduction, dedupeName } from '@/lib/file-utils';

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
	notReduced: string;
	noFiles: string;
	errorGeneric: string;
	remove: string;
	clearAll: string;
	skippedFiles: string;
	resizeToggleLabel: string;
	maxDimensionLabel: string;
	retry: string;
	compressModeQuality: string;
	compressModeTargetSize: string;
	targetSizeLabel: string;
	targetFormatLabel: string;
	targetFormatOriginal: string;
	errorAvifUnsupported: string;
	processingQueue: string;
	progressPercent: string;
}

interface ImageItem {
	id: string;
	file: File;
	previewUrl: string;
	status: 'pending' | 'processing' | 'done' | 'error';
	// Real 0-100 value from browser-image-compression's onProgress callback —
	// only meaningful while status === 'processing'.
	progress?: number;
	// Set right before actually splicing the item out of `items`, so its exit
	// animation (see REMOVE_ANIMATION_MS) has a state to key off — removing it
	// from the array immediately would unmount the <li> with no chance to animate.
	removing?: boolean;
	compressedBlob?: Blob;
	compressedPreviewUrl?: string;
	compressedSize?: number;
	// Tên file tải về, chốt lúc nén xong (không phụ thuộc cài đặt format hiện tại).
	downloadName?: string;
	// Drag position (0-100) of the before/after compare slider — only set once
	// a compressed result exists to compare against.
	comparePosition?: number;
	errorMessage?: string;
}

// Each compression spins up its own `browser-image-compression` Web Worker —
// running all of them at once for a large batch would spawn dozens of workers
// simultaneously and spike memory, so only this many run concurrently.
const CONCURRENCY = 3;
// Must match the `duration-150` used on the exit-animation class below —
// the item is only spliced out of state once its fade/shrink-out has had
// time to actually play.
const REMOVE_ANIMATION_MS = 150;
const MIN_MAX_DIMENSION = 320;
const MAX_MAX_DIMENSION = 4096;
const DEFAULT_MAX_DIMENSION = 1920;
const MIN_TARGET_SIZE_KB = 10;
const MAX_TARGET_SIZE_KB = 10000;
const DEFAULT_TARGET_SIZE_KB = 200;
type CompressMode = 'quality' | 'targetSize';
type TargetFormat = 'original' | 'image/jpeg' | 'image/webp' | 'image/avif' | 'image/png';

const EXTENSION_BY_FORMAT: Record<Exclude<TargetFormat, 'original'>, string> = {
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/png': 'png',
};

class AvifUnsupportedError extends Error {}

// Chỉ nhận đúng các định dạng mà input[accept] quảng cáo (kéo-thả không được lọt GIF/SVG/BMP...).
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface CompressSettings {
	compressMode: CompressMode;
	quality: number;
	targetSizeKb: number;
	resizeEnabled: boolean;
	maxDimension: number;
	targetFormat: TargetFormat;
}

function buildDownloadName(file: File, targetFormat: TargetFormat): string {
	if (targetFormat === 'original') return 'compressed-' + file.name;
	return 'compressed-' + baseNameOf(file.name, 'image') + '.' + EXTENSION_BY_FORMAT[targetFormat];
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ImageCompressor({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [quality, setQuality] = useState(0.8);
	const [compressMode, setCompressMode] = useState<CompressMode>('quality');
	const [targetSizeKb, setTargetSizeKb] = useState(DEFAULT_TARGET_SIZE_KB);
	const [resizeEnabled, setResizeEnabled] = useState(false);
	const [maxDimension, setMaxDimension] = useState(DEFAULT_MAX_DIMENSION);
	const [targetFormat, setTargetFormat] = useState<TargetFormat>('original');
	const [isProcessing, setIsProcessing] = useState(false);
	const [isZipping, setIsZipping] = useState(false);
	const [skippedCount, setSkippedCount] = useState(0);
	const objectUrls = useRef<Set<string>>(new Set());
	const itemsRef = useRef<ImageItem[]>([]);
	itemsRef.current = items;

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

	const revokeItemUrls = (item: ImageItem) => {
		for (const url of [item.previewUrl, item.compressedPreviewUrl]) {
			if (!url) continue;
			URL.revokeObjectURL(url);
			objectUrls.current.delete(url);
		}
	};

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const allFiles = Array.from(fileList);
		const imageFiles = allFiles.filter((file) => ACCEPTED_TYPES.has(file.type));
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
		setItems((prev) => prev.map((item) => (item.id === id ? { ...item, removing: true } : item)));
		setTimeout(() => {
			const removed = itemsRef.current.find((item) => item.id === id);
			if (removed) revokeItemUrls(removed);
			setItems((prev) => prev.filter((item) => item.id !== id));
		}, REMOVE_ANIMATION_MS);
	}, []);

	const handleClearAll = useCallback(() => {
		for (const item of itemsRef.current) revokeItemUrls(item);
		setItems([]);
		setSkippedCount(0);
	}, []);

	const settingsRef = useRef<CompressSettings>({
		compressMode,
		quality,
		targetSizeKb,
		resizeEnabled,
		maxDimension,
		targetFormat,
	});
	settingsRef.current = { compressMode, quality, targetSizeKb, resizeEnabled, maxDimension, targetFormat };

	const compressOne = useCallback(
		async (item: ImageItem, settings: CompressSettings) => {
			const { compressMode, quality, targetSizeKb, resizeEnabled, maxDimension, targetFormat } = settings;
			setItems((prev) =>
				prev.map((it) => (it.id === item.id ? { ...it, status: 'processing', progress: 0 } : it)),
			);
			try {
				if (item.compressedPreviewUrl) {
					URL.revokeObjectURL(item.compressedPreviewUrl);
					objectUrls.current.delete(item.compressedPreviewUrl);
				}
				const compressedBlob = await imageCompression(item.file, {
					// In target-size mode, the library's own iterative
					// quality-reduction loop drives the result down to
					// `maxSizeMB` instead of a fixed quality — no separate
					// "compress to X KB" algorithm needed, this option already
					// does exactly that.
					maxSizeMB: compressMode === 'targetSize' ? Math.max(targetSizeKb / 1024, 0.01) : 10,
					useWebWorker: true,
					initialQuality: compressMode === 'quality' ? quality : undefined,
					maxWidthOrHeight: resizeEnabled ? maxDimension : undefined,
					fileType: targetFormat === 'original' ? undefined : targetFormat,
					onProgress: (progress) => {
						setItems((prev) =>
							prev.map((it) => (it.id === item.id ? { ...it, progress } : it)),
						);
					},
				});
				// The library falls back silently (rather than rejecting) when the
				// browser's canvas.toBlob can't actually produce the requested
				// `fileType` — checking the result's own MIME type is the only way
				// to tell a forced-format conversion actually happened, same
				// AVIF-support detection already used in Image Format Converter.
				if (targetFormat === 'image/avif' && compressedBlob.type !== 'image/avif') {
					throw new AvifUnsupportedError();
				}
				setItems((prev) =>
					prev.map((it) =>
						it.id === item.id
							? {
									...it,
									status: 'done',
									compressedBlob,
									compressedPreviewUrl: trackUrl(URL.createObjectURL(compressedBlob)),
									compressedSize: compressedBlob.size,
									downloadName: buildDownloadName(item.file, targetFormat),
									comparePosition: 50,
								}
							: it,
					),
				);
			} catch (err) {
				const errorMessage = err instanceof AvifUnsupportedError ? messages.errorAvifUnsupported : messages.errorGeneric;
				setItems((prev) =>
					prev.map((it) => (it.id === item.id ? { ...it, status: 'error', errorMessage } : it)),
				);
			}
		},
		[messages.errorAvifUnsupported, messages.errorGeneric],
	);

	// Chạy một hàng đợi item với đúng bộ cài đặt tại thời điểm bấm (snapshot), không bị ảnh hưởng nếu
	// người dùng đổi setting trong lúc đang nén.
	const runQueue = useCallback(
		async (queue: ImageItem[]) => {
			if (queue.length === 0) return;
			const settings = settingsRef.current;
			setIsProcessing(true);
			try {
				// Worker-pool pattern: a fixed number of "lanes" each pull the next
				// pending item off the shared queue as soon as they finish their
				// current one, instead of waiting for the whole batch to finish
				// before starting the next `CONCURRENCY` items.
				let cursor = 0;
				const runLane = async (): Promise<void> => {
					const index = cursor++;
					if (index >= queue.length) return;
					await compressOne(queue[index], settings);
					return runLane();
				};
				await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, runLane));
			} finally {
				setIsProcessing(false);
			}
		},
		[compressOne],
	);

	const handleCompress = useCallback(async () => {
		// Chỉ nén item đang chờ hoặc lỗi; item đã xong giữ nguyên kết quả.
		await runQueue(items.filter((item) => (item.status === 'pending' || item.status === 'error') && !item.removing));
	}, [items, runQueue]);

	const handleDownload = useCallback(
		(item: ImageItem) => {
			if (!item.compressedBlob) return;
			const url = URL.createObjectURL(item.compressedBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = item.downloadName ?? buildDownloadName(item.file, 'original');
			link.click();
			URL.revokeObjectURL(url);
		},
		[],
	);

	const handleDownloadAll = useCallback(async () => {
		const doneItems = items.filter((item) => item.status === 'done' && item.compressedBlob);
		if (doneItems.length === 0) return;
		setIsZipping(true);
		try {
			const zip = new JSZip();
			const usedNames = new Set<string>();
			for (const item of doneItems) {
				const name = dedupeName(item.downloadName ?? buildDownloadName(item.file, 'original'), usedNames);
				zip.file(name, item.compressedBlob!);
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

	// A previously compressed/failed result no longer reflects the current
	// settings once mode/quality/target size/resize/format change — leaving it
	// displayed as "done" reads as though the new settings were already applied
	// (reported bug: switching "By quality" -> "By target size" kept showing
	// the old quality-mode result untouched). Reverting those items to
	// 'pending' makes the UI honestly show nothing has been compressed with
	// the current settings yet, instead of a stale result.
	const settingsSignature = `${compressMode}|${quality}|${targetSizeKb}|${resizeEnabled}|${maxDimension}|${targetFormat}`;
	const prevSettingsSignature = useRef(settingsSignature);
	useEffect(() => {
		if (prevSettingsSignature.current === settingsSignature) return;
		prevSettingsSignature.current = settingsSignature;
		setItems((prev) =>
			prev.map((item) => {
				if (item.status !== 'done' && item.status !== 'error') return item;
				if (item.compressedPreviewUrl) {
					URL.revokeObjectURL(item.compressedPreviewUrl);
					objectUrls.current.delete(item.compressedPreviewUrl);
				}
				return {
					...item,
					status: 'pending',
					compressedBlob: undefined,
					compressedPreviewUrl: undefined,
					compressedSize: undefined,
					comparePosition: undefined,
					errorMessage: undefined,
				};
			}),
		);
	}, [settingsSignature]);

	const canCompress =
		!isProcessing && items.some((item) => (item.status === 'pending' || item.status === 'error') && !item.removing);
	const doneCount = items.filter((item) => item.status === 'done').length;
	// Aggregate progress across the whole batch: finished/errored items count as
	// a full 100 units, an in-flight item contributes its own real 0-100 value —
	// so the overall bar advances continuously as CONCURRENCY lanes each finish
	// their current item, not just in discrete per-item jumps.
	const settledCount = items.filter((item) => item.status === 'done' || item.status === 'error').length;
	const progressUnits = items.reduce((sum, item) => {
		if (item.status === 'done' || item.status === 'error') return sum + 100;
		if (item.status === 'processing') return sum + (item.progress ?? 0);
		return sum;
	}, 0);
	const overallPercent = items.length > 0 ? Math.round(progressUnits / items.length) : 0;

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
				<label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-0">
					{messages.selectFiles}
					<input
						id="image-compressor-input"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						multiple
						className="sr-only"
						onChange={(event) => {
							handleFiles(event.target.files);
							event.target.value = '';
						}}
					/>
				</label>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			{skippedCount > 0 && (
				<p role="status" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{messages.skippedFiles.replace('{{count}}', String(skippedCount))}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-4">
				<label className="flex items-center gap-1.5 text-sm text-foreground">
					<input
						type="radio"
						name="image-compressor-mode"
						checked={compressMode === 'quality'}
						disabled={isProcessing}
						onChange={() => setCompressMode('quality')}
					/>
					{messages.compressModeQuality}
				</label>
				<label className="flex items-center gap-1.5 text-sm text-foreground">
					<input
						type="radio"
						name="image-compressor-mode"
						checked={compressMode === 'targetSize'}
						disabled={isProcessing}
						onChange={() => setCompressMode('targetSize')}
					/>
					{messages.compressModeTargetSize}
				</label>
			</div>

			{compressMode === 'quality' ? (
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
						disabled={isProcessing}
						onChange={(event) => setQuality(Number(event.target.value))}
						className="w-full sm:w-48"
					/>
				</div>
			) : (
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
					<label htmlFor="image-compressor-target-size" className="shrink-0 text-sm text-foreground">
						{messages.targetSizeLabel.replace('{{size}}', String(targetSizeKb))}
					</label>
					<input
						id="image-compressor-target-size"
						type="range"
						min={MIN_TARGET_SIZE_KB}
						max={MAX_TARGET_SIZE_KB}
						step={10}
						value={targetSizeKb}
						disabled={isProcessing}
						onChange={(event) => setTargetSizeKb(Number(event.target.value))}
						className="w-full sm:w-48"
					/>
				</div>
			)}

			<div className="flex flex-col gap-2">
				<label className="flex items-center gap-1.5 text-sm text-foreground">
					<input
						type="checkbox"
						checked={resizeEnabled}
						disabled={isProcessing}
						onChange={(event) => setResizeEnabled(event.target.checked)}
					/>
					{messages.resizeToggleLabel}
				</label>
				{resizeEnabled && (
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
							disabled={isProcessing}
							onChange={(event) => setMaxDimension(Number(event.target.value))}
							className="w-full sm:w-48"
						/>
					</div>
				)}
			</div>

			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
				<label htmlFor="image-compressor-target-format" className="shrink-0 text-sm text-foreground">
					{messages.targetFormatLabel}
				</label>
				<select
					id="image-compressor-target-format"
					value={targetFormat}
					disabled={isProcessing}
					onChange={(event) => setTargetFormat(event.target.value as TargetFormat)}
					className="min-h-11 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground sm:min-h-0"
				>
					<option value="original">{messages.targetFormatOriginal}</option>
					<option value="image/webp">WebP</option>
					<option value="image/jpeg">JPEG</option>
					<option value="image/png">PNG</option>
					<option value="image/avif">AVIF</option>
				</select>
			</div>

			{isProcessing && items.length > 1 && (
				<div role="status" className="flex flex-col gap-1.5">
					<p className="text-xs text-muted-foreground">
						{messages.processingQueue
							.replace('{{current}}', String(settledCount))
							.replace('{{total}}', String(items.length))}
					</p>
					<Progress value={overallPercent} />
				</div>
			)}

			{items.length === 0 ? (
				<EmptyState icon={ImageOff} heading={messages.noFiles} />
			) : (
				<ul className="flex flex-col gap-3">
					{items.map((item) => (
						<li
							key={item.id}
							className={`flex flex-col gap-2 rounded-md border p-3 text-sm transition-[color,background-color,border-color,opacity,transform] duration-300 animate-in fade-in slide-in-from-top-1 ${
								item.removing
									? 'animate-out fade-out zoom-out-95 duration-150'
									: item.status === 'done'
										? 'border-emerald-500/40'
										: item.status === 'error'
											? 'border-destructive/40'
											: 'border-border'
							}`}
						>
							<div className="flex flex-wrap items-center gap-3">
								{item.status === 'done' && item.compressedPreviewUrl ? (
									<BeforeAfterSlider
										beforeSrc={item.previewUrl}
										beforeAlt={`${item.file.name} — ${messages.original}`}
										afterSrc={item.compressedPreviewUrl}
										afterAlt={`${item.file.name} — ${messages.compressed}`}
										value={item.comparePosition ?? 50}
										onValueChange={(comparePosition) =>
											setItems((prev) =>
												prev.map((it) => (it.id === item.id ? { ...it, comparePosition } : it)),
											)
										}
										label={`${messages.original} / ${messages.compressed}`}
									/>
								) : (
									<img
										src={item.previewUrl}
										alt={`${item.file.name} — ${messages.original}`}
										className="size-16 rounded-md border border-border object-cover"
									/>
								)}
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-foreground">{item.file.name}</span>
									<span className="text-muted-foreground">
										{messages.original}: {formatBytes(item.file.size)}
										{item.status === 'done' && item.compressedSize != null && (
											<>
												{' '}
												→ {messages.compressed}: {formatBytes(item.compressedSize)} (
												{item.compressedSize < item.file.size
													? messages.reduced.replace(
															'{{percent}}',
															String(computeReduction(item.file.size, item.compressedSize).percent),
														)
													: messages.notReduced}
												)
											</>
										)}
										{item.status === 'error' && (
											<span role="alert" className="text-destructive"> {item.errorMessage ?? messages.errorGeneric}</span>
										)}
									</span>
								</div>
								{item.status === 'done' && item.compressedBlob && (
									<Button type="button" size="sm" onClick={() => handleDownload(item)}>
										{messages.download}
									</Button>
								)}
								{item.status === 'error' && (
									<Button type="button" size="sm" variant="outline" onClick={() => void runQueue([item])} disabled={isProcessing}>
										{messages.retry}
									</Button>
								)}
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => handleRemove(item.id)}
									disabled={item.status === 'processing' || item.removing}
									aria-label={`${messages.remove} ${item.file.name}`}
								>
									✕
								</Button>
							</div>
							{item.status === 'processing' && (
								<div className="flex items-center gap-2">
									<Progress value={item.progress ?? 0} className="flex-1" />
									<span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
										{messages.progressPercent.replace('{{percent}}', String(Math.round(item.progress ?? 0)))}
									</span>
								</div>
							)}
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
