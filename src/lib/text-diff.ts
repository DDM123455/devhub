import { diffChars, diffWords, diffLines, type Change, type DiffLinesOptionsNonabortable } from 'diff';

export type DiffGranularity = 'char' | 'word' | 'line';
export type DiffLineType = 'unchanged' | 'added' | 'removed' | 'modified';

export interface DiffLineEntry {
	type: DiffLineType;
	leftText?: string;
	rightText?: string;
	leftSegments?: Change[];
	rightSegments?: Change[];
	hunkIndex: number | null;
}

export interface DiffOptions {
	ignoreCase?: boolean;
	ignoreWhitespace?: boolean;
}

export interface PreprocessOptions {
	normalizeLineEndings?: boolean;
	normalizeUnicode?: boolean;
	ignoreEmptyLines?: boolean;
}

// Applied to both sides before diffing (not to the raw textarea value the user sees/
// edits) — each option strips a specific kind of "noise" difference the diff should
// never report as a change:
// - normalizeLineEndings: CRLF/CR → LF, so a file saved on Windows vs. Unix doesn't
//   show every single line as modified.
// - normalizeUnicode: NFC-normalizes both sides, so visually-identical text encoded
//   with different combining-character sequences (e.g. "é" as one codepoint vs. "e" +
//   combining acute) doesn't register as a difference.
// - ignoreEmptyLines: drops blank/whitespace-only lines from both sides entirely, so
//   blank-line-count differences don't appear as added/removed rows.
export function preprocessDiffInput(text: string, options: PreprocessOptions): string {
	let result = text;
	if (options.normalizeLineEndings) result = result.replace(/\r\n?/g, '\n');
	if (options.normalizeUnicode) result = result.normalize('NFC');
	if (options.ignoreEmptyLines) result = result.split('\n').filter((line) => line.trim() !== '').join('\n');
	return result;
}

// diffLines' Change.value contains one or more complete lines, each (except
// possibly the very last line in the whole document) ending with '\n'.
function splitIntoLines(value: string): string[] {
	const withoutTrailingNewline = value.endsWith('\n') ? value.slice(0, -1) : value;
	return withoutTrailingNewline === '' ? [] : withoutTrailingNewline.split('\n');
}

// A modified word/token is never highlighted as a solid block. Wherever diffWords
// produces a removed chunk immediately followed by an added chunk (i.e. one or more
// words were replaced, not purely inserted or deleted), that pair is re-diffed at the
// character level and the coarse word-level pair is replaced with the fine-grained
// result — this is the "Line → Word → Character" layering DiffChecker/GitHub use, so
// "hahah" → "hahahahah" highlights only the appended "ahah", not the whole word.
// Above CHAR_REFINE_MAX_LEN, characters diffing degrades to O(n*d) on long modified
// spans, so very long replaced chunks fall back to the coarse word-level pair instead
// of risking a multi-second stall on pathological input.
const CHAR_REFINE_MAX_LEN = 2000;

function refineModifiedWordPairs(changes: Change[], ignoreCase: boolean | undefined): Change[] {
	const result: Change[] = [];
	let i = 0;
	while (i < changes.length) {
		const current = changes[i];
		const next = changes[i + 1];
		if (
			current.removed &&
			next?.added &&
			current.value.length <= CHAR_REFINE_MAX_LEN &&
			next.value.length <= CHAR_REFINE_MAX_LEN
		) {
			result.push(...diffChars(current.value, next.value, { ignoreCase }));
			i += 2;
			continue;
		}
		result.push(current);
		i += 1;
	}
	return result;
}

function diffLinePair(leftLine: string, rightLine: string, granularity: DiffGranularity, options: DiffOptions) {
	if (granularity === 'line') return undefined;
	const rawSegments =
		granularity === 'char'
			? diffChars(leftLine, rightLine, { ignoreCase: options.ignoreCase })
			: diffWords(leftLine, rightLine, { ignoreCase: options.ignoreCase });
	const segments = granularity === 'word' ? refineModifiedWordPairs(rawSegments, options.ignoreCase) : rawSegments;
	return {
		leftSegments: segments.filter((s) => !s.added),
		rightSegments: segments.filter((s) => !s.removed),
	};
}

