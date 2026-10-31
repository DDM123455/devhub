import { describe, expect, it } from 'vitest';
import { ISO_STANDARDS, MAX_LINES, resultsToCsv, validateLine, validateText, type IsoStandardId } from '../iso-validate';

const one = (value: string, id: IsoStandardId) => validateLine(value, id).matches[0];
const ok = (value: string, id: IsoStandardId) => expect(one(value, id).ok, `${id}: ${value}`).toBe(true);
const bad = (value: string, id: IsoStandardId, reason?: string) => {
	const r = one(value, id);
	expect(r.ok, `${id}: ${value}`).toBe(false);
	if (reason) expect(r.reason, `${id}: ${value}`).toBe(reason);
};
const detail = (value: string, id: IsoStandardId, key: string) => one(value, id).details.find((x) => x.key === key)?.value;

describe('ISO 13616 IBAN', () => {
	it('accepts real example IBANs, with or without spaces and in lower case', () => {
		for (const v of ['GB82WEST12345698765432', 'DE89370400440532013000', 'FR1420041010050500013M02606', 'NL91ABNA0417164300', 'gb82 west 1234 5698 7654 32']) ok(v, 'iban');
	});
	it('prints the grouped form', () => {
		expect(one('gb82west12345698765432', 'iban').normalized).toBe('GB82WEST12345698765432');
		expect(detail('GB82WEST12345698765432', 'iban', 'grouped')).toBe('GB82 WEST 1234 5698 7654 32');
	});
	it('rejects a wrong check digit, wrong length, unknown country and bad characters', () => {
		bad('GB82WEST12345698765433', 'iban', 'badCheckDigit');
		bad('DE8937040044053201300', 'iban', 'badLength');
		bad('XX82WEST12345698765432', 'iban', 'unknownCountry');
		bad('GB82WEST1234569876543!', 'iban', 'badCharacters');
		bad('GB82WEST12345698765', 'iban', 'badLength');
	});
});

describe('ISO 9362 BIC', () => {
	it('accepts 8 and 11 character BICs', () => {
		for (const v of ['DEUTDEFF', 'DEUTDEFF500', 'COBADEFFXXX', 'deutdeff']) ok(v, 'bic');
		expect(detail('DEUTDEFF', 'bic', 'institution')).toBe('DEUT');
	});
	it('rejects bad length / country', () => {
		bad('DEUTDEF', 'bic', 'badLength');
		bad('DEUTXXFF', 'bic', 'unknownCountry');
	});
});

describe('ISO 6166 ISIN and ISO 17442 LEI', () => {
	it('ISIN', () => {
		for (const v of ['US0378331005', 'AU0000XVGZA3', 'GB0002634946']) ok(v, 'isin');
		bad('US0378331006', 'isin', 'badCheckDigit');
		bad('US037833100', 'isin', 'badLength');
	});
	it('LEI', () => {
		for (const v of ['529900T8BM49AURSDO55', '5493001KJTIIGC8Y1R12']) ok(v, 'lei');
		bad('529900T8BM49AURSDO56', 'lei', 'badCheckDigit');
		bad('529900T8BM49AURSDO5', 'lei', 'badLength');
	});
});

describe('ISO/IEC 7812 payment card numbers', () => {
	it('accepts Luhn-valid numbers and names the brand', () => {
		const brands: Array<[string, string]> = [
			['4111111111111111', 'Visa'],
			['5555555555554444', 'Mastercard'],
			['378282246310005', 'American Express'],
			['6011111111111117', 'Discover'],
		];
		for (const [n, b] of brands) {
			ok(n, 'card');
			expect(detail(n, 'card', 'brand')).toBe(b);
		}
		ok('4111 1111 1111 1111', 'card');
		ok('4111-1111-1111-1111', 'card');
	});
	it('rejects a failed Luhn check and bad lengths', () => {
		bad('4111111111111112', 'card', 'badCheckDigit');
		bad('41111111', 'card', 'badLength');
		bad('4111x11111111111', 'card', 'badCharacters');
	});
});

