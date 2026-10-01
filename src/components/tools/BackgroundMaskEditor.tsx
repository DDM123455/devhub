import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
	brushRadiusInImage,
	EMPTY_HISTORY,
	pointerToImage,
	pushStroke,
	redoStroke,
	segmentBounds,
	shouldAddPoint,
	undoStroke,
	type BrushMode,
	type MaskHistory,
	type Point,
	type Stroke,
} from '@/lib/mask-edit';

export interface MaskEditorMessages {
	editorTitle: string;
	brushErase: string;
	brushRestore: string;
	brushSize: string;
	zoom: string;
	undo: string;
	redo: string;
	apply: string;
	cancel: string;
	editorHint: string;
	editorLoading: string;
	editorError: string;
}

interface Props {
	messages: MaskEditorMessages;
	/** URL ảnh gốc (đã giải mã nếu là HEIC). */
	originalUrl: string;
	/** Kết quả cắt nền AI (PNG trong suốt) hiện tại. */
	cutoutBlob: Blob;
	onApply: (blob: Blob) => void;
	onCancel: () => void;
}

// Canvas hiển thị tối đa cạnh dài này; nét vẽ được lưu ở toạ độ ảnh gốc và phát lại ở full-res khi áp dụng.
const MAX_DISPLAY_SIDE = 1600;

function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

// Vẽ 1 đoạn nét tròn đầu vào ctx. scale: tỉ lệ từ toạ độ ảnh gốc sang canvas đích.
function strokeSegment(ctx: CanvasRenderingContext2D, a: Point, b: Point, radius: number, scale: number) {
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = Math.max(1, radius * 2 * scale);
	ctx.beginPath();
	ctx.moveTo(a.x * scale, a.y * scale);
	ctx.lineTo(b.x * scale, b.y * scale);
	ctx.stroke();
	if (a.x === b.x && a.y === b.y) {
		ctx.beginPath();
		ctx.arc(a.x * scale, a.y * scale, Math.max(0.5, radius * scale), 0, Math.PI * 2);
		ctx.fill();
	}
}

// Áp 1 đoạn lên canvas cutout: Erase = xoá alpha; Restore = lộ lại pixel ảnh gốc trong vùng nét.
function applySegment(
	cutout: CanvasRenderingContext2D,
	scratch: CanvasRenderingContext2D,
	original: HTMLCanvasElement,
	mode: BrushMode,
	a: Point,
	b: Point,
	radius: number,
	scale: number,
) {
	if (mode === 'erase') {
		cutout.save();
		cutout.globalCompositeOperation = 'destination-out';
		cutout.strokeStyle = '#000';
		cutout.fillStyle = '#000';
		strokeSegment(cutout, a, b, radius, scale);
		cutout.restore();
		return;
	}
	const bounds = segmentBounds(
		{ x: a.x * scale, y: a.y * scale },
		{ x: b.x * scale, y: b.y * scale },
		radius * scale,
		original.width,
		original.height,
	);
	if (bounds.width === 0 || bounds.height === 0) return;
	scratch.save();
	scratch.beginPath();
	scratch.rect(bounds.x, bounds.y, bounds.width, bounds.height);
	scratch.clip();
	scratch.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
	scratch.strokeStyle = '#fff';
	scratch.fillStyle = '#fff';
	strokeSegment(scratch, a, b, radius, scale);
	scratch.globalCompositeOperation = 'source-in';
	scratch.drawImage(original, 0, 0);
	scratch.restore();
	cutout.drawImage(scratch.canvas, bounds.x, bounds.y, bounds.width, bounds.height, bounds.x, bounds.y, bounds.width, bounds.height);
}

function replayStroke(
	cutout: CanvasRenderingContext2D,
	scratch: CanvasRenderingContext2D,
	original: HTMLCanvasElement,
	stroke: Stroke,
	scale: number,
) {
	const pts = stroke.points;
	if (pts.length === 0) return;
	if (pts.length === 1) {
		applySegment(cutout, scratch, original, stroke.mode, pts[0], pts[0], stroke.radius, scale);
		return;
	}
	for (let i = 1; i < pts.length; i++) {
		applySegment(cutout, scratch, original, stroke.mode, pts[i - 1], pts[i], stroke.radius, scale);
	}
}

