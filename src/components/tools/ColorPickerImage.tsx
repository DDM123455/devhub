import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { bestTextColor, rgbToHex, rgbToHsl, type Rgb } from '@/lib/color-utils';
import {
	SAMPLE_SIZES,
	fitDimensions,
	pointerToPixel,
	pushPicked,
	sampleColor,
	type PixelBuffer,
	type SampleSize,
} from '@/lib/image-color-pick';
import { copyTextSafe } from '@/lib/safe-clipboard';

export interface ImagePickMessages {
	imgPickHeading: string;
	imgPickHint: string;
	imgPickChoose: string;
	imgPickDrop: string;
	imgPickCanvasAria: string;
	imgPickKeysHint: string;
	imgPickSampleLabel: string;
	imgPickSample1: string;
	imgPickSample3: string;
	imgPickSample5: string;
	imgPickSample11: string;
	imgPickZoomLabel: string;
	imgPickZoomFit: string;
	imgPickPrompt: string;
	imgPickPickedHeading: string;
	imgPickEmpty: string;
	imgPickClear: string;
	imgPickCopyAll: string;
	imgPickCopied: string;
	imgPickCopyFailed: string;
	imgPickUse: string;
	imgPickRemove: string;
	imgPickLoadError: string;
	imgPickTransparent: string;
	imgPickAnnounce: string;
	imgPickImageInfo: string;
}

type Zoom = 'fit' | 1 | 2 | 4 | 8;
const ZOOMS: Zoom[] = ['fit', 1, 2, 4, 8];
const LOUPE_CELLS = 9;
const LOUPE_PX = 117;

interface Props {
	onPickColor: (hex: string) => void;
	messages: ImagePickMessages;
}

interface Reading {
	x: number;
	y: number;
	rgb: Rgb;
	hex: string;
}

