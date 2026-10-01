// Pure text statistics for the Word Counter tool (kept out of the component so the
// counting rules can be unit-tested without a DOM).

interface SegmenterLike {
	segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }>;
}
type SegmenterCtor = new (locale?: string, options?: { granularity: string }) => SegmenterLike;

function getSegmenter(): SegmenterCtor | undefined {
	return (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
}

export function normalizeNewlines(text: string): string {
	return text.replace(/\r\n?/g, '\n');
}

// Grapheme clusters: "👨‍👩‍👧" or "é" (e + combining accent) count as ONE character.
export function countGraphemes(text: string, skipWhitespace = false): number {
	const Segmenter = getSegmenter();
	let count = 0;
	if (Segmenter) {
		for (const { segment } of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
			if (skipWhitespace && /^\s+$/.test(segment)) continue;
			count += 1;
		}
		return count;
	}
	for (const ch of text) {
		if (skipWhitespace && /\s/.test(ch)) continue;
		count += 1;
	}
	return count;
}

// Scripts that are written without spaces between words — whitespace splitting would
// count a whole paragraph as one "word".
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

export function extractWords(text: string, locale?: string): string[] {
	const words: string[] = [];
	const Segmenter = getSegmenter();
	for (const rawToken of text.split(/\s+/)) {
		if (rawToken === '' || !HAS_WORD_CHAR.test(rawToken)) continue;
		if (UNSPACED_SCRIPT.test(rawToken)) {
			if (Segmenter) {
				let segmenter: SegmenterLike;
				try {
					segmenter = new Segmenter(locale, { granularity: 'word' });
				} catch {
					segmenter = new Segmenter(undefined, { granularity: 'word' });
				}
				for (const seg of segmenter.segment(rawToken)) {
					if (seg.isWordLike) words.push(seg.segment);
				}
			} else {
				// No Segmenter: approximate with one word per ideograph/kana/Thai letter.
				for (const ch of rawToken) if (UNSPACED_SCRIPT.test(ch)) words.push(ch);
			}
			continue;
		}
		// Trim punctuation from both ends only ("(hello)," -> "hello"), keeping inner
		// punctuation so "don't" and "state-of-the-art" stay single words.
		const trimmed = rawToken.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '');
		if (trimmed !== '') words.push(trimmed);
	}
	return words;
}

const ABBREVIATIONS = new Set([
	'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co', 'no', 'fig', 'eg', 'ie', 'e.g', 'i.e', 'approx', 'dept', 'est', 'vol',
]);

// Heuristic sentence counter. A "." only ends a sentence when it is followed by
// whitespace/end of text (so "3.14", "a.com", "v1.2" never split) and does not belong to
// a common abbreviation ("Mr.") or a single-letter initial ("J. K. Rowling").
// "!", "?", "…" behave the same; CJK full-width terminators (。！？) always end a sentence.
export function countSentences(text: string): number {
	const trimmed = text.trim();
	if (trimmed === '') return 0;
	let count = 0;
	let lastBoundaryEnd = 0;
	const re = /[.!?…。！？｡]+/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(trimmed)) !== null) {
		const terminator = m[0];
		const end = m.index + terminator.length;
		const isCjk = /[。！？｡]/u.test(terminator);
		let isBoundary = isCjk;
		if (!isBoundary) {
			// Skip closing quotes/brackets directly after the terminator.
			let k = end;
			while (k < trimmed.length && /["'”’)\]]/u.test(trimmed[k])) k++;
			const followedBySpaceOrEnd = k >= trimmed.length || /\s/.test(trimmed[k]);
			isBoundary = followedBySpaceOrEnd;
			if (isBoundary && terminator === '.') {
				const before = trimmed.slice(0, m.index);
				const prevWord = /([\p{L}.]+)$/u.exec(before)?.[1]?.toLowerCase() ?? '';
				if (ABBREVIATIONS.has(prevWord) || /^\p{L}$/u.test(prevWord)) isBoundary = false;
			}
		}
		if (isBoundary) {
			count += 1;
			lastBoundaryEnd = end;
		}
	}
	if (HAS_WORD_CHAR.test(trimmed.slice(lastBoundaryEnd))) count += 1;
	return count;
}

export function countParagraphs(text: string): number {
	const trimmed = normalizeNewlines(text).trim();
	return trimmed === '' ? 0 : trimmed.split(/\n\s*\n/).filter((p) => p.trim() !== '').length;
}

export const READING_WORDS_PER_MINUTE = 200;
export const SPEAKING_WORDS_PER_MINUTE = 130;

export interface Duration {
	hours: number;
	minutes: number;
}

export function toDuration(words: number, wordsPerMinute: number): Duration {
	if (words === 0) return { hours: 0, minutes: 0 };
	const totalMinutes = Math.max(1, Math.round(words / wordsPerMinute));
	return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

export interface TextStats {
	characters: number;
	charactersNoSpaces: number;
	words: number;
	sentences: number;
	paragraphs: number;
	reading: Duration;
	speaking: Duration;
}

export function computeTextStats(rawText: string, locale?: string): { stats: TextStats; wordList: string[] } {
	const text = normalizeNewlines(rawText);
	const wordList = extractWords(text, locale);
	return {
		wordList,
		stats: {
			characters: countGraphemes(text),
			charactersNoSpaces: countGraphemes(text, true),
			words: wordList.length,
			sentences: countSentences(text),
			paragraphs: countParagraphs(text),
			reading: toDuration(wordList.length, READING_WORDS_PER_MINUTE),
			speaking: toDuration(wordList.length, SPEAKING_WORDS_PER_MINUTE),
		},
	};
}

export interface TopWord {
	word: string;
	count: number;
	percent: number;
}

// Keyword density: how often each distinct word occurs, as a share of the total word
// count — deliberately NOT filtering stop words (SEO users want to see over-repetition).
export function computeTopWords(wordList: string[], limit: number): TopWord[] {
	if (wordList.length === 0) return [];
	const counts = new Map<string, number>();
	for (const word of wordList) {
		const key = word.toLowerCase();
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const total = wordList.length;
	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([word, count]) => ({ word, count, percent: (count / total) * 100 }));
}

// Approximate English syllable counter (vowel-group heuristic) — only meaningful for English.
export function countSyllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, '');
	if (w.length === 0) return 0;
	if (w.length <= 3) return 1;
	const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
	const groups = trimmed.match(/[aeiouy]{1,2}/g);
	return groups ? Math.max(1, groups.length) : 1;
}

// True when (almost) all letters are basic Latin — the only text Flesch is calibrated for.
export function looksEnglish(text: string): boolean {
	const letters = text.match(/\p{L}/gu) ?? [];
	if (letters.length === 0) return false;
	const ascii = letters.filter((c) => /[A-Za-z]/.test(c)).length;
	return ascii / letters.length >= 0.95;
}

export function fleschReadingEase(text: string, sentences: number): number | null {
	if (sentences === 0) return null;
	const wordList = text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? [];
	if (wordList.length === 0) return null;
	const syllables = wordList.reduce((sum, w) => sum + countSyllables(w), 0);
	const score = 206.835 - 1.015 * (wordList.length / sentences) - 84.6 * (syllables / wordList.length);
	return Math.max(0, Math.min(100, score));
}
