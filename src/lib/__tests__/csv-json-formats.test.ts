import { describe, expect, it } from 'vitest';
import {
	convertTypedValue,
	csvToJson,
	dropLines,
	jsonToCsv,
	mergeColumnSpec,
	parseJsonOrJsonl,
	resolveColumns,
	type CsvToJsonOptions,
} from '../csv-json';
import { decodeBuffer, detectDelimiter } from '../csv-encoding';
import { quoteIdentifier, sqlLiteral, toHtmlTable, toMarkdownTable, toSqlInserts, toXml, toYaml } from '../csv-json-formats';

const base: CsvToJsonOptions = { delimiter: ',', header: true, nested: false, pretty: false, typed: true };
const CSV = 'id,name,age\n007,Ada,36\n9007199254740993,Alan,41';

describe('convertTypedValue edge cases', () => {
	it('keeps leading zeros, long ids, -0 and precision-losing decimals as text', () => {
		for (const v of ['007', '00', '-0', '9007199254740993', '12345678901234567890', '0.1234567890123456789', '1e400', '0x10', '+5', 'NaN', 'Infinity', '.5', '5.', '1,5']) {
			expect(convertTypedValue(v)).toBe(v);
		}
	});
	it('still converts ordinary numbers', () => {
		expect(convertTypedValue('0')).toBe(0);
		expect(convertTypedValue('-12')).toBe(-12);
		expect(convertTypedValue('3.14')).toBe(3.14);
		expect(convertTypedValue('1.50')).toBe(1.5);
		expect(convertTypedValue('1e3')).toBe(1000);
		expect(convertTypedValue('9007199254740991')).toBe(9007199254740991);
		expect(convertTypedValue('true')).toBe(true);
		expect(convertTypedValue('null')).toBeNull();
	});
	it('keeps ids as strings in the JSON output', () => {
		const out = csvToJson(CSV, base).output;
		expect(out).toContain('"id":"007"');
		expect(out).toContain('"id":"9007199254740993"');
		expect(out).toContain('"age":36');
	});
});

describe('output shapes', () => {
	it('JSON Lines', () => {
		const r = csvToJson('a,b\n1,x\n2,y', { ...base, format: 'jsonl' });
		expect(r.output).toBe('{"a":1,"b":"x"}\n{"a":2,"b":"y"}');
	});
	it('keyed object uses the first column and reports duplicates', () => {
		const r = csvToJson('id,v\nk1,1\nk2,2\nk1,3', { ...base, format: 'keyed' });
		expect(JSON.parse(r.output)).toEqual({ k1: { v: 3 }, k2: { v: 2 } });
		expect(r.duplicateKeys).toEqual(['k1']);
	});
	it('keyed object is safe against __proto__ keys', () => {
		const r = csvToJson('id,v\n__proto__,1', { ...base, format: 'keyed' });
		expect(Object.prototype.hasOwnProperty.call(JSON.parse(r.output), '__proto__')).toBe(true);
		expect(({} as Record<string, unknown>).v).toBeUndefined();
	});
	it('array of arrays with and without header, and column arrays', () => {
		expect(JSON.parse(csvToJson('a,b\n1,2', { ...base, format: 'arrays' }).output)).toEqual([['a', 'b'], [1, 2]]);
		expect(JSON.parse(csvToJson('1,2', { ...base, header: false, format: 'arrays' }).output)).toEqual([[1, 2]]);
		expect(JSON.parse(csvToJson('a,b\n1,2\n3,4', { ...base, format: 'columns' }).output)).toEqual({ a: [1, 3], b: [2, 4] });
	});
	it('skipEmptyFields only drops empty strings', () => {
		const r = csvToJson('a,b\n1,\n,0', { ...base, skipEmptyFields: true });
		expect(JSON.parse(r.output)).toEqual([{ a: 1 }, { b: 0 }]);
	});
});

