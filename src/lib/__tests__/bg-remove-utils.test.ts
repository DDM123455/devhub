import { describe, expect, it } from 'vitest';
import {
	blurDownscaleFactor,
	computeContainLayout,
	exportExtension,
	exportMime,
	gradientEndpoints,
	MARKETPLACE_PRESETS,
	needsFlatten,
	shadowParams,
} from '../bg-remove-utils';
import {
	brushRadiusInImage,
	EMPTY_HISTORY,
	pointerToImage,
	pushStroke,
	redoStroke,
	segmentBounds,
	shouldAddPoint,
	undoStroke,
	type Stroke,
} from '../mask-edit';

describe('computeContainLayout', () => {
	it('vật thể ngang vừa khung vuông, căn giữa, có lề', () => {
		const l = computeContainLayout(400, 200, 1000, 1000, 10);
		expect(l.dw).toBeCloseTo(800);
		expect(l.dh).toBeCloseTo(400);
		expect(l.dx).toBeCloseTo(100);
		expect(l.dy).toBeCloseTo(300);
	});
	it('cho phép phóng to; lề kẹp tối đa 40%', () => {
		const l = computeContainLayout(10, 10, 1000, 1000, 99);
		expect(l.dw).toBeCloseTo(200);
	});
});

describe('presets & helpers', () => {
	it('Amazon 2000x2000 nền trắng, Shopee 800x800', () => {
		expect(MARKETPLACE_PRESETS.find((p) => p.id === 'amazon')).toMatchObject({ width: 2000, height: 2000, recommendedBackground: '#FFFFFF' });
		expect(MARKETPLACE_PRESETS.find((p) => p.id === 'shopee')).toMatchObject({ width: 800, height: 800 });
	});
	it('gradientEndpoints', () => {
		expect(gradientEndpoints('vertical', 10, 20)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 20 });
		expect(gradientEndpoints('horizontal', 10, 20)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 0 });
		expect(gradientEndpoints('diagonal', 10, 20)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 20 });
	});
	it('blurDownscaleFactor tăng theo strength và bị kẹp theo kích thước', () => {
		expect(blurDownscaleFactor(10, 2000, 2000)).toBeGreaterThan(blurDownscaleFactor(2, 2000, 2000));
		expect(blurDownscaleFactor(30, 40, 40)).toBeLessThanOrEqual(5);
		expect(blurDownscaleFactor(30, 4, 4)).toBeGreaterThanOrEqual(1);
	});
	it('shadowParams theo % cạnh ngắn', () => {
		const s = shadowParams(5, 0.5, 1000, 2000);
		expect(s.blur).toBeCloseTo(50);
		expect(s.offsetY).toBeCloseTo(20);
		expect(s.color).toBe('rgba(0,0,0,0.5)');
	});
	it('export helpers', () => {
		expect(exportMime('jpg')).toBe('image/jpeg');
		expect(exportExtension('webp')).toBe('webp');
		expect(needsFlatten('jpg', true)).toBe(true);
		expect(needsFlatten('png', true)).toBe(false);
		expect(needsFlatten('jpg', false)).toBe(false);
	});
});

describe('mask-edit geometry', () => {
	it('pointerToImage quy đổi theo tỉ lệ hiển thị', () => {
		const p = pointerToImage(150, 60, { left: 100, top: 10, width: 200, height: 100 }, 2000, 1000);
		expect(p).toEqual({ x: 500, y: 500 });
	});
	it('segmentBounds kẹp trong ảnh', () => {
		const r = segmentBounds({ x: 5, y: 5 }, { x: 50, y: 10 }, 10, 100, 100);
		expect(r.x).toBe(0);
		expect(r.y).toBe(0);
		expect(r.x + r.width).toBeLessThanOrEqual(100);
		const far = segmentBounds({ x: 990, y: 990 }, { x: 999, y: 999 }, 20, 1000, 1000);
		expect(far.x + far.width).toBe(1000);
		expect(far.y + far.height).toBe(1000);
	});
	it('brushRadiusInImage theo tỉ lệ canvas', () => {
		expect(brushRadiusInImage(40, 2000, 500)).toBeCloseTo(80);
		expect(brushRadiusInImage(1, 100, 1000)).toBe(1);
	});
	it('shouldAddPoint', () => {
		expect(shouldAddPoint(undefined, { x: 0, y: 0 }, 2)).toBe(true);
		expect(shouldAddPoint({ x: 0, y: 0 }, { x: 1, y: 1 }, 2)).toBe(false);
		expect(shouldAddPoint({ x: 0, y: 0 }, { x: 3, y: 0 }, 2)).toBe(true);
	});
});

describe('mask history', () => {
	const s = (n: number): Stroke => ({ mode: 'erase', radius: n, points: [{ x: 0, y: 0 }] });
	it('push/undo/redo', () => {
		let h = pushStroke(EMPTY_HISTORY, s(1));
		h = pushStroke(h, s(2));
		expect(h.strokes.map((x) => x.radius)).toEqual([1, 2]);
		h = undoStroke(h);
		expect(h.strokes.map((x) => x.radius)).toEqual([1]);
		expect(h.redoStack.length).toBe(1);
		h = redoStroke(h);
		expect(h.strokes.map((x) => x.radius)).toEqual([1, 2]);
	});
	it('nét mới xoá redo; undo/redo khi rỗng không đổi', () => {
		let h = pushStroke(EMPTY_HISTORY, s(1));
		h = undoStroke(h);
		h = pushStroke(h, s(3));
		expect(h.redoStack).toEqual([]);
		expect(undoStroke(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
		expect(redoStroke(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
	});
	it('giới hạn số nét', () => {
		let h = EMPTY_HISTORY;
		for (let i = 0; i < 10; i++) h = pushStroke(h, s(i), 5);
		expect(h.strokes.length).toBe(5);
		expect(h.strokes[0].radius).toBe(5);
	});
});
