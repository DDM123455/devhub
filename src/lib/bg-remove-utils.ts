/** Logic thuần cho Xoá nền: bố cục preset marketplace, gradient, blur nền, đổ bóng, định dạng xuất. */

export interface ContainLayout {
	dx: number;
	dy: number;
	dw: number;
	dh: number;
}

/**
 * Đặt vật thể (srcW×srcH) vừa khít (contain) giữa khung W×H với lề paddingPercent% mỗi cạnh.
 * Cho phép phóng to để lấp khung (ảnh sản phẩm marketplace cần chiếm phần lớn khung).
 */
export function computeContainLayout(
	srcW: number,
	srcH: number,
	targetW: number,
	targetH: number,
	paddingPercent: number,
): ContainLayout {
	const pad = Math.min(Math.max(paddingPercent, 0), 40) / 100;
	const innerW = targetW * (1 - pad * 2);
	const innerH = targetH * (1 - pad * 2);
	const scale = Math.min(innerW / srcW, innerH / srcH);
	const dw = srcW * scale;
	const dh = srcH * scale;
	return { dx: (targetW - dw) / 2, dy: (targetH - dh) / 2, dw, dh };
}

export interface MarketplacePreset {
	id: string;
	width: number;
	height: number;
	/** Nền khuyến nghị (Amazon yêu cầu trắng tinh). */
	recommendedBackground?: string;
}

export const MARKETPLACE_PRESETS: MarketplacePreset[] = [
	{ id: 'amazon', width: 2000, height: 2000, recommendedBackground: '#FFFFFF' },
	{ id: 'shopee', width: 800, height: 800 },
	{ id: 'etsy', width: 2000, height: 1500 },
];

export type GradientDirection = 'vertical' | 'horizontal' | 'diagonal';

/** Điểm đầu/cuối của gradient tuyến tính phủ kín khung w×h. */
export function gradientEndpoints(
	direction: GradientDirection,
	w: number,
	h: number,
): { x0: number; y0: number; x1: number; y1: number } {
	switch (direction) {
		case 'horizontal':
			return { x0: 0, y0: 0, x1: w, y1: 0 };
		case 'diagonal':
			return { x0: 0, y0: 0, x1: w, y1: h };
		default:
			return { x0: 0, y0: 0, x1: 0, y1: h };
	}
}

/**
 * Blur nền không dùng ctx.filter (Safari cũ không hỗ trợ): thu nhỏ ảnh rồi phóng lại với làm mượt.
 * strength 1..30 -> hệ số thu nhỏ (càng lớn càng mờ), kẹp để không thu nhỏ dưới 8px.
 */
export function blurDownscaleFactor(strength: number, w: number, h: number): number {
	const s = Math.min(Math.max(strength, 1), 30);
	const factor = 1 + s * 1.5;
	const maxFactor = Math.max(1, Math.min(w, h) / 8);
	return Math.min(factor, maxFactor);
}

export interface ShadowParams {
	color: string;
	blur: number;
	offsetX: number;
	offsetY: number;
}

/** Tham số đổ bóng: sizePercent là % cạnh ngắn của ảnh (1..10), opacity 0..1. */
export function shadowParams(sizePercent: number, opacity: number, w: number, h: number): ShadowParams {
	const size = (Math.min(Math.max(sizePercent, 0), 20) / 100) * Math.min(w, h);
	const a = Math.min(Math.max(opacity, 0), 1);
	return { color: `rgba(0,0,0,${a})`, blur: size, offsetX: 0, offsetY: size * 0.4 };
}

export type ExportFormat = 'png' | 'webp' | 'jpg';

export function exportMime(format: ExportFormat): string {
	return { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' }[format];
}

export function exportExtension(format: ExportFormat): string {
	return format;
}

/** JPG không có alpha: cần đổ nền trắng nếu nền đang là "trong suốt". */
export function needsFlatten(format: ExportFormat, backgroundIsTransparent: boolean): boolean {
	return format === 'jpg' && backgroundIsTransparent;
}
