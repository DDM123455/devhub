import { describe, expect, it } from 'vitest';
import {
	checkFormatSize,
	DEFAULT_FORMAT_OPTIONS,
	detectLanguage,
	extractFormatError,
	FORMAT_MAX_CHARS,
	FORMAT_WARN_CHARS,
	isDecisive,
	languageFromFileName,
	pluginsFor,
	positionToLineColumn,
	PRETTIER_PARSERS,
	workerGroupFor,
	type FormatLanguage,
} from '../format-languages';
import { runFormat } from '../format-run';
import { allLoaders } from '../format-loaders';

const run = (text: string, language: Parameters<typeof runFormat>[1], options: Parameters<typeof runFormat>[2]) => runFormat(text, language, options, allLoaders);

const det = (text: string, name?: string) => detectLanguage(text, name);

describe('languageFromFileName', () => {
	it('maps extensions case-insensitively', () => {
		expect(languageFromFileName('a.JSON')).toBe('json');
		expect(languageFromFileName('x/y/app.tsx')).toBe('typescript');
		expect(languageFromFileName('app.jsx')).toBe('javascript');
		expect(languageFromFileName('style.scss')).toBe('scss');
		expect(languageFromFileName('style.less')).toBe('less');
		expect(languageFromFileName('q.gql')).toBe('graphql');
		expect(languageFromFileName('README.md')).toBe('markdown');
		expect(languageFromFileName('ci.yml')).toBe('yaml');
		expect(languageFromFileName('logo.svg')).toBe('xml');
	});
	it('returns null for unknown / missing', () => {
		expect(languageFromFileName('notes.txt')).toBeNull();
		expect(languageFromFileName('Makefile')).toBeNull();
		expect(languageFromFileName(null)).toBeNull();
	});
	it('wins over content', () => {
		expect(det('SELECT 1', 'data.yaml')).toMatchObject({ language: 'yaml', confidence: 'high', source: 'extension' });
	});
});

describe('detectLanguage - typical samples', () => {
	const cases: Array<[FormatLanguage, string]> = [
		['json', '{"a":1,"b":[1,2,3]}'],
		['json', '[1,2,3]'],
		['xml', '<?xml version="1.0"?><root><item id="1">x</item></root>'],
		['xml', '<config><db host="x"/><cache ttl="5"/></config>'],
		['html', '<!DOCTYPE html><html><body><p>Hi</p></body></html>'],
		['html', '<div class="a"><p>Hello</p><ul><li>1</li></ul></div>'],
		['sql', 'select id, name from users where id = 1'],
		['sql', 'SELECT * FROM orders o JOIN users u ON u.id=o.uid WHERE o.total > 5;'],
		['sql', 'INSERT INTO t (a,b) VALUES (1,2);'],
		['sql', 'CREATE TABLE t (id int primary key, name text);'],
		['sql', '-- report\nWITH x AS (SELECT 1) SELECT * FROM x'],
		['css', 'body{margin:0;padding:0}.a{color:red;}'],
		['css', 'a{color:red;\n'],
		['css', '@media (min-width: 600px) {\n  .a { color: red; }\n}'],
		['scss', '$primary: #333;\n.a { color: $primary; &:hover { color: red; } }'],
		['less', '@primary: #333;\n.a { color: @primary; }'],
		['javascript', 'const a = 1;\nfunction f(x) { return x + a; }\nconsole.log(f(2));'],
		['javascript', "import React from 'react';\nexport default function App() { return null; }"],
		['typescript', 'interface User { id: number; name: string }\nconst u: User = { id: 1, name: "a" };'],
		['typescript', 'export type A = { x: number };\nexport const f = (a: string): number => a.length;'],
		['yaml', 'name: app\nversion: 1\nitems:\n  - a\n  - b\n'],
		['yaml', '---\nkey: value\nother: 2'],
		['markdown', '# Title\n\nSome **bold** text and a [link](http://x.y).\n\n- one\n- two\n'],
		['graphql', 'query GetUser { user(id: 1) { id name } }'],
		['graphql', 'type User {\n  id: ID!\n  name: String\n}\n'],
	];
	for (const [lang, text] of cases) {
		it(`${lang}: ${text.slice(0, 40).replace(/\n/g, '\\n')}`, () => {
			const d = det(text);
			expect(d.language).toBe(lang);
			expect(isDecisive(d)).toBe(true);
		});
	}
});

