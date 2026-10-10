import type { Rgb } from '@/lib/color-utils';

/** Longest side the image is decoded at; bigger images are downscaled to keep memory sane. */
export const MAX_PICK_DIMENSION = 4096;

export type SampleSize = 1 | 3 | 5 | 11;
export const SAMPLE_SIZES: SampleSize[] = [1, 3, 5, 11];

export interface PixelBuffer {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export function clampInt(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

/** Size an image is decoded at: unchanged when it already fits, otherwise scaled down proportionally. */
export function fitDimensions(width: number, height: number, max = MAX_PICK_DIMENSION): { width: number; height: number } {
	const longest = Math.max(width, height);
	if (longest <= max || longest <= 0) return { width: Math.max(1, width), height: Math.max(1, height) };
	const scale = max / longest;
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Colour at (x, y), averaged over a size x size square centred on it (clipped at the edges).
 * Fully transparent pixels are skipped, so a transparent PNG gives the colour of what is actually
 * drawn; returns null when every sampled pixel is transparent.
 */
export function sampleColor(buffer: PixelBuffer, x: number, y: number, size: SampleSize): { rgb: Rgb; alpha: number } | null {
	const { data, width, height } = buffer;
	if (width <= 0 || height <= 0) return null;
	const cx = clampInt(x, 0, width - 1);
	const cy = clampInt(y, 0, height - 1);
	const radius = (size - 1) / 2;
	let r = 0;
	let g = 0;
	let b = 0;
	let a = 0;
	let weight = 0;
	let count = 0;
	for (let py = Math.max(0, cy - radius); py <= Math.min(height - 1, cy + radius); py++) {
		for (let px = Math.max(0, cx - radius); px <= Math.min(width - 1, cx + radius); px++) {
			const i = (py * width + px) * 4;
			const alpha = data[i + 3];
			count++;
			a += alpha;
			if (alpha === 0) continue;
			// Weight by alpha so half-transparent edge pixels do not drag the colour as much as solid ones.
			r += data[i] * alpha;
			g += data[i + 1] * alpha;
			b += data[i + 2] * alpha;
			weight += alpha;
		}
	}
	if (weight === 0 || count === 0) return null;
	return {
		rgb: { r: Math.round(r / weight), g: Math.round(g / weight), b: Math.round(b / weight) },
		alpha: a / count / 255,
	};
}

/** Maps a pointer position inside a displayed element to the pixel it covers in the image. */
export function pointerToPixel(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number; width: number; height: number },
	image: { width: number; height: number },
): { x: number; y: number } | null {
	if (rect.width <= 0 || rect.height <= 0) return null;
	const fx = (clientX - rect.left) / rect.width;
	const fy = (clientY - rect.top) / rect.height;
	if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return null;
	return { x: clampInt(Math.floor(fx * image.width), 0, image.width - 1), y: clampInt(Math.floor(fy * image.height), 0, image.height - 1) };
}

/** Appends a picked colour to the history: no immediate duplicate, newest last, capped. */
export function pushPicked(list: string[], hex: string, limit = 24): string[] {
	const h = hex.toLowerCase();
	if (list[list.length - 1] === h) return list;
	const next = [...list.filter((c) => c !== h), h];
	return next.length > limit ? next.slice(next.length - limit) : next;
}
