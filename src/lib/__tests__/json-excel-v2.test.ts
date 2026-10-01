import { describe, expect, it } from 'vitest';
import { DATETIME_FORMAT, DATE_FORMAT, applySheetLayout, buildSheets, isCustomLayout, parseIsoDate, sheetToCsv } from '../json-excel';

const base = { sheetName: 'Sheet1', flatten: true, unwrap: true };

describe('parseIsoDate', () => {
	it('parses dates, date-times and offsets as UTC instants', () => {
		expect(parseIsoDate('2024-01-15')?.toISOString()).toBe('2024-01-15T00:00:00.000Z');
		expect(parseIsoDate('2024-01-15T10:30:00Z')?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
		expect(parseIsoDate('2024-01-15T10:30:00')?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
		expect(parseIsoDate('2024-01-15 10:30')?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
		expect(parseIsoDate('2024-01-15T10:30:00.123+07:00')?.toISOString()).toBe('2024-01-15T03:30:00.123Z');
		expect(parseIsoDate('2024-01-15T10:30:00-0530')?.toISOString()).toBe('2024-01-15T16:00:00.000Z');
	});
	it('rejects invalid or non-ISO strings', () => {
		for (const v of ['2024-02-31', '2024-13-01', '2024-01-15T25:00:00', '15/01/2024', '2024-1-5', 'hello', '2024', '2024-01-15T10:30:00+25:00', '']) {
			expect(parseIsoDate(v)).toBeNull();
		}
		expect(parseIsoDate('2024-02-29')).not.toBeNull();
		expect(parseIsoDate('2023-02-29')).toBeNull();
	});
});

describe('date conversion in buildSheets', () => {
	it('is off by default', () => {
		const r = buildSheets([{ d: '2024-01-15' }], base)!;
		expect(r.sheets[0].rows[0][0]).toBe('2024-01-15');
	});
	it('converts ISO strings and picks the number format per column', () => {
		const r = buildSheets([{ day: '2024-01-15', at: '2024-01-15T10:30:00Z', note: '2024-01-15x', n: 5 }], { ...base, isoDates: true })!;
		const sheet = r.sheets[0];
		expect(sheet.rows[0][0]).toBeInstanceOf(Date);
		expect(sheet.rows[0][1]).toBeInstanceOf(Date);
		expect(sheet.rows[0][2]).toBe('2024-01-15x');
		expect(sheet.rows[0][3]).toBe(5);
		expect(sheet.columnFormats).toEqual([DATE_FORMAT, DATETIME_FORMAT, undefined, undefined]);
		expect(r.stats.dateCells).toBe(2);
	});
	it('converts epoch seconds/milliseconds only in date-like columns of plausible values', () => {
		const rows = [{ created_at: 1700000000, id: 1700000001, qty: 3 }];
		const s = buildSheets(rows, { ...base, epoch: 'seconds' })!.sheets[0];
		expect(s.rows[0][0]).toBeInstanceOf(Date);
		expect((s.rows[0][0] as Date).toISOString()).toBe('2023-11-14T22:13:20.000Z');
		expect(s.rows[0][1]).toBe(1700000001); // "id" is not a date-like header
		const ms = buildSheets([{ updatedAt: 1700000000000 }], { ...base, epoch: 'milliseconds' })!.sheets[0];
		expect(ms.rows[0][0]).toBeInstanceOf(Date);
		// seconds value in a column declared as milliseconds is not plausible -> untouched
		const wrong = buildSheets([{ created_at: 1700000000 }], { ...base, epoch: 'milliseconds' })!.sheets[0];
		expect(wrong.rows[0][0]).toBe(1700000000);
		// one non-epoch value keeps the whole column as numbers
		const mixed = buildSheets([{ created_at: 1700000000 }, { created_at: 7 }], { ...base, epoch: 'seconds' })!.sheets[0];
		expect(mixed.rows[0][0]).toBe(1700000000);
	});
	it('keeps numbers as numbers', () => {
		const r = buildSheets([{ price: 12.5, big: 3 }], { ...base, isoDates: true, epoch: 'seconds' })!;
		expect(r.sheets[0].rows[0]).toEqual([12.5, 3]);
	});
});

describe('nested arrays', () => {
	const data = [
		{ name: 'Ada', skills: ['math', 'code'], jobs: [{ co: 'X', yr: 1840 }, { co: 'Y', yr: 1842 }] },
		{ name: 'Alan', skills: [], jobs: [] },
	];
	it('json mode keeps the original behaviour (JSON text cell)', () => {
		const s = buildSheets(data, base)!.sheets[0];
		expect(s.headers).toEqual(['name', 'skills', 'jobs']);
		expect(s.rows[0][1]).toBe('["math","code"]');
	});
	it('join mode joins scalar arrays and leaves object arrays as JSON', () => {
		const s = buildSheets(data, { ...base, arrayMode: 'join', joinSeparator: ' | ' })!.sheets[0];
		expect(s.rows[0][1]).toBe('math | code');
		expect(s.rows[0][2]).toBe('[{"co":"X","yr":1840},{"co":"Y","yr":1842}]');
		expect(s.rows[1][1]).toBe('');
	});
	it('detail mode moves arrays into linked sheets', () => {
		const r = buildSheets(data, { ...base, arrayMode: 'detail' })!;
		expect(r.sheets.map((s) => s.name)).toEqual(['Sheet1', 'Sheet1.skills', 'Sheet1.jobs']);
		const [main, skills, jobs] = r.sheets;
		expect(main.headers).toEqual(['_row_id', 'name']);
		expect(main.rows).toEqual([[1, 'Ada'], [2, 'Alan']]);
		expect(skills.headers).toEqual(['_parent_row_id', 'value']);
		expect(skills.rows).toEqual([[1, 'math'], [1, 'code']]);
		expect(jobs.headers).toEqual(['_parent_row_id', 'co', 'yr']);
		expect(jobs.rows).toEqual([[1, 'X', 1840], [1, 'Y', 1842]]);
	});
	it('detail mode adds no id column or sheets when there are no arrays', () => {
		const r = buildSheets([{ a: 1 }], { ...base, arrayMode: 'detail' })!;
		expect(r.sheets).toHaveLength(1);
		expect(r.sheets[0].headers).toEqual(['a']);
	});
	it('detail sheets for multi-sheet roots and unique names', () => {
		const r = buildSheets({ users: [{ t: [1] }], teams: [{ t: [2] }] }, { ...base, arrayMode: 'detail' })!;
		expect(r.sheets.map((s) => s.name)).toEqual(['users', 'users.t', 'teams', 'teams.t']);
	});
});

describe('column layout and CSV', () => {
	const sheet = buildSheets([{ a: 1, b: 'x', when: '2024-01-15' }], { ...base, isoDates: true })!.sheets[0];
	it('detects customised layouts', () => {
		expect(isCustomLayout(['a', 'b'], undefined)).toBe(false);
		expect(isCustomLayout(['a', 'b'], [{ source: 'a', name: 'a', include: true }, { source: 'b', name: 'b', include: true }])).toBe(false);
		expect(isCustomLayout(['a', 'b'], [{ source: 'b', name: 'b', include: true }, { source: 'a', name: 'a', include: true }])).toBe(true);
	});
	it('selects, orders and renames columns and keeps date formats aligned', () => {
		const out = applySheetLayout(sheet, [
			{ source: 'when', name: 'Date', include: true },
			{ source: 'a', name: 'a', include: false },
			{ source: 'b', name: 'B', include: true },
		]);
		expect(out.headers).toEqual(['Date', 'B']);
		expect(out.rows[0][1]).toBe('x');
		expect(out.rows[0][0]).toBeInstanceOf(Date);
		expect(out.columnFormats).toEqual([DATE_FORMAT, undefined]);
		expect(applySheetLayout(sheet, undefined)).toBe(sheet);
	});
	it('exports CSV with ISO dates and formula escaping', () => {
		const csv = sheetToCsv(sheet).replace(/\r\n/g, '\n');
		expect(csv).toBe('a,b,when\n1,x,2024-01-15');
		const formula = buildSheets([{ f: '=SUM(A1)' }], base)!.sheets[0];
		expect(sheetToCsv(formula).replace(/\r\n/g, '\n')).toBe('f\n"\'=SUM(A1)"');
		expect(sheetToCsv(formula, { escapeFormulae: false }).replace(/\r\n/g, '\n')).toBe('f\n=SUM(A1)');
		const dt = buildSheets([{ t: '2024-01-15T10:30:00Z' }], { ...base, isoDates: true })!.sheets[0];
		expect(sheetToCsv(dt, { delimiter: ';' }).replace(/\r\n/g, '\n')).toBe('t\n2024-01-15T10:30:00.000Z');
	});
});
