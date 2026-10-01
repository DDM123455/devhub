// Pure JSON -> worksheet-model helpers for the JSON to Excel converter (no DOM).

import { flattenObject } from './csv-json';

export const EXCEL_MAX_CELL_CHARS = 32767;
export const EXCEL_MAX_ROWS = 1048576; // including the header row
export const EXCEL_MAX_COLS = 16384;

export interface Sheet {
	name: string;
	headers: string[];
	/** Cell values aligned with `headers`. */
	rows: unknown[][];
	/** Set when the sheet came from unwrapping a single array key of the root object. */
	sourceKey?: string;
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

function rowsFromArray(
	items: unknown[],
	flatten: boolean,
	stats: BuildStats,
): { headers: string[]; rows: unknown[][] } {
	const records = items.map((item) => {
		let raw: Record<string, unknown>;
		if (isPlainObject(item)) {
			if (flatten) {
				raw = flattenObject(item).flat;
			} else {
				raw = newRecord();
				for (const key of Object.keys(item)) raw[key] = item[key];
			}
		} else {
			raw = newRecord();
			raw.value = item;
		}
		return raw;
	});
	const seen = new Set<string>();
	const headers: string[] = [];
	for (const rec of records) {
		for (const key of Object.keys(rec)) {
			if (!seen.has(key)) {
				seen.add(key);
				headers.push(key);
			}
		}
	}
	const rows = records.map((rec) => headers.map((h) => toCell(Object.prototype.hasOwnProperty.call(rec, h) ? rec[h] : undefined, stats)));
	return { headers, rows };
}

function finalizeSheet(name: string, headers: string[], rows: unknown[][], stats: BuildStats, sourceKey?: string): Sheet {
	let h = headers;
	let r = rows;
	if (h.length > EXCEL_MAX_COLS) {
		stats.colLimitSheets.push(name);
		h = h.slice(0, EXCEL_MAX_COLS);
		r = r.map((row) => row.slice(0, EXCEL_MAX_COLS));
	}
	if (r.length > EXCEL_MAX_ROWS - 1) {
		stats.rowLimitSheets.push(name);
		r = r.slice(0, EXCEL_MAX_ROWS - 1);
	}
	return { name, headers: h, rows: r, sourceKey };
}

export interface BuildOptions {
	sheetName: string;
	flatten: boolean;
	/** Use the array inside `{ "users": [...] }` instead of exporting the wrapper object as one row. */
	unwrap: boolean;
}

export function buildSheets(json: unknown, options: BuildOptions): BuildResult | null {
	const stats: BuildStats = { truncatedCells: 0, unsafeIntegers: 0, rowLimitSheets: [], colLimitSheets: [], renamedSheets: [] };
	const used = new Set<string>();
	const { sheetName, flatten, unwrap } = options;

	if (Array.isArray(json)) {
		const { headers, rows } = rowsFromArray(json, flatten, stats);
		return { sheets: [finalizeSheet(nameSheet(sheetName, used, stats), headers, rows, stats)], stats };
	}

	if (isPlainObject(json)) {
		const entries = Object.keys(json).map((key) => [key, json[key]] as const);
		const arrayEntries = entries.filter(([, value]) => Array.isArray(value));
		const allArrays = entries.length > 1 && arrayEntries.length === entries.length;
		if (allArrays) {
			return {
				sheets: entries.map(([key, value]) => {
					const { headers, rows } = rowsFromArray(value as unknown[], flatten, stats);
					return finalizeSheet(nameSheet(key, used, stats), headers, rows, stats);
				}),
				stats,
			};
		}
		if (unwrap && arrayEntries.length === 1) {
			const [key, value] = arrayEntries[0];
			const items = value as unknown[];
			if (entries.length === 1 || (items.length > 0 && items.every(isPlainObject))) {
				const { headers, rows } = rowsFromArray(items, flatten, stats);
				return { sheets: [finalizeSheet(nameSheet(key, used, stats), headers, rows, stats, key)], stats };
			}
		}
		const { headers, rows } = rowsFromArray([json], flatten, stats);
		return { sheets: [finalizeSheet(nameSheet(sheetName, used, stats), headers, rows, stats)], stats };
	}

	return null;
}

/** Windows/macOS-safe download file name without the .xlsx extension handling (caller appends it). */
export function sanitizeFileName(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
		.trim()
		.replace(/[. ]+$/, '');
	return cleaned || 'output';
}
