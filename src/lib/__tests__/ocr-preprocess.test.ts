import { describe, it, expect } from 'vitest';
import {
	adaptiveThresholdInPlace,
	applyPixelPipeline,
	contrastFactor,
	DEFAULT_PREPROCESS,
	MAX_OCR_SIDE,
	needsPixelPass,
	normalizeRotation,
	otsuThreshold,
	planScale,
	planTargetSize,
	rotateBy,
	rotatedSize,
	type PreprocessOptions,
} from '../ocr-preprocess';

const opts = (patch: Partial<PreprocessOptions>): PreprocessOptions => ({ ...DEFAULT_PREPROCESS, ...patch });

function rgba(values: number[][]): Uint8ClampedArray {
	return new Uint8ClampedArray(values.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));
}

describe('kích thước / xoay', () => {
	it('thu nhỏ ảnh quá lớn về cạnh dài tối đa', () => {
		expect(planScale(6000, 3000, false)).toBeCloseTo(MAX_OCR_SIDE / 6000);
		expect(planTargetSize(6000, 3000, { rotation: 0, upscaleSmall: false })).toMatchObject({ width: MAX_OCR_SIDE, height: 1500 });
	});
	it('phóng to ảnh nhỏ tối đa 3x và chỉ khi bật', () => {
		expect(planScale(200, 100, false)).toBe(1);
		expect(planScale(200, 100, true)).toBe(3);
		expect(planScale(750, 500, true)).toBeCloseTo(2);
		expect(planScale(1000, 800, true)).toBe(1);
	});
	it('xoay 90/270 đổi chỗ rộng-cao', () => {
		expect(rotatedSize(100, 50, 90)).toEqual({ width: 50, height: 100 });
		expect(rotatedSize(100, 50, 180)).toEqual({ width: 100, height: 50 });
		expect(planTargetSize(2000, 1000, { rotation: 270, upscaleSmall: false })).toMatchObject({ width: 1000, height: 2000 });
	});
	it('normalize/rotateBy', () => {
		expect(normalizeRotation(-90)).toBe(270);
		expect(normalizeRotation(450)).toBe(90);
		expect(rotateBy(270, 90)).toBe(0);
		expect(rotateBy(0, -90)).toBe(270);
	});
	it('kích thước đích không bao giờ 0', () => {
		const t = planTargetSize(1, 1, { rotation: 0, upscaleSmall: false });
		expect(t.width).toBe(1);
		expect(t.height).toBe(1);
	});
});

describe('điểm ảnh', () => {
	it('needsPixelPass', () => {
		expect(needsPixelPass(DEFAULT_PREPROCESS)).toBe(false);
		expect(needsPixelPass(opts({ grayscale: true }))).toBe(true);
		expect(needsPixelPass(opts({ contrast: 10 }))).toBe(true);
		expect(needsPixelPass(opts({ binarize: 'otsu' }))).toBe(true);
		expect(needsPixelPass(opts({ invert: true }))).toBe(true);
	});
	it('contrastFactor: 0 = 1, dương > 1, âm < 1', () => {
		expect(contrastFactor(0)).toBeCloseTo(1);
		expect(contrastFactor(50)).toBeGreaterThan(1);
		expect(contrastFactor(-50)).toBeLessThan(1);
	});
	it('otsu tách hai cụm', () => {
		const hist = new Array(256).fill(0);
		hist[20] = 500;
		hist[220] = 500;
		const t = otsuThreshold(hist);
		expect(t).toBeGreaterThanOrEqual(20);
		expect(t).toBeLessThan(220);
		expect(otsuThreshold(new Array(256).fill(0))).toBe(128);
	});
	it('thang xám', () => {
		const data = rgba([[255, 0, 0], [0, 255, 0]]);
		applyPixelPipeline(data, 2, 1, opts({ grayscale: true }));
		expect(data[0]).toBe(data[1]);
		expect(data[0]).toBe(data[2]);
		expect(data[0]).toBe(76); // 0.299*255
		expect(data[4]).toBe(150); // 0.587*255
	});
	it('nhị phân hoá cố định + đảo', () => {
		const data = rgba([[10, 10, 10], [200, 200, 200]]);
		applyPixelPipeline(data, 2, 1, opts({ binarize: 'fixed', threshold: 100 }));
		expect([data[0], data[4]]).toEqual([0, 255]);
		applyPixelPipeline(data, 2, 1, opts({ invert: true }));
		expect([data[0], data[4]]).toEqual([255, 0]);
	});
	it('otsu: nền sáng + chữ tối', () => {
		const pixels: number[][] = [];
		for (let i = 0; i < 100; i++) pixels.push(i % 10 === 0 ? [30, 30, 30] : [230, 230, 230]);
		const data = rgba(pixels);
		applyPixelPipeline(data, 100, 1, opts({ binarize: 'otsu' }));
		expect(data[0]).toBe(0);
		expect(data[4]).toBe(255);
	});
	it('PNG trong suốt coi như nền trắng', () => {
		const data = rgba([[0, 0, 0, 0]]);
		applyPixelPipeline(data, 1, 1, opts({ grayscale: true }));
		expect(data[0]).toBe(255);
	});
	it('tương phản cao đẩy sáng/tối ra xa', () => {
		const data = rgba([[100, 100, 100], [160, 160, 160]]);
		applyPixelPipeline(data, 2, 1, opts({ contrast: 80 }));
		expect(data[0]).toBeLessThan(100);
		expect(data[4]).toBeGreaterThan(160);
	});
	it('adaptive: chữ tối trên nền không đều vẫn ra đen', () => {
		const w = 64;
		const h = 64;
		const gray = new Uint8ClampedArray(w * h);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = 120 + x; // gradient sáng dần
		gray[32 * w + 10] = 20; // "chữ" tối ở vùng tối
		adaptiveThresholdInPlace(gray, w, h);
		expect(gray[32 * w + 10]).toBe(0);
		expect(gray[10 * w + 50]).toBe(255);
		expect(gray.every((v) => v === 0 || v === 255)).toBe(true);
	});
});
