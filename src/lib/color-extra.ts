// Extra colour maths for the Color Picker: more colour models, colour-blindness simulation,
// Tailwind-style shade scales, APCA contrast and palette share links. Pure, no DOM.

import { clamp, hexToRgb, isHex6, rgbToHex, type Rgb } from './color-utils';

// ---------------------------------------------------------------------------
// sRGB <-> linear
// ---------------------------------------------------------------------------

export function srgbToLinear(c255: number): number {
	const c = c255 / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb255(l: number): number {
	const v = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
	return clamp(Math.round(v * 255), 0, 255);
}

// ---------------------------------------------------------------------------
// HSB/HSV, HWB, CMYK
// ---------------------------------------------------------------------------

export interface Hsv {
	h: number;
	s: number;
	v: number;
}

function hueOf({ r, g, b }: Rgb): number {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const d = max - min;
	if (d === 0) return 0;
	let h: number;
	if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
	else if (max === gn) h = ((bn - rn) / d + 2) * 60;
	else h = ((rn - gn) / d + 4) * 60;
	return h % 360;
}

/** HSB/HSV with h in degrees and s/v in percent (rounded). */
export function rgbToHsv(rgb: Rgb): Hsv {
	const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
	const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
	const s = max === 0 ? 0 : (max - min) / max;
	return { h: Math.round(hueOf(rgb)), s: Math.round(s * 100), v: Math.round(max * 100) };
}

export interface Hwb {
	h: number;
	w: number;
	b: number;
}

/** HWB: whiteness = min channel, blackness = 1 - max channel (percent, rounded). */
export function rgbToHwb(rgb: Rgb): Hwb {
	const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
	const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
	return { h: Math.round(hueOf(rgb)), w: Math.round(min * 100), b: Math.round((1 - max) * 100) };
}

export interface Cmyk {
	c: number;
	m: number;
	y: number;
	k: number;
}

/** Naive (device-independent) RGB -> CMYK, percent rounded. Not ICC-managed. */
export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const k = 1 - Math.max(rn, gn, bn);
	if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
	return {
		c: Math.round(((1 - rn - k) / (1 - k)) * 100),
		m: Math.round(((1 - gn - k) / (1 - k)) * 100),
		y: Math.round(((1 - bn - k) / (1 - k)) * 100),
		k: Math.round(k * 100),
	};
}

// ---------------------------------------------------------------------------
// OKLab / OKLCH (Björn Ottosson, 2020)
// ---------------------------------------------------------------------------

export interface Oklab {
	L: number;
	a: number;
	b: number;
}

export interface Oklch {
	L: number;
	C: number;
	h: number;
}

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
	const lr = srgbToLinear(r);
	const lg = srgbToLinear(g);
	const lb = srgbToLinear(b);
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return {
		L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	};
}

/** Returns linear-light RGB (possibly outside 0..1 when the colour is out of the sRGB gamut). */
export function oklabToLinearRgb({ L, a, b }: Oklab): [number, number, number] {
	const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
	const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
	const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
}

export function oklabToOklch({ L, a, b }: Oklab): Oklch {
	const C = Math.sqrt(a * a + b * b);
	let h = (Math.atan2(b, a) * 180) / Math.PI;
	if (h < 0) h += 360;
	return { L, C, h: C < 1e-4 ? 0 : h };
}

