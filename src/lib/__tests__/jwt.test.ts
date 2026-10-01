import { describe, expect, it } from 'vitest';
import { decodeToken, formatTimestamp, normalizeToken, stringToBase64Url, timeStatus } from '../jwt';

function makeToken(header: string, payload: string, signature = 'sig') {
	return `${stringToBase64Url(header)}.${stringToBase64Url(payload)}.${signature}`;
}

describe('normalizeToken', () => {
	it('strips Bearer prefix, header name, quotes and whitespace/newlines', () => {
		expect(normalizeToken('  Bearer aaa.bbb.ccc  ')).toBe('aaa.bbb.ccc');
		expect(normalizeToken('Authorization: Bearer aaa.bbb.ccc')).toBe('aaa.bbb.ccc');
		expect(normalizeToken('"aaa.bbb.\nccc",')).toBe('aaa.bbb.ccc');
	});
});

describe('decodeToken', () => {
	it('accepts an empty signature (alg: none)', () => {
		const t = makeToken('{"alg":"none"}', '{"sub":"1"}', '');
		const d = decodeToken(t);
		expect((d.header as { alg: string }).alg).toBe('none');
		expect(d.signatureB64).toBe('');
	});
	it('decodes tokens pasted with Bearer and line breaks', () => {
		const t = makeToken('{"alg":"HS256"}', '{"a":1}');
		const wrapped = `Bearer ${t.slice(0, 10)}\n${t.slice(10)}`;
		expect(decodeToken(wrapped).payloadPretty).toBe('{\n  "a": 1\n}');
	});
	it('keeps 64-bit integers exact in the pretty and compact output', () => {
		const t = makeToken('{"alg":"HS256"}', '{"id":9007199254740993123}');
		const d = decodeToken(t);
		expect(d.payloadPretty).toContain('9007199254740993123');
		expect(d.payloadCompact).toBe('{"id":9007199254740993123}');
		expect(d.hasUnsafeNumbers).toBe(true);
	});
	it('reports typed errors', () => {
		expect(() => decodeToken('abc')).toThrow(expect.objectContaining({ kind: 'format' }));
		expect(() => decodeToken('a$.b.c')).toThrow(expect.objectContaining({ kind: 'base64' }));
		expect(() => decodeToken(makeToken('not json', '{}'))).toThrow(expect.objectContaining({ kind: 'json' }));
	});
});

describe('time helpers', () => {
	it('shows UTC alongside local time', () => {
		expect(formatTimestamp(0)).toContain('UTC: 1970-01-01 00:00:00Z');
		expect(formatTimestamp('x')).toBeNull();
	});
	it('evaluates exp and nbf', () => {
		const now = 1_000_000 * 1000;
		expect(timeStatus({ exp: 999_999 }, now)).toBe('expired');
		expect(timeStatus({ nbf: 1_000_001 }, now)).toBe('notYetValid');
		expect(timeStatus({ exp: 1_000_100, nbf: 999_000 }, now)).toBe('valid');
		expect(timeStatus({}, now)).toBe('unknown');
	});
});
