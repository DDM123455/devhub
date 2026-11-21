import { describe, expect, it } from 'vitest';
import { autoFormatText, compareJsonText } from '../text-format';

// The XML branch uses `DOMParser`, a browser-only global not present in Vitest's default
// Node environment (no `jsdom`/`happy-dom` dependency in this repo, and adding one just for
// this needs the same "ask before adding a dependency" pass as any other new dependency —
// not done here). Only the JSON branch and the graceful-fallback behavior are covered by
// this suite; the XML branch is exercised manually in a real browser instead.

describe('autoFormatText', () => {
	it('pretty-prints minified JSON with 2-space indentation', () => {
		const result = autoFormatText('{"a":1,"b":[1,2,3]}');
		expect(result?.detected).toBe('json');
		expect(result?.value).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2,\n    3\n  ]\n}');
	});

	it('re-indents already-formatted JSON the same way (idempotent)', () => {
		const once = autoFormatText('{"a":1}');
		const twice = autoFormatText(once!.value);
		expect(twice?.value).toBe(once?.value);
	});

	it('returns null for plain prose text (not JSON or XML)', () => {
		expect(autoFormatText('The quick brown fox jumps over the lazy dog.')).toBeNull();
	});

	it('returns null for text that only looks JSON-ish but is malformed', () => {
		expect(autoFormatText('{"a": 1,}')).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(autoFormatText('')).toBeNull();
	});

	it('does not misdetect a JSON array of objects as XML', () => {
		const result = autoFormatText('[{"id":1},{"id":2}]');
		expect(result?.detected).toBe('json');
	});
});
describe('exact JSON comparison', () => {
	it('preserves duplicate fields and reports exact numeric values', () => {
		expect(compareJsonText('{"id":9007199254740993,"id":1e400}', '{"id":9007199254740992,"id":2e400}')).toEqual([
			{ path: '$.id#1', type: 'changed', leftValue: '9007199254740993', rightValue: '9007199254740992' },
			{ path: '$.id#2', type: 'changed', leftValue: '1e400', rightValue: '2e400' },
		]);
	});
	it('ignores object key order and equivalent decimals without rounding', () => {
		expect(compareJsonText('{"x":0.0010,"y":[-0,12e400]}','{"y":[0.0,1.2e401],"x":1e-3}')).toEqual([]);
		expect(compareJsonText('["1"]','[1]')).toHaveLength(1);
		expect(compareJsonText('{}','{')).toBe('invalidRight');
		expect(compareJsonText('{}', '\u00a0{}')).toBe('invalidRight');
		expect(compareJsonText('1' + '0'.repeat(500), '1e500')).toEqual([]);
	});
});
