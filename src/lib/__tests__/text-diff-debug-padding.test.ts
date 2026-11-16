import { describe, expect, it } from 'vitest';
import { buildLineDiff, renderMergedColumn, buildUnifiedRows, type DiffOptions } from '../text-diff';

describe.each(['char', 'word'] as const)('debugger padding alignment (%s)', mode => {
  const cases = [
    ['foo'+' '.repeat(30)+'same'+' '.repeat(4)+'OLD', 'bar'+' '.repeat(4)+'same'+' '.repeat(30)+'NEW', 'same'],
    ['F39=00'+' '.repeat(30)+'F41=TERM0001'+' '.repeat(4)+'F49=704', 'F39=05'+' '.repeat(4)+'F41=TERM0001'+' '.repeat(30)+'F49=840', 'F41=TERM0001'],
    ['F39=00\t\tF41=TERM0001\tF49=704', 'F39=05     F41=TERM0001          F49=840', 'F41=TERM0001'],
    ['{39=00, 41=TERM0001, 49=704}', '{39=05, 41=TERM0001, 49=840}', '41=TERM0001'],
    ['00  000000000002  704', '05           000000000002   840', '000000000002'],
    ['000000100000'+' '.repeat(30)+'1234567890'+' '.repeat(4)+'000000000704', '000000200000'+' '.repeat(4)+'1234567890'+' '.repeat(30)+'000000000840', '1234567890'],
  ];
  for (const options of [{}, {ignoreWhitespace: true}] satisfies DiffOptions[]) {
    it.each(cases)(`keeps equal content outside changed spans (${JSON.stringify(options)}): %s`, (a, b, unchanged) => {
      expect(Math.max(a.length, b.length)).toBeLessThan(100);
      const rows = buildLineDiff(a, b, mode, options);
      const row = rows[0];
      for (const [segments, flag] of [[row.leftSegments, 'removed'], [row.rightSegments, 'added']] as const) {
        const marked = segments!.flatMap(s => Array(s.value.length).fill(!!s[flag]));
        const text = segments!.map(s => s.value).join('');
        const start = text.indexOf(unchanged);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(marked.slice(start, start + unchanged.length)).not.toContain(true);
      }
      expect(row.leftSegments?.some(s=>s.removed && /\S/.test(s.value))).toBe(true);
      expect(row.rightSegments?.some(s=>s.added && /\S/.test(s.value))).toBe(true);
      expect(renderMergedColumn(rows,new Map(),'left')).toBe(a);
      expect(renderMergedColumn(rows,new Map(),'right')).toBe(b);
      expect(buildUnifiedRows(rows,null).filter(r=>r.kind==='removed').map(r=>r.text).join('\n')).toBe(a);
    });
  }
  it('does not silently ignore different whitespace in strict mode', () => {
    const row = buildLineDiff('F39=00     F41=A    F49=704', 'F39=05 F41=A        F49=840', mode)[0];
    expect(row.leftSegments?.some(s=>s.removed && s.value.includes(' '))).toBe(true);
    expect(row.rightSegments?.some(s=>s.added && s.value.includes(' '))).toBe(true);
  });
  it('retains an invisible debugger character as a real difference', () => {
    const row = buildLineDiff('F39=00\u200BF41=TERM0001', 'F39=05 F41=TERM0001',mode)[0];
    expect(row.leftSegments?.some(s=>s.removed && s.value.includes('\u200B'))).toBe(true);
    expect(row.leftSegments?.filter(s=>s.removed).map(s=>s.value).join('')).not.toContain('F41');
  });
});
