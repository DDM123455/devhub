import { diffArrays } from 'diff';

export type DiffGranularity = 'char' | 'word' | 'line';
export type DiffLineType = 'unchanged' | 'added' | 'removed' | 'modified';

export interface DiffSegment {
	value: string;
	added?: boolean;
	removed?: boolean;
}

export interface DiffLineEntry {
	type: DiffLineType;
	leftText?: string;
	rightText?: string;
	leftSegments?: DiffSegment[];
	rightSegments?: DiffSegment[];
	hunkIndex: number | null;
}

export interface DiffOptions {
	ignoreCase?: boolean;
	// Collapses every run of whitespace (spaces, tabs, NBSP...) to one space and trims
	// the ends before comparing, so only *extra/different* whitespace is ignored.
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
// - normalizeUnicode: NFC-normalizes both sides.
// - ignoreEmptyLines: drops blank/whitespace-only lines from both sides entirely.
export function preprocessDiffInput(text: string, options: PreprocessOptions): string {
	let result = text;
	if (options.normalizeLineEndings) result = result.replace(/\r\n?/g, '\n');
	if (options.normalizeUnicode) result = result.normalize('NFC');
	if (options.ignoreEmptyLines) result = result.split('\n').filter((line) => line.trim() !== '').join('\n');
	return result;
}

// Splits a whole document into logical lines. A single trailing '\n' is a line
// *terminator*, not an extra empty line; any other empty line (including the empty
// line in "a\n\nb") is a real line and must survive — a previous version dropped
// them, which reported "a\nb" vs "a\n\nb" as identical and lost blank lines on merge.
export function splitDocumentLines(value: string): string[] {
	if (value === '') return [];
	const withoutTerminator = value.endsWith('\n') ? value.slice(0, -1) : value;
	return withoutTerminator.split('\n');
}

export type LineEndingStyle = 'crlf' | 'lf' | 'cr' | 'mixed' | 'none';

export function detectLineEnding(text: string): LineEndingStyle {
	const crlf = (text.match(/\r\n/g) ?? []).length;
	const lf = (text.match(/\n/g) ?? []).length - crlf;
	const cr = (text.match(/\r/g) ?? []).length - crlf;
	const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
	if (kinds === 0) return 'none';
	if (kinds > 1) return 'mixed';
	return crlf > 0 ? 'crlf' : lf > 0 ? 'lf' : 'cr';
}

export interface DiffInputNotes {
	lineEndingsDiffer: boolean;
	trailingNewlineDiffers: boolean;
}

// Differences that are invisible in a per-line diff but still real: a CRLF file vs.
// an LF file, or one side ending with a final newline and the other not. `left`/`right`
// are the PREPROCESSED texts, `rawLeft`/`rawRight` the originals.
export function analyzeDiffInput(rawLeft: string, rawRight: string, left: string, right: string): DiffInputNotes {
	const a = detectLineEnding(rawLeft);
	const b = detectLineEnding(rawRight);
	return {
		lineEndingsDiffer: a !== 'none' && b !== 'none' && a !== b,
		trailingNewlineDiffers: (left !== '' || right !== '') && left.endsWith('\n') !== right.endsWith('\n'),
	};
}

interface SegmenterLike {
	segment(input: string): Iterable<{ segment: string }>;
}

// Grapheme clusters (Intl.Segmenter where available) so a ZWJ emoji or a base letter
// plus combining marks is one unit instead of being split into broken halves.
export function segmentGraphemes(text: string): string[] {
	const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => SegmenterLike })
		.Segmenter;
	if (Segmenter) {
		return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
	}
	return Array.from(text);
}

