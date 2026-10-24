import { describe, expect, it } from 'vitest';
import {
	analyzeDiffInput,
	buildDiffHtml,
	buildLineDiff,
	buildUnifiedPatch,
	buildUnifiedRows,
	collapseContext,
	compileIgnorePatterns,
	countLineStats,
	getHunkStartRows,
	numberEntries,
	preprocessDiffInput,
	renderMergedColumn,
	splitDocumentLines,
	type DiffGranularity,
	type DiffOptions,
	type PreprocessOptions,
} from '../text-diff';

const diff = (a: string, b: string, g: DiffGranularity = 'word', o: DiffOptions = {}, pre?: PreprocessOptions) =>
	buildLineDiff(pre ? preprocessDiffInput(a, pre) : a, pre ? preprocessDiffInput(b, pre) : b, g, o);
const stats = (a: string, b: string, g?: DiffGranularity, o?: DiffOptions, pre?: PreprocessOptions) => countLineStats(diff(a, b, g, o, pre));
const same = { added: 0, removed: 0, modified: 0 };

describe('same content, different lines', () => {
	it('reordered lines are reported as removed + added (line diff has no move detection)', () => {
		expect(stats('a\nb\nc\nd', 'c\nd\na\nb')).toEqual({ added: 2, removed: 2, modified: 0 });
	});
	it('swapping two adjacent lines is one removal and one addition', () => {
		expect(stats('a\nb\nc', 'a\nc\nb')).toEqual({ added: 1, removed: 1, modified: 0 });
	});
	it('the same words wrapped at different places differ line by line', () => {
		expect(stats('one two three four', 'one two\nthree four')).toEqual({ added: 1, removed: 0, modified: 1 });
	});
	it('a duplicated line is counted, not merged', () => {
		expect(stats('a\na\na', 'a\na')).toEqual({ added: 0, removed: 1, modified: 0 });
	});
	it('moving one line to the end gives exactly one removal and one addition', () => {
		expect(stats('l1\nl2\nl3\nl4', 'l2\nl3\nl4\nl1')).toEqual({ added: 1, removed: 1, modified: 0 });
	});
});

describe('blank lines, whitespace and line endings', () => {
	it('extra blank lines are additions, and ignoreEmptyLines removes them', () => {
		expect(stats('a\nb', 'a\n\n\nb')).toEqual({ added: 2, removed: 0, modified: 0 });
		expect(stats('a\nb', 'a\n\n\nb', 'word', {}, { ignoreEmptyLines: true })).toEqual(same);
	});
	it('whitespace-only line differs from an empty line unless whitespace is ignored', () => {
		expect(stats('a\n   \nb', 'a\n\nb').modified).toBe(1);
		expect(stats('a\n   \nb', 'a\n\nb', 'word', { ignoreWhitespace: true })).toEqual(same);
	});
	it('trailing spaces and tabs vs spaces', () => {
		expect(stats('a ', 'a').modified).toBe(1);
		expect(stats('a ', 'a', 'word', { ignoreWhitespace: true })).toEqual(same);
		expect(stats('a\tb', 'a    b', 'word', { ignoreWhitespace: true })).toEqual(same);
		expect(stats('a b', 'a b', 'word', { ignoreWhitespace: true })).toEqual(same);
	});
	it('CRLF vs LF: every line differs raw, nothing differs once normalised', () => {
		expect(stats('a\r\nb\r\nc', 'a\nb\nc').modified).toBe(2);
		expect(stats('a\r\nb\r\nc', 'a\nb\nc', 'word', {}, { normalizeLineEndings: true })).toEqual(same);
	});
	it('mixed endings inside one side and lone CR are normalised too', () => {
		expect(stats('a\r\nb\nc\rd', 'a\nb\nc\nd', 'word', {}, { normalizeLineEndings: true })).toEqual(same);
	});
	it('a single trailing newline is a terminator, not an extra line', () => {
		expect(stats('a\nb\n', 'a\nb')).toEqual(same);
		expect(splitDocumentLines('a\nb\n')).toEqual(['a', 'b']);
		expect(splitDocumentLines('a\n\n')).toEqual(['a', '']);
		expect(splitDocumentLines('\n')).toEqual(['']);
		expect(splitDocumentLines('')).toEqual([]);
	});
	it('the trailing-newline and line-ending differences are still surfaced as notes', () => {
		const a = 'a\nb\n';
		const b = 'a\nb';
		expect(analyzeDiffInput(a, b, a, b)).toEqual({ lineEndingsDiffer: false, trailingNewlineDiffers: true });
		expect(analyzeDiffInput('a\r\nb', 'a\nb', 'a\nb', 'a\nb').lineEndingsDiffer).toBe(true);
	});
	it('case-insensitive compare keeps each side\'s original text', () => {
		const e = diff('Hello\nWORLD', 'hello\nworld', 'word', { ignoreCase: true });
		expect(countLineStats(e)).toEqual(same);
		expect(e[0].leftText).toBe('Hello');
		expect(e[0].rightText).toBe('hello');
	});
});

