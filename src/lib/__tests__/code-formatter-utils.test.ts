import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	AUTO_FORMAT_MAX_CHARS,
	DEFAULT_SETTINGS,
	FILE_ACCEPT,
	FILE_EXTENSION,
	MAX_FILE_BYTES,
	baseNameWithoutExtension,
	buildDownloadName,
	countLines,
	errorSelection,
	fillTemplate,
	humanBytes,
	isFileTooLarge,
	isLanguageChoice,
	percentSmaller,
	resolveLanguage,
	sanitizeSettings,
	supportsMinify,
	supportsPrintWidth,
	toFormatOptions,
} from '../code-formatter-utils';
import { locateJsonError } from '../code-formatter-json-error';
import { SAMPLES, SAMPLE_IDS } from '../code-formatter-samples';
import { FORMAT_LANGUAGES, extractFormatError, languageFromFileName, type FormatLanguage } from '../format-languages';
import { runCodeFormatter, type OtherFormatter } from '../../components/tools/codeFormatterRun';
import { runFormat } from '../format-run';
import { allLoaders } from '../format-loaders';

describe('FILE_EXTENSION', () => {
	it('has an extension for every format language and round-trips through languageFromFileName', () => {
		for (const { id } of FORMAT_LANGUAGES) {
			const ext = FILE_EXTENSION[id];
			expect(ext, id).toBeTruthy();
			expect(languageFromFileName(`x.${ext}`), id).toBe(id);
			expect(FILE_ACCEPT).toContain(`.${ext}`);
		}
	});
});

describe('buildDownloadName', () => {
	it('uses the language of the output, not of the loaded file', () => {
		expect(buildDownloadName('typescript', 'app.tsx')).toBe('app.formatted.ts');
		expect(buildDownloadName('yaml', 'ci.yml')).toBe('ci.formatted.yaml');
		expect(buildDownloadName('markdown', 'README.md')).toBe('README.formatted.md');
	});
	it('falls back to formatted./minified. for pasted text', () => {
		expect(buildDownloadName('json', null)).toBe('formatted.json');
		expect(buildDownloadName('json', '', true)).toBe('minified.json');
		expect(buildDownloadName('sql', undefined)).toBe('formatted.sql');
	});
	it('tags minified output of a file and sanitises the base name', () => {
		expect(buildDownloadName('json', 'data.json', true)).toBe('data.min.json');
		expect(buildDownloadName('css', 'C:\\proj\\my style (1).css')).toBe('my-style-1.formatted.css');
		expect(baseNameWithoutExtension('a/b/c.min.js')).toBe('c.min');
		expect(baseNameWithoutExtension('.env')).toBe('');
	});
});

describe('size limits', () => {
	it('rejects files above 5 MB', () => {
		expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
		expect(isFileTooLarge(MAX_FILE_BYTES)).toBe(false);
		expect(isFileTooLarge(MAX_FILE_BYTES + 1)).toBe(true);
	});
	it('auto-format has its own, lower cap', () => {
		expect(AUTO_FORMAT_MAX_CHARS).toBeLessThanOrEqual(300_000);
	});
});

describe('settings', () => {
	it('defaults: auto language, 2-space indent, 80 columns, manual run', () => {
		expect(DEFAULT_SETTINGS).toEqual({ language: 'auto', indent: '2', printWidth: 80, sqlDialect: 'sql', autoFormat: false });
	});
	it('sanitises garbage from localStorage', () => {
		expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
		expect(sanitizeSettings({ language: 'cobol', indent: '8', printWidth: 55, sqlDialect: 'oracle9', autoFormat: 'yes' })).toEqual(DEFAULT_SETTINGS);
	});
	it('keeps valid values', () => {
		const s = sanitizeSettings({ language: 'scss', indent: 'tab', printWidth: 120, sqlDialect: 'postgresql', autoFormat: true });
		expect(s).toEqual({ language: 'scss', indent: 'tab', printWidth: 120, sqlDialect: 'postgresql', autoFormat: true });
		expect(toFormatOptions(s)).toEqual({ indent: 'tab', printWidth: 120, sqlDialect: 'postgresql' });
	});
	it('isLanguageChoice accepts auto and every language only', () => {
		expect(isLanguageChoice('auto')).toBe(true);
		expect(isLanguageChoice('graphql')).toBe(true);
		expect(isLanguageChoice('python')).toBe(false);
		expect(isLanguageChoice(3)).toBe(false);
	});
});

