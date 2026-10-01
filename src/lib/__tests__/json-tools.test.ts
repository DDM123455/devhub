import { describe, expect, it } from 'vitest';
import { detectRepairIssues, generateCode, inferJsonSchema, parseNdjson, queryJsonPath } from '../json-tools';

const sample = {
	id: 1,
	name: 'A',
	price: 2.5,
	tags: ['x', 'y'],
	owner: { first_name: 'B', email: null },
	items: [
		{ sku: 'a', qty: 1 },
		{ sku: 'b', qty: 2, note: 'hi' },
	],
};

describe('generateCode', () => {
	it('typescript: nested, arrays, optional, null', () => {
		const out = generateCode(sample, 'typescript');
		expect(out).toContain('export interface Root {');
		expect(out).toContain('  tags: string[];');
		expect(out).toContain('  owner: Owner;');
		expect(out).toContain('  email: null;');
		expect(out).toContain('  items: Item[];');
		expect(out).toContain('  note?: string;');
		expect(out).toContain('  price: number;');
	});
	it('go struct with json tags', () => {
		const out = generateCode(sample, 'go');
		expect(out).toContain('type Root struct {');
		expect(out).toContain('FirstName string `json:"first_name"`');
		expect(out).toContain('Note string `json:"note,omitempty"`');
		expect(out).toContain('Price float64');
	});
	it('java / csharp', () => {
		expect(generateCode(sample, 'java')).toContain('public List<String> tags;');
		expect(generateCode(sample, 'java')).toContain('@JsonProperty("first_name")');
		const cs = generateCode(sample, 'csharp');
		expect(cs).toContain('public long Id { get; set; }');
		expect(cs).toContain('public List<Item> Items { get; set; }');
	});
	it('python dataclass puts children first and Optional defaults last', () => {
		const out = generateCode(sample, 'python-dataclass');
		expect(out.indexOf('class Owner:')).toBeLessThan(out.indexOf('class Root:'));
		expect(out).toContain('note: Optional[str] = None');
		expect(out).toContain('tags: List[str]');
	});
	it('python typeddict', () => {
		const out = generateCode(sample, 'python-typeddict');
		expect(out).toContain('class Item(TypedDict):');
		expect(out).toContain('note: NotRequired[str]');
	});
	it('union and nullable mix', () => {
		const out = generateCode({ a: [1, 'x'], b: [1, null] }, 'typescript');
		expect(out).toContain('a: (number | string)[];');
		expect(out).toContain('b: (number | null)[];');
	});
	it('top-level array uses the element type', () => {
		expect(generateCode([{ a: 1 }, { a: 2 }], 'typescript')).toContain('a: number;');
	});
});

describe('inferJsonSchema', () => {
	it('infers properties, required, integer vs number', () => {
		const s = inferJsonSchema(sample) as any;
		expect(s.type).toBe('object');
		expect(s.properties.id).toEqual({ type: 'integer' });
		expect(s.properties.price).toEqual({ type: 'number' });
		expect(s.required).toContain('owner');
		expect(s.properties.items.items.required).toEqual(['sku', 'qty']);
		expect(s.properties.owner.properties.email).toEqual({ type: 'null' });
	});
	it('mixed union becomes a type array', () => {
		expect((inferJsonSchema({ a: [1, 'x'] }) as any).properties.a.items).toEqual({ type: ['integer', 'string'] });
	});
});

describe('queryJsonPath', () => {
	const doc = { store: { book: [{ title: 'A', price: 5 }, { title: 'B', price: 15 }, { title: 'C', price: 25 }], bike: { color: 'red' } } };
	it('child / index / negative index', () => {
		expect(queryJsonPath(doc, '$.store.bike.color')[0].value).toBe('red');
		expect(queryJsonPath(doc, '$.store.book[0].title')[0].value).toBe('A');
		expect(queryJsonPath(doc, '$.store.book[-1].title')[0].value).toBe('C');
	});
	it('wildcard, recursive descent, slice, union', () => {
		expect(queryJsonPath(doc, '$.store.book[*].title').map((m) => m.value)).toEqual(['A', 'B', 'C']);
		expect(queryJsonPath(doc, '$..price').map((m) => m.value)).toEqual([5, 15, 25]);
		expect(queryJsonPath(doc, '$.store.book[0:2].title').map((m) => m.value)).toEqual(['A', 'B']);
		expect(queryJsonPath(doc, "$.store.book[0,2].title").map((m) => m.value)).toEqual(['A', 'C']);
		expect(queryJsonPath(doc, "$['store']['bike']['color']")[0].value).toBe('red');
	});
	it('filters', () => {
		expect(queryJsonPath(doc, '$.store.book[?(@.price < 20)].title').map((m) => m.value)).toEqual(['A', 'B']);
		expect(queryJsonPath(doc, "$.store.book[?(@.title == 'C')].price")[0].value).toBe(25);
		expect(queryJsonPath(doc, '$.store.book[?(@.price > 10 && @.price < 20)].title').map((m) => m.value)).toEqual(['B']);
	});
	it('reports path of matches and throws on bad syntax', () => {
		expect(queryJsonPath(doc, '$.store.book[1]')[0].path).toBe('$.store.book[1]');
		expect(() => queryJsonPath(doc, 'store')).toThrow();
	});
});

describe('repair helpers', () => {
	it('detects common problems outside strings', () => {
		const issues = detectRepairIssues("{a: 'x', // hi\n b: [1,2,],}");
		expect(issues).toEqual(expect.arrayContaining(['comments', 'singleQuotes', 'trailingCommas', 'unquotedKeys']));
	});
	it('does not flag text inside strings', () => {
		expect(detectRepairIssues('{"a": "http://x.com, ]"}')).toEqual([]);
	});
	it('parses ndjson', () => {
		expect(parseNdjson('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
		expect(parseNdjson('{"a":1}\nnope')).toBeNull();
	});
});
