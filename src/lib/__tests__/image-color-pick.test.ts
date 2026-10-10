import { describe, expect, it } from 'vitest';
import { fitDimensions, pointerToPixel, pushPicked, sampleColor, type PixelBuffer } from '../image-color-pick';

function buffer(width: number, height: number, pixels: Array<[number, number, number, number]>): PixelBuffer {
	const data = new Uint8ClampedArray(width * height * 4);
	pixels.forEach((p, i) => data.set(p, i * 4));
	return { data, width, height };
}

describe('sampleColor', () => {
	const red: [number, number, number, number] = [255, 0, 0, 255];
	const blue: [number, number, number, number] = [0, 0, 255, 255];
	const clear: [number, number, number, number] = [0, 0, 0, 0];

	it('reads a single pixel exactly', () => {
		const b = buffer(2, 1, [red, blue]);
		expect(sampleColor(b, 0, 0, 1)?.rgb).toEqual({ r: 255, g: 0, b: 0 });
		expect(sampleColor(b, 1, 0, 1)?.rgb).toEqual({ r: 0, g: 0, b: 255 });
	});

	it('averages a neighbourhood and clips at the image edge', () => {
		const b = buffer(2, 1, [red, blue]);
		// 3x3 around (0,0) only covers the two real pixels.
		expect(sampleColor(b, 0, 0, 3)?.rgb).toEqual({ r: 128, g: 0, b: 128 });
	});

	it('skips fully transparent pixels and returns null when nothing is drawn', () => {
		expect(sampleColor(buffer(2, 1, [clear, red]), 0, 0, 3)?.rgb).toEqual({ r: 255, g: 0, b: 0 });
		expect(sampleColor(buffer(1, 1, [clear]), 0, 0, 1)).toBeNull();
	});

	it('clamps out-of-range coordinates instead of throwing', () => {
		const b = buffer(2, 1, [red, blue]);
		expect(sampleColor(b, 99, 99, 1)?.rgb).toEqual({ r: 0, g: 0, b: 255 });
		expect(sampleColor(b, -5, -5, 1)?.rgb).toEqual({ r: 255, g: 0, b: 0 });
	});

	it('reports the average opacity', () => {
		const half: [number, number, number, number] = [10, 20, 30, 128];
		expect(sampleColor(buffer(1, 1, [half]), 0, 0, 1)?.alpha).toBeCloseTo(0.5, 1);
	});
});

describe('pointerToPixel', () => {
	const rect = { left: 100, top: 50, width: 200, height: 100 };
	it('maps display coordinates to image pixels', () => {
		expect(pointerToPixel(100, 50, rect, { width: 400, height: 200 })).toEqual({ x: 0, y: 0 });
		expect(pointerToPixel(299, 149, rect, { width: 400, height: 200 })).toEqual({ x: 398, y: 198 });
		expect(pointerToPixel(200, 100, rect, { width: 400, height: 200 })).toEqual({ x: 200, y: 100 });
	});
	it('returns null outside the element', () => {
		expect(pointerToPixel(99, 60, rect, { width: 400, height: 200 })).toBeNull();
		expect(pointerToPixel(300, 60, rect, { width: 400, height: 200 })).toBeNull();
		expect(pointerToPixel(150, 150, rect, { width: 400, height: 200 })).toBeNull();
	});
	it('returns null for a zero-sized element', () => {
		expect(pointerToPixel(0, 0, { left: 0, top: 0, width: 0, height: 0 }, { width: 10, height: 10 })).toBeNull();
	});
});

describe('fitDimensions', () => {
	it('keeps images that already fit', () => {
		expect(fitDimensions(800, 600)).toEqual({ width: 800, height: 600 });
	});
	it('scales oversized images down proportionally', () => {
		expect(fitDimensions(8192, 4096)).toEqual({ width: 4096, height: 2048 });
		expect(fitDimensions(100, 9000, 4500)).toEqual({ width: 50, height: 4500 });
	});
});

describe('pushPicked', () => {
	it('appends newest last and ignores an immediate repeat', () => {
		expect(pushPicked(['#111111'], '#222222')).toEqual(['#111111', '#222222']);
		expect(pushPicked(['#111111'], '#111111')).toEqual(['#111111']);
	});
	it('moves a repeated colour to the end and caps the list', () => {
		expect(pushPicked(['#111111', '#222222'], '#111111')).toEqual(['#222222', '#111111']);
		const long = Array.from({ length: 24 }, (_, i) => `#${String(i).padStart(6, '0')}`);
		const next = pushPicked(long, '#ffffff');
		expect(next).toHaveLength(24);
		expect(next[next.length - 1]).toBe('#ffffff');
		expect(next[0]).toBe('#000001');
	});
});