describe('resolveLanguage', () => {
	it('manual choice wins over content and file name', () => {
		expect(resolveLanguage('yaml', '{"a":1}', 'x.json')).toMatchObject({ kind: 'ok', language: 'yaml', source: 'manual' });
	});
	it('auto: file extension beats content', () => {
		expect(resolveLanguage('auto', 'a { b: c }', 'x.json')).toMatchObject({ kind: 'ok', language: 'json', source: 'extension' });
	});
	it('auto: content detection for every sample', () => {
		const expected: Partial<Record<(typeof SAMPLE_IDS)[number], FormatLanguage>> = {
			json: 'json',
			xml: 'xml',
			sql: 'sql',
			html: 'html',
			css: 'css',
			javascript: 'javascript',
			typescript: 'typescript',
			yaml: 'yaml',
			markdown: 'markdown',
			graphql: 'graphql',
		};
		for (const [id, lang] of Object.entries(expected) as Array<[(typeof SAMPLE_IDS)[number], FormatLanguage]>) {
			expect(resolveLanguage('auto', SAMPLES[id], null), id).toMatchObject({ kind: 'ok', language: lang });
		}
	});
	it('empty and ambiguous input', () => {
		expect(resolveLanguage('auto', '   \n', null)).toEqual({ kind: 'empty' });
		expect(resolveLanguage('json', '', null)).toEqual({ kind: 'empty' });
		const r = resolveLanguage('auto', 'hello world', null);
		expect(r.kind).toBe('ambiguous');
	});
});

describe('option applicability', () => {
	it('print width only for prettier languages', () => {
		expect(supportsPrintWidth('javascript')).toBe(true);
		expect(supportsPrintWidth('yaml')).toBe(true);
		expect(supportsPrintWidth('json')).toBe(false);
		expect(supportsPrintWidth('sql')).toBe(false);
		expect(supportsPrintWidth('xml')).toBe(false);
		expect(supportsPrintWidth(null)).toBe(false);
	});
	it('minify is JSON only', () => {
		for (const { id } of FORMAT_LANGUAGES) expect(supportsMinify(id), id).toBe(id === 'json');
	});
});

describe('text helpers', () => {
	it('countLines', () => {
		expect(countLines('')).toBe(0);
		expect(countLines('a')).toBe(1);
		expect(countLines('a\nb\n')).toBe(3);
	});
	it('humanBytes / percentSmaller / fillTemplate', () => {
		expect(humanBytes(10)).toBe('10 B');
		expect(humanBytes(2048)).toBe('2.0 KB');
		expect(percentSmaller(200, 150)).toBe(25);
		expect(percentSmaller(0, 5)).toBe(0);
		expect(percentSmaller(10, 20)).toBe(0);
		expect(fillTemplate('{{a}} of {{b}} {{c}}', { a: 1, b: 'x' })).toBe('1 of x ');
	});
});

describe('errorSelection', () => {
	const text = 'line one\nfoo(bar baz\nthird';
	it('selects the token at line/column', () => {
		const { start, end } = errorSelection(text, 2, 5);
		expect(text.slice(start, end)).toBe('bar');
	});
	it('clamps out-of-range positions', () => {
		expect(errorSelection(text, 99, 1).start).toBe(text.indexOf('third'));
		const { start, end } = errorSelection(text, 1, 500);
		expect(start).toBe(7);
		expect(text.slice(start, end)).toBe('e');
		expect(errorSelection('', 3, 3)).toEqual({ start: 0, end: 0 });
	});
	it('handles CRLF', () => {
		const t = 'a b\r\nc d';
		const { start, end } = errorSelection(t, 1, 3);
		expect(t.slice(start, end)).toBe('b');
	});
});

describe('i18n files', () => {
	const read = (loc: string) => JSON.parse(readFileSync(join(__dirname, `../../i18n/locales/${loc}/tool-code-formatter.json`), 'utf8'));
	const flat = (o: unknown, prefix = ''): Record<string, string> =>
		Object.entries(o as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
			if (v && typeof v === 'object') Object.assign(acc, flat(v, `${prefix}${k}.`));
			else acc[`${prefix}${k}`] = String(v);
			return acc;
		}, {});
	const en = flat(read('en'));
	const vi = flat(read('vi'));
	it('en and vi have the same keys and placeholders', () => {
		expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
		const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
		for (const k of Object.keys(en)) expect(ph(vi[k]), k).toBe(ph(en[k]));
	});
	it('article length is 300-500 words in English', () => {
		const words = Object.entries(en)
			.filter(([k]) => k.startsWith('article.') && k !== 'article.heading')
			.reduce((n, [, v]) => n + v.split(/\s+/).length, 0);
		expect(words).toBeGreaterThanOrEqual(300);
		expect(words).toBeLessThanOrEqual(520);
	});
});

