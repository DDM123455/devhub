import { describe, expect, it } from 'vitest';
import { validateLine } from '../iso-validate';
import { MCC_LIST, mccGroup } from '../iso-data/mcc';

const check = (value: string, standard: Parameters<typeof validateLine>[1]) => validateLine(value, standard).matches[0];

describe('ISO 11649 creditor reference (RF)', () => {
	it('accepts references with a correct mod-97 check', () => {
		expect(check('RF18 5390 0754 7034', 'rf').ok).toBe(true);
		expect(check('RF45 G72UUR', 'rf').ok).toBe(true);
	});
	it('normalizes to groups of four', () => {
		expect(check('rf18539007547034', 'rf').normalized).toBe('RF18 5390 0754 7034');
	});
	it('rejects a wrong check digit, a wrong prefix and a too-long reference', () => {
		expect(check('RF19 5390 0754 7034', 'rf').reason).toBe('badCheckDigit');
		expect(check('XX18 5390 0754 7034', 'rf').reason).toBe('badStructure');
		expect(check('RF18' + '1'.repeat(22), 'rf').reason).toBe('badLength');
	});
	it('is found by auto-detect without being mistaken for an IBAN', () => {
		const r = validateLine('RF18 5390 0754 7034');
		expect(r.status).toBe('valid');
		expect(r.matches[0].standard).toBe('rf');
	});
});

describe('ISO 10962 CFI', () => {
	it('decodes category and group', () => {
		const r = check('ESVUFR', 'cfi');
		expect(r.ok).toBe(true);
		expect(r.details.find((x) => x.key === 'cfiCategory')!.value).toContain('Equities');
		expect(r.details.find((x) => x.key === 'cfiGroup')!.value).toContain('Common');
		expect(check('DBFTFR', 'cfi').details.find((x) => x.key === 'cfiGroup')!.value).toContain('Bonds');
	});
	it('rejects an unknown category and a wrong length', () => {
		expect(check('XXXXXX', 'cfi').reason).toBe('badCfiCategory');
		expect(check('ESVU', 'cfi').reason).toBe('badLength');
		expect(check('ES1UFR', 'cfi').reason).toBe('badCharacters');
	});
	it('is never guessed by auto-detect (any six-letter word would match)', () => {
		expect(validateLine('Dollar').status).toBe('unrecognized');
		expect(validateLine('ESVUFR').matches.some((m) => m.standard === 'cfi')).toBe(false);
	});
});

describe('ISO 18245 MCC', () => {
	it('describes a listed code and its range', () => {
		const r = check('5411', 'mcc');
		expect(r.ok).toBe(true);
		expect(r.details.find((x) => x.key === 'description')!.value).toMatch(/grocery/i);
		expect(r.details.find((x) => x.key === 'mccRange')!.value).toBe('Retail outlets');
	});
	it('accepts an unlisted code inside a valid range and says so', () => {
		const r = check('5555', 'mcc');
		expect(r.ok).toBe(true);
		expect(r.details.some((x) => x.key === 'note' && x.value === 'mccUnlisted')).toBe(true);
	});
	it('rejects 0000, wrong length and letters', () => {
		expect(check('0000', 'mcc').reason).toBe('unknownCode');
		expect(check('541', 'mcc').reason).toBe('badLength');
		expect(check('54A1', 'mcc').reason).toBe('badCharacters');
	});
	it('the bundled table is consistent: unique four-digit codes inside a known range', () => {
		const seen = new Set<string>();
		for (const [code, text] of MCC_LIST) {
			expect(code, code).toMatch(/^\d{4}$/);
			expect(seen.has(code), `duplicate ${code}`).toBe(false);
			seen.add(code);
			expect(mccGroup(Number(code)), code).not.toBeNull();
			expect(text.length, code).toBeGreaterThan(3);
		}
		expect(MCC_LIST.length).toBeGreaterThan(250);
	});
});

describe('ISO/IEC 7813 track data', () => {
	const t2 = '4111111111111111=25122011234567890';
	it('parses track 2 with and without sentinels', () => {
		for (const v of [t2, `;${t2}?`]) {
			const r = check(v, 'track');
			expect(r.ok, v).toBe(true);
			expect(r.details.find((x) => x.key === 'pan')!.value).toBe('4111111111111111');
			expect(r.details.find((x) => x.key === 'expiry')!.value).toBe('2025-12');
			expect(r.details.find((x) => x.key === 'serviceCode')!.value).toContain('201');
		}
	});
	it('parses track 1', () => {
		const r = check('%B4111111111111111^DOE/JOHN^25122011234567890?', 'track');
		expect(r.ok).toBe(true);
		expect(r.details.find((x) => x.key === 'name')!.value).toBe('DOE/JOHN');
	});
	it('rejects a bad check digit and an impossible month', () => {
		expect(check('4111111111111112=25122011234567890', 'track').reason).toBe('badCheckDigit');
		expect(check('4111111111111111=25132011234567890', 'track').reason).toBe('badExpiry');
		expect(check('4111111111111111', 'track').reason).toBe('badStructure');
	});
	it('is detected as track data, not as a plain card number', () => {
		expect(validateLine(t2).matches[0].standard).toBe('track');
	});
});
