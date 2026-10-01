// Pure color helpers shared by the Color Picker and QR Generator.

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export interface Hsl {
	h: number;
	s: number;
	l: number;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex: string): Rgb | null {
	const trimmed = hex.trim();
	const match6 = /^#?([0-9a-f]{6})$/i.exec(trimmed);
	if (match6) {
		const int = parseInt(match6[1], 16);
		return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
	}
	const match3 = /^#?([0-9a-f]{3})$/i.exec(trimmed);
	if (match3) {
		const expanded = match3[1]
			.split('')
			.map((c) => c + c)
			.join('');
		const int = parseInt(expanded, 16);
		return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
	}
	return null;
}

export function isHex6(value: string): boolean {
	return /^#?[0-9a-f]{6}$/i.test(value.trim());
}

export function isHex3(value: string): boolean {
	return /^#?[0-9a-f]{3}$/i.test(value.trim());
}

/** True while `value` could still become a valid hex by typing more characters. */
export function isPartialHex(value: string): boolean {
	return /^#?[0-9a-f]{0,6}$/i.test(value.trim());
}

export function rgbToHex({ r, g, b }: Rgb): string {
	const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb, previous?: Hsl): Hsl {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	if (max === min) {
		// Achromatic: hue is undefined — keep the previous one so dragging through
		// black/white/gray does not snap the hue slider back to 0.
		return { h: previous?.h ?? 0, s: 0, l: Math.round(l * 100) };
	}
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
	else if (max === gn) h = ((bn - rn) / d + 2) * 60;
	else h = ((rn - gn) / d + 4) * 60;
	return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
	const hn = ((h % 360) + 360) % 360;
	const sn = clamp(s, 0, 100) / 100;
	const ln = clamp(l, 0, 100) / 100;
	if (sn === 0) {
		const v = Math.round(ln * 255);
		return { r: v, g: v, b: v };
	}
	const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
	const p = 2 * ln - q;
	const hueToRgb = (t: number) => {
		let tt = t;
		if (tt < 0) tt += 1;
		if (tt > 1) tt -= 1;
		if (tt < 1 / 6) return p + (q - p) * 6 * tt;
		if (tt < 1 / 2) return q;
		if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
		return p;
	};
	const hk = hn / 360;
	return {
		r: Math.round(hueToRgb(hk + 1 / 3) * 255),
		g: Math.round(hueToRgb(hk) * 255),
		b: Math.round(hueToRgb(hk - 1 / 3) * 255),
	};
}

export function relativeLuminance({ r, g, b }: Rgb): number {
	const channel = (c: number) => {
		const cs = c / 255;
		return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Picks white or black text, whichever has the higher real WCAG contrast on `bg`. */
export function bestTextColor(bg: Rgb): '#ffffff' | '#000000' {
	return contrastRatio(bg, WHITE) >= contrastRatio(bg, BLACK) ? '#ffffff' : '#000000';
}

interface ColorBox {
	pixels: Rgb[];
}

function boxChannelRange(box: ColorBox): { channel: keyof Rgb; range: number } {
	let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
	for (const p of box.pixels) {
		if (p.r < minR) minR = p.r;
		if (p.r > maxR) maxR = p.r;
		if (p.g < minG) minG = p.g;
		if (p.g > maxG) maxG = p.g;
		if (p.b < minB) minB = p.b;
		if (p.b > maxB) maxB = p.b;
	}
	const rangeR = maxR - minR;
	const rangeG = maxG - minG;
	const rangeB = maxB - minB;
	if (rangeR >= rangeG && rangeR >= rangeB) return { channel: 'r', range: rangeR };
	if (rangeG >= rangeB) return { channel: 'g', range: rangeG };
	return { channel: 'b', range: rangeB };
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
	const { channel } = boxChannelRange(box);
	const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
	const mid = Math.floor(sorted.length / 2);
	return [{ pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) }];
}

/**
 * Median-cut quantization. Boxes whose pixels are all one color (range 0) are
 * never split, so an image with only 2 distinct colors yields 2 swatches
 * instead of 5 near-duplicates. The result is also de-duplicated by hex.
 */
export function medianCutQuantize(pixels: Rgb[], colorCount: number): Rgb[] {
	if (pixels.length === 0) return [];
	const boxes: ColorBox[] = [{ pixels }];
	while (boxes.length < colorCount) {
		let splitIndex = -1;
		let largestRange = 0;
		boxes.forEach((box, i) => {
			if (box.pixels.length < 2) return;
			const { range } = boxChannelRange(box);
			if (range > largestRange) {
				largestRange = range;
				splitIndex = i;
			}
		});
		if (splitIndex === -1) break;
		const [a, b] = splitBox(boxes[splitIndex]);
		boxes.splice(splitIndex, 1, a, b);
	}
	const seen = new Set<string>();
	const result: Rgb[] = [];
	for (const box of boxes) {
		const n = box.pixels.length;
		if (n === 0) continue;
		const sum = box.pixels.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
		const rgb = { r: Math.round(sum.r / n), g: Math.round(sum.g / n), b: Math.round(sum.b / n) };
		const key = rgbToHex(rgb);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(rgb);
	}
	return result;
}

export interface SavedPalette {
	id: string;
	colors: string[];
}

/** Validates data read from localStorage: keeps only palettes made of valid hex strings, drops empty ones. */
export function sanitizeSavedPalettes(parsed: unknown): SavedPalette[] {
	if (!Array.isArray(parsed)) return [];
	const out: SavedPalette[] = [];
	for (const entry of parsed) {
		if (typeof entry?.id !== 'string' || !Array.isArray(entry?.colors)) continue;
		const colors = (entry.colors as unknown[]).filter((c): c is string => typeof c === 'string' && isHex6(c) && c.startsWith('#'));
		if (colors.length === 0) continue;
		out.push({ id: entry.id, colors: colors.map((c) => c.toLowerCase()) });
	}
	return out;
}

export function samePalette(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());
}
