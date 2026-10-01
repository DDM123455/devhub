import { describe, expect, it } from 'vitest';
import { buildSheets, sanitizeFileName, sanitizeSheetName, uniqueSheetName } from '../json-excel';

const opts = { sheetName: 'Sheet1', flatten: true, unwrap: true };

describe('sheet names', () => {
	it('strips apostrophes, invalid chars and renames History', () => {
		expect(sanitizeSheetName("'Report'")).toBe('Report');
		expect(sanitizeSheetName('a/b:c*d?e[f]g')).toBe('a_b_c_d_e_f_g');
		expect(sanitizeSheetName('History')).toBe('History_');
		expect(sanitizeSheetName('history')).toBe('history_');
		expect(sanitizeSheetName('   ')).toBe('Sheet1');
		expect(sanitizeSheetName('x'.repeat(40)).length).toBe(31);
	});

	it('compares duplicates case-insensitively and stays within 31 chars', () => {
		const used = new Set<string>();
		const a = uniqueSheetName('Data', used);
		const b = uniqueSheetName('data', used);
		expect(a).toBe('Data');
		expect(b.toLowerCase()).not.toBe('data');
		const long = 'x'.repeat(31);
		const c = uniqueSheetName(long, used);
		const d = uniqueSheetName(long, used);
		expect(c.length).toBeLessThanOrEqual(31);
		expect(d.length).toBeLessThanOrEqual(31);
		expect(d).not.toBe(c);
	});
});

describe('buildSheets unwrapping', () => {
	it('unwraps { users: [...] } into one sheet named after the key', () => {
		const r = buildSheets({ users: [{ id: 1 }, { id: 2 }] }, opts)!;
		expect(r.sheets).toHaveLength(1);
		expect(r.sheets[0].name).toBe('users');
		expect(r.sheets[0].rows).toEqual([[1], [2]]);
		expect(r.sheets[0].sourceKey).toBe('users');
	});

	it('unwraps an object with one array of objects plus scalar siblings', () => {
		const r = buildSheets({ total: 2, data: [{ a: 1 }, { a: 2 }] }, opts)!;
		expect(r.sheets[0].name).toBe('data');
		expect(r.sheets[0].rows.length).toBe(2);
	});

	it('does not unwrap when disabled, and keeps multi-array objects as multiple sheets', () => {
		const off = buildSheets({ users: [{ id: 1 }] }, { ...opts, unwrap: false })!;
		expect(off.sheets[0].name).toBe('Sheet1');
		const multi = buildSheets({ a: [{ x: 1 }], b: [{ y: 2 }] }, opts)!;
		expect(multi.sheets.map((s) => s.name)).toEqual(['a', 'b']);
	});

	it('returns an empty sheet for an empty array', () => {
		const r = buildSheets([], opts)!;
		expect(r.sheets[0].rows).toEqual([]);
		expect(buildSheets(5, opts)).toBeNull();
	});
});

describe('data fidelity and limits', () => {
	it('keeps empty-string and __proto__ keys', () => {
		const parsed = JSON.parse('[{"":1,"__proto__":2,"ok":3}]');
		const r = buildSheets(parsed, { ...opts, flatten: false })!;
		expect(r.sheets[0].headers).toEqual(['', '__proto__', 'ok']);
		expect(r.sheets[0].rows[0]).toEqual([1, 2, 3]);
		const f = buildSheets(parsed, opts)!;
		expect(f.sheets[0].rows[0]).toEqual([1, 2, 3]);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('truncates cells over 32767 chars and counts them', () => {
		const r = buildSheets([{ big: 'x'.repeat(40000) }], opts)!;
		expect((r.sheets[0].rows[0][0] as string).length).toBe(32767);
		expect(r.stats.truncatedCells).toBe(1);
	});

	it('flags integers beyond 2^53', () => {
		const r = buildSheets(JSON.parse('[{"id":12345678901234567890,"n":5}]'), opts)!;
		expect(r.stats.unsafeIntegers).toBe(1);
	});

	it('keeps empty nested objects as a {} cell', () => {
		const r = buildSheets([{ a: {}, b: 1 }], opts)!;
		expect(r.sheets[0].headers).toEqual(['a', 'b']);
		expect(r.sheets[0].rows[0]).toEqual(['{}', 1]);
	});

	it('flags column overflow beyond 16384', () => {
		const obj: Record<string, number> = {};
		for (let i = 0; i < 16390; i++) obj[`c${i}`] = i;
		const r = buildSheets([obj], opts)!;
		expect(r.stats.colLimitSheets).toEqual(['Sheet1']);
		expect(r.sheets[0].headers.length).toBe(16384);
	});
});

describe('sanitizeFileName', () => {
	it('removes path characters', () => {
		expect(sanitizeFileName('a/b:c')).toBe('a_b_c');
		expect(sanitizeFileName('  ')).toBe('output');
		expect(sanitizeFileName('report. ')).toBe('report');
	});
});

describe('renamed sheet reporting', () => {
	it('reports when History is renamed', () => {
		const r = buildSheets({ History: [{ a: 1 }], Other: [{ b: 2 }] }, opts)!;
		expect(r.sheets.map((x) => x.name)).toContain('History_');
		expect(r.stats.renamedSheets).toEqual(['History → History_']);
	});
	it('reports nothing when names are already valid', () => {
		const r = buildSheets({ A: [{ a: 1 }], B: [{ b: 2 }] }, opts)!;
		expect(r.stats.renamedSheets).toEqual([]);
	});
});
