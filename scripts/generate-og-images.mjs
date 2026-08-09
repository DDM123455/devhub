// One-off asset generator, NOT wired into `npm run build` — og:image content
// never changes per-build (no dynamic/user data involved), so there's no
// reason to pay a native-binary rasterization step on every deploy. Run this
// manually (`node scripts/generate-og-images.mjs`) whenever the design needs
// to change, then commit the resulting PNGs under `public/og/`.
//
// @resvg/resvg-js was added as a devDependency specifically for this script
// (confirmed with the project owner before adding — see PROGRESS.md 2026-08-09
// entry) since the project has no other server-side raster image renderer and
// social platforms (notably Facebook/Twitter) don't reliably render SVG
// og:image content, only real PNG/JPEG.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og');
mkdirSync(outDir, { recursive: true });

const WIDTH = 1200;
const HEIGHT = 630;
// Same base brand color as `--primary` (light theme) in src/styles/global.css.
const BASE_COLOR = '#047857';

// Category badge hues, mirrored from src/data/categories.ts (`hue` is a CSS
// `hue-rotate()` degree value applied to the same base color in the site's
// actual category badges) — reproduced here as an HSL hue-rotation instead of
// replicating the CSS filter matrix, since for a single flat background color
// the visual result is effectively the same and this is far simpler.
const CATEGORIES = [
	{ slug: 'image', label: 'Image Tools', hue: 0 },
	{ slug: 'pdf', label: 'PDF Tools', hue: 45 },
	{ slug: 'text', label: 'Text Tools', hue: 100 },
	{ slug: 'dev', label: 'Dev Tools', hue: 160 },
	{ slug: 'media', label: 'Media Tools', hue: 220 },
];

function hexToRgb(hex) {
	const n = parseInt(hex.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	if (d !== 0) {
		switch (max) {
			case r:
				h = ((g - b) / d) % 6;
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			default:
				h = (r - g) / d + 4;
		}
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s, l };
}

function hslToRgb({ h, s, l }) {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r1 = 0;
	let g1 = 0;
	let b1 = 0;
	if (h < 60) [r1, g1, b1] = [c, x, 0];
	else if (h < 120) [r1, g1, b1] = [x, c, 0];
	else if (h < 180) [r1, g1, b1] = [0, c, x];
	else if (h < 240) [r1, g1, b1] = [0, x, c];
	else if (h < 300) [r1, g1, b1] = [x, 0, c];
	else [r1, g1, b1] = [c, 0, x];
	const r = Math.round((r1 + m) * 255);
	const g = Math.round((g1 + m) * 255);
	const b = Math.round((b1 + m) * 255);
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function rotatedColor(hex, hueOffsetDeg) {
	const hsl = rgbToHsl(hexToRgb(hex));
	hsl.h = (hsl.h + hueOffsetDeg) % 360;
	return hslToRgb(hsl);
}

function escapeXml(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A darker shade of the same background color for the gradient + card border,
// derived the same way the site derives its own dark-mode accent (lower L in
// HSL), rather than a second unrelated hardcoded color.
function darken(hex, amount) {
	const hsl = rgbToHsl(hexToRgb(hex));
	hsl.l = Math.max(0, hsl.l - amount);
	return hslToRgb(hsl);
}

function buildSvg({ bg, label }) {
	const darkBg = darken(bg, 0.16);
	const title = 'Web Tool Hub';
	const subtitle = '100% free · runs entirely in your browser · nothing ever uploaded';
	return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="${WIDTH}" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="${bg}" />
			<stop offset="1" stop-color="${darkBg}" />
		</linearGradient>
	</defs>
	<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
	<text x="90" y="230" font-family="Consolas, 'Courier New', monospace" font-size="72" font-weight="700" fill="#ffffff" opacity="0.92">&gt;_</text>
	<text x="90" y="330" font-family="Arial, 'Segoe UI', sans-serif" font-size="76" font-weight="700" fill="#ffffff">${escapeXml(title)}</text>
	${label ? `<text x="90" y="390" font-family="Arial, 'Segoe UI', sans-serif" font-size="34" font-weight="600" fill="#ffffff" opacity="0.85">${escapeXml(label)}</text>` : ''}
	<text x="90" y="${label ? 450 : 400}" font-family="Arial, 'Segoe UI', sans-serif" font-size="28" fill="#ffffff" opacity="0.78">${escapeXml(subtitle)}</text>
	<rect x="90" y="${label ? 490 : 450}" width="120" height="6" rx="3" fill="#ffffff" opacity="0.6" />
</svg>`;
}

function renderPng(svg, outPath) {
	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
	const pngData = resvg.render().asPng();
	writeFileSync(outPath, pngData);
	console.log(`wrote ${outPath}`);
}

// Site-wide default — used by every page that doesn't belong to one specific
// tool category (homepage, 404, privacy policy).
renderPng(buildSvg({ bg: BASE_COLOR, label: '' }), path.join(outDir, 'default.png'));

for (const category of CATEGORIES) {
	const bg = rotatedColor(BASE_COLOR, category.hue);
	renderPng(buildSvg({ bg, label: category.label }), path.join(outDir, `${category.slug}.png`));
}
