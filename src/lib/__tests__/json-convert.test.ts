import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
	analyzeJsonText,
	convertJsonToCsv,
	convertJsonToCsvDetailed,
	convertJsonToXml,
	convertJsonToYaml,
	csvCell,
	diffJson,
} from '../json-convert';

describe('convertJsonToYaml', () => {
	it('round-trips tricky strings and keys', () => {
		const data = {
			'true': 'yes',
			null: 'no',
			on: 'off',
			list: ['- dash', 'a: b', '#c', '123', 'null', '', ' pad ', 'multi\nline', "it's", '@at', '%pct'],
			nested: { empty: {}, arr: [], n: 1.5 },
		};
		expect(parseYaml(convertJsonToYaml(data))).toEqual(data);
	});
});

describe('csv', () => {
	it('prefixes formula-like strings but not real numbers', () => {
		expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
		expect(csvCell('+1')).toBe("'+1");
		expect(csvCell('-x')).toBe("'-x");
		expect(csvCell('@cmd')).toBe("'@cmd");
		expect(csvCell(-5)).toBe('-5');
	});
	it('quotes CR, newline, comma and quotes', () => {
		expect(csvCell('a\rb')).toBe('"a\rb"');
		expect(csvCell('a,"b"')).toBe('"a,""b"""');
	});
	it('builds headers from the union of keys and reports flatten collisions', () => {
		expect(convertJsonToCsv([{ a: 1 }, { b: 2 }])).toBe('a,b\n1,\n,2');
		const r = convertJsonToCsvDetailed({ 'a.b': 1, a: { b: 2 } });
		expect(r.collisions).toEqual(['a.b']);
	});
	it('keeps empty nested objects as a cell instead of dropping the key', () => {
		expect(convertJsonToCsv({ a: {} })).toBe('a\n{}');
	});
});

describe('convertJsonToXml', () => {
	it('escapes values, drops illegal control chars, keeps original key names', () => {
		const xml = convertJsonToXml({ 'first name': 'a<b>&\u0001c', '1x': 2 });
		expect(xml).toContain('<first_name name="first name">a&lt;b&gt;&amp;c</first_name>');
		expect(xml).toContain('<_1x name="1x">2</_1x>');
		expect(xml).not.toContain('\u0001');
	});
});

describe('analyzeJsonText', () => {
	it('flags unsafe integers and duplicate keys', () => {
		expect(analyzeJsonText('{"id": 12345678901234567890}').unsafeNumbers).toBe(true);
		expect(analyzeJsonText('{"id": 12345}').unsafeNumbers).toBe(false);
		expect(analyzeJsonText('{"s": "12345678901234567890"}').unsafeNumbers).toBe(false);
		expect(analyzeJsonText('{"a":1,"a":2}').duplicateKeys).toBe(true);
		expect(analyzeJsonText('{"a":1,"b":2}').duplicateKeys).toBe(false);
	});
});

describe('diffJson', () => {
	it('does not treat Object.prototype keys as present', () => {
		const left = JSON.parse('{"a":1}');
		const right = JSON.parse('{"a":1,"constructor":2,"toString":3}');
		const diff = diffJson(left, right);
		expect(diff.map((d) => [d.path, d.type])).toEqual([
			['$.constructor', 'added'],
			['$.toString', 'added'],
		]);
		expect(diffJson(right, left).map((d) => d.type)).toEqual(['removed', 'removed']);
	});
});