describe('empty and degenerate inputs', () => {
	it('both empty, one empty, a lone newline', () => {
		expect(diff('', '')).toEqual([]);
		expect(stats('', 'a\nb')).toEqual({ added: 2, removed: 0, modified: 0 });
		expect(stats('a\nb', '')).toEqual({ added: 0, removed: 2, modified: 0 });
		expect(stats('\n', '')).toEqual({ added: 0, removed: 1, modified: 0 });
	});
	it('a single character differing', () => {
		const e = diff('a', 'b', 'char');
		expect(e).toHaveLength(1);
		expect(e[0].type).toBe('modified');
	});
	it('whitespace-only documents', () => {
		expect(stats('   ', '   ')).toEqual(same);
		expect(stats('   ', '')).toEqual({ added: 0, removed: 1, modified: 0 });
	});
	it('null bytes and control characters do not break splitting', () => {
		expect(stats('a\u0000b\nc', 'a\u0000b\nc')).toEqual(same);
		expect(stats('a\u0000b', 'a\u0001b')).toEqual({ added: 0, removed: 0, modified: 1 });
	});
	it('a long line (about 8k chars per side) with one changed character gets a precise 1-character highlight', () => {
		const base = 'x'.repeat(4000);
		const t0 = performance.now();
		const e = diff(`${base}A${base}`, `${base}B${base}`, 'char');
		expect(performance.now() - t0).toBeLessThan(3000);
		expect(e[0].type).toBe('modified');
		const removed = (e[0].leftSegments ?? []).filter((s) => s.removed);
		expect(removed.map((s) => s.value)).toEqual(['A']);
	});
	it('beyond 20 000 combined characters the intra-line diff is skipped (whole line shown) and stays fast', () => {
		const base = 'x'.repeat(25000);
		const t0 = performance.now();
		const e = diff(`${base}A${base}`, `${base}B${base}`, 'char');
		expect(performance.now() - t0).toBeLessThan(1000);
		expect(e[0].type).toBe('modified');
		expect(e[0].leftSegments).toBeUndefined();
	});
});

describe('unicode', () => {
	it('composed vs decomposed é differ until NFC normalisation is on', () => {
		expect(stats('café', 'café').modified).toBe(1);
		expect(stats('café', 'café', 'word', {}, { normalizeUnicode: true })).toEqual(same);
	});
	it('surrogate pairs and emoji are not split in half at char level', () => {
		const e = diff('\u{1d4b3} ok', '\u{1d4b4} ok', 'char');
		const segs = e[0].leftSegments ?? [];
		for (const s of segs) expect(/[\ud800-\udbff]$|^[\udc00-\udfff]/.test(s.value)).toBe(false);
	});
	it('RTL and CJK text compare normally', () => {
		expect(stats('שלום עולם', 'שלום עולם')).toEqual(same);
		expect(stats('こんにちは世界', 'こんにちは世界')).toEqual(same);
		expect(stats('こんにちは世界', 'こんばんは世界').modified).toBe(1);
	});
});

