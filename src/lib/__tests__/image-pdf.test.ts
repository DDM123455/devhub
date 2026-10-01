import { describe, expect, it } from 'vitest';
import {
	computePdfPlacement,
	isHexColor,
	isSvgFile,
	mmToPt,
	parseSvgIntrinsicSize,
	prepareSvgForRaster,
} from '../image-pdf';

describe('computePdfPlacement', () => {
	it('fit: trang bằng ảnh (px*0.75) cộng lề', () => {
		const p = computePdfPlacement(400, 200, 'fit', 0);
		expect(p.pageWidth).toBeCloseTo(300);
		expect(p.pageHeight).toBeCloseTo(150);
		expect(p.x).toBe(0);
		const withMargin = computePdfPlacement(400, 200, 'fit', 10);
		expect(withMargin.pageWidth).toBeCloseTo(300 + 2 * mmToPt(10));
		expect(withMargin.x).toBeCloseTo(mmToPt(10));
	});
	it('a4: ảnh ngang tự xoay trang ngang và căn giữa', () => {
		const p = computePdfPlacement(2000, 1000, 'a4', 0);
		expect(p.pageWidth).toBeGreaterThan(p.pageHeight);
		expect(p.width / p.height).toBeCloseTo(2);
		expect(p.x + p.width / 2).toBeCloseTo(p.pageWidth / 2);
		expect(p.y + p.height / 2).toBeCloseTo(p.pageHeight / 2);
	});
	it('letter portrait: ảnh nằm trong lề', () => {
		const p = computePdfPlacement(1000, 3000, 'letter', 20, 'portrait');
		expect(p.pageWidth).toBe(612);
		expect(p.x).toBeGreaterThanOrEqual(mmToPt(20) - 0.01);
		expect(p.y).toBeGreaterThanOrEqual(mmToPt(20) - 0.01);
	});
	it('orientation ép ngang dù ảnh dọc', () => {
		const p = computePdfPlacement(100, 300, 'a4', 0, 'landscape');
		expect(p.pageWidth).toBeGreaterThan(p.pageHeight);
	});
	it('lề quá lớn không làm kích thước âm', () => {
		const p = computePdfPlacement(100, 100, 'a4', 500);
		expect(p.width).toBeGreaterThan(0);
		expect(p.height).toBeGreaterThan(0);
	});
});

describe('parseSvgIntrinsicSize', () => {
	it('đọc width/height px', () => {
		expect(parseSvgIntrinsicSize('<svg width="120" height="60"></svg>')).toEqual({ width: 120, height: 60 });
	});
	it('đổi đơn vị', () => {
		const s = parseSvgIntrinsicSize('<svg width="1in" height="2in"></svg>')!;
		expect(s.width).toBeCloseTo(96);
		expect(s.height).toBeCloseTo(192);
	});
	it('dùng viewBox khi thiếu width/height', () => {
		expect(parseSvgIntrinsicSize('<svg viewBox="0 0 24 12"></svg>')).toEqual({ width: 24, height: 12 });
	});
	it('chỉ có width -> suy height theo viewBox', () => {
		expect(parseSvgIntrinsicSize('<svg width="100" viewBox="0 0 10 5"></svg>')).toEqual({ width: 100, height: 50 });
	});
	it('% không xác định -> dùng viewBox, hoặc null', () => {
		expect(parseSvgIntrinsicSize('<svg width="100%" height="100%" viewBox="0 0 8 4"></svg>')).toEqual({ width: 8, height: 4 });
		expect(parseSvgIntrinsicSize('<svg width="100%" height="100%"></svg>')).toBeNull();
		expect(parseSvgIntrinsicSize('not svg')).toBeNull();
	});
});

describe('prepareSvgForRaster', () => {
	it('nhân scale và đặt width/height tường minh, giữ nội dung', () => {
		const r = prepareSvgForRaster('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5" viewBox="0 0 10 5"><rect/></svg>', 4);
		expect(r.width).toBe(40);
		expect(r.height).toBe(20);
		expect(r.text).toContain('width="40"');
		expect(r.text).toContain('height="20"');
		expect(r.text).toContain('<rect/>');
		expect(r.text.match(/width=/g)!.length).toBe(1);
	});
	it('thêm viewBox + xmlns khi thiếu', () => {
		const r = prepareSvgForRaster('<svg width="10" height="10"><rect/></svg>', 2);
		expect(r.text).toContain('viewBox="0 0 10 10"');
		expect(r.text).toContain('xmlns="http://www.w3.org/2000/svg"');
	});
	it('dùng kích thước dự phòng khi không suy ra được', () => {
		const r = prepareSvgForRaster('<svg></svg>', 1);
		expect(r.width).toBe(512);
	});
});

describe('misc', () => {
	it('isSvgFile', () => {
		expect(isSvgFile({ name: 'a.SVG', type: '' })).toBe(true);
		expect(isSvgFile({ name: 'a', type: 'image/svg+xml' })).toBe(true);
		expect(isSvgFile({ name: 'a.png', type: 'image/png' })).toBe(false);
	});
	it('isHexColor', () => {
		expect(isHexColor('#fff')).toBe(true);
		expect(isHexColor('#12ab9f')).toBe(true);
		expect(isHexColor('red')).toBe(false);
	});
});
