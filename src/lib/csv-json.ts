// Pure CSV <-> JSON helpers for the CSV/JSON converter (no DOM, unit-testable).

import Papa from 'papaparse';
import {
	toArrayOfArrays,
	toColumnArrays,
	toHtmlTable,
	toJsonLines,
	toKeyedObject,
	toMarkdownTable,
	toSqlInserts,
	toXml,
	toYaml,
	type Row,
	type SqlOptions,
	type XmlOptions,
} from './csv-json-formats';

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
		// "-0" would silently become 0.
		if (v === '-0') return value;
		const n = Number(v);
		if (!Number.isFinite(n)) return value;
		if (/[eE]/.test(v)) return n;
		// Plain decimal/integer: only convert when the number prints back to the same digits
		// (ignoring trailing fraction zeros). Long IDs ("9007199254740993") and 17+ digit
		// decimals would otherwise silently change.
		const canonical = v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
		if (String(n) === canonical) return n;
	}
	return value;
}

function csvCell(value: unknown): Cell {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
	return JSON.stringify(value);
}

export interface JsonToCsvResult {
	/** Headers before the column layout is applied (feeds the column editor). */
	sourceHeaders: string[];
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
	/** Select / reorder / rename columns. */
	columns?: ColumnSpec[];
	/** Keep at most this many records (0 / undefined = all). */
	maxRecords?: number;
}

