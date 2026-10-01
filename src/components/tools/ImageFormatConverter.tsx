import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BeforeAfterSlider } from '@/components/ui/before-after-slider';
import { baseNameOf, dedupeName } from '@/lib/file-utils';
import {
	computePdfPlacement,
	isHexColor,
	isSvgFile,
	prepareSvgForRaster,
	type PdfPageMode,
} from '@/lib/image-pdf';

interface Messages {
	retry: string;
	selectFiles: string;
	dropHint: string;
	targetFormat: string;
	quality: string;
	convert: string;
	converting: string;
	download: string;
	downloadAll: string;
	original: string;
	converted: string;
	noFiles: string;
	errorGeneric: string;
	errorAvifUnsupported: string;
	errorTooLarge: string;
	formatsNote: string;
	remove: string;
	clearAll: string;
	skippedFiles: string;
	resizeToggleLabel: string;
	maxDimensionLabel: string;
	processingQueue: string;
	backgroundLabel: string;
	backgroundAuto: string;
	backgroundCustom: string;
	svgScaleLabel: string;
	errorSvg: string;
	pdfPageSizeLabel: string;
	pdfPageFit: string;
	pdfMarginLabel: string;
	downloadCombinedPdf: string;
}

type TargetFormat =
	| 'image/png'
	| 'image/jpeg'
	| 'image/webp'
	| 'image/avif'
	| 'image/bmp'
	| 'image/x-icon'
	| 'image/gif'
	| 'application/pdf';

const EXTENSION_BY_FORMAT: Record<TargetFormat, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/bmp': 'bmp',
	'image/x-icon': 'ico',
	'image/gif': 'gif',
	'application/pdf': 'pdf',
};

const LOSSY_FORMATS = new Set<TargetFormat>(['image/jpeg', 'image/webp', 'image/avif', 'application/pdf']);
const WHITE_BACKGROUND_FORMATS = new Set<TargetFormat>(['image/jpeg', 'image/bmp']);
const MIN_MAX_DIMENSION = 320;
const MAX_MAX_DIMENSION = 4096;
const DEFAULT_MAX_DIMENSION = 1920;
// Real-world .ico files (favicons, Windows app icons) bundle several
// resolutions in one container so the OS picks whichever fits — a single
// fixed 256px output (the old behavior here) is a common icon-tool shortcut,
// but not what a favicon generator or icon editor like RealFaviconGenerator
// or IcoFX would produce.
const ICO_SIZES = [16, 32, 48, 128, 256];
// Each compression spins up async decode/encode work — running several at
// once lets the browser overlap that work instead of waiting for one image
// to fully finish before starting the next, same reasoning as the worker-pool
// added to Image Compressor's batch processing.
const CONCURRENCY = 3;

interface ImageItem {
	id: string;
	file: File;
	previewUrl: string;
	status: 'pending' | 'processing' | 'done' | 'error';
	resultBlob?: Blob;
	// Chốt lúc chuyển đổi xong: tên tải về luôn khớp định dạng thật của blob, kể cả khi dropdown đổi sau đó.
	downloadName?: string;
	resultFormat?: TargetFormat;
	resultPreviewUrl?: string;
	// Drag position (0-100) of the before/after compare slider — only set once
	// a converted result exists to compare against (same pattern as Image
	// Compressor's `comparePosition`).
	comparePosition?: number;
	errorMessage?: string;
}

class AvifUnsupportedError extends Error {}
class CanvasTooLargeError extends Error {}
class SvgRasterError extends Error {}

// Giới hạn an toàn cho canvas: Safari/iOS ~16.7M px, Chrome/Firefox ~268M px / cạnh 32767.
// Dùng ngưỡng bảo thủ chung; vượt thì báo lỗi gợi ý thu nhỏ thay vì lỗi mơ hồ.
const MAX_CANVAS_PIXELS = 100_000_000;
const MAX_CANVAS_SIDE = 16384;
function assertCanvasSize(width: number, height: number) {
	if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_PIXELS) {
		throw new CanvasTooLargeError();
	}
}

// Chỉ nhận các định dạng mà input[accept] liệt kê (kéo-thả không được lọt SVG/TIFF/...).
const ACCEPTED_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/bmp',
	'image/avif',
	'image/svg+xml',
]);

