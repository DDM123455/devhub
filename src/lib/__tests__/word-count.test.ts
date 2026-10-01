import { describe, expect, it } from 'vitest';
import {
	computeTextStats,
	computeTopWords,
	countGraphemes,
	countSentences,
	extractWords,
	fleschReadingEase,
	looksEnglish,
	toDuration,
} from '../word-count';

describe('countGraphemes', () => {
	it('counts a ZWJ family emoji and combining accents as one character', () => {
		expect(countGraphemes('\u{1F468}‍\u{1F469}‍\u{1F467}')).toBe(1);
		expect(countGraphemes('é')).toBe(1);
		expect(countGraphemes('a b', true)).toBe(2);
	});
});

describe('extractWords', () => {
	it('splits CJK text into words instead of counting one huge word', () => {
		const words = extractWords('今天天气很好', 'zh');
		expect(words.length).toBeGreaterThan(1);
	});
	it('keeps contractions and hyphenated words whole, trims edge punctuation', () => {
		expect(extractWords("Don't stop, state-of-the-art (really)!")).toEqual(["Don't", 'stop', 'state-of-the-art', 'really']);
	});
	it('ignores stand-alone punctuation tokens', () => {
		expect(extractWords('a — b')).toEqual(['a', 'b']);
	});
	it('keeps NFD letters with combining marks together', () => {
		expect(extractWords('Việt Nam')).toHaveLength(2);
	});
});

describe('countSentences', () => {
	it('does not split on decimals, domains or abbreviations', () => {
		expect(countSentences('Pi is 3.14 today.')).toBe(1);
		expect(countSentences('Visit a.com now. Then leave.')).toBe(2);
		expect(countSentences('Mr. Smith went home.')).toBe(1);
		expect(countSentences('J. K. Rowling wrote it.')).toBe(1);
	});
	it('counts CJK terminators and trailing unterminated text', () => {
		expect(countSentences('你好。今天怎么样？很好！')).toBe(3);
		expect(countSentences('One. Two')).toBe(2);
		expect(countSentences('')).toBe(0);
	});
});

describe('computeTextStats', () => {
	it('normalizes CRLF so paragraphs are counted the same as LF', () => {
		const lf = computeTextStats('a b\n\nc d').stats;
		const crlf = computeTextStats('a b\r\n\r\nc d').stats;
		expect(crlf.paragraphs).toBe(2);
		expect(crlf).toEqual(lf);
	});
});

describe('toDuration', () => {
	it('switches to hours for long texts', () => {
		expect(toDuration(200 * 90, 200)).toEqual({ hours: 1, minutes: 30 });
		expect(toDuration(10, 200)).toEqual({ hours: 0, minutes: 1 });
		expect(toDuration(0, 200)).toEqual({ hours: 0, minutes: 0 });
	});
});

describe('readability helpers', () => {
	it('detects English text and computes a score', () => {
		expect(looksEnglish('The cat sat on the mat.')).toBe(true);
		expect(looksEnglish('Xin chào các bạn, hôm nay trời đẹp')).toBe(false);
		const score = fleschReadingEase('The cat sat on the mat.', 1);
		expect(score).not.toBeNull();
		expect(score!).toBeGreaterThan(80);
	});
	it('keyword density is case-insensitive', () => {
		const top = computeTopWords(['The', 'the', 'cat'], 5);
		expect(top[0]).toMatchObject({ word: 'the', count: 2 });
	});
});
