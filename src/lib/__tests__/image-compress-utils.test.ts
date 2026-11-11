import { describe, expect, it } from 'vitest';
import {
	fitWithin,
	inputMimeOf,
	isAnimatedGif,
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

describe('isAnimatedGif', () => {
	// GIF nhỏ dựng tay: header + Logical Screen Descriptor (không có Global Color Table),
	// rồi `frames` lần [Image Descriptor + LZW min code size + một sub-block rỗng].
	const gif = (frames: number, { withGct = false, extensionBefore = false } = {}) => {
		const bytes: number[] = [...'GIF89a'].map((c) => c.charCodeAt(0));
		bytes.push(1, 0, 1, 0, withGct ? 0x80 : 0x00, 0, 0);
		if (withGct) bytes.push(0, 0, 0, 255, 255, 255); // 2 màu × 3 byte
		for (let i = 0; i < frames; i++) {
			// Graphic Control Extension: phải bỏ qua được, không được đếm nhầm thành khung hình.
			if (extensionBefore) bytes.push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00);
			bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x00);
		}
		bytes.push(0x3b);
		return new Uint8Array(bytes);
	};

	it('GIF một khung -> không động', () => {
		expect(isAnimatedGif(gif(1))).toBe(false);
		expect(isAnimatedGif(gif(1, { withGct: true, extensionBefore: true }))).toBe(false);
	});
	it('GIF nhiều khung -> động', () => {
		expect(isAnimatedGif(gif(2))).toBe(true);
		expect(isAnimatedGif(gif(5, { withGct: true, extensionBefore: true }))).toBe(true);
	});
	it('không phải GIF -> false', () => {
		expect(isAnimatedGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
		expect(isAnimatedGif(new Uint8Array(0))).toBe(false);
	});
	it('file cụt không làm treo vòng lặp', () => {
		expect(isAnimatedGif(gif(2).subarray(0, 16))).toBe(false);
	});
});
