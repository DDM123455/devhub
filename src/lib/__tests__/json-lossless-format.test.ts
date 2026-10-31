import { describe, expect, it } from 'vitest';
import { formatJsonLossless } from '../text-format';

describe('formatJsonLossless (what the JSON Formatter Format/Minify buttons use)', () => {
	const src = '{"id":12345678901234567890,"f":1.0,"e":1e400,"a":1,"a":2}';
	it('keeps big integers, number spelling and huge exponents exactly as typed', () => {
		const out = formatJsonLossless(src)!;
		expect(out.value).toContain('"id": 12345678901234567890');
		expect(out.value).toContain('"f": 1.0');
		expect(out.value).toContain('"e": 1e400');
	});
	it('keeps duplicate keys and reports them', () => {
		const out = formatJsonLossless(src)!;
		expect(out.hasDuplicateKeys).toBe(true);
		expect(out.value.match(/"a":/g)).toHaveLength(2);
	});
	it('minifies and indents with the requested unit', () => {
		expect(formatJsonLossless(src, true)!.value).toBe('{"id":12345678901234567890,"f":1.0,"e":1e400,"a":1,"a":2}');
		expect(formatJsonLossless('{"a":[1]}', false, '\t')!.value).toBe('{\n\t"a": [\n\t\t1\n\t]\n}');
	});
	it('returns null for invalid JSON', () => {
		expect(formatJsonLossless('{"a":1,}')).toBeNull();
		expect(formatJsonLossless('')).toBeNull();
	});
});
