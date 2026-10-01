/** Logic thuần cho Nén ảnh: định dạng đầu vào/ra, tìm quality theo dung lượng mục tiêu, scale. */

export type OutputMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
export type TargetFormatChoice = 'original' | OutputMime;

const NATIVE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_MIME = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/bmp',
	'image/avif',
	'image/heic',
	'image/heif',
]);
const ACCEPTED_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

export function isHeicLike(file: { name: string; type: string }): boolean {
	return /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function isAcceptedCompressInput(file: { name: string; type: string }): boolean {
	return ACCEPTED_MIME.has(file.type) || ACCEPTED_EXT.test(file.name);
}

/** MIME thực của file đầu vào, suy từ type hoặc đuôi (trình duyệt đôi khi để type rỗng cho HEIC/AVIF). */
export function inputMimeOf(file: { name: string; type: string }): string {
	if (file.type) return file.type;
	const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
	switch (ext) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'png':
			return 'image/png';
		case 'webp':
			return 'image/webp';
		case 'gif':
			return 'image/gif';
		case 'bmp':
			return 'image/bmp';
		case 'avif':
			return 'image/avif';
		case 'heic':
		case 'heif':
			return 'image/heic';
		default:
			return '';
	}
}

/**
 * Định dạng ra thực tế. "Giữ nguyên" với JPEG/PNG/WebP giữ nguyên; các định dạng trình duyệt
 * không ghi được bằng canvas được ánh xạ: HEIC/AVIF -> JPEG (ảnh chụp), GIF/BMP -> PNG.
 */
export function resolveOutputFormat(file: { name: string; type: string }, target: TargetFormatChoice): OutputMime {
	if (target !== 'original') return target;
	const mime = inputMimeOf(file);
	if (NATIVE_MIME.has(mime)) return mime as OutputMime;
	if (mime === 'image/gif' || mime === 'image/bmp') return 'image/png';
	return 'image/jpeg';
}

export function isNativeInput(file: { name: string; type: string }): boolean {
	return NATIVE_MIME.has(inputMimeOf(file));
}

export function extensionFor(mime: OutputMime): string {
	return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[mime];
}

export interface QualitySearchResult {
	quality: number;
	size: number;
	/** true nếu đạt dung lượng mục tiêu. */
	met: boolean;
}

/**
 * Tìm quality cao nhất (nguyên, trong [min,max]) sao cho kích thước <= targetBytes bằng tìm nhị phân.
 * Nếu ngay cả quality thấp nhất cũng vượt mục tiêu, trả về kết quả của quality thấp nhất với met=false.
 * `measure(q)` trả kích thước (byte) khi mã hoá ở quality q.
 */
export async function searchQualityForTarget(
	measure: (quality: number) => Promise<number>,
	targetBytes: number,
	min = 10,
	max = 95,
): Promise<QualitySearchResult> {
	const maxSize = await measure(max);
	if (maxSize <= targetBytes) return { quality: max, size: maxSize, met: true };
	const minSize = await measure(min);
	if (minSize > targetBytes) return { quality: min, size: minSize, met: false };
	let lo = min;
	let hi = max;
	let best: QualitySearchResult = { quality: min, size: minSize, met: true };
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		const size = await measure(mid);
		if (size <= targetBytes) {
			best = { quality: mid, size, met: true };
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return best;
}

/** Kích thước sau khi giới hạn cạnh dài nhất (không phóng to). */
export function fitWithin(width: number, height: number, maxDimension?: number): { width: number; height: number } {
	if (!maxDimension || (width <= maxDimension && height <= maxDimension)) return { width, height };
	const scale = maxDimension / Math.max(width, height);
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