describe('ISO 2108 ISBN and ISO 3297 ISSN', () => {
	it('ISBN-13 and ISBN-10 (with the X check digit) and their conversion', () => {
		ok('978-0-306-40615-7', 'isbn');
		ok('0-306-40615-2', 'isbn');
		ok('0-8044-2957-X', 'isbn');
		ok('ISBN 978-0-306-40615-7', 'isbn');
		expect(detail('0-306-40615-2', 'isbn', 'isbn13')).toBe('9780306406157');
		expect(detail('9780306406157', 'isbn', 'isbn10')).toBe('0306406152');
	});
	it('rejects a wrong check digit, a wrong prefix and a wrong length', () => {
		bad('978-0-306-40615-8', 'isbn', 'badCheckDigit');
		bad('0-306-40615-3', 'isbn', 'badCheckDigit');
		bad('9770306406157', 'isbn', 'badPrefix');
		bad('12345', 'isbn', 'badLength');
	});
	it('ISSN', () => {
		ok('0317-8471', 'issn');
		ok('2434-561X', 'issn');
		expect(one('03178471', 'issn').normalized).toBe('0317-8471');
		bad('0317-8472', 'issn', 'badCheckDigit');
		bad('0317-847', 'issn', 'badLength');
	});
});

describe('ISO 3779 VIN and ISO 6346 container numbers', () => {
	it('VIN', () => {
		ok('1M8GDM9AXKP042788', 'vin');
		ok('11111111111111111', 'vin');
		bad('1M8GDM9A1KP042788', 'vin', 'badCheckDigit'); // North American VIN with a wrong check digit
		bad('1M8GDM9AXKP04278', 'vin', 'badLength');
		bad('1M8GDM9AXKP04278O', 'vin', 'badCharacters'); // O is not allowed
	});
	it('VIN check digit is informational outside North America', () => {
		const r = one('WVWZZZ1JZ3W386752', 'vin');
		expect(r.ok).toBe(true);
	});
	it('container', () => {
		ok('CSQU3054383', 'container');
		ok('csqu 305438 3', 'container');
		bad('CSQU3054384', 'container', 'badCheckDigit');
		bad('CSQX3054383', 'container', 'badStructure'); // category letter must be U, J or Z
	});
});

describe('ISO 26324 DOI', () => {
	it('checks the format and strips common prefixes', () => {
		ok('10.1000/182', 'doi');
		ok('https://doi.org/10.1038/nphys1170', 'doi');
		ok('doi:10.1038/nphys1170', 'doi');
		expect(one('https://doi.org/10.1038/nphys1170', 'doi').normalized).toBe('10.1038/nphys1170');
		bad('10.12/abc', 'doi');
		bad('11.1000/182', 'doi');
	});
});

