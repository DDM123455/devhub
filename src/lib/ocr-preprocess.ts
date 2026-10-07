// Tiền xử lý ảnh cho OCR — phần thuần (tham số + thao tác trên mảng RGBA), không DOM.
// Phần vẽ canvas nằm ở ocr-image.ts.

export type BinarizeMode = 'off' | 'otsu' | 'adaptive' | 'fixed';
export type Rotation = 0 | 90 | 180 | 270;

export interface PreprocessOptions {
	grayscale: boolean;
	/** -100..100 (0 = giữ nguyên). */
	contrast: number;
	binarize: BinarizeMode;
	/** Ngưỡng 0..255 cho chế độ 'fixed'. */
	threshold: number;
	invert: boolean;
	rotation: Rotation;
	/** Phóng to ảnh nhỏ (tối đa 3 lần) để chữ đủ lớn cho OCR. */
	upscaleSmall: boolean;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = {
	grayscale: false,
	contrast: 0,
	binarize: 'off',
	threshold: 128,
	invert: false,
	rotation: 0,
	upscaleSmall: true,
};

/** Cạnh dài tối đa (px) trước khi OCR — lớn hơn sẽ bị thu nhỏ để tiết kiệm bộ nhớ/thời gian. */
export const MAX_OCR_SIDE = 3000;
/** Ảnh có cạnh dài dưới mức này được coi là "nhỏ" và phóng to khi bật upscaleSmall. */
export const SMALL_IMAGE_SIDE = 1000;
const UPSCALE_TARGET_SIDE = 1500;
const MAX_UPSCALE = 3;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function normalizeRotation(degrees: number): Rotation {
	const n = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
	return n as Rotation;
}

export function rotateBy(current: Rotation, delta: 90 | -90): Rotation {
	return normalizeRotation(current + delta);
}

/** Kích thước sau khi xoay (90/270 đổi chỗ rộng-cao). */
export function rotatedSize(width: number, height: number, rotation: Rotation): { width: number; height: number } {
	return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Hệ số tỉ lệ để đưa ảnh vào khoảng OCR hợp lý: thu nhỏ khi quá lớn, phóng to (tối đa 3x) khi quá nhỏ. */
export function planScale(width: number, height: number, upscaleSmall: boolean, maxSide = MAX_OCR_SIDE): number {
	const longSide = Math.max(width, height);
	if (!(longSide > 0)) return 1;
	if (longSide > maxSide) return maxSide / longSide;
	if (upscaleSmall && longSide < SMALL_IMAGE_SIDE) return Math.min(MAX_UPSCALE, UPSCALE_TARGET_SIDE / longSide);
	return 1;
}

/** Kích thước đích (làm tròn, tối thiểu 1px) sau khi xoay + đổi tỉ lệ. */
export function planTargetSize(
	width: number,
	height: number,
	options: Pick<PreprocessOptions, 'rotation' | 'upscaleSmall'>,
	maxSide = MAX_OCR_SIDE,
): { width: number; height: number; scale: number } {
	const rotated = rotatedSize(width, height, options.rotation);
	const scale = planScale(rotated.width, rotated.height, options.upscaleSmall, maxSide);
	return {
		width: Math.max(1, Math.round(rotated.width * scale)),
		height: Math.max(1, Math.round(rotated.height * scale)),
		scale,
	};
}

/** Có cần bước xử lý điểm ảnh (getImageData) không. */
export function needsPixelPass(options: PreprocessOptions): boolean {
	return options.grayscale || options.contrast !== 0 || options.binarize !== 'off' || options.invert;
}

export function contrastFactor(contrast: number): number {
	const c = clamp(contrast, -100, 100) * 2.55;
	return (259 * (c + 255)) / (255 * (259 - c));
}

/** Ngưỡng Otsu từ histogram 256 phần tử. */
export function otsuThreshold(histogram: ArrayLike<number>): number {
	let total = 0;
	let sumAll = 0;
	for (let i = 0; i < 256; i++) {
		total += histogram[i];
		sumAll += i * histogram[i];
	}
	if (total === 0) return 128;
	let sumBackground = 0;
	let weightBackground = 0;
	let best = 0;
	let bestVariance = -1;
	for (let t = 0; t < 256; t++) {
		weightBackground += histogram[t];
		if (weightBackground === 0) continue;
		const weightForeground = total - weightBackground;
		if (weightForeground === 0) break;
		sumBackground += t * histogram[t];
		const meanBackground = sumBackground / weightBackground;
		const meanForeground = (sumAll - sumBackground) / weightForeground;
		const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
		if (variance > bestVariance) {
			bestVariance = variance;
			best = t;
		}
	}
	return best;
}

/**
 * Ngưỡng thích ứng kiểu Bradley-Roth bằng ảnh tích phân: điểm là "đen" nếu tối hơn ~15% so với
 * trung bình cục bộ. Hợp với ảnh chụp tài liệu bị đổ bóng/sáng không đều. Ghi trực tiếp 0/255 vào `gray`.
 */
export function adaptiveThresholdInPlace(gray: Uint8ClampedArray, width: number, height: number, bias = 0.15): void {
	let windowSize = Math.round(Math.min(width, height) / 16);
	windowSize = Math.max(15, windowSize | 1);
	const half = windowSize >> 1;
	const stride = width + 1;
	const integral = new Float64Array(stride * (height + 1));
	for (let y = 0; y < height; y++) {
		let rowSum = 0;
		for (let x = 0; x < width; x++) {
			rowSum += gray[y * width + x];
			integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
		}
	}
	const out = new Uint8ClampedArray(gray.length);
	for (let y = 0; y < height; y++) {
		const y0 = Math.max(0, y - half);
		const y1 = Math.min(height - 1, y + half);
		for (let x = 0; x < width; x++) {
			const x0 = Math.max(0, x - half);
			const x1 = Math.min(width - 1, x + half);
			const count = (x1 - x0 + 1) * (y1 - y0 + 1);
			const sum =
				integral[(y1 + 1) * stride + (x1 + 1)] -
				integral[y0 * stride + (x1 + 1)] -
				integral[(y1 + 1) * stride + x0] +
				integral[y0 * stride + x0];
			out[y * width + x] = gray[y * width + x] * count <= sum * (1 - bias) ? 0 : 255;
		}
	}
	gray.set(out);
}

/** Xử lý tại chỗ mảng RGBA: tương phản → thang xám → nhị phân hoá → đảo màu. */
export function applyPixelPipeline(data: Uint8ClampedArray, width: number, height: number, options: PreprocessOptions): void {
	const pixelCount = width * height;
	if (options.contrast !== 0) {
		const factor = contrastFactor(options.contrast);
		for (let i = 0; i < pixelCount; i++) {
			const o = i * 4;
			data[o] = factor * (data[o] - 128) + 128;
			data[o + 1] = factor * (data[o + 1] - 128) + 128;
			data[o + 2] = factor * (data[o + 2] - 128) + 128;
		}
	}
	const wantGray = options.grayscale || options.binarize !== 'off';
	if (wantGray) {
		const gray = new Uint8ClampedArray(pixelCount);
		const histogram = new Uint32Array(256);
		for (let i = 0; i < pixelCount; i++) {
			const o = i * 4;
			// Ảnh trong suốt (PNG) coi như nền trắng để chữ đen không bị "mất" thành đen trên đen.
			const alpha = data[o + 3] / 255;
			const r = data[o] * alpha + 255 * (1 - alpha);
			const g = data[o + 1] * alpha + 255 * (1 - alpha);
			const b = data[o + 2] * alpha + 255 * (1 - alpha);
			const value = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
			gray[i] = value;
			histogram[gray[i]]++;
		}
		if (options.binarize === 'otsu' || options.binarize === 'fixed') {
			const threshold = options.binarize === 'otsu' ? otsuThreshold(histogram) : clamp(Math.round(options.threshold), 0, 255);
			for (let i = 0; i < pixelCount; i++) gray[i] = gray[i] > threshold ? 255 : 0;
		} else if (options.binarize === 'adaptive') {
			adaptiveThresholdInPlace(gray, width, height);
		}
		for (let i = 0; i < pixelCount; i++) {
			const o = i * 4;
			data[o] = data[o + 1] = data[o + 2] = gray[i];
			data[o + 3] = 255;
		}
	}
	if (options.invert) {
		for (let i = 0; i < pixelCount; i++) {
			const o = i * 4;
			data[o] = 255 - data[o];
			data[o + 1] = 255 - data[o + 1];
			data[o + 2] = 255 - data[o + 2];
		}
	}
}
