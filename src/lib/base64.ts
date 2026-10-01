// Pure Base64 helpers for the Base64 Encode/Decode tool.

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function toUrlSafe(base64: string): string {
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Accepts standard and URL-safe alphabets, with or without padding.
export function fromUrlSafeOrStandard(input: string): string {
	const base64 = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
	return base64 + '='.repeat((4 - (base64.length % 4)) % 4);
}

export function wrapLines(base64: string): string {
	return base64.replace(/(.{76})/g, '$1\n');
}

export function encodeText(text: string, urlSafe: boolean, lineWrap: boolean): string {
	const bytes = new TextEncoder().encode(text);
	let base64 = bytesToBase64(bytes);
	if (urlSafe) base64 = toUrlSafe(base64);
	else if (lineWrap) base64 = wrapLines(base64);
	return base64;
}

export interface DataUri {
	mime: string;
	base64: string;
}

// Tolerates parameters before ";base64" (charset, name=...) and whitespace/newlines.
export function extractDataUri(input: string): DataUri | null {
	const match = input.trim().match(/^data:([^;,]*)((?:;[^;,]*)*?);base64,([\s\S]*)$/i);
	if (!match) return null;
	return { mime: match[1] || 'text/plain', base64: match[3].replace(/\s+/g, '') };
}

/** Removes a leading `data:...;base64,` prefix (if any) and all whitespace. */
export function cleanBase64Input(input: string): string {
	const uri = extractDataUri(input);
	return (uri ? uri.base64 : input).trim().replace(/\s+/g, '');
}

const BASE64_CHARS = /^[A-Za-z0-9+/_-]*={0,2}$/;

export type DecodeTextResult =
	| { ok: true; text: string }
	| { ok: false; reason: 'invalidBase64' | 'notText' };

// Distinguishes "this is not valid Base64 at all" from "valid Base64, but the bytes are not
// text in the chosen encoding" (e.g. an image) so the UI can point the user to the File tab.
export function decodeText(input: string, encoding: string): DecodeTextResult {
	const cleaned = cleanBase64Input(input);
	if (!BASE64_CHARS.test(cleaned) || cleaned.replace(/=+$/, '').length % 4 === 1) {
		return { ok: false, reason: 'invalidBase64' };
	}
	let bytes: Uint8Array;
	try {
		bytes = base64ToBytes(fromUrlSafeOrStandard(cleaned));
	} catch {
		return { ok: false, reason: 'invalidBase64' };
	}
	try {
		return { ok: true, text: new TextDecoder(encoding, { fatal: true }).decode(bytes) };
	} catch {
		return { ok: false, reason: 'notText' };
	}
}
