import { describe, expect, it } from 'vitest';
import { describeMti, looksLikeIso8583, parseIso8583 } from '../iso8583';
import { validateLine } from '../iso-validate';

// --- independent message builders (do not reuse the parser's tables beyond field lengths written out here) ---

function bitmapHex(des: number[]): string {
	const secondary = des.some((d) => d > 64);
	const bits = new Array(secondary ? 128 : 64).fill(0);
	if (secondary) bits[0] = 1;
	for (const d of des) bits[d - 1] = 1;
	let hex = '';
	for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4).join(''), 2).toString(16).toUpperCase();
	return hex;
}

/** ASCII message: [de, already-encoded text] pairs in any order. */
function ascii(mti: string, fields: Array<[number, string]>): string {
	const sorted = [...fields].sort((a, b) => a[0] - b[0]);
	return mti + bitmapHex(sorted.map((f) => f[0])) + sorted.map((f) => f[1]).join('');
}

const bcd = (digits: string) => (digits.length % 2 ? '0' + digits : digits);
const hexOfAscii = (s: string) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Binary message as hex text. */
function binary(mti: string, fields: Array<[number, string]>): string {
	const sorted = [...fields].sort((a, b) => a[0] - b[0]);
	return mti + bitmapHex(sorted.map((f) => f[0])) + sorted.map((f) => f[1]).join('');
}

const ASCII_FIELDS: Array<[number, string]> = [
	[2, '16' + '4111111111111111'],
	[3, '000000'],
	[4, '000000010000'],
	[7, '0102030405'],
	[11, '123456'],
	[12, '121530'],
	[13, '0102'],
	[39, '00'],
	[41, 'TERM0001'],
	[49, '704'],
];

describe('describeMti', () => {
	it('decodes version, class, function and origin', () => {
		expect(describeMti('0200')).toContain('1987');
		expect(describeMti('0200')).toContain('Financial request');
		expect(describeMti('0210')).toContain('request response');
		expect(describeMti('1420')).toContain('1993');
		expect(describeMti('0800')).toContain('Network management');
	});
	it('rejects impossible indicators', () => {
		expect(describeMti('0000')).toBeNull();
		expect(describeMti('0206')).toBeNull(); // origin 6 does not exist
	});
});