interface ConvertSettings {
	targetFormat: TargetFormat;
	quality: number;
	maxDimension?: number;
	// null = tự động (JPG/BMP -> trắng, định dạng có alpha -> giữ trong suốt).
	backgroundColor: string | null;
	svgScale: number;
	pdfPageMode: PdfPageMode;
	pdfMarginMm: number;
}

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
async function toDecodableBlob(file: File, svgScale = 1): Promise<Blob> {
	if (isSvgFile(file)) return rasterizeSvg(file, svgScale);
	if (!isHeic(file)) return file;
	const { default: heic2any } = await import('heic2any');
	const result = await heic2any({ blob: file, toType: 'image/png' });
	return Array.isArray(result) ? result[0] : result;
}

// SVG -> PNG trong suốt ở kích thước nội tại × scale. createImageBitmap không nhận SVG ổn định
// ở mọi trình duyệt nên dùng <img> + canvas. <img> không chạy script / không tải tài nguyên ngoài.
async function rasterizeSvg(file: File, scale: number): Promise<Blob> {
	const text = await file.text();
	const prepared = prepareSvgForRaster(text, scale);
	assertCanvasSize(prepared.width, prepared.height);
	const url = URL.createObjectURL(new Blob([prepared.text], { type: 'image/svg+xml' }));
	try {
		const img = new Image();
		img.decoding = 'async';
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new SvgRasterError());
			img.src = url;
		});
		const canvas = document.createElement('canvas');
		canvas.width = prepared.width;
		canvas.height = prepared.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new SvgRasterError();
		ctx.drawImage(img, 0, 0, prepared.width, prepared.height);
		return await canvasToBlob(canvas, 'image/png');
	} finally {
		URL.revokeObjectURL(url);
	}
}

function hasTransparentPixels(imageData: ImageData): boolean {
	const data = imageData.data;
	for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
	return false;
}

// Ảnh -> PDF 1 trang bằng pdf-lib (nạp động). Ảnh có alpha nhúng PNG, còn lại nhúng JPEG theo quality.
async function encodePdf(canvas: HTMLCanvasElement, settings: ConvertSettings): Promise<Blob> {
	const { PDFDocument } = await import('pdf-lib');
	const ctx = canvas.getContext('2d')!;
	const alpha = hasTransparentPixels(ctx.getImageData(0, 0, canvas.width, canvas.height));
	const imgBlob = alpha
		? await canvasToBlob(canvas, 'image/png')
		: await canvasToBlob(canvas, 'image/jpeg', settings.quality);
	const bytes = new Uint8Array(await imgBlob.arrayBuffer());
	const doc = await PDFDocument.create();
	const image = alpha ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
	const place = computePdfPlacement(canvas.width, canvas.height, settings.pdfPageMode, settings.pdfMarginMm);
	const page = doc.addPage([place.pageWidth, place.pageHeight]);
	page.drawImage(image, { x: place.x, y: place.y, width: place.width, height: place.height });
	const out = await doc.save();
	return new Blob([out as BlobPart], { type: 'application/pdf' });
}

