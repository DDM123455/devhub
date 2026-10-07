// Phần trình duyệt của công cụ Ảnh sang văn bản: giải mã ảnh/PDF thành canvas, tiền xử lý.
// Mọi thứ chạy cục bộ trong trình duyệt — ảnh không bao giờ rời máy người dùng.
// Logic tính toán thuần nằm ở ocr-preprocess.ts (có test).

import { isHeicLike } from './image-compress-utils';
import {
	applyPixelPipeline,
	MAX_OCR_SIDE,
	needsPixelPass,
	planTargetSize,
	type PreprocessOptions,
} from './ocr-preprocess';

/** Ảnh quá lớn (megapixel) bị từ chối trước khi giải mã để tránh treo/hết bộ nhớ trình duyệt. */
export const MAX_IMAGE_PIXELS = 120_000_000;
/** Dung lượng file ảnh tối đa. */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
/** Dung lượng file PDF tối đa. */
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
/** Cạnh dài (px) khi render trang PDF — khoảng 200 DPI cho khổ A4, đủ cho OCR. */
export const PDF_RENDER_LONG_SIDE = 2400;

export type OcrImageErrorCode = 'decode' | 'tooLarge' | 'memory';

export class OcrImageError extends Error {
	code: OcrImageErrorCode;
	constructor(code: OcrImageErrorCode, message?: string) {
		super(message ?? code);
		this.name = 'OcrImageError';
		this.code = code;
	}
}

export interface OcrSource {
	source: CanvasImageSource;
	width: number;
	height: number;
	release(): void;
}

export function isPdfFile(file: { name: string; type: string }): boolean {
	return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImageFile(file: { name: string; type: string }): boolean {
	return /^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif|tiff?)$/.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(file.name);
}

async function decodeWithImageElement(blob: Blob): Promise<OcrSource> {
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.decoding = 'async';
		img.src = url;
		await img.decode();
		return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
	} finally {
		// Ảnh đã decode xong nên có thể thu hồi URL ngay.
		URL.revokeObjectURL(url);
	}
}

/** Giải mã 1 file ảnh (kể cả HEIC qua heic2any nạp lazy), tôn trọng hướng EXIF. */
export async function decodeImageFile(file: File): Promise<OcrSource> {
	if (file.size > MAX_IMAGE_BYTES) throw new OcrImageError('tooLarge');
	let blob: Blob = file;
	try {
		if (isHeicLike(file)) {
			const { default: heic2any } = await import('heic2any');
			const converted = await heic2any({ blob: file, toType: 'image/png' });
			blob = Array.isArray(converted) ? converted[0] : converted;
		}
		let result: OcrSource;
		try {
			const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
			result = { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
		} catch {
			result = await decodeWithImageElement(blob);
		}
		if (result.width * result.height > MAX_IMAGE_PIXELS) {
			result.release();
			throw new OcrImageError('tooLarge');
		}
		return result;
	} catch (error) {
		if (error instanceof OcrImageError) throw error;
		if (error instanceof RangeError || (error instanceof DOMException && error.name === 'QuotaExceededError')) {
			throw new OcrImageError('memory');
		}
		throw new OcrImageError('decode');
	}
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new OcrImageError('memory'))),
			type,
			quality,
		);
	});
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

export interface RenderedForOcr {
	/** Canvas gửi cho OCR (đã qua tiền xử lý điểm ảnh nếu có). */
	ocrCanvas: HTMLCanvasElement;
	/** Canvas màu đã xoay/đổi tỉ lệ (trước thang xám/nhị phân) — dùng để hiển thị và vẽ ô từ tin cậy thấp. */
	colorCanvas: HTMLCanvasElement;
}

