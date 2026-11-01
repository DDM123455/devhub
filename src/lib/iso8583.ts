// ISO 8583 financial transaction message parser/validator (1987 data element table).
//
// Two wire encodings are understood, both written as text the user can paste:
//   ascii   — MTI = 4 digit characters, bitmap = 16 (or 32) hex characters, every field as characters
//             ("0200B23A…" — what documentation and test tools usually show)
//   binary  — a hex dump of raw bytes: MTI and numeric fields BCD-packed, bitmap 8 (or 16) raw bytes,
//             letters as ASCII bytes, binary fields raw, length indicators BCD ("0200B23A…" too, but as bytes)
// Because the same hex text can read either way, `parseIso8583` tries both and keeps the one that parses.

import { COUNTRIES } from './iso-data/countries';
import { CURRENCIES } from './iso-data/currencies';
import { ISO8583_FIELDS, PROCESSING_CODES, RESPONSE_CODES, type Iso8583Field } from './iso-data/iso8583-fields';

export type Iso8583Encoding = 'ascii' | 'binary';

export interface ParsedField {
	de: number;
	name: string;
	/** the field as it appears in the message (text form; binary fields as hex) */
	value: string;
	/** human meaning, when the value has a well-known one (response code, currency, …) */
	meaning?: string;
}

export type Iso8583Problem =
	| { reason: 'badMti'; params: { mti: string } }
	| { reason: 'badBitmap'; params: { part: string } }
	| { reason: 'truncated'; params: { de: number; need: number; have: number } }
	| { reason: 'badLengthIndicator'; params: { de: number; got: string } }
	| { reason: 'fieldTooLong'; params: { de: number; max: number; got: number } }
	| { reason: 'badFieldDigits'; params: { de: number; name: string } }
	| { reason: 'badFieldChars'; params: { de: number; name: string } }
	| { reason: 'unsupportedField'; params: { de: number } }
	| { reason: 'trailingData'; params: { count: number } }
	| { reason: 'badFieldDate'; params: { de: number; name: string; value: string } }
	| { reason: 'badFieldTime'; params: { de: number; name: string; value: string } }
	| { reason: 'badFieldCurrency'; params: { de: number; name: string; value: string } }
	| { reason: 'badFieldCountry'; params: { de: number; name: string; value: string } };

export interface Iso8583Parse {
	encoding: Iso8583Encoding;
	ok: boolean;
	problem?: Iso8583Problem;
	/** length header that was stripped (bytes for binary, characters for ascii), 0 if none */
	header: number;
	mti: string;
	mtiMeaning: string;
	bitmap: string;
	fields: ParsedField[];
}

// ---------------------------------------------------------------------------------------------------------
// MTI

const VERSION: Record<string, string> = { '0': 'ISO 8583:1987', '1': 'ISO 8583:1993', '2': 'ISO 8583:2003', '8': 'national use', '9': 'private use' };
const CLASS: Record<string, string> = {
	'1': 'Authorization',
	'2': 'Financial',
	'3': 'File action',
	'4': 'Reversal / chargeback',
	'5': 'Reconciliation',
	'6': 'Administrative',
	'7': 'Fee collection',
	'8': 'Network management',
	'9': 'Reserved',
};
const FUNCTION: Record<string, string> = {
	'0': 'request',
	'1': 'request response',
	'2': 'advice',
	'3': 'advice response',
	'4': 'notification',
	'5': 'notification acknowledgement',
	'6': 'instruction',
	'7': 'instruction acknowledgement',
};
const ORIGIN: Record<string, string> = {
	'0': 'acquirer',
	'1': 'acquirer (repeat)',
	'2': 'issuer',
	'3': 'issuer (repeat)',
	'4': 'other',
	'5': 'other (repeat)',
};

/** null when the MTI is not a valid message type indicator. */
export function describeMti(mti: string): string | null {
	if (!/^\d{4}$/.test(mti)) return null;
	const [v, c, f, o] = mti;
	if (!VERSION[v] || !CLASS[c] || !FUNCTION[f] || !ORIGIN[o]) return null;
	return `${VERSION[v]} · ${CLASS[c]} ${FUNCTION[f]} · from ${ORIGIN[o]}`;
}

// ---------------------------------------------------------------------------------------------------------
// readers