async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
	const { PDFDocument } = await import('pdf-lib');
	const merged = await PDFDocument.create();
	for (const blob of blobs) {
		const src = await PDFDocument.load(await blob.arrayBuffer());
		const pages = await merged.copyPages(src, src.getPageIndices());
		for (const page of pages) merged.addPage(page);
	}
	return new Blob([(await merged.save()) as BlobPart], { type: 'application/pdf' });
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
// ICO container can simply embed full PNG images after a directory listing
// each one's size/offset — no pixel-level re-encoding needed. Bundling all of
// `ICO_SIZES` in one file (rather than one fixed size) matches how a real
// favicon/icon generator produces a .ico, so the OS or browser can pick
// whichever resolution actually fits (taskbar vs. tab favicon vs. shortcut).
async function encodeIcoMultiSize(bitmap: ImageBitmap): Promise<Blob> {
	const images: { size: number; bytes: Uint8Array }[] = [];
	// Không phóng to vô lý: chỉ giữ các cỡ <= cạnh dài nhất của ảnh gốc (tối thiểu cỡ nhỏ nhất).
	const maxSide = Math.max(bitmap.width, bitmap.height);
	const sizes = ICO_SIZES.filter((size) => size <= maxSide);
	if (sizes.length === 0) sizes.push(ICO_SIZES[0]);
	for (const size of sizes) {
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D context unavailable');
		// Giữ tỉ lệ (fit, letterbox trong suốt) thay vì kéo giãn ảnh chữ nhật thành hình vuông.
		const scale = Math.min(size / bitmap.width, size / bitmap.height);
		const drawW = Math.max(1, Math.round(bitmap.width * scale));
		const drawH = Math.max(1, Math.round(bitmap.height * scale));
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, Math.round((size - drawW) / 2), Math.round((size - drawH) / 2), drawW, drawH);
		const pngBlob = await canvasToBlob(canvas, 'image/png');
		images.push({ size, bytes: new Uint8Array(await pngBlob.arrayBuffer()) });
	}

	const HEADER_SIZE = 6;
	const DIR_ENTRY_SIZE = 16;
	const header = new ArrayBuffer(HEADER_SIZE);
	const headerView = new DataView(header);
	headerView.setUint16(0, 0, true);
	headerView.setUint16(2, 1, true);
	headerView.setUint16(4, images.length, true);

	const dir = new ArrayBuffer(DIR_ENTRY_SIZE * images.length);
	const dirView = new DataView(dir);
	let offset = HEADER_SIZE + dir.byteLength;
	images.forEach((img, i) => {
		const entry = i * DIR_ENTRY_SIZE;
		// A directory byte of 0 means "256" — ICO has no way to encode 256 in a
		// single byte otherwise, so this is the format's own convention, not a bug.
		dirView.setUint8(entry, img.size >= 256 ? 0 : img.size);
		dirView.setUint8(entry + 1, img.size >= 256 ? 0 : img.size);
		dirView.setUint8(entry + 2, 0);
		dirView.setUint8(entry + 3, 0);
		dirView.setUint16(entry + 4, 1, true);
		dirView.setUint16(entry + 6, 32, true);
		dirView.setUint32(entry + 8, img.bytes.byteLength, true);
		dirView.setUint32(entry + 12, offset, true);
		offset += img.bytes.byteLength;
	});

	return new Blob([header, dir, ...images.map((img) => img.bytes)], { type: 'image/x-icon' });
}

// No browser encodes GIF via canvas.toBlob, so a small pure-JS encoder
// (gifenc) handles palette quantization + LZW compression. Dynamic import
// keeps it out of the main bundle until a user actually picks GIF.
async function encodeGif(imageData: ImageData): Promise<Blob> {
	const { quantize, applyPalette, GIFEncoder } = await import('gifenc');
	// GIF chỉ hỗ trợ trong suốt 1-bit: nếu ảnh có pixel trong suốt thì lượng tử hoá kiểu rgba4444 với
	// oneBitAlpha và đánh dấu màu trong suốt; ảnh đặc thì giữ đường rgb565 cũ (chính xác màu hơn).
	const data = imageData.data;
	let hasAlpha = false;
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] < 128) {
			hasAlpha = true;
			break;
		}
	}
	const gif = GIFEncoder();
	if (hasAlpha) {
		const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
		const index = applyPalette(data, palette, 'rgba4444');
		const transparentIndex = palette.findIndex((c: number[]) => c.length === 4 && c[3] === 0);
		gif.writeFrame(index, imageData.width, imageData.height, {
			palette,
			transparent: transparentIndex >= 0,
			transparentIndex: Math.max(0, transparentIndex),
		});
	} else {
		const palette = quantize(data, 256);
		const index = applyPalette(data, palette);
		gif.writeFrame(index, imageData.width, imageData.height, { palette });
	}
	gif.finish();
	return new Blob([gif.bytes()], { type: 'image/gif' });
}