describe('preprocessing options', () => {
	it('dropLines handles all newline styles', () => {
		expect(dropLines('a\nb\nc', 1)).toBe('b\nc');
		expect(dropLines('a\r\nb\r\nc', 2)).toBe('c');
		expect(dropLines('a', 3)).toBe('');
	});
	it('skip lines, limit records, trim and transpose', () => {
		const r = csvToJson('junk\na,b\n1,2\n3,4\n5,6', { ...base, skipLines: 1, maxRecords: 2 });
		expect(JSON.parse(r.output)).toEqual([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
		expect(r.truncated).toBe(1);
		expect(JSON.parse(csvToJson(' a , b \n 1 , x ', { ...base, trim: true }).output)).toEqual([{ a: 1, b: 'x' }]);
		const t = csvToJson('name,Ada,Alan\nage,36,41', { ...base, transpose: true });
		expect(JSON.parse(t.output)).toEqual([{ name: 'Ada', age: 36 }, { name: 'Alan', age: 41 }]);
	});
	it('column layout: select, reorder, rename', () => {
		const spec = [
			{ source: 'age', name: 'years', include: true },
			{ source: 'id', name: '', include: false },
			{ source: 'name', name: 'full name', include: true },
		];
		const r = csvToJson(CSV, { ...base, columns: spec });
		expect(r.previewHeaders).toEqual(['years', 'full name']);
		expect(JSON.parse(r.output)[0]).toEqual({ years: 36, 'full name': 'Ada' });
		expect(r.sourceHeaders).toEqual(['id', 'name', 'age']);
	});
	it('resolveColumns appends new headers and dedupes names; mergeColumnSpec follows the data', () => {
		expect(resolveColumns(['a', 'b'], [{ source: 'a', name: 'x', include: true }]).map((c) => c.name)).toEqual(['x', 'b']);
		expect(resolveColumns(['a', 'b'], [{ source: 'a', name: 'z', include: true }, { source: 'b', name: 'z', include: true }]).map((c) => c.name)).toEqual(['z', 'z (2)']);
		const merged = mergeColumnSpec([{ source: 'a', name: 'A', include: false }, { source: 'gone', name: 'g', include: true }], ['a', 'c']);
		expect(merged).toEqual([{ source: 'a', name: 'A', include: false }, { source: 'c', name: 'c', include: true }]);
	});
	it('JSON to CSV with column layout and limit', () => {
		const r = jsonToCsv([{ a: 1, b: 2 }, { a: 3, b: 4 }], {
			delimiter: ',',
			header: true,
			escapeFormulae: true,
			maxRecords: 1,
			columns: [{ source: 'b', name: 'B', include: true }, { source: 'a', name: 'a', include: false }],
		});
		expect(r.output.replace(/\r\n/g, '\n')).toBe('B\n2');
	});
});

describe('text formats', () => {
	it('SQL escapes quotes per dialect and quotes identifiers', () => {
		expect(sqlLiteral('mysql', "O'Re\\illy")).toBe("'O''Re\\\\illy'");
		expect(sqlLiteral('postgres', "O'Re\\illy")).toBe("'O''Re\\illy'");
		expect(sqlLiteral('mssql', 'Việt')).toBe("N'Việt'");
		expect(sqlLiteral('sqlite', true)).toBe('1');
		expect(sqlLiteral('postgres', true)).toBe('TRUE');
		expect(sqlLiteral('mysql', null)).toBe('NULL');
		expect(quoteIdentifier('mysql', 'a`b')).toBe('`a``b`');
		expect(quoteIdentifier('mssql', 'a]b')).toBe('[a]]b]');
		expect(quoteIdentifier('postgres', 'a"b')).toBe('"a""b"');
	});
	it('SQL INSERT batches and keeps leading zeros as strings', () => {
		const sql = csvToJson(CSV, { ...base, format: 'sql', sql: { dialect: 'postgres', table: 'public.people' } }).output;
		expect(sql).toContain('INSERT INTO "public"."people" ("id", "name", "age") VALUES');
		expect(sql).toContain("('007', 'Ada', 36)");
		const many = toSqlInserts(['a'], Array.from({ length: 5 }, (_, i) => ({ a: i })), { dialect: 'mysql', table: 't', batchSize: 2 });
		expect(many.match(/INSERT INTO/g)).toHaveLength(3);
	});
	it('YAML quotes ambiguous scalars and nests dot keys', () => {
		const out = csvToJson('name,flag,zip,address.city\nAda,yes,007,London', { ...base, typed: false, nested: true, format: 'yaml' }).output;
		expect(out).toBe('- name: Ada\n  flag: "yes"\n  zip: "007"\n  address:\n    city: London');
		expect(toYaml([])).toBe('[]');
		expect(toYaml([{ a: 'x: y', b: null, c: true }])).toBe('- a: "x: y"\n  b: null\n  c: true');
	});
	it('Markdown and HTML escape cell content', () => {
		expect(toMarkdownTable(['a'], [{ a: 'x|y\nz' }])).toBe('| a |\n| --- |\n| x\\|y<br>z |');
		expect(toHtmlTable(['a'], [{ a: '<b>&"' }])).toContain('<td>&lt;b&gt;&amp;&quot;</td>');
	});
	it('XML sanitises element names and text', () => {
		const out = toXml([{ '1 bad name': 'a<b', ok: 'x\u0001y' }]);
		expect(out).toContain('<_1_bad_name>a&lt;b</_1_bad_name>');
		expect(out).toContain('<ok>xy</ok>');
		expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(toXml([])).toContain('<rows/>');
	});
});

describe('encoding and delimiter detection', () => {
	it('detects BOMs and falls back to Windows-1252 for invalid UTF-8', () => {
		const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xc3, 0xa9]);
		expect(decodeBuffer(utf8)).toMatchObject({ text: 'aé', encoding: 'utf-8', bom: true });
		const utf16le = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0xe9, 0x00]);
		expect(decodeBuffer(utf16le).text).toBe('aé');
		const utf16be = new Uint8Array([0xfe, 0xff, 0x00, 0x61, 0x00, 0xe9]);
		expect(decodeBuffer(utf16be).text).toBe('aé');
		const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
		expect(decodeBuffer(latin1)).toMatchObject({ text: 'café', encoding: 'windows-1252' });
		expect(decodeBuffer(latin1, 'iso-8859-1').text).toBe('café');
		expect(decodeBuffer(new Uint8Array([0x61, 0xc3, 0xa9]), 'utf-8').text).toBe('aé');
	});
	it('detects BOM-less UTF-16', () => {
		const bytes = new Uint8Array([0x61, 0, 0x2c, 0, 0x62, 0, 0x0a, 0, 0x31, 0, 0x2c, 0, 0x32, 0]);
		expect(decodeBuffer(bytes)).toMatchObject({ text: 'a,b\n1,2', encoding: 'utf-16le' });
	});
	it('detects delimiters outside quotes', () => {
		expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
		expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
		expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
		expect(detectDelimiter('a|b\n1|2')).toBe('|');
		expect(detectDelimiter('"a,b";c\n"1,2";3')).toBe(';');
		expect(detectDelimiter('hello\nworld')).toBeNull();
	});
});

describe('parseJsonOrJsonl', () => {
	it('parses JSON, JSONL and rejects garbage', () => {
		expect(parseJsonOrJsonl('[1,2]')).toEqual({ value: [1, 2], jsonl: false });
		expect(parseJsonOrJsonl('{"a":1}\n{"a":2}\n')).toEqual({ value: [{ a: 1 }, { a: 2 }], jsonl: true });
		expect(() => parseJsonOrJsonl('{"a":1}\n{oops}')).toThrow();
		expect(() => parseJsonOrJsonl('nope')).toThrow();
	});
});
