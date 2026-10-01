// Pure case-conversion helpers for the Text Case Converter (unit-testable without a DOM).

export type CaseMode =
	| 'upper'
	| 'lower'
	| 'title'
	| 'camel'
	| 'snake'
	| 'sentence'
	| 'alternating'
	| 'inverse'
	| 'removeSpaces'
	| 'removeLineBreaks'
	| 'sortLines'
	| 'pascal'
	| 'kebab'
	| 'constant'
	| 'dot'
	| 'path'
	| 'train'
	| 'capitalized'
	| 'sortLinesDesc'
	| 'dedupeLines'
	| 'reverseLines'
	| 'trimLines'
	| 'numberLines'
	| 'prefixSuffix'
	| 'stylized';

export type StylizedStyle = 'bold' | 'italic' | 'script' | 'monospace' | 'strikethrough' | 'wide';

export interface CaseOptions {
	// Compare embedded numbers by value when sorting lines ("file2" < "file10").
	naturalSort?: boolean;
	// Line prefix/suffix and numbering start (used by 'prefixSuffix' / 'numberLines').
	prefix?: string;
	suffix?: string;
	startNumber?: number;
	stylizedStyle?: StylizedStyle;
}

const MAP_EXCEPTIONS: Record<string, Record<string, number>> = {
	italic: { h: 0x210e },
	script: {
		B: 0x212c, E: 0x2130, F: 0x2131, H: 0x210b, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211b,
		e: 0x212f, g: 0x210a, o: 0x2134,
	},
};
const STYLE_BASES: Record<string, { upper: number; lower: number; digit?: number }> = {
	bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
	italic: { upper: 0x1d434, lower: 0x1d44e },
	script: { upper: 0x1d49c, lower: 0x1d4b6 },
	monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
};

// Maps ASCII letters/digits to Unicode "Mathematical Alphanumeric" look-alikes (or fullwidth /
// combining-strikethrough). Non-ASCII characters are left untouched.
export function stylizeText(text: string, style: StylizedStyle): string {
	if (style === 'strikethrough') {
		return Array.from(text)
			.map((ch) => (/\s/.test(ch) ? ch : ch + '̶'))
			.join('');
	}
	if (style === 'wide') {
		return Array.from(text)
			.map((ch) => {
				const code = ch.codePointAt(0)!;
				if (code === 0x20) return '　';
				if (code >= 0x21 && code <= 0x7e) return String.fromCodePoint(code + 0xfee0);
				return ch;
			})
			.join('');
	}
	const base = STYLE_BASES[style];
	return Array.from(text)
		.map((ch) => {
			const exception = MAP_EXCEPTIONS[style]?.[ch];
			if (exception) return String.fromCodePoint(exception);
			const code = ch.codePointAt(0)!;
			if (code >= 65 && code <= 90) return String.fromCodePoint(base.upper + code - 65);
			if (code >= 97 && code <= 122) return String.fromCodePoint(base.lower + code - 97);
			if (base.digit !== undefined && code >= 48 && code <= 57) return String.fromCodePoint(base.digit + code - 48);
			return ch;
		})
		.join('');
}

function mapLines(text: string, fn: (lines: string[]) => string[]): string {
	return fn(text.replace(/\r\n?/g, '\n').split('\n')).join('\n');
}

export function dedupeLines(text: string): string {
	return mapLines(text, (lines) => {
		const seen = new Set<string>();
		return lines.filter((line) => {
			if (seen.has(line)) return false;
			seen.add(line);
			return true;
		});
	});
}

export function reverseLines(text: string): string {
	return mapLines(text, (lines) => lines.reverse());
}

export function trimLines(text: string): string {
	return mapLines(text, (lines) => lines.map((line) => line.trim()));
}

export function numberLines(text: string, start = 1): string {
	return mapLines(text, (lines) => lines.map((line, index) => `${start + index}. ${line}`));
}

export function prefixSuffixLines(text: string, prefix: string, suffix: string): string {
	return mapLines(text, (lines) => lines.map((line) => prefix + line + suffix));
}

// Short articles/conjunctions/prepositions that AP/Chicago-style title case
// leaves lowercase — except when one starts or ends the title.
const TITLE_CASE_MINOR_WORDS = new Set([
	'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet',
]);

function capitalizeFirst(word: string): string {
	const chars = Array.from(word);
	return chars[0].toUpperCase() + chars.slice(1).join('').toLowerCase();
}