async function convertImage(
	file: File,
	settings: ConvertSettings,
	decoded?: Blob,
): Promise<Blob> {
	const { targetFormat, quality, maxDimension } = settings;
	const decodableBlob = decoded ?? (await toDecodableBlob(file, settings.svgScale));
	const bitmap = await createImageBitmap(decodableBlob);

	// ICO always bundles the fixed `ICO_SIZES` set regardless of the user's
	// resize choice — resizing to one target size doesn't apply to a format
	// whose whole point is shipping several fixed resolutions in one file.
	if (targetFormat === 'image/x-icon') {
		const blob = await encodeIcoMultiSize(bitmap);
		bitmap.close();
		return blob;
	}

	let { width, height } = bitmap;
	if (maxDimension && (width > maxDimension || height > maxDimension)) {
		const scale = maxDimension / Math.max(width, height);
		width = Math.round(width * scale);
		height = Math.round(height * scale);
	}

	try {
		assertCanvasSize(width, height);
	} catch (err) {
		bitmap.close();
		throw err;
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		throw new CanvasTooLargeError();
	}

	// Nền: màu người dùng chọn; nếu "tự động" thì JPG/BMP phải đổ nền trắng (không có alpha),
	// còn PNG/WebP/AVIF/GIF giữ trong suốt. PDF: trắng nếu dùng JPEG, nên alpha được kiểm tra trong encodePdf.
	const fill =
		settings.backgroundColor ?? (WHITE_BACKGROUND_FORMATS.has(targetFormat) ? '#ffffff' : null);
	if (fill) {
		ctx.fillStyle = fill;
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
		case 'image/gif':
			return encodeGif(ctx.getImageData(0, 0, canvas.width, canvas.height));
		case 'application/pdf':
			return encodePdf(canvas, settings);
	}
}

function replaceExtension(fileName: string, targetFormat: TargetFormat): string {
	return baseNameOf(fileName, 'image') + '.' + EXTENSION_BY_FORMAT[targetFormat];
}

