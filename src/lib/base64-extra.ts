// Extra helpers for the Base64 tool: input analysis / validation with error positions,
// conversion between byte encodings (Hex / Base32 / Base58 / Ascii85), gzip/zlib/deflate
// (de)compression via the native Compression Streams API, and per-line processing.

import { base64ToBytes, bytesToBase64, extractDataUri, fromUrlSafeOrStandard, toUrlSafe } from './base64';

/* ------------------------------------------------------------------ analysis */

export interface Base64Problem {
	/** Index into the ORIGINAL input string. */
	index: number;
	line: number;
	column: number;
	char: string;
}

export interface Base64Analysis {
	valid: boolean;
	empty: boolean;
	alphabet: 'standard' | 'urlsafe' | 'mixed' | 'none';
	paddingState: 'present' | 'missing' | 'notNeeded' | 'misplaced';
	hadWhitespace: boolean;
	dataUriMime: string | null;
	/** First invalid characters (max 5). */
	problems: Base64Problem[];
	/** True when the cleaned length can never be valid Base64 (length % 4 === 1). */
	badLength: boolean;
	cleanedLength: number;
}

function lineColumn(text: string, index: number): { line: number; column: number } {
	let line = 1;
	let last = -1;
	for (let i = 0; i < index; i++) {
		if (text[i] === '\n') {
			line++;
			last = i;
		}
	}
	return { line, column: index - last };
}

export function analyzeBase64(input: string): Base64Analysis {
	const dataUri = extractDataUri(input);
	let body = input;
	let offset = 0;
	if (dataUri) {
		const comma = input.indexOf(',');
		offset = comma + 1;
		body = input.slice(offset);
	}
	const problems: Base64Problem[] = [];
	let hadWhitespace = false;
	let hasStd = false;
	let hasUrl = false;
	let clean = '';
	let firstPad = -1;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (/\s/.test(ch)) {
			hadWhitespace = true;
			continue;
		}
		if (ch === '=') {
			if (firstPad === -1) firstPad = clean.length;
			clean += ch;
			continue;
		}
		if (ch === '+' || ch === '/') hasStd = true;
		else if (ch === '-' || ch === '_') hasUrl = true;
		else if (!/[A-Za-z0-9]/.test(ch)) {
			if (problems.length < 5) problems.push({ index: offset + i, ...lineColumn(input, offset + i), char: ch });
			continue;
		}
		if (firstPad !== -1 && problems.length < 5) {
			// A data character after '=' padding began.
			problems.push({ index: offset + i, ...lineColumn(input, offset + i), char: ch });
		}
		clean += ch;
	}
	const dataPart = firstPad === -1 ? clean : clean.slice(0, firstPad);
	const padCount = firstPad === -1 ? 0 : clean.length - firstPad;
	const misplaced = firstPad !== -1 && clean.slice(firstPad).replace(/=/g, '') !== '';
	const badLength = dataPart.length % 4 === 1;
	let paddingState: Base64Analysis['paddingState'];
	if (misplaced || padCount > 2) paddingState = 'misplaced';
	else if (padCount > 0) paddingState = (dataPart.length + padCount) % 4 === 0 ? 'present' : 'misplaced';
	else paddingState = dataPart.length % 4 === 0 ? 'notNeeded' : 'missing';
	const alphabet: Base64Analysis['alphabet'] = hasStd && hasUrl ? 'mixed' : hasStd ? 'standard' : hasUrl ? 'urlsafe' : 'none';
	const valid = problems.length === 0 && !badLength && paddingState !== 'misplaced' && alphabet !== 'mixed' && clean.length > 0;
	return {
		valid,
		empty: clean.length === 0,
		alphabet,
		paddingState,
		hadWhitespace,
		dataUriMime: dataUri ? dataUri.mime : null,
		problems,
		badLength,
		cleanedLength: clean.length,
	};
}

/* ------------------------------------------------------------------ byte encodings */

export type ByteFormat = 'base64' | 'base64url' | 'hex' | 'base32' | 'base58' | 'ascii85' | 'text';

export const BYTE_FORMATS: ByteFormat[] = ['text', 'base64', 'base64url', 'hex', 'base32', 'base58', 'ascii85'];