// `\p{L}`/`\p{N}` (Unicode property escapes) keep accented/non-Latin words intact where
// `\w` would treat every accented letter as a separator.
export function titleCase(text: string): string {
	const input = text.normalize('NFC');
	const matchCount = (input.match(/[\p{L}\p{N}]\S*/gu) ?? []).length;
	if (matchCount === 0) return input;
	const lastWordIndex = matchCount - 1;
	let wordIndex = -1;
	return input.replace(/[\p{L}\p{N}]\S*/gu, (word) => {
		wordIndex++;
		const bareWord = word.toLowerCase().replace(/[^\p{L}']/gu, '');
		if (TITLE_CASE_MINOR_WORDS.has(bareWord) && wordIndex !== 0 && wordIndex !== lastWordIndex) {
			return word.toLowerCase();
		}
		return capitalizeFirst(word);
	});
}

// Splits into word tokens for camelCase / snake_case. Text is NFC-normalized first so
// decomposed accents (NFD) stay attached to their letter, and apostrophes inside a word
// ("don't", "it’s") are removed instead of acting as separators.
export function splitWords(text: string): string[] {
	const withSpaces = text
		.normalize('NFC')
		.replace(/(\p{L})['’](?=\p{L})/gu, '$1')
		.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
		.replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2');
	return withSpaces.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function sentenceCase(text: string): string {
	return text
		.normalize('NFC')
		.toLowerCase()
		.replace(/(^\s*\p{Ll})|([.!?]\s+\p{Ll})/gu, (match) => match.toUpperCase());
}

export function sortLines(text: string, naturalSort: boolean, descending = false): string {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const collator = new Intl.Collator(undefined, naturalSort ? { numeric: true, sensitivity: 'base' } : undefined);
	return lines.sort((a, b) => (descending ? collator.compare(b, a) : collator.compare(a, b))).join('\n');
}

// Every word capitalized (unlike title case, minor words like "the"/"of" are NOT kept lowercase).
export function capitalizedCase(text: string): string {
	return text.normalize('NFC').replace(/[\p{L}\p{N}][\p{L}\p{N}']*/gu, (word) => capitalizeFirst(word));
}

function joinWords(text: string, sep: string, transform: (word: string) => string): string {
	return splitWords(text).map(transform).join(sep);
}

export function convertCase(text: string, mode: CaseMode, options: CaseOptions = {}): string {
	switch (mode) {
		case 'upper':
			return text.toUpperCase();
		case 'lower':
			return text.toLowerCase();
		case 'title':
			return titleCase(text);
		case 'camel':
			return splitWords(text)
				.map((word, index) => (index === 0 ? word.toLowerCase() : capitalizeFirst(word)))
				.join('');
		case 'snake':
			return splitWords(text)
				.map((word) => word.toLowerCase())
				.join('_');
		case 'sentence':
			return sentenceCase(text);
		case 'alternating': {
			let letterIndex = 0;
			return Array.from(text)
				.map((char) => {
					const upper = char.toUpperCase();
					const lower = char.toLowerCase();
					if (upper === lower) return char; // not a cased letter, don't advance the counter
					const result = letterIndex % 2 === 0 ? lower : upper;
					letterIndex++;
					return result;
				})
				.join('');
		}
		case 'inverse':
			return Array.from(text)
				.map((char) => {
					const upper = char.toUpperCase();
					const lower = char.toLowerCase();
					if (upper === lower) return char;
					return char === upper ? lower : upper;
				})
				.join('');
		case 'removeSpaces':
			return text
				.replace(/\r\n?/g, '\n')
				.replace(/[ \t]+/g, ' ')
				.replace(/^ +| +$/gm, '');
		case 'removeLineBreaks': {
			const normalized = text.replace(/\r\n?/g, '\n');
			const collapsed = normalized.replace(/[ \t]*\n(?:[ \t]*\n)+/g, '\n');
			return collapsed.replace(/^[ \t]*\n+/, '').replace(/\n+[ \t]*$/, '');
		}
		case 'sortLines':
			return sortLines(text, !!options.naturalSort);
		case 'sortLinesDesc':
			return sortLines(text, !!options.naturalSort, true);
		case 'pascal':
			return joinWords(text, '', capitalizeFirst);
		case 'kebab':
			return joinWords(text, '-', (w) => w.toLowerCase());
		case 'constant':
			return joinWords(text, '_', (w) => w.toUpperCase());
		case 'dot':
			return joinWords(text, '.', (w) => w.toLowerCase());
		case 'path':
			return joinWords(text, '/', (w) => w.toLowerCase());
		case 'train':
			return joinWords(text, '-', capitalizeFirst);
		case 'capitalized':
			return capitalizedCase(text);
		case 'dedupeLines':
			return dedupeLines(text);
		case 'reverseLines':
			return reverseLines(text);
		case 'trimLines':
			return trimLines(text);
		case 'numberLines':
			return numberLines(text, options.startNumber ?? 1);
		case 'prefixSuffix':
			return prefixSuffixLines(text, options.prefix ?? '', options.suffix ?? '');
		case 'stylized':
			return stylizeText(text, options.stylizedStyle ?? 'bold');
	}
}
