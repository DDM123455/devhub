// "Paste a value, learn whether it is a valid ISO identifier" — pure, dependency-free validators.
//
// Every validator has a `shape` test (does this even look like one of mine? — used by auto-detect so a
// 2-letter word is not reported as 14 different failures) and a `check` that returns the verdict, the parsed
// parts and, when invalid, a machine-readable reason (the UI maps reasons and detail keys to translated text).
import { COUNTRIES } from './iso-data/countries';
import { CURRENCIES } from './iso-data/currencies';
import { LANGUAGES } from './iso-data/languages';
import { IBAN_COUNTRIES } from './iso-data/iban-registry';
import { looksLikeIso8583, parseIso8583 } from './iso8583';

export type IsoStandardId =
	| 'iso8601'
	| 'country'
	| 'currency'
	| 'language'
	| 'iban'
	| 'bic'
	| 'isin'
	| 'lei'
	| 'card'
	| 'isbn'
	| 'issn'
	| 'vin'
	| 'container'
	| 'doi'
	| 'iso8583';

export type IsoReason =
	| 'badLength'
	| 'badCharacters'
	| 'badCheckDigit'
	| 'unknownCountry'
	| 'badBbanFormat'
	| 'unknownCode'
	| 'badStructure'
	| 'badPrefix'
	| 'badCalendar'
	| 'badTime'
	| 'badOffset'
	| 'badFormat8601'
	| 'mixedFormats'
	| 'spaceSeparator'
	| 'badDuration'
	| 'weeksAlone'
	| 'badInterval'
	| 'endBeforeStart'
	| 'badWeek'
	| 'badOrdinal'
	| 'badMti'
	| 'badBitmap'
	| 'truncated'
	| 'badLengthIndicator'
	| 'fieldTooLong'
	| 'badFieldDigits'
	| 'badFieldChars'
	| 'unsupportedField'
	| 'trailingData'
	| 'badFieldDate'
	| 'badFieldTime'
	| 'badFieldCurrency'
	| 'badFieldCountry'
	| 'badFieldLength';

export interface IsoDetail {
	/** i18n key under `detail.` */
	key: string;
	value: string;
}

export interface IsoResult {
	standard: IsoStandardId;
	ok: boolean;
	reason?: IsoReason;
	reasonParams?: Record<string, string | number>;
	details: IsoDetail[];
	/** canonical / print form, when one exists */
	normalized?: string;
}

export type LineStatus = 'valid' | 'invalid' | 'unrecognized';

export interface LineResult {
	input: string;
	status: LineStatus;
	/** valid: every standard it satisfies; invalid: the closest failing candidates (at most 2) */
	matches: IsoResult[];
}

/** Display order of the standards (also the tie-break when several fail). */
export const ISO_STANDARDS: ReadonlyArray<{ id: IsoStandardId; iso: string }> = [
	{ id: 'iso8601', iso: 'ISO 8601' },
	{ id: 'country', iso: 'ISO 3166-1' },
	{ id: 'currency', iso: 'ISO 4217' },
	{ id: 'language', iso: 'ISO 639' },
	{ id: 'iban', iso: 'ISO 13616' },
	{ id: 'bic', iso: 'ISO 9362' },
	{ id: 'isin', iso: 'ISO 6166' },
	{ id: 'lei', iso: 'ISO 17442' },
	{ id: 'card', iso: 'ISO/IEC 7812' },
	{ id: 'isbn', iso: 'ISO 2108' },
	{ id: 'issn', iso: 'ISO 3297' },
	{ id: 'vin', iso: 'ISO 3779' },
	{ id: 'container', iso: 'ISO 6346' },
	{ id: 'doi', iso: 'ISO 26324' },
	{ id: 'iso8583', iso: 'ISO 8583' },
];

// ---------------------------------------------------------------------------------------------------------
// helpers

const fail = (standard: IsoStandardId, reason: IsoReason, params?: Record<string, string | number>, details: IsoDetail[] = []): IsoResult => ({
	standard,
	ok: false,
	reason,
	reasonParams: params,
	details,
});
const pass = (standard: IsoStandardId, details: IsoDetail[], normalized?: string): IsoResult => ({ standard, ok: true, details, normalized });
const d = (key: string, value: string | number): IsoDetail => ({ key, value: String(value) });

const COUNTRY_BY_A2 = new Map(COUNTRIES.map((c) => [c[0], c]));
const COUNTRY_BY_A3 = new Map(COUNTRIES.map((c) => [c[1], c]));
const COUNTRY_BY_NUM = new Map(COUNTRIES.map((c) => [c[2], c]));
const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c[0], c]));
const CURRENCY_BY_NUM = new Map<string, (typeof CURRENCIES)[number][]>();
for (const c of CURRENCIES) CURRENCY_BY_NUM.set(c[1], [...(CURRENCY_BY_NUM.get(c[1]) ?? []), c]);
const LANG_BY_A2 = new Map(LANGUAGES.filter((l) => l[0]).map((l) => [l[0], l]));
const LANG_BY_A3 = new Map<string, (typeof LANGUAGES)[number]>();
for (const l of LANGUAGES) {
	if (l[1]) LANG_BY_A3.set(l[1], l);
	if (l[2]) LANG_BY_A3.set(l[2], l);
}
const IBAN_BY_CC = new Map(IBAN_COUNTRIES.map((c) => [c.cc, c]));

