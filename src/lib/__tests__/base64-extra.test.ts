import { describe, expect, it } from 'vitest';
import {
	analyzeBase64,
	compressBytes,
	ConvertError,
	convertEncoding,
	decodeToBytes,
	decompressBytes,
	detectCompression,
	encodeFromBytes,
	mapLinesSafe,
	prettyPrintIfJson,
} from '../base64-extra';

const text = (s: string) => new TextEncoder().encode(s);

describe('analyzeBase64', () => {
	it('detects alphabet, padding, whitespace and data URIs', () => {
		expect(analyzeBase64('aGVsbG8=')).toMatchObject({ valid: true, alphabet: 'none', paddingState: 'present' });
		expect(analyzeBase64('aGVsbG8')).toMatchObject({ valid: true, paddingState: 'missing' });
		expect(analyzeBase64('a-_b')).toMatchObject({ valid: true, alphabet: 'urlsafe' });
		expect(analyzeBase64('a+/b')).toMatchObject({ valid: true, alphabet: 'standard' });
		expect(analyzeBase64('a+-b').valid).toBe(false);
		expect(analyzeBase64('aGVs\nbG8=')).toMatchObject({ valid: true, hadWhitespace: true });
		expect(analyzeBase64('data:image/png;base64,aGVsbG8=')).toMatchObject({ valid: true, dataUriMime: 'image/png' });
	});
	it('reports positions of invalid characters', () => {
		const a = analyzeBase64('aGVs\nbG#8');
		expect(a.valid).toBe(false);
		expect(a.problems[0]).toMatchObject({ index: 7, line: 2, column: 3, char: '#' });
	});
	it('flags bad length and misplaced padding', () => {
		expect(analyzeBase64('abcde').badLength).toBe(true);
		expect(analyzeBase64('ab=cd').valid).toBe(false);
		expect(analyzeBase64('abcd====').valid).toBe(false);
	});
});

describe('byte encodings', () => {
	it('hex', () => {
		expect(encodeFromBytes('hex', text('Hi!'))).toBe('486921');
		expect(Array.from(decodeToBytes('hex', '0x48 69:21'))).toEqual([0x48, 0x69, 0x21]);
		expect(() => decodeToBytes('hex', '4g')).toThrow(ConvertError);
		expect(() => decodeToBytes('hex', '486')).toThrow(ConvertError);
	});
	it('base32 (RFC 4648 vectors)', () => {
		expect(encodeFromBytes('base32', text('foobar'))).toBe('MZXW6YTBOI======');
		expect(encodeFromBytes('base32', text('fo'))).toBe('MZXQ====');
		expect(encodeFromBytes('text', decodeToBytes('base32', 'mzxw6ytboi'))).toBe('foobar');
	});
	it('base58 (Bitcoin alphabet)', () => {
		expect(encodeFromBytes('base58', text('Hello World!'))).toBe('2NEpo7TZRRrLZSi2U');
		expect(encodeFromBytes('base58', Uint8Array.from([0, 0, 1]))).toBe('112');
		expect(Array.from(decodeToBytes('base58', '112'))).toEqual([0, 0, 1]);
		expect(() => decodeToBytes('base58', '0OIl')).toThrow(ConvertError);
	});
	it('ascii85', () => {
		expect(encodeFromBytes('ascii85', text('Man '))).toBe('9jqo^');
		expect(encodeFromBytes('ascii85', text('Man is distinguished'))).toBe('9jqo^BlbD-BleB1DJ+*+F(f,q');
		expect(encodeFromBytes('text', decodeToBytes('ascii85', '<~9jqo^BlbD-BleB1DJ+*+F(f,q~>'))).toBe('Man is distinguished');
		expect(encodeFromBytes('ascii85', new Uint8Array(4))).toBe('z');
		expect(Array.from(decodeToBytes('ascii85', 'z'))).toEqual([0, 0, 0, 0]);
	});
	it('base64 <-> hex via convertEncoding, including url-safe and unpadded input', () => {
		expect(convertEncoding('base64', 'hex', 'aGVsbG8=')).toBe('68656c6c6f');
		expect(convertEncoding('base64', 'hex', 'aGVsbG8')).toBe('68656c6c6f');
		expect(convertEncoding('hex', 'base64url', 'fbff')).toBe('-_8');
		expect(convertEncoding('base64', 'text', 'data:text/plain;base64,aGk=')).toBe('hi');
		expect(() => convertEncoding('base64', 'hex', 'a$b')).toThrow(ConvertError);
		expect(() => convertEncoding('hex', 'text', 'ff')).toThrow(ConvertError);
	});
});

describe('compression', () => {
	it('round trips gzip / zlib / deflate-raw and auto-detects', async () => {
		const data = text('hello hello hello hello hello hello');
		for (const kind of ['gzip', 'zlib', 'deflate-raw'] as const) {
			const packed = await compressBytes(data, kind);
			const unpacked = await decompressBytes(packed, 'auto');
			expect(unpacked.kind).toBe(kind);
			expect(new TextDecoder().decode(unpacked.bytes)).toBe('hello hello hello hello hello hello');
		}
		expect(detectCompression(await compressBytes(data, 'gzip'))).toBe('gzip');
	});
	it('rejects non-compressed data', async () => {
		await expect(decompressBytes(text('definitely not compressed'), 'gzip')).rejects.toBeTruthy();
	});
});

describe('line helpers', () => {
	it('maps lines and reports failures', () => {
		const out = mapLinesSafe('a\n\nb', (l) => l.toUpperCase(), (l) => `ERR ${l}`);
		expect(out).toBe('A\n\nB');
		expect(mapLinesSafe('ok\nbad', (l) => { if (l === 'bad') throw new Error('x'); return l; }, (l) => `ERR ${l}`)).toBe('ok\nERR bad');
	});
	it('prettyPrintIfJson', () => {
		expect(prettyPrintIfJson('{"a":1}')).toBe('{\n  "a": 1\n}');
		expect(prettyPrintIfJson('hello')).toBeNull();
		expect(prettyPrintIfJson('{bad')).toBeNull();
	});
});
