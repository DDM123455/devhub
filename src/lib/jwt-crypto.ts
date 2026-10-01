// WebCrypto helpers for JWT sign / verify (HS*, RS*, PS*, ES*). Pure functions on top of
// `crypto.subtle`, which exists in browsers and in Node (so everything is unit-testable).
// Out of scope on purpose: X.509 certificates, JWE, EdDSA, fetching a JWKS from a URL.

import { base64UrlToBytes, bytesToBase64Url } from './jwt';

export type JwtAlg =
	| 'HS256' | 'HS384' | 'HS512'
	| 'RS256' | 'RS384' | 'RS512'
	| 'PS256' | 'PS384' | 'PS512'
	| 'ES256' | 'ES384' | 'ES512';

export const JWT_ALGS: JwtAlg[] = [
	'HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512',
];

export type AlgFamily = 'hmac' | 'rsa' | 'rsa-pss' | 'ecdsa';

export function isJwtAlg(alg: unknown): alg is JwtAlg {
	return typeof alg === 'string' && (JWT_ALGS as string[]).includes(alg);
}

export function algFamily(alg: JwtAlg): AlgFamily {
	if (alg.startsWith('HS')) return 'hmac';
	if (alg.startsWith('RS')) return 'rsa';
	if (alg.startsWith('PS')) return 'rsa-pss';
	return 'ecdsa';
}

const HASH: Record<string, string> = { '256': 'SHA-256', '384': 'SHA-384', '512': 'SHA-512' };
const CURVE: Record<string, { name: string; size: number }> = {
	ES256: { name: 'P-256', size: 32 },
	ES384: { name: 'P-384', size: 48 },
	ES512: { name: 'P-521', size: 66 },
};

function hashOf(alg: JwtAlg): string {
	return HASH[alg.slice(2)];
}

export class JwtKeyError extends Error {
	code: 'pem' | 'jwk' | 'kid' | 'curve' | 'x509' | 'pkcs1' | 'missingKey' | 'notPrivate';
	constructor(code: JwtKeyError['code']) {
		super(code);
		this.code = code;
	}
}

/* ---------------------------------------------------------------- ECDSA signature formats */

// DER (ASN.1 SEQUENCE of two INTEGERs, as produced by OpenSSL) -> fixed-width raw r||s (JWS).
export function ecdsaDerToRaw(der: Uint8Array, size: number): Uint8Array {
	let offset = 0;
	if (der[offset++] !== 0x30) throw new Error('bad DER');
	let seqLen = der[offset++];
	if (seqLen & 0x80) {
		const n = seqLen & 0x7f;
		seqLen = 0;
		for (let i = 0; i < n; i++) seqLen = (seqLen << 8) | der[offset++];
	}
	const readInt = (): Uint8Array => {
		if (der[offset++] !== 0x02) throw new Error('bad DER');
		const len = der[offset++];
		let bytes = der.slice(offset, offset + len);
		offset += len;
		while (bytes.length > 0 && bytes[0] === 0) bytes = bytes.slice(1);
		if (bytes.length > size) throw new Error('bad DER');
		const out = new Uint8Array(size);
		out.set(bytes, size - bytes.length);
		return out;
	};
	const r = readInt();
	const s = readInt();
	const raw = new Uint8Array(size * 2);
	raw.set(r, 0);
	raw.set(s, size);
	return raw;
}

// Raw r||s -> DER (e.g. to compare with OpenSSL output).
export function ecdsaRawToDer(raw: Uint8Array): Uint8Array {
	const size = raw.length / 2;
	const encodeInt = (bytes: Uint8Array): Uint8Array => {
		let start = 0;
		while (start < bytes.length - 1 && bytes[start] === 0) start++;
		let body = bytes.slice(start);
		if (body[0] & 0x80) {
			const padded = new Uint8Array(body.length + 1);
			padded.set(body, 1);
			body = padded;
		}
		return Uint8Array.from([0x02, body.length, ...body]);
	};
	const r = encodeInt(raw.slice(0, size));
	const s = encodeInt(raw.slice(size));
	const inner = Uint8Array.from([...r, ...s]);
	const header = inner.length < 128 ? [0x30, inner.length] : [0x30, 0x81, inner.length];
	return Uint8Array.from([...header, ...inner]);
}

/* ---------------------------------------------------------------- key parsing */

function pemBody(pem: string): { label: string; bytes: Uint8Array } | null {
	const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem.trim());
	if (!m) return null;
	try {
		const binary = atob(m[2].replace(/\s+/g, ''));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return { label: m[1], bytes };
	} catch {
		throw new JwtKeyError('pem');
	}
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// Picks a JWK out of: a single JWK object, a JWKS ({keys:[...]}), or (for convenience) an array.
export function selectJwk(parsed: unknown, kid: string | undefined): JsonWebKey & { kid?: string } {
	let candidates: Array<JsonWebKey & { kid?: string }>;
	if (Array.isArray(parsed)) candidates = parsed;
	else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { keys?: unknown }).keys)) {
		candidates = (parsed as { keys: Array<JsonWebKey & { kid?: string }> }).keys;
	} else if (parsed && typeof parsed === 'object') return parsed as JsonWebKey;
	else throw new JwtKeyError('jwk');
	if (candidates.length === 0) throw new JwtKeyError('jwk');
	if (kid !== undefined) {
		const found = candidates.find((k) => k && k.kid === kid);
		if (found) return found;
		throw new JwtKeyError('kid');
	}
	if (candidates.length === 1) return candidates[0];
	throw new JwtKeyError('kid');
}

