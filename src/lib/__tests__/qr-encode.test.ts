import { describe, expect, it } from 'vitest';
import {
	batchBaseName,
	buildEmailPayload,
	buildVCardPayload,
	escapeVCardValue,
	normalizeUrlInput,
	parseBatchLines,
	qrContrastWarning,
	quietZoneMargin,
	uniqueName,
	utf8ToBinaryString,
} from '../qr-encode';

describe('utf8ToBinaryString', () => {
	it('leaves ASCII untouched', () => {
		expect(utf8ToBinaryString('hello')).toBe('hello');
	});

	it('expands accented/CJK text into one char per UTF-8 byte', () => {
		const bin = utf8ToBinaryString('café');
		expect(bin.length).toBe(5);
		expect(Array.from(bin, (c) => c.charCodeAt(0))).toEqual([0x63, 0x61, 0x66, 0xc3, 0xa9]);
		// Each char fits in a byte, so the Latin-1 encoder in qrcode-generator is lossless.
		expect(Array.from(bin).every((c) => c.charCodeAt(0) <= 0xff)).toBe(true);
		const decoded = new TextDecoder().decode(Uint8Array.from(Array.from(bin, (c) => c.charCodeAt(0))));
		expect(decoded).toBe('café');
		expect(utf8ToBinaryString('日本').length).toBe(6);
		const vi = 'Quét mã';
		const back = new TextDecoder().decode(Uint8Array.from(Array.from(utf8ToBinaryString(vi), (c) => c.charCodeAt(0))));
		expect(back).toBe(vi);
	});
});

describe('buildEmailPayload', () => {
	it('uses %20 not + for spaces', () => {
		const payload = buildEmailPayload({ to: 'a@b.com', subject: 'Hello world', body: 'Line 1\nLine 2' });
		expect(payload).toBe('mailto:a@b.com?subject=Hello%20world&body=Line%201%0ALine%202');
		expect(payload).not.toContain('+');
	});

	it('omits the query when subject/body are empty', () => {
		expect(buildEmailPayload({ to: 'a@b.com', subject: '', body: '' })).toBe('mailto:a@b.com');
	});
});

describe('vCard escaping', () => {
	it('escapes backslash, semicolon, comma and newline', () => {
		expect(escapeVCardValue('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
	});

	it('escapes inside the payload', () => {
		const v = buildVCardPayload({ firstName: 'A;B', lastName: 'C,D', phone: '', email: '', org: 'X\\Y', url: '' });
		expect(v).toContain('N:C\\,D;A\\;B;;;');
		expect(v).toContain('ORG:X\\\\Y');
	});
});

describe('normalizeUrlInput', () => {
	it('adds https:// to bare domains and flags it', () => {
		expect(normalizeUrlInput('example.com/a')).toEqual({ value: 'https://example.com/a', added: true });
	});
	it('keeps existing schemes, free text and empty input', () => {
		expect(normalizeUrlInput('http://x.io')).toEqual({ value: 'http://x.io', added: false });
		expect(normalizeUrlInput('mailto:a@b.com').added).toBe(false);
		expect(normalizeUrlInput('hello world').added).toBe(false);
		expect(normalizeUrlInput('   ')).toEqual({ value: '', added: false });
	});
});

describe('quiet zone and contrast', () => {
	it('scales margin with size', () => {
		expect(quietZoneMargin(256)).toBeLessThan(quietZoneMargin(1024));
		expect(quietZoneMargin(10)).toBeGreaterThanOrEqual(8);
	});
	it('warns for inverted and low contrast colors', () => {
		expect(qrContrastWarning('#000000', '#ffffff')).toBeNull();
		expect(qrContrastWarning('#ffffff', '#000000')).toBe('inverted');
		expect(qrContrastWarning('#cccccc', '#ffffff')).toBe('low');
	});
});

describe('batch helpers', () => {
	it('caps lines and remembers original line numbers', () => {
		const input = 'a\n\nb\nc';
		const r = parseBatchLines(input, 2);
		expect(r.lines).toEqual([
			{ text: 'a', line: 1 },
			{ text: 'b', line: 3 },
		]);
		expect(r.truncated).toBe(true);
		expect(r.total).toBe(3);
	});

	it('dedupes names case-insensitively and bounds length', () => {
		const used = new Set<string>();
		const first = uniqueName(batchBaseName('https://Example.com', 0), used, 0);
		const second = uniqueName(batchBaseName('https://example.COM', 1), used, 1);
		expect(first.toLowerCase()).not.toBe(second.toLowerCase());
		const long = batchBaseName('x'.repeat(200), 2);
		expect(long.length).toBeLessThanOrEqual(40);
		const dupLong = uniqueName(long, new Set([long.toLowerCase()]), 2);
		expect(dupLong.length).toBeLessThanOrEqual(40);
	});
});