export function oklchToOklab({ L, C, h }: Oklch): Oklab {
	const rad = (h * Math.PI) / 180;
	return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function rgbToOklch(rgb: Rgb): Oklch {
	return oklabToOklch(rgbToOklab(rgb));
}

const IN_GAMUT_EPS = 0.0005;

function inGamut(lin: [number, number, number]): boolean {
	return lin.every((v) => v >= -IN_GAMUT_EPS && v <= 1 + IN_GAMUT_EPS);
}

/** OKLCH -> sRGB; when out of gamut, chroma is reduced (binary search) until it fits. */
export function oklchToRgb(lch: Oklch): Rgb {
	let lin = oklabToLinearRgb(oklchToOklab(lch));
	if (!inGamut(lin)) {
		let lo = 0;
		let hi = lch.C;
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			if (inGamut(oklabToLinearRgb(oklchToOklab({ ...lch, C: mid })))) lo = mid;
			else hi = mid;
		}
		lin = oklabToLinearRgb(oklchToOklab({ ...lch, C: lo }));
	}
	return { r: linearToSrgb255(lin[0]), g: linearToSrgb255(lin[1]), b: linearToSrgb255(lin[2]) };
}

function trim(n: number, digits: number): string {
	return String(Number(n.toFixed(digits)));
}

export function formatOklch(rgb: Rgb): string {
	const { L, C, h } = rgbToOklch(rgb);
	return `oklch(${trim(L * 100, 2)}% ${trim(C, 4)} ${trim(h, 2)})`;
}

export function formatOklab(rgb: Rgb): string {
	const { L, a, b } = rgbToOklab(rgb);
	return `oklab(${trim(L * 100, 2)}% ${trim(a, 4)} ${trim(b, 4)})`;
}

export function formatHsv(rgb: Rgb): string {
	const { h, s, v } = rgbToHsv(rgb);
	return `hsb(${h}, ${s}%, ${v}%)`;
}

export function formatHwb(rgb: Rgb): string {
	const { h, w, b } = rgbToHwb(rgb);
	return `hwb(${h} ${w}% ${b}%)`;
}

export function formatCmyk(rgb: Rgb): string {
	const { c, m, y, k } = rgbToCmyk(rgb);
	return `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`;
}

// ---------------------------------------------------------------------------
// Colour-vision deficiency simulation (Machado, Oliveira & Fernandes 2009, severity 1.0)
// ---------------------------------------------------------------------------

export type VisionType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export const VISION_TYPES: VisionType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

