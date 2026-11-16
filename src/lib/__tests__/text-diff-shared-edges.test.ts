import { describe, expect, it } from 'vitest';
import { buildLineDiff, buildDiffHtml, renderMergedColumn } from '../text-diff';

describe.each(['char', 'word'] as const)('shared edges (%s)', mode => {
  const compare = (a: string, b: string) => buildLineDiff(a, b, mode);
  it('marks only excess dots, leaving the following Vietnamese text unchanged', () => {
    const rows = compare('nội dung ..... phần phía sau giống nhau', 'nội dung ... phần phía sau giống nhau');
    expect(rows[0].leftSegments?.filter(s => s.removed).map(s => s.value).join('')).toBe('..');
    expect(rows[0].rightSegments?.filter(s => s.added)).toEqual([]);
  });
  it('keeps a long common suffix outside the highlight despite different prefixes', () => {
    const tail = ' ..... phía sau giống nhau '.repeat(1000);
    const rows = compare('AAA' + tail, 'BBB' + tail);
    expect(rows[0].leftSegments?.filter(s => s.removed).map(s => s.value)).toEqual(['AAA']);
    expect(rows[0].rightSegments?.filter(s => s.added).map(s => s.value)).toEqual(['BBB']);
  });
  it('preserves the common suffix even when the changed middle is too large to refine', () => {
    const a = 'start ..... ' + 'x'.repeat(12000) + ' phần giống nhau';
    const b = 'start ..... ' + 'y'.repeat(12000) + ' phần giống nhau';
    const rows = compare(a, b);
    expect(rows[0].leftSegments?.filter(s => s.removed).map(s => s.value)).toEqual(['x'.repeat(12000)]);
    expect(renderMergedColumn(rows, new Map(), 'left')).toBe(a);
    expect(renderMergedColumn(rows, new Map(), 'right')).toBe(b);
    const html = buildDiffHtml(rows, {title:'Diff',left:'A',right:'B'});
    expect(html).not.toContain('<mark> phần giống nhau');
  });
  it.each([
    ['a\u0301 tail', 'b\u0301 tail', 'a\u0301', 'b\u0301'],
    ['👩‍💻 tail', '👩‍🔬 tail', '👩‍💻', '👩‍🔬'],
    ['same 🇻🇳 end', 'same 🇻🇺 end', '🇻🇳', '🇻🇺'],
  ])('never splits a grapheme at a shared boundary: %s', (a,b,removed,added) => {
    const row = compare(a,b)[0];
    expect(row.leftSegments?.filter(s=>s.removed).map(s=>s.value).join('')).toBe(removed);
    expect(row.rightSegments?.filter(s=>s.added).map(s=>s.value).join('')).toBe(added);
  });
  it('does not suppress a real change after repeated text', () => {
    const rows = compare('a ..... same same OLD tail', 'a ... same same NEW tail');
    expect(rows[0].leftSegments?.some(s=>s.removed && s.value.includes('OLD'))).toBe(true);
    expect(rows[0].rightSegments?.some(s=>s.added && s.value.includes('NEW'))).toBe(true);
  });
});
