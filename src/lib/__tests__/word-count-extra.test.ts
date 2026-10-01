import { describe, expect, it } from 'vitest';
import { computeKeywordRows, estimatePages, goalProgress, gradeMetrics, isStopWord, smsSegments } from '../word-count-extra';
import { detectDocumentKind } from '../doc-extract';
import { extractWords } from '../word-count';

describe('computeKeywordRows', () => {
	const text = 'The quick brown fox jumps over the lazy dog. The quick brown fox is quick and the dog is lazy.';
	const words = extractWords(text);
	it('filters stop words for single words', () => {
		const withStop = computeKeywordRows(words, { limit: 5, size: 1, excludeStopWords: false });
		expect(withStop[0].phrase).toBe('the');
		const without = computeKeywordRows(words, { limit: 5, size: 1, excludeStopWords: true });
		expect(without.map((r) => r.phrase)).not.toContain('the');
		expect(without[0].phrase).toBe('quick');
		expect(without[0].count).toBe(3);
	});
	it('finds bigrams and trigrams that repeat', () => {
		const bi = computeKeywordRows(words, { limit: 5, size: 2, excludeStopWords: true });
		expect(bi.slice(0, 2).map((r) => r.phrase).sort()).toEqual(['brown fox', 'quick brown']);
		expect(bi[0].count).toBe(2);
		const tri = computeKeywordRows(words, { limit: 5, size: 3, excludeStopWords: false });
		expect(tri.map((r) => r.phrase)).toContain('quick brown fox');
	});
	it('handles Vietnamese stop words', () => {
		expect(isStopWord('và')).toBe(true);
		expect(isStopWord('những')).toBe(true);
		expect(isStopWord('máy')).toBe(false);
		const vi = extractWords('máy tính và máy in và máy chiếu của chúng tôi');
		const rows = computeKeywordRows(vi, { limit: 3, size: 1, excludeStopWords: true });
		expect(rows[0]).toMatchObject({ phrase: 'máy', count: 3 });
		expect(rows.map((r) => r.phrase)).not.toContain('và');
	});
	it('returns [] when the text is shorter than n', () => {
		expect(computeKeywordRows(['one', 'two'], { limit: 5, size: 3, excludeStopWords: false })).toEqual([]);
	});
});

describe('smsSegments', () => {
	it('GSM-7 limits', () => {
		expect(smsSegments('')).toMatchObject({ segments: 0 });
		expect(smsSegments('a'.repeat(160))).toMatchObject({ encoding: 'GSM-7', segments: 1, units: 160 });
		expect(smsSegments('a'.repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
		expect(smsSegments('{'.repeat(81))).toMatchObject({ units: 162, segments: 2 }); // extension chars cost 2
	});
	it('switches to UCS-2 for non-GSM characters', () => {
		expect(smsSegments('Xin chào ạ')).toMatchObject({ encoding: 'UCS-2' });
		expect(smsSegments('ạ'.repeat(70))).toMatchObject({ encoding: 'UCS-2', segments: 1 });
		expect(smsSegments('ạ'.repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
		expect(smsSegments('hi 😀')).toMatchObject({ encoding: 'UCS-2', units: 5 });
	});
});

describe('gradeMetrics', () => {
	it('computes Flesch-Kincaid grade and Gunning Fog', () => {
		const text = 'The cat sat on the mat. The dog ran in the park.';
		const m = gradeMetrics(text, 2)!;
		expect(m.fleschKincaidGrade).toBeLessThan(3);
		expect(m.gunningFog).toBeLessThan(4);
		const hard = 'Notwithstanding considerable organisational complexity, implementation necessitates comprehensive interdepartmental collaboration.';
		const h = gradeMetrics(hard, 1)!;
		expect(h.fleschKincaidGrade).toBeGreaterThan(15);
		expect(h.gunningFog).toBeGreaterThan(15);
		expect(gradeMetrics('', 0)).toBeNull();
	});
});

describe('misc', () => {
	it('estimates pages and goal progress', () => {
		expect(estimatePages(0)).toEqual({ single: 0, double: 0 });
		expect(estimatePages(501)).toEqual({ single: 2, double: 3 });
		expect(goalProgress(50, 200)).toEqual({ percent: 25, reached: false });
		expect(goalProgress(300, 200)).toEqual({ percent: 100, reached: true });
		expect(goalProgress(5, 0)).toEqual({ percent: 0, reached: false });
	});
	it('detects document kinds', () => {
		expect(detectDocumentKind('a.DOCX', '')).toBe('docx');
		expect(detectDocumentKind('a.pdf', '')).toBe('pdf');
		expect(detectDocumentKind('a.md', 'text/markdown')).toBe('text');
	});
});
