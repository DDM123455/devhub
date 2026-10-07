// Logic thuần cho công cụ Ảnh sang văn bản (OCR): làm sạch văn bản, độ tin cậy, nối kết quả
// nhiều trang, tên file tải về, phạm vi trang PDF. Không phụ thuộc DOM.

import { splitExt } from './file-utils';

export interface OcrBox {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export interface OcrWordInfo {
	text: string;
	confidence: number;
	bbox: OcrBox;
}

export interface OcrLineInfo {
	words: OcrWordInfo[];
	/** true nếu dòng này mở đầu một đoạn/khối mới (chèn dòng trống phía trước khi hiển thị). */
	paragraphStart: boolean;
}

/** Dưới ngưỡng này (0-100) một từ bị coi là "độ tin cậy thấp". */
export const LOW_WORD_CONFIDENCE = 60;

// ---- Trích dòng/từ từ kết quả tesseract ----------------------------------------------------

interface RawWord {
	text?: unknown;
	confidence?: unknown;
	bbox?: Partial<OcrBox>;
}
interface RawLine {
	words?: RawWord[];
}
interface RawParagraph {
	lines?: RawLine[];
}
interface RawBlock {
	paragraphs?: RawParagraph[];
}

function num(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Chuyển `blocks` của tesseract.js thành danh sách dòng/từ gọn (bỏ từ rỗng). */
export function extractLines(blocks: unknown): OcrLineInfo[] {
	if (!Array.isArray(blocks)) return [];
	const lines: OcrLineInfo[] = [];
	let first = true;
	for (const block of blocks as RawBlock[]) {
		for (const paragraph of block?.paragraphs ?? []) {
			let paragraphFirstLine = true;
			for (const line of paragraph?.lines ?? []) {
				const words: OcrWordInfo[] = [];
				for (const word of line?.words ?? []) {
					const text = typeof word?.text === 'string' ? word.text.trim() : '';
					if (text === '') continue;
					words.push({
						text,
						confidence: Math.max(0, Math.min(100, num(word.confidence))),
						bbox: {
							x0: num(word.bbox?.x0),
							y0: num(word.bbox?.y0),
							x1: num(word.bbox?.x1),
							y1: num(word.bbox?.y1),
						},
					});
				}
				if (words.length === 0) continue;
				lines.push({ words, paragraphStart: !first && paragraphFirstLine });
				paragraphFirstLine = false;
				first = false;
			}
		}
	}
	return lines;
}

/** Độ tin cậy trung bình 0-100 (làm tròn), có trọng số theo độ dài từ; null nếu không có từ nào. */
export function averageConfidence(lines: readonly OcrLineInfo[]): number | null {
	let weighted = 0;
	let total = 0;
	for (const line of lines) {
		for (const word of line.words) {
			const weight = Math.max(1, word.text.length);
			weighted += word.confidence * weight;
			total += weight;
		}
	}
	if (total === 0) return null;
	return Math.round(weighted / total);
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
	if (confidence >= 85) return 'high';
	if (confidence >= 65) return 'medium';
	return 'low';
}

/** Số từ có độ tin cậy thấp hơn ngưỡng. */
export function countLowConfidenceWords(lines: readonly OcrLineInfo[], threshold = LOW_WORD_CONFIDENCE): number {
	let count = 0;
	for (const line of lines) for (const word of line.words) if (word.confidence < threshold) count++;
	return count;
}

/** Độ tin cậy trung bình của nhiều trang, có trọng số theo số từ; bỏ qua trang không có độ tin cậy. */
export function combineConfidence(pages: readonly { confidence: number | null; wordCount: number }[]): number | null {
	let weighted = 0;
	let total = 0;
	for (const page of pages) {
		if (page.confidence === null) continue;
		const weight = Math.max(1, page.wordCount);
		weighted += page.confidence * weight;
		total += weight;
	}
	return total === 0 ? null : Math.round(weighted / total);
}

// ---- Làm sạch văn bản -----------------------------------------------------------------------

export function normalizeOcrNewlines(text: string): string {
	return text.replace(/\r\n?/g, '\n');
}

/** Xoá khoảng trắng cuối dòng, gộp nhiều dòng trống liên tiếp thành đúng 1 dòng trống, bỏ dòng trống đầu/cuối. */
export function collapseBlankLines(text: string): string {
	return normalizeOcrNewlines(text)
		.split('\n')
		.map((line) => line.replace(/[ \t ]+$/g, ''))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^\n+/, '')
		.replace(/\n+$/, '');
}

// Chữ không dùng dấu cách giữa các từ: nối dòng không chèn khoảng trắng.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const LIST_MARKER = /^\s*(?:[-*•·▪◦‣–—]\s|\d{1,3}[.)]\s|[a-zA-Z][.)]\s|\(\d{1,3}\)\s)/;

/**
 * Nối các dòng bị ngắt cứng trong cùng một đoạn (đoạn phân cách bằng dòng trống). Dòng bắt đầu
 * bằng gạch đầu dòng/số thứ tự được giữ là dòng mới. Dấu gạch nối cuối dòng ("inter-\nnational")
 * được ghép lại khi dòng sau bắt đầu bằng chữ thường.
 */
export function joinBrokenLines(text: string): string {
	const paragraphs = normalizeOcrNewlines(text).split(/\n{2,}/);
	const out: string[] = [];
	for (const paragraph of paragraphs) {
		const lines = paragraph.split('\n').map((line) => line.trim());
		let current = '';
		const joined: string[] = [];
		for (const line of lines) {
			if (line === '') continue;
			if (current === '') {
				current = line;
				continue;
			}
			if (LIST_MARKER.test(line)) {
				joined.push(current);
				current = line;
				continue;
			}
			const last = current[current.length - 1];
			const firstChar = line[0];
			if (/[\p{L}]-$/u.test(current) && /^\p{Ll}/u.test(line)) {
				current = current.slice(0, -1) + line;
			} else if (UNSPACED.test(last) || UNSPACED.test(firstChar)) {
				current += line;
			} else {
				current += ' ' + line;
			}
		}
		if (current !== '') joined.push(current);
		out.push(joined.join('\n'));
	}
	return out.filter((p) => p !== '').join('\n\n');
}

// ---- Thống kê -------------------------------------------------------------------------------

/** Số từ/ký tự đơn giản dùng cho nhãn kết quả (từ tách theo khoảng trắng; CJK/Thái đếm theo ký tự). */
export function countOcrStats(text: string): { words: number; characters: number } {
	const trimmed = text.trim();
	if (trimmed === '') return { words: 0, characters: 0 };
	let words = 0;
	for (const token of trimmed.split(/\s+/)) {
		if (!/[\p{L}\p{N}]/u.test(token)) continue;
		if (UNSPACED.test(token)) {
			for (const ch of token) if (UNSPACED.test(ch)) words++;
		} else {
			words++;
		}
	}
	const characters = Array.from(trimmed.replace(/\s/g, '')).length;
	return { words, characters };
}

// ---- Nối nhiều trang & tên file --------------------------------------------------------------

export type MergeMode = 'blank' | 'label';

export interface MergeItem {
	label: string;
	text: string;
}

/** Nối văn bản các trang/ảnh. Bỏ qua mục rỗng; 'label' chèn dòng tiêu đề "=== nhãn ===" trước mỗi mục. */
export function mergeResultTexts(items: readonly MergeItem[], mode: MergeMode): string {
	const parts: string[] = [];
	for (const item of items) {
		const text = item.text.trim();
		if (text === '') continue;
		parts.push(mode === 'label' ? `=== ${item.label} ===\n\n${text}` : text);
	}
	return parts.join('\n\n');
}

function sanitizeBase(name: string, fallback: string): string {
	// eslint-disable-next-line no-control-regex
	const cleaned = name.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').trim();
	return cleaned === '' || cleaned === '.' || cleaned === '..' ? fallback : cleaned;
}

/** Tên gốc (không đuôi) cho 1 đơn vị OCR: file ảnh hoặc 1 trang PDF. */
export function unitBaseName(sourceName: string, pageNumber: number | null): string {
	const [base] = splitExt(sourceName);
	const safe = sanitizeBase(base, 'ocr');
	return pageNumber === null ? safe : `${safe}-page-${pageNumber}`;
}

export function unitTxtName(sourceName: string, pageNumber: number | null): string {
	return `${unitBaseName(sourceName, pageNumber)}.txt`;
}

/** Tên file gộp tất cả: theo tên file nguồn nếu chỉ có 1 nguồn, ngược lại 'ocr-text'. */
export function mergedTxtName(sourceNames: readonly string[]): string {
	const unique = [...new Set(sourceNames)];
	return unique.length === 1 ? `${unitBaseName(unique[0], null)}.txt` : 'ocr-text.txt';
}

// ---- Phạm vi trang PDF -----------------------------------------------------------------------

export type PageRangeResult = { ok: true; pages: number[] } | { ok: false; error: 'invalid' | 'outOfRange' };

/**
 * Phân tích "1-3, 5, 8-" thành danh sách trang (1-based, tăng dần, không trùng). Chuỗi rỗng = tất cả trang.
 * "8-" nghĩa là từ trang 8 đến hết; "-3" là 1 đến 3.
 */
export function parsePageRange(input: string, totalPages: number): PageRangeResult {
	if (!Number.isInteger(totalPages) || totalPages < 1) return { ok: false, error: 'outOfRange' };
	const trimmed = input.trim();
	if (trimmed === '') return { ok: true, pages: Array.from({ length: totalPages }, (_, i) => i + 1) };
	const set = new Set<number>();
	for (const rawPart of trimmed.split(/[,;\s]+/)) {
		const part = rawPart.trim();
		if (part === '') continue;
		const match = /^(\d*)\s*(-|–)?\s*(\d*)$/.exec(part);
		if (!match || (match[1] === '' && match[3] === '')) return { ok: false, error: 'invalid' };
		const hasDash = match[2] !== undefined;
		let start: number;
		let end: number;
		if (!hasDash) {
			start = end = Number(match[1]);
		} else {
			start = match[1] === '' ? 1 : Number(match[1]);
			end = match[3] === '' ? totalPages : Number(match[3]);
		}
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return { ok: false, error: 'invalid' };
		if (start < 1 || end > totalPages) return { ok: false, error: 'outOfRange' };
		for (let page = start; page <= end; page++) set.add(page);
	}
	if (set.size === 0) return { ok: false, error: 'invalid' };
	return { ok: true, pages: [...set].sort((a, b) => a - b) };
}
