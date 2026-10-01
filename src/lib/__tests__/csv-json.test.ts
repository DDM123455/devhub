import { describe, expect, it } from 'vitest';
import {
	convertTypedValue,
	csvToJson,
	dedupeFileNames,
	flattenObject,
	jsonToCsv,
	suggestDelimiter,
	unflattenObject,
	validateDelimiter,
} from '../csv-json';

const baseCsv = { delimiter: ',', header: true, nested: false, pretty: false, typed: false };

describe('prototype pollution', () => {
	it('unflattenObject does not pollute Object.prototype', () => {
		const { value } = unflattenObject({ '__proto__.polluted': 'yes', 'constructor.prototype.x': '1' });
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(({} as Record<string, unknown>).x).toBeUndefined();
		expect(Object.getPrototypeOf(value)).toBeNull();
	});

	it('flattenObject keeps a literal __proto__ key as data', () => {
		const parsed = JSON.parse('{"__proto__":{"a":1},"b":2}');
		const { flat } = flattenObject(parsed);
		expect(flat['__proto__.a']).toBe(1);
		expect(({} as Record<string, unknown>).a).toBeUndefined();
	});

	it('csvToJson with nested malicious header leaves Object.prototype clean', () => {
		const r = csvToJson('__proto__.polluted,b\nyes,2', { ...baseCsv, nested: true });
		expect(r.error).toBeNull();
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});

describe('key collisions', () => {
	it('unflatten reports a vs a.b instead of losing data', () => {
		const r = unflattenObject({ a: '1', 'a.b': '2' });
		expect(r.collisions).toContain('a.b');
		expect(r.value).toEqual({ a: '1', 'a.b': '2' });
		const r2 = unflattenObject({ 'a.b': '2', a: '1' });
		expect(r2.collisions).toContain('a');
		expect(r2.value).toEqual({ 'a.b': '2', a: '1' });
	});

	it('flatten reports and renames colliding keys, and keeps empty objects', () => {
		const r = flattenObject({ a: { b: 1 }, 'a.b': 2, e: {} });
		expect(r.collisions).toEqual(['a.b']);
		expect(r.flat['a.b']).toBe(1);
		expect(r.flat['a.b (2)']).toBe(2);
		expect(r.flat.e).toEqual({});
	});

	it('jsonToCsv writes empty object as {}', () => {
		const out = jsonToCsv([{ id: 1, meta: {} }], { delimiter: ',', header: true, escapeFormulae: true });
		expect(out.output).toBe('id,meta\r\n1,{}');
	});
});

describe('formula injection', () => {
	it('escapes leading = + - @ in strings but not real numbers', () => {
		const out = jsonToCsv([{ a: '=SUM(A1)', b: 5, c: -3, d: '@x' }], { delimiter: ',', header: true, escapeFormulae: true });
		const dataLine = out.output.split('\r\n')[1];
		expect(dataLine).toBe(`"'=SUM(A1)",5,-3,"'@x"`);
		const raw = jsonToCsv([{ a: '=SUM(A1)' }], { delimiter: ',', header: true, escapeFormulae: false });
		expect(raw.output.split('\r\n')[1]).toBe('=SUM(A1)');
	});
});

describe('CSV parse warnings and line numbers', () => {
	it('treats field-count mismatches as warnings and still outputs data', () => {
		const r = csvToJson('a,b\n1,2\n3\n4,5,6', baseCsv);
		expect(r.error).toBeNull();
		expect(r.output).not.toBe('');
		expect(r.warnings.length).toBeGreaterThanOrEqual(2);
		// "3" is on file line 3 (header is line 1).
		expect(r.warnings[0].line).toBe(3);
	});

	it('reports real file line for hard errors', () => {
		const r = csvToJson('a,b\n1,2\n3,"oops', baseCsv);
		expect(r.error).not.toBeNull();
		expect(r.error!.line).toBeGreaterThanOrEqual(3);
	});

	it('no-header mode keeps ragged rows without errors', () => {
		const r = csvToJson('1,2\n3', { ...baseCsv, header: false });
		expect(r.error).toBeNull();
		expect(JSON.parse(r.output)).toEqual([{ column1: '1', column2: '2' }, { column1: '3' }]);
	});
});

describe('typed values', () => {
	it('converts numbers/booleans/null but keeps leading zeros and huge ints', () => {
		expect(convertTypedValue('42')).toBe(42);
		expect(convertTypedValue('-1.5e3')).toBe(-1500);
		expect(convertTypedValue('true')).toBe(true);
		expect(convertTypedValue('null')).toBeNull();
		expect(convertTypedValue('007')).toBe('007');
		expect(convertTypedValue('12345678901234567890')).toBe('12345678901234567890');
		expect(convertTypedValue('')).toBe('');
	});

	it('is off by default and applied only when enabled', () => {
		expect(JSON.parse(csvToJson('n\n5', baseCsv).output)).toEqual([{ n: '5' }]);
		expect(JSON.parse(csvToJson('n\n5', { ...baseCsv, typed: true }).output)).toEqual([{ n: 5 }]);
	});
});

describe('delimiter helpers', () => {
	it('validates custom delimiters', () => {
		expect(validateDelimiter('|')).toBe(true);
		expect(validateDelimiter('')).toBe(false);
		expect(validateDelimiter('"')).toBe(false);
		expect(validateDelimiter('\n')).toBe(false);
	});
	it('suggests the delimiter actually used', () => {
		expect(suggestDelimiter('a;b;c\n1;2;3', ',')).toBe(';');
		expect(suggestDelimiter('a\tb\n1\t2', ',')).toBe('\t');
		expect(suggestDelimiter('a,b', ',')).toBeNull();
	});
});

describe('dedupeFileNames', () => {
	it('dedupes case-insensitively', () => {
		expect(dedupeFileNames(['a.json', 'A.json', 'b.json', 'a.json'])).toEqual(['a.json', 'A (2).json', 'b.json', 'a (3).json']);
	});
});

describe('csvToJson extra fields', () => {
	it('does not leak Papa internal __parsed_extra key', () => {
		const r = csvToJson('a,b,c\n3,4,5,6', baseCsv);
		expect(r.output).not.toContain('__parsed_extra');
		expect(JSON.parse(r.output)[0]._extra).toEqual(['6']);
	});
});
