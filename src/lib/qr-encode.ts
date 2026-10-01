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
