import { describe, expect, it } from 'vitest';
import {
	applyNameTemplate,
	bookmarkGroups,
	parityIndexes,
	rangeLabel,
	sanitizeFileName,
	splitBySize,
} from '../pdf-split-utils';

// Mô phỏng: mỗi trang 100 byte + 50 byte overhead cho file.
const sizeOf = (sizes: number[]) => async (s: number, e: number) =>
	50 + sizes.slice(s, e).reduce((a, b) => a + b, 0);

describe('splitBySize', () => {
	it('gom tối đa trang trong giới hạn', async () => {
		const groups = await splitBySize(10, sizeOf(Array(10).fill(100)), 350);
		expect(groups.map((g) => [g.start, g.end])).toEqual([
			[0, 3],
			[3, 6],
			[6, 9],
			[9, 10],
		]);
		expect(groups.every((g) => !g.oversize)).toBe(true);
	});
	it('một trang vượt giới hạn -> file riêng, oversize', async () => {
		const groups = await splitBySize(4, sizeOf([100, 1000, 100, 100]), 400);
		expect(groups).toEqual([
			{ start: 0, end: 1, oversize: false },
			{ start: 1, end: 2, oversize: true },
			{ start: 2, end: 4, oversize: false },
		]);
	});
	it('toàn bộ vừa -> 1 nhóm', async () => {
		const groups = await splitBySize(5, sizeOf(Array(5).fill(10)), 10_000);
		expect(groups).toEqual([{ start: 0, end: 5, oversize: false }]);
	});
	it('0 trang -> rỗng', async () => {
		expect(await splitBySize(0, sizeOf([]), 100)).toEqual([]);
	});
});

describe('bookmarkGroups', () => {
	it('chia theo bookmark, thêm đoạn đầu nếu bookmark đầu không ở trang 1', () => {
		const g = bookmarkGroups(
			[
				{ title: 'B', pageIndex: 4 },
				{ title: 'A', pageIndex: 2 },
			],
			10,
			'front',
		);
		expect(g).toEqual([
			{ start: 0, end: 1, title: 'front' },
			{ start: 2, end: 3, title: 'A' },
			{ start: 4, end: 9, title: 'B' },
		]);
	});
	it('bỏ trùng trang và đích ngoài phạm vi', () => {
		const g = bookmarkGroups(
			[
				{ title: 'A', pageIndex: 0 },
				{ title: 'A2', pageIndex: 0 },
				{ title: 'X', pageIndex: 99 },
			],
			3,
		);
		expect(g).toEqual([{ start: 0, end: 2, title: 'A' }]);
	});
	it('không có bookmark -> rỗng', () => {
		expect(bookmarkGroups([], 5)).toEqual([]);
	});
});

describe('name template', () => {
	const vars = { name: 'report', n: 2, range: '3-5', title: 'Chapter: 1/2' };
	it('thay token và thêm .pdf', () => {
		expect(applyNameTemplate('{name}_{n}_{range}', vars)).toBe('report_2_3-5.pdf');
	});
	it('làm sạch ký tự cấm trong title', () => {
		expect(applyNameTemplate('{title}', vars)).toBe('Chapter 1 2.pdf');
	});
	it('không nhân đôi đuôi .pdf, mẫu rỗng -> null', () => {
		expect(applyNameTemplate('x{n}.PDF', vars)).toBe('x2.pdf');
		expect(applyNameTemplate('  ', vars)).toBeNull();
	});
	it('rỗng sau làm sạch -> dự phòng', () => {
		expect(applyNameTemplate('{title}', { ...vars, title: '///' })).toBe('part-2.pdf');
		expect(sanitizeFileName('..', 'f')).toBe('f');
	});
	it('rangeLabel', () => {
		expect(rangeLabel(2, 2)).toBe('2');
		expect(rangeLabel(2, 4)).toBe('2-4');
	});
});

describe('parityIndexes', () => {
	it('lẻ = trang 1,3,5 (index 0,2,4); chẵn = 2,4 (index 1,3)', () => {
		expect(parityIndexes(5, 'odd')).toEqual([0, 2, 4]);
		expect(parityIndexes(5, 'even')).toEqual([1, 3]);
	});
});
