// Pure helpers for the QR Code Generator (no DOM, unit-testable).

import { contrastRatio, hexToRgb, relativeLuminance } from './color-utils';

/**
 * qr-code-styling feeds `data` to qrcode-generator, whose default byte encoder
 * keeps only the low 8 bits of every UTF-16 code unit (ISO-8859-1). Accented
 * Vietnamese / CJK / emoji text therefore gets mangled. Converting the string
 * to a "binary string" of its UTF-8 bytes (one char per byte) makes the encoder
 * emit the correct UTF-8 byte sequence, which every modern scanner decodes as UTF-8.
 */
export function utf8ToBinaryString(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
	return out;
}

export type WifiEncryption = 'WPA' | 'WEP' | 'nopass';

export interface WifiFields {
	ssid: string;
	password: string;
	encryption: WifiEncryption;
	hidden: boolean;
}

export interface VCardFields {
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	org: string;
	url: string;
}

export interface EmailFields {
	to: string;
	subject: string;
	body: string;
}

export interface SmsFields {
	phone: string;
	message: string;
}

// Special characters in a WIFI: payload must be backslash-escaped per the
// de facto convention (Android, iOS, ZXing).
export function escapeWifiField(value: string): string {
	return value.replace(/([\\;,":])/g, '\\$1');
}

export function buildWifiPayload(w: WifiFields): string {
	const parts = [`T:${w.encryption}`, `S:${escapeWifiField(w.ssid)}`];
	if (w.encryption !== 'nopass') parts.push(`P:${escapeWifiField(w.password)}`);
	if (w.hidden) parts.push('H:true');
	return `WIFI:${parts.join(';')};;`;
}

/** vCard 3.0 text-value escaping: backslash, semicolon, comma, newline. */
export function escapeVCardValue(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

export function buildVCardPayload(v: VCardFields): string {
	const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
	if (v.firstName || v.lastName) {
		lines.push(`N:${escapeVCardValue(v.lastName)};${escapeVCardValue(v.firstName)};;;`);
		lines.push(`FN:${escapeVCardValue([v.firstName, v.lastName].filter(Boolean).join(' '))}`);
	}
	if (v.org) lines.push(`ORG:${escapeVCardValue(v.org)}`);
	if (v.phone) lines.push(`TEL:${escapeVCardValue(v.phone)}`);
	if (v.email) lines.push(`EMAIL:${escapeVCardValue(v.email)}`);
	if (v.url) lines.push(`URL:${escapeVCardValue(v.url)}`);
	lines.push('END:VCARD');
	return lines.join('\r\n');
}

/**
 * mailto: query values must be percent-encoded (space = %20). URLSearchParams
 * would emit "+" for spaces, which mail clients show literally as "+".
 */
export function buildEmailPayload(e: EmailFields): string {
	const to = encodeURIComponent(e.to.trim()).replace(/%40/g, '@').replace(/%2C/gi, ',');
	const params: string[] = [];
	if (e.subject) params.push(`subject=${encodeURIComponent(e.subject)}`);
	if (e.body) params.push(`body=${encodeURIComponent(e.body)}`);
	return `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
}

// SMSTO:<phone>:<message> is recognized by nearly every scanner.
export function buildSmsPayload(s: SmsFields): string {
	return `SMSTO:${s.phone.trim()}:${s.message}`;
}

const KNOWN_SCHEMES = /^(https?|ftp|mailto|tel|sms|smsto|mms|geo|wifi|market|bitcoin|facetime|skype|whatsapp|tg|ssh|sftp|file|data|urn):/i;

/**
 * Adds https:// to scheme-less web addresses ("example.com/path") so phone
 * scanners open them as links. Text with spaces, or with an existing scheme,
 * is left alone. `added` tells the UI to display the change.
 */
export function normalizeUrlInput(raw: string): { value: string; added: boolean } {
	const value = raw.trim();
	if (value === '') return { value: '', added: false };
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || KNOWN_SCHEMES.test(value)) return { value, added: false };
	if (/\s/.test(value)) return { value, added: false };
	if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(value) || /^localhost(:\d+)?([/?#].*)?$/i.test(value)) {
		return { value: `https://${value}`, added: true };
	}
	return { value, added: false };
}

/** Quiet zone (white border) proportional to the exported size so tiny and huge exports both stay scannable. */
export function quietZoneMargin(sizePx: number): number {
	return Math.max(8, Math.round(sizePx * 0.1));
}

export type ContrastWarning = 'inverted' | 'low' | null;

/**
 * Scanners expect dark modules on a light background. Light-on-dark ("inverted")
 * fails on many cheaper readers; a ratio under 3:1 is unreliable for any reader.
 */
export function qrContrastWarning(fgHex: string, bgHex: string): ContrastWarning {
	const fg = hexToRgb(fgHex);
	const bg = hexToRgb(bgHex);
	if (!fg || !bg) return null;
	const ratio = contrastRatio(fg, bg);
	if (ratio < 3) return 'low';
	if (relativeLuminance(fg) > relativeLuminance(bg)) return 'inverted';
	return null;
}

export const BATCH_MAX_LINES = 200;
const MAX_FILE_BASE_LENGTH = 40;

export interface BatchLine {
	text: string;
	/** 1-based line number in the textarea (blank lines are skipped but still counted). */
	line: number;
}

export function parseBatchLines(input: string, max = BATCH_MAX_LINES): { lines: BatchLine[]; total: number; truncated: boolean } {
	const all: BatchLine[] = [];
	input.split(/\r?\n/).forEach((raw, i) => {
		const text = raw.trim();
		if (text) all.push({ text, line: i + 1 });
	});
	return { lines: all.slice(0, max), total: all.length, truncated: all.length > max };
}

export function batchBaseName(data: string, index: number): string {
	const cleaned = data
		.replace(/^https?:\/\//i, '')
		.replace(/[^a-zA-Z0-9-_]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_FILE_BASE_LENGTH)
		.replace(/-+$/g, '');
	return cleaned || `qrcode-${index + 1}`;
}

/** Case-insensitive de-duplication (Windows/macOS file systems ignore case) keeping the final length bounded. */
export function uniqueName(base: string, used: Set<string>, index: number): string {
	let name = base;
	let attempt = 0;
	while (used.has(name.toLowerCase())) {
		attempt += 1;
		const suffix = `-${index + 1}${attempt > 1 ? `-${attempt}` : ''}`;
		name = `${base.slice(0, Math.max(1, MAX_FILE_BASE_LENGTH - suffix.length))}${suffix}`;
	}
	used.add(name.toLowerCase());
	return name;
}

export function qrAriaLabel(template: string, value: string): string {
	const short = value.length > 80 ? `${value.slice(0, 77)}...` : value;
	return template.replace('{{value}}', short.replace(/\s+/g, ' '));
}

// ---------------------------------------------------------------------------
// Extra content types: Phone, MeCard, Geo, Event, Bitcoin, WhatsApp
// ---------------------------------------------------------------------------

export interface PhoneFields {
	phone: string;
}

export interface MeCardFields {
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	url: string;
	address: string;
	note: string;
}

export interface GeoFields {
	lat: string;
	lng: string;
}

export interface EventFields {
	title: string;
	/** `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm") or, when allDay, a date ("YYYY-MM-DD"). */
	start: string;
	end: string;
	allDay: boolean;
	location: string;
	description: string;
}

export interface BitcoinFields {
	address: string;
	amount: string;
	label: string;
	message: string;
}

export interface WhatsAppFields {
	phone: string;
	message: string;
}

/** tel: URI — keeps a leading "+" and digits only (spaces, dashes, brackets are dropped). */
export function buildPhonePayload(p: PhoneFields): string {
	const raw = p.phone.trim();
	if (!raw) return '';
	const cleaned = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
	return cleaned ? `tel:${cleaned}` : '';
}

/** MeCard (DoCoMo) value escaping: backslash before \ ; , : and ". */
export function escapeMeCardValue(value: string): string {
	return value.replace(/([\\;,:"])/g, '\\$1').replace(/\r\n|\r|\n/g, ' ');
}

export function buildMeCardPayload(m: MeCardFields): string {
	const parts: string[] = [];
	if (m.firstName || m.lastName) {
		// N:<last>,<first>
		parts.push(`N:${escapeMeCardValue(m.lastName)},${escapeMeCardValue(m.firstName)}`);
	}
	if (m.phone) parts.push(`TEL:${m.phone.replace(/[^\d+]/g, '')}`);
	if (m.email) parts.push(`EMAIL:${escapeMeCardValue(m.email)}`);
	if (m.url) parts.push(`URL:${escapeMeCardValue(m.url)}`);
	if (m.address) parts.push(`ADR:${escapeMeCardValue(m.address)}`);
	if (m.note) parts.push(`NOTE:${escapeMeCardValue(m.note)}`);
	if (parts.length === 0) return '';
	return `MECARD:${parts.join(';')};;`;
}

/** Parses a decimal coordinate; returns null if not a finite number within ±limit. */
export function parseCoordinate(raw: string, limit: number): number | null {
	const text = raw.trim().replace(',', '.');
	if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
	const n = Number(text);
	return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/** RFC 5870 geo URI: geo:lat,lng. Returns '' for invalid/out-of-range coordinates. */
export function buildGeoPayload(g: GeoFields): string {
	const lat = parseCoordinate(g.lat, 90);
	const lng = parseCoordinate(g.lng, 180);
	if (lat === null || lng === null) return '';
	return `geo:${lat},${lng}`;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

/** "2026-10-01T09:30" -> "20261001T093000" (floating local time); date-only -> "20261001". */
export function toIcsDateTime(value: string, allDay: boolean): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value.trim());
	if (!m) return null;
	const date = `${m[1]}${m[2]}${m[3]}`;
	if (allDay) return date;
	if (m[4] === undefined) return null;
	return `${date}T${m[4]}${m[5]}00`;
}

export function buildEventPayload(e: EventFields): string {
	const start = toIcsDateTime(e.start, e.allDay);
	if (!e.title.trim() || !start) return '';
	const end = e.end ? toIcsDateTime(e.end, e.allDay) : null;
	const prop = (name: string, value: string) => (e.allDay ? `${name};VALUE=DATE:${value}` : `${name}:${value}`);
	const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeIcsText(e.title.trim())}`, prop('DTSTART', start)];
	if (end) lines.push(prop('DTEND', end));
	if (e.location.trim()) lines.push(`LOCATION:${escapeIcsText(e.location.trim())}`);
	if (e.description.trim()) lines.push(`DESCRIPTION:${escapeIcsText(e.description.trim())}`);
	lines.push('END:VEVENT');
	return lines.join('\r\n');
}

/** True for a plain positive decimal amount such as "0.001" (BIP-21 forbids exponents/signs). */
export function isValidBitcoinAmount(raw: string): boolean {
	return /^\d+(\.\d{1,8})?$/.test(raw.trim()) && Number(raw) > 0;
}

/** BIP-21 URI: bitcoin:<address>?amount=<btc>&label=<..>&message=<..> (values percent-encoded). */
export function buildBitcoinPayload(b: BitcoinFields): string {
	const address = b.address.trim();
	if (!address) return '';
	const params: string[] = [];
	const amount = b.amount.trim().replace(',', '.');
	if (amount && isValidBitcoinAmount(amount)) params.push(`amount=${amount}`);
	if (b.label.trim()) params.push(`label=${encodeURIComponent(b.label.trim())}`);
	if (b.message.trim()) params.push(`message=${encodeURIComponent(b.message.trim())}`);
	return `bitcoin:${encodeURIComponent(address)}${params.length ? `?${params.join('&')}` : ''}`;
}

/** wa.me link: international number as digits only (no +, no leading zeros), optional pre-filled text. */
export function buildWhatsAppPayload(w: WhatsAppFields): string {
	const digits = w.phone.replace(/\D/g, '').replace(/^0+/, '');
	if (!digits) return '';
	const text = w.message.trim();
	return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// ---------------------------------------------------------------------------
// Design templates (save / load / JSON import-export)
// ---------------------------------------------------------------------------

export const QR_DESIGN_VERSION = 1;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DOT_TYPE_SET = new Set(['square', 'dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded']);
const CORNER_SQUARE_SET = new Set(['', 'square', 'dot', 'extra-rounded']);
const CORNER_DOT_SET = new Set(['', 'square', 'dot']);
const LEVEL_SET = new Set(['L', 'M', 'Q', 'H']);

export interface QrDesign {
	version: number;
	fgColor: string;
	bgColor: string;
	dotsType: string;
	level: string;
	size: number;
	gradientEnabled: boolean;
	gradientType: 'linear' | 'radial';
	gradientColorStart: string;
	gradientColorEnd: string;
	/** '' = same as dot style. */
	cornerSquareType: string;
	cornerDotType: string;
	/** '' = same as body colour. */
	cornerSquareColor: string;
	cornerDotColor: string;
}

export const DEFAULT_QR_DESIGN: QrDesign = {
	version: QR_DESIGN_VERSION,
	fgColor: '#000000',
	bgColor: '#ffffff',
	dotsType: 'square',
	level: 'M',
	size: 256,
	gradientEnabled: false,
	gradientType: 'linear',
	gradientColorStart: '#047857',
	gradientColorEnd: '#22d3ee',
	cornerSquareType: '',
	cornerDotType: '',
	cornerSquareColor: '',
	cornerDotColor: '',
};

/** Validates untrusted JSON (localStorage / imported file) into a safe design; null if not an object. */
export function sanitizeQrDesign(input: unknown): QrDesign | null {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const o = input as Record<string, unknown>;
	const d = DEFAULT_QR_DESIGN;
	const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);
	const hexOrEmpty = (v: unknown) => (v === '' ? '' : hex(v, ''));
	const oneOf = (v: unknown, set: Set<string>, fallback: string) => (typeof v === 'string' && set.has(v) ? v : fallback);
	const size = typeof o.size === 'number' && Number.isFinite(o.size) ? Math.min(512, Math.max(128, Math.round(o.size / 8) * 8)) : d.size;
	return {
		version: QR_DESIGN_VERSION,
		fgColor: hex(o.fgColor, d.fgColor),
		bgColor: hex(o.bgColor, d.bgColor),
		dotsType: oneOf(o.dotsType, DOT_TYPE_SET, d.dotsType),
		level: oneOf(o.level, LEVEL_SET, d.level),
		size,
		gradientEnabled: o.gradientEnabled === true,
		gradientType: o.gradientType === 'radial' ? 'radial' : 'linear',
		gradientColorStart: hex(o.gradientColorStart, d.gradientColorStart),
		gradientColorEnd: hex(o.gradientColorEnd, d.gradientColorEnd),
		cornerSquareType: oneOf(o.cornerSquareType, CORNER_SQUARE_SET, ''),
		cornerDotType: oneOf(o.cornerDotType, CORNER_DOT_SET, ''),
		cornerSquareColor: hexOrEmpty(o.cornerSquareColor),
		cornerDotColor: hexOrEmpty(o.cornerDotColor),
	};
}

/** Parses an exported design JSON string; null when invalid. */
export function parseQrDesignJson(text: string): QrDesign | null {
	try {
		return sanitizeQrDesign(JSON.parse(text));
	} catch {
		return null;
	}
}

/**
 * PDF placement. 'a4': A4 portrait (595.28 x 841.89 pt) with the code centred at 60% of the page
 * width. 'fit': page just large enough for the code plus a 24 pt margin.
 */
export function pdfPlacement(imgPx: number, mode: 'a4' | 'fit'): { pageW: number; pageH: number; x: number; y: number; size: number } {
	if (mode === 'fit') {
		const margin = 24;
		const size = Math.max(64, imgPx * 0.75);
		return { pageW: size + margin * 2, pageH: size + margin * 2, x: margin, y: margin, size };
	}
	const pageW = 595.28;
	const pageH = 841.89;
	const size = pageW * 0.6;
	return { pageW, pageH, x: (pageW - size) / 2, y: (pageH - size) / 2, size };
}
