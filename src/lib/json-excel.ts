// Pure JSON -> worksheet-model helpers for the JSON to Excel converter (no DOM).

import Papa from 'papaparse';
import { flattenObject, resolveColumns, type ColumnSpec } from './csv-json';

export const EXCEL_MAX_CELL_CHARS = 32767;
export const EXCEL_MAX_ROWS = 1048576; // including the header row
export const EXCEL_MAX_COLS = 16384;

/** Excel number formats used for converted dates. */
export const DATE_FORMAT = 'yyyy-mm-dd';
export const DATETIME_FORMAT = 'yyyy-mm-dd hh:mm:ss';

export const ROW_ID_HEADER = '_row_id';
export const PARENT_ROW_ID_HEADER = '_parent_row_id';

export interface Sheet {
	name: string;
	headers: string[];
	/** Cell values aligned with `headers` (strings, numbers, booleans or Date objects). */
	rows: unknown[][];
	/** Set when the sheet came from unwrapping a single array key of the root object. */
	sourceKey?: string;
	/** Excel number format per column (set for columns holding converted dates). */
	columnFormats?: (string | undefined)[];
}

export interface BuildStats {
	truncatedCells: number;
	unsafeIntegers: number;
	/** Names of sheets that exceeded the Excel row limit (rows beyond it are dropped). */
	rowLimitSheets: string[];
	/** Names of sheets that exceeded the Excel column limit (columns beyond it are dropped). */
	colLimitSheets: string[];
	/** Sheets whose name had to change for Excel ("original → final"). */
	renamedSheets: string[];
	/** Cells converted to real Excel dates. */
	dateCells: number;
}

