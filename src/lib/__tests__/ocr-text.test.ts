import { describe, it, expect } from 'vitest';
import {
	averageConfidence,
	collapseBlankLines,
	combineConfidence,
	confidenceLevel,
	countLowConfidenceWords,
	countOcrStats,
	extractLines,
	joinBrokenLines,
	mergedTxtName,
	mergeResultTexts,
	parsePageRange,
	unitBaseName,
	unitTxtName,
} from '../ocr-text';

const word = (text: string, confidence: number) => ({ text, confidence, bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } });

describe('extractLines / confidence', () => {
	const blocks = [
		{
			paragraphs: [
				{ lines: [{ words: [word('Hello', 96), word('  ', 10), word('world', 90)] }, { words: [word('again', 40)] }] },
				{ lines: [{ words: [word('Next', 80)] }] },
			],
		},
	];
	it('bỏ từ rỗng, đánh dấu đầu đoạn (trừ dòng đầu tiên)', () => {
		const lines = extractLines(blocks);
		expect(lines.length).toBe(3);
		expect(lines[0].words.map((w) => w.text)).toEqual(['Hello', 'world']);
		expect(lines.map((l) => l.paragraphStart)).toEqual([false, false, true]);
	});
	it('chịu được dữ liệu thiếu/không hợp lệ', () => {
		expect(extractLines(null)).toEqual([]);
		expect(extractLines([{}, { paragraphs: [{}, { lines: [{}] }] }])).toEqual([]);
	});
	it('độ tin cậy trung bình có trọng số theo độ dài từ', () => {
		const lines = extractLines(blocks);
		// Hello(5)*96 + world(5)*90 + again(5)*40 + Next(4)*80 = 480+450+200+320 = 1450 / 19
		expect(averageConfidence(lines)).toBe(Math.round(1450 / 19));
		expect(averageConfidence([])).toBeNull();
	});
	it('đếm từ độ tin cậy thấp', () => {
		expect(countLowConfidenceWords(extractLines(blocks))).toBe(1);
		expect(countLowConfidenceWords(extractLines(blocks), 95)).toBe(3);
	});
	it('mức độ tin cậy', () => {
		expect(confidenceLevel(90)).toBe('high');
		expect(confidenceLevel(70)).toBe('medium');
		expect(confidenceLevel(40)).toBe('low');
	});
	it('gộp nhiều trang theo số từ, bỏ trang không có dữ liệu', () => {
		expect(
			combineConfidence([
				{ confidence: 90, wordCount: 100 },
				{ confidence: 50, wordCount: 100 },
				{ confidence: null, wordCount: 500 },
			]),
		).toBe(70);
		expect(combineConfidence([{ confidence: null, wordCount: 3 }])).toBeNull();
	});
});

describe('làm sạch văn bản', () => {
	it('collapseBlankLines', () => {
		expect(collapseBlankLines('\n\na  \n\n\n\nb\t\n\n')).toBe('a\n\nb');
		expect(collapseBlankLines('a\r\n\r\n\r\nb')).toBe('a\n\nb');
	});
	it('joinBrokenLines nối dòng trong đoạn, giữ đoạn', () => {
		expect(joinBrokenLines('This is a\nbroken line.\n\nNew paragraph\nhere.')).toBe('This is a broken line.\n\nNew paragraph here.');
	});
	it('joinBrokenLines giữ gạch đầu dòng và số thứ tự', () => {
		expect(joinBrokenLines('Items:\n- one\n- two\n1. first\n2) second')).toBe('Items:\n- one\n- two\n1. first\n2) second');
	});
	it('joinBrokenLines ghép từ bị ngắt bằng gạch nối', () => {
		expect(joinBrokenLines('inter-\nnational trade')).toBe('international trade');
		// Chữ hoa sau gạch nối: giữ nguyên (không đoán)
		expect(joinBrokenLines('Smith-\nJones')).toBe('Smith- Jones');
	});
	it('joinBrokenLines không chèn dấu cách giữa chữ Hán/Nhật/Thái', () => {
		expect(joinBrokenLines('日本語の\n文章です')).toBe('日本語の文章です');
	});
	it('đếm từ/ký tự', () => {
		expect(countOcrStats('')).toEqual({ words: 0, characters: 0 });
		expect(countOcrStats('Hello  world!\n- 42')).toEqual({ words: 3, characters: 14 });
		expect(countOcrStats('日本語').words).toBe(3);
	});
});

describe('nối kết quả & tên file', () => {
	const items = [
		{ label: 'a.png', text: 'one' },
		{ label: 'empty', text: '  ' },
		{ label: 'b.png', text: 'two\n' },
	];
	it('nối kiểu trống / có nhãn, bỏ mục rỗng', () => {
		expect(mergeResultTexts(items, 'blank')).toBe('one\n\ntwo');
		expect(mergeResultTexts(items, 'label')).toBe('=== a.png ===\n\none\n\n=== b.png ===\n\ntwo');
		expect(mergeResultTexts([], 'blank')).toBe('');
	});
	it('tên file tải về', () => {
		expect(unitTxtName('scan.final.PNG', null)).toBe('scan.final.txt');
		expect(unitTxtName('doc.pdf', 3)).toBe('doc-page-3.txt');
		expect(unitBaseName('a/b:c?.png', null)).toBe('a_b_c_');
		expect(unitBaseName('', null)).toBe('ocr');
		expect(mergedTxtName(['x.png', 'x.png'])).toBe('x.txt');
		expect(mergedTxtName(['x.png', 'y.png'])).toBe('ocr-text.txt');
	});
});

describe('parsePageRange', () => {
	it('rỗng = tất cả', () => {
		expect(parsePageRange('', 3)).toEqual({ ok: true, pages: [1, 2, 3] });
	});
	it('khoảng, danh sách, mở đầu/cuối', () => {
		expect(parsePageRange('1-3, 5', 10)).toEqual({ ok: true, pages: [1, 2, 3, 5] });
		expect(parsePageRange('8-', 10)).toEqual({ ok: true, pages: [8, 9, 10] });
		expect(parsePageRange('-2', 10)).toEqual({ ok: true, pages: [1, 2] });
		expect(parsePageRange('3,3,1', 10)).toEqual({ ok: true, pages: [1, 3] });
	});
	it('lỗi định dạng / ngoài phạm vi', () => {
		expect(parsePageRange('abc', 5)).toEqual({ ok: false, error: 'invalid' });
		expect(parsePageRange('4-2', 5)).toEqual({ ok: false, error: 'invalid' });
		expect(parsePageRange('0', 5)).toEqual({ ok: false, error: 'outOfRange' });
		expect(parsePageRange('2-9', 5)).toEqual({ ok: false, error: 'outOfRange' });
		expect(parsePageRange('1', 0)).toEqual({ ok: false, error: 'outOfRange' });
	});
});