// CSV is inherently tabular: an array of objects becomes one row per object (nested
// objects flattened with dot-notation keys; arrays kept as a stringified cell since a
// single CSV cell can't represent a list); a single object becomes one row.
export function jsonToCsv(json: unknown, options: JsonToCsvOptions): JsonToCsvResult {
	const empty: JsonToCsvResult = { sourceHeaders: [], output: '', rootError: false, previewHeaders: [], previewRows: [], warnings: [] };
	let rows: Record<string, unknown>[];
	const collisions: string[] = [];
	const flatten = (item: Record<string, unknown>) => {
		const r = flattenObject(item);
		collisions.push(...r.collisions);
		return r.flat;
	};
	if (Array.isArray(json)) {
		if (json.length === 0) return empty;
		const limit = Math.floor(options.maxRecords ?? 0);
		rows = (limit > 0 ? json.slice(0, limit) : json).map((item) => {
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
	const layout = resolveColumns(fields, options.columns);
	const outFields = layout.map((c) => c.name);
	const data = rows.map((row) => layout.map((c) => csvCell(row[c.source])));
	const output = Papa.unparse(
		{ fields: outFields, data },
		{ delimiter: options.delimiter, header: options.header, escapeFormulae: options.escapeFormulae },
	);
	return {
		sourceHeaders: fields,
		output,
		rootError: false,
		previewHeaders: outFields,
		previewRows: data.map((r) => r.map((c) => (c === undefined || c === null ? '' : String(c)))),
		warnings: Array.from(new Set(collisions)),
	};
}

export type OutputFormat = 'objects' | 'jsonl' | 'keyed' | 'arrays' | 'columns' | 'sql' | 'yaml' | 'markdown' | 'html' | 'xml';

export interface ColumnSpec {
	/** Header name in the source data. */
	source: string;
	/** Output name (empty = keep the source name). */
	name: string;
	include: boolean;
}

export interface ResolvedColumn {
	source: string;
	name: string;
}

/**
 * Applies a user column layout (order, include flag, rename) to the source headers. Columns missing
 * from the spec (a new file with extra columns) are appended and included; unknown spec entries are
 * ignored; clashing output names get a " (2)" suffix.
 */
export function resolveColumns(sourceHeaders: string[], spec?: ColumnSpec[]): ResolvedColumn[] {
	let list: ResolvedColumn[];
	if (!spec || spec.length === 0) {
		list = sourceHeaders.map((h) => ({ source: h, name: h }));
	} else {
		const known = new Set(sourceHeaders);
		const seen = new Set<string>();
		list = [];
		for (const c of spec) {
			if (!known.has(c.source) || seen.has(c.source)) continue;
			seen.add(c.source);
			if (c.include) list.push({ source: c.source, name: c.name.trim() === '' ? c.source : c.name });
		}
		for (const h of sourceHeaders) if (!seen.has(h)) list.push({ source: h, name: h });
	}
	const used = new Set<string>();
	return list.map((c) => {
		let name = c.name;
		let n = 2;
		while (used.has(name)) name = `${c.name} (${n++})`;
		used.add(name);
		return { source: c.source, name };
	});
}

/** Keeps the user's column config in step with the headers of the data currently loaded. */
export function mergeColumnSpec(previous: ColumnSpec[], sourceHeaders: string[]): ColumnSpec[] {
	const known = new Set(sourceHeaders);
	const kept = previous.filter((c) => known.has(c.source));
	const have = new Set(kept.map((c) => c.source));
	for (const h of sourceHeaders) if (!have.has(h)) kept.push({ source: h, name: h, include: true });
	return kept;
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
	/** Output shape/format. Default `objects` (the original array-of-objects JSON). */
	format?: OutputFormat;
	/** Trim whitespace around every field and header. */
	trim?: boolean;
	/** Omit fields whose value is an empty string (objects / jsonl / keyed / yaml / xml only). */
	skipEmptyFields?: boolean;
	/** Ignore this many lines at the top of the text (e.g. a preamble before the header). */
	skipLines?: number;
	/** Keep at most this many records (0 / undefined = all). */
	maxRecords?: number;
	/** Swap rows and columns before converting. */
	transpose?: boolean;
	columns?: ColumnSpec[];
	sql?: SqlOptions;
	xml?: XmlOptions;
}

export interface CsvToJsonResult {
	output: string;
	error: { line: number; message: string } | null;
	warnings: CsvWarning[];
	/** Dot-notation keys that clashed when building nested objects. */
	collisions: string[];
	/** Key values repeated in the first column ("keyed" format); later rows replaced earlier ones. */
	duplicateKeys: string[];
	/** Headers of the parsed data before the column layout is applied (feeds the column editor). */
	sourceHeaders: string[];
	previewHeaders: string[];
	previewRows: string[][];
	/** Records dropped by `maxRecords`. */
	truncated: number;
}

const WARNING_ERROR_CODES = new Set(['TooFewFields', 'TooManyFields', 'UndetectableDelimiter']);

function lineOfIndex(text: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line += 1;
	return line;
}

/** Removes the first `count` lines (any of \n, \r\n, \r) from the text. */
export function dropLines(text: string, count: number): string {
	let pos = 0;
	for (let i = 0; i < count && pos < text.length; i++) {
		const nl = text.slice(pos).search(/\r\n|\n|\r/);
		if (nl === -1) return '';
		pos += nl + (text.startsWith('\r\n', pos + nl) ? 2 : 1);
	}
	return text.slice(pos);
}

function emptyResult(extra: Partial<CsvToJsonResult>): CsvToJsonResult {
	return {
		output: '',
		error: null,
		warnings: [],
		collisions: [],
		duplicateKeys: [],
		sourceHeaders: [],
		previewHeaders: [],
		previewRows: [],
		truncated: 0,
		...extra,
	};
}

export function csvToJson(csv: string, options: CsvToJsonOptions): CsvToJsonResult {
	const { delimiter, header, nested, pretty, typed } = options;
	const format = options.format ?? 'objects';
	const skipLines = Math.max(0, Math.floor(options.skipLines ?? 0));
	let text = skipLines > 0 ? dropLines(csv, skipLines) : csv;
	let lineOffset = skipLines;

	if (options.transpose) {
		const matrix = Papa.parse<string[]>(text, { delimiter, header: false, skipEmptyLines: true }).data;
		const width = matrix.reduce((max, r) => Math.max(max, r.length), 0);
		const flipped = Array.from({ length: width }, (_, c) => matrix.map((r) => r[c] ?? ''));
		text = Papa.unparse(flipped, { delimiter, newline: '\n' });
		lineOffset = 0;
	}

	const trim = options.trim === true;
	const result = Papa.parse<Record<string, string> | string[]>(text, {
		delimiter,
		header,
		skipEmptyLines: true,
		dynamicTyping: false,
		...(trim ? { transform: (v: string) => v.trim(), transformHeader: (h: string) => h.trim() } : {}),
	});

	if (header) {
		// Papa stores overflow fields under an internal key; expose a clear name instead.
		for (const row of result.data as Record<string, unknown>[]) {
			if (row && Object.prototype.hasOwnProperty.call(row, '__parsed_extra')) {
				row['_extra'] = row['__parsed_extra'];
				delete row['__parsed_extra'];
			}
		}
	}

	const warnings: CsvWarning[] = [];
	let error: { line: number; message: string } | null = null;
	for (const e of result.errors) {
		// Real line in the file: prefer the character offset Papa reports; otherwise
		// fall back to the data-row index (+1 for the header row, +1 for 1-based lines).
		const line =
			(typeof e.index === 'number' && e.type !== 'FieldMismatch' ? lineOfIndex(text, e.index) : (e.row ?? 0) + (header ? 2 : 1)) + lineOffset;
		if (WARNING_ERROR_CODES.has(e.code)) {
			warnings.push({ line, message: e.message });
		} else if (error === null) {
			error = { line, message: e.message };
		}
	}
	if (error) return emptyResult({ error, warnings });

	// ---- records (string values), headers, record limit ----
	let sourceHeaders: string[];
	let records: Record<string, unknown>[];
	if (header) {
		sourceHeaders = result.meta.fields ?? [];
		records = result.data as unknown as Record<string, unknown>[];
	} else {
		const rawRows = result.data as string[][];
		const width = rawRows.reduce((max, r) => Math.max(max, r.length), 0);
		sourceHeaders = Array.from({ length: width }, (_, i) => `column${i + 1}`);
		records = rawRows.map((row) => {
			const obj = newRecord();
			row.forEach((cell, i) => {
				obj[`column${i + 1}`] = cell;
			});
			return obj;
		});
	}
	let truncated = 0;
	const limit = Math.floor(options.maxRecords ?? 0);
	if (limit > 0 && records.length > limit) {
		truncated = records.length - limit;
		records = records.slice(0, limit);
	}

	// ---- column layout (select / reorder / rename) ----
	const layout = resolveColumns(sourceHeaders, options.columns);
	const customLayout = Boolean(options.columns && options.columns.length > 0);
	const previewHeaders = layout.map((c) => c.name);
	const rawRows: Record<string, unknown>[] = records.map((row) => {
		const out = newRecord();
		if (!customLayout) {
			// Default layout keeps every key Papa produced (including the `_extra` overflow column).
			for (const key of Object.keys(row)) out[key] = row[key];
			return out;
		}
		for (const c of layout) out[c.name] = row[c.source];
		return out;
	});
	const previewRows = rawRows.map((row) => previewHeaders.map((h) => String(row[h] ?? '')));

	// ---- typed conversion ----
	const convert = (value: unknown): unknown => (typed && typeof value === 'string' ? convertTypedValue(value) : value);
	const typedRows: Row[] = rawRows.map((row) => {
		const typedRow = newRecord();
		for (const key of Object.keys(row)) typedRow[key] = convert(row[key]);
		return typedRow;
	});
	const skipEmpty = options.skipEmptyFields === true;
	const compact = (row: Row): Row => {
		if (!skipEmpty) return row;
		const out = newRecord();
		for (const key of Object.keys(row)) if (row[key] !== '') out[key] = row[key];
		return out;
	};
	const collisions: string[] = [];
	const shape = (row: Row): unknown => {
		const base = compact(row);
		if (!nested) return base;
		const u = unflattenObject(base);
		collisions.push(...u.collisions);
		return u.value;
	};

	let output: string;
	let duplicateKeys: string[] = [];
	switch (format) {
		case 'jsonl':
			output = toJsonLines(typedRows.map((r) => shape(r) as Row));
			break;
		case 'keyed': {
			const keyed = toKeyedObject(previewHeaders, typedRows, pretty, shape);
			output = keyed.output;
			duplicateKeys = keyed.duplicateKeys;
			break;
		}
		case 'arrays':
			output = toArrayOfArrays(previewHeaders, typedRows, header, pretty);
			break;
		case 'columns':
			output = toColumnArrays(previewHeaders, typedRows, pretty);
			break;
		case 'sql':
			output = toSqlInserts(previewHeaders, typedRows, options.sql ?? { dialect: 'mysql', table: 'my_table' });
			break;
		case 'yaml':
			output = toYaml(typedRows.map((r) => shape(r) as Row));
			break;
		case 'markdown':
			output = toMarkdownTable(previewHeaders, typedRows);
			break;
		case 'html':
			output = toHtmlTable(previewHeaders, typedRows);
			break;
		case 'xml':
			output = toXml(typedRows.map((r) => shape(r) as Row), options.xml);
			break;
		default:
			output = JSON.stringify(
				typedRows.map((r) => shape(r)),
				null,
				pretty ? 2 : undefined,
			);
	}

	return {
		output,
		error: null,
		warnings,
		collisions: Array.from(new Set(collisions)),
		duplicateKeys,
		sourceHeaders,
		previewHeaders,
		previewRows,
		truncated,
	};
}

/** Parses JSON, or JSON Lines / NDJSON (one value per line) when the text is not a single JSON value. */
export function parseJsonOrJsonl(text: string): { value: unknown; jsonl: boolean } {
	try {
		return { value: JSON.parse(text), jsonl: false };
	} catch (original) {
		const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
		if (lines.length < 2) throw original;
		try {
			return { value: lines.map((l) => JSON.parse(l) as unknown), jsonl: true };
		} catch {
			throw original;
		}
	}
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