function importParams(alg: JwtAlg): RsaHashedImportParams | EcKeyImportParams {
	switch (algFamily(alg)) {
		case 'rsa':
			return { name: 'RSASSA-PKCS1-v1_5', hash: hashOf(alg) };
		case 'rsa-pss':
			return { name: 'RSA-PSS', hash: hashOf(alg) };
		case 'ecdsa':
			return { name: 'ECDSA', namedCurve: CURVE[alg].name };
		default:
			throw new JwtKeyError('missingKey');
	}
}

async function importKeyMaterial(alg: JwtAlg, text: string, kid: string | undefined, usage: 'verify' | 'sign'): Promise<CryptoKey> {
	const trimmed = text.trim();
	if (trimmed === '') throw new JwtKeyError('missingKey');
	const params = importParams(alg);

	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		const parsed = tryParseJson(trimmed);
		if (parsed === undefined) throw new JwtKeyError('jwk');
		const source = selectJwk(parsed, kid);
		const jwk: JsonWebKey = { ...source };
		delete (jwk as { kid?: string }).kid;
		delete jwk.alg;
		delete jwk.use;
		delete jwk.key_ops;
		if (algFamily(alg) === 'ecdsa' && jwk.crv !== CURVE[alg].name) throw new JwtKeyError('curve');
		if (usage === 'sign' && !jwk.d) throw new JwtKeyError('notPrivate');
		if (usage === 'verify' && jwk.d) {
			// A private JWK also carries the public parameters: strip secrets so verify-import works.
			delete jwk.d;
			delete jwk.p;
			delete jwk.q;
			delete jwk.dp;
			delete jwk.dq;
			delete jwk.qi;
		}
		return crypto.subtle.importKey('jwk', jwk, params, false, [usage]);
	}

	const pem = pemBody(trimmed);
	if (!pem) throw new JwtKeyError('pem');
	if (pem.label === 'CERTIFICATE') throw new JwtKeyError('x509');
	if (pem.label === 'RSA PRIVATE KEY' || pem.label === 'EC PRIVATE KEY' || pem.label === 'RSA PUBLIC KEY') throw new JwtKeyError('pkcs1');
	if (usage === 'verify') {
		if (pem.label !== 'PUBLIC KEY') throw new JwtKeyError('pem');
		return crypto.subtle.importKey('spki', pem.bytes as BufferSource, params, false, ['verify']);
	}
	if (pem.label !== 'PRIVATE KEY') throw new JwtKeyError(pem.label === 'PUBLIC KEY' ? 'notPrivate' : 'pem');
	return crypto.subtle.importKey('pkcs8', pem.bytes as BufferSource, params, false, ['sign']);
}

/* ---------------------------------------------------------------- sign / verify */

export interface HmacSecretOptions {
	/** Treat the secret text as base64url-encoded bytes instead of UTF-8. */
	secretIsBase64Url?: boolean;
}

function hmacKeyBytes(secret: string, options: HmacSecretOptions): Uint8Array {
	return options.secretIsBase64Url ? base64UrlToBytes(secret.trim()) : new TextEncoder().encode(secret);
}

function signParams(alg: JwtAlg): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
	switch (algFamily(alg)) {
		case 'hmac':
			return { name: 'HMAC' };
		case 'rsa':
			return { name: 'RSASSA-PKCS1-v1_5' };
		case 'rsa-pss':
			// JWS (RFC 7518 3.5): salt length equals the hash output size in bytes.
			return { name: 'RSA-PSS', saltLength: Number(alg.slice(2)) / 8 };
		case 'ecdsa':
			return { name: 'ECDSA', hash: hashOf(alg) };
	}
}

