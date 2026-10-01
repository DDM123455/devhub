import { describe, expect, it } from 'vitest';
import {
	applyTimePreset,
	checkClaims,
	ecdsaDerToRaw,
	ecdsaRawToDer,
	generateJwtKeyPair,
	JWT_ALGS,
	JwtKeyError,
	selectJwk,
	signJwtInput,
	verifyJwtSignature,
	type JwtAlg,
} from '../jwt-crypto';
import { bytesToBase64Url, stringToBase64Url } from '../jwt';

const input = `${stringToBase64Url('{"alg":"X","typ":"JWT"}')}.${stringToBase64Url('{"sub":"1"}')}`;

describe('sign -> verify round trip', () => {
	for (const alg of JWT_ALGS.filter((a) => !a.startsWith('HS')) as JwtAlg[]) {
		it(`${alg} with PEM and JWK keys`, async () => {
			const keys = await generateJwtKeyPair(alg);
			const sig = await signJwtInput(alg, input, keys.privatePem);
			expect(await verifyJwtSignature(alg, input, sig, keys.publicPem)).toBe(true);
			expect(await verifyJwtSignature(alg, input + 'x', sig, keys.publicPem)).toBe(false);
			// private JWK signs, public JWK verifies, and a JWKS is selected by kid
			const sig2 = await signJwtInput(alg, input, JSON.stringify(keys.privateJwk));
			const jwks = JSON.stringify({ keys: [{ ...keys.publicJwk, kid: 'a', alg }, { ...keys.publicJwk, kid: 'b' }] });
			expect(await verifyJwtSignature(alg, input, sig2, jwks, { kid: 'b' })).toBe(true);
			expect(await verifyJwtSignature(alg, input, sig2, JSON.stringify(keys.publicJwk))).toBe(true);
		}, 30000);
	}
	it('HS256/384/512 with text and base64url secrets', async () => {
		for (const alg of ['HS256', 'HS384', 'HS512'] as JwtAlg[]) {
			const sig = await signJwtInput(alg, input, 'secret');
			expect(await verifyJwtSignature(alg, input, sig, 'secret')).toBe(true);
			expect(await verifyJwtSignature(alg, input, sig, 'other')).toBe(false);
			const b64 = bytesToBase64Url(new TextEncoder().encode('secret'));
			expect(await verifyJwtSignature(alg, input, sig, b64, { secretIsBase64Url: true })).toBe(true);
		}
	});
	it('HS256 known vector (jwt.io sample)', async () => {
		const signing = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
		expect(await signJwtInput('HS256', signing, 'your-256-bit-secret')).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
	});
});

describe('ECDSA signature formats', () => {
	it('ES256 sign output is raw r||s of 64 bytes and DER round-trips', async () => {
		const keys = await generateJwtKeyPair('ES256');
		const sig = await signJwtInput('ES256', input, keys.privatePem);
		const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (sig.length % 4)) % 4)), (c) => c.charCodeAt(0));
		expect(raw.length).toBe(64);
		const der = ecdsaRawToDer(raw);
		expect(der[0]).toBe(0x30);
		expect(Array.from(ecdsaDerToRaw(der, 32))).toEqual(Array.from(raw));
		// verification accepts a DER-encoded signature too
		expect(await verifyJwtSignature('ES256', input, bytesToBase64Url(der), keys.publicPem)).toBe(true);
	});
	it('converts DER with leading zero padding and short integers', () => {
		const raw = new Uint8Array(64);
		raw[0] = 0x80; // high bit set => DER adds a 0x00 pad
		raw[63] = 1; // s is tiny
		const der = ecdsaRawToDer(raw);
		expect(der.length).toBeLessThan(72);
		expect(Array.from(ecdsaDerToRaw(der, 32))).toEqual(Array.from(raw));
	});
});

describe('key errors', () => {
	it('rejects wrong curve, certificates, missing kid and public-as-private', async () => {
		const p256 = await generateJwtKeyPair('ES256');
		await expect(verifyJwtSignature('ES384', input, 'AAAA', JSON.stringify(p256.publicJwk))).rejects.toMatchObject({ code: 'curve' });
		await expect(verifyJwtSignature('ES256', input, 'AAAA', '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')).rejects.toMatchObject({ code: 'x509' });
		await expect(signJwtInput('ES256', input, p256.publicPem)).rejects.toMatchObject({ code: 'notPrivate' });
		expect(() => selectJwk({ keys: [{ kid: 'a' }, { kid: 'b' }] }, undefined)).toThrow(JwtKeyError);
		expect(() => selectJwk({ keys: [{ kid: 'a' }] }, 'zzz')).toThrow(JwtKeyError);
		expect(selectJwk({ keys: [{ kid: 'a' }] }, undefined)).toEqual({ kid: 'a' });
	});
});

describe('claims', () => {
	const now = Date.UTC(2025, 0, 1, 12, 0, 0);
	const sec = now / 1000;
	it('checks exp / nbf with clock skew', () => {
		expect(checkClaims({ exp: sec - 10 }, { nowMs: now })).toEqual(['expired']);
		expect(checkClaims({ exp: sec - 10 }, { nowMs: now, clockSkewSec: 30 })).toEqual([]);
		expect(checkClaims({ nbf: sec + 10 }, { nowMs: now })).toEqual(['notYetValid']);
		expect(checkClaims({ nbf: sec + 10 }, { nowMs: now, clockSkewSec: 60 })).toEqual([]);
	});
	it('checks iss / aud (string or array)', () => {
		expect(checkClaims({ iss: 'a', aud: ['x', 'y'] }, { nowMs: now, expectedIss: 'a', expectedAud: 'y' })).toEqual([]);
		expect(checkClaims({ iss: 'a', aud: 'x' }, { nowMs: now, expectedIss: 'b', expectedAud: 'y' })).toEqual(['issMismatch', 'audMismatch']);
		expect(checkClaims({}, { nowMs: now, expectedAud: 'y' })).toEqual(['audMismatch']);
	});
	it('applyTimePreset sets iat/exp and preserves claims', () => {
		const out = JSON.parse(applyTimePreset('{"sub":"u"}', '1h', now));
		expect(out).toEqual({ sub: 'u', iat: sec, exp: sec + 3600 });
		expect(JSON.parse(applyTimePreset('{"exp":5}', 'none', now))).toEqual({ iat: sec });
		expect(JSON.parse(applyTimePreset('not json', '15m', now)).exp).toBe(sec + 900);
	});
});