const strip = (s: string) => s.replace(/[\s-]/g, '');
const letterValue = (ch: string) => ch.charCodeAt(0) - 55; // A=10 … Z=35

/** mod-97 over a string of digits and letters (letters → 10..35), without BigInt. */
function mod97(s: string): number {
	let rem = 0;
	for (const ch of s) {
		const v = ch >= 'A' ? String(letterValue(ch)) : ch;
		for (const digit of v) rem = (rem * 10 + Number(digit)) % 97;
	}
	return rem;
}

function luhnOk(digits: string): boolean {
	let sum = 0;
	let alt = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let n = digits.charCodeAt(i) - 48;
		if (alt) {
			n *= 2;
			if (n > 9) n -= 9;
		}
		sum += n;
		alt = !alt;
	}
	return sum % 10 === 0;
}

// ---------------------------------------------------------------------------------------------------------
// ISO 8601

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const weeksInYear = (y: number) => {
	const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
	return jan1 === 4 || (isLeap(y) && jan1 === 3) ? 53 : 52;
};
const p2 = (n: number) => String(n).padStart(2, '0');
const p4 = (n: number) => String(n).padStart(4, '0');

type DateParse =
	| { ok: true; kind: 'year' | 'month' | 'date' | 'ordinal' | 'week'; complete: boolean; extended: boolean; text: string; y: number; m?: number; d?: number }
	| { ok: false; reason: IsoReason; params?: Record<string, string | number> };

function parseIsoDate(s: string): DateParse {
	let m: RegExpMatchArray | null;
	if ((m = s.match(/^(\d{4})$/))) return { ok: true, kind: 'year', complete: false, extended: true, text: m[1], y: Number(m[1]) };
	if ((m = s.match(/^(\d{4})-(\d{2})$/))) {
		const mo = Number(m[2]);
		if (mo < 1 || mo > 12) return { ok: false, reason: 'badCalendar', params: { part: 'month' } };
		return { ok: true, kind: 'month', complete: false, extended: true, text: `${m[1]}-${m[2]}`, y: Number(m[1]), m: mo };
	}
	if ((m = s.match(/^(\d{4})(-?)(\d{2})\2(\d{2})$/))) {
		const [y, mo, day] = [Number(m[1]), Number(m[3]), Number(m[4])];
		if (mo < 1 || mo > 12) return { ok: false, reason: 'badCalendar', params: { part: 'month' } };
		if (day < 1 || day > daysIn(y, mo)) return { ok: false, reason: 'badCalendar', params: { part: 'day', max: mo >= 1 ? daysIn(y, mo) : 31 } };
		return { ok: true, kind: 'date', complete: true, extended: m[2] === '-', text: `${p4(y)}-${p2(mo)}-${p2(day)}`, y, m: mo, d: day };
	}
	if ((m = s.match(/^(\d{4})(-?)W(\d{2})(?:\2([1-7]))?$/))) {
		const [y, w] = [Number(m[1]), Number(m[3])];
		if (w < 1 || w > weeksInYear(y)) return { ok: false, reason: 'badWeek', params: { max: weeksInYear(y), year: y } };
		const wd = m[4] ? Number(m[4]) : 1;
		const jan4 = new Date(Date.UTC(y, 0, 4));
		const mondayWeek1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000);
		const dt = new Date(mondayWeek1.getTime() + ((w - 1) * 7 + (wd - 1)) * 86400000);
		return {
			ok: true,
			kind: 'week',
			complete: !!m[4],
			extended: m[2] === '-',
			text: m[4] ? `${p4(dt.getUTCFullYear())}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}` : `${p4(y)}-W${p2(w)}`,
			y,
		};
	}
	if ((m = s.match(/^(\d{4})(-?)(\d{3})$/))) {
		const [y, o] = [Number(m[1]), Number(m[3])];
		const max = isLeap(y) ? 366 : 365;
		if (o < 1 || o > max) return { ok: false, reason: 'badOrdinal', params: { max, year: y } };
		const dt = new Date(Date.UTC(y, 0, o));
		return { ok: true, kind: 'ordinal', complete: true, extended: m[2] === '-', text: `${p4(y)}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`, y };
	}
	return { ok: false, reason: 'badFormat8601' };
}

type TimeParse =
	| { ok: true; extended: boolean; hour: number; minute: number; second: number; text: string; offset: string | null; offsetMinutes: number | null; leap: boolean }
	| { ok: false; reason: IsoReason; params?: Record<string, string | number> };