class Truncated extends Error {
	constructor(
		public need: number,
		public have: number,
	) {
		super('truncated');
	}
}

interface Reader {
	/** units left (characters or bytes) */
	left(): number;
	pos(): number;
	/** units consumed so far, as text: characters for ascii, hex chars for binary */
	take(n: number): string;
}

function asciiReader(text: string, start: number): Reader {
	let i = start;
	return {
		left: () => text.length - i,
		pos: () => i,
		take(n) {
			if (text.length - i < n) throw new Truncated(n, text.length - i);
			const out = text.slice(i, i + n);
			i += n;
			return out;
		},
	};
}

function binaryReader(bytes: Uint8Array, start: number): Reader {
	let i = start;
	return {
		left: () => bytes.length - i,
		pos: () => i,
		take(n) {
			if (bytes.length - i < n) throw new Truncated(n, bytes.length - i);
			let hex = '';
			for (let k = 0; k < n; k++) hex += bytes[i + k].toString(16).padStart(2, '0').toUpperCase();
			i += n;
			return hex;
		},
	};
}

const hexToAscii = (hex: string) => String.fromCharCode(...(hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const PRINTABLE = /^[\x20-\x7e]*$/;

// ---------------------------------------------------------------------------------------------------------
// field decoding

type Fail = Iso8583Problem;
class Stop extends Error {
	constructor(public problem: Fail) {
		super(problem.reason);
	}
}

function readLength(r: Reader, enc: Iso8583Encoding, def: Iso8583Field): number {
	if (enc === 'ascii') {
		const raw = r.take(def.lv);
		if (!/^\d+$/.test(raw)) throw new Stop({ reason: 'badLengthIndicator', params: { de: def.de, got: raw } });
		return Number(raw);
	}
	const raw = r.take(def.lv === 2 ? 1 : 2); // BCD: LL = 1 byte, LLL = 2 bytes (leading nibble 0)
	if (!/^\d+$/.test(raw)) throw new Stop({ reason: 'badLengthIndicator', params: { de: def.de, got: raw } });
	return Number(raw);
}

/** Reads one field; returns its text value. Throws Stop / Truncated. */
function readField(r: Reader, enc: Iso8583Encoding, def: Iso8583Field): string {
	const variable = def.lv > 0;
	let len = def.len;
	if (variable) {
		len = readLength(r, enc, def);
		if (len > def.len) throw new Stop({ reason: 'fieldTooLong', params: { de: def.de, max: def.len, got: len } });
	}
	const digitsOnly = (value: string) => {
		if (!/^\d*$/.test(value)) throw new Stop({ reason: 'badFieldDigits', params: { de: def.de, name: def.name } });
		return value;
	};
	if (enc === 'ascii') {
		switch (def.type) {
			case 'n':
				return digitsOnly(r.take(len));
			case 'an': {
				const v = r.take(len);
				if (!/^[A-Za-z0-9]*$/.test(v)) throw new Stop({ reason: 'badFieldChars', params: { de: def.de, name: def.name } });
				return v;
			}
			case 'ans':
			case 'z':
				return r.take(len);
			case 'b': {
				const v = r.take(variable ? len : len / 4);
				if (!/^[0-9A-Fa-f]*$/.test(v)) throw new Stop({ reason: 'badFieldChars', params: { de: def.de, name: def.name } });
				return v.toUpperCase();
			}
			case 'xn': {
				const v = r.take(len + 1);
				if (!/^[CD]\d+$/.test(v)) throw new Stop({ reason: 'badFieldChars', params: { de: def.de, name: def.name } });
				return v;
			}
		}
	}
	// binary
	switch (def.type) {
		case 'n': {
			const hex = r.take(Math.ceil(len / 2));
			return digitsOnly(hex.slice(hex.length - len));
		}
		case 'z': {
			const hex = r.take(Math.ceil(len / 2));
			return hex.slice(0, len).replace(/D/g, '=');
		}
		case 'an':
		case 'ans': {
			const text = hexToAscii(r.take(len));
			if (!PRINTABLE.test(text)) throw new Stop({ reason: 'badFieldChars', params: { de: def.de, name: def.name } });
			if (def.type === 'an' && !/^[A-Za-z0-9]*$/.test(text)) throw new Stop({ reason: 'badFieldChars', params: { de: def.de, name: def.name } });
			return text;
		}
		case 'b':
			return r.take(variable ? len : len / 8);
		case 'xn': {
			const sign = hexToAscii(r.take(1));
			if (sign !== 'C' && sign !== 'D') throw new Stop({ reason: 'badFieldChars', params: { de: def.de, name: def.name } });
			const hex = r.take(Math.ceil(len / 2));
			return sign + digitsOnly(hex.slice(hex.length - len));
		}
	}
}

// ---------------------------------------------------------------------------------------------------------
// semantic checks (only run on a structurally valid message)

const validDate = (mmdd: string) => {
	const m = Number(mmdd.slice(0, 2));
	const d = Number(mmdd.slice(2, 4));
	const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1];
};
const validTime = (hhmmss: string) => Number(hhmmss.slice(0, 2)) <= 23 && Number(hhmmss.slice(2, 4)) <= 59 && Number(hhmmss.slice(4, 6)) <= 59;

const CURRENCY_ALPHA = new Map(CURRENCIES.map((c) => [c[1], c[0]]));
const COUNTRY_ALPHA = new Map(COUNTRIES.map((c) => [c[2], c[0]]));

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

function checkSemantics(fields: ParsedField[]): Iso8583Problem | null {
	for (const f of fields) {
		const p = { de: f.de, name: f.name, value: f.value };
		switch (f.de) {
			case 7: // MMDDhhmmss
				if (!validDate(f.value.slice(0, 4))) return { reason: 'badFieldDate', params: p };
				if (!validTime(f.value.slice(4, 10))) return { reason: 'badFieldTime', params: p };
				break;
			case 12:
				if (!validTime(f.value)) return { reason: 'badFieldTime', params: p };
				break;
			case 13:
			case 15:
			case 16:
			case 17:
				if (!validDate(f.value)) return { reason: 'badFieldDate', params: p };
				break;
			case 14: {
				const month = Number(f.value.slice(2, 4));
				if (month < 1 || month > 12) return { reason: 'badFieldDate', params: p };
				break;
			}
			case 49:
			case 50:
			case 51: {
				const alpha = CURRENCY_ALPHA.get(f.value);
				if (!alpha) return { reason: 'badFieldCurrency', params: p };
				f.meaning = alpha;
				break;
			}
			case 19:
			case 20:
			case 21:
			case 68:
			case 69: {
				const alpha = COUNTRY_ALPHA.get(f.value);
				if (!alpha) return { reason: 'badFieldCountry', params: p };
				f.meaning = alpha;
				break;
			}
			case 2:
				f.meaning = luhnOk(f.value) ? 'Luhn check OK' : 'Luhn check fails (test PANs often do)';
				break;
			case 3:
				f.meaning = PROCESSING_CODES[f.value.slice(0, 2)];
				break;
			case 39:
				f.meaning = RESPONSE_CODES[f.value];
				break;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------------------------------------
// parsing

function parseWith(enc: Iso8583Encoding, text: string, bytes: Uint8Array): Iso8583Parse {
	const base: Iso8583Parse = { encoding: enc, ok: false, header: 0, mti: '', mtiMeaning: '', bitmap: '', fields: [] };

	// optional length header (TCP framing): value equals the number of units that follow
	let start = 0;
	if (enc === 'binary' && bytes.length > 2 && (bytes[0] << 8) + bytes[1] === bytes.length - 2) start = 2;
	else if (enc === 'ascii' && /^\d{4}/.test(text) && Number(text.slice(0, 4)) === text.length - 4 && /^\d{4}/.test(text.slice(4))) start = 4;
	base.header = start;
	const r = enc === 'ascii' ? asciiReader(text, start) : binaryReader(bytes, start);

	try {
		const mti = r.take(enc === 'ascii' ? 4 : 2);
		base.mti = mti;
		const meaning = describeMti(mti);
		if (!meaning) throw new Stop({ reason: 'badMti', params: { mti } });
		base.mtiMeaning = meaning;

		const bitmapUnits = enc === 'ascii' ? 16 : 8;
		let bitmapHex = r.take(bitmapUnits);
		if (!/^[0-9A-Fa-f]+$/.test(bitmapHex)) throw new Stop({ reason: 'badBitmap', params: { part: 'notHex' } });
		const hasSecondary = (parseInt(bitmapHex[0], 16) & 8) !== 0;
		if (hasSecondary) {
			try {
				bitmapHex += r.take(bitmapUnits);
			} catch {
				throw new Stop({ reason: 'badBitmap', params: { part: 'secondaryMissing' } });
			}
		}
		bitmapHex = bitmapHex.toUpperCase();
		base.bitmap = bitmapHex;

		const bits: number[] = [];
		for (let i = 0; i < bitmapHex.length * 4; i++) {
			if ((parseInt(bitmapHex[Math.floor(i / 4)], 16) >> (3 - (i % 4))) & 1) bits.push(i + 1);
		}
		for (const de of bits) {
			if (de === 1) continue; // "secondary bitmap present"
			if (de === 65 || !ISO8583_FIELDS.has(de)) throw new Stop({ reason: 'unsupportedField', params: { de } });
		}
		for (const de of bits) {
			if (de === 1) continue;
			const def = ISO8583_FIELDS.get(de)!;
			try {
				base.fields.push({ de, name: def.name, value: readField(r, enc, def) });
			} catch (e) {
				if (e instanceof Truncated) throw new Stop({ reason: 'truncated', params: { de, need: e.need, have: e.have } });
				throw e;
			}
		}
		if (r.left() > 0) throw new Stop({ reason: 'trailingData', params: { count: r.left() } });
		const semantic = checkSemantics(base.fields);
		if (semantic) {
			base.problem = semantic;
			return base;
		}
		base.ok = true;
		return base;
	} catch (e) {
		if (e instanceof Stop) {
			base.problem = e.problem;
			return base;
		}
		if (e instanceof Truncated) {
			base.problem = { reason: 'badBitmap', params: { part: 'tooShort' } };
			return base;
		}
		throw e;
	}
}

/** Heuristic used by auto-detect: long enough for MTI + primary bitmap and looks like an ISO 8583 dump. */
export function looksLikeIso8583(input: string): boolean {
	const t = input.trim();
	const compact = t.replace(/\s/g, '');
	if (compact.length < 24) return false;
	if (/^[0-9A-Fa-f]+$/.test(compact) && compact.length >= 40) return true; // a hex dump
	return /^\d{4}[0-9A-Fa-f]{16}/.test(t) || /^\d{4}\d{4}[0-9A-Fa-f]{16}/.test(t);
}

/** Parses a pasted message. Returns the interpretation that parses cleanly, else the one that got furthest. */
export function parseIso8583(input: string): Iso8583Parse {
	const trimmed = input.trim();
	const compactHex = trimmed.replace(/\s/g, '');
	const tries: Iso8583Parse[] = [];
	const asciiText = /^[0-9A-Fa-f\s]+$/.test(trimmed) ? trimmed.replace(/\s/g, '') : trimmed.replace(/[\r\n]+/g, '');
	tries.push(parseWith('ascii', asciiText, new Uint8Array()));
	if (/^[0-9A-Fa-f]+$/.test(compactHex) && compactHex.length % 2 === 0) {
		const bytes = new Uint8Array(compactHex.match(/../g)!.map((h) => parseInt(h, 16)));
		tries.push(parseWith('binary', '', bytes));
	}
	const good = tries.find((t) => t.ok);
	if (good) return good;
	// Neither parsed. The same hex text can be misread as the other encoding, which usually dies early (bad digits,
	// bad length) or leaves garbage; a message that read all the way through and only fails a content check, or just
	// ends too soon, is almost certainly the right reading — report that one.
	const plausibility = (t: Iso8583Parse): number => {
		switch (t.problem?.reason) {
			case 'badFieldDate':
			case 'badFieldTime':
			case 'badFieldCurrency':
			case 'badFieldCountry':
				return 4;
			case 'truncated':
				return 3;
			case 'trailingData':
				return 2;
			default:
				return t.mtiMeaning ? 1 : 0;
		}
	};
	return tries.reduce((best, t) => {
		const a = plausibility(t);
		const b = plausibility(best);
		return a > b || (a === b && t.fields.length > best.fields.length) ? t : best;
	});
}
