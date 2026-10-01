import { useCallback, useEffect, useRef, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BeforeAfterSlider } from '@/components/ui/before-after-slider';
import { baseNameOf, dedupeName } from '@/lib/file-utils';
import { isHeicLike } from '@/lib/image-compress-utils';
import {
	blurDownscaleFactor,
	computeContainLayout,
	exportExtension,
	exportMime,
	gradientEndpoints,
	MARKETPLACE_PRESETS,
	needsFlatten,
	shadowParams,
	type ExportFormat,
	type GradientDirection,
	type MarketplacePreset,
} from '@/lib/bg-remove-utils';
import BackgroundMaskEditor, { type MaskEditorMessages } from './BackgroundMaskEditor';

interface Messages extends MaskEditorMessages {
	selectFiles: string;
	dropHint: string;
	remove: string;
	removing: string;
	loadingModel: string;
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
	retryItem: string;
	clearAll: string;
	skippedFiles: string;
	overallProgress: string;
	downloadAll: string;
	trimTransparentEdgesLabel: string;
	resizeToggleLabel: string;
	maxDimensionLabel: string;
	photoSizeLabel: string;
	photoSizeNone: string;
	photoSizePreset3x4: string;
	photoSizePreset4x6: string;
	photoSizePreset2x3: string;
	photoSizePreset35x45: string;
	photoSizePreset2x2in: string;
	dpiLabel: string;
	verticalPositionLabel: string;
		outputSizeHint: string;
	editMask: string;
	resetEdits: string;
	editedBadge: string;
	backgroundGradient: string;
	backgroundBlur: string;
	gradientFromLabel: string;
	gradientToLabel: string;
	gradientDirectionLabel: string;
	directionVertical: string;
	directionHorizontal: string;
	directionDiagonal: string;
	blurAmountLabel: string;
	shadowToggle: string;
	shadowSizeLabel: string;
	shadowOpacityLabel: string;
	formatLabel: string;
	qualityLabel: string;
	jpgFlattenNote: string;
	photoSizeGroup: string;
	marketplaceGroup: string;
	marketplaceAmazon: string;
	marketplaceShopee: string;
	marketplaceEtsy: string;
	marketplacePaddingLabel: string;
	marketplaceHint: string;
}

type BackgroundMode = 'transparent' | 'color' | 'image' | 'gradient' | 'blur';

interface ImageItem {
	id: string;
	file: File;
	previewUrl: string;
	status: 'pending' | 'processing' | 'done' | 'error';
	resultBlob?: Blob;
		displayUrl?: string;
	// Đuôi file của displayUrl hiện tại (png/webp/jpg), chốt lúc dựng để tên tải về luôn khớp nội dung.
	displayExt?: string;
	// Kết quả sau khi người dùng chỉnh mask bằng brush (thay cho resultBlob khi dựng ảnh); editVersion để kích hoạt dựng lại.
	editedBlob?: Blob;
	editVersion: number;
	comparePosition: number;
	// Lý do kỹ thuật của lỗi (message gốc từ thư viện), hiện kèm thông báo i18n để dễ chẩn đoán.
	errorDetail?: string;
	progress?: number;
	// @imgly/background-removal's progress callback reports two very different
	// phases under the same 0-100 number: downloading the AI model/wasm runtime
	// (only on the very first run per session — cached after that) vs. actually
	// running inference on this image. Showing "Removing background: 12%" while
	// what's really happening is a multi-MB download over a slow connection
	// reads as a stuck/hung progress bar — surfacing which phase it actually is
	// avoids that.
	stage?: 'loading-model' | 'processing';
}

// Chỉ nhận đúng các định dạng mà input[accept] liệt kê (HEIC được giải mã bằng heic2any nạp lazy).
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
function isAcceptedInput(file: File): boolean {
	return ACCEPTED_TYPES.has(file.type) || isHeicLike(file);
}
const DISPLAY_DEBOUNCE_MS = 200;

const MIN_MAX_DIMENSION = 320;
const MAX_MAX_DIMENSION = 4096;
const DEFAULT_MAX_DIMENSION = 1920;

// Standard ID/passport photo print sizes. `3.5x4.5cm` and `35x45mm` are the same physical
// size under two different regional naming conventions (China visa vs. EU/Schengen/UK
// passport) — kept as one preset rather than two identical-dimension entries.
interface PhotoSizePreset {
	id: string;
	labelKey: keyof Pick<
		Messages,
		'photoSizePreset3x4' | 'photoSizePreset4x6' | 'photoSizePreset2x3' | 'photoSizePreset35x45' | 'photoSizePreset2x2in'
	>;
	widthMm: number;
	heightMm: number;
}

const PHOTO_SIZE_PRESETS: PhotoSizePreset[] = [
	{ id: '3x4cm', labelKey: 'photoSizePreset3x4', widthMm: 30, heightMm: 40 },
	{ id: '4x6cm', labelKey: 'photoSizePreset4x6', widthMm: 40, heightMm: 60 },
	{ id: '2x3cm', labelKey: 'photoSizePreset2x3', widthMm: 20, heightMm: 30 },
	{ id: '35x45mm', labelKey: 'photoSizePreset35x45', widthMm: 35, heightMm: 45 },
	{ id: '2x2in', labelKey: 'photoSizePreset2x2in', widthMm: 50.8, heightMm: 50.8 },
];