describe('detectLanguage - ambiguous / none', () => {
	it('empty and prose', () => {
		expect(isDecisive(det(''))).toBe(false);
		expect(isDecisive(det('   \n  '))).toBe(false);
		expect(isDecisive(det('Hello world, this is just a sentence.'))).toBe(false);
		expect(isDecisive(det('Select all the items you want to buy.'))).toBe(false);
	});
	it('a plain dash list is ambiguous (markdown vs yaml)', () => {
		const d = det('- apples\n- pears\n- plums');
		expect(d.confidence === 'low' || d.language === 'markdown').toBe(true);
	});
	it('brace-leading non-JSON is not forced to JSON', () => {
		const d = det('{ user(id: 1) { name } }');
		expect(isDecisive(d)).toBe(false);
		expect(d.candidates).toContain('json');
	});
	it('invalid JSON that looks like JSON is still tried as JSON (to report the position)', () => {
		const d = det('{"a": 1,, }');
		expect(d.language).toBe('json');
		expect(d.confidence).toBe('medium');
	});
	it('single unknown html-ish tag is ambiguous', () => {
		expect(isDecisive(det('<br>'))).toBe(false);
	});
});

describe('prettier mapping', () => {
	it('css loads only postcss', () => {
		expect(pluginsFor('css', 'a{b:c}')).toEqual(['postcss']);
	});
	it('ts loads typescript + estree, js loads babel + estree', () => {
		expect(pluginsFor('typescript', 'let a: number')).toEqual(['typescript', 'estree']);
		expect(pluginsFor('javascript', 'let a')).toEqual(['babel', 'estree']);
	});
	it('html pulls embedded plugins only when needed', () => {
		expect(pluginsFor('html', '<p>x</p>')).toEqual(['html']);
		expect(pluginsFor('html', '<style>a{}</style><script>1</script>')).toEqual(expect.arrayContaining(['html', 'babel', 'estree', 'postcss']));
	});
	it('markdown pulls yaml for front matter and fences', () => {
		expect(pluginsFor('markdown', '# x')).toEqual(['markdown']);
		expect(pluginsFor('markdown', '---\na: 1\n---\n# x')).toContain('yaml');
		expect(pluginsFor('markdown', '```css\na{}\n```')).toContain('postcss');
	});
	it('covers all prettier languages', () => {
		expect(Object.keys(PRETTIER_PARSERS).sort()).toEqual(['css', 'graphql', 'html', 'javascript', 'less', 'markdown', 'scss', 'typescript', 'yaml']);
	});
});

describe('size limits', () => {
	it('classifies', () => {
		expect(checkFormatSize(10)).toBe('ok');
		expect(checkFormatSize(FORMAT_WARN_CHARS + 1)).toBe('warn');
		expect(checkFormatSize(FORMAT_MAX_CHARS + 1)).toBe('tooLarge');
	});
});

