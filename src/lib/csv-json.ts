// Pure CSV <-> JSON helpers for the CSV/JSON converter (no DOM, unit-testable).

import Papa from 'papaparse';

export type Cell = string | number | boolean | null | undefined;

/** Keys that could be abused for prototype pollution when building objects from user-controlled paths. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isUnsafeKey(key: string): boolean {
	return UNSAFE_KEYS.has(key);
}

function newRecord(): Record<string, unknown> {
	// Null-prototype objects: assigning "__proto__" is just an ordinary own
	// property, so a malicious header such as "__proto__.polluted" can never
	// reach Object.prototype, and no data has to be dropped.
	return Object.create(null) as Record<string, unknown>;
}

export interface FlattenResult {
	flat: Record<string, unknown>;
	/** Output keys that two different source paths both mapped to (e.g. {"a":{"b":1},"a.b":2}). */
	collisions: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Flattens nested objects into dot-notation keys. Empty objects are kept as a
 * leaf (rendered as "{}") instead of silently disappearing. When two paths
 * collapse to the same key, the later one is renamed "key (2)" and reported.
 */
export function flattenObject(obj: Record<string, unknown>, prefix = '', acc?: FlattenResult): FlattenResult {
	const state: FlattenResult = acc ?? { flat: newRecord(), collisions: [] };
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (isPlainObject(value) && Object.keys(value).length > 0) {
			flattenObject(value, fullKey, state);
			continue;
		}
		let outKey = fullKey;
		if (Object.prototype.hasOwnProperty.call(state.flat, outKey)) {
			state.collisions.push(fullKey);
			let n = 2;
			while (Object.prototype.hasOwnProperty.call(state.flat, `${fullKey} (${n})`)) n += 1;
			outKey = `${fullKey} (${n})`;
		}
		state.flat[outKey] = value;
	}
	return state;
}

export interface UnflattenResult {
	value: Record<string, unknown>;
	/** Keys involved in a leaf-vs-object clash (e.g. columns "a" and "a.b"). */
	collisions: string[];
}

/**
 * Rebuilds nested objects from dot-notation keys. If a row contains a clash
 * such as "a" and "a.b" (a value cannot be both a leaf and an object) the row
 * is returned flat and unchanged so no cell is lost, and the keys are reported.
 */
export function unflattenObject(row: Record<string, unknown>): UnflattenResult {
	const result = newRecord();
	const collisions: string[] = [];
	for (const key of Object.keys(row)) {
		const parts = key.split('.');
		let target = result;
		let clash = false;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			const existing = Object.prototype.hasOwnProperty.call(target, part) ? target[part] : undefined;
			if (existing === undefined) {
				const created = newRecord();
				target[part] = created;
				target = created;
			} else if (isPlainObject(existing)) {
				target = existing;
			} else {
				clash = true;
				break;
			}
		}
		const last = parts[parts.length - 1];
		if (!clash && Object.prototype.hasOwnProperty.call(target, last)) clash = true;
		if (clash) {
			collisions.push(key);
			continue;
		}
		target[last] = row[key];
	}
	if (collisions.length > 0) {
		const flat = newRecord();
		for (const key of Object.keys(row)) flat[key] = row[key];
		return { value: flat, collisions };
	}
	return { value: result, collisions };
}

/** Converts a CSV string into a typed JSON value: true/false/null/numbers; everything else (incl. "007", "") stays text. */
export function convertTypedValue(value: string): string | number | boolean | null {
	const v = value.trim();
	if (v === 'true') return true;
	if (v === 'false') return false;
	if (v === 'null') return null;
	if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(v)) {
		const n = Number(v);
		// Keep very large integers as text: converting would silently lose digits.
		if (Number.isFinite(n) && (!/^-?\d+$/.test(v) || Number.isSafeInteger(n))) return n;
	}
	return value;
}

function csvCell(value: unknown): Cell {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
	return JSON.stringify(value);
}

export interface JsonToCsvResult {
	output: string;
	rootError: boolean;
	previewHeaders: string[];
	previewRows: string[][];
	warnings: string[];
}

export interface JsonToCsvOptions {
	delimiter: string;
	header: boolean;
	escapeFormulae: boolean;
}

// CSV is inherently tabular: an array of objects becomes one row per object (nested
// objects flattened with dot-notation keys; arrays kept as a stringified cell since a
// single CSV cell can't represent a list); a single object becomes one row.
export function jsonToCsv(json: unknown, options: JsonToCsvOptions): JsonToCsvResult {
	const empty: JsonToCsvResult = { output: '', rootError: false, previewHeaders: [], previewRows: [], warnings: [] };
	let rows: Record<string, unknown>[];
	const collisions: string[] = [];
	const flatten = (item: Record<string, unknown>) => {
		const r = flattenObject(item);
		collisions.push(...r.collisions);
		return r.flat;
	};
	if (Array.isArray(json)) {
		if (json.length === 0) return empty;
		rows = json.map((item) => {
			if (isPlainObject(item)) return flatten(item);
			const row = newRecord();
			row.value = item;
			return row;
		});
	} else if (isPlainObject(json)) {
		rows = [flatten(json)];
	} else {
		return { ...empty, rootError: true };
	}

	const fieldSet = new Set<string>();
	const fields: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!fieldSet.has(key)) {
				fieldSet.add(key);
				fields.push(key);
			}
		}
	}
	const data = rows.map((row) => fields.map((field) => csvCell(row[field])));
	const output = Papa.unparse(
		{ fields, data },
		{ delimiter: options.delimiter, header: options.header, escapeFormulae: options.escapeFormulae },
	);
	return {
		output,
		rootError: false,
		previewHeaders: fields,
		previewRows: data.map((r) => r.map((c) => (c === undefined || c === null ? '' : String(c)))),
		warnings: Array.from(new Set(collisions)),
	};
}