describe('parseIso8583 — ASCII', () => {
	it('parses a typical 0200 and returns every field', () => {
		const p = parseIso8583(ascii('0200', ASCII_FIELDS));
		expect(p.ok).toBe(true);
		expect(p.encoding).toBe('ascii');
		expect(p.mti).toBe('0200');
		expect(p.fields.map((f) => f.de)).toEqual([2, 3, 4, 7, 11, 12, 13, 39, 41, 49]);
		expect(p.fields.find((f) => f.de === 2)!.value).toBe('4111111111111111');
		expect(p.fields.find((f) => f.de === 41)!.value).toBe('TERM0001');
		expect(p.fields.find((f) => f.de === 49)!.meaning).toBe('VND');
		expect(p.fields.find((f) => f.de === 39)!.meaning).toContain('Approved');
	});
	it('handles a secondary bitmap', () => {
		const p = parseIso8583(ascii('0800', [[11, '000001'], [70, '301']]));
		expect(p.ok).toBe(true);
		expect(p.bitmap).toHaveLength(32);
		expect(p.fields.map((f) => f.de)).toEqual([11, 70]);
	});
	it('strips a 4-digit ASCII length header', () => {
		const body = ascii('0200', ASCII_FIELDS);
		const p = parseIso8583(String(body.length).padStart(4, '0') + body);
		expect(p.ok).toBe(true);
		expect(p.header).toBe(4);
	});
	it('reports a truncated field with its number', () => {
		const body = ascii('0200', ASCII_FIELDS);
		const p = parseIso8583(body.slice(0, body.length - 5));
		expect(p.ok).toBe(false);
		expect(p.problem?.reason).toBe('truncated');
	});
	it('reports trailing data', () => {
		const p = parseIso8583(ascii('0200', ASCII_FIELDS) + 'XYZ');
		expect(p.problem?.reason).toBe('trailingData');
	});
	it('reports a bad length indicator and an over-long field', () => {
		expect(parseIso8583(ascii('0200', [[2, 'AB4111111111111111']])).problem?.reason).toBe('badLengthIndicator');
		expect(parseIso8583(ascii('0200', [[2, '25' + '4'.repeat(25)]])).problem?.reason).toBe('fieldTooLong');
	});
	it('reports non-digits in a numeric field', () => {
		expect(parseIso8583(ascii('0200', [[3, '00A000']])).problem?.reason).toBe('badFieldDigits');
	});
	it('reports a bad MTI', () => {
		expect(parseIso8583(ascii('0900', [[3, '000000']]).replace('0900', '9999')).problem?.reason).toBe('badMti');
	});
	it('checks dates, times, currency and country codes', () => {
		expect(parseIso8583(ascii('0200', [[7, '1332000000']])).problem?.reason).toBe('badFieldDate');
		expect(parseIso8583(ascii('0200', [[12, '256000']])).problem?.reason).toBe('badFieldTime');
		expect(parseIso8583(ascii('0200', [[13, '0230']])).problem?.reason).toBe('badFieldDate');
		expect(parseIso8583(ascii('0200', [[49, '123']])).problem?.reason).toBe('badFieldCurrency');
		expect(parseIso8583(ascii('0200', [[19, '000']])).problem?.reason).toBe('badFieldCountry');
		expect(parseIso8583(ascii('0200', [[7, '0229235959']])).ok).toBe(true);
	});
	it('rejects the unsupported tertiary-bitmap field', () => {
		const withDe65 = '0200' + 'C0000000000000008000000000000000';
		expect(parseIso8583(withDe65).problem?.reason).toBe('unsupportedField');
	});
});

describe('parseIso8583 — binary (hex dump)', () => {
	const fields: Array<[number, string]> = [
		[2, '16' + '4111111111111111'], // LL=16 BCD (1 byte "16"), 16 digits packed
		[3, '000000'],
		[4, '000000010000'],
		[11, '123456'],
		[39, hexOfAscii('00')],
		[41, hexOfAscii('TERM0001')],
		[49, hexOfAscii('704')],
	];
	it('parses BCD numerics, ASCII text and BCD length indicators', () => {
		const p = parseIso8583(binary('0200', fields));
		expect(p.ok).toBe(true);
		expect(p.encoding).toBe('binary');
		expect(p.fields.find((f) => f.de === 2)!.value).toBe('4111111111111111');
		expect(p.fields.find((f) => f.de === 4)!.value).toBe('000000010000');
		expect(p.fields.find((f) => f.de === 41)!.value).toBe('TERM0001');
		expect(p.fields.find((f) => f.de === 49)!.meaning).toBe('VND');
	});
	it('accepts spaces in the hex dump and a 2-byte length header', () => {
		const body = binary('0200', fields);
		const header = (body.length / 2).toString(16).padStart(4, '0').toUpperCase();
		const p = parseIso8583((header + body).replace(/(..)/g, '$1 '));
		expect(p.ok).toBe(true);
		expect(p.header).toBe(2);
	});
	it('packs odd-length numerics with a leading zero nibble', () => {
		const p = parseIso8583(binary('0200', [[27, '01'], [22, '0051']]));
		expect(p.ok).toBe(true);
		expect(p.fields.find((f) => f.de === 22)!.value).toBe('051');
	});
	it('fails cleanly when a binary message is cut short', () => {
		const body = binary('0200', fields);
		const p = parseIso8583(body.slice(0, body.length - 6));
		expect(p.ok).toBe(false);
		expect(p.problem?.reason).toBe('truncated');
	});
});

