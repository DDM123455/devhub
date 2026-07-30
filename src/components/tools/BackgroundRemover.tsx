import { useCallback, useEffect, useRef, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';
import { Button } from '@/components/ui/button';

interface Messages {
	selectFiles: string;
	dropHint: string;
	remove: string;
	removing: string;
	download: string;
	original: string;
	result: string;
	noFiles: string;
	errorGeneric: string;
	modelNotice: string;
	backgroundLabel: string;
	backgroundTransparent: string;
	backgroundColor: string;
	backgroundImage: string;
	backgroundImageSelect: string;
	backgroundImageClear: string;
	edgeSoftnessLabel: string;
	removeItem: string;
	clearAll: string;
	skippedFiles: string;
	overallProgress: string;
	downloadAll: string;
	trimTransparentEdgesLabel: string;
	resizeToggleLabel: string;
	maxDimensionLabel: string;
}

type BackgroundMode = 'transparent' | 'color' | 'image';

interface ImageItem {
	id: string;
	file: File;
	previewUrl: string;
	status: 'pending' | 'processing' | 'done' | 'error';
	resultBlob?: Blob;
	displayUrl?: string;
	comparePosition: number;
	progress?: number;
}

const MIN_MAX_DIMENSION = 320;
const MAX_MAX_DIMENSION = 4096;
const DEFAULT_MAX_DIMENSION = 1920;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
			type,
			quality,
		);
	});
}

// A simple two-pass (horizontal + vertical) box blur applied only to the
// alpha channel. The AI cutout mask is a hard edge by default; this softens
// it for a more natural look around hair/fur, without needing any extra
// dependency or a library feature @imgly/background-removal doesn't expose.
function softenAlphaEdges(imageData: ImageData, radius: number): void {
	if (radius <= 0) return;
	const { width, height, data } = imageData;
	const alpha = new Float32Array(width * height);
	for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];

	const boxBlur1D = (src: Float32Array, w: number, h: number, horizontal: boolean) => {
		const out = new Float32Array(w * h);
		const size = radius * 2 + 1;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0;
				let count = 0;
				for (let k = -radius; k <= radius; k++) {
					const sx = horizontal ? x + k : x;
					const sy = horizontal ? y : y + k;
					if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
						sum += src[sy * w + sx];
						count++;
					}
				}
				out[y * w + x] = sum / count;
			}
		}
		return out;
	};

	const horizontallyBlurred = boxBlur1D(alpha, width, height, true);
	const fullyBlurred = boxBlur1D(horizontallyBlurred, width, height, false);
	for (let i = 0; i < width * height; i++) data[i * 4 + 3] = Math.round(fullyBlurred[i]);
}