function tokenizeWords(text: string): string[] {
	return text.match(/\s+|[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu) ?? [];
}

type Op = { kind: 'common'; left: string; right: string } | { kind: 'removed'; text: string } | { kind: 'added'; text: string };

function tokenKey(token: string, options: DiffOptions): string {
	let key = token;
	if (options.ignoreCase) key = key.toLowerCase();
	if (options.ignoreWhitespace && /^\s+$/.test(key)) key = ' ';
	return key;
}

function diffTokenOps(leftTokens: string[], rightTokens: string[], options: DiffOptions): Op[] {
	const parts = diffArrays(
		leftTokens.map((t) => tokenKey(t, options)),
		rightTokens.map((t) => tokenKey(t, options)),
	);
	const ops: Op[] = [];
	let li = 0;
	let ri = 0;
	for (const part of parts) {
		const n = part.value.length;
		if (part.added) {
			ops.push({ kind: 'added', text: rightTokens.slice(ri, ri + n).join('') });
			ri += n;
		} else if (part.removed) {
			ops.push({ kind: 'removed', text: leftTokens.slice(li, li + n).join('') });
			li += n;
		} else {
			// Keep each side's ORIGINAL text — a diff library's "common" value comes from one
			// side only, which silently rewrote the left column under ignoreCase/whitespace.
			ops.push({ kind: 'common', left: leftTokens.slice(li, li + n).join(''), right: rightTokens.slice(ri, ri + n).join('') });
			li += n;
			ri += n;
		}
	}
	return ops;
}

// A modified word/token is never highlighted as a solid block: wherever the word-level
// diff yields a removed chunk immediately followed by an added chunk, that pair is
// re-diffed per grapheme, so "hahah" → "hahahahah" highlights only the appended "ahah".
// Above CHAR_REFINE_MAX_LEN the refinement is skipped to bound the O(n*d) cost.
const CHAR_REFINE_MAX_LEN = 2000;
const CHAR_DIFF_MAX_LEN = 20000;

function refineOps(ops: Op[], options: DiffOptions): Op[] {
	const result: Op[] = [];
	for (let i = 0; i < ops.length; i++) {
		const current = ops[i];
		const next = ops[i + 1];
		if (
			current.kind === 'removed' &&
			next?.kind === 'added' &&
			current.text.length <= CHAR_REFINE_MAX_LEN &&
			next.text.length <= CHAR_REFINE_MAX_LEN
		) {
			result.push(...diffTokenOps(segmentGraphemes(current.text), segmentGraphemes(next.text), options));
			i += 1;
			continue;
		}
		result.push(current);
	}
	return result;
}

function opsToSegments(ops: Op[]): { leftSegments: DiffSegment[]; rightSegments: DiffSegment[] } {
	const leftSegments: DiffSegment[] = [];
	const rightSegments: DiffSegment[] = [];
	const push = (list: DiffSegment[], seg: DiffSegment) => {
		if (seg.value === '') return;
		const last = list[list.length - 1];
		if (last && !!last.added === !!seg.added && !!last.removed === !!seg.removed) last.value += seg.value;
		else list.push(seg);
	};
	for (const op of ops) {
		if (op.kind === 'common') {
			push(leftSegments, { value: op.left });
			push(rightSegments, { value: op.right });
		} else if (op.kind === 'removed') push(leftSegments, { value: op.text, removed: true });
		else push(rightSegments, { value: op.text, added: true });
	}
	return { leftSegments, rightSegments };
}

function diffLinePair(leftLine: string, rightLine: string, granularity: DiffGranularity, options: DiffOptions) {
	if (granularity === 'line') return undefined;
	if (leftLine.length + rightLine.length > CHAR_DIFF_MAX_LEN) return undefined;
	const ops =
		granularity === 'char'
			? diffTokenOps(segmentGraphemes(leftLine), segmentGraphemes(rightLine), options)
			: refineOps(diffTokenOps(tokenizeWords(leftLine), tokenizeWords(rightLine), options), options);
	return opsToSegments(ops);
}

export function lineKey(line: string, options: DiffOptions): string {
	let key = line;
	if (options.ignoreWhitespace) key = key.replace(/\s+/g, ' ').trim();
	if (options.ignoreCase) key = key.toLowerCase();
	return key;
}

// Builds a unified, line-by-line model of the diff: each source line becomes exactly
// one entry (unchanged / added / removed), except a removed block immediately followed
// by an added block, where lines are paired index-for-index into "modified" entries
// (with an intra-line sub-diff for highlighting) — any leftover lines on the longer
// side fall back to plain added/removed. Lines are compared via a normalised key
// (ignoreCase / ignoreWhitespace) but entries always carry each side's original text.
export function buildLineDiff(left: string, right: string, granularity: DiffGranularity, options: DiffOptions = {}): DiffLineEntry[] {
	const leftLines = splitDocumentLines(left);
	const rightLines = splitDocumentLines(right);
	const lineParts = diffArrays(
		leftLines.map((l) => lineKey(l, options)),
		rightLines.map((l) => lineKey(l, options)),
	);
	const entries: DiffLineEntry[] = [];
	let li = 0;
	let ri = 0;

	let i = 0;
	while (i < lineParts.length) {
		const part = lineParts[i];
		const count = part.value.length;

		if (!part.added && !part.removed) {
			for (let k = 0; k < count; k++) {
				entries.push({ type: 'unchanged', leftText: leftLines[li++], rightText: rightLines[ri++], hunkIndex: null });
			}
			i += 1;
			continue;
		}

		if (part.removed && lineParts[i + 1]?.added) {
			const addedCount = lineParts[i + 1].value.length;
			const removedLines = leftLines.slice(li, li + count);
			const addedLines = rightLines.slice(ri, ri + addedCount);
			li += count;
			ri += addedCount;
			const pairCount = Math.min(removedLines.length, addedLines.length);
			for (let j = 0; j < pairCount; j++) {
				// Re-check equality: several equally-minimal alignments can pair two
				// equivalent lines as removed+added instead of unchanged.
				if (lineKey(removedLines[j], options) === lineKey(addedLines[j], options)) {
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
			for (let k = 0; k < count; k++) entries.push({ type: 'removed', leftText: leftLines[li++], hunkIndex: null });
			i += 1;
			continue;
		}

		for (let k = 0; k < count; k++) entries.push({ type: 'added', rightText: rightLines[ri++], hunkIndex: null });
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
