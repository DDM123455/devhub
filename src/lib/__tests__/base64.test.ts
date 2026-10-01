import { describe, expect, it } from 'vitest';
import { cleanBase64Input, decodeText, encodeText, extractDataUri, fromUrlSafeOrStandard } from '../base64';

describe('decodeText', () => {
	it('round-trips Unicode text', () => {
		const enc = encodeText('Xin chào 👋', false, false);
		expect(decodeText(enc, 'utf-8')).toEqual({ ok: true, text: 'Xin chào 👋' });
	});
	it('strips a data URI prefix and whitespace', () => {
		const enc = encodeText('hello world', false, false);
		const input = `data:text/plain;base64,${enc.slice(0, 5)}\n ${enc.slice(5)}`;
		expect(decodeText(input, 'utf-8')).toEqual({ ok: true, text: 'hello world' });
	});
	it('accepts URL-safe, unpadded input', () => {
		expect(decodeText('Pz8_', 'utf-8')).toEqual({ ok: true, text: '???' });
		expect(decodeText('aGk', 'utf-8')).toEqual({ ok: true, text: 'hi' });
	});
	it('distinguishes invalid Base64 from valid Base64 that is not UTF-8 text', () => {
		expect(decodeText('not base64!!', 'utf-8')).toEqual({ ok: false, reason: 'invalidBase64' });
		expect(decodeText('A', 'utf-8')).toEqual({ ok: false, reason: 'invalidBase64' });
		// PNG signature bytes: valid Base64, invalid UTF-8
		expect(decodeText('iVBORw0KGgo=', 'utf-8')).toEqual({ ok: false, reason: 'notText' });
	});
});

describe('data uri helpers', () => {
	it('parses data URIs with extra parameters', () => {
		expect(extractDataUri('data:image/png;name=a.png;base64,AAA=')).toEqual({ mime: 'image/png', base64: 'AAA=' });
		expect(cleanBase64Input(' ab cd\n')).toBe('abcd');
	});
	it('normalises URL-safe to padded standard Base64', () => {
		expect(fromUrlSafeOrStandard('Pz8_')).toBe('Pz8/');
		expect(fromUrlSafeOrStandard('aGk')).toBe('aGk=');
	});
});