export async function signJwtInput(
	alg: JwtAlg,
	signingInput: string,
	keyText: string,
	options: HmacSecretOptions & { kid?: string } = {},
): Promise<string> {
	const data = new TextEncoder().encode(signingInput);
	let key: CryptoKey;
	if (algFamily(alg) === 'hmac') {
		if (keyText === '') throw new JwtKeyError('missingKey');
		key = await crypto.subtle.importKey('raw', hmacKeyBytes(keyText, options) as BufferSource, { name: 'HMAC', hash: hashOf(alg) }, false, ['sign']);
	} else {
		key = await importKeyMaterial(alg, keyText, options.kid, 'sign');
	}
	const signature = await crypto.subtle.sign(signParams(alg), key, data);
	return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyJwtSignature(
	alg: JwtAlg,
	signingInput: string,
	signatureB64: string,
	keyText: string,
	options: HmacSecretOptions & { kid?: string } = {},
): Promise<boolean> {
	const data = new TextEncoder().encode(signingInput);
	let signature = base64UrlToBytes(signatureB64);
	let key: CryptoKey;
	if (algFamily(alg) === 'hmac') {
		if (keyText === '') throw new JwtKeyError('missingKey');
		key = await crypto.subtle.importKey('raw', hmacKeyBytes(keyText, options) as BufferSource, { name: 'HMAC', hash: hashOf(alg) }, false, ['verify']);
	} else {
		key = await importKeyMaterial(alg, keyText, options.kid, 'verify');
	}
	if (algFamily(alg) === 'ecdsa') {
		const size = CURVE[alg].size;
		// Some tools emit ASN.1 DER instead of the raw r||s that JWS requires; accept both.
		if (signature.length !== size * 2 && signature[0] === 0x30) {
			try {
				signature = ecdsaDerToRaw(signature, size);
			} catch {
				return false;
			}
		}
		if (signature.length !== size * 2) return false;
	}
	return crypto.subtle.verify(signParams(alg), key, signature as BufferSource, data);
}

/* ---------------------------------------------------------------- key generation (test keys) */

function toPem(label: string, bytes: ArrayBuffer): string {
	const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
	return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----`;
}

export interface GeneratedKeyPair {
	privatePem: string;
	publicPem: string;
	privateJwk: JsonWebKey;
	publicJwk: JsonWebKey;
}

// Generates a throw-away key pair for experimenting (HS* has no key pair).
export async function generateJwtKeyPair(alg: JwtAlg): Promise<GeneratedKeyPair> {
	const family = algFamily(alg);
	if (family === 'hmac') throw new JwtKeyError('missingKey');
	const params =
		family === 'ecdsa'
			? ({ name: 'ECDSA', namedCurve: CURVE[alg].name } as EcKeyGenParams)
			: ({
					name: family === 'rsa' ? 'RSASSA-PKCS1-v1_5' : 'RSA-PSS',
					modulusLength: 2048,
					publicExponent: new Uint8Array([1, 0, 1]),
					hash: hashOf(alg),
				} as RsaHashedKeyGenParams);
	const pair = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
	const [pkcs8, spki, privateJwk, publicJwk] = await Promise.all([
		crypto.subtle.exportKey('pkcs8', pair.privateKey),
		crypto.subtle.exportKey('spki', pair.publicKey),
		crypto.subtle.exportKey('jwk', pair.privateKey),
		crypto.subtle.exportKey('jwk', pair.publicKey),
	]);
	delete privateJwk.key_ops;
	delete publicJwk.key_ops;
	return { privatePem: toPem('PRIVATE KEY', pkcs8), publicPem: toPem('PUBLIC KEY', spki), privateJwk, publicJwk };
}

/* ---------------------------------------------------------------- claims */

export const CLAIM_KEYS = [
	'iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti', 'azp', 'scope', 'scp', 'roles', 'amr', 'nonce', 'at_hash', 'acr', 'typ', 'kid',
] as const;

export type ClaimIssue = 'expired' | 'notYetValid' | 'issMismatch' | 'audMismatch';

export interface ClaimCheckOptions {
	expectedIss?: string;
	expectedAud?: string;
	clockSkewSec?: number;
	nowMs: number;
}

// Time claims honour the clock skew; iss/aud are compared only when an expectation is given.
export function checkClaims(payload: unknown, options: ClaimCheckOptions): ClaimIssue[] {
	const issues: ClaimIssue[] = [];
	if (payload === null || typeof payload !== 'object') return issues;
	const p = payload as Record<string, unknown>;
	const skew = (options.clockSkewSec ?? 0) * 1000;
	if (typeof p.exp === 'number' && p.exp * 1000 + skew < options.nowMs) issues.push('expired');
	if (typeof p.nbf === 'number' && p.nbf * 1000 - skew > options.nowMs) issues.push('notYetValid');
	const expectedIss = options.expectedIss?.trim();
	if (expectedIss && p.iss !== expectedIss) issues.push('issMismatch');
	const expectedAud = options.expectedAud?.trim();
	if (expectedAud) {
		const aud = p.aud;
		const ok = typeof aud === 'string' ? aud === expectedAud : Array.isArray(aud) && aud.includes(expectedAud);
		if (!ok) issues.push('audMismatch');
	}
	return issues;
}

export function formatClaimValue(value: unknown): string {
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
}

export type ExpPreset = 'none' | '15m' | '1h' | '24h' | '7d' | '30d';

const PRESET_SECONDS: Record<Exclude<ExpPreset, 'none'>, number> = { '15m': 900, '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };

// Returns a payload object with iat (and exp for the chosen preset) merged in, keeping user claims.
export function applyTimePreset(payloadText: string, preset: ExpPreset, nowMs: number): string {
	let obj: Record<string, unknown>;
	try {
		const parsed = JSON.parse(payloadText);
		obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		obj = {};
	}
	const now = Math.floor(nowMs / 1000);
	obj.iat = now;
	if (preset === 'none') delete obj.exp;
	else obj.exp = now + PRESET_SECONDS[preset];
	return JSON.stringify(obj, null, 2);
}
