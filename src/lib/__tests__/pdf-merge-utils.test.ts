import { describe, expect, it } from 'vitest';
import {
	computePageNumberPlacement,
	isMergeImageFile,
	isPdfFile,
	readJpegOrientation,
	sortPageGroups,
	type MergeFileMeta,
} from '../pdf-merge-utils';

const meta = new Map<string, MergeFileMeta>([
	['a', { name: 'file10.pdf', lastModified: 300 }],
	['b', { name: 'file2.pdf', lastModified: 100 }],
	['c', { name: 'File1.pdf', lastModified: 200 }],
]);
const pages = [
	{ id: 1, fileId: 'a', kind: 'pdf' as const },
	{ id: 2, fileId: 'a', kind: 'pdf' as const },
	{ id: 3, fileId: 'blank-1', kind: 'blank' as const },
	{ id: 4, fileId: 'b', kind: 'image' as const },
	{ id: 5, fileId: 'c', kind: 'pdf' as const },
];

describe('sortPageGroups', () => {
	it('tên A→Z tự nhiên, giữ thứ tự trong file, trang trắng đi theo nhóm trước nó', () => {
		const ids = sortPageGroups(pages, meta, 'name-asc').map((p) => p.id);
		expect(ids).toEqual([5, 4, 1, 2, 3]);
	});
	it('tên Z→A', () => {
		expect(sortPageGroups(pages, meta, 'name-desc').map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
	});
	it('ngày sửa tăng/giảm', () => {
		expect(sortPageGroups(pages, meta, 'date-asc').map((p) => p.id)).toEqual([4, 5, 1, 2, 3]);
		expect(sortPageGroups(pages, meta, 'date-desc').map((p) => p.id)).toEqual([1, 2, 3, 5, 4]);
	});
	it('trang trắng đứng đầu giữ ở đầu', () => {
		const list = [{ id: 0, fileId: 'blank-0', kind: 'blank' as const }, ...pages];
		expect(sortPageGroups(list, meta, 'name-asc')[0].id).toBe(0);
	});
});

describe('computePageNumberPlacement', () => {
	it('rotation 0: giữa mép dưới', () => {
		const p = computePageNumberPlacement(600, 800, 0, 20);
		expect(p).toEqual({ x: 290, y: 18, rotate: 0 });
	});
	it('chuẩn hoá góc âm / 360', () => {
		expect(computePageNumberPlacement(600, 800, 360, 0).rotate).toBe(0);
		expect(computePageNumberPlacement(600, 800, -90, 0).rotate).toBe(270);
	});
	it('rotation 90 ở mép phải, 270 ở mép trái, 180 ở mép trên', () => {
		expect(computePageNumberPlacement(600, 800, 90, 20).x).toBe(582);
		expect(computePageNumberPlacement(600, 800, 270, 20).x).toBe(18);
		expect(computePageNumberPlacement(600, 800, 180, 20).y).toBe(782);
	});
});

describe('file type helpers', () => {
	it('isPdfFile / isMergeImageFile', () => {
		expect(isPdfFile({ name: 'A.PDF', type: '' })).toBe(true);
		expect(isMergeImageFile({ name: 'x.webp', type: '' })).toBe(true);
		expect(isMergeImageFile({ name: 'x.svg', type: 'image/svg+xml' })).toBe(false);
	});
});

describe('readJpegOrientation', () => {
	function jpegWithOrientation(value: number, little: boolean): Uint8Array {
		const tiff: number[] = little
			? [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, value, 0, 0, 0, 0, 0, 0, 0]
			: [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0, 0, 0, 0, 0];
		const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
		const len = exif.length + 2;
		return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...exif, 0xff, 0xd9]);
	}
	it('đọc little- và big-endian', () => {
		expect(readJpegOrientation(jpegWithOrientation(6, true))).toBe(6);
		expect(readJpegOrientation(jpegWithOrientation(3, false))).toBe(3);
	});
	it('không phải JPEG / không có EXIF -> 1', () => {
		expect(readJpegOrientation(new Uint8Array([1, 2, 3, 4]))).toBe(1);
		expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(1);
	});
});
