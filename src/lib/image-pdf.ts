/** Logic thuần cho "ảnh → PDF" và "SVG → raster" (không phụ thuộc DOM, test được bằng vitest). */

export type PdfPageMode = 'fit' | 'a4' | 'letter';
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';

export const PAGE_SIZES_PT: Record<'a4' | 'letter', [number, number]> = {
	a4: [595.28, 841.89],
	letter: [612, 792],
};

export function mmToPt(mm: number): number {
	return (mm * 72) / 25.4;
}

export interface PdfPlacement {
	pageWidth: number;
	pageHeight: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Tính khổ trang + vị trí/kích thước ảnh (đơn vị point, gốc toạ độ PDF ở góc dưới-trái).
 * - 'fit': trang = đúng kích thước ảnh (px × 0.75 pt) + lề 2 phía.
 * - 'a4' / 'letter': ảnh co vừa (contain) vùng trong lề và căn giữa; orientation 'auto' chọn
 *   ngang nếu ảnh rộng hơn cao.
 */
export function computePdfPlacement(
	imgWidth: number,
	imgHeight: number,
	mode: PdfPageMode,
	marginMm: number,
	orientation: PdfOrientation = 'auto',
): PdfPlacement {
	const margin = Math.max(0, mmToPt(marginMm));
	if (mode === 'fit') {
		const width = imgWidth * 0.75;
		const height = imgHeight * 0.75;
		return {
			pageWidth: width + margin * 2,
			pageHeight: height + margin * 2,
			x: margin,
			y: margin,
			width,
			height,
		};
	}
	let [pageWidth, pageHeight] = PAGE_SIZES_PT[mode];
	const landscape = orientation === 'landscape' || (orientation === 'auto' && imgWidth > imgHeight);
	if (landscape) [pageWidth, pageHeight] = [pageHeight, pageWidth];
	// Lề không được ăn hết trang.
	const safeMargin = Math.min(margin, Math.min(pageWidth, pageHeight) / 2 - 1);
	const boxW = pageWidth - safeMargin * 2;
	const boxH = pageHeight - safeMargin * 2;
	const scale = Math.min(boxW / imgWidth, boxH / imgHeight);
	const width = imgWidth * scale;
	const height = imgHeight * scale;
	return {
		pageWidth,
		pageHeight,
		x: (pageWidth - width) / 2,
		y: (pageHeight - height) / 2,
		width,
		height,
	};
}

const UNIT_TO_PX: Record<string, number> = {
	'': 1,
	px: 1,
	pt: 96 / 72,
	pc: 16,
	in: 96,
	cm: 96 / 2.54,
	mm: 96 / 25.4,
};

function parseLength(value: string | undefined): number | null {
	if (!value) return null;
	const match = /^\s*([0-9]*\.?[0-9]+)\s*([a-z%]*)\s*$/i.exec(value);
	if (!match) return null;
	const unit = match[2].toLowerCase();
	if (!(unit in UNIT_TO_PX)) return null; // %, em, ex... không xác định được
	const n = Number(match[1]) * UNIT_TO_PX[unit];
	return n > 0 && Number.isFinite(n) ? n : null;
}

function getAttr(tag: string, name: string): string | undefined {
	const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
	return m ? (m[2] ?? m[3]) : undefined;
}

function findRootTag(svgText: string): { start: number; end: number; tag: string } | null {
	const m = /<svg\b[^>]*>/i.exec(svgText);
	if (!m) return null;
	return { start: m.index, end: m.index + m[0].length, tag: m[0] };
}

/** Kích thước nội tại (px) của SVG từ width/height hoặc viewBox. null nếu không suy ra được. */
export function parseSvgIntrinsicSize(svgText: string): { width: number; height: number } | null {
	const root = findRootTag(svgText);
	if (!root) return null;
	let width = parseLength(getAttr(root.tag, 'width'));
	let height = parseLength(getAttr(root.tag, 'height'));
	const vb = getAttr(root.tag, 'viewBox');
	let vbW: number | null = null;
	let vbH: number | null = null;
	if (vb) {
		const parts = vb.trim().split(/[\s,]+/).map(Number);
		if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
			vbW = parts[2];
			vbH = parts[3];
		}
	}
	if (width && !height && vbW && vbH) height = (width * vbH) / vbW;
	if (height && !width && vbW && vbH) width = (height * vbW) / vbH;
	if (!width && !height && vbW && vbH) {
		width = vbW;
		height = vbH;
	}
	if (!width || !height) return null;
	return { width, height };
}

/**
 * Viết lại thẻ <svg> gốc: đặt width/height tường minh (đã nhân scale) và đảm bảo có viewBox
 * để nội dung co giãn theo. Firefox cần width/height tường minh mới vẽ SVG lên canvas ổn định.
 */
export function prepareSvgForRaster(
	svgText: string,
	scale: number,
	fallbackSize = { width: 512, height: 512 },
): { text: string; width: number; height: number } {
	const intrinsic = parseSvgIntrinsicSize(svgText) ?? fallbackSize;
	const width = Math.max(1, Math.round(intrinsic.width * scale));
	const height = Math.max(1, Math.round(intrinsic.height * scale));
	const root = findRootTag(svgText);
	if (!root) return { text: svgText, width, height };
	let tag = root.tag
		.replace(/(\s)width\s*=\s*("[^"]*"|'[^']*')/i, '$1')
		.replace(/(\s)height\s*=\s*("[^"]*"|'[^']*')/i, '$1');
	const hasViewBox = /\sviewBox\s*=/i.test(tag);
	const extra =
		` width="${width}" height="${height}"` +
		(hasViewBox ? '' : ` viewBox="0 0 ${intrinsic.width} ${intrinsic.height}"`);
	tag = tag.replace(/^<svg\b/i, `<svg${extra}`);
	// Thiếu namespace thì <img> không render SVG.
	if (!/\sxmlns\s*=/i.test(tag)) tag = tag.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
	return { text: svgText.slice(0, root.start) + tag + svgText.slice(root.end), width, height };
}

export function isSvgFile(file: { name: string; type: string }): boolean {
	return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
}

/** Kiểm tra màu hex #rgb / #rrggbb. */
export function isHexColor(value: string): boolean {
	return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}