export default function ColorPickerImage({ onPickColor, messages }: Props) {
	const [image, setImage] = useState<{ width: number; height: number; name: string; scaled: boolean } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [zoom, setZoom] = useState<Zoom>('fit');
	const [sample, setSample] = useState<SampleSize>(1);
	const [reading, setReading] = useState<Reading | null>(null);
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
	const [picked, setPicked] = useState<string[]>([]);
	const [announce, setAnnounce] = useState('');
	const [copyState, setCopyState] = useState<'idle' | 'ok' | 'failed'>('idle');
	const [dragOver, setDragOver] = useState(false);
	const [loupe, setLoupe] = useState<{ left: number; top: number } | null>(null);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const loupeRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const markerRef = useRef<HTMLDivElement>(null);
	const sourceRef = useRef<HTMLImageElement | null>(null);
	const bufferRef = useRef<PixelBuffer | null>(null);
	const keyboardMoved = useRef(false);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => {
		if (copyTimer.current) clearTimeout(copyTimer.current);
	}, []);

	const loadFile = useCallback(
		(file: File | null | undefined) => {
			if (!file) return;
			setError(null);
			if (!file.type.startsWith('image/')) {
				setError(messages.imgPickLoadError);
				return;
			}
			const url = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				const w = img.naturalWidth;
				const h = img.naturalHeight;
				if (!w || !h) {
					setError(messages.imgPickLoadError);
					return;
				}
				const fit = fitDimensions(w, h);
				sourceRef.current = img;
				bufferRef.current = null;
				setReading(null);
				setCursor(null);
				setLoupe(null);
				setZoom('fit');
				setImage({ width: fit.width, height: fit.height, name: file.name, scaled: fit.width !== w || fit.height !== h });
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				setError(messages.imgPickLoadError);
			};
			img.src = url;
		},
		[messages.imgPickLoadError],
	);

	// Draw the decoded image into the canvas once it is mounted, and keep the pixel data for sampling.
	useEffect(() => {
		const canvas = canvasRef.current;
		const img = sourceRef.current;
		if (!image || !canvas || !img) return;
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) {
			setError(messages.imgPickLoadError);
			return;
		}
		ctx.drawImage(img, 0, 0, image.width, image.height);
		try {
			const data = ctx.getImageData(0, 0, image.width, image.height);
			bufferRef.current = { data: data.data, width: data.width, height: data.height };
		} catch {
			bufferRef.current = null;
			setError(messages.imgPickLoadError);
		}
	}, [image, messages.imgPickLoadError]);

	// Paste an image from the clipboard (Ctrl+V) anywhere on the page.
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
			if (!file) return;
			e.preventDefault();
			loadFile(file);
		};
		window.addEventListener('paste', onPaste);
		return () => window.removeEventListener('paste', onPaste);
	}, [loadFile]);

	useEffect(() => {
		if (keyboardMoved.current) {
			markerRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
			keyboardMoved.current = false;
		}
	}, [cursor]);

	const readAt = useCallback(
		(x: number, y: number): Reading | null => {
			const buffer = bufferRef.current;
			if (!buffer) return null;
			const s = sampleColor(buffer, x, y, sample);
			if (!s) return null;
			return { x, y, rgb: s.rgb, hex: rgbToHex(s.rgb) };
		},
		[sample],
	);

	const drawLoupe = useCallback((x: number, y: number) => {
		const loupeCanvas = loupeRef.current;
		const source = canvasRef.current;
		if (!loupeCanvas || !source) return;
		const ctx = loupeCanvas.getContext('2d');
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.fillStyle = '#808080';
		ctx.fillRect(0, 0, LOUPE_PX, LOUPE_PX);
		const half = (LOUPE_CELLS - 1) / 2;
		const cell = LOUPE_PX / LOUPE_CELLS;
		// Draw cell by cell so cells that fall outside the image stay grey instead of stretching the edge.
		const buffer = bufferRef.current;
		if (!buffer) return;
		for (let dy = -half; dy <= half; dy++) {
			for (let dx = -half; dx <= half; dx++) {
				const px = x + dx;
				const py = y + dy;
				if (px < 0 || py < 0 || px >= buffer.width || py >= buffer.height) continue;
				const i = (py * buffer.width + px) * 4;
				const a = buffer.data[i + 3] / 255;
				ctx.fillStyle = `rgba(${buffer.data[i]},${buffer.data[i + 1]},${buffer.data[i + 2]},${a})`;
				ctx.fillRect((dx + half) * cell, (dy + half) * cell, Math.ceil(cell), Math.ceil(cell));
			}
		}
	}, []);

	const handleMove = (e: PointerEvent<HTMLCanvasElement>) => {
		if (e.pointerType === 'touch') return;
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!canvas || !wrap || !image) return;
		const pos = pointerToPixel(e.clientX, e.clientY, canvas.getBoundingClientRect(), image);
		if (!pos) {
			setLoupe(null);
			return;
		}
		const r = readAt(pos.x, pos.y);
		setReading(r);
		if (r) drawLoupe(pos.x, pos.y);
		const wrapRect = wrap.getBoundingClientRect();
		const flipX = e.clientX - wrapRect.left > wrapRect.width - LOUPE_PX - 32;
		const flipY = e.clientY - wrapRect.top > wrapRect.height - LOUPE_PX - 32;
		setLoupe({
			left: e.clientX - wrapRect.left + (flipX ? -LOUPE_PX - 16 : 16),
			top: e.clientY - wrapRect.top + (flipY ? -LOUPE_PX - 16 : 16),
		});
	};

	const pickAt = useCallback(
		(x: number, y: number) => {
			const r = readAt(x, y);
			if (!r) {
				setAnnounce(messages.imgPickTransparent);
				return;
			}
			setReading(r);
			setCursor({ x, y });
			setPicked((prev) => pushPicked(prev, r.hex));
			onPickColor(r.hex);
			setAnnounce(messages.imgPickAnnounce.replace('{{hex}}', r.hex.toUpperCase()));
		},
		[readAt, onPickColor, messages.imgPickAnnounce, messages.imgPickTransparent],
	);

	const handleClick = (e: PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas || !image) return;
		const pos = pointerToPixel(e.clientX, e.clientY, canvas.getBoundingClientRect(), image);
		if (pos) pickAt(pos.x, pos.y);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
		if (!image) return;
		const step = e.shiftKey ? 10 : 1;
		const base = cursor ?? { x: Math.floor(image.width / 2), y: Math.floor(image.height / 2) };
		let next: { x: number; y: number } | null = null;
		if (e.key === 'ArrowLeft') next = { x: base.x - step, y: base.y };
		else if (e.key === 'ArrowRight') next = { x: base.x + step, y: base.y };
		else if (e.key === 'ArrowUp') next = { x: base.x, y: base.y - step };
		else if (e.key === 'ArrowDown') next = { x: base.x, y: base.y + step };
		else if (e.key === 'Home') next = { x: 0, y: base.y };
		else if (e.key === 'End') next = { x: image.width - 1, y: base.y };
		else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			pickAt(base.x, base.y);
			return;
		}
		if (!next) return;
		e.preventDefault();
		const x = Math.min(image.width - 1, Math.max(0, next.x));
		const y = Math.min(image.height - 1, Math.max(0, next.y));
		keyboardMoved.current = true;
		setCursor({ x, y });
		const r = readAt(x, y);
		setReading(r);
		if (r) drawLoupe(x, y);
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragOver(false);
		loadFile(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/')) ?? e.dataTransfer.files[0]);
	};

	const removeImage = () => {
		sourceRef.current = null;
		bufferRef.current = null;
		setImage(null);
		setReading(null);
		setCursor(null);
		setLoupe(null);
		setError(null);
	};

	const copyAll = () => {
		void copyTextSafe(picked.join('\n')).then((ok) => {
			setCopyState(ok ? 'ok' : 'failed');
			if (copyTimer.current) clearTimeout(copyTimer.current);
			copyTimer.current = setTimeout(() => setCopyState('idle'), 1400);
		});
	};

	const sampleLabels: Record<SampleSize, string> = {
		1: messages.imgPickSample1,
		3: messages.imgPickSample3,
		5: messages.imgPickSample5,
		11: messages.imgPickSample11,
	};

	const display = reading;
	const hsl = display ? rgbToHsl(display.rgb) : null;
	const canvasStyle =
		zoom === 'fit'
			? { maxWidth: '100%', height: 'auto', imageRendering: 'auto' as const }
			: { width: `${(image?.width ?? 0) * zoom}px`, maxWidth: 'none', height: 'auto', imageRendering: 'pixelated' as const };

	return (
		<section className="rounded-lg border border-border p-4" aria-labelledby="color-image-pick-heading">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="color-image-pick-heading" className="text-sm font-medium text-foreground">
					{messages.imgPickHeading}
				</h2>
				{image && (
					<Button type="button" size="sm" variant="outline" onClick={removeImage}>
						{messages.imgPickRemove}
					</Button>
				)}
			</div>
			<p className="mt-1 text-xs text-muted-foreground">{messages.imgPickHint}</p>

			{error && (
				<p role="alert" className="mt-2 text-sm text-destructive">
					{error}
				</p>
			)}

			{!image ? (
				<div
					onDragOver={(e) => {
						e.preventDefault();
						setDragOver(true);
					}}
					onDragLeave={() => setDragOver(false)}
					onDrop={handleDrop}
					className={`mt-3 flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center ${
						dragOver ? 'border-primary bg-primary/5' : 'border-border'
					}`}
				>
					<label
						htmlFor="color-image-pick-input"
						className="inline-flex h-11 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring sm:h-9"
					>
						{messages.imgPickChoose}
					</label>
					<input
						id="color-image-pick-input"
						type="file"
						accept="image/*"
						className="sr-only"
						onChange={(e) => {
							loadFile(e.currentTarget.files?.[0]);
							e.currentTarget.value = '';
						}}
					/>
					<p className="text-xs text-muted-foreground">{messages.imgPickDrop}</p>
				</div>
			) : (
				<div className="mt-3 flex flex-col gap-3" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
						<label className="flex items-center gap-2">
							{messages.imgPickSampleLabel}
							<select
								value={sample}
								onChange={(e) => setSample(Number(e.target.value) as SampleSize)}
								className="rounded-md border border-border bg-background px-2 text-sm text-foreground"
							>
								{SAMPLE_SIZES.map((s) => (
									<option key={s} value={s}>
										{sampleLabels[s]}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-center gap-2">
							{messages.imgPickZoomLabel}
							<select
								value={String(zoom)}
								onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : (Number(e.target.value) as Zoom))}
								className="rounded-md border border-border bg-background px-2 text-sm text-foreground"
							>
								{ZOOMS.map((z) => (
									<option key={String(z)} value={String(z)}>
										{z === 'fit' ? messages.imgPickZoomFit : `${z * 100}%`}
									</option>
								))}
							</select>
						</label>
						<span>{messages.imgPickImageInfo.replace('{{w}}', String(image.width)).replace('{{h}}', String(image.height))}</span>
					</div>

					<div ref={wrapRef} className="relative">
						<div className="max-h-[32rem] overflow-auto rounded-md border border-border bg-[repeating-conic-gradient(#8881_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
							<div className="relative inline-block max-w-full align-top">
								<canvas
									ref={canvasRef}
									role="img"
									tabIndex={0}
									aria-label={messages.imgPickCanvasAria}
									aria-describedby="color-image-pick-keys"
									onPointerMove={handleMove}
									onPointerLeave={() => setLoupe(null)}
									onClick={handleClick}
									onKeyDown={handleKeyDown}
									style={canvasStyle}
									className="block cursor-crosshair focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
								/>
								{cursor && (
									<div
										ref={markerRef}
										aria-hidden="true"
										className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_#000]"
										style={{ left: `${((cursor.x + 0.5) / image.width) * 100}%`, top: `${((cursor.y + 0.5) / image.height) * 100}%` }}
									/>
								)}
							</div>
						</div>
						{loupe && display && (
							<div
								aria-hidden="true"
								className="pointer-events-none absolute z-10 overflow-hidden rounded-md border-2 border-white shadow-lg ring-1 ring-black/50"
								style={{ left: loupe.left, top: loupe.top, width: LOUPE_PX, height: LOUPE_PX }}
							>
								<canvas ref={loupeRef} width={LOUPE_PX} height={LOUPE_PX} className="block" />
								<div
									className="absolute border-2 border-white shadow-[0_0_0_1px_#000]"
									style={{
										left: ((LOUPE_CELLS - 1) / 2) * (LOUPE_PX / LOUPE_CELLS),
										top: ((LOUPE_CELLS - 1) / 2) * (LOUPE_PX / LOUPE_CELLS),
										width: LOUPE_PX / LOUPE_CELLS,
										height: LOUPE_PX / LOUPE_CELLS,
									}}
								/>
								<div
									className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-center font-mono text-[11px]"
									style={{ background: display.hex, color: bestTextColor(display.rgb) }}
								>
									{display.hex.toUpperCase()}
								</div>
							</div>
						)}
					</div>
					<p id="color-image-pick-keys" className="text-xs text-muted-foreground">
						{messages.imgPickKeysHint}
					</p>

					<div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
						<span
							className="size-10 shrink-0 rounded-md border border-border"
							style={{ background: display ? display.hex : 'transparent' }}
							aria-hidden="true"
						/>
						{display && hsl ? (
							<div className="flex flex-col gap-0.5 font-mono text-xs text-foreground">
								<span className="text-sm font-semibold">{display.hex.toUpperCase()}</span>
								<span>
									rgb({display.rgb.r}, {display.rgb.g}, {display.rgb.b})
								</span>
								<span>
									hsl({hsl.h}, {hsl.s}%, {hsl.l}%)
								</span>
								<span className="text-muted-foreground">
									x {display.x}, y {display.y}
								</span>
							</div>
						) : (
							<span className="text-sm text-muted-foreground">{messages.imgPickPrompt}</span>
						)}
					</div>
				</div>
			)}

			<p role="status" aria-live="polite" className="sr-only">
				{announce}
			</p>

			<div className="mt-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-sm font-medium text-foreground">{messages.imgPickPickedHeading}</span>
					{picked.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" size="sm" variant="outline" onClick={copyAll}>
								{copyState === 'ok' ? messages.imgPickCopied : copyState === 'failed' ? messages.imgPickCopyFailed : messages.imgPickCopyAll}
							</Button>
							<Button type="button" size="sm" variant="ghost" onClick={() => setPicked([])}>
								{messages.imgPickClear}
							</Button>
						</div>
					)}
				</div>
				{picked.length === 0 ? (
					<p className="mt-1 text-xs text-muted-foreground">{messages.imgPickEmpty}</p>
				) : (
					<ul className="mt-2 flex flex-wrap gap-2">
						{[...picked].reverse().map((hex) => (
							<li key={hex}>
								<button
									type="button"
									onClick={() => onPickColor(hex)}
									aria-label={messages.imgPickUse.replace('{{hex}}', hex.toUpperCase())}
									className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2 font-mono text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span className="size-5 rounded border border-border" style={{ background: hex }} aria-hidden="true" />
									{hex.toUpperCase()}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
