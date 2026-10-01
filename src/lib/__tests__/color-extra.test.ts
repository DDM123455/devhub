import { describe, expect, it } from 'vitest';
import {
	apcaContrast,
	decodePaletteHash,
	encodePaletteHash,
	formatCmyk,
	formatHsv,
	formatHwb,
	formatOklab,
	formatOklch,
	generateShadeScale,
	oklchToRgb,
	rgbToCmyk,
	rgbToHsv,
	rgbToHwb,
	rgbToOklab,
	rgbToOklch,
	shadeScaleToCss,
	shadeScaleToJson,
	shadeScaleToTailwind,
	simulateVision,
	wcagLevels,
} from '../color-extra';
import { rgbToHex } from '../color-utils';

describe('colour models', () => {
	it('HSV / HWB / CMYK of known colours', () => {
		expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
		expect(rgbToHsv({ r: 59, g: 130, b: 246 })).toEqual({ h: 217, s: 76, v: 96 });
		expect(rgbToHwb({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, w: 0, b: 0 });
		expect(rgbToHwb({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, w: 50, b: 50 });
		expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
		expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
		expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0, k: 0 });
		expect(formatCmyk({ r: 255, g: 0, b: 0 })).toBe('cmyk(0%, 100%, 100%, 0%)');
		expect(formatHsv({ r: 255, g: 0, b: 0 })).toBe('hsb(0, 100%, 100%)');
		expect(formatHwb({ r: 255, g: 0, b: 0 })).toBe('hwb(0 0% 0%)');
	});

	it('OKLab/OKLCH reference values', () => {
		const white = rgbToOklab({ r: 255, g: 255, b: 255 });
		expect(white.L).toBeCloseTo(1, 3);
		expect(Math.abs(white.a)).toBeLessThan(1e-3);
		const red = rgbToOklch({ r: 255, g: 0, b: 0 });
		expect(red.L).toBeCloseTo(0.628, 3);
		expect(red.C).toBeCloseTo(0.2577, 3);
		expect(red.h).toBeCloseTo(29.23, 1);
		expect(formatOklch({ r: 255, g: 0, b: 0 })).toBe('oklch(62.8% 0.2577 29.23)');
		expect(formatOklab({ r: 0, g: 0, b: 0 })).toBe('oklab(0% 0 0)');
	});

	it('OKLCH round-trips in gamut and clamps out of gamut', () => {
		for (const rgb of [
			{ r: 59, g: 130, b: 246 },
			{ r: 12, g: 200, b: 90 },
			{ r: 250, g: 250, b: 10 },
		]) {
			expect(oklchToRgb(rgbToOklch(rgb))).toEqual(rgb);
		}
		const rgb = oklchToRgb({ L: 0.7, C: 0.5, h: 150 });
		for (const v of [rgb.r, rgb.g, rgb.b]) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(255);
		}
	});
});

describe('vision simulation', () => {
	it('keeps neutral greys unchanged (Machado rows sum to 1)', () => {
		for (const type of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
			const out = simulateVision({ r: 128, g: 128, b: 128 }, type);
			expect(Math.abs(out.r - 128)).toBeLessThanOrEqual(2);
			expect(Math.abs(out.g - 128)).toBeLessThanOrEqual(2);
			expect(Math.abs(out.b - 128)).toBeLessThanOrEqual(2);
		}
	});
	it('red shifts toward dark yellow-ish for protanopia, and achromatopsia is grey', () => {
		const p = simulateVision({ r: 255, g: 0, b: 0 }, 'protanopia');
		expect(p.r).toBeGreaterThan(p.b);
		expect(p.r).toBeLessThan(120);
		const a = simulateVision({ r: 255, g: 0, b: 0 }, 'achromatopsia');
		expect(a.r).toBe(a.g);
		expect(a.g).toBe(a.b);
	});
});

describe('shade scale', () => {
	it('has 11 steps and contains the base colour', () => {
		const base = { r: 59, g: 130, b: 246 };
		const scale = generateShadeScale(base);
		expect(scale.map((s) => s.step)).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
		expect(scale.some((s) => s.hex === rgbToHex(base))).toBe(true);
	});
	it('goes from light to dark', () => {
		const scale = generateShadeScale({ r: 59, g: 130, b: 246 });
		const lightness = scale.map((s) => {
			const h = s.hex;
			return rgbToOklab({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }).L;
		});
		for (let i = 1; i < lightness.length; i++) expect(lightness[i]).toBeLessThan(lightness[i - 1] + 0.02);
		expect(lightness[0]).toBeGreaterThan(0.9);
		expect(lightness[10]).toBeLessThan(0.35);
	});
	it('exports css / json / tailwind', () => {
		const scale = generateShadeScale({ r: 59, g: 130, b: 246 });
		expect(shadeScaleToCss(scale, 'brand')).toContain('--brand-500:');
		expect(JSON.parse(shadeScaleToJson(scale))['950']).toMatch(/^#[0-9a-f]{6}$/);
		expect(shadeScaleToTailwind(scale, 'brand')).toContain("'brand': {");
	});
});

describe('contrast', () => {
	it('APCA matches reference values for black/white', () => {
		expect(apcaContrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(106, 0);
		expect(apcaContrast({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(-108, 0);
		expect(apcaContrast({ r: 10, g: 10, b: 10 }, { r: 10, g: 10, b: 10 })).toBe(0);
	});
	it('WCAG levels', () => {
		expect(wcagLevels(7.1)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: true, aaaLarge: true });
		expect(wcagLevels(3.2)).toEqual({ aaNormal: false, aaLarge: true, aaaNormal: false, aaaLarge: false });
	});
});

describe('share hash', () => {
	it('round-trips', () => {
		const hash = encodePaletteHash(['#3B82F6', '#ef4444']);
		expect(hash).toBe('#p=3b82f6-ef4444');
		expect(decodePaletteHash(hash)).toEqual(['#3b82f6', '#ef4444']);
	});
	it('rejects junk', () => {
		expect(decodePaletteHash('')).toBeNull();
		expect(decodePaletteHash('#p=zzzzzz')).toBeNull();
		expect(decodePaletteHash('#p=abc')).toBeNull();
		expect(decodePaletteHash('#q=3b82f6')).toBeNull();
		expect(encodePaletteHash(['nope'])).toBe('');
	});
});
