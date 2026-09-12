import { describe, expect, it } from 'vitest';
import { autoFormatText } from '../text-format';

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