export default function BackgroundMaskEditor({ messages, originalUrl, cutoutBlob, onApply, onCancel }: Props) {
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [mode, setMode] = useState<BrushMode>('restore');
	const [brushSize, setBrushSize] = useState(40);
	const [zoom, setZoom] = useState(1);
	const [history, setHistory] = useState<MaskHistory>(EMPTY_HISTORY);
	const [isApplying, setIsApplying] = useState(false);

	const displayRef = useRef<HTMLCanvasElement | null>(null);
	// Bitmap/canvas nguồn, giữ ở full-res để phát lại khi Apply.
	const sourceRef = useRef<{ original: ImageBitmap; cutout: ImageBitmap; width: number; height: number; scale: number } | null>(null);
	// Canvas làm việc ở độ phân giải hiển thị.
	const workRef = useRef<{ cutout: HTMLCanvasElement; original: HTMLCanvasElement; scratch: HTMLCanvasElement } | null>(null);
	const drawingRef = useRef<{ stroke: Stroke; pointerId: number } | null>(null);
	const historyRef = useRef(history);
	historyRef.current = history;
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

	const blit = useCallback(() => {
		const display = displayRef.current;
		const work = workRef.current;
		if (!display || !work) return;
		const ctx = display.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, display.width, display.height);
		ctx.drawImage(work.cutout, 0, 0);
	}, []);

	// Dựng lại canvas cutout = cutout gốc + phát lại các nét trong lịch sử (dùng cho undo/redo).
	const rebuild = useCallback(
		(strokes: Stroke[]) => {
			const source = sourceRef.current;
			const work = workRef.current;
			if (!source || !work) return;
			const ctx = work.cutout.getContext('2d')!;
			ctx.clearRect(0, 0, work.cutout.width, work.cutout.height);
			ctx.drawImage(source.cutout, 0, 0, work.cutout.width, work.cutout.height);
			const scratch = work.scratch.getContext('2d')!;
			for (const stroke of strokes) replayStroke(ctx, scratch, work.original, stroke, source.scale);
			blit();
		},
		[blit],
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [originalBlob] = await Promise.all([fetch(originalUrl).then((r) => r.blob())]);
				const [original, cutout] = await Promise.all([createImageBitmap(originalBlob), createImageBitmap(cutoutBlob)]);
				if (cancelled) {
					original.close();
					cutout.close();
					return;
				}
				const width = cutout.width;
				const height = cutout.height;
				const scale = Math.min(1, MAX_DISPLAY_SIDE / Math.max(width, height));
				const dw = Math.max(1, Math.round(width * scale));
				const dh = Math.max(1, Math.round(height * scale));
				const originalCanvas = createCanvas(dw, dh);
				originalCanvas.getContext('2d')!.drawImage(original, 0, 0, dw, dh);
				const cutoutCanvas = createCanvas(dw, dh);
				cutoutCanvas.getContext('2d')!.drawImage(cutout, 0, 0, dw, dh);
				sourceRef.current = { original, cutout, width, height, scale };
				workRef.current = { cutout: cutoutCanvas, original: originalCanvas, scratch: createCanvas(dw, dh) };
				const display = displayRef.current;
				if (display) {
					display.width = dw;
					display.height = dh;
				}
				setStatus('ready');
				blit();
			} catch {
				if (!cancelled) setStatus('error');
			}
		})();
		return () => {
			cancelled = true;
			sourceRef.current?.original.close();
			sourceRef.current?.cutout.close();
			sourceRef.current = null;
			workRef.current = null;
		};
	}, [originalUrl, cutoutBlob, blit]);

	// Sau khi status=ready canvas hiển thị đã mount với kích thước đúng; vẽ lần đầu.
	useEffect(() => {
		if (status !== 'ready') return;
		const display = displayRef.current;
		const work = workRef.current;
		if (display && work && (display.width !== work.cutout.width || display.height !== work.cutout.height)) {
			display.width = work.cutout.width;
			display.height = work.cutout.height;
		}
		blit();
	}, [status, blit]);

	const toImagePoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
		const source = sourceRef.current!;
		return pointerToImage(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), source.width, source.height);
	};

	const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		if (status !== 'ready' || !sourceRef.current || !workRef.current) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		const rect = event.currentTarget.getBoundingClientRect();
		const radius = brushRadiusInImage(brushSize, sourceRef.current.width, rect.width);
		const point = toImagePoint(event);
		const stroke: Stroke = { mode, radius, points: [point] };
		drawingRef.current = { stroke, pointerId: event.pointerId };
		const work = workRef.current;
		replayStroke(work.cutout.getContext('2d')!, work.scratch.getContext('2d')!, work.original, stroke, sourceRef.current.scale);
		blit();
	};

	const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
		const drawing = drawingRef.current;
		const source = sourceRef.current;
		const work = workRef.current;
		if (!drawing || !source || !work || drawing.pointerId !== event.pointerId) return;
		const point = toImagePoint(event);
		const last = drawing.stroke.points[drawing.stroke.points.length - 1];
		if (!shouldAddPoint(last, point, Math.max(1, drawing.stroke.radius * 0.15))) return;
		drawing.stroke.points.push(point);
		applySegment(
			work.cutout.getContext('2d')!,
			work.scratch.getContext('2d')!,
			work.original,
			drawing.stroke.mode,
			last,
			point,
			drawing.stroke.radius,
			source.scale,
		);
		blit();
	};

	const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const drawing = drawingRef.current;
		if (!drawing || drawing.pointerId !== event.pointerId) return;
		drawingRef.current = null;
		setHistory((prev) => pushStroke(prev, drawing.stroke));
	};

	const handleUndo = useCallback(() => {
		const next = undoStroke(historyRef.current);
		if (next === historyRef.current) return;
		setHistory(next);
		rebuild(next.strokes);
	}, [rebuild]);

	const handleRedo = useCallback(() => {
		const next = redoStroke(historyRef.current);
		if (next === historyRef.current) return;
		setHistory(next);
		rebuild(next.strokes);
	}, [rebuild]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onCancel();
				return;
			}
			if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
			event.preventDefault();
			if (event.shiftKey) handleRedo();
			else handleUndo();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [handleUndo, handleRedo, onCancel]);

	// Áp dụng ở full-res: phát lại toàn bộ nét lên cutout gốc rồi xuất PNG.
	const handleApply = async () => {
		const source = sourceRef.current;
		if (!source) return;
		if (history.strokes.length === 0) {
			onCancel();
			return;
		}
		setIsApplying(true);
		try {
			const full = createCanvas(source.width, source.height);
			const ctx = full.getContext('2d')!;
			ctx.drawImage(source.cutout, 0, 0);
			const originalFull = createCanvas(source.width, source.height);
			originalFull.getContext('2d')!.drawImage(source.original, 0, 0, source.width, source.height);
			const scratch = createCanvas(source.width, source.height).getContext('2d')!;
			for (const stroke of history.strokes) replayStroke(ctx, scratch, originalFull, stroke, 1);
			const blob = await new Promise<Blob>((resolve, reject) =>
				full.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), 'image/png'),
			);
			onApply(blob);
		} catch {
			setStatus('error');
		} finally {
			setIsApplying(false);
		}
	};

	const aspect = workRef.current ? workRef.current.cutout.width / workRef.current.cutout.height : 1;
	const displayWidthPercent = zoom * 100;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={messages.editorTitle}
			className="fixed inset-0 z-50 flex flex-col gap-3 overflow-hidden bg-background/95 p-3 backdrop-blur-sm sm:p-6"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="mr-auto text-base font-semibold text-foreground">{messages.editorTitle}</h3>
				<Button type="button" variant="outline" className="min-h-9" onClick={onCancel} disabled={isApplying}>
					{messages.cancel}
				</Button>
				<Button type="button" className="min-h-9" onClick={() => void handleApply()} disabled={status !== 'ready' || isApplying}>
					{messages.apply}
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<div className="flex gap-2" role="group" aria-label={messages.editorTitle}>
					{(
						[
							['restore', messages.brushRestore],
							['erase', messages.brushErase],
						] as [BrushMode, string][]
					).map(([value, label]) => (
						<button
							key={value}
							type="button"
							aria-pressed={mode === value}
							onClick={() => setMode(value)}
							className={`min-h-9 rounded-md border px-3 py-1 text-sm font-medium ${mode === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
						>
							{label}
						</button>
					))}
				</div>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<span className="shrink-0">{messages.brushSize.replace('{{value}}', String(brushSize))}</span>
					<input
						type="range"
						min={5}
						max={200}
						step={1}
						value={brushSize}
						onChange={(event) => setBrushSize(Number(event.target.value))}
						className="w-32"
					/>
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<span className="shrink-0">{messages.zoom.replace('{{value}}', String(Math.round(zoom * 100)))}</span>
					<input
						type="range"
						min={1}
						max={4}
						step={0.25}
						value={zoom}
						onChange={(event) => setZoom(Number(event.target.value))}
						className="w-32"
					/>
				</label>
				<Button type="button" variant="outline" className="min-h-9" onClick={handleUndo} disabled={history.strokes.length === 0 || isApplying}>
					{messages.undo}
				</Button>
				<Button type="button" variant="outline" className="min-h-9" onClick={handleRedo} disabled={history.redoStack.length === 0 || isApplying}>
					{messages.redo}
				</Button>
			</div>

			<p className="text-xs text-muted-foreground">{messages.editorHint}</p>

			<div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/30">
				{status === 'loading' && <p role="status" className="p-4 text-sm text-muted-foreground">{messages.editorLoading}</p>}
				{status === 'error' && <p role="alert" className="p-4 text-sm text-destructive">{messages.editorError}</p>}
				<div
					className="relative mx-auto select-none"
					style={{
						width: `${displayWidthPercent}%`,
						maxWidth: zoom === 1 ? undefined : 'none',
						aspectRatio: String(aspect),
						display: status === 'ready' ? 'block' : 'none',
						backgroundImage:
							'linear-gradient(45deg,#cbd5e1 25%,transparent 25%),linear-gradient(-45deg,#cbd5e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cbd5e1 75%),linear-gradient(-45deg,transparent 75%,#cbd5e1 75%)',
						backgroundSize: '16px 16px',
						backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
						backgroundColor: '#f8fafc',
					}}
				>
					{/* Ảnh gốc mờ làm hướng dẫn để thấy vùng cần Restore. */}
					<img
						src={originalUrl}
						alt=""
						aria-hidden="true"
						draggable={false}
						className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
					/>
					<canvas
						ref={displayRef}
						className="absolute inset-0 h-full w-full cursor-none"
						style={{ touchAction: 'none' }}
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={finishStroke}
						onPointerCancel={finishStroke}
						onPointerLeave={() => setCursor(null)}
					/>
					{cursor && (
						<span
							aria-hidden="true"
							className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
							style={{
								width: brushSize,
								height: brushSize,
								left: cursor.x - brushSize / 2,
								top: cursor.y - brushSize / 2,
								background: mode === 'erase' ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)',
							}}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