export interface BuildResult {
	sheets: Sheet[];
	stats: BuildStats;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function newRecord(): Record<string, unknown> {
	return Object.create(null) as Record<string, unknown>;
}

// Excel forbids \ / ? * [ ] : in sheet names, names starting/ending with an
// apostrophe, names over 31 chars, and the reserved name "History".
export function sanitizeSheetName(name: string): string {
	let cleaned = name.replace(/[\\/?*[\]:]/g, '_').trim();
	cleaned = cleaned.replace(/^'+/, '').replace(/'+$/, '').trim();
	cleaned = cleaned.slice(0, 31).replace(/'+$/, '').trim();
	if (cleaned === '') cleaned = 'Sheet1';
	if (cleaned.toLowerCase() === 'history') cleaned = `${cleaned.slice(0, 30)}_`;
	return cleaned;
}

/** Case-insensitive unique sheet name (Excel treats "Data" and "data" as the same sheet). */
export function uniqueSheetName(base: string, used: Set<string>): string {
	const clean = sanitizeSheetName(base);
	let candidate = clean;
	let i = 2;
	while (used.has(candidate.toLowerCase())) {
		const suffix = ` (${i})`;
		candidate = sanitizeSheetName(clean.slice(0, 31 - suffix.length) + suffix);
		i++;
	}
	used.add(candidate.toLowerCase());
	return candidate;
}

function nameSheet(base: string, used: Set<string>, stats: BuildStats): string {
	const name = uniqueSheetName(base, used);
	if (name !== base.trim() && base !== '') stats.renamedSheets.push(`${base} → ${name}`);
	return name;
}

function toCell(value: unknown, stats: BuildStats): unknown {
	if (value === undefined || value === null) return '';
	let cell: unknown = value;
	if (typeof value === 'object') cell = JSON.stringify(value);
	if (typeof cell === 'string' && cell.length > EXCEL_MAX_CELL_CHARS) {
		stats.truncatedCells += 1;
		return cell.slice(0, EXCEL_MAX_CELL_CHARS);
	}
	if (typeof cell === 'number' && Number.isInteger(cell) && !Number.isSafeInteger(cell)) stats.unsafeIntegers += 1;
	return cell;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Parses a strict ISO-8601 date / date-time string. Date-times without an offset are read as UTC so the
 * result never depends on the visitor's time zone. Returns null for anything else (including 2024-02-31).
 */
export function parseIsoDate(value: string): Date | null {
	const m = ISO_RE.exec(value);
	if (!m) return null;
	const [, ys, mos, ds, hs, mis, ss, frac, tz] = m;
	const year = Number(ys);
	const month = Number(mos);
	const day = Number(ds);
	const hour = hs === undefined ? 0 : Number(hs);
	const minute = mis === undefined ? 0 : Number(mis);
	const second = ss === undefined ? 0 : Number(ss);
	if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
	const ms = frac ? Number(`0.${frac}`.slice(0, 5)) * 1000 : 0;
	const base = Date.UTC(year, month - 1, day, hour, minute, second, Math.round(ms));
	const check = new Date(base);
	if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
	let offsetMinutes = 0;
	if (tz && tz !== 'Z') {
		const sign = tz[0] === '-' ? -1 : 1;
		const digits = tz.slice(1).replace(':', '');
		const oh = Number(digits.slice(0, 2));
		const om = Number(digits.slice(2, 4));
		if (oh > 23 || om > 59) return null;
		offsetMinutes = sign * (oh * 60 + om);
	}
	const date = new Date(base - offsetMinutes * 60000);
	return Number.isNaN(date.getTime()) ? null : date;
}

export type EpochMode = 'off' | 'seconds' | 'milliseconds';

// 1980-01-01 .. 2100-01-01
const EPOCH_MIN_S = 315532800;
const EPOCH_MAX_S = 4102444800;
const DATE_LIKE_HEADER = /(date|time|stamp|_at$|At$|created|updated|modified|expire|^ts$|_ts$)/i;

function isMidnightUtc(d: Date): boolean {
	return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

interface DateOptions {
	isoDates: boolean;
	epoch: EpochMode;
}

/** Converts date-like cells in place (per column) and returns the Excel number format of each column. */
function convertDateColumns(headers: string[], rows: unknown[][], options: DateOptions, stats: BuildStats): (string | undefined)[] {
	const formats: (string | undefined)[] = headers.map(() => undefined);
	if (!options.isoDates && options.epoch === 'off') return formats;
	headers.forEach((header, c) => {
		let epochColumn = false;
		if (options.epoch !== 'off' && DATE_LIKE_HEADER.test(header)) {
			const factor = options.epoch === 'milliseconds' ? 1000 : 1;
			let numeric = 0;
			let valid = true;
			for (const row of rows) {
				const v = row[c];
				if (v === '' || v === undefined) continue;
				if (typeof v === 'number' && Number.isInteger(v) && v / factor >= EPOCH_MIN_S && v / factor <= EPOCH_MAX_S) numeric += 1;
				else {
					valid = false;
					break;
				}
			}
			epochColumn = valid && numeric > 0;
		}
		let hasDate = false;
		let allMidnight = true;
		for (const row of rows) {
			const v = row[c];
			let date: Date | null = null;
			if (typeof v === 'string' && options.isoDates) date = parseIsoDate(v.trim());
			else if (epochColumn && typeof v === 'number') date = new Date(options.epoch === 'milliseconds' ? v : v * 1000);
			if (date) {
				row[c] = date;
				hasDate = true;
				stats.dateCells += 1;
				if (!isMidnightUtc(date)) allMidnight = false;
			}
		}
		if (hasDate) formats[c] = allMidnight ? DATE_FORMAT : DATETIME_FORMAT;
	});
	return formats;
}

// ---------------------------------------------------------------------------
// Sheet building
// ---------------------------------------------------------------------------
export type ArrayMode = 'json' | 'detail' | 'join';

export interface BuildOptions {
	sheetName: string;
	flatten: boolean;
	/** Use the array inside `{ "users": [...] }` instead of exporting the wrapper object as one row. */
	unwrap: boolean;
	/**
	 * What to do with arrays inside a record: keep them as JSON text (default), move them to a detail
	 * sheet linked to the parent row by id, or join scalar arrays into one text cell.
	 */
	arrayMode?: ArrayMode;
	/** Separator for `arrayMode: 'join'` (default ", "). */
	joinSeparator?: string;
	/** Turn ISO-8601 strings into real Excel dates (opt-in). */
	isoDates?: boolean;
	/** Turn integer epoch timestamps in date-like columns into Excel dates (opt-in). */
	epoch?: EpochMode;
}

interface Ctx {
	options: BuildOptions;
	stats: BuildStats;
	used: Set<string>;
}

interface DetailBucket {
	field: string;
	entries: { parent: number; item: unknown }[];
}

function isScalar(v: unknown): boolean {
	return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function uniqueHeader(base: string, taken: Set<string>): string {
	let name = base;
	while (taken.has(name)) name = `_${name}`;
	return name;
}

function recordFor(item: unknown, flatten: boolean): Record<string, unknown> {
	if (isPlainObject(item)) {
		if (flatten) return flattenObject(item).flat;
		const raw = newRecord();
		for (const key of Object.keys(item)) raw[key] = item[key];
		return raw;
	}
	const raw = newRecord();
	raw.value = item;
	return raw;
}

function tabulate(records: Record<string, unknown>[], stats: BuildStats, leading: string[] = [], leadingValues?: unknown[][]) {
	const seen = new Set<string>(leading);
	const headers: string[] = [...leading];
	for (const rec of records) {
		for (const key of Object.keys(rec)) {
			if (!seen.has(key)) {
				seen.add(key);
				headers.push(key);
			}
		}
	}
	const rows = records.map((rec, i) => [
		...(leadingValues ? leadingValues[i] : []),
		...headers.slice(leading.length).map((h) => toCell(Object.prototype.hasOwnProperty.call(rec, h) ? rec[h] : undefined, stats)),
	]);
	return { headers, rows };
}

function finalizeSheet(name: string, headers: string[], rows: unknown[][], formats: (string | undefined)[], stats: BuildStats, sourceKey?: string): Sheet {
	let h = headers;
	let r = rows;
	let f = formats;
	if (h.length > EXCEL_MAX_COLS) {
		stats.colLimitSheets.push(name);
		h = h.slice(0, EXCEL_MAX_COLS);
		f = f.slice(0, EXCEL_MAX_COLS);
		r = r.map((row) => row.slice(0, EXCEL_MAX_COLS));
	}
	if (r.length > EXCEL_MAX_ROWS - 1) {
		stats.rowLimitSheets.push(name);
		r = r.slice(0, EXCEL_MAX_ROWS - 1);
	}
	const sheet: Sheet = { name, headers: h, rows: r, sourceKey };
	if (f.some((x) => x !== undefined)) sheet.columnFormats = f;
	return sheet;
}

/** One array of items -> the main sheet plus (in `detail` mode) one linked sheet per array field. */
function buildFromArray(baseName: string, items: unknown[], ctx: Ctx, sourceKey?: string): Sheet[] {
	const { options, stats, used } = ctx;
	const arrayMode = options.arrayMode ?? 'json';
	const separator = options.joinSeparator ?? ', ';
	const dateOptions: DateOptions = { isoDates: options.isoDates === true, epoch: options.epoch ?? 'off' };

	const buckets = new Map<string, DetailBucket>();
	const records = items.map((item, index) => {
		const rec = recordFor(item, options.flatten);
		for (const key of Object.keys(rec)) {
			const value = rec[key];
			if (!Array.isArray(value)) continue;
			if (arrayMode === 'join' && value.every(isScalar)) {
				rec[key] = value.map((v) => (v === null ? '' : String(v))).join(separator);
			} else if (arrayMode === 'detail' && value.length > 0) {
				let bucket = buckets.get(key);
				if (!bucket) {
					bucket = { field: key, entries: [] };
					buckets.set(key, bucket);
				}
				for (const element of value) bucket.entries.push({ parent: index + 1, item: element });
				delete rec[key];
			} else if (arrayMode === 'detail') {
				delete rec[key];
			}
		}
		return rec;
	});

	let main: { headers: string[]; rows: unknown[][] };
	if (buckets.size > 0) {
		const allKeys = new Set<string>();
		for (const rec of records) for (const k of Object.keys(rec)) allKeys.add(k);
		const idHeader = uniqueHeader(ROW_ID_HEADER, allKeys);
		main = tabulate(records, stats, [idHeader], records.map((_, i) => [i + 1]));
	} else {
		main = tabulate(records, stats);
	}
	const mainFormats = convertDateColumns(main.headers, main.rows, dateOptions, stats);
	const mainName = nameSheet(baseName, used, stats);
	const sheets: Sheet[] = [finalizeSheet(mainName, main.headers, main.rows, mainFormats, stats, sourceKey)];

	for (const bucket of buckets.values()) {
		const detailRecords = bucket.entries.map((e) => recordFor(e.item, options.flatten));
		const taken = new Set<string>();
		for (const rec of detailRecords) for (const k of Object.keys(rec)) taken.add(k);
		const parentHeader = uniqueHeader(PARENT_ROW_ID_HEADER, taken);
		const detail = tabulate(detailRecords, stats, [parentHeader], bucket.entries.map((e) => [e.parent]));
		const formats = convertDateColumns(detail.headers, detail.rows, dateOptions, stats);
		const name = nameSheet(`${mainName}.${bucket.field}`, used, stats);
		sheets.push(finalizeSheet(name, detail.headers, detail.rows, formats, stats));
	}
	return sheets;
}

export function buildSheets(json: unknown, options: BuildOptions): BuildResult | null {
	const stats: BuildStats = { truncatedCells: 0, unsafeIntegers: 0, rowLimitSheets: [], colLimitSheets: [], renamedSheets: [], dateCells: 0 };
	const used = new Set<string>();
	const ctx: Ctx = { options, stats, used };
	const { sheetName, unwrap } = options;

	if (Array.isArray(json)) {
		return { sheets: buildFromArray(sheetName, json, ctx), stats };
	}

	if (isPlainObject(json)) {
		const entries = Object.keys(json).map((key) => [key, json[key]] as const);
		const arrayEntries = entries.filter(([, value]) => Array.isArray(value));
		const allArrays = entries.length > 1 && arrayEntries.length === entries.length;
		if (allArrays) {
			return {
				sheets: entries.flatMap(([key, value]) => buildFromArray(key, value as unknown[], ctx)),
				stats,
			};
		}
		if (unwrap && arrayEntries.length === 1) {
			const [key, value] = arrayEntries[0];
			const items = value as unknown[];
			if (entries.length === 1 || (items.length > 0 && items.every(isPlainObject))) {
				return { sheets: buildFromArray(key, items, ctx, key), stats };
			}
		}
		return { sheets: buildFromArray(sheetName, [json], ctx), stats };
	}

	return null;
}

// ---------------------------------------------------------------------------
// Column layout (select / reorder / rename) and CSV export
// ---------------------------------------------------------------------------
export function isCustomLayout(headers: string[], spec: ColumnSpec[] | undefined): boolean {
	if (!spec || spec.length === 0) return false;
	return spec.some((c, i) => !c.include || (c.name.trim() !== '' && c.name !== c.source) || c.source !== headers[i]);
}

/** Applies the user's column layout to a built sheet. Returns the sheet untouched when nothing changed. */
export function applySheetLayout(sheet: Sheet, spec: ColumnSpec[] | undefined): Sheet {
	if (!isCustomLayout(sheet.headers, spec)) return sheet;
	const layout = resolveColumns(sheet.headers, spec);
	const index = new Map(sheet.headers.map((h, i) => [h, i] as const));
	const picks = layout.map((c) => index.get(c.source) ?? -1);
	const out: Sheet = {
		...sheet,
		headers: layout.map((c) => c.name),
		rows: sheet.rows.map((row) => picks.map((i) => (i >= 0 ? row[i] : ''))),
	};
	if (sheet.columnFormats) out.columnFormats = picks.map((i) => (i >= 0 ? sheet.columnFormats?.[i] : undefined));
	return out;
}

function csvValue(value: unknown, format: string | undefined): string | number | boolean {
	if (value instanceof Date) {
		const iso = value.toISOString();
		return format === DATE_FORMAT ? iso.slice(0, 10) : iso;
	}
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	return value === undefined || value === null ? '' : String(value);
}

export interface CsvExportOptions {
	delimiter?: string;
	escapeFormulae?: boolean;
}

/** CSV text of one sheet (dates as ISO text). Same data as the .xlsx, no extra conversion path. */
export function sheetToCsv(sheet: Sheet, options: CsvExportOptions = {}): string {
	const data = sheet.rows.map((row) => row.map((cell, c) => csvValue(cell, sheet.columnFormats?.[c])));
	return Papa.unparse(
		{ fields: sheet.headers, data },
		{ delimiter: options.delimiter ?? ',', header: true, escapeFormulae: options.escapeFormulae ?? true },
	);
}

/** Windows/macOS-safe download file name without the .xlsx extension handling (caller appends it). */
export function sanitizeFileName(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
		.trim()
		.replace(/[. ]+$/, '');
	return cleaned || 'output';
}
