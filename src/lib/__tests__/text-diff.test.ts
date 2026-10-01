import { describe, expect, it } from 'vitest';
import { analyzeDiffInput, buildLineDiff, countLineStats, renderMergedColumn, splitDocumentLines } from '../text-diff';
import { escapeXmlAttr, escapeXmlText, formatJsonLossless } from '../text-format';

describe('splitDocumentLines', () => {
	it('keeps single blank lines and drops only the final terminator', () => {
		expect(splitDocumentLines('a\n\nb')).toEqual(['a', '', 'b']);
		expect(splitDocumentLines('a\n')).toEqual(['a']);
		expect(splitDocumentLines('a\n\n')).toEqual(['a', '']);
		expect(splitDocumentLines('')).toEqual([]);
		expect(splitDocumentLines('\n')).toEqual(['']);
	});
});

describe('buildLineDiff', () => {
	it('reports an inserted blank line (was "identical" before)', () => {
		const entries = buildLineDiff('a\nb', 'a\n\nb', 'line');
		expect(countLineStats(entries)).toEqual({ added: 1, removed: 0, modified: 0 });
	});

	it('merge keeps blank lines', () => {
		const entries = buildLineDiff('a\nb', 'a\n\nb', 'line');
		expect(renderMergedColumn(entries, new Map(), 'right')).toBe('a\n\nb');
		expect(renderMergedColumn(entries, new Map(), 'left')).toBe('a\nb');
	});

	it('keeps the original left text under ignoreCase', () => {
		const entries = buildLineDiff('Hello\nWORLD', 'hello\nworld', 'word', { ignoreCase: true });
		expect(entries.every((e) => e.type === 'unchanged')).toBe(true);
		expect(entries.map((e) => e.leftText)).toEqual(['Hello', 'WORLD']);
		expect(entries.map((e) => e.rightText)).toEqual(['hello', 'world']);
	});

	it('keeps original text of the left side in segments under ignoreCase', () => {
		const entries = buildLineDiff('Hello Foo', 'hello Bar', 'word', { ignoreCase: true });
		expect(entries[0].type).toBe('modified');
		expect(entries[0].leftSegments?.map((s) => s.value).join('')).toBe('Hello Foo');
		expect(entries[0].rightSegments?.map((s) => s.value).join('')).toBe('hello Bar');
	});

	it('ignoreWhitespace collapses runs of whitespace', () => {
		const entries = buildLineDiff('a   b\t c', 'a b c', 'line', { ignoreWhitespace: true });
		expect(countLineStats(entries)).toEqual({ added: 0, removed: 0, modified: 0 });
		expect(entries[0].leftText).toBe('a   b\t c');
		const strict = buildLineDiff('a   b', 'a b', 'line');
		expect(countLineStats(strict).modified).toBe(1);
	});

	it('char mode treats ZWJ emoji as one unit', () => {
		const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
		const entries = buildLineDiff(`x${family}`, `y${family}`, 'char');
		const left = entries[0].leftSegments!;
		expect(left.map((s) => s.value).join('')).toBe(`x${family}`);
		expect(left.find((s) => !s.removed)?.value).toBe(family);
	});
});

describe('analyzeDiffInput', () => {
	it('flags trailing newline differences', () => {
		expect(analyzeDiffInput('a\n', 'a', 'a\n', 'a').trailingNewlineDiffers).toBe(true);
		expect(analyzeDiffInput('a\n', 'a\n', 'a\n', 'a\n').trailingNewlineDiffers).toBe(false);
	});
	it('flags CRLF vs LF', () => {
		expect(analyzeDiffInput('a\r\nb', 'a\nb', 'a\nb', 'a\nb').lineEndingsDiffer).toBe(true);
		expect(analyzeDiffInput('a\nb', 'a\nb', 'a\nb', 'a\nb').lineEndingsDiffer).toBe(false);
	});
});

describe('formatJsonLossless', () => {
	it('preserves integers beyond 2^53 and duplicate keys', () => {
		const r = formatJsonLossless('{"id":12345678901234567890,"a":1,"a":2}');
		expect(r?.value).toContain('12345678901234567890');
		expect(r?.hasDuplicateKeys).toBe(true);
		expect(r?.value.match(/"a"/g)).toHaveLength(2);
	});
	it('keeps key order and rejects invalid JSON', () => {
		expect(formatJsonLossless('{"b":1,"2":2,"1":3}')?.value).toBe('{\n  "b": 1,\n  "2": 2,\n  "1": 3\n}');
		expect(formatJsonLossless('{"a":}')).toBeNull();
		expect(formatJsonLossless('[1,]')).toBeNull();
		expect(formatJsonLossless('{"a":1} x')).toBeNull();
	});
	it('prints empty containers compactly', () => {
		expect(formatJsonLossless('{"a":[],"b":{}}')?.value).toBe('{\n  "a": [],\n  "b": {}\n}');
	});
});

describe('xml escaping', () => {
	it('escapes text and attribute values', () => {
		expect(escapeXmlText('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
		expect(escapeXmlAttr('say "hi" & <go>\n')).toBe('say &quot;hi&quot; &amp; &lt;go&gt;&#10;');
	});
});