export interface CsvWarning {
	line: number;
	message: string;
}

export interface CsvToJsonOptions {
	delimiter: string;
	header: boolean;
	nested: boolean;
	pretty: boolean;
	typed: boolean;
}

export interface CsvToJsonResult {
	output: string;
	error: { line: number; message: string } | null;
	warnings: CsvWarning[];
	/** Dot-notation keys that clashed when building nested objects. */
	collisions: string[];
	previewHeaders: string[];
	previewRows: string[][];
}

const WARNING_ERROR_CODES = new Set(['TooFewFields', 'TooManyFields', 'UndetectableDelimiter']);

function lineOfIndex(text: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line += 1;
	return line;
}

export function csvToJson(csv: string, options: CsvToJsonOptions): CsvToJsonResult {
	const { delimiter, header, nested, pretty, typed } = options;
	const result = Papa.parse<Record<string, string> | string[]>(csv, {
		delimiter,
		header,
		skipEmptyLines: true,
		dynamicTyping: false,
	});

	const warnings: CsvWarning[] = [];
	let error: { line: number; message: string } | null = null;
	for (const e of result.errors) {
		// Real line in the file: prefer the character offset Papa reports; otherwise
		// fall back to the data-row index (+1 for the header row, +1 for 1-based lines).
		const line =
			typeof e.index === 'number' && e.type !== 'FieldMismatch'
				? lineOfIndex(csv, e.index)
				: (e.row ?? 0) + (header ? 2 : 1);
		if (WARNING_ERROR_CODES.has(e.code)) {
			warnings.push({ line, message: e.message });
		} else if (error === null) {
			error = { line, message: e.message };
		}
	}
	if (error) {
		return { output: '', error, warnings, collisions: [], previewHeaders: [], previewRows: [] };
	}

	let previewHeaders: string[];
	let previewRows: string[][];
	if (header) {
		previewHeaders = result.meta.fields ?? [];
		previewRows = (result.data as Record<string, string>[]).map((row) => previewHeaders.map((h) => row[h] ?? ''));
	} else {
		const rawRows = result.data as string[][];
		const width = rawRows.reduce((max, r) => Math.max(max, r.length), 0);
		previewHeaders = Array.from({ length: width }, (_, i) => `column${i + 1}`);
		previewRows = rawRows;
	}

	const convert = (value: unknown): unknown => (typed && typeof value === 'string' ? convertTypedValue(value) : value);
	const collisions: string[] = [];
	let data: unknown[];
	if (header) {
		data = (result.data as unknown as Record<string, unknown>[]).map((row) => {
			const typedRow = newRecord();
			for (const key of Object.keys(row)) typedRow[key] = convert(row[key]);
			if (!nested) return typedRow;
			const u = unflattenObject(typedRow);
			collisions.push(...u.collisions);
			return u.value;
		});
	} else {
		data = (result.data as string[][]).map((row) => {
			const obj = newRecord();
			row.forEach((cell, i) => {
				obj[`column${i + 1}`] = convert(cell);
			});
			return obj;
		});
	}

	return {
		output: JSON.stringify(data, null, pretty ? 2 : undefined),
		error: null,
		warnings,
		collisions: Array.from(new Set(collisions)),
		previewHeaders,
		previewRows,
	};
}

/** Custom delimiter rules: non-empty, no quote, no line break. */
export function validateDelimiter(value: string): boolean {
	if (value === '') return false;
	return !/["\r\n]/.test(value);
}

/**
 * When the chosen delimiter does not appear on the first line but another
 * common one does (a "single column" result), suggest that one.
 */
export function suggestDelimiter(text: string, current: string): string | null {
	const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '');
	if (!firstLine) return null;
	if (firstLine.includes(current)) return null;
	let best: string | null = null;
	let bestCount = 0;
	for (const candidate of [',', ';', '\t', '|']) {
		if (candidate === current) continue;
		const count = firstLine.split(candidate).length - 1;
		if (count > bestCount) {
			best = candidate;
			bestCount = count;
		}
	}
	return best;
}

/** Output file names for a batch: a.csv + a.tsv -> a.json, a (2).json; compared case-insensitively. */
export function dedupeFileNames(names: string[]): string[] {
	const used = new Set<string>();
	return names.map((name) => {
		let candidate = name;
		if (used.has(candidate.toLowerCase())) {
			const dot = name.lastIndexOf('.');
			const stem = dot > 0 ? name.slice(0, dot) : name;
			const ext = dot > 0 ? name.slice(dot) : '';
			let n = 2;
			while (used.has(`${stem} (${n})${ext}`.toLowerCase())) n += 1;
			candidate = `${stem} (${n})${ext}`;
		}
		used.add(candidate.toLowerCase());
		return candidate;
	});
}
