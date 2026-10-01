import { stringify as yamlStringify } from 'yaml';
import { formatJsonLossless } from './text-format';

// Pure JSON -> XML / YAML / CSV converters and a structural JSON diff, extracted from the
// JSON Formatter component so they can be unit-tested.

// ---------------------------------------------------------------------------
// Source-text analysis: the editor hands us parsed data (JSON.parse), which silently
// rounds big integers and collapses duplicate keys. Scan the raw text so the UI can warn.
// ---------------------------------------------------------------------------

export interface JsonTextWarnings {
	unsafeNumbers: boolean;
	duplicateKeys: boolean;
}

export function analyzeJsonText(text: string): JsonTextWarnings {
	let unsafeNumbers = false;
	const tokenRe = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
	let m: RegExpExecArray | null;
	while ((m = tokenRe.exec(text)) !== null) {
		const token = m[0];
		if (token.startsWith('"')) continue;
		const isInteger = !/[.eE]/.test(token);
		if (isInteger) {
			if (!Number.isSafeInteger(Number(token))) {
				unsafeNumbers = true;
				break;
			}
		} else {
			const significant = token.replace(/[eE].*$/, '').replace(/^-/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
			if (significant.length > 17) {
				unsafeNumbers = true;
				break;
			}
		}
	}
	const lossless = formatJsonLossless(text);
	return { unsafeNumbers, duplicateKeys: !!lossless?.hasDuplicateKeys };
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

// Characters that are illegal in XML 1.0 documents (control chars, U+FFFE/U+FFFF,
// lone surrogates) are dropped instead of producing a file no parser will open.
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlEscape(value: string): string {
	return value
		.replace(XML_ILLEGAL, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\r/g, '&#13;');
}

function xmlAttrEscape(value: string): string {
	return xmlEscape(value).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}

export function xmlTagName(key: string): string {
	const cleaned = key.replace(/[^a-zA-Z0-9_.-]/g, '_');
	return /^[a-zA-Z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function jsonToXml(value: unknown, key: string, depth: number): string {
	const indent = '  '.repeat(depth);
	const tagName = xmlTagName(key);
	// Keys that had to be rewritten to be a legal XML name keep their original spelling
	// in a `name` attribute so the data isn't silently renamed.
	const nameAttr = tagName !== key && key !== 'item' && key !== 'root' ? ` name="${xmlAttrEscape(key)}"` : '';
	const open = `${tagName}${nameAttr}`;
	if (value === null || value === undefined) return `${indent}<${open} />`;
	if (Array.isArray(value)) {
		if (value.length === 0) return `${indent}<${open} />`;
		const items = value.map((item) => jsonToXml(item, 'item', depth + 1)).join('\n');
		return `${indent}<${open}>\n${items}\n${indent}</${tagName}>`;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return `${indent}<${open} />`;
		const children = entries.map(([k, val]) => jsonToXml(val, k, depth + 1)).join('\n');
		return `${indent}<${open}>\n${children}\n${indent}</${tagName}>`;
	}
	return `${indent}<${open}>${xmlEscape(String(value))}</${tagName}>`;
}

export function convertJsonToXml(json: unknown): string {
	return `<?xml version="1.0" encoding="UTF-8"?>\n${jsonToXml(json, 'root', 0)}`;
}

// ---------------------------------------------------------------------------
// YAML — delegated to the `yaml` library, which correctly quotes every string that
// would otherwise be re-read as a different type (true/null/yes/no/on/off, numbers,
// "- x", ": ", multi-line text, keys like `true`...).
// ---------------------------------------------------------------------------

export function convertJsonToYaml(json: unknown): string {
	return yamlStringify(json, { indent: 2, lineWidth: 0 }).replace(/\n$/, '');
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export interface FlattenResult {
	flat: Record<string, unknown>;
	collisions: string[];
}

export function flattenObject(obj: Record<string, unknown>, prefix = '', acc?: FlattenResult): FlattenResult {
	const result: FlattenResult = acc ?? { flat: Object.create(null) as Record<string, unknown>, collisions: [] };
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
			flattenObject(value as Record<string, unknown>, fullKey, result);
		} else {
			if (Object.prototype.hasOwnProperty.call(result.flat, fullKey) && !result.collisions.includes(fullKey)) {
				result.collisions.push(fullKey);
			}
			result.flat[fullKey] = value;
		}
	}
	return result;
}

// Spreadsheet apps execute cells starting with = + - @ (and tab/CR) as formulas
// (CSV injection). String cells get a leading apostrophe; real numbers are untouched.
export function csvCell(value: unknown): string {
	if (value === undefined || value === null) return '';
	let str = typeof value === 'object' ? JSON.stringify(value) : String(value);
	if (typeof value === 'string' && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
	return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export interface CsvResult {
	text: string;
	collisions: string[];
}

// CSV is inherently tabular, so a JSON array of objects becomes one row per object
// (nested objects flattened with dot-notation keys, arrays kept as a stringified cell);
// a single object becomes one row; any other JSON becomes a single "value" column.
export function convertJsonToCsvDetailed(json: unknown): CsvResult {
	const collisions: string[] = [];
	const toRow = (item: unknown): Record<string, unknown> => {
		if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
			const { flat, collisions: c } = flattenObject(item as Record<string, unknown>);
			for (const k of c) if (!collisions.includes(k)) collisions.push(k);
			return flat;
		}
		return { value: item };
	};
	let rows: Record<string, unknown>[];
	if (Array.isArray(json)) rows = json.map(toRow);
	else rows = [toRow(json)];

	const headerSet = new Set<string>();
	for (const row of rows) for (const key of Object.keys(row)) headerSet.add(key);
	const headers = Array.from(headerSet);
	if (headers.length === 0) return { text: '', collisions };

	const lines = [headers.map(csvCell).join(',')];
	for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
	return { text: lines.join('\n'), collisions };
}

export function convertJsonToCsv(json: unknown): string {
	return convertJsonToCsvDetailed(json).text;
}

// ---------------------------------------------------------------------------
// Structural diff
// ---------------------------------------------------------------------------

export interface DiffEntry {
	path: string;
	type: 'added' | 'removed' | 'changed';
	leftValue?: unknown;
	rightValue?: unknown;
}

function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	return JSON.stringify(a) === JSON.stringify(b);
}

// Walks both trees in parallel, reporting one entry per key/index that was added,
// removed, or whose value changed. Index-by-index array comparison (no reordering
// detection). Uses Object.hasOwn so keys like "toString"/"constructor"/"__proto__"
// are not mistaken for present when they merely exist on Object.prototype.
export function diffJson(a: unknown, b: unknown, path = '$'): DiffEntry[] {
	if (valuesEqual(a, b)) return [];
	const aIsObj = a !== null && typeof a === 'object';
	const bIsObj = b !== null && typeof b === 'object';
	if (!aIsObj || !bIsObj) return [{ path, type: 'changed', leftValue: a, rightValue: b }];

	const aIsArr = Array.isArray(a);
	const bIsArr = Array.isArray(b);
	if (aIsArr !== bIsArr) return [{ path, type: 'changed', leftValue: a, rightValue: b }];

	const entries: DiffEntry[] = [];
	if (aIsArr) {
		const aArr = a as unknown[];
		const bArr = b as unknown[];
		const maxLen = Math.max(aArr.length, bArr.length);
		for (let i = 0; i < maxLen; i++) {
			const childPath = `${path}[${i}]`;
			if (i >= aArr.length) entries.push({ path: childPath, type: 'added', rightValue: bArr[i] });
			else if (i >= bArr.length) entries.push({ path: childPath, type: 'removed', leftValue: aArr[i] });
			else entries.push(...diffJson(aArr[i], bArr[i], childPath));
		}
	} else {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		for (const key of new Set([...Object.keys(aObj), ...Object.keys(bObj)])) {
			const childPath = `${path}.${key}`;
			const inA = Object.hasOwn(aObj, key);
			const inB = Object.hasOwn(bObj, key);
			if (!inA) entries.push({ path: childPath, type: 'added', rightValue: bObj[key] });
			else if (!inB) entries.push({ path: childPath, type: 'removed', leftValue: aObj[key] });
			else entries.push(...diffJson(aObj[key], bObj[key], childPath));
		}
	}
	return entries;
}