// Scans every pixel's alpha channel to find the smallest rectangle containing
// anything non-transparent — a cheap way to "auto-crop" a cutout without a
// manual drag-handle UI: the AI already produced the mask, this just trims
// the empty margin around it.
function computeOpaqueBoundingBox(imageData: ImageData): { x: number; y: number; width: number; height: number } | null {
	const { width, height, data } = imageData;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > 0) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < minX || maxY < minY) return null;
	return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function buildDisplayBlob(
	resultBlob: Blob,
	edgeSoftness: number,
	background: { mode: BackgroundMode; color: string; imageUrl: string | null },
	trimTransparentEdges: boolean,
	maxDimension: number | undefined,
): Promise<Blob> {
	const bitmap = await createImageBitmap(resultBlob);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');

	if (background.mode === 'color') {
		ctx.fillStyle = background.color;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	} else if (background.mode === 'image' && background.imageUrl) {
		const bgBitmap = await createImageBitmap(await (await fetch(background.imageUrl)).blob());
		const scale = Math.max(canvas.width / bgBitmap.width, canvas.height / bgBitmap.height);
		const w = bgBitmap.width * scale;
		const h = bgBitmap.height * scale;
		ctx.drawImage(bgBitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
		bgBitmap.close();
	}

	if (edgeSoftness > 0) {
		const fgCanvas = document.createElement('canvas');
		fgCanvas.width = bitmap.width;
		fgCanvas.height = bitmap.height;
		const fgCtx = fgCanvas.getContext('2d')!;
		fgCtx.drawImage(bitmap, 0, 0);
		const imageData = fgCtx.getImageData(0, 0, fgCanvas.width, fgCanvas.height);
		softenAlphaEdges(imageData, edgeSoftness);
		fgCtx.putImageData(imageData, 0, 0);
		ctx.drawImage(fgCanvas, 0, 0);
	} else {
		ctx.drawImage(bitmap, 0, 0);
	}
	bitmap.close();

	// Trimming only makes sense against a transparent background — a color or
	// image fill has no "empty margin" left to detect once it's painted in.
	let finalCanvas: HTMLCanvasElement = canvas;
	if (background.mode === 'transparent' && trimTransparentEdges) {
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const box = computeOpaqueBoundingBox(imageData);
		if (box && (box.width < canvas.width || box.height < canvas.height)) {
			const trimmed = document.createElement('canvas');
			trimmed.width = box.width;
			trimmed.height = box.height;
			const trimmedCtx = trimmed.getContext('2d');
			if (!trimmedCtx) throw new Error('Canvas 2D context unavailable');
			trimmedCtx.drawImage(finalCanvas, -box.x, -box.y);
			finalCanvas = trimmed;
		}
	}

	if (maxDimension && (finalCanvas.width > maxDimension || finalCanvas.height > maxDimension)) {
		const scale = maxDimension / Math.max(finalCanvas.width, finalCanvas.height);
		const resized = document.createElement('canvas');
		resized.width = Math.round(finalCanvas.width * scale);
		resized.height = Math.round(finalCanvas.height * scale);
		const resizedCtx = resized.getContext('2d');
		if (!resizedCtx) throw new Error('Canvas 2D context unavailable');
		resizedCtx.drawImage(finalCanvas, 0, 0, resized.width, resized.height);
		finalCanvas = resized;
	}

	return canvasToBlob(finalCanvas, 'image/png');
}

export default function BackgroundRemover({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('transparent');
	const [backgroundColor, setBackgroundColor] = useState('#22C55E');
	const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
	const [edgeSoftness, setEdgeSoftness] = useState(0);
	const [trimTransparentEdges, setTrimTransparentEdges] = useState(false);
	const [resizeEnabled, setResizeEnabled] = useState(false);
	const [maxDimension, setMaxDimension] = useState(DEFAULT_MAX_DIMENSION);
	const [skippedCount, setSkippedCount] = useState(0);
	const [isZipping, setIsZipping] = useState(false);
	const objectUrls = useRef<Set<string>>(new Set());

	useEffect(() => {
		return () => {
			for (const url of objectUrls.current) URL.revokeObjectURL(url);
		};
	}, []);

	const trackUrl = (url: string) => {
		objectUrls.current.add(url);
		return url;
	};

	// Recompute every finished item's display image whenever the background
	// choice or edge softness changes — cheap canvas work, so there's no need
	// to re-run the (much more expensive) AI segmentation model again.
	useEffect(() => {
		const background = { mode: backgroundMode, color: backgroundColor, imageUrl: backgroundImageUrl };
		let cancelled = false;
		(async () => {
			for (const item of items) {
				if (item.status !== 'done' || !item.resultBlob) continue;
				const displayBlob = await buildDisplayBlob(
					item.resultBlob,
					edgeSoftness,
					background,
					trimTransparentEdges,
					resizeEnabled ? maxDimension : undefined,
				);
				if (cancelled) return;
				const displayUrl = trackUrl(URL.createObjectURL(displayBlob));
				setItems((prev) =>
					prev.map((it) => (it.id === item.id ? { ...it, displayUrl } : it)),
				);
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		backgroundMode,
		backgroundColor,
		backgroundImageUrl,
		edgeSoftness,
		trimTransparentEdges,
		resizeEnabled,
		maxDimension,
		items.filter((i) => i.status === 'done').length,
	]);

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
			comparePosition: 50,
		}));
		setItems((prev) => [...prev, ...newItems]);
	}, []);

	const handleRemoveItem = useCallback((id: string) => {
		setItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const handleClearAll = useCallback(() => {
		setItems([]);
		setSkippedCount(0);
	}, []);

	const handleBackgroundImageFile = useCallback((fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) return;
		setBackgroundImageUrl(trackUrl(URL.createObjectURL(file)));
		setBackgroundMode('image');
	}, []);

	const handleRemove = useCallback(async () => {
		setIsProcessing(true);
		for (const item of items) {
			if (item.status === 'done') continue;
			setItems((prev) =>
				prev.map((it) => (it.id === item.id ? { ...it, status: 'processing', progress: 0 } : it)),
			);
			try {
				const resultBlob = await removeBackground(item.file, {
					output: { format: 'image/png' },
					progress: (_key, current, total) => {
						const percent = total > 0 ? Math.round((current / total) * 100) : 0;
						setItems((prev) =>
							prev.map((it) => (it.id === item.id ? { ...it, progress: percent } : it)),
						);
					},
				});
				setItems((prev) =>
					prev.map((it) => (it.id === item.id ? { ...it, status: 'done', resultBlob } : it)),
				);
			} catch {
				setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
			}
		}
		setIsProcessing(false);
	}, [items]);

	const handleDownload = useCallback((item: ImageItem) => {
		if (!item.resultBlob) return;
		const url = item.displayUrl ?? URL.createObjectURL(item.resultBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${item.file.name.replace(/\.[^./\\]+$/, '')}-no-bg.png`;
		link.click();
		if (!item.displayUrl) URL.revokeObjectURL(url);
	}, []);

	const handleDownloadAll = useCallback(async () => {
		const doneItems = items.filter((item) => item.status === 'done' && item.resultBlob);
		if (doneItems.length === 0) return;
		setIsZipping(true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			for (const item of doneItems) {
				// Prefer the rendered display version (chosen background mode + edge
				// softness applied) over the raw AI cutout, matching what the
				// single-item Download button already does.
				const blob = item.displayUrl ? await (await fetch(item.displayUrl)).blob() : item.resultBlob!;
				zip.file(`${item.file.name.replace(/\.[^./\\]+$/, '')}-no-bg.png`, blob);
			}
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'no-bg-images.zip';
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			setIsZipping(false);
		}
	}, [items]);

	const canRemove =
		!isProcessing && items.length > 0 && items.some((item) => item.status !== 'done');
	const doneCount = items.filter((item) => item.status === 'done').length;
	const currentlyProcessing = items.find((item) => item.status === 'processing');
	// Combines "how many images are fully finished" with "how far along the
	// one currently running is" into a single 0-100 figure — the per-item %
	// the AI model itself reports isn't useful on its own once there's more
	// than one image in the batch.
	const overallPercent =
		items.length > 0
			? Math.round(((doneCount + (currentlyProcessing ? (currentlyProcessing.progress ?? 0) / 100 : 0)) / items.length) * 100)
			: 0;

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
					htmlFor="background-remover-input"
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{messages.selectFiles}
				</label>
				<input
					id="background-remover-input"
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

			<p className="text-xs text-muted-foreground">{messages.modelNotice}</p>

			{isProcessing && items.length > 1 && (
				<p role="status" className="text-sm text-muted-foreground">
					{messages.overallProgress
						.replace('{{current}}', String(Math.min(doneCount + 1, items.length)))
						.replace('{{total}}', String(items.length))
						.replace('{{percent}}', String(overallPercent))}
				</p>
			)}

			<div className="flex flex-col gap-3 rounded-md border border-border p-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium text-foreground">{messages.backgroundLabel}</span>
					<button
						type="button"
						onClick={() => setBackgroundMode('transparent')}
						className={`rounded-md border px-2.5 py-1 text-xs font-medium ${backgroundMode === 'transparent' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
					>
						{messages.backgroundTransparent}
					</button>
					<button
						type="button"
						onClick={() => setBackgroundMode('color')}
						className={`rounded-md border px-2.5 py-1 text-xs font-medium ${backgroundMode === 'color' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
					>
						{messages.backgroundColor}
					</button>
					{backgroundMode === 'color' && (
						<input
							type="color"
							value={backgroundColor}
							onChange={(event) => setBackgroundColor(event.target.value)}
							className="h-7 w-10 cursor-pointer rounded border border-border bg-background"
						/>
					)}
					<label
						htmlFor="background-image-input"
						className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium ${backgroundMode === 'image' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
					>
						{backgroundImageUrl ? messages.backgroundImage : messages.backgroundImageSelect}
					</label>
					<input
						id="background-image-input"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="hidden"
						onChange={(event) => handleBackgroundImageFile(event.target.files)}
					/>
					{backgroundImageUrl && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								setBackgroundImageUrl(null);
								setBackgroundMode('transparent');
							}}
						>
							{messages.backgroundImageClear}
						</Button>
					)}
				</div>

				<div className="flex items-center gap-3">
					<label htmlFor="edge-softness" className="shrink-0 text-sm text-foreground">
						{messages.edgeSoftnessLabel}: {edgeSoftness}px
					</label>
					<input
						id="edge-softness"
						type="range"
						min={0}
						max={8}
						step={1}
						value={edgeSoftness}
						onChange={(event) => setEdgeSoftness(Number(event.target.value))}
						className="w-48"
					/>
				</div>

				{backgroundMode === 'transparent' && (
					<label className="flex items-center gap-1.5 text-sm text-foreground">
						<input
							type="checkbox"
							checked={trimTransparentEdges}
							onChange={(event) => setTrimTransparentEdges(event.target.checked)}
						/>
						{messages.trimTransparentEdgesLabel}
					</label>
				)}

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
							<label htmlFor="background-remover-max-dimension" className="shrink-0 text-sm text-foreground">
								{messages.maxDimensionLabel.replace('{{size}}', String(maxDimension))}
							</label>
							<input
								id="background-remover-max-dimension"
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
			</div>

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-4">
					{items.map((item) => (
						<li key={item.id} className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3 text-sm">
							<div className="relative aspect-square w-40 shrink-0 select-none overflow-hidden rounded-md border border-border">
								<img
									src={item.previewUrl}
									alt={`${messages.original}: ${item.file.name}`}
									className="absolute inset-0 h-full w-full object-cover"
								/>
								{item.displayUrl && (
									<>
										<div
											className="absolute inset-0 overflow-hidden bg-[repeating-conic-gradient(#d4d4d4_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]"
											style={{ clipPath: `inset(0 0 0 ${item.comparePosition}%)` }}
										>
											<img
												src={item.displayUrl}
												alt={`${messages.result}: ${item.file.name}`}
												className="absolute inset-0 h-full w-full object-cover"
											/>
										</div>
										<div
											aria-hidden="true"
											className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
											style={{ left: `${item.comparePosition}%` }}
										/>
										<input
											type="range"
											min={0}
											max={100}
											value={item.comparePosition}
											onChange={(event) => {
												const comparePosition = Number(event.target.value);
												setItems((prev) =>
													prev.map((it) => (it.id === item.id ? { ...it, comparePosition } : it)),
												);
											}}
											className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
											aria-label={`${messages.original} / ${messages.result}`}
										/>
									</>
								)}
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="truncate text-foreground">{item.file.name}</span>
								{item.status === 'processing' && (
									<span role="status" className="text-muted-foreground">
										{messages.removing.replace('{{percent}}', String(item.progress ?? 0))}
									</span>
								)}
								{item.status === 'error' && (
									<span role="alert" className="text-destructive">{messages.errorGeneric}</span>
								)}
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
									onClick={() => handleRemoveItem(item.id)}
									disabled={item.status === 'processing'}
									aria-label={messages.removeItem}
								>
									✕
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button type="button" onClick={handleRemove} disabled={!canRemove}>
					{isProcessing
						? messages.removing.replace(
								'{{percent}}',
								String(items.find((item) => item.status === 'processing')?.progress ?? 0),
							)
						: messages.remove}
				</Button>
				{doneCount > 1 && (
					<Button type="button" variant="secondary" onClick={handleDownloadAll} disabled={isZipping}>
						{messages.downloadAll}
					</Button>
				)}
				{items.length > 0 && (
					<Button type="button" variant="outline" onClick={handleClearAll} disabled={isProcessing}>
						{messages.clearAll}
					</Button>
				)}
			</div>
		</div>
	);
}
