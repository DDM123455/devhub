import { describe, expect, it } from 'vitest';
import {
	bestTextColor,
	contrastRatio,
	hexToRgb,
	hslToRgb,
	isHex3,
	isPartialHex,
	medianCutQuantize,
	rgbToHex,
	rgbToHsl,
	sanitizeSavedPalettes,
} from '../color-utils';

describe('rgbToHsl hue preservation', () => {
	it('keeps the previous hue for achromatic colors', () => {
		const prev = { h: 217, s: 91, l: 60 };
		expect(rgbToHsl({ r: 0, g: 0, b: 0 }, prev)).toEqual({ h: 217, s: 0, l: 0 });
		expect(rgbToHsl({ r: 255, g: 255, b: 255 }, prev).h).toBe(217);
	});
	it('round-trips a saturated color', () => {
		const rgb = { r: 59, g: 130, b: 246 };
		const hsl = rgbToHsl(rgb);
		const back = hslToRgb(hsl);
		expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(3);
	});
});

describe('hex helpers', () => {
	it('treats 3-digit prefixes as partial, not final', () => {
		expect(isHex3('#abc')).toBe(true);
		expect(isPartialHex('#ab')).toBe(true);
		expect(isPartialHex('#abcdefg')).toBe(false);
		expect(rgbToHex(hexToRgb('#abc')!)).toBe('#aabbcc');
	});
});

describe('bestTextColor', () => {
	it('chooses by real contrast, not a 0.4 luminance cutoff', () => {
		// Mid-gray #777: white 4.48 vs black 4.69 -> black wins.
		const mid = hexToRgb('#777777')!;
		expect(contrastRatio(mid, { r: 0, g: 0, b: 0 })).toBeGreaterThan(contrastRatio(mid, { r: 255, g: 255, b: 255 }));
		expect(bestTextColor(mid)).toBe('#000000');
		expect(bestTextColor(hexToRgb('#1e3a8a')!)).toBe('#ffffff');
		expect(bestTextColor(hexToRgb('#fde047')!)).toBe('#000000');
	});
});

describe('medianCutQuantize', () => {
	it('does not create duplicate swatches for few-color images', () => {
		const pixels = [
			...Array(10).fill({ r: 255, g: 0, b: 0 }),
			...Array(10).fill({ r: 0, g: 0, b: 255 }),
		];
		const out = medianCutQuantize(pixels, 5);
		expect(out.length).toBe(2);
		expect(new Set(out.map(rgbToHex)).size).toBe(out.length);
	});
	it('returns empty for no pixels', () => {
		expect(medianCutQuantize([], 5)).toEqual([]);
	});
});

describe('sanitizeSavedPalettes', () => {
	it('filters empty/invalid palettes and bad colors', () => {
		const out = sanitizeSavedPalettes([
			{ id: '1', colors: ['#aabbcc', 'red', 'url(x)'] },
			{ id: '2', colors: [] },
			{ id: 3, colors: ['#000000'] },
			null,
		]);
		expect(out).toEqual([{ id: '1', colors: ['#aabbcc'] }]);
		expect(sanitizeSavedPalettes('nope')).toEqual([]);
	});
});