const MACHADO: Record<Exclude<VisionType, 'achromatopsia'>, Matrix3> = {
	protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
	deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
	tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

/** Simulates how `rgb` appears with the given deficiency (operates on linear RGB, then re-encodes to sRGB). */
export function simulateVision(rgb: Rgb, type: VisionType): Rgb {
	const lr = srgbToLinear(rgb.r);
	const lg = srgbToLinear(rgb.g);
	const lb = srgbToLinear(rgb.b);
	if (type === 'achromatopsia') {
		const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
		const v = linearToSrgb255(y);
		return { r: v, g: v, b: v };
	}
	const m = MACHADO[type];
	const out = (i: number) => clamp(m[i] * lr + m[i + 1] * lg + m[i + 2] * lb, 0, 1);
	return { r: linearToSrgb255(out(0)), g: linearToSrgb255(out(3)), b: linearToSrgb255(out(6)) };
}

// ---------------------------------------------------------------------------
// Shade scale (Tailwind-style 50..950)
// ---------------------------------------------------------------------------

export const SHADE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Lightness targets taken from the Tailwind v4 palette; chroma follows a bell curve so tints and
// deep shades are less saturated than the middle of the scale.
const SHADE_LIGHTNESS = [0.97, 0.932, 0.882, 0.809, 0.707, 0.623, 0.546, 0.488, 0.424, 0.379, 0.282];
const SHADE_CHROMA_FACTOR = [0.12, 0.28, 0.5, 0.75, 0.92, 1, 0.97, 0.87, 0.74, 0.62, 0.42];

export interface Shade {
	step: number;
	hex: string;
}

/**
 * 11-step scale in OKLCH around the base hue. The step whose lightness is closest to the base is
 * replaced by the exact base colour, so the user's colour is always in the scale.
 */
export function generateShadeScale(base: Rgb): Shade[] {
	const { L: baseL, C, h } = rgbToOklch(base);
	let closest = 0;
	let best = Infinity;
	SHADE_LIGHTNESS.forEach((l, i) => {
		const d = Math.abs(l - baseL);
		if (d < best) {
			best = d;
			closest = i;
		}
	});
	// Peak chroma is assumed at the base's own step so the scale stays proportional to it.
	const baseFactor = SHADE_CHROMA_FACTOR[closest] || 1;
	return SHADE_STEPS.map((step, i) => {
		if (i === closest) return { step, hex: rgbToHex(base) };
		const rgb = oklchToRgb({ L: SHADE_LIGHTNESS[i], C: (C / baseFactor) * SHADE_CHROMA_FACTOR[i], h });
		return { step, hex: rgbToHex(rgb) };
	});
}

export function shadeScaleToCss(shades: Shade[], name = 'color'): string {
	return [':root {', ...shades.map((s) => `  --${name}-${s.step}: ${s.hex};`), '}'].join('\n');
}

export function shadeScaleToJson(shades: Shade[]): string {
	return JSON.stringify(Object.fromEntries(shades.map((s) => [String(s.step), s.hex])), null, 2);
}

export function shadeScaleToTailwind(shades: Shade[], name = 'primary'): string {
	return [`'${name}': {`, ...shades.map((s) => `  ${s.step}: '${s.hex}',`), '},'].join('\n');
}

// ---------------------------------------------------------------------------
// APCA (SAPC-8, 0.0.98G-4g constants) – returns Lc, positive for dark-on-light, negative for light-on-dark
// ---------------------------------------------------------------------------

function apcaLuminance({ r, g, b }: Rgb): number {
	const c = (v: number) => Math.pow(v / 255, 2.4);
	return 0.2126729 * c(r) + 0.7151522 * c(g) + 0.072175 * c(b);
}

export function apcaContrast(text: Rgb, background: Rgb): number {
	const blkThrs = 0.022;
	const blkClmp = 1.414;
	let yTxt = apcaLuminance(text);
	let yBg = apcaLuminance(background);
	if (yTxt < blkThrs) yTxt += Math.pow(blkThrs - yTxt, blkClmp);
	if (yBg < blkThrs) yBg += Math.pow(blkThrs - yBg, blkClmp);
	if (Math.abs(yBg - yTxt) < 0.0005) return 0;
	let out: number;
	if (yBg > yTxt) {
		const sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
		out = sapc < 0.1 ? 0 : sapc - 0.027;
	} else {
		const sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
		out = sapc > -0.1 ? 0 : sapc + 0.027;
	}
	return out * 100;
}

export interface WcagLevels {
	aaNormal: boolean;
	aaLarge: boolean;
	aaaNormal: boolean;
	aaaLarge: boolean;
}

export function wcagLevels(ratio: number): WcagLevels {
	return { aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

// ---------------------------------------------------------------------------
// Share links: palette <-> URL hash ("#p=3b82f6-ef4444-...")
// ---------------------------------------------------------------------------

export const MAX_SHARED_COLORS = 12;

export function encodePaletteHash(hexes: string[]): string {
	const clean = hexes.filter((h) => isHex6(h)).map((h) => h.replace('#', '').toLowerCase());
	return clean.length ? `#p=${clean.slice(0, MAX_SHARED_COLORS).join('-')}` : '';
}

/** Parses "#p=aabbcc-ddeeff"; returns '#rrggbb' strings, or null if absent/invalid. */
export function decodePaletteHash(hash: string): string[] | null {
	const m = /^#?p=([0-9a-fA-F-]+)$/.exec(hash.trim());
	if (!m) return null;
	const parts = m[1].split('-').filter(Boolean);
	if (parts.length === 0 || parts.length > MAX_SHARED_COLORS) return null;
	if (!parts.every((p) => /^[0-9a-f]{6}$/i.test(p))) return null;
	return parts.map((p) => `#${p.toLowerCase()}`);
}

export function hexToRgbOrBlack(hex: string): Rgb {
	return hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
}
