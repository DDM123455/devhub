import { describe, expect, it } from 'vitest';
import { decodeBase64File, detectImageMime } from '../base64-file';
import { bytesToBase64 } from '../base64';
describe('Base64 image files', () => {
	it('detects PNG from raw Base64 and preserves every byte', () => {
		const bytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0]);
		const r = decodeBase64File(bytesToBase64(bytes));
		expect(r.mime).toBe('image/png'); expect(r.bytes).toEqual(bytes);
		expect(r.dataUri).toMatch(/^data:image\/png;base64,/);
	});
	it('recognizes JPEG, GIF and WebP, ignoring an incorrect declared MIME', () => {
		expect(decodeBase64File('data:text/plain;base64,/9j/').mime).toBe('image/jpeg');
		expect(detectImageMime(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
		expect(detectImageMime(new TextEncoder().encode('RIFF1234WEBP'))).toBe('image/webp');
	});
	it('accepts URL-safe data and whitespace, rejects broken input', () => {
		expect(decodeBase64File(' _9j_\n').mime).toBe('image/jpeg');
		for(const bad of ['a', '###', ''])expect(()=>decodeBase64File(bad)).toThrow();
	});
	it('leaves unknown binary files as generic downloads', () => {
		expect(decodeBase64File('AAEC').mime).toBe('application/octet-stream');
	});
});