/** Xoay + đổi tỉ lệ + (tuỳ chọn) xử lý điểm ảnh. Toạ độ từ OCR khớp với kích thước canvas trả về. */
export function renderForOcr(src: OcrSource, options: PreprocessOptions, maxSide = MAX_OCR_SIDE): RenderedForOcr {
	const target = planTargetSize(src.width, src.height, options, maxSide);
	let colorCanvas: HTMLCanvasElement;
	try {
		colorCanvas = createCanvas(target.width, target.height);
	} catch {
		throw new OcrImageError('memory');
	}
	const ctx = colorCanvas.getContext('2d');
	if (!ctx) throw new OcrImageError('memory');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, target.width, target.height);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.save();
	ctx.translate(target.width / 2, target.height / 2);
	ctx.rotate((options.rotation * Math.PI) / 180);
	const drawWidth = src.width * target.scale;
	const drawHeight = src.height * target.scale;
	ctx.drawImage(src.source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
	ctx.restore();

	if (!needsPixelPass(options)) return { ocrCanvas: colorCanvas, colorCanvas };

	const ocrCanvas = createCanvas(target.width, target.height);
	const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });
	if (!ocrCtx) throw new OcrImageError('memory');
	ocrCtx.drawImage(colorCanvas, 0, 0);
	let imageData: ImageData;
	try {
		imageData = ocrCtx.getImageData(0, 0, target.width, target.height);
	} catch {
		throw new OcrImageError('memory');
	}
	applyPixelPipeline(imageData.data, target.width, target.height, options);
	ocrCtx.putImageData(imageData, 0, 0);
	return { ocrCanvas, colorCanvas };
}

/** Ảnh JPEG nhỏ (cạnh dài ≤ maxSide) từ canvas — dùng làm ảnh đối chiếu cạnh văn bản. */
export async function makePreviewBlob(canvas: HTMLCanvasElement, maxSide = 1400): Promise<{ blob: Blob; width: number; height: number }> {
	const longSide = Math.max(canvas.width, canvas.height);
	const scale = longSide > maxSide ? maxSide / longSide : 1;
	const width = Math.max(1, Math.round(canvas.width * scale));
	const height = Math.max(1, Math.round(canvas.height * scale));
	const small = createCanvas(width, height);
	const ctx = small.getContext('2d');
	if (!ctx) throw new OcrImageError('memory');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(canvas, 0, 0, width, height);
	return { blob: await canvasToBlob(small, 'image/jpeg', 0.82), width, height };
}

// ---- PDF -------------------------------------------------------------------------------------

let pdfWorkerConfigured = false;

// pdfjs-dist 5.0.375 được ghim có chủ đích (xem ghi chú trong pdf-thumbnails.ts). Nạp động để
// không chạy khi Astro SSR và không nằm trong bundle ban đầu.
async function loadPdfJs() {
	const pdfjsLib = await import('pdfjs-dist');
	if (!pdfWorkerConfigured) {
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
		pdfWorkerConfigured = true;
	}
	return pdfjsLib;
}

export interface OcrPdfHandle {
	pageCount: number;
	renderPage(pageNumber: number, longSide?: number): Promise<OcrSource>;
	destroy(): void;
}

export async function openPdfForOcr(file: File): Promise<OcrPdfHandle> {
	if (file.size > MAX_PDF_BYTES) throw new OcrImageError('tooLarge');
	const pdfjsLib = await loadPdfJs();
	const data = new Uint8Array(await file.arrayBuffer());
	const task = pdfjsLib.getDocument({ data });
	let pdf;
	try {
		pdf = await task.promise;
	} catch {
		await task.destroy().catch(() => {});
		throw new OcrImageError('decode');
	}
	return {
		pageCount: pdf.numPages,
		async renderPage(pageNumber: number, longSide = PDF_RENDER_LONG_SIDE): Promise<OcrSource> {
			const page = await pdf.getPage(pageNumber);
			try {
				const base = page.getViewport({ scale: 1 });
				const scale = Math.min(6, Math.max(0.5, longSide / Math.max(base.width, base.height)));
				const viewport = page.getViewport({ scale });
				const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
				const canvasContext = canvas.getContext('2d');
				if (!canvasContext) throw new OcrImageError('memory');
				canvasContext.fillStyle = '#ffffff';
				canvasContext.fillRect(0, 0, canvas.width, canvas.height);
				await page.render({ canvasContext, viewport }).promise;
				return { source: canvas, width: canvas.width, height: canvas.height, release: () => {} };
			} finally {
				page.cleanup();
			}
		},
		destroy() {
			void task.destroy().catch(() => {});
		},
	};
}