export default function ImageFormatConverter({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [targetFormat, setTargetFormat] = useState<TargetFormat>('image/webp');
	const [quality, setQuality] = useState(0.8);
	const [resizeEnabled, setResizeEnabled] = useState(false);
	const [maxDimension, setMaxDimension] = useState(DEFAULT_MAX_DIMENSION);
	const [bgMode, setBgMode] = useState<'auto' | 'custom'>('auto');
	const [bgColor, setBgColor] = useState('#ffffff');
	const [svgScale, setSvgScale] = useState(2);
	const [pdfPageMode, setPdfPageMode] = useState<PdfPageMode>('a4');
	const [pdfMarginMm, setPdfMarginMm] = useState(10);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isZipping, setIsZipping] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [skippedCount, setSkippedCount] = useState(0);
	const objectUrls = useRef<Set<string>>(new Set());
	const itemsRef = useRef<ImageItem[]>([]);
	itemsRef.current = items;
	// Blob HEIC đã giải mã (PNG) theo item id: dùng cho preview và để lúc convert không giải mã lần 2.
	const decodedBlobs = useRef<Map<string, Blob>>(new Map());

	// Every object URL created for a preview (original or converted) is tracked
	// here and revoked on unmount, since nothing else in this component's
	// lifecycle naturally triggers a revoke for images the user never removes
	// (same pattern as Image Compressor's `objectUrls`/`trackUrl`).
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
		for (const url of [item.previewUrl, item.resultPreviewUrl]) {
			if (!url) continue;
			URL.revokeObjectURL(url);
			objectUrls.current.delete(url);
		}
		decodedBlobs.current.delete(item.id);
	};

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const allFiles = Array.from(fileList);
		const acceptedFiles = allFiles.filter((file) => ACCEPTED_TYPES.has(file.type) || isHeic(file) || isSvgFile(file));
		setSkippedCount(allFiles.length - acceptedFiles.length);
		const newItems: ImageItem[] = acceptedFiles.map((file) => ({
			id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
			file,
			previewUrl: trackUrl(URL.createObjectURL(file)),
			status: 'pending' as const,
		}));
		setItems((prev) => [...prev, ...newItems]);

		// HEIC/HEIF: trình duyệt không hiển thị được <img> trực tiếp -> giải mã (tuần tự) để có preview thật.
		void (async () => {
			for (const item of newItems.filter((it) => isHeic(it.file))) {
				try {
					const decoded = await toDecodableBlob(item.file);
					// Item đã bị xoá trong lúc giải mã: bỏ.
					if (!itemsRef.current.some((it) => it.id === item.id)) continue;
					decodedBlobs.current.set(item.id, decoded);
					const decodedUrl = trackUrl(URL.createObjectURL(decoded));
					setItems((prev) =>
						prev.map((it) => {
							if (it.id !== item.id) return it;
							URL.revokeObjectURL(it.previewUrl);
							objectUrls.current.delete(it.previewUrl);
							return { ...it, previewUrl: decodedUrl };
						}),
					);
				} catch {
					/* giữ preview gốc; lỗi sẽ báo khi bấm Convert */
				}
			}
		})();
	}, []);

	const handleRemove = useCallback((id: string) => {
		const removed = itemsRef.current.find((item) => item.id === id);
		if (removed) revokeItemUrls(removed);
		setItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const handleClearAll = useCallback(() => {
		for (const item of itemsRef.current) revokeItemUrls(item);
		setItems([]);
		setSkippedCount(0);
	}, []);

	const settingsRef = useRef<ConvertSettings>({
		targetFormat,
		quality,
		backgroundColor: null,
		svgScale,
		pdfPageMode,
		pdfMarginMm,
	});
	settingsRef.current = {
		targetFormat,
		quality,
		maxDimension: resizeEnabled ? maxDimension : undefined,
		backgroundColor: bgMode === 'custom' && isHexColor(bgColor) ? bgColor : null,
		svgScale,
		pdfPageMode,
		pdfMarginMm,
	};

	const convertOne = useCallback(
		async (item: ImageItem, settings: ConvertSettings) => {
			setItems((prev) =>
				prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it)),
			);
			try {
				if (item.resultPreviewUrl) {
					URL.revokeObjectURL(item.resultPreviewUrl);
					objectUrls.current.delete(item.resultPreviewUrl);
				}
				const resultBlob = await convertImage(item.file, settings, decodedBlobs.current.get(item.id));
				const resultPreviewUrl = trackUrl(URL.createObjectURL(resultBlob));
				setItems((prev) =>
					prev.map((it) =>
						it.id === item.id
							? {
									...it,
									status: 'done',
									resultBlob,
									resultPreviewUrl,
									comparePosition: 50,
									resultFormat: settings.targetFormat,
									downloadName: replaceExtension(item.file.name, settings.targetFormat),
								}
							: it,
					),
				);
			} catch (err) {
				const errorMessage =
					err instanceof AvifUnsupportedError
						? messages.errorAvifUnsupported
						: err instanceof CanvasTooLargeError
							? messages.errorTooLarge
							: err instanceof SvgRasterError
								? messages.errorSvg
								: messages.errorGeneric;
				setItems((prev) =>
					prev.map((it) => (it.id === item.id ? { ...it, status: 'error', errorMessage } : it)),
				);
			}
		},
		[messages.errorAvifUnsupported, messages.errorTooLarge, messages.errorSvg, messages.errorGeneric],
	);

	const runQueue = useCallback(async (queue: ImageItem[]) => {
		if (queue.length === 0) return;
		// Snapshot setting tại thời điểm bấm.
		const settings = settingsRef.current;
		setIsProcessing(true);
		try {
			// Worker-pool pattern (same as Image Compressor's batch processing): a
			// fixed number of lanes each pull the next pending item off the shared
			// queue as soon as they finish their current one.
			let cursor = 0;
			const runLane = async (): Promise<void> => {
				const index = cursor++;
				if (index >= queue.length) return;
				await convertOne(queue[index], settings);
				return runLane();
			};
			await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, runLane));
		} finally {
			setIsProcessing(false);
		}
	}, [convertOne]);

	// Chỉ xử lý item đang chờ hoặc lỗi.
	const handleConvert = useCallback(
		() => runQueue(items.filter((item) => item.status === 'pending' || item.status === 'error')),
		[items, runQueue],
	);

	const handleDownload = useCallback(
		(item: ImageItem) => {
			if (!item.resultBlob) return;
			const url = URL.createObjectURL(item.resultBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = item.downloadName ?? replaceExtension(item.file.name, item.resultFormat ?? 'image/png');
			link.click();
			URL.revokeObjectURL(url);
		},
		[],
	);

	const handleDownloadAll = useCallback(async () => {
		const doneItems = items.filter((item) => item.status === 'done' && item.resultBlob);
		if (doneItems.length === 0) return;
		setIsZipping(true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			const usedNames = new Set<string>();
			for (const item of doneItems) {
				const name = dedupeName(
					item.downloadName ?? replaceExtension(item.file.name, item.resultFormat ?? 'image/png'),
					usedNames,
				);
				zip.file(name, item.resultBlob!);
			}
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'converted-images.zip';
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			setIsZipping(false);
		}
	}, [items]);

	const handleDownloadCombinedPdf = useCallback(async () => {
		const pdfs = items.filter((item) => item.status === 'done' && item.resultFormat === 'application/pdf' && item.resultBlob);
		if (pdfs.length === 0) return;
		setIsZipping(true);
		try {
			const merged = await mergePdfBlobs(pdfs.map((item) => item.resultBlob!));
			const url = URL.createObjectURL(merged);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'images.pdf';
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			setIsZipping(false);
		}
	}, [items]);

	// A previously converted/failed result no longer reflects the current
	// settings once format/quality/resize change — leaving it displayed as
	// "done" would show the before/after slider comparing against a stale
	// conversion (same bug fixed in Image Compressor for its "By quality" ->
	// "By target size" switch). Reverting those items to 'pending' keeps the
	// UI honest that nothing has been converted with the current settings yet.
	const settingsSignature = `${targetFormat}|${quality}|${resizeEnabled}|${maxDimension}|${bgMode}|${bgColor}|${svgScale}|${pdfPageMode}|${pdfMarginMm}`;
	const prevSettingsSignature = useRef(settingsSignature);
	useEffect(() => {
		if (prevSettingsSignature.current === settingsSignature) return;
		prevSettingsSignature.current = settingsSignature;
		setItems((prev) =>
			prev.map((item) => {
				if (item.status !== 'done' && item.status !== 'error') return item;
				if (item.resultPreviewUrl) {
					URL.revokeObjectURL(item.resultPreviewUrl);
					objectUrls.current.delete(item.resultPreviewUrl);
				}
				return {
					...item,
					status: 'pending',
					resultBlob: undefined,
					resultPreviewUrl: undefined,
					comparePosition: undefined,
					errorMessage: undefined,
				};
			}),
		);
	}, [settingsSignature]);

	const canConvert =
		!isProcessing && items.some((item) => item.status === 'pending' || item.status === 'error');
	const doneCount = items.filter((item) => item.status === 'done').length;
	// No byte-level progress source exists for canvas-based encoding (unlike
	// Image Compressor's onProgress hook), so the aggregate here only counts
	// fully settled items rather than interpolating an in-flight item's %.
	const settledCount = items.filter((item) => item.status === 'done' || item.status === 'error').length;
	const overallPercent = items.length > 0 ? Math.round((settledCount / items.length) * 100) : 0;

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
						id="image-converter-input"
						type="file"
						accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/svg+xml,.svg,image/heic,image/heif,.heic,.heif"
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

			<div className="flex flex-wrap items-center gap-3">
				<label htmlFor="image-converter-format" className="shrink-0 text-sm text-foreground">
					{messages.targetFormat}
				</label>
				<select
					id="image-converter-format"
					value={targetFormat}
					disabled={isProcessing}
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
					<option value="application/pdf">PDF</option>
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
							disabled={isProcessing}
							onChange={(event) => setQuality(Number(event.target.value))}
							className="w-48"
						/>
					</>
				)}
			</div>

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
					<div className="flex items-center gap-3">
						<label htmlFor="image-converter-max-dimension" className="shrink-0 text-sm text-foreground">
							{messages.maxDimensionLabel.replace('{{size}}', String(maxDimension))}
						</label>
						<input
							id="image-converter-max-dimension"
							type="range"
							min={MIN_MAX_DIMENSION}
							max={MAX_MAX_DIMENSION}
							step={32}
							value={maxDimension}
							disabled={isProcessing}
							onChange={(event) => setMaxDimension(Number(event.target.value))}
							className="w-48"
						/>
					</div>
				)}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<label htmlFor="image-converter-bg" className="shrink-0 text-sm text-foreground">
					{messages.backgroundLabel}
				</label>
				<select
					id="image-converter-bg"
					value={bgMode}
					disabled={isProcessing}
					onChange={(event) => setBgMode(event.target.value as 'auto' | 'custom')}
					className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
				>
					<option value="auto">{messages.backgroundAuto}</option>
					<option value="custom">{messages.backgroundCustom}</option>
				</select>
				{bgMode === 'custom' && (
					<input
						type="color"
						aria-label={messages.backgroundCustom}
						value={bgColor}
						disabled={isProcessing}
						onChange={(event) => setBgColor(event.target.value)}
						className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background"
					/>
				)}
			</div>

			{items.some((item) => isSvgFile(item.file)) && (
				<div className="flex flex-wrap items-center gap-3">
					<label htmlFor="image-converter-svg-scale" className="shrink-0 text-sm text-foreground">
						{messages.svgScaleLabel}
					</label>
					<select
						id="image-converter-svg-scale"
						value={svgScale}
						disabled={isProcessing}
						onChange={(event) => setSvgScale(Number(event.target.value))}
						className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
					>
						{[1, 2, 3, 4, 8].map((n) => (
							<option key={n} value={n}>
								{n}×
							</option>
						))}
					</select>
				</div>
			)}

			{targetFormat === 'application/pdf' && (
				<div className="flex flex-wrap items-center gap-3">
					<label htmlFor="image-converter-pdf-size" className="shrink-0 text-sm text-foreground">
						{messages.pdfPageSizeLabel}
					</label>
					<select
						id="image-converter-pdf-size"
						value={pdfPageMode}
						disabled={isProcessing}
						onChange={(event) => setPdfPageMode(event.target.value as PdfPageMode)}
						className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
					>
						<option value="a4">A4</option>
						<option value="letter">Letter</option>
						<option value="fit">{messages.pdfPageFit}</option>
					</select>
					<label htmlFor="image-converter-pdf-margin" className="shrink-0 text-sm text-foreground">
						{messages.pdfMarginLabel.replace('{{mm}}', String(pdfMarginMm))}
					</label>
					<input
						id="image-converter-pdf-margin"
						type="range"
						min={0}
						max={30}
						step={5}
						value={pdfMarginMm}
						disabled={isProcessing}
						onChange={(event) => setPdfMarginMm(Number(event.target.value))}
						className="w-40"
					/>
				</div>
			)}

			<p className="text-xs text-muted-foreground">{messages.formatsNote}</p>

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
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-2">
					{items.map((item) => (
						<li
							key={item.id}
							className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-2 text-sm"
						>
							{item.status === 'done' && item.resultPreviewUrl ? (
								<BeforeAfterSlider
									beforeSrc={item.previewUrl}
									beforeAlt={`${item.file.name} — ${messages.original}`}
									afterSrc={item.resultPreviewUrl}
									afterAlt={`${item.file.name} — ${messages.converted}`}
									value={item.comparePosition ?? 50}
									onValueChange={(comparePosition) =>
										setItems((prev) =>
											prev.map((it) => (it.id === item.id ? { ...it, comparePosition } : it)),
										)
									}
									className="size-16"
									label={`${messages.original} / ${messages.converted}`}
								/>
							) : (
								<img
									src={item.previewUrl}
									alt={`${item.file.name} — ${messages.original}`}
									className="size-16 shrink-0 rounded-md border border-border object-cover"
								/>
							)}
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate text-foreground">{item.file.name}</span>
								<span className="text-muted-foreground">
									{messages.original}: {formatBytes(item.file.size)} ({item.file.type || '—'})
									{item.status === 'done' && item.resultBlob && (
										<>
											{' '}
											→ {messages.converted}: {formatBytes(item.resultBlob.size)} ({item.resultFormat ?? targetFormat})
										</>
									)}
									{item.status === 'error' && (
										<span role="alert" className="text-destructive"> {item.errorMessage ?? messages.errorGeneric}</span>
									)}
								</span>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{item.status === 'done' && item.resultBlob && (
									<Button type="button" size="sm" onClick={() => handleDownload(item)}>
										{messages.download}
									</Button>
								)}
								{item.status === 'error' && (
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => void runQueue([item])}
										disabled={isProcessing}
									>
										{messages.retry}
									</Button>
								)}
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => handleRemove(item.id)}
									disabled={item.status === 'processing' || isProcessing}
									aria-label={`${messages.remove} ${item.file.name}`}
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
				{doneCount > 1 && (
					<Button type="button" variant="secondary" onClick={handleDownloadAll} disabled={isZipping}>
						{messages.downloadAll}
					</Button>
				)}
				{doneCount > 1 && targetFormat === 'application/pdf' && (
					<Button type="button" variant="secondary" onClick={handleDownloadCombinedPdf} disabled={isZipping}>
						{messages.downloadCombinedPdf}
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