// Builds a unified, line-by-line model of the diff: each source line becomes exactly
// one entry (unchanged / added / removed), except a removed block immediately followed
// by an added block, where lines are paired index-for-index into "modified" entries
// (with an intra-line sub-diff for highlighting) — any leftover lines on the longer
// side fall back to plain added/removed. This mirrors how most side-by-side diff tools
// (GitHub split view, Beyond Compare, WinMerge) distinguish "replaced" lines from pure
// insertions/deletions.
export function buildLineDiff(left: string, right: string, granularity: DiffGranularity, options: DiffOptions = {}): DiffLineEntry[] {
	const lineOptions: DiffLinesOptionsNonabortable & { ignoreCase?: boolean } = {
		ignoreWhitespace: options.ignoreWhitespace,
		ignoreCase: options.ignoreCase,
	};
	const lineParts = diffLines(left, right, lineOptions);
	const entries: DiffLineEntry[] = [];

	let i = 0;
	while (i < lineParts.length) {
		const part = lineParts[i];

		if (!part.added && !part.removed) {
			for (const line of splitIntoLines(part.value)) {
				entries.push({ type: 'unchanged', leftText: line, rightText: line, hunkIndex: null });
			}
			i += 1;
			continue;
		}

		if (part.removed && lineParts[i + 1]?.added) {
			const removedLines = splitIntoLines(part.value);
			const addedLines = splitIntoLines(lineParts[i + 1].value);
			const pairCount = Math.min(removedLines.length, addedLines.length);
			for (let j = 0; j < pairCount; j++) {
				// jsdiff's diffLines picks *a* minimal alignment, not necessarily the one that
				// maximizes recognized unchanged lines — when several equally-minimal alignments
				// exist, it can end up grouping two byte-identical lines into a removed+added
				// pair instead of recognizing them as unchanged. Re-check equality here so that
				// case doesn't render as a spurious "modified" (orange) row for text that's
				// actually identical.
				if (removedLines[j] === addedLines[j]) {
					entries.push({ type: 'unchanged', leftText: removedLines[j], rightText: addedLines[j], hunkIndex: null });
					continue;
				}
				const sub = diffLinePair(removedLines[j], addedLines[j], granularity, options);
				entries.push({
					type: 'modified',
					leftText: removedLines[j],
					rightText: addedLines[j],
					leftSegments: sub?.leftSegments,
					rightSegments: sub?.rightSegments,
					hunkIndex: null,
				});
			}
			for (let j = pairCount; j < removedLines.length; j++) {
				entries.push({ type: 'removed', leftText: removedLines[j], hunkIndex: null });
			}
			for (let j = pairCount; j < addedLines.length; j++) {
				entries.push({ type: 'added', rightText: addedLines[j], hunkIndex: null });
			}
			i += 2;
			continue;
		}

		if (part.removed) {
			for (const line of splitIntoLines(part.value)) entries.push({ type: 'removed', leftText: line, hunkIndex: null });
			i += 1;
			continue;
		}

		for (const line of splitIntoLines(part.value)) entries.push({ type: 'added', rightText: line, hunkIndex: null });
		i += 1;
	}

	let hunkCounter = -1;
	let inHunk = false;
	for (const entry of entries) {
		if (entry.type === 'unchanged') {
			inHunk = false;
			continue;
		}
		if (!inHunk) {
			hunkCounter += 1;
			inHunk = true;
		}
		entry.hunkIndex = hunkCounter;
	}

	return entries;
}

export function countLineStats(entries: DiffLineEntry[]): { added: number; removed: number; modified: number } {
	let added = 0;
	let removed = 0;
	let modified = 0;
	for (const entry of entries) {
		if (entry.type === 'added') added += 1;
		else if (entry.type === 'removed') removed += 1;
		else if (entry.type === 'modified') modified += 1;
	}
	return { added, removed, modified };
}

// Row index (into `entries`) of the first line of each hunk — used to jump the
// synced-scroll view to "next/previous change" and to anchor the merge tool's
// accept-left/accept-right controls.
export function getHunkStartRows(entries: DiffLineEntry[]): number[] {
	const starts: number[] = [];
	let lastHunk: number | null = null;
	entries.forEach((entry, index) => {
		if (entry.hunkIndex !== null && entry.hunkIndex !== lastHunk) {
			starts.push(index);
		}
		lastHunk = entry.hunkIndex;
	});
	return starts;
}

export interface HunkOverride {
	leftUsesRight?: boolean;
	rightUsesLeft?: boolean;
}

// Renders one merge-tool column as plain text: each entry contributes its own side's
// line unless the user accepted the other side for that entry's hunk, in which case
// the other side's line is used instead (or the line is dropped entirely, if the other
// side doesn't have a line there — e.g. adopting a deletion). Overrides are keyed by
// hunk rather than baked into the source text so hunk boundaries stay stable while the
// user works through a merge instead of shifting after every accept click.
export function renderMergedColumn(entries: DiffLineEntry[], overrides: Map<number, HunkOverride>, side: 'left' | 'right'): string {
	const lines: string[] = [];
	for (const entry of entries) {
		const override = entry.hunkIndex !== null ? overrides.get(entry.hunkIndex) : undefined;
		const text =
			side === 'left'
				? override?.leftUsesRight
					? entry.rightText
					: entry.leftText
				: override?.rightUsesLeft
					? entry.leftText
					: entry.rightText;
		if (text !== undefined) lines.push(text);
	}
	return lines.join('\n');
}
