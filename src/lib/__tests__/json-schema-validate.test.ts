import { describe, expect, it } from 'vitest';
import { validateJsonSchema } from '../json-schema-validate';
import { compressToUrlSafeBase64, decompressFromUrlSafeBase64 } from '../hash-share';
import { inferJsonSchema } from '../json-tools';

describe('validateJsonSchema', () => {
	const schema = {
		type: 'object',
		required: ['name', 'age'],
		properties: {
			name: { type: 'string', minLength: 2 },
			age: { type: 'integer', minimum: 0 },
			tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
			role: { enum: ['a', 'b'] },
		},
		additionalProperties: false,
	};
	it('accepts valid data', () => {
		expect(validateJsonSchema({ name: 'Al', age: 3, tags: ['x'] }, schema)).toEqual([]);
	});
	it('reports type, required, minimum, enum, additionalProperties with paths', () => {
		const errors = validateJsonSchema({ name: 5, age: -1, role: 'c', extra: 1, tags: ['x', 'x', 3] }, schema);
		const text = errors.map((e) => `${e.keyword}@${e.path}`);
		expect(text).toEqual(expect.arrayContaining(['type@/name', 'minimum@/age', 'enum@/role', 'additionalProperties@/extra', 'uniqueItems@/tags', 'type@/tags/2']));
		expect(validateJsonSchema({ name: 'Al' }, schema)[0].message).toContain('age');
	});
	it('supports anyOf, oneOf, $ref and format', () => {
		const s = { definitions: { id: { type: 'string', format: 'uuid' } }, properties: { a: { $ref: '#/definitions/id' }, b: { anyOf: [{ type: 'string' }, { type: 'null' }] } } };
		expect(validateJsonSchema({ a: 'nope', b: 1 }, s).map((e) => e.keyword).sort()).toEqual(['anyOf', 'format']);
		expect(validateJsonSchema({ a: '123e4567-e89b-12d3-a456-426614174000', b: null }, s)).toEqual([]);
	});
	it('round trips with an inferred schema', () => {
		const data = { id: 1, list: [{ a: 1 }, { a: 2, b: 'x' }], n: null };
		expect(validateJsonSchema(data, inferJsonSchema(data))).toEqual([]);
		expect(validateJsonSchema({ ...data, id: 'x' }, inferJsonSchema(data)).length).toBe(1);
	});
});

describe('hash-share', () => {
	it('round-trips unicode text', async () => {
		const text = JSON.stringify({ a: 'xin chào ✓', n: [1, 2, 3] }, null, 2).repeat(5);
		const c = await compressToUrlSafeBase64(text);
		expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(await decompressFromUrlSafeBase64(c)).toBe(text);
	});
});
