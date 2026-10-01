import { describe, it, expect } from 'vitest';
import { parseRanges, everyNRanges, combineRotation, isPasswordError, RangeParseError } from '../pdf-utils';
import { dedupeName, computeReduction, baseNameOf } from '../file-utils';

describe('parseRanges', () => {
	it('chấp nhận khoảng trắng quanh dấu gạch', () => {
		expect(parseRanges('1 - 3, 5', 9)).toEqual([
			{ start: 1, end: 3 },
			{ start: 5, end: 5 },
		]);
	});
	it('rỗng = từng trang', () => {
		expect(parseRanges('', 3).length).toBe(3);
	});
	it('báo lỗi khi vượt số trang hoặc sai định dạng', () => {
		expect(() => parseRanges('1-10', 5)).toThrow(RangeParseError);
		expect(() => parseRanges('a', 5)).toThrow(RangeParseError);
		expect(() => parseRanges('3-1', 5)).toThrow(RangeParseError);
	});
});

describe('everyNRanges / rotation / password', () => {
	it('chia theo N', () => {
		expect(everyNRanges(2, 5)).toEqual([
			{ start: 1, end: 2 },
			{ start: 3, end: 4 },
			{ start: 5, end: 5 },
		]);
	});
	it('cộng với /Rotate gốc', () => {
		expect(combineRotation(90, 90)).toBe(180);
		expect(combineRotation(270, 180)).toBe(90);
		expect(combineRotation(0, 0)).toBe(0);
		expect(combineRotation(-90, 0)).toBe(270);
	});
	it('nhận diện lỗi mật khẩu', () => {
		expect(isPasswordError({ name: 'PasswordException' })).toBe(true);
		expect(isPasswordError(new Error('Input document is encrypted'))).toBe(true);
		expect(isPasswordError(new Error('boom'))).toBe(false);
	});
});

describe('file-utils', () => {
	it('dedupeName không phân biệt hoa thường', () => {
		const used = new Set<string>();
		expect(dedupeName('a.png', used)).toBe('a.png');
		expect(dedupeName('A.PNG', used)).toBe('A-1.PNG');
		expect(dedupeName('a.png', used)).toBe('a-2.png');
	});
	it('computeReduction không âm / NaN', () => {
		expect(computeReduction(100, 150)).toEqual({ savedBytes: 0, percent: 0 });
		expect(computeReduction(0, 0)).toEqual({ savedBytes: 0, percent: 0 });
		expect(computeReduction(1000, 250)).toEqual({ savedBytes: 750, percent: 75 });
	});
	it('baseNameOf', () => {
		expect(baseNameOf('video.final.mp4')).toBe('video.final');
		expect(baseNameOf('.mp4', 'x')).toBe('.mp4');
		expect(baseNameOf('', 'x')).toBe('x');
	});
});