const MIN_DPI = 150;
const MAX_DPI = 600;
const DEFAULT_DPI = 300;
const MM_PER_INCH = 25.4;

function mmToPx(mm: number, dpi: number): number {
	return Math.round((mm / MM_PER_INCH) * dpi);
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

export interface PhotoSizeOptions {
	widthMm: number;
	heightMm: number;
	dpi: number;
	// -50..50: how far the crop window is shifted up (negative) or down (positive) from
	// dead-center — a straight center-crop usually cuts off too much headroom or chin once
	// the source photo shows more than a tight head-and-shoulders frame, so this exists to
	// let the user nudge the face back into the standard ID-photo frame without a full
	// drag-and-zoom cropper.
	verticalOffsetPercent: number;
}

// Center-crops `source` to the exact aspect ratio implied by `widthMm`/`heightMm`, then
// scales that crop to the exact pixel size print requires at the given DPI — the two are
// deliberately done as separate steps (crop first, then resize the crop) rather than one
// `drawImage` call with mismatched source/dest rects, so the aspect-ratio math only has to
// reason about the crop rectangle, not simultaneously about scaling.
function cropToPhotoSize(source: HTMLCanvasElement, options: PhotoSizeOptions): HTMLCanvasElement {
	const targetAspect = options.widthMm / options.heightMm;
	const sourceAspect = source.width / source.height;

	let cropWidth: number;
	let cropHeight: number;
	if (sourceAspect > targetAspect) {
		cropHeight = source.height;
		cropWidth = cropHeight * targetAspect;
	} else {
		cropWidth = source.width;
		cropHeight = cropWidth / targetAspect;
	}

	const cropX = (source.width - cropWidth) / 2;
	const centeredCropY = (source.height - cropHeight) / 2;
	const maxOffsetY = centeredCropY;
	const offsetY = maxOffsetY * (options.verticalOffsetPercent / 50);
	const cropY = Math.max(0, Math.min(source.height - cropHeight, centeredCropY + offsetY));

	const targetWidthPx = mmToPx(options.widthMm, options.dpi);
	const targetHeightPx = mmToPx(options.heightMm, options.dpi);
	const out = document.createElement('canvas');
	out.width = targetWidthPx;
	out.height = targetHeightPx;
	const ctx = out.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidthPx, targetHeightPx);
	return out;
}

interface DisplayBackground {
	mode: BackgroundMode;
	color: string;
	imageUrl: string | null;
	gradientFrom: string;
	gradientTo: string;
	gradientDirection: GradientDirection;
	blurAmount: number;
}

interface DisplayOptions {
	edgeSoftness: number;
	background: DisplayBackground;
	// Ảnh gốc của item (dùng cho nền blur).
	originalUrl: string;
	trimTransparentEdges: boolean;
	maxDimension: number | undefined;
	photoSize: PhotoSizeOptions | undefined;
	marketplace: { preset: MarketplacePreset; paddingPercent: number } | undefined;
	shadow: { sizePercent: number; opacity: number } | undefined;
	format: ExportFormat;
	quality: number;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');
	return ctx;
}

function drawCover(ctx: CanvasRenderingContext2D, source: ImageBitmap | HTMLCanvasElement, W: number, H: number) {
	const scale = Math.max(W / source.width, H / source.height);
	const w = source.width * scale;
	const h = source.height * scale;
	ctx.drawImage(source, (W - w) / 2, (H - h) / 2, w, h);
}

// Blur nền không dùng ctx.filter: thu nhỏ ảnh gốc rồi phóng lên từng bậc x2 với làm mượt.
function drawBlurredCover(ctx: CanvasRenderingContext2D, source: ImageBitmap, W: number, H: number, strength: number) {
	const factor = blurDownscaleFactor(strength, W, H);
	let current = createCanvas(Math.max(1, Math.round(W / factor)), Math.max(1, Math.round(H / factor)));
	const smallCtx = get2d(current);
	smallCtx.imageSmoothingQuality = 'high';
	drawCover(smallCtx, source, current.width, current.height);
	while (current.width * 2 < W) {
		const next = createCanvas(current.width * 2, current.height * 2);
		const nextCtx = get2d(next);
		nextCtx.imageSmoothingQuality = 'high';
		nextCtx.drawImage(current, 0, 0, next.width, next.height);
		current = next;
	}
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(current, 0, 0, W, H);
}

async function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number, options: DisplayOptions) {
	const { background } = options;
	if (background.mode === 'color') {
		ctx.fillStyle = background.color;
		ctx.fillRect(0, 0, W, H);
	} else if (background.mode === 'gradient') {
		const { x0, y0, x1, y1 } = gradientEndpoints(background.gradientDirection, W, H);
		const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
		gradient.addColorStop(0, background.gradientFrom);
		gradient.addColorStop(1, background.gradientTo);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, W, H);
	} else if (background.mode === 'image' && background.imageUrl) {
		const bgBitmap = await createImageBitmap(await (await fetch(background.imageUrl)).blob());
		drawCover(ctx, bgBitmap, W, H);
		bgBitmap.close();
	} else if (background.mode === 'blur') {
		const original = await createImageBitmap(await (await fetch(options.originalUrl)).blob());
		drawBlurredCover(ctx, original, W, H, background.blurAmount);
		original.close();
	}
}