describe('ISO 8601', () => {
	it('calendar dates, basic and extended', () => {
		for (const v of ['2024-02-29', '20240229', '2024-02', '2024', '2023-12-31']) ok(v, 'iso8601');
		expect(one('20240229', 'iso8601').normalized).toBe('2024-02-29');
	});
	it('rejects impossible dates', () => {
		bad('2023-02-29', 'iso8601', 'badCalendar');
		bad('2024-13-01', 'iso8601', 'badCalendar');
		bad('2024-04-31', 'iso8601', 'badCalendar');
		bad('2024-00-10', 'iso8601', 'badCalendar');
	});
	it('week and ordinal dates, including 53-week years', () => {
		expect(one('2024-W09-4', 'iso8601').normalized).toBe('2024-02-29');
		expect(one('2024W094', 'iso8601').normalized).toBe('2024-02-29');
		expect(one('2024-060', 'iso8601').normalized).toBe('2024-02-29');
		ok('2015-W53', 'iso8601');
		ok('2020-W53-7', 'iso8601');
		bad('2016-W53', 'iso8601', 'badWeek');
		bad('2024-W00', 'iso8601', 'badWeek');
		bad('2023-366', 'iso8601', 'badOrdinal');
		ok('2024-366', 'iso8601');
		bad('2024-367', 'iso8601', 'badOrdinal');
	});
	it('times and offsets', () => {
		for (const v of ['10:30', 'T10:30:00', '10:30:00.123', '10:30:00Z', 'T10:30:00+05:30', '24:00:00', '23:59:60']) ok(v, 'iso8601');
		bad('25:00', 'iso8601', 'badTime');
		bad('10:60', 'iso8601', 'badTime');
		bad('24:01', 'iso8601', 'badTime');
		bad('12:00:60', 'iso8601', 'badTime'); // a leap second only at 23:59:60
	});
	it('date-times, UTC conversion and the format mistakes people make', () => {
		expect(detail('2024-02-29T10:00:00+07:00', 'iso8601', 'utc')).toBe('2024-02-29T03:00:00Z');
		ok('20240229T101500Z', 'iso8601');
		ok('2024-02-29T24:00:00Z', 'iso8601');
		bad('2024-02-29 10:00:00', 'iso8601', 'spaceSeparator');
		bad('2024-02-29T101500Z', 'iso8601', 'mixedFormats');
		bad('2024-02-30T10:00:00Z', 'iso8601', 'badCalendar');
		bad('2024-02-29T', 'iso8601');
	});
	it('durations', () => {
		for (const v of ['P3Y6M4DT12H30M5S', 'P2W', 'PT36H', 'P0.5Y', 'PT0,5S', 'P1D']) ok(v, 'iso8601');
		bad('P', 'iso8601', 'badDuration');
		bad('PT', 'iso8601', 'badDuration');
		bad('P1.5Y2M', 'iso8601', 'badDuration');
		bad('P2W3D', 'iso8601', 'weeksAlone');
		bad('3Y', 'iso8601');
	});
	it('intervals and repeating intervals', () => {
		ok('2024-01-01/2024-12-31', 'iso8601');
		ok('2024-01-01T00:00:00Z/P1M', 'iso8601');
		ok('P1M/2024-02-01', 'iso8601');
		ok('R5/2024-01-01T00:00:00Z/P1W', 'iso8601');
		ok('R/2024-01-01/2024-02-01', 'iso8601');
		bad('2024-12-31T00:00:00Z/2024-01-01T00:00:00Z', 'iso8601', 'endBeforeStart');
		bad('P1D/P2D', 'iso8601', 'badInterval');
		bad('2024-01-01/', 'iso8601', 'badInterval');
	});
});

describe('ISO 3166 / 4217 / 639 reference codes', () => {
	it('country codes: alpha-2, alpha-3 and numeric', () => {
		ok('US', 'country');
		ok('usa', 'country');
		ok('840', 'country');
		expect(detail('VN', 'country', 'name')).toBe('Viet Nam');
		expect(detail('840', 'country', 'alpha2')).toBe('US');
		bad('UK', 'country', 'unknownCode'); // the ISO code for the United Kingdom is GB
		bad('XX', 'country', 'unknownCode');
		expect(validateLine('GB', 'country').matches[0].ok).toBe(true);
	});
	it('currency codes: alphabetic and numeric, minor units and withdrawn codes', () => {
		ok('EUR', 'currency');
		ok('usd', 'currency');
		ok('978', 'currency');
		expect(detail('JPY', 'currency', 'minorUnits')).toBe('0');
		expect(detail('USD', 'currency', 'minorUnits')).toBe('2');
		expect(detail('840', 'currency', 'code')).toBe('USD');
		expect(one('DEM', 'currency').details.some((x) => x.value === 'withdrawn')).toBe(true);
		bad('ZZZ', 'currency', 'unknownCode');
	});
	it('language codes and language tags', () => {
		ok('en', 'language');
		ok('vie', 'language');
		ok('en-US', 'language');
		ok('zh-Hant-TW', 'language');
		expect(one('en_us', 'language').normalized).toBe('en-US');
		expect(detail('vi', 'language', 'name')).toBe('Vietnamese');
		bad('xx', 'language', 'unknownCode');
		bad('en-XX', 'language', 'unknownCountry');
	});
});