describe('per-field explanation and length checks', () => {
	it('gives every field its format, length rule and meaning', () => {
		const p = parseIso8583(ascii('0200', ASCII_FIELDS));
		const pan = p.fields.find((f) => f.de === 2)!;
		expect(pan.spec).toBe('n..19 (LLVAR)');
		expect(pan.length).toBe('16 digits (max 19)');
		expect(pan.lengthOk).toBe(true);
		expect(pan.description).toMatch(/card number/i);
		const stan = p.fields.find((f) => f.de === 11)!;
		expect(stan.spec).toBe('n 6');
		expect(stan.length).toBe('6 digits (fixed 6)');
		expect(p.fields.find((f) => f.de === 41)!.spec).toBe('ans 8');
	});
	it('rejects a card number shorter than 12 digits even though LLVAR allows it', () => {
		const p = parseIso8583(ascii('0200', [[2, '08' + '41111111']]));
		expect(p.ok).toBe(false);
		expect(p.problem?.reason).toBe('badFieldLength');
	});
	it('explains DE 39 with the response-code table and its category', () => {
		const p = parseIso8583(ascii('0210', [[39, '51']]));
		expect(p.fields[0].meaning).toContain('Not sufficient funds');
		expect(p.fields[0].meaning).toContain('declined');
		expect(parseIso8583(ascii('0210', [[39, 'ZZ']])).fields[0].meaning).toContain('network-specific');
	});
	it('decodes track 2 (DE 35)', () => {
		const t2 = '4111111111111111=25122011234567890';
		const p = parseIso8583(ascii('0200', [[35, String(t2.length).padStart(2, '0') + t2]]));
		expect(p.ok).toBe(true);
		const lines = p.fields[0].sub;
		expect(lines[0]).toBe('PAN: 4111111111111111');
		expect(lines[1]).toContain('2025-12');
		expect(lines[2]).toContain('Service code 201');
	});
	it('unpacks EMV TLV data in DE 55', () => {
		// 9F26 (8 bytes cryptogram) + 9F27 80 (ARQC) + 5F2A 0704 (VND) + 9C 00 (purchase)
		const tlv = '9F2608A1B2C3D4E5F60718' + '9F270180' + '5F2A020704' + '9C0100';
		const p = parseIso8583(ascii('0200', [[55, String(tlv.length).padStart(3, '0') + tlv]]));
		expect(p.ok).toBe(true);
		const text = p.fields[0].sub.join('\n');
		expect(text).toContain('9F26 · Application cryptogram: A1B2C3D4E5F60718');
		expect(text).toContain('ARQC');
		expect(text).toContain('Transaction currency code');
		expect(text).toContain('purchase');
	});
});

describe('validateLine integration', () => {
	it('auto-detects an ASCII message as ISO 8583 and marks it valid', () => {
		const r = validateLine(ascii('0200', ASCII_FIELDS));
		expect(r.status).toBe('valid');
		expect(r.matches[0].standard).toBe('iso8583');
		expect(r.matches[0].details.some((x) => x.key === 'mti' && x.value === '0200')).toBe(true);
		expect(r.matches[0].details.filter((x) => x.key === 'field')).toHaveLength(ASCII_FIELDS.length);
	});
	it('marks a broken message invalid with a reason and the failing field', () => {
		const body = ascii('0200', ASCII_FIELDS);
		const r = validateLine(body.slice(0, body.length - 4), 'iso8583');
		expect(r.status).toBe('invalid');
		expect(r.matches[0].reason).toBe('truncated');
	});
	it('does not capture ordinary identifiers', () => {
		for (const v of ['GB82 WEST 1234 5698 7654 32', 'US0378331005', '4111111111111111', '1M8GDM9AXKP042788', '2024-02-29T10:00:00+07:00']) {
			expect(looksLikeIso8583(v), v).toBe(false);
		}
	});
});