describe('error extraction', () => {
	it('positionToLineColumn', () => {
		expect(positionToLineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
		expect(positionToLineColumn('ab', 0)).toEqual({ line: 1, column: 1 });
	});
	it('parses sql-formatter and loc-less messages', () => {
		expect(extractFormatError(new Error('Parse error: Unexpected "x" at line 3 column 7\n  frame'))).toMatchObject({ line: 3, column: 7 });
		expect(extractFormatError(new Error('Unexpected token (4:9)\n> 4 | x'))).toEqual({ line: 4, column: 9, message: 'Unexpected token' });
		expect(extractFormatError(new Error('Unexpected token } in JSON at position 5'), 'ab\ncd}ef')).toMatchObject({ line: 2, column: 3, message: 'Unexpected token }' });
		expect(extractFormatError(new Error('Unexpected closing tag "a". For more info see https://x.y/z (2:4)'))).toEqual({ line: 2, column: 4, message: 'Unexpected closing tag "a".' });
	});
});

const opts = DEFAULT_FORMAT_OPTIONS;
describe('real formatting (Node)', () => {
	it('JavaScript', async () => {
		const r = await run('const a={b:1,c:[1,2]};function f(x){return x+1}', 'javascript', opts);
		expect(r.ok && r.value).toContain('function f(x) {\n  return x + 1;\n}');
	});
	it('TypeScript with tab indent', async () => {
		const r = await run('interface A{x:number;y:string}', 'typescript', { ...opts, indent: 'tab' });
		expect(r.ok && r.value).toContain('\n\tx: number;');
	});
	it('TSX', async () => {
		const r = await run('const A=()=><div className="a">{x as number}</div>', 'typescript', opts);
		expect(r.ok).toBe(true);
	});
	it('CSS / SCSS / LESS', async () => {
		const css = await run('a{color:red;margin:0}', 'css', { ...opts, indent: '4' });
		expect(css.ok && css.value).toContain('a {\n    color: red;');
		expect((await run('.a{&:hover{color:red}}', 'scss', opts)).ok).toBe(true);
		expect((await run('@c:red;.a{color:@c}', 'less', opts)).ok).toBe(true);
	});
	it('HTML with embedded script/style', async () => {
		const r = await run('<html><head><style>a{color:red}</style></head><body><div><p>x</p></div><script>var a=1</script></body></html>', 'html', opts);
		expect(r.ok && r.value).toContain('color: red;');
		expect(r.ok && r.value).toContain('var a = 1;');
	});
	it('YAML, Markdown, GraphQL', async () => {
		const y = await run('a:   1\nb:\n    - x\n    -   y\n', 'yaml', opts);
		expect(y.ok && y.value).toBe('a: 1\nb:\n  - x\n  - y\n');
		const m = await run('Title\n=====\n\n*  a\n*  b', 'markdown', opts);
		expect(m.ok && m.value).toContain('- a');
		const g = await run('query A{user(id:1){id name}}', 'graphql', opts);
		expect(g.ok && g.value).toContain('user(id: 1) {');
	});
	it('SQL with dialects', { timeout: 60000 }, async () => {
		const r = await run('select a,b from t where x=1', 'sql', opts);
		expect(r.ok && r.value).toBe('select\n  a,\n  b\nfrom\n  t\nwhere\n  x = 1');
		const p = await run('SELECT a::int FROM t', 'sql', { ...opts, sqlDialect: 'postgresql' });
		expect(p.ok).toBe(true);
	});
	it('JSON respects indent and reports error position', async () => {
		const ok = await run('{"a":[1,{"b":2}]}', 'json', { ...opts, indent: '4' });
		expect(ok.ok && ok.value).toBe('{\n    "a": [\n        1,\n        {\n            "b": 2\n        }\n    ]\n}');
		const bad = await run('{\n  "a": 1,,\n}', 'json', opts);
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.error.line).toBe(2);
	});
	it('syntax errors give line/column and short message', async () => {
		const js = await run('const a = ;\n', 'javascript', opts);
		expect(js.ok).toBe(false);
		if (!js.ok) {
			expect(js.error.line).toBe(1);
			expect(js.error.column).toBe(11);
			expect(js.error.message).not.toContain('\n');
		}
		expect((await run('a{color:red;\n', 'css', opts)).ok).toBe(false);
		const yaml = await run('a: [1, 2\nb: 3', 'yaml', opts);
		expect(yaml.ok).toBe(false);
		if (!yaml.ok) expect(yaml.error.line).toBeGreaterThan(0);
		expect((await run('<div><span></div>', 'html', opts)).ok).toBe(false);
	});
	it('keeps the absence of a trailing newline', async () => {
		const r = await run('a:   1', 'yaml', opts);
		expect(r.ok && r.value).toBe('a: 1');
	});
});

describe('worker groups', () => {
	it('maps languages to the smallest worker bundle', () => {
		expect(workerGroupFor('json', '{}')).toBeNull();
		expect(workerGroupFor('xml', '<a/>')).toBeNull();
		expect(workerGroupFor('javascript', 'x')).toBe('js');
		expect(workerGroupFor('typescript', 'x')).toBe('ts');
		expect(workerGroupFor('scss', 'x')).toBe('css');
		expect(workerGroupFor('html', '<p>x</p>')).toBe('html');
		expect(workerGroupFor('html', '<style>a{}</style>')).toBe('htmlEmbed');
		expect(workerGroupFor('sql', 'select 1')).toBe('sql');
	});
	it('a bundle without the embedded plugins still formats the main language', async () => {
		const babelFree = { prettier: allLoaders.prettier, plugins: { html: allLoaders.plugins!.html } };
		const r = await runFormat('<div><script>var a=1</script><p>x</p></div>', 'html', DEFAULT_FORMAT_OPTIONS, babelFree);
		expect(r.ok).toBe(true);
	});
	it('reports a missing library instead of throwing', async () => {
		const r = await runFormat('a:1', 'yaml', DEFAULT_FORMAT_OPTIONS, {});
		expect(r.ok).toBe(false);
	});
});