export class ConvertError extends Error {
	code: 'invalidChar' | 'invalidLength' | 'notText' | 'overflow';
	index?: number;
	char?: string;
	constructor(code: ConvertError['code'], index?: number, char?: string) {
		super(code);
		this.code = code;
		this.index = index;
		this.char = char;
	}
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(input: string): Uint8Array {
	const cleaned = input.replace(/^\s*0x/i, '').replace(/[\s:,-]|\\x|0x/gi, '');
	for (let i = 0; i < cleaned.length; i++) {
		if (!/[0-9a-fA-F]/.test(cleaned[i])) throw new ConvertError('invalidChar', i, cleaned[i]);
	}
	if (cleaned.length % 2 !== 0) throw new ConvertError('invalidLength');
	const out = new Uint8Array(cleaned.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function bytesToBase32(bytes: Uint8Array, padding = true): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
		value &= (1 << bits) - 1;
	}
	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
	if (padding) while (out.length % 8 !== 0) out += '=';
	return out;
}

export function base32ToBytes(input: string): Uint8Array {
	const cleaned = input.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
	const out: number[] = [];
	let bits = 0;
	let value = 0;
	for (let i = 0; i < cleaned.length; i++) {
		const idx = BASE32.indexOf(cleaned[i]);
		if (idx === -1) throw new ConvertError('invalidChar', i, cleaned[i]);
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
		value &= (1 << bits) - 1;
	}
	return Uint8Array.from(out);
}

export function bytesToBase58(bytes: Uint8Array): string {
	let zeros = 0;
	while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
	const digits: number[] = [];
	for (let i = zeros; i < bytes.length; i++) {
		let carry = bytes[i];
		for (let j = 0; j < digits.length; j++) {
			carry += digits[j] << 8;
			digits[j] = carry % 58;
			carry = (carry / 58) | 0;
		}
		while (carry > 0) {
			digits.push(carry % 58);
			carry = (carry / 58) | 0;
		}
	}
	return '1'.repeat(zeros) + digits.reverse().map((d) => BASE58[d]).join('');
}

export function base58ToBytes(input: string): Uint8Array {
	const cleaned = input.replace(/\s+/g, '');
	let zeros = 0;
	while (zeros < cleaned.length && cleaned[zeros] === '1') zeros++;
	const bytes: number[] = [];
	for (let i = zeros; i < cleaned.length; i++) {
		const idx = BASE58.indexOf(cleaned[i]);
		if (idx === -1) throw new ConvertError('invalidChar', i, cleaned[i]);
		let carry = idx;
		for (let j = 0; j < bytes.length; j++) {
			carry += bytes[j] * 58;
			bytes[j] = carry & 255;
			carry >>= 8;
		}
		while (carry > 0) {
			bytes.push(carry & 255);
			carry >>= 8;
		}
	}
	return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

export function bytesToAscii85(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 4) {
		const chunk = bytes.subarray(i, i + 4);
		const pad = 4 - chunk.length;
		let value = 0;
		for (let j = 0; j < 4; j++) value = value * 256 + (chunk[j] ?? 0);
		if (value === 0 && pad === 0) {
			out += 'z';
			continue;
		}
		const group: string[] = [];
		for (let j = 0; j < 5; j++) {
			group.unshift(String.fromCharCode((value % 85) + 33));
			value = Math.floor(value / 85);
		}
		out += group.join('').slice(0, 5 - pad);
	}
	return out;
}

export function ascii85ToBytes(input: string): Uint8Array {
	let text = input.replace(/\s+/g, '');
	text = text.replace(/^<~/, '').replace(/~>$/, '');
	const out: number[] = [];
	let group: number[] = [];
	const flush = (count: number) => {
		let value = 0;
		for (let j = 0; j < 5; j++) value = value * 85 + (group[j] ?? 84);
		if (value > 0xffffffff) throw new ConvertError('overflow');
		const bytes = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
		out.push(...bytes.slice(0, count));
	};
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === 'z' && group.length === 0) {
			out.push(0, 0, 0, 0);
			continue;
		}
		const code = ch.charCodeAt(0);
		if (code < 33 || code > 117) throw new ConvertError('invalidChar', i, ch);
		group.push(code - 33);
		if (group.length === 5) {
			flush(4);
			group = [];
		}
	}
	if (group.length === 1) throw new ConvertError('invalidLength');
	if (group.length > 1) flush(group.length - 1);
	return Uint8Array.from(out);
}