describe('auto-detect', () => {
	it('names the standard a value satisfies', () => {
		const ids = (v: string) => validateLine(v).matches.map((m) => m.standard);
		expect(ids('GB82WEST12345698765432')).toEqual(['iban']);
		expect(ids('US0378331005')).toEqual(['isin']);
		expect(ids('978-0-306-40615-7')).toEqual(['isbn']);
		expect(ids('2024-02-29')).toEqual(['iso8601']);
		expect(ids('CSQU3054383')).toEqual(['container']);
		expect(ids('4111 1111 1111 1111')).toEqual(['card']);
		expect(ids('0317-8471')).toEqual(['issn']);
		expect(ids('10.1000/182')).toEqual(['doi']);
		expect(ids('1M8GDM9AXKP042788')).toEqual(['vin']);
	});
	it('reports every standard a short code satisfies', () => {
		expect(validateLine('ID').matches.map((m) => m.standard).sort()).toEqual(['country', 'language']); // Indonesia / Indonesian
		expect(validateLine('840').matches.map((m) => m.standard).sort()).toEqual(['country', 'currency']);
	});
	it('invalid values keep the closest candidates and a reason', () => {
		const r = validateLine('GB82WEST12345698765433');
		expect(r.status).toBe('invalid');
		expect(r.matches[0].standard).toBe('iban');
		expect(r.matches[0].reason).toBe('badCheckDigit');
		expect(validateLine('2023-02-29').status).toBe('invalid');
	});
	it('an invalid value is explained by the closest standard only, not by every shape that fits', () => {
		const r = validateLine('0-306-40615-3');
		expect(r.status).toBe('invalid');
		expect(r.matches.map((m) => m.standard)).toEqual(['isbn']);
		expect(r.matches[0].reason).toBe('badCheckDigit');
		const date = validateLine('2024-02-30');
		expect(date.matches.map((m) => m.standard)).toEqual(['iso8601']);
	});
	it('unrelated text and unknown short codes are "unrecognized", not a wall of errors', () => {
		expect(validateLine('hello world').status).toBe('unrecognized');
		expect(validateLine('!!!').status).toBe('unrecognized');
		expect(validateLine('ZZZ').status).toBe('unrecognized');
		expect(validateLine('').status).toBe('unrecognized');
	});
	it('a word with a valid-looking country in the BIC position is still checked by shape only', () => {
		expect(validateLine('Keyboard').status).toBe('unrecognized');
	});
});

describe('validateText', () => {
	it('one value per line, blank lines skipped, mixed standards', () => {
		const t = validateText('GB82WEST12345698765432\n\n2023-02-29\nnonsense value\r\nEUR\n');
		expect(t.rows).toHaveLength(4);
		expect(t.counts).toEqual({ valid: 2, invalid: 1, unrecognized: 1 });
		expect(t.truncated).toBe(false);
	});
	it('forcing one standard checks everything against it', () => {
		const t = validateText('GB82WEST12345698765432\nDE89370400440532013000\nnot an iban', 'iban');
		expect(t.counts).toEqual({ valid: 2, invalid: 1, unrecognized: 0 });
	});
	it('caps very long pastes', () => {
		const t = validateText(Array.from({ length: MAX_LINES + 50 }, () => '2024-01-01').join('\n'));
		expect(t.rows).toHaveLength(MAX_LINES);
		expect(t.truncated).toBe(true);
	});
	it('5 000 mixed lines validate quickly', () => {
		const sample = ['GB82WEST12345698765432', '2024-02-29T10:00:00Z', '978-0-306-40615-7', 'USD', 'junk', '4111111111111111', 'CSQU3054383'];
		const text = Array.from({ length: MAX_LINES }, (_, i) => sample[i % sample.length]).join('\n');
		const t0 = performance.now();
		const t = validateText(text);
		expect(performance.now() - t0).toBeLessThan(2000);
		expect(t.counts.valid).toBeGreaterThan(MAX_LINES * 0.8);
	});
});

describe('CSV export', () => {
	it('one row per line and formula-looking input is neutralised', () => {
		const rows = validateText('GB82WEST12345698765432\n=HYPERLINK("x")\n+123456789012').rows;
		const csv = resultsToCsv(rows, (id) => ISO_STANDARDS.find((s) => s.id === id)!.iso);
		const lines = csv.split('\n');
		expect(lines[0]).toBe('input,status,standard,normalized');
		expect(lines[1]).toBe('GB82WEST12345698765432,valid,ISO 13616,GB82WEST12345698765432');
		expect(lines[2].startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
		expect(lines[3].startsWith("'+123456789012")).toBe(true);
	});
});