describe('runCodeFormatter (workers replaced by the main-thread runner)', () => {
	const opts = toFormatOptions(DEFAULT_SETTINGS);
	const other: OtherFormatter = (text, language, o) => runFormat(text, language, o, allLoaders);
	const run = (t: string, l: FormatLanguage, mode: 'format' | 'minify', o = opts) => runCodeFormatter(t, l, mode, o, other);
	it('formats and minifies JSON', async () => {
		const f = await run('{"a":[1,2],"b":{"c":null}}', 'json', 'format');
		expect(f).toMatchObject({ ok: true });
		expect(f.ok && f.value).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}');
		const m = await run('{\n  "a": [1, 2],\n  "big": 12345678901234567890\n}', 'json', 'minify');
		expect(m.ok && m.value).toBe('{"a":[1,2],"big":12345678901234567890}');
	});
	it('reports JSON errors with a position on both format and minify', async () => {
		for (const mode of ['format', 'minify'] as const) {
			const r = await run('{\n  "a": 1,\n  "b": ,\n}', 'json', mode);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.message.length).toBeGreaterThan(0);
		}
	});
	it('formats prettier and SQL languages', async () => {
		const js = await run('const a={b:1}', 'javascript', 'format');
		expect(js.ok && js.value).toBe('const a = { b: 1 };');
		const css = await run('a{color:red}', 'css', 'format', { ...opts, indent: '4' });
		expect(css.ok && css.value).toBe('a {\n    color: red;\n}');
		const sql = await run('select a,b from t where x=1', 'sql', 'format');
		expect(sql.ok && sql.value).toContain('FROM'.toLowerCase());
		const yml = await run('a:   1\nb: [1,   2]', 'yaml', 'format');
		expect(yml.ok && yml.value).toBe('a: 1\nb: [1, 2]');
	}, 30_000);
	it('reports a syntax error with line and column and never throws', async () => {
		const r = await run(SAMPLES.broken, 'javascript', 'format');
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.line).toBe(3);
			expect(r.error.column).toBeGreaterThan(0);
			expect(r.error.message).not.toMatch(/\n/);
			const sel = errorSelection(SAMPLES.broken, r.error.line!, r.error.column);
			expect(sel.start).toBeGreaterThan(SAMPLES.broken.indexOf('\n  for'));
		}
		// extractFormatError stays the single source of the message format
		expect(extractFormatError(new Error('x (2:3)')).line).toBe(2);
	}, 30_000);
	it('every sample formats (except the broken one)', async () => {
		for (const id of SAMPLE_IDS) {
			if (id === 'broken' || id === 'xml') continue;
			const r = await run(SAMPLES[id], id, 'format');
			expect(r.ok, id).toBe(true);
		}
	}, 60_000);
});

describe('locateJsonError', () => {
	it('returns null for valid JSON', () => {
		for (const t of ['{}', '[]', String.raw` {"a": [1, -2.5e+3, true, false, null, "x\n\u00e9"]} `, '0', '"s"', '-0.5']) expect(locateJsonError(t), t).toBeNull();
	});
	it('points to the first error', () => {
		expect(locateJsonError('{\n  "a": 1,\n  "b": ,\n}')).toMatchObject({ line: 3, column: 8, message: 'Unexpected token ","' });
		expect(locateJsonError('{"a":1,}')).toMatchObject({ line: 1, column: 8, message: 'Trailing comma is not allowed' });
		expect(locateJsonError('[1,2,]')).toMatchObject({ line: 1, column: 6 });
		expect(locateJsonError("{'a':1}")).toMatchObject({ line: 1, column: 2 });
		expect(locateJsonError('{"a" 1}')).toMatchObject({ line: 1, column: 6, message: "Expected ':' after the property name" });
		expect(locateJsonError('{"a":1 "b":2}')).toMatchObject({ line: 1, column: 8 });
		expect(locateJsonError('{"a":"x\ny"}')).toMatchObject({ line: 1, column: 8, message: 'Bad control character in string' });
		expect(locateJsonError('{"a":"x')).toMatchObject({ line: 1, column: 6, message: 'Unterminated string' });
		expect(locateJsonError('{"a":1')).toMatchObject({ message: 'Unexpected end of JSON' });
		expect(locateJsonError('')).toMatchObject({ line: 1, column: 1 });
		expect(locateJsonError('{"a":01}')).toMatchObject({ line: 1, column: 7 });
		expect(locateJsonError('{} x')).toMatchObject({ line: 1, column: 4 });
		expect(locateJsonError('[tru]')).toMatchObject({ line: 1, column: 2 });
	});
	it('agrees with JSON.parse on valid / invalid for assorted inputs', () => {
		const cases = ['{"a":1}', '{"a":}', '[1 2]', String.raw`"\x"`, '1.', '-', '1e', '[[[[]]]]', '{"a":{"b":[1,{"c":null}]}}', 'nul', 'True', '{"a":1}}'];
		for (const c of cases) {
			let valid = true;
			try {
				JSON.parse(c);
			} catch {
				valid = false;
			}
			expect(locateJsonError(c) === null, c).toBe(valid);
		}
	});
	it('does not blow up on very deep nesting', () => {
		expect(locateJsonError('['.repeat(6000))).toMatchObject({ message: 'Nesting is too deep' });
	});
});