async function buildDisplayBlob(cutoutBlob: Blob, options: DisplayOptions): Promise<Blob> {
	const bitmap = await createImageBitmap(cutoutBlob);
	const fg = createCanvas(bitmap.width, bitmap.height);
	const fgCtx = get2d(fg);
	fgCtx.drawImage(bitmap, 0, 0);
	bitmap.close();
	if (options.edgeSoftness > 0) {
		const imageData = fgCtx.getImageData(0, 0, fg.width, fg.height);
		softenAlphaEdges(imageData, options.edgeSoftness);
		fgCtx.putImageData(imageData, 0, 0);
	}

	// Nền + (tuỳ chọn) bóng đổ + chủ thể lên 1 canvas W×H. place mô tả vùng nguồn trên fg và vùng đích.
	const compose = async (
		W: number,
		H: number,
		place: { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number },
	) => {
		const canvas = createCanvas(W, H);
		const ctx = get2d(canvas);
		await paintBackground(ctx, W, H, options);
		if (options.shadow) {
			const shadow = shadowParams(options.shadow.sizePercent, options.shadow.opacity, W, H);
			ctx.save();
			ctx.shadowColor = shadow.color;
			ctx.shadowBlur = shadow.blur;
			ctx.shadowOffsetX = shadow.offsetX;
			ctx.shadowOffsetY = shadow.offsetY;
			ctx.drawImage(fg, place.sx, place.sy, place.sw, place.sh, place.dx, place.dy, place.dw, place.dh);
			ctx.restore();
		} else {
			ctx.drawImage(fg, place.sx, place.sy, place.sw, place.sh, place.dx, place.dy, place.dw, place.dh);
		}
		return canvas;
	};

	let finalCanvas: HTMLCanvasElement;
	if (options.marketplace) {
		// Ảnh sản phẩm marketplace: cắt sát chủ thể, đặt vừa khung W×H cố định với lề %, rồi phủ nền.
		const { preset, paddingPercent } = options.marketplace;
		const box = computeOpaqueBoundingBox(fgCtx.getImageData(0, 0, fg.width, fg.height)) ?? {
			x: 0,
			y: 0,
			width: fg.width,
			height: fg.height,
		};
		const layout = computeContainLayout(box.width, box.height, preset.width, preset.height, paddingPercent);
		finalCanvas = await compose(preset.width, preset.height, {
			sx: box.x,
			sy: box.y,
			sw: box.width,
			sh: box.height,
			dx: layout.dx,
			dy: layout.dy,
			dw: layout.dw,
			dh: layout.dh,
		});
	} else {
		finalCanvas = await compose(fg.width, fg.height, {
			sx: 0,
			sy: 0,
			sw: fg.width,
			sh: fg.height,
			dx: 0,
			dy: 0,
			dw: fg.width,
			dh: fg.height,
		});

		// Trimming only makes sense against a transparent background — a color or
		// image fill has no "empty margin" left to detect once it's painted in.
		if (options.background.mode === 'transparent' && options.trimTransparentEdges) {
			const imageData = get2d(finalCanvas).getImageData(0, 0, finalCanvas.width, finalCanvas.height);
			const box = computeOpaqueBoundingBox(imageData);
			if (box && (box.width < finalCanvas.width || box.height < finalCanvas.height)) {
				const trimmed = createCanvas(box.width, box.height);
				get2d(trimmed).drawImage(finalCanvas, -box.x, -box.y);
				finalCanvas = trimmed;
			}
		}

		const { maxDimension } = options;
		if (maxDimension && (finalCanvas.width > maxDimension || finalCanvas.height > maxDimension)) {
			const scale = maxDimension / Math.max(finalCanvas.width, finalCanvas.height);
			const resized = createCanvas(Math.round(finalCanvas.width * scale), Math.round(finalCanvas.height * scale));
			get2d(resized).drawImage(finalCanvas, 0, 0, resized.width, resized.height);
			finalCanvas = resized;
		}

		// A photo-size preset dictates the exact final pixel dimensions itself (from mm + DPI),
		// so it's mutually exclusive with the generic max-dimension resize above in practice —
		// the component only ever supplies one of the two at a time.
		if (options.photoSize) {
			finalCanvas = cropToPhotoSize(finalCanvas, options.photoSize);
		}
	}

	// JPG không có alpha: vùng trong suốt còn lại được đổ nền trắng.
	if (needsFlatten(options.format, options.background.mode === 'transparent')) {
		const flat = createCanvas(finalCanvas.width, finalCanvas.height);
		const flatCtx = get2d(flat);
		flatCtx.fillStyle = '#ffffff';
		flatCtx.fillRect(0, 0, flat.width, flat.height);
		flatCtx.drawImage(finalCanvas, 0, 0);
		finalCanvas = flat;
	}

	return canvasToBlob(finalCanvas, exportMime(options.format), options.format === 'png' ? undefined : options.quality);
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
	const [gradientFrom, setGradientFrom] = useState('#6366F1');
	const [gradientTo, setGradientTo] = useState('#EC4899');
	const [gradientDirection, setGradientDirection] = useState<GradientDirection>('vertical');
	const [blurAmount, setBlurAmount] = useState(12);
	const [shadowEnabled, setShadowEnabled] = useState(false);
	const [shadowSize, setShadowSize] = useState(3);
	const [shadowOpacity, setShadowOpacity] = useState(0.35);
	const [outputFormat, setOutputFormat] = useState<ExportFormat>('png');
	const [exportQuality, setExportQuality] = useState(0.92);
	const [marketplacePadding, setMarketplacePadding] = useState(8);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [resizeEnabled, setResizeEnabled] = useState(false);
	const [maxDimension, setMaxDimension] = useState(DEFAULT_MAX_DIMENSION);
	// 'none' keeps today's behavior untouched (free crop via the generic resize toggle
	// above). Picking a preset takes over the final-size decision instead — the two are
	// mutually exclusive in the UI (see the render below) so they never fight each other.
	const [photoSizePresetId, setPhotoSizePresetId] = useState('none');
	const [photoSizeDpi, setPhotoSizeDpi] = useState(DEFAULT_DPI);
	const [photoSizeVerticalOffset, setPhotoSizeVerticalOffset] = useState(0);
	const [skippedCount, setSkippedCount] = useState(0);
	const [isZipping, setIsZipping] = useState(false);
	const objectUrls = useRef<Set<string>>(new Set());
	const itemsRef = useRef<ImageItem[]>([]);
	itemsRef.current = items;
	// Khoá chống chạy song song 2 vòng xử lý (effect auto-start + nút bấm).
	const runningRef = useRef(false);

	useEffect(() => {
		return () => {
			for (const url of objectUrls.current) URL.revokeObjectURL(url);
		};
	}, []);

	const trackUrl = (url: string) => {
		objectUrls.current.add(url);
		return url;
	};

	const untrackAndRevoke = (url: string | undefined) => {
		if (!url) return;
		URL.revokeObjectURL(url);
		objectUrls.current.delete(url);
	};

	// Recompute every finished item's display image whenever the background
	// choice or edge softness changes — cheap canvas work, so there's no need
	// to re-run the (much more expensive) AI segmentation model again.
	const activePhotoSizePreset = PHOTO_SIZE_PRESETS.find((preset) => preset.id === photoSizePresetId);
	const activeMarketplace = MARKETPLACE_PRESETS.find((preset) => `mp-${preset.id}` === photoSizePresetId);
	// Preset ảnh thẻ hoặc marketplace: cả hai tự quyết kích thước đầu ra nên loại trừ trim/resize chung.
	const hasSizePreset = !!(activePhotoSizePreset || activeMarketplace);
	const editVersionSum = items.reduce((sum, item) => sum + item.editVersion, 0);

	useEffect(() => {
		const background: DisplayBackground = {
			mode: backgroundMode,
			color: backgroundColor,
			imageUrl: backgroundImageUrl,
			gradientFrom,
			gradientTo,
			gradientDirection,
			blurAmount,
		};
		const photoSize: PhotoSizeOptions | undefined = activePhotoSizePreset
			? {
					widthMm: activePhotoSizePreset.widthMm,
					heightMm: activePhotoSizePreset.heightMm,
					dpi: photoSizeDpi,
					verticalOffsetPercent: photoSizeVerticalOffset,
				}
			: undefined;
		let cancelled = false;
		// Debounce: kéo slider (độ mềm viền, DPI, vị trí...) bắn rất nhiều lần; chỉ dựng lại ảnh khi dừng tay.
		const timer = window.setTimeout(() => {
			void (async () => {
				for (const snapshotItem of itemsRef.current) {
					if (cancelled) return;
					const source = snapshotItem.editedBlob ?? snapshotItem.resultBlob;
					if (snapshotItem.status !== 'done' || !source) continue;
					try {
						const displayBlob = await buildDisplayBlob(source, {
							edgeSoftness,
							background,
							originalUrl: snapshotItem.previewUrl,
							// Preset ảnh thẻ tự cắt đúng tỉ lệ/kích thước nên bỏ qua trim để khung không bị lệch.
							trimTransparentEdges: trimTransparentEdges && !hasSizePreset,
							maxDimension: hasSizePreset ? undefined : resizeEnabled ? maxDimension : undefined,
							photoSize,
							marketplace: activeMarketplace
								? { preset: activeMarketplace, paddingPercent: marketplacePadding }
								: undefined,
							shadow: shadowEnabled ? { sizePercent: shadowSize, opacity: shadowOpacity } : undefined,
							format: outputFormat,
							quality: exportQuality,
						});
						if (cancelled) return;
						// Item có thể đã bị xoá trong lúc dựng ảnh: không tạo URL mồ côi.
						if (!itemsRef.current.some((it) => it.id === snapshotItem.id)) continue;
						const displayUrl = trackUrl(URL.createObjectURL(displayBlob));
						setItems((prev) =>
							prev.map((it) => {
								if (it.id !== snapshotItem.id) return it;
								untrackAndRevoke(it.displayUrl);
								return { ...it, displayUrl, displayExt: exportExtension(outputFormat) };
							}),
						);
					} catch {
						// Một item lỗi dựng ảnh không được làm hỏng các item còn lại; giữ displayUrl cũ.
					}
				}
			})();
		}, DISPLAY_DEBOUNCE_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		backgroundMode,
		backgroundColor,
		backgroundImageUrl,
		gradientFrom,
		gradientTo,
		gradientDirection,
		blurAmount,
		edgeSoftness,
		trimTransparentEdges,
		resizeEnabled,
		maxDimension,
		photoSizePresetId,
		photoSizeDpi,
		photoSizeVerticalOffset,
		marketplacePadding,
		shadowEnabled,
		shadowSize,
		shadowOpacity,
		outputFormat,
		exportQuality,
		editVersionSum,
		items.filter((i) => i.status === 'done').length,
	]);

	// Giải mã HEIC (heic2any nạp lazy) một lần cho mỗi item; dùng chung cho preview và bước xoá nền.
	const decodePromises = useRef(new Map<string, Promise<File>>());
	const getDecodedSource = useCallback((item: ImageItem): Promise<File> => {
		if (!isHeicLike(item.file)) return Promise.resolve(item.file);
		let promise = decodePromises.current.get(item.id);
		if (!promise) {
			promise = (async () => {
				const { default: heic2any } = await import('heic2any');
				const result = await heic2any({ blob: item.file, toType: 'image/png' });
				const blob = Array.isArray(result) ? result[0] : result;
				return new File([blob], baseNameOf(item.file.name, 'image') + '.png', { type: 'image/png' });
			})();
			decodePromises.current.set(item.id, promise);
		}
		return promise;
	}, []);

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const allFiles = Array.from(fileList);
		const imageFiles = allFiles.filter((file) => isAcceptedInput(file));
		setSkippedCount(allFiles.length - imageFiles.length);
		const newItems: ImageItem[] = imageFiles.map((file) => ({
			id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
			file,
			previewUrl: trackUrl(URL.createObjectURL(file)),
			status: 'pending' as const,
			comparePosition: 50,
			editVersion: 0,
		}));
		setItems((prev) => [...prev, ...newItems]);

		// HEIC: trình duyệt không hiển thị được <img> trực tiếp -> thay preview bằng bản PNG đã giải mã.
		void (async () => {
			for (const item of newItems.filter((it) => isHeicLike(it.file))) {
				try {
					const decoded = await getDecodedSource(item);
					if (!itemsRef.current.some((it) => it.id === item.id)) continue;
					const decodedUrl = trackUrl(URL.createObjectURL(decoded));
					setItems((prev) =>
						prev.map((it) => {
							if (it.id !== item.id) return it;
							untrackAndRevoke(it.previewUrl);
							return { ...it, previewUrl: decodedUrl };
						}),
					);
				} catch {
					/* giữ preview gốc; lỗi sẽ báo khi xử lý */
				}
			}
		})();
	}, [getDecodedSource]);

	const handleRemoveItem = useCallback((id: string) => {
		const removed = itemsRef.current.find((item) => item.id === id);
		if (removed) {
			untrackAndRevoke(removed.previewUrl);
			untrackAndRevoke(removed.displayUrl);
		}
		setItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const handleRetryItem = useCallback((id: string) => {
		setItems((prev) =>
			prev.map((it) => (it.id === id && it.status === 'error' ? { ...it, status: 'pending', errorDetail: undefined } : it)),
		);
	}, []);

	const handleClearAll = useCallback(() => {
		for (const item of itemsRef.current) {
			untrackAndRevoke(item.previewUrl);
			untrackAndRevoke(item.displayUrl);
		}
		setItems([]);
		setSkippedCount(0);
	}, []);

	const handleBackgroundImageFile = useCallback((fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) return;
		setBackgroundImageUrl((previous) => {
			untrackAndRevoke(previous ?? undefined);
			return trackUrl(URL.createObjectURL(file));
		});
		setBackgroundMode('image');
	}, []);

	// includeErrors=false (auto-start): chỉ xử lý item 'pending' — item lỗi KHÔNG bị thử lại mỗi lần thêm file.
	// includeErrors=true (người dùng bấm nút chính): thử lại cả item lỗi.
	const handleRemove = useCallback(async (includeErrors = false) => {
		if (runningRef.current) return;
		runningRef.current = true;
		setIsProcessing(true);
		const attempted = new Set<string>();
		try {
			// Luôn đọc danh sách mới nhất: bỏ qua item đã bị xoá, và nhặt luôn item thêm vào giữa chừng.
			for (;;) {
				const item = itemsRef.current.find(
					(it) => !attempted.has(it.id) && (it.status === 'pending' || (includeErrors && it.status === 'error')),
				);
				if (!item) break;
				attempted.add(item.id);
				setItems((prev) =>
					prev.map((it) =>
						it.id === item.id ? { ...it, status: 'processing', progress: 0, errorDetail: undefined } : it,
					),
				);
				try {
					const resultBlob = await removeBackground(await getDecodedSource(item), {
						output: { format: 'image/png' },
						// `key` is namespaced by the library itself: "fetch:*" while
						// downloading the model/wasm runtime, "compute:*" while actually
						// running inference on this image — see note on `ImageItem.stage`.
						progress: (key, current, total) => {
							const percent = total > 0 ? Math.round((current / total) * 100) : 0;
							const stage = key.startsWith('fetch:') ? 'loading-model' : 'processing';
							setItems((prev) =>
								prev.map((it) => (it.id === item.id ? { ...it, progress: percent, stage } : it)),
							);
						},
					});
					setItems((prev) =>
						prev.map((it) => (it.id === item.id ? { ...it, status: 'done', resultBlob } : it)),
					);
				} catch (err) {
					const errorDetail = err instanceof Error ? err.message : String(err);
					setItems((prev) =>
						prev.map((it) => (it.id === item.id ? { ...it, status: 'error', errorDetail } : it)),
					);
				}
			}
		} finally {
			runningRef.current = false;
			setIsProcessing(false);
		}
	}, []);

	// Auto-starts removal as soon as file(s) are added — selecting a photo and then having
	// to notice and click a *separate* "Remove Background" button read as "nothing
	// happened" to users trying the tool for the first time (the button sits below the
	// settings panel, easy to miss). The button itself stays in the UI for retrying items
	// that ended up in 'error' without re-selecting files, and as a visible indicator of
	// what's currently running — it just no longer has to be clicked for the common case.
	useEffect(() => {
		if (isProcessing) return;
		if (items.some((item) => item.status === 'pending')) {
			void handleRemove(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, isProcessing]);

	const handleDownload = useCallback((item: ImageItem) => {
		if (!item.resultBlob) return;
		const url = item.displayUrl ?? URL.createObjectURL(item.resultBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${baseNameOf(item.file.name, 'image')}-no-bg.${item.displayExt ?? 'png'}`;
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
			const usedNames = new Set<string>();
			for (const item of doneItems) {
				// Prefer the rendered display version (chosen background mode + edge
				// softness applied) over the raw AI cutout, matching what the
				// single-item Download button already does.
				const blob = item.displayUrl ? await (await fetch(item.displayUrl)).blob() : item.resultBlob!;
				zip.file(dedupeName(`${baseNameOf(item.file.name, 'image')}-no-bg.${item.displayExt ?? 'png'}`, usedNames), blob);
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
				<label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-0">
					{messages.selectFiles}
					<input
						id="background-remover-input"
						type="file"
						accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
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

			<p className="text-xs text-muted-foreground">{messages.modelNotice}</p>

			{isProcessing && items.length > 1 && (
				<div role="status" className="flex flex-col gap-1.5">
					<p className="text-sm text-muted-foreground">
						{messages.overallProgress
							.replace('{{current}}', String(Math.min(doneCount + 1, items.length)))
							.replace('{{total}}', String(items.length))
							.replace('{{percent}}', String(overallPercent))}
					</p>
					<Progress value={overallPercent} />
				</div>
			)}

			<div className="flex flex-col gap-3 rounded-md border border-border p-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium text-foreground">{messages.backgroundLabel}</span>
					<button
						type="button"
						onClick={() => setBackgroundMode('transparent')}
						aria-pressed={backgroundMode === 'transparent'}
						className={`min-h-11 rounded-md border px-2.5 py-1 text-xs sm:min-h-0 font-medium ${backgroundMode === 'transparent' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
					>
						{messages.backgroundTransparent}
					</button>
					<button
						type="button"
						onClick={() => setBackgroundMode('color')}
						aria-pressed={backgroundMode === 'color'}
						className={`min-h-11 rounded-md border px-2.5 py-1 text-xs sm:min-h-0 font-medium ${backgroundMode === 'color' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
					>
						{messages.backgroundColor}
					</button>
					{backgroundMode === 'color' && (
						<input
							type="color"
							value={backgroundColor}
							aria-label={messages.backgroundColor}
							onChange={(event) => setBackgroundColor(event.target.value)}
							className="h-11 w-11 cursor-pointer sm:h-7 sm:w-10 rounded border border-border bg-background"
						/>
					)}
					<button
							type="button"
							onClick={() => setBackgroundMode('gradient')}
							aria-pressed={backgroundMode === 'gradient'}
							className={`min-h-11 rounded-md border px-2.5 py-1 text-xs sm:min-h-0 font-medium ${backgroundMode === 'gradient' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
						>
							{messages.backgroundGradient}
						</button>
						<button
							type="button"
							onClick={() => setBackgroundMode('blur')}
							aria-pressed={backgroundMode === 'blur'}
							className={`min-h-11 rounded-md border px-2.5 py-1 text-xs sm:min-h-0 font-medium ${backgroundMode === 'blur' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
						>
							{messages.backgroundBlur}
						</button>
						<label
							className={`inline-flex min-h-11 cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs font-medium focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-0 ${backgroundMode === 'image' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
					>
						{backgroundImageUrl ? messages.backgroundImage : messages.backgroundImageSelect}
						<input
							id="background-image-input"
							type="file"
							accept="image/jpeg,image/png,image/webp"
							className="sr-only"
							onChange={(event) => {
								handleBackgroundImageFile(event.target.files);
								event.target.value = '';
							}}
						/>
					</label>
					{backgroundImageUrl && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								setBackgroundImageUrl((previous) => {
									untrackAndRevoke(previous ?? undefined);
									return null;
								});
								setBackgroundMode('transparent');
							}}
						>
							{messages.backgroundImageClear}
						</Button>
					)}
				</div>

				{backgroundMode === 'gradient' && (
					<div className="flex flex-wrap items-center gap-3">
						<label className="flex items-center gap-1.5 text-sm text-foreground">
							{messages.gradientFromLabel}
							<input
								type="color"
								value={gradientFrom}
								onChange={(event) => setGradientFrom(event.target.value)}
								className="h-9 w-10 cursor-pointer rounded border border-border bg-background"
							/>
						</label>
						<label className="flex items-center gap-1.5 text-sm text-foreground">
							{messages.gradientToLabel}
							<input
								type="color"
								value={gradientTo}
								onChange={(event) => setGradientTo(event.target.value)}
								className="h-9 w-10 cursor-pointer rounded border border-border bg-background"
							/>
						</label>
						<label htmlFor="background-remover-gradient-direction" className="text-sm text-foreground">
							{messages.gradientDirectionLabel}
						</label>
						<select
							id="background-remover-gradient-direction"
							value={gradientDirection}
							onChange={(event) => setGradientDirection(event.target.value as GradientDirection)}
							className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
						>
							<option value="vertical">{messages.directionVertical}</option>
							<option value="horizontal">{messages.directionHorizontal}</option>
							<option value="diagonal">{messages.directionDiagonal}</option>
						</select>
					</div>
				)}

				{backgroundMode === 'blur' && (
					<div className="flex items-center gap-3">
						<label htmlFor="background-remover-blur" className="shrink-0 text-sm text-foreground">
							{messages.blurAmountLabel.replace('{{value}}', String(blurAmount))}
						</label>
						<input
							id="background-remover-blur"
							type="range"
							min={1}
							max={30}
							step={1}
							value={blurAmount}
							onChange={(event) => setBlurAmount(Number(event.target.value))}
							className="w-48"
						/>
					</div>
				)}

				<div className="flex flex-col gap-2">
					<label className="flex min-h-9 items-center gap-1.5 text-sm text-foreground">
						<input type="checkbox" checked={shadowEnabled} onChange={(event) => setShadowEnabled(event.target.checked)} />
						{messages.shadowToggle}
					</label>
					{shadowEnabled && (
						<div className="flex flex-wrap items-center gap-3">
							<label htmlFor="background-remover-shadow-size" className="shrink-0 text-sm text-foreground">
								{messages.shadowSizeLabel.replace('{{value}}', String(shadowSize))}
							</label>
							<input
								id="background-remover-shadow-size"
								type="range"
								min={1}
								max={10}
								step={0.5}
								value={shadowSize}
								onChange={(event) => setShadowSize(Number(event.target.value))}
								className="w-40"
							/>
							<label htmlFor="background-remover-shadow-opacity" className="shrink-0 text-sm text-foreground">
								{messages.shadowOpacityLabel.replace('{{value}}', String(Math.round(shadowOpacity * 100)))}
							</label>
							<input
								id="background-remover-shadow-opacity"
								type="range"
								min={0.1}
								max={0.8}
								step={0.05}
								value={shadowOpacity}
								onChange={(event) => setShadowOpacity(Number(event.target.value))}
								className="w-40"
							/>
						</div>
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

				{backgroundMode === 'transparent' && !hasSizePreset && (
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
					<label htmlFor="background-remover-photo-size" className="text-sm font-medium text-foreground">
						{messages.photoSizeLabel}
					</label>
					<select
						id="background-remover-photo-size"
						value={photoSizePresetId}
						onChange={(event) => {
								const value = event.target.value;
								setPhotoSizePresetId(value);
								// Amazon yêu cầu nền trắng tinh: nếu đang để trong suốt thì chuyển sang màu trắng (đổi lại được).
								const market = MARKETPLACE_PRESETS.find((preset) => `mp-${preset.id}` === value);
								if (market?.recommendedBackground && backgroundMode === 'transparent') {
									setBackgroundMode('color');
									setBackgroundColor(market.recommendedBackground);
								}
							}}
						className="w-fit max-w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
					>
						<option value="none">{messages.photoSizeNone}</option>
						<optgroup label={messages.photoSizeGroup}>
							{PHOTO_SIZE_PRESETS.map((preset) => (
								<option key={preset.id} value={preset.id}>
									{messages[preset.labelKey]}
								</option>
							))}
						</optgroup>
						<optgroup label={messages.marketplaceGroup}>
							<option value="mp-amazon">{messages.marketplaceAmazon}</option>
							<option value="mp-shopee">{messages.marketplaceShopee}</option>
							<option value="mp-etsy">{messages.marketplaceEtsy}</option>
						</optgroup>
					</select>
					{activeMarketplace && (
						<>
							<div className="flex items-center gap-3">
								<label htmlFor="background-remover-marketplace-padding" className="shrink-0 text-sm text-foreground">
									{messages.marketplacePaddingLabel.replace('{{value}}', String(marketplacePadding))}
								</label>
								<input
									id="background-remover-marketplace-padding"
									type="range"
									min={0}
									max={25}
									step={1}
									value={marketplacePadding}
									onChange={(event) => setMarketplacePadding(Number(event.target.value))}
									className="w-48"
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								{messages.marketplaceHint
									.replace('{{width}}', String(activeMarketplace.width))
									.replace('{{height}}', String(activeMarketplace.height))}
							</p>
						</>
					)}
					{activePhotoSizePreset && (
						<>
							<div className="flex items-center gap-3">
								<label htmlFor="background-remover-dpi" className="shrink-0 text-sm text-foreground">
									{messages.dpiLabel.replace('{{value}}', String(photoSizeDpi))}
								</label>
								<input
									id="background-remover-dpi"
									type="range"
									min={MIN_DPI}
									max={MAX_DPI}
									step={50}
									value={photoSizeDpi}
									onChange={(event) => setPhotoSizeDpi(Number(event.target.value))}
									className="w-48"
								/>
							</div>
							<div className="flex items-center gap-3">
								<label htmlFor="background-remover-vertical-offset" className="shrink-0 text-sm text-foreground">
									{messages.verticalPositionLabel}
								</label>
								<input
									id="background-remover-vertical-offset"
									type="range"
									min={-50}
									max={50}
									step={5}
									value={photoSizeVerticalOffset}
									onChange={(event) => setPhotoSizeVerticalOffset(Number(event.target.value))}
									className="w-48"
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								{messages.outputSizeHint
									.replace('{{width}}', String(mmToPx(activePhotoSizePreset.widthMm, photoSizeDpi)))
									.replace('{{height}}', String(mmToPx(activePhotoSizePreset.heightMm, photoSizeDpi)))}
							</p>
						</>
					)}
				</div>

				{!hasSizePreset && (
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
				)}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<label htmlFor="background-remover-format" className="shrink-0 text-sm font-medium text-foreground">
					{messages.formatLabel}
				</label>
				<select
					id="background-remover-format"
					value={outputFormat}
					onChange={(event) => setOutputFormat(event.target.value as ExportFormat)}
					className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
				>
					<option value="png">PNG</option>
					<option value="webp">WebP</option>
					<option value="jpg">JPG</option>
				</select>
				{outputFormat !== 'png' && (
					<>
						<label htmlFor="background-remover-export-quality" className="shrink-0 text-sm text-foreground">
							{messages.qualityLabel.replace('{{value}}', String(Math.round(exportQuality * 100)))}
						</label>
						<input
							id="background-remover-export-quality"
							type="range"
							min={0.5}
							max={1}
							step={0.01}
							value={exportQuality}
							onChange={(event) => setExportQuality(Number(event.target.value))}
							className="w-40"
						/>
					</>
				)}
				{outputFormat === 'jpg' && backgroundMode === 'transparent' && (
					<p className="w-full text-xs text-muted-foreground">{messages.jpgFlattenNote}</p>
				)}
			</div>

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-4">
					{items.map((item) => (
						<li key={item.id} className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3 text-sm">
							{item.displayUrl ? (
								<BeforeAfterSlider
									className="w-40"
									beforeSrc={item.previewUrl}
									beforeAlt={`${messages.original}: ${item.file.name}`}
									afterSrc={item.displayUrl}
									afterAlt={`${messages.result}: ${item.file.name}`}
									value={item.comparePosition}
									onValueChange={(comparePosition) =>
										setItems((prev) =>
											prev.map((it) => (it.id === item.id ? { ...it, comparePosition } : it)),
										)
									}
									label={`${messages.original} / ${messages.result}`}
									checkerboard
								/>
							) : (
								<div className="relative aspect-square w-40 shrink-0 select-none overflow-hidden rounded-md border border-border">
									<img
										src={item.previewUrl}
										alt={`${messages.original}: ${item.file.name}`}
										className="absolute inset-0 h-full w-full object-cover"
									/>
								</div>
							)}
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="truncate text-foreground">
										{item.file.name}
										{item.editedBlob && (
											<span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">{messages.editedBadge}</span>
										)}
									</span>
								{item.status === 'processing' && (
									<span role="status" className="flex items-center gap-2 text-muted-foreground">
										{item.stage === 'loading-model'
											? messages.loadingModel.replace('{{percent}}', String(item.progress ?? 0))
											: messages.removing.replace('{{percent}}', String(item.progress ?? 0))}
										<Progress value={item.progress ?? 0} className="w-24" />
									</span>
								)}
								{item.status === 'error' && (
									<span role="alert" className="text-destructive">
										{messages.errorGeneric}
										{item.errorDetail && <span className="block text-xs opacity-80">({item.errorDetail})</span>}
									</span>
								)}
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{item.status === 'done' && item.resultBlob && (
										<Button type="button" size="sm" onClick={() => handleDownload(item)}>
											{messages.download}
										</Button>
									)}
									{item.status === 'done' && item.resultBlob && (
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="min-h-9"
											onClick={() => setEditingId(item.id)}
											disabled={isProcessing}
										>
											{messages.editMask}
										</Button>
									)}
									{item.editedBlob && (
										<Button
											type="button"
											size="sm"
											variant="ghost"
											className="min-h-9"
											onClick={() =>
												setItems((prev) =>
													prev.map((it) =>
														it.id === item.id ? { ...it, editedBlob: undefined, editVersion: it.editVersion + 1 } : it,
													),
												)
											}
										>
											{messages.resetEdits}
										</Button>
									)}
								{item.status === 'error' && (
									<Button type="button" size="sm" variant="outline" onClick={() => handleRetryItem(item.id)}>
										{messages.retryItem}
									</Button>
								)}
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => handleRemoveItem(item.id)}
									disabled={item.status === 'processing'}
									aria-label={`${messages.removeItem} ${item.file.name}`}
								>
									✕
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			{editingId &&
				(() => {
					const editing = items.find((it) => it.id === editingId);
					const cutout = editing?.editedBlob ?? editing?.resultBlob;
					if (!editing || !cutout) return null;
					return (
						<BackgroundMaskEditor
							messages={messages}
							originalUrl={editing.previewUrl}
							cutoutBlob={cutout}
							onCancel={() => setEditingId(null)}
							onApply={(blob) => {
								setItems((prev) =>
									prev.map((it) =>
										it.id === editing.id ? { ...it, editedBlob: blob, editVersion: it.editVersion + 1 } : it,
									),
								);
								setEditingId(null);
							}}
						/>
					);
				})()}

			<div className="flex flex-wrap items-center gap-3">
				<Button type="button" onClick={() => void handleRemove(true)} disabled={!canRemove}>
					{isProcessing
						? (() => {
								const active = items.find((item) => item.status === 'processing');
								const label = active?.stage === 'loading-model' ? messages.loadingModel : messages.removing;
								return label.replace('{{percent}}', String(active?.progress ?? 0));
							})()
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