function parseIsoTime(s: string): TimeParse {
	const m = s.match(/^(\d{2})(?:(:?)(\d{2})(?:\2(\d{2})(?:[.,](\d+))?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/);
	if (!m) return { ok: false, reason: 'badTime' };
	const hour = Number(m[1]);
	const minute = m[3] === undefined ? 0 : Number(m[3]);
	const second = m[4] === undefined ? 0 : Number(m[4]);
	const frac = m[5] ?? '';
	if (hour > 24 || minute > 59 || second > 60) return { ok: false, reason: 'badTime' };
	if (hour === 24 && (minute !== 0 || second !== 0 || /[1-9]/.test(frac))) return { ok: false, reason: 'badTime' };
	if (second === 60 && !(hour === 23 && minute === 59)) return { ok: false, reason: 'badTime' };
	let offsetMinutes: number | null = null;
	let offset: string | null = null;
	if (m[6]) {
		if (m[6] === 'Z') {
			offsetMinutes = 0;
			offset = 'Z';
		} else {
			const o = m[6].match(/^([+-])(\d{2})(?::?(\d{2}))?$/)!;
			const oh = Number(o[2]);
			const om = o[3] ? Number(o[3]) : 0;
			if (oh > 23 || om > 59) return { ok: false, reason: 'badOffset' };
			offsetMinutes = (o[1] === '-' ? -1 : 1) * (oh * 60 + om);
			offset = `${o[1]}${p2(oh)}:${p2(om)}`;
		}
	}
	const extended = m[2] === ':';
	const text = `${p2(hour)}:${p2(minute)}:${p2(second)}${frac ? '.' + frac : ''}${offset ?? ''}`;
	return { ok: true, extended, hour, minute, second, text, offset, offsetMinutes, leap: second === 60 };
}

interface Moment {
	text: string;
	hasTime: boolean;
	epoch: number | null;
	extended: boolean;
	leap: boolean;
	kind: string;
}
type MomentParse = { ok: true; value: Moment } | { ok: false; reason: IsoReason; params?: Record<string, string | number> };

function parseIsoMoment(s: string): MomentParse {
	const t = s.indexOf('T');
	if (t < 0) {
		if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) return { ok: false, reason: 'spaceSeparator' };
		const dp = parseIsoDate(s);
		if (!dp.ok) return dp;
		return { ok: true, value: { text: dp.text, hasTime: false, epoch: dp.complete ? Date.UTC(Number(dp.text.slice(0, 4)), Number(dp.text.slice(5, 7)) - 1, Number(dp.text.slice(8, 10))) : null, extended: dp.extended, leap: false, kind: dp.kind } };
	}
	const dp = parseIsoDate(s.slice(0, t));
	if (!dp.ok) return dp;
	if (!dp.complete) return { ok: false, reason: 'badFormat8601' };
	const tp = parseIsoTime(s.slice(t + 1));
	if (!tp.ok) return tp;
	if (dp.extended !== tp.extended && !(tp.minute === 0 && tp.second === 0 && !s.slice(t + 1).includes(':') && s.slice(t + 1).length <= 3)) {
		return { ok: false, reason: 'mixedFormats' };
	}
	const y = Number(dp.text.slice(0, 4));
	const mo = Number(dp.text.slice(5, 7));
	const day = Number(dp.text.slice(8, 10));
	const local = Date.UTC(y, mo - 1, day, tp.hour, tp.minute, Math.min(tp.second, 59));
	const epoch = tp.offsetMinutes === null ? null : local - tp.offsetMinutes * 60000;
	return { ok: true, value: { text: `${dp.text}T${tp.text}`, hasTime: true, epoch, extended: dp.extended, leap: tp.leap, kind: tp.offset ? 'datetimeZone' : 'datetime' } };
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const DURATION_RE = new RegExp(`^P(?:(${NUM})Y)?(?:(${NUM})M)?(?:(${NUM})W)?(?:(${NUM})D)?(?:T(?:(${NUM})H)?(?:(${NUM})M)?(?:(${NUM})S)?)?$`);

function parseIsoDuration(s: string): { ok: true; text: string } | { ok: false; reason: IsoReason } {
	const m = s.match(DURATION_RE);
	if (!m) return { ok: false, reason: 'badDuration' };
	const [, y, mo, w, dd, h, mi, se] = m;
	const parts = [y, mo, w, dd, h, mi, se];
	if (parts.every((p) => p === undefined)) return { ok: false, reason: 'badDuration' };
	if (s.endsWith('T')) return { ok: false, reason: 'badDuration' };
	if (w !== undefined && [y, mo, dd, h, mi, se].some((p) => p !== undefined)) return { ok: false, reason: 'weeksAlone' };
	// only the last component may have a fraction
	const present = parts.filter((p) => p !== undefined) as string[];
	if (present.slice(0, -1).some((p) => /[.,]/.test(p))) return { ok: false, reason: 'badDuration' };
	return { ok: true, text: s.replace(',', '.') };
}

function checkIso8601(raw: string): IsoResult {
	const s = raw.trim().toUpperCase();
	const std: IsoStandardId = 'iso8601';
	// repeating interval
	const rep = s.match(/^R(\d*)\/(.+)$/);
	const body = rep ? rep[2] : s;
	const prefix = rep ? [d('repeat', rep[1] === '' ? '∞' : rep[1])] : [];
	if (body.includes('/')) {
		const parts = body.split('/');
		if (parts.length !== 2 || parts.some((p) => p === '')) return fail(std, 'badInterval');
		const [a, b] = parts;
		const aDur = a.startsWith('P');
		const bDur = b.startsWith('P');
		if (aDur && bDur) return fail(std, 'badInterval');
		if (aDur || bDur) {
			const dur = parseIsoDuration(aDur ? a : b);
			if (!dur.ok) return fail(std, dur.reason);
			const mp = parseIsoMoment(aDur ? b : a);
			if (!mp.ok) return fail(std, mp.reason, mp.params);
			return pass(std, [d('type', 'interval'), ...prefix, d('start', aDur ? dur.text : mp.value.text), d('end', aDur ? mp.value.text : dur.text)], `${rep ? `R${rep[1]}/` : ''}${aDur ? dur.text : mp.value.text}/${aDur ? mp.value.text : dur.text}`);
		}
		const ma = parseIsoMoment(a);
		if (!ma.ok) return fail(std, ma.reason, ma.params);
		const mb = parseIsoMoment(b);
		if (!mb.ok) return fail(std, mb.reason, mb.params);
		if (ma.value.epoch !== null && mb.value.epoch !== null && mb.value.epoch < ma.value.epoch) return fail(std, 'endBeforeStart');
		return pass(std, [d('type', 'interval'), ...prefix, d('start', ma.value.text), d('end', mb.value.text)], `${rep ? `R${rep[1]}/` : ''}${ma.value.text}/${mb.value.text}`);
	}
	if (rep) return fail(std, 'badInterval');
	if (s.startsWith('P')) {
		const dur = parseIsoDuration(s);
		if (!dur.ok) return fail(std, dur.reason);
		return pass(std, [d('type', 'duration')], dur.text);
	}
	if (/^T?\d{2}(?::?\d{2}(?::?\d{2}(?:[.,]\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/.test(s) && (s.startsWith('T') || s.includes(':'))) {
		const tp = parseIsoTime(s.startsWith('T') ? s.slice(1) : s);
		if (!tp.ok) return fail(std, tp.reason, tp.params);
		return pass(std, [d('type', 'time'), ...(tp.offset ? [d('offset', tp.offset)] : []), ...(tp.leap ? [d('note', 'leapSecond')] : [])], tp.text);
	}
	const mp = parseIsoMoment(s);
	if (!mp.ok) return fail(std, mp.reason, mp.params);
	const v = mp.value;
	const details: IsoDetail[] = [d('type', v.kind)];
	if (v.hasTime && v.epoch !== null) details.push(d('utc', new Date(v.epoch).toISOString().replace('.000Z', 'Z')));
	if (v.hasTime && v.epoch === null) details.push(d('note', 'noOffset'));
	if (v.leap) details.push(d('note', 'leapSecond'));
	if (!v.hasTime && v.epoch !== null) details.push(d('weekdayIndex', new Date(v.epoch).getUTCDay()));
	return pass(std, details, v.text);
}

const shape8601 = (s: string) => {
	const u = s.trim().toUpperCase();
	if (!/^[\dRPTWYMDHSZ.,:+/\- ]+$/.test(u) || !/\d/.test(u)) return false;
	if (/^\d{4}$|^\d{7,8}$/.test(u)) return true;
	if (/^\d+$/.test(u)) return false;
	// "2024-01-01 10:00" style stays a candidate so the space-separator hint can show
	return /[-:/TWPZ+]/.test(u) && u.length >= 4;
};

// ---------------------------------------------------------------------------------------------------------
// codes from reference lists

function checkCountry(raw: string): IsoResult {
	const s = raw.trim();
	const up = s.toUpperCase();
	let rec;
	if (/^[A-Za-z]{2}$/.test(s)) rec = COUNTRY_BY_A2.get(up);
	else if (/^[A-Za-z]{3}$/.test(s)) rec = COUNTRY_BY_A3.get(up);
	else if (/^\d{3}$/.test(s)) rec = COUNTRY_BY_NUM.get(s);
	else return fail('country', 'badStructure');
	if (!rec) return fail('country', 'unknownCode');
	const kind = s.length === 2 ? 'alpha2' : /^\d/.test(s) ? 'numeric' : 'alpha3';
	return pass('country', [d('type', kind), d('name', rec[3]), d('alpha2', rec[0]), d('alpha3', rec[1]), d('numericCode', rec[2])], kind === 'alpha2' || kind === 'alpha3' ? up : s);
}

function checkCurrency(raw: string): IsoResult {
	const s = raw.trim();
	if (/^[A-Za-z]{3}$/.test(s)) {
		const rec = CURRENCY_BY_CODE.get(s.toUpperCase());
		if (!rec) return fail('currency', 'unknownCode');
		return pass('currency', [d('name', rec[2]), d('numericCode', rec[1]), d('minorUnits', rec[3] === null ? '—' : rec[3]), ...(rec[4] ? [d('note', 'withdrawn')] : [])], rec[0]);
	}
	if (/^\d{3}$/.test(s)) {
		const recs = CURRENCY_BY_NUM.get(s);
		if (!recs) return fail('currency', 'unknownCode');
		const rec = recs.find((r) => !r[4]) ?? recs[0];
		return pass('currency', [d('code', rec[0]), d('name', rec[2]), d('minorUnits', rec[3] === null ? '—' : rec[3]), ...(rec[4] ? [d('note', 'withdrawn')] : [])], s);
	}
	return fail('currency', 'badStructure');
}

function checkLanguage(raw: string): IsoResult {
	const s = raw.trim();
	if (/^[A-Za-z]{2}$/.test(s)) {
		const rec = LANG_BY_A2.get(s.toLowerCase());
		if (!rec) return fail('language', 'unknownCode');
		return pass('language', [d('name', rec[3]), d('iso6391', rec[0]), d('iso6392', rec[1] + (rec[2] ? ` / ${rec[2]}` : ''))], rec[0]);
	}
	if (/^[A-Za-z]{3}$/.test(s)) {
		const rec = LANG_BY_A3.get(s.toLowerCase());
		if (!rec) return fail('language', 'unknownCode');
		return pass('language', [d('name', rec[3]), ...(rec[0] ? [d('iso6391', rec[0])] : []), d('iso6392', rec[1] + (rec[2] ? ` / ${rec[2]}` : ''))], s.toLowerCase());
	}
	// BCP 47 language tag built from ISO 639 + ISO 15924 script + ISO 3166 region
	const tag = s.split(/[-_]/);
	if (tag.length >= 2 && tag.length <= 3 && /^[A-Za-z]{2,3}$/.test(tag[0])) {
		const lang = tag[0].length === 2 ? LANG_BY_A2.get(tag[0].toLowerCase()) : LANG_BY_A3.get(tag[0].toLowerCase());
		if (!lang) return fail('language', 'unknownCode');
		let script: string | undefined;
		let region: string | undefined;
		for (const part of tag.slice(1)) {
			if (/^[A-Za-z]{4}$/.test(part) && !script && !region) script = part[0].toUpperCase() + part.slice(1).toLowerCase();
			else if (/^[A-Za-z]{2}$/.test(part) && !region) {
				if (!COUNTRY_BY_A2.has(part.toUpperCase())) return fail('language', 'unknownCountry', { code: part.toUpperCase() });
				region = part.toUpperCase();
			} else if (/^\d{3}$/.test(part) && !region) region = part;
			else return fail('language', 'badStructure');
		}
		const norm = [lang[0] || lang[1], script, region].filter(Boolean).join('-');
		return pass('language', [d('type', 'tag'), d('name', lang[3]), ...(script ? [d('script', script)] : []), ...(region ? [d('region', COUNTRY_BY_A2.get(region)?.[3] ?? region)] : [])], norm);
	}
	return fail('language', 'badStructure');
}

// ---------------------------------------------------------------------------------------------------------
// banking / finance

function checkIban(raw: string): IsoResult {
	const s = raw.replace(/\s/g, '').toUpperCase();
	if (!/^[A-Z0-9]+$/.test(s)) return fail('iban', 'badCharacters');
	if (!/^[A-Z]{2}\d{2}/.test(s)) return fail('iban', 'badStructure');
	const cc = s.slice(0, 2);
	const country = IBAN_BY_CC.get(cc);
	if (!country) return fail('iban', 'unknownCountry', { code: cc });
	const details = [d('country', country.name), d('checkDigits', s.slice(2, 4)), d('bban', s.slice(4))];
	if (s.length !== country.length) return fail('iban', 'badLength', { expected: country.length, got: s.length }, details);
	if (!new RegExp(country.bban).test(s.slice(4))) return fail('iban', 'badBbanFormat', undefined, details);
	if (mod97(s.slice(4) + s.slice(0, 4)) !== 1) return fail('iban', 'badCheckDigit', undefined, details);
	const grouped = s.replace(/(.{4})/g, '$1 ').trim();
	return pass('iban', [...details, d('grouped', grouped), ...(country.sepa ? [d('note', 'sepa')] : []), ...(country.official ? [] : [d('note', 'unofficialIban')])], s);
}

function checkBic(raw: string): IsoResult {
	const s = raw.replace(/\s/g, '').toUpperCase();
	if (!/^[A-Z0-9]+$/.test(s)) return fail('bic', 'badCharacters');
	if (s.length !== 8 && s.length !== 11) return fail('bic', 'badLength', { expected: '8 / 11', got: s.length });
	if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(s)) return fail('bic', 'badStructure');
	const cc = s.slice(4, 6);
	if (!COUNTRY_BY_A2.has(cc) && cc !== 'XK') return fail('bic', 'unknownCountry', { code: cc });
	const location = s.slice(6, 8);
	const branch = s.length === 11 ? s.slice(8) : 'XXX';
	return pass(
		'bic',
		[d('institution', s.slice(0, 4)), d('country', COUNTRY_BY_A2.get(cc)?.[3] ?? 'Kosovo'), d('location', location), d('branch', branch === 'XXX' ? 'XXX (primary office)' : branch), ...(location[1] === '0' ? [d('note', 'testBic')] : [])],
		s,
	);
}

function checkIsin(raw: string): IsoResult {
	const s = raw.replace(/\s/g, '').toUpperCase();
	if (!/^[A-Z0-9]+$/.test(s)) return fail('isin', 'badCharacters');
	if (s.length !== 12) return fail('isin', 'badLength', { expected: 12, got: s.length });
	if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)) return fail('isin', 'badStructure');
	const digits = [...s.slice(0, 11)].map((c) => (c >= 'A' ? String(letterValue(c)) : c)).join('');
	const expected = (10 - ([...digits].reverse().reduce((sum, ch, i) => { let n = Number(ch); if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } return sum + n; }, 0) % 10)) % 10;
	const details = [d('issuerPrefix', s.slice(0, 2)), d('nsin', s.slice(2, 11)), d('checkDigit', s[11])];
	if (expected !== Number(s[11])) return fail('isin', 'badCheckDigit', { expected }, details);
	const c = COUNTRY_BY_A2.get(s.slice(0, 2));
	return pass('isin', [...(c ? [d('country', c[3])] : []), ...details], s);
}

function checkLei(raw: string): IsoResult {
	const s = raw.replace(/\s/g, '').toUpperCase();
	if (!/^[A-Z0-9]+$/.test(s)) return fail('lei', 'badCharacters');
	if (s.length !== 20) return fail('lei', 'badLength', { expected: 20, got: s.length });
	if (!/^[A-Z0-9]{18}\d{2}$/.test(s)) return fail('lei', 'badStructure');
	const details = [d('lou', s.slice(0, 4)), d('entity', s.slice(6, 18)), d('checkDigits', s.slice(18))];
	if (mod97(s) !== 1) return fail('lei', 'badCheckDigit', undefined, details);
	return pass('lei', details, s);
}

const CARD_BRANDS: ReadonlyArray<[string, RegExp]> = [
	['Visa', /^4/],
	['Mastercard', /^(5[1-5]|2(2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720))/],
	['American Express', /^3[47]/],
	['Discover', /^(6011|65|64[4-9])/],
	['Diners Club', /^(30[0-5]|36|38|39)/],
	['JCB', /^35(2[89]|[3-8])/],
	['UnionPay', /^62/],
	['Maestro', /^(50|5[6-9]|6[0-9])/],
];
const MII: Record<string, string> = { '0': 'iso', '1': 'airlines', '2': 'airlines', '3': 'travel', '4': 'banking', '5': 'banking', '6': 'merchandising', '7': 'petroleum', '8': 'healthcare', '9': 'national' };

function checkCard(raw: string): IsoResult {
	const s = raw.replace(/[\s-]/g, '');
	if (!/^\d+$/.test(s)) return fail('card', 'badCharacters');
	if (s.length < 12 || s.length > 19) return fail('card', 'badLength', { expected: '12–19', got: s.length });
	const brand = CARD_BRANDS.find(([, re]) => re.test(s))?.[0];
	const details = [...(brand ? [d('brand', brand)] : []), d('mii', MII[s[0]] ?? s[0]), d('iin', s.slice(0, 6)), d('length', s.length)];
	if (!luhnOk(s)) return fail('card', 'badCheckDigit', undefined, details);
	return pass('card', details, s);
}

// ---------------------------------------------------------------------------------------------------------
// publications and identifiers

function checkIsbn(raw: string): IsoResult {
	const s = raw.replace(/[\s-]/g, '').toUpperCase();
	if (!/^[0-9X]+$/.test(s)) return fail('isbn', 'badCharacters');
	if (s.length === 13) {
		if (!/^\d{13}$/.test(s)) return fail('isbn', 'badCharacters');
		if (!/^97[89]/.test(s)) return fail('isbn', 'badPrefix');
		const sum = [...s].reduce((a, ch, i) => a + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
		const details = [d('type', 'isbn13')];
		if (sum % 10 !== 0) return fail('isbn', 'badCheckDigit', undefined, details);
		const body = s.slice(3, 12);
		const c10 = (11 - ([...body].reduce((a, ch, i) => a + Number(ch) * (10 - i), 0) % 11)) % 11;
		return pass('isbn', [...details, ...(s.startsWith('978') ? [d('isbn10', body + (c10 === 10 ? 'X' : String(c10)))] : [])], s);
	}
	if (s.length === 10) {
		if (!/^\d{9}[\dX]$/.test(s)) return fail('isbn', 'badCharacters');
		const sum = [...s].reduce((a, ch, i) => a + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
		const details = [d('type', 'isbn10')];
		if (sum % 11 !== 0) return fail('isbn', 'badCheckDigit', undefined, details);
		const core = '978' + s.slice(0, 9);
		const c13 = (10 - ([...core].reduce((a, ch, i) => a + Number(ch) * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
		return pass('isbn', [...details, d('isbn13', core + c13)], s);
	}
	return fail('isbn', 'badLength', { expected: '10 / 13', got: s.length });
}

function checkIssn(raw: string): IsoResult {
	const s = raw.replace(/[\s-]/g, '').toUpperCase();
	if (!/^\d{7}[\dX]$/.test(s)) return fail('issn', s.length === 8 ? 'badCharacters' : 'badLength', { expected: 8, got: s.length });
	const sum = [...s].reduce((a, ch, i) => a + (ch === 'X' ? 10 : Number(ch)) * (8 - i), 0);
	const norm = `${s.slice(0, 4)}-${s.slice(4)}`;
	if (sum % 11 !== 0) return fail('issn', 'badCheckDigit');
	return pass('issn', [d('checkDigit', s[7])], norm);
}

const VIN_VALUES: Record<string, number> = {};
'ABCDEFGH'.split('').forEach((c, i) => (VIN_VALUES[c] = i + 1));
'JKLMN'.split('').forEach((c, i) => (VIN_VALUES[c] = i + 1));
VIN_VALUES.P = 7;
VIN_VALUES.R = 9;
'STUVWXYZ'.split('').forEach((c, i) => (VIN_VALUES[c] = i + 2));
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function checkVin(raw: string): IsoResult {
	const s = raw.replace(/\s/g, '').toUpperCase();
	if (!/^[A-Z0-9]+$/.test(s)) return fail('vin', 'badCharacters');
	if (s.length !== 17) return fail('vin', 'badLength', { expected: 17, got: s.length });
	if (/[IOQ]/.test(s)) return fail('vin', 'badCharacters');
	const sum = [...s].reduce((a, ch, i) => a + (/\d/.test(ch) ? Number(ch) : VIN_VALUES[ch]) * VIN_WEIGHTS[i], 0);
	const expected = sum % 11 === 10 ? 'X' : String(sum % 11);
	const northAmerica = /^[1-5]/.test(s);
	const details = [d('wmi', s.slice(0, 3)), d('vds', s.slice(3, 9)), d('vis', s.slice(9)), d('region', northAmerica ? 'northAmerica' : 'other')];
	if (northAmerica && s[8] !== expected) return fail('vin', 'badCheckDigit', { expected }, details);
	return pass('vin', [...details, ...(s[8] === expected ? [d('note', 'checkDigitMatches')] : [d('note', 'checkDigitNotRequired')])], s);
}

const CONTAINER_LETTERS: Record<string, number> = {};
{
	let v = 10;
	for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
		if (v % 11 === 0) v++;
		CONTAINER_LETTERS[ch] = v++;
	}
}

function checkContainer(raw: string): IsoResult {
	const s = raw.replace(/[\s-]/g, '').toUpperCase();
	if (!/^[A-Z0-9]+$/.test(s)) return fail('container', 'badCharacters');
	if (s.length !== 11) return fail('container', 'badLength', { expected: 11, got: s.length });
	if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(s)) return fail('container', 'badStructure');
	const sum = [...s.slice(0, 10)].reduce((a, ch, i) => a + (/\d/.test(ch) ? Number(ch) : CONTAINER_LETTERS[ch]) * 2 ** i, 0);
	const expected = (sum % 11) % 10;
	const details = [d('owner', s.slice(0, 3)), d('category', s[3]), d('serial', s.slice(4, 10)), d('checkDigit', s[10])];
	if (expected !== Number(s[10])) return fail('container', 'badCheckDigit', { expected }, details);
	return pass('container', details, `${s.slice(0, 4)} ${s.slice(4, 10)} ${s[10]}`);
}

function checkDoi(raw: string): IsoResult {
	const s = raw.trim().replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i, '');
	const m = s.match(/^10\.(\d{4,9})\/(\S+)$/);
	if (!m) return fail('doi', 'badStructure');
	return pass('doi', [d('registrant', m[1]), d('suffix', m[2]), d('note', 'formatOnly')], s);
}

/** ISO 8583 financial message (ASCII text or hex dump of the bytes): header, MTI, bitmap and every data element. */
function checkIso8583(raw: string): IsoResult {
	const p = parseIso8583(raw);
	const details: IsoDetail[] = [d('encoding', p.encoding === 'ascii' ? 'ASCII' : 'Binary (BCD)')];
	if (p.header > 0) details.push(d('lengthHeader', p.header));
	if (p.mti) details.push(d('mti', p.mti));
	if (p.mtiMeaning) details.push(d('mtiMeaning', p.mtiMeaning));
	if (p.bitmap) details.push(d('bitmap', p.bitmap));
	if (p.bitmap) details.push(d('fieldCount', p.fields.length));
	for (const f of p.fields) {
		details.push(d('field', `DE ${String(f.de).padStart(3, '0')} · ${f.name}: ${f.value.length > 120 ? `${f.value.slice(0, 120)}… (${f.value.length} chars)` : f.value}${f.meaning ? ` (${f.meaning})` : ''}`));
		details.push(d('fieldSpec', `${f.spec} · ${f.length} ${f.lengthOk ? '✓' : '✗'}`));
		details.push(d('fieldInfo', f.description));
		for (const line of f.sub) details.push(d('fieldSub', line));
	}
	if (!p.ok && p.problem) return fail('iso8583', p.problem.reason, p.problem.params as Record<string, string | number>, details);
	return pass('iso8583', details);
}

// ---------------------------------------------------------------------------------------------------------
// registry

interface Validator {
	id: IsoStandardId;
	/** auto-detect: does it look like one of mine? */
	shape: (s: string) => boolean;
	check: (s: string) => IsoResult;
}

const A = (s: string) => s.trim();
const VALIDATORS: Validator[] = [
	{ id: 'iso8601', shape: shape8601, check: checkIso8601 },
	{ id: 'country', shape: (s) => /^(?:[A-Za-z]{2,3}|\d{3})$/.test(A(s)), check: checkCountry },
	{ id: 'currency', shape: (s) => /^(?:[A-Za-z]{3}|\d{3})$/.test(A(s)), check: checkCurrency },
	{ id: 'language', shape: (s) => /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,4}){0,2}$/.test(A(s)), check: checkLanguage },
	{ id: 'iban', shape: (s) => /^[A-Za-z]{2}\d{2}[A-Za-z0-9 ]{9,38}$/.test(A(s)) && s.replace(/\s/g, '').length >= 15, check: checkIban },
	{
		id: 'bic',
		shape: (s) => {
			const u = s.replace(/\s/g, '').toUpperCase();
			return /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(u) && (COUNTRY_BY_A2.has(u.slice(4, 6)) || u.slice(4, 6) === 'XK');
		},
		check: checkBic,
	},
	{ id: 'isin', shape: (s) => /^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(s.replace(/\s/g, '')), check: checkIsin },
	{ id: 'lei', shape: (s) => /^[A-Za-z0-9]{18}\d{2}$/.test(s.replace(/\s/g, '')), check: checkLei },
	{
		id: 'card',
		shape: (s) => {
			const t = A(s);
			const digits = t.replace(/[\s-]/g, '');
			if (!/^\d{12,19}$/.test(digits)) return false;
			return /^\d+$/.test(t) || /^(?:\d{4}[\s-]){2,4}\d{1,4}$/.test(t) || /^\d{4}[\s-]\d{6}[\s-]\d{5}$/.test(t);
		},
		check: checkCard,
	},
	{
		id: 'isbn',
		shape: (s) => {
			const t = A(s).replace(/^isbn(?:-1[03])?:?\s*/i, '');
			const n = t.replace(/[\s-]/g, '');
			return (/^\d{13}$/.test(n) && /^97[89]/.test(n)) || /^\d{9}[\dXx]$/.test(n);
		},
		check: (s) => checkIsbn(s.trim().replace(/^isbn(?:-1[03])?:?\s*/i, '')),
	},
	{ id: 'issn', shape: (s) => /^(?:issn:?\s*)?\d{4}-\d{3}[\dXx]$/i.test(A(s)), check: (s) => checkIssn(s.trim().replace(/^issn:?\s*/i, '')) },
	{ id: 'vin', shape: (s) => /^(?=.*[A-Za-z])[A-Za-z0-9]{17}$/.test(s.replace(/\s/g, '')), check: checkVin },
	{ id: 'container', shape: (s) => /^[A-Za-z]{4}[\s-]?\d{6}[\s-]?\d$/.test(A(s)), check: checkContainer },
	{ id: 'iso8583', shape: looksLikeIso8583, check: checkIso8583 },
	{ id: 'doi', shape: (s) => /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i.test(A(s)), check: checkDoi },
];
const BY_ID = new Map(VALIDATORS.map((v) => [v.id, v]));

/** How close a failing result came: 3 = right structure, wrong check digit; 2 = specific problem found; 0 = just "not this shape". */
function failureRank(r: IsoResult): number {
	if (r.reason === 'badCheckDigit') return 3;
	if (r.reason === 'badFormat8601' || r.reason === 'badStructure' || r.reason === 'badCharacters' || r.reason === 'unknownCode') return 0;
	return 2;
}

/** Validates one value. `forced` limits the check to one standard; otherwise the standards that fit are tried. */
export function validateLine(input: string, forced?: IsoStandardId): LineResult {
	const value = input.trim();
	if (forced) {
		const v = BY_ID.get(forced)!;
		const r = v.check(value);
		return { input, status: r.ok ? 'valid' : 'invalid', matches: [r] };
	}
	const candidates = VALIDATORS.filter((v) => v.shape(value));
	if (candidates.length === 0) return { input, status: 'unrecognized', matches: [] };
	const results = candidates.map((v) => v.check(value));
	const ok = results.filter((r) => r.ok);
	if (ok.length > 0) return { input, status: 'valid', matches: ok };
	// short alphabetic codes that are simply not in any list: one message instead of three identical ones
	if (results.every((r) => r.reason === 'unknownCode' || r.reason === 'badStructure') && results.some((r) => r.reason === 'unknownCode')) {
		return { input, status: 'unrecognized', matches: [] };
	}
	// keep only the candidates that came closest: a value whose structure matched but whose check digit failed is
	// far more informative than "does not look like a date" reported for the same text
	const top = Math.max(...results.map(failureRank));
	return { input, status: 'invalid', matches: results.filter((r) => failureRank(r) === top).slice(0, 2) };
}

export const MAX_LINES = 5000;

export interface TextResult {
	rows: LineResult[];
	counts: { valid: number; invalid: number; unrecognized: number };
	truncated: boolean;
}

/** One value per line; blank lines are skipped. */
export function validateText(text: string, forced?: IsoStandardId): TextResult {
	const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
	const truncated = lines.length > MAX_LINES;
	const rows = lines.slice(0, MAX_LINES).map((l) => validateLine(l, forced));
	const counts = { valid: 0, invalid: 0, unrecognized: 0 };
	for (const r of rows) counts[r.status] += 1;
	return { rows, counts, truncated };
}

/** CSV with one row per input line; values starting with = + - @ are prefixed so spreadsheets do not run them as formulas. */
export function resultsToCsv(rows: LineResult[], standardLabel: (id: IsoStandardId) => string): string {
	const esc = (v: string) => {
		const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
		return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
	};
	const out = ['input,status,standard,normalized'];
	for (const r of rows) {
		const m = r.matches[0];
		out.push([esc(r.input.trim()), r.status, m ? esc(standardLabel(m.standard)) : '', m?.normalized ? esc(m.normalized) : ''].join(','));
	}
	return out.join('\n');
}
