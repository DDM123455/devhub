// Text decoding + delimiter sniffing helpers for the CSV/JSON converter (no DOM, unit-testable).
// Everything runs on bytes the user already loaded locally - nothing is uploaded.

export interface EncodingOption {
	value: string;
	label: string;
}

/** `auto` = BOM sniffing, then strict UTF-8, then Windows-1252. The rest are TextDecoder labels. */
export const ENCODING_OPTIONS: EncodingOption[] = [
	{ value: 'auto', label: 'Auto-detect' },
	{ value: 'utf-8', label: 'UTF-8' },
	{ value: 'utf-16le', label: 'UTF-16 LE' },
	{ value: 'utf-16be', label: 'UTF-16 BE' },
	{ value: 'windows-1252', label: 'Windows-1252 (Western)' },
	{ value: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)' },
	{ value: 'iso-8859-2', label: 'ISO-8859-2 (Central European)' },
	{ value: 'iso-8859-15', label: 'ISO-8859-15 (Latin-9)' },
	{ value: 'windows-1250', label: 'Windows-1250 (Central European)' },
	{ value: 'windows-1251', label: 'Windows-1251 (Cyrillic)' },
	{ value: 'windows-1258', label: 'Windows-1258 (Vietnamese)' },
	{ value: 'shift_jis', label: 'Shift_JIS (Japanese)' },
	{ value: 'euc-kr', label: 'EUC-KR (Korean)' },
	{ value: 'gb18030', label: 'GB18030 (Chinese)' },
	{ value: 'big5', label: 'Big5 (Traditional Chinese)' },
];

export interface DecodeResult {
	text: string;
	/** The encoding actually used (never `auto`). */
	encoding: string;
	/** True when a byte order mark decided the encoding. */
	bom: boolean;
}

function sniffBom(bytes: Uint8Array): string | null {
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
	return null;
}

/** UTF-16 without BOM: ASCII text shows up as many NUL bytes at even or odd positions. */
function sniffBomlessUtf16(bytes: Uint8Array): string | null {
	const sample = Math.min(bytes.length, 400) & ~1;
	if (sample < 4) return null;
	let evenZeros = 0;
	let oddZeros = 0;
	for (let i = 0; i < sample; i += 2) {
		if (bytes[i] === 0) evenZeros++;
		if (bytes[i + 1] === 0) oddZeros++;
	}
	const half = sample / 2;
	if (oddZeros > half * 0.3 && evenZeros === 0) return 'utf-16le';
	if (evenZeros > half * 0.3 && oddZeros === 0) return 'utf-16be';
	return null;
}

export function decodeBuffer(buffer: ArrayBuffer | Uint8Array, encoding: string = 'auto'): DecodeResult {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const bomEncoding = sniffBom(bytes);
	if (encoding === 'auto') {
		if (bomEncoding) return { text: new TextDecoder(bomEncoding).decode(bytes), encoding: bomEncoding, bom: true };
		const utf16 = sniffBomlessUtf16(bytes);
		if (utf16) return { text: new TextDecoder(utf16).decode(bytes), encoding: utf16, bom: false };
		try {
			return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', bom: false };
		} catch {
			return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252', bom: false };
		}
	}
	let decoder: TextDecoder;
	try {
		decoder = new TextDecoder(encoding);
	} catch {
		decoder = new TextDecoder('utf-8');
		encoding = 'utf-8';
	}
	// TextDecoder strips a BOM that matches the chosen encoding; a stray UTF-8 BOM in another
	// encoding would otherwise end up glued to the first header.
	return { text: decoder.decode(bytes).replace(/^﻿/, ''), encoding, bom: bomEncoding === encoding };
}

const CANDIDATES = [',', ';', '\t', '|'] as const;

function countOutsideQuotes(line: string, delimiter: string): number {
	let inQuotes = false;
	let count = 0;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') inQuotes = !inQuotes;
		else if (!inQuotes && ch === delimiter) count++;
	}
	return count;
}

/**
 * Picks the delimiter that splits the first lines into the same number (>= 2) of fields.
 * Returns null when nothing convincing is found (e.g. a single-column file).
 */
export function detectDelimiter(text: string, sampleLines = 10): string | null {
	const lines = text
		.split(/\r?\n/)
		.filter((l) => l.trim() !== '')
		.slice(0, sampleLines);
	if (lines.length === 0) return null;
	let best: string | null = null;
	let bestScore = 0;
	for (const delimiter of CANDIDATES) {
		const counts = lines.map((l) => countOutsideQuotes(l, delimiter));
		const min = Math.min(...counts);
		if (min === 0) continue;
		const consistent = counts.every((c) => c === counts[0]);
		const score = (consistent ? 1000 : 0) + min;
		if (score > bestScore) {
			bestScore = score;
			best = delimiter;
		}
	}
	if (best !== null) return best;
	// Ragged rows: fall back to the delimiter present in the header line the most.
	let fallback: string | null = null;
	let fallbackCount = 0;
	for (const delimiter of CANDIDATES) {
		const c = countOutsideQuotes(lines[0], delimiter);
		if (c > fallbackCount) {
			fallback = delimiter;
			fallbackCount = c;
		}
	}
	return fallback;
}