export function decodeToBytes(format: ByteFormat, input: string): Uint8Array {
	switch (format) {
		case 'text':
			return new TextEncoder().encode(input);
		case 'base64':
		case 'base64url': {
			const a = analyzeBase64(input);
			if (a.problems.length > 0) throw new ConvertError('invalidChar', a.problems[0].index, a.problems[0].char);
			if (a.badLength) throw new ConvertError('invalidLength');
			const body = extractDataUri(input)?.base64 ?? input;
			try {
				return base64ToBytes(fromUrlSafeOrStandard(body.replace(/\s+/g, '')));
			} catch {
				throw new ConvertError('invalidLength');
			}
		}
		case 'hex':
			return hexToBytes(input);
		case 'base32':
			return base32ToBytes(input);
		case 'base58':
			return base58ToBytes(input);
		case 'ascii85':
			return ascii85ToBytes(input);
	}
}

export function encodeFromBytes(format: ByteFormat, bytes: Uint8Array): string {
	switch (format) {
		case 'text':
			try {
				return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			} catch {
				throw new ConvertError('notText');
			}
		case 'base64':
			return bytesToBase64(bytes);
		case 'base64url':
			return toUrlSafe(bytesToBase64(bytes));
		case 'hex':
			return bytesToHex(bytes);
		case 'base32':
			return bytesToBase32(bytes);
		case 'base58':
			return bytesToBase58(bytes);
		case 'ascii85':
			return bytesToAscii85(bytes);
	}
}

export function convertEncoding(from: ByteFormat, to: ByteFormat, input: string): string {
	return encodeFromBytes(to, decodeToBytes(from, input));
}

/* ------------------------------------------------------------------ compression */

export type CompressionKind = 'gzip' | 'zlib' | 'deflate-raw';

const STREAM_FORMAT: Record<CompressionKind, string> = { gzip: 'gzip', zlib: 'deflate', 'deflate-raw': 'deflate-raw' };

async function pipeBytes(bytes: Uint8Array, stream: { writable: WritableStream; readable: ReadableStream }): Promise<Uint8Array> {
	const writer = stream.writable.getWriter();
	void writer.write(bytes as BufferSource).catch(() => undefined);
	void writer.close().catch(() => undefined);
	return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function compressBytes(bytes: Uint8Array, kind: CompressionKind): Promise<Uint8Array> {
	return pipeBytes(bytes, new CompressionStream(STREAM_FORMAT[kind] as CompressionFormat));
}

export function detectCompression(bytes: Uint8Array): CompressionKind | null {
	if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
	if (bytes.length >= 2 && (bytes[0] & 0x0f) === 8 && ((bytes[0] << 8) | bytes[1]) % 31 === 0) return 'zlib';
	return null;
}

export async function decompressBytes(bytes: Uint8Array, kind: CompressionKind | 'auto'): Promise<{ bytes: Uint8Array; kind: CompressionKind }> {
	const resolved: CompressionKind = kind === 'auto' ? (detectCompression(bytes) ?? 'deflate-raw') : kind;
	const out = await pipeBytes(bytes, new DecompressionStream(STREAM_FORMAT[resolved] as CompressionFormat));
	return { bytes: out, kind: resolved };
}

/* ------------------------------------------------------------------ misc */

// Maps every non-empty line through `fn`; lines that throw are reported via `onError`.
export function mapLinesSafe(text: string, fn: (line: string) => string, onError: (line: string) => string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => {
			if (line.trim() === '') return line;
			try {
				return fn(line);
			} catch {
				return onError(line);
			}
		})
		.join('\n');
}

// Returns the pretty-printed JSON when the text is a JSON object/array, otherwise null.
export function prettyPrintIfJson(text: string): string | null {
	const t = text.trim();
	if (!(t.startsWith('{') || t.startsWith('['))) return null;
	try {
		return JSON.stringify(JSON.parse(t), null, 2);
	} catch {
		return null;
	}
}
