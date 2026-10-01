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
	| 'sortLines';

export interface CaseOptions {
	// Compare embedded numbers by value when sorting lines ("file2" < "file10").
	naturalSort?: boolean;
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

export function sortLines(text: string, naturalSort: boolean): string {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const collator = new Intl.Collator(undefined, naturalSort ? { numeric: true, sensitivity: 'base' } : undefined);
	return lines.sort((a, b) => collator.compare(a, b)).join('\n');
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
	}
}
