import { describe, expect, it } from 'vitest';
import {
	buildDiffHtml,
	buildLineDiff,
	buildUnifiedPatch,
	buildUnifiedRows,
	collapseContext,
	compileIgnorePatterns,
	getUnifiedHunkStarts,
} from '../text-diff';

const lines = (n: number, replace: Record<number, string> = {}) =>
	Array.from({ length: n }, (_, i) => replace[i + 1] ?? `line ${i + 1}`).join('\n');

describe('collapseContext', () => {
	it('hides unchanged lines far from changes and keeps a hunk marker', () => {
		const entries = buildLineDiff(lines(30), lines(30, { 15: 'CHANGED' }), 'line');
		const result = collapseContext(entries, 2);
		// 2 lines context before + changed line + 2 after + 2 separators
		expect(result.entries.length).toBe(5 + 2);
		const separators = result.entries.filter((e) => e.collapsed !== undefined);
		expect(separators.map((s) => s.collapsed)).toEqual([12, 13]);
		expect(result.sourceIndex.filter((i) => i === -1).length).toBe(2);
	});
	it('does not collapse a single hidden line and handles no changes', () => {
		const entries = buildLineDiff(lines(6, {}), lines(6, { 1: 'X', 5: 'Y' }), 'line');
		// lines 3 only between the two changes with context 1: line 3 is within 1 of ... keep all
		expect(collapseContext(entries, 1).entries.some((e) => e.collapsed !== undefined)).toBe(false);
		const same = buildLineDiff('a\nb', 'a\nb', 'line');
		expect(collapseContext(same, 1).entries).toEqual(same);
	});
});

describe('buildUnifiedRows', () => {
	it('splits modified lines into -/+ rows with original numbering', () => {
		const entries = buildLineDiff('a\nb\nc', 'a\nB\nc\nd', 'word');
		const rows = buildUnifiedRows(entries, null);
		expect(rows.map((r) => [r.kind, r.text, r.leftNo, r.rightNo])).toEqual([
			['context', 'a', 1, 1],
			['removed', 'b', 2, null],
			['added', 'B', null, 2],
			['context', 'c', 3, 3],
			['added', 'd', null, 4],
		]);
		expect(getUnifiedHunkStarts(rows)).toEqual([1, 4]);
	});
	it('collapsed rows keep numbering of the surviving lines', () => {
		const entries = buildLineDiff(lines(20), lines(20, { 10: 'X' }), 'line');
		const rows = buildUnifiedRows(entries, 1);
		expect(rows[0]).toMatchObject({ kind: 'collapsed', collapsed: 8 });
		expect(rows[1]).toMatchObject({ kind: 'context', leftNo: 9, rightNo: 9 });
	});
});

describe('buildUnifiedPatch', () => {
	it('produces git-style hunks', () => {
		const entries = buildLineDiff('a\nb\nc\nd\ne', 'a\nb\nX\nd\ne', 'line');
		const patch = buildUnifiedPatch(entries, { oldName: 'a/f.txt', newName: 'b/f.txt', context: 1 });
		expect(patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -2,3 +2,3 @@\n b\n-c\n+X\n d\n');
	});
	it('merges close hunks, splits far ones, and returns empty for no change', () => {
		const a = lines(20);
		const b = lines(20, { 2: 'X', 18: 'Y' });
		const patch = buildUnifiedPatch(buildLineDiff(a, b, 'line'), { context: 3 });
		expect(patch.match(/^@@/gm)?.length).toBe(2);
		const near = buildUnifiedPatch(buildLineDiff(a, lines(20, { 5: 'X', 9: 'Y' }), 'line'), { context: 3 });
		expect(near.match(/^@@/gm)?.length).toBe(1);
		expect(buildUnifiedPatch(buildLineDiff('a', 'a', 'line'))).toBe('');
	});
	it('handles pure additions at start (count 0 side)', () => {
		const patch = buildUnifiedPatch(buildLineDiff('', 'x\ny', 'line'), { context: 0 });
		expect(patch).toContain('@@ -0,0 +1,2 @@');
	});
});

describe('ignore patterns', () => {
	it('treats lines differing only in ignored text as unchanged', () => {
		const { patterns, error } = compileIgnorePatterns(['\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}', '']);
		expect(error).toBeNull();
		const entries = buildLineDiff('2024-01-01 10:00:00 start\nsame', '2025-05-05 11:11:11 start\nsame', 'line', { ignorePatterns: patterns });
		expect(entries.every((e) => e.type === 'unchanged')).toBe(true);
		// displayed text is still the original
		expect(entries[0].leftText).toContain('2024');
		expect(entries[0].rightText).toContain('2025');
	});
	it('reports invalid patterns', () => {
		expect(compileIgnorePatterns(['(']).error).toContain('(');
	});
});

describe('buildDiffHtml', () => {
	it('escapes content and highlights changed segments', () => {
		const entries = buildLineDiff('<b>a</b>', '<b>b</b>', 'char');
		const html = buildDiffHtml(entries, { title: 'T <x>', left: 'L', right: 'R' });
		expect(html).toContain('&lt;b&gt;');
		expect(html).toContain('<mark>');
		expect(html).toContain('T &lt;x&gt;');
		expect(html).not.toContain('<b>a</b>');
	});
});