describe('ignore patterns', () => {
	it('timestamps are ignored but the original text stays visible', () => {
		const { patterns } = compileIgnorePatterns(['\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}']);
		const e = diff('2024-01-01 10:00:00 start\nok', '2025-02-02 11:11:11 start\nok', 'word', { ignorePatterns: patterns });
		expect(countLineStats(e)).toEqual(same);
		expect(e[0].leftText).toContain('2024');
		expect(e[0].rightText).toContain('2025');
	});
	it('invalid regex is reported and ignored, blank lines are skipped', () => {
		expect(compileIgnorePatterns(['(']).error).toMatch(/^\(:/);
		expect(compileIgnorePatterns(['', '   ']).patterns).toHaveLength(0);
	});
	it('a pattern that matches everything makes every line equal (and does not hang)', () => {
		const { patterns } = compileIgnorePatterns(['.*']);
		expect(stats('a\nb', 'x\ny', 'word', { ignorePatterns: patterns })).toEqual(same);
	});
	it('patterns combine with ignoreCase and ignoreWhitespace', () => {
		const { patterns } = compileIgnorePatterns(['id=\\d+']);
		expect(stats('User  ID=5  Done', 'user id=77 done', 'word', { ignorePatterns: patterns, ignoreCase: true, ignoreWhitespace: true })).toEqual(
			// `id=5` is case-sensitive in the pattern, so only the lowercase one is stripped: lines still differ
			{ added: 0, removed: 0, modified: 1 },
		);
	});
});

describe('derived views', () => {
	const entries = diff('a\nb\nc\nd\ne\nf\ng\nh', 'a\nb\nc\nd\nX\nf\ng\nh');
	it('hunk starts and numbering', () => {
		expect(getHunkStartRows(entries)).toEqual([4]);
		const n = numberEntries(entries);
		expect(n.left).toHaveLength(entries.length);
		expect(n.left[0]).toBe(1);
		expect(n.right[entries.length - 1]).toBe(8);
	});
	it('collapseContext hides far unchanged lines and keeps the change', () => {
		const c = collapseContext(entries, 1);
		expect(c.entries.length).toBeLessThan(entries.length);
		expect(c.entries.some((e) => e.type === 'modified')).toBe(true);
		expect(c.sourceIndex.includes(-1)).toBe(true);
	});
	it('collapseContext with no changes at all does not blow up', () => {
		const none = diff('a\nb', 'a\nb');
		expect(collapseContext(none, 2).entries.length).toBeGreaterThanOrEqual(0);
	});
	it('unified patch: empty when identical, proper headers otherwise', () => {
		expect(buildUnifiedPatch(diff('a\nb', 'a\nb'))).toBe('');
		const patch = buildUnifiedPatch(entries, { oldName: 'old.txt', newName: 'new.txt', context: 1 });
		expect(patch).toContain('--- old.txt');
		expect(patch).toContain('+++ new.txt');
		expect(patch).toMatch(/@@ -4,3 \+4,3 @@/);
		expect(patch).toContain('-e');
		expect(patch).toContain('+X');
	});
	it('unified patch handles pure additions and pure deletions', () => {
		expect(buildUnifiedPatch(diff('', 'a\nb'))).toContain('+a');
		expect(buildUnifiedPatch(diff('a\nb', ''))).toContain('-a');
	});
	it('unified rows number both sides', () => {
		const rows = buildUnifiedRows(entries, 1);
		expect(rows.some((r) => r.kind === 'removed')).toBe(true);
		expect(rows.some((r) => r.kind === 'added')).toBe(true);
	});
	it('HTML export escapes markup from either side', () => {
		const html = buildDiffHtml(diff('<script>alert(1)</script>', '<b onclick="x">hi</b>'), { title: 'T <x>', left: 'L', right: 'R' });
		expect(html).not.toContain('<script>alert');
		expect(html).not.toContain('<b onclick');
		// Markup is escaped even though <mark> highlights are woven through it.
		expect(html).toContain('&lt;');
		expect(html).toContain('&quot;x&quot;');
		expect(html).not.toMatch(/<\/?script/i);
		expect(html).not.toMatch(/<b\b/i);
	});
	it('merge column: accepting the other side swaps that hunk', () => {
		const e = diff('a\nb\nc', 'a\nB\nc');
		const hunk = e.find((x) => x.hunkIndex !== null)!.hunkIndex!;
		const left = renderMergedColumn(e, new Map([[hunk, { leftUsesRight: true, rightUsesLeft: false }]]), 'left');
		expect(left).toBe('a\nB\nc');
		const right = renderMergedColumn(e, new Map([[hunk, { leftUsesRight: false, rightUsesLeft: true }]]), 'right');
		expect(right).toBe('a\nb\nc');
	});
});

describe('performance on large input', () => {
	const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('\n');
	it('20 000 identical lines', () => {
		const t = lines(20000, (i) => `line ${i}`);
		const t0 = performance.now();
		expect(stats(t, t)).toEqual(same);
		expect(performance.now() - t0).toBeLessThan(2000);
	});
	it('5 000 lines with one edit in the middle', () => {
		const a = lines(5000, (i) => `line ${i}`);
		const b = lines(5000, (i) => (i === 2500 ? 'CHANGED' : `line ${i}`));
		const t0 = performance.now();
		expect(stats(a, b)).toEqual({ added: 0, removed: 0, modified: 1 });
		expect(performance.now() - t0).toBeLessThan(2000);
	});
	it('2 000 lines that are completely different', () => {
		const a = lines(2000, (i) => `left ${i}`);
		const b = lines(2000, (i) => `right ${i}`);
		const t0 = performance.now();
		expect(stats(a, b).modified).toBe(2000);
		expect(performance.now() - t0).toBeLessThan(4000);
	});
	it('2 000 lines in reverse order', () => {
		const a = lines(2000, (i) => `line ${i}`);
		const b = lines(2000, (i) => `line ${1999 - i}`);
		const t0 = performance.now();
		const s = stats(a, b);
		expect(s.added + s.removed + s.modified).toBeGreaterThan(0);
		expect(performance.now() - t0).toBeLessThan(5000);
	});
});

describe('ignore line breaks (same text wrapped differently)', () => {
	const pre: PreprocessOptions = { ignoreLineBreaks: true };
	it('re-wrapped text compares as identical', () => {
		expect(stats('one two three four', 'one two\nthree four', 'word', {}, pre)).toEqual(same);
		expect(stats('The quick brown\nfox jumps\nover the lazy dog', 'The quick brown fox jumps over the lazy dog', 'word', {}, pre)).toEqual(same);
	});
	it('handles CRLF, lone CR, indentation after the break and blank lines', () => {
		expect(stats('a b\r\nc d', 'a b c d', 'word', {}, pre)).toEqual(same);
		expect(stats('a b\rc d', 'a b c d', 'word', {}, pre)).toEqual(same);
		expect(stats('a b\n    c d', 'a b c d', 'word', {}, pre)).toEqual(same);
		expect(stats('a b\n\n\nc d', 'a b c d', 'word', {}, pre)).toEqual(same);
		expect(stats('a b\n', 'a b', 'word', {}, pre)).toEqual(same);
	});
	it('still reports a real word change, with a word-level highlight', () => {
		const e = diff('one two\nthree four', 'one two\nthree FIVE', 'word', {}, pre);
		expect(countLineStats(e)).toEqual({ added: 0, removed: 0, modified: 1 });
		expect((e[0].leftSegments ?? []).filter((s) => s.removed).map((s) => s.value.trim())).toContain('four');
	});
	it('does not glue words together (a break is a space, not nothing)', () => {
		expect(stats('ab\ncd', 'abcd', 'word', {}, pre).modified).toBe(1);
	});
	it('empty and whitespace-only documents stay empty', () => {
		expect(preprocessDiffInput('', pre)).toBe('');
		expect(preprocessDiffInput('\n\n  \n', pre)).toBe('');
	});
});

describe('ignore line order (sort lines)', () => {
	const sorted: DiffOptions = { sortLines: true };
	it('the same lines in another order are identical', () => {
		expect(stats('a\nb\nc\nd', 'c\nd\na\nb', 'word', sorted)).toEqual(same);
		expect(stats('l1\nl2\nl3', 'l3\nl1\nl2', 'word', sorted)).toEqual(same);
	});
	it('duplicates still count: three copies vs two is a difference', () => {
		expect(stats('a\na\na', 'a\na', 'word', sorted)).toEqual({ added: 0, removed: 1, modified: 0 });
	});
	it('a genuinely different line is still found after sorting', () => {
		const e = diff('apple\nbanana\ncherry', 'cherry\napple\nblueberry', 'word', sorted);
		const s = countLineStats(e);
		expect(s.added + s.removed + s.modified).toBeGreaterThan(0);
		expect(e.filter((x) => x.type === 'unchanged').map((x) => x.leftText)).toEqual(['apple', 'cherry']);
	});
	it('sorting uses the comparison key, so ignoreCase does not make the order differ', () => {
		expect(stats('a\nB', 'A\nb', 'word', { sortLines: true, ignoreCase: true })).toEqual(same);
		expect(stats('b\nA', 'B\na', 'word', { sortLines: true, ignoreCase: true })).toEqual(same);
	});
	it('works together with ignoreWhitespace and keeps the original text visible', () => {
		const e = diff('  z\ny', 'y\nz  ', 'word', { sortLines: true, ignoreWhitespace: true });
		expect(countLineStats(e)).toEqual(same);
		expect(e.map((x) => x.leftText).sort()).toEqual(['  z', 'y']);
	});
	it('empty documents and a single line', () => {
		expect(diff('', '', 'word', sorted)).toEqual([]);
		expect(stats('x', 'x', 'word', sorted)).toEqual(same);
		expect(stats('', 'x', 'word', sorted)).toEqual({ added: 1, removed: 0, modified: 0 });
	});
	it('does not change anything when the option is off', () => {
		expect(stats('a\nb', 'b\na', 'word', {})).toEqual({ added: 1, removed: 1, modified: 0 });
	});
	it('2 000 shuffled lines sort-compare as identical, quickly', () => {
		const base = Array.from({ length: 2000 }, (_, i) => `row ${i}`);
		const shuffled = [...base].sort((a, b) => (a.length === b.length ? (a < b ? 1 : -1) : b.length - a.length));
		const t0 = performance.now();
		expect(stats(base.join('\n'), shuffled.join('\n'), 'word', sorted)).toEqual(same);
		expect(performance.now() - t0).toBeLessThan(1500);
	});
});
