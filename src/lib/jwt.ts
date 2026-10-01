import { formatJsonLossless } from './text-format';
import { analyzeJsonText } from './json-convert';

// Pure JWT helpers (no DOM / crypto) for the JWT Decoder tool.

export type DecodeErrorKind = 'format' | 'base64' | 'json';

export class JwtDecodeError extends Error {
	kind: DecodeErrorKind;
	constructor(kind: DecodeErrorKind) {
		super(kind);
		this.kind = kind;
	}
}

// Tokens are usually copied from an `Authorization: Bearer ...` header, a JSON string, or a
// terminal where long lines got wrapped — strip all of that so it decodes anyway.
export function normalizeToken(input: string): string {
	return input
		.trim()
		.replace(/^authorization\s*:\s*/i, '')
		.replace(/^bearer\s+/i, '')
		.replace(/^["'`]+|["'`,;]+$/g, '')
		.replace(/\s+/g, '');
}

export interface DecodedToken {
	header: unknown;
	payload: unknown;
	headerB64: string;
	payloadB64: string;
	signatureB64: string;
	headerPretty: string;
	payloadPretty: string;
	headerCompact: string;
	payloadCompact: string;
	hasUnsafeNumbers: boolean;
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function base64UrlToBytes(base64url: string): Uint8Array {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecodeToString(base64url: string): string {
	return new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(base64url));
}

export function stringToBase64Url(value: string): string {
	return bytesToBase64Url(new TextEncoder().encode(value));
}

// The signature part may legitimately be EMPTY (`alg: none`, "header.payload."), so only the
// header and payload are required to be non-empty.
export function decodeToken(rawToken: string): DecodedToken {
	const token = normalizeToken(rawToken);
	const parts = token.split('.');
	if (parts.length !== 3 || parts[0] === '' || parts[1] === '') throw new JwtDecodeError('format');
	const [headerB64, payloadB64, signatureB64] = parts;
	if (!BASE64URL.test(headerB64) || !BASE64URL.test(payloadB64) || !BASE64URL.test(signatureB64)) {
		throw new JwtDecodeError('base64');
	}
	let headerJson: string;
	let payloadJson: string;
	try {
		headerJson = base64UrlDecodeToString(headerB64);
		payloadJson = base64UrlDecodeToString(payloadB64);
	} catch {
		throw new JwtDecodeError('base64');
	}
	let header: unknown;
	let payload: unknown;
	try {
		header = JSON.parse(headerJson);
		payload = JSON.parse(payloadJson);
	} catch {
		throw new JwtDecodeError('json');
	}
	// Display the payload exactly as signed (big integers such as 64-bit ids are NOT rounded).
	const headerFmt = formatJsonLossless(headerJson);
	const payloadFmt = formatJsonLossless(payloadJson);
	return {
		header,
		payload,
		headerB64,
		payloadB64,
		signatureB64,
		headerPretty: headerFmt?.value ?? JSON.stringify(header, null, 2),
		payloadPretty: payloadFmt?.value ?? JSON.stringify(payload, null, 2),
		headerCompact: formatJsonLossless(headerJson, true)?.value ?? JSON.stringify(header),
		payloadCompact: formatJsonLossless(payloadJson, true)?.value ?? JSON.stringify(payload),
		hasUnsafeNumbers: analyzeJsonText(payloadJson).unsafeNumbers,
	};
}

// "2024-05-01 10:00:00 (UTC: 2024-05-01T03:00:00.000Z)" — local time alone is ambiguous
// when a token is shared across time zones.
export function formatTimestamp(value: unknown): string | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	const date = new Date(value * 1000);
	if (Number.isNaN(date.getTime())) return null;
	return `${date.toLocaleString()} (UTC: ${date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')})`;
}

export type TimeStatus = 'expired' | 'notYetValid' | 'valid' | 'unknown';

export function timeStatus(payload: unknown, nowMs: number): TimeStatus {
	if (payload === null || typeof payload !== 'object') return 'unknown';
	const { exp, nbf } = payload as Record<string, unknown>;
	if (typeof exp === 'number' && exp * 1000 < nowMs) return 'expired';
	if (typeof nbf === 'number' && nbf * 1000 > nowMs) return 'notYetValid';
	if (typeof exp === 'number' || typeof nbf === 'number') return 'valid';
	return 'unknown';
}
