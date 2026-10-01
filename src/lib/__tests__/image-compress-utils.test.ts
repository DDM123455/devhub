import { describe, expect, it } from 'vitest';
import {
	fitWithin,
	inputMimeOf,
	isAcceptedCompressInput,
	isHeicLike,
	resolveOutputFormat,
	searchQualityForTarget,
} from '../image-compress-utils';

describe('input helpers', () => {
	it('nhận HEIC theo đuôi khi type rỗng', () => {
		const f = { name: 'IMG_1.HEIC', type: '' };
		expect(isHeicLike(f)).toBe(true);
		expect(isAcceptedCompressInput(f)).toBe(true);
		expect(inputMimeOf(f)).toBe('image/heic');
	});
	it('từ chối SVG/PDF', () => {
		expect(isAcceptedCompressInput({ name: 'a.svg', type: 'image/svg+xml' })).toBe(false);
		expect(isAcceptedCompressInput({ name: 'a.pdf', type: 'application/pdf' })).toBe(false);
	});
});

describe('resolveOutputFormat', () => {
	it('original giữ JPEG/PNG/WebP', () => {
		expect(resolveOutputFormat({ name: 'a.png', type: 'image/png' }, 'original')).toBe('image/png');
		expect(resolveOutputFormat({ name: 'a.jpg', type: '' }, 'original')).toBe('image/jpeg');
		expect(resolveOutputFormat({ name: 'a.webp', type: 'image/webp' }, 'original')).toBe('image/webp');
	});
	it('GIF/BMP -> PNG, HEIC/AVIF -> JPEG', () => {
		expect(resolveOutputFormat({ name: 'a.gif', type: 'image/gif' }, 'original')).toBe('image/png');
		expect(resolveOutputFormat({ name: 'a.bmp', type: 'image/bmp' }, 'original')).toBe('image/png');
		expect(resolveOutputFormat({ name: 'a.heic', type: '' }, 'original')).toBe('image/jpeg');
		expect(resolveOutputFormat({ name: 'a.avif', type: 'image/avif' }, 'original')).toBe('image/jpeg');
	});
	it('chọn định dạng cụ thể thì dùng đúng định dạng đó', () => {
		expect(resolveOutputFormat({ name: 'a.png', type: 'image/png' }, 'image/webp')).toBe('image/webp');
	});
});

describe('searchQualityForTarget', () => {
	// Kích thước tăng tuyến tính theo quality: size = q * 1000.
	const measure = async (q: number) => q * 1000;
	it('tìm quality cao nhất đạt mục tiêu', async () => {
		const r = await searchQualityForTarget(measure, 60_500);
		expect(r).toEqual({ quality: 60, size: 60_000, met: true });
	});
	it('mục tiêu lớn hơn mức tối đa -> dùng max', async () => {
		const r = await searchQualityForTarget(measure, 10_000_000);
		expect(r.quality).toBe(95);
		expect(r.met).toBe(true);
	});
	it('không đạt được kể cả quality thấp nhất -> met=false ở min', async () => {
		const r = await searchQualityForTarget(measure, 1000);
		expect(r).toEqual({ quality: 10, size: 10_000, met: false });
	});
	it('số lần đo nhỏ (nhị phân)', async () => {
		let calls = 0;
		await searchQualityForTarget(async (q) => (calls++, q * 1000), 50_000);
		expect(calls).toBeLessThanOrEqual(10);
	});
});

describe('fitWithin', () => {
	it('không phóng to', () => {
		expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 });
		expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
	});
	it('thu theo cạnh dài', () => {
		expect(fitWithin(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
	});
});
