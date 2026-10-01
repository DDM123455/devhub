// Output formatters for the CSV/JSON converter: SQL INSERT, YAML, Markdown, HTML, XML and the
// alternative JSON shapes. Pure functions over already-typed rows (no DOM, unit-testable).

export type Row = Record<string, unknown>;

export type SqlDialect = 'mysql' | 'postgres' | 'sqlite' | 'mssql';

export interface SqlOptions {
	dialect: SqlDialect;
	table: string;
	/** Rows per INSERT statement (default 500; SQL Server allows at most 1000). */
	batchSize?: number;
}

export interface XmlOptions {
	root?: string;
	item?: string;
}

// ---------------------------------------------------------------------------
// JSON shapes
// ---------------------------------------------------------------------------
export function toJsonLines(rows: Row[]): string {
	return rows.map((r) => JSON.stringify(r)).join('\n');
}

/** Array of arrays with one row per line, even in pretty mode (readable, still valid JSON). */
export function toArrayOfArrays(headers: string[], rows: Row[], includeHeader: boolean, pretty: boolean): string {
	const matrix: unknown[][] = rows.map((r) => headers.map((h) => (r[h] === undefined ? null : r[h])));
	if (includeHeader) matrix.unshift(headers);
	if (!pretty) return JSON.stringify(matrix);
	if (matrix.length === 0) return '[]';
	return `[\n${matrix.map((line) => `  ${JSON.stringify(line)}`).join(',\n')}\n]`;
}

export function toColumnArrays(headers: string[], rows: Row[], pretty: boolean): string {
	const out = Object.create(null) as Record<string, unknown[]>;
	for (const h of headers) out[h] = rows.map((r) => (r[h] === undefined ? null : r[h]));
	return JSON.stringify(out, null, pretty ? 2 : undefined);
}

export interface KeyedResult {
	output: string;
	/** Key values that appeared more than once (the later row replaced the earlier one). */
	duplicateKeys: string[];
}

/** First column becomes the object key; the remaining columns become the value. */
export function toKeyedObject(headers: string[], rows: Row[], pretty: boolean, shape: (row: Row) => unknown): KeyedResult {
	const out = Object.create(null) as Record<string, unknown>;
	const duplicates = new Set<string>();
	const keyHeader = headers[0];
	if (keyHeader === undefined) return { output: '{}', duplicateKeys: [] };
	for (const row of rows) {
		const key = String(row[keyHeader] ?? '');
		const rest: Row = Object.create(null);
		for (const h of headers.slice(1)) if (row[h] !== undefined) rest[h] = row[h];
		if (Object.prototype.hasOwnProperty.call(out, key)) duplicates.add(key);
		out[key] = shape(rest);
	}
	return { output: JSON.stringify(out, null, pretty ? 2 : undefined), duplicateKeys: [...duplicates] };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
export function quoteIdentifier(dialect: SqlDialect, name: string): string {
	const clean = name.replace(/\u0000/g, '');
	switch (dialect) {
		case 'mysql':
			return `\`${clean.replace(/`/g, '``')}\``;
		case 'mssql':
			return `[${clean.replace(/\]/g, ']]')}]`;
		default:
			return `"${clean.replace(/"/g, '""')}"`;
	}
}

export function sqlString(dialect: SqlDialect, value: string): string {
	let escaped = value.replace(/\u0000/g, '').replace(/'/g, "''");
	if (dialect === 'mysql') escaped = escaped.replace(/\\/g, '\\\\');
	// eslint-disable-next-line no-control-regex
	const nonAscii = /[^\u0000-\u007f]/.test(escaped);
	return `${dialect === 'mssql' && nonAscii ? 'N' : ''}'${escaped}'`;
}

export function sqlLiteral(dialect: SqlDialect, value: unknown): string {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'boolean') {
		if (dialect === 'mysql' || dialect === 'postgres') return value ? 'TRUE' : 'FALSE';
		return value ? '1' : '0';
	}
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
	if (typeof value === 'string') return sqlString(dialect, value);
	return sqlString(dialect, JSON.stringify(value));
}

function quoteTable(dialect: SqlDialect, table: string): string {
	const parts = table
		.split('.')
		.map((p) => p.trim())
		.filter((p) => p !== '');
	if (parts.length === 0) parts.push('my_table');
	return parts.map((p) => quoteIdentifier(dialect, p)).join('.');
}

export function toSqlInserts(headers: string[], rows: Row[], options: SqlOptions): string {
	if (headers.length === 0 || rows.length === 0) return '';
	const { dialect } = options;
	const limit = dialect === 'mssql' ? 1000 : 5000;
	const batch = Math.max(1, Math.min(options.batchSize ?? 500, limit));
	const table = quoteTable(dialect, options.table);
	const columns = headers.map((h, i) => quoteIdentifier(dialect, h === '' ? `column${i + 1}` : h)).join(', ');
	const statements: string[] = [];
	for (let i = 0; i < rows.length; i += batch) {
		const chunk = rows.slice(i, i + batch);
		const values = chunk.map((r) => `  (${headers.map((h) => sqlLiteral(dialect, r[h])).join(', ')})`).join(',\n');
		statements.push(`INSERT INTO ${table} (${columns}) VALUES\n${values};`);
	}
	return statements.join('\n\n');
}

// ---------------------------------------------------------------------------
// YAML (block style; every string that is not obviously plain is double-quoted via JSON rules,
// which is a valid YAML scalar)
// ---------------------------------------------------------------------------
const YAML_RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
const YAML_PLAIN = /^[A-Za-z_][A-Za-z0-9_./-]*(?: [A-Za-z0-9_./-]+)*$/;

function yamlScalar(value: unknown): string {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
	const s = String(value);
	if (s !== '' && YAML_PLAIN.test(s) && !YAML_RESERVED.test(s)) return s;
	return JSON.stringify(s);
}

function yamlKey(key: string): string {
	return key !== '' && YAML_PLAIN.test(key) && !YAML_RESERVED.test(key) ? key : JSON.stringify(key);
}

function isRecord(v: unknown): v is Row {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function yamlLines(value: unknown, indent: number): string[] {
	const pad = ' '.repeat(indent);
	if (isRecord(value)) {
		const keys = Object.keys(value);
		if (keys.length === 0) return [`${pad}{}`];
		const lines: string[] = [];
		for (const key of keys) {
			const v = value[key];
			if (isRecord(v) && Object.keys(v).length > 0) {
				lines.push(`${pad}${yamlKey(key)}:`, ...yamlLines(v, indent + 2));
			} else if (Array.isArray(v) && v.length > 0) {
				lines.push(`${pad}${yamlKey(key)}:`, ...yamlLines(v, indent + 2));
			} else {
				lines.push(`${pad}${yamlKey(key)}: ${isRecord(v) ? '{}' : Array.isArray(v) ? '[]' : yamlScalar(v)}`);
			}
		}
		return lines;
	}
	if (Array.isArray(value)) {
		const lines: string[] = [];
		for (const item of value) {
			if (isRecord(item) && Object.keys(item).length > 0) {
				const inner = yamlLines(item, indent + 2);
				lines.push(`${pad}- ${inner[0].slice(indent + 2)}`, ...inner.slice(1));
			} else if (Array.isArray(item) && item.length > 0) {
				const inner = yamlLines(item, indent + 2);
				lines.push(`${pad}- ${inner[0].slice(indent + 2)}`, ...inner.slice(1));
			} else {
				lines.push(`${pad}- ${isRecord(item) ? '{}' : Array.isArray(item) ? '[]' : yamlScalar(item)}`);
			}
		}
		return lines;
	}
	return [`${pad}${yamlScalar(value)}`];
}

export function toYaml(rows: Row[]): string {
	if (rows.length === 0) return '[]';
	return yamlLines(rows, 0).join('\n');
}

// ---------------------------------------------------------------------------
// Markdown / HTML tables
// ---------------------------------------------------------------------------
function cellText(value: unknown): string {
	if (value === null || value === undefined) return '';
	return typeof value === 'string' ? value : String(value);
}

export function toMarkdownTable(headers: string[], rows: Row[]): string {
	if (headers.length === 0) return '';
	const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
	const head = `| ${headers.map((h, i) => esc(h === '' ? `column${i + 1}` : h)).join(' | ')} |`;
	const sep = `| ${headers.map(() => '---').join(' | ')} |`;
	const body = rows.map((r) => `| ${headers.map((h) => esc(cellText(r[h]))).join(' | ')} |`);
	return [head, sep, ...body].join('\n');
}

export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function toHtmlTable(headers: string[], rows: Row[]): string {
	if (headers.length === 0) return '';
	const th = headers.map((h, i) => `      <th>${escapeHtml(h === '' ? `column${i + 1}` : h)}</th>`).join('\n');
	const body = rows
		.map((r) => `    <tr>\n${headers.map((h) => `      <td>${escapeHtml(cellText(r[h]))}</td>`).join('\n')}\n    </tr>`)
		.join('\n');
	return `<table>\n  <thead>\n    <tr>\n${th}\n    </tr>\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>`;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-control-regex
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(s: string): string {
	return s.replace(XML_INVALID_CHARS, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function xmlName(raw: string, fallback = 'field'): string {
	let name = raw.replace(/[^A-Za-z0-9_.-]/g, '_');
	if (name === '') name = fallback;
	if (!/^[A-Za-z_]/.test(name)) name = `_${name}`;
	if (/^xml/i.test(name)) name = `_${name}`;
	return name;
}

function xmlNode(name: string, value: unknown, indent: number): string[] {
	const pad = '  '.repeat(indent);
	const tag = xmlName(name);
	if (isRecord(value)) {
		const keys = Object.keys(value);
		if (keys.length === 0) return [`${pad}<${tag}/>`];
		return [`${pad}<${tag}>`, ...keys.flatMap((k) => xmlNode(k, value[k], indent + 1)), `${pad}</${tag}>`];
	}
	if (Array.isArray(value)) {
		return value.flatMap((v) => xmlNode(name, v, indent));
	}
	if (value === null || value === undefined) return [`${pad}<${tag}/>`];
	return [`${pad}<${tag}>${escapeXml(String(value))}</${tag}>`];
}

export function toXml(rows: Row[], options: XmlOptions = {}): string {
	const root = xmlName(options.root ?? 'rows', 'rows');
	const item = xmlName(options.item ?? 'row', 'row');
	const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
	if (rows.length === 0) {
		lines.push(`<${root}/>`);
	} else {
		lines.push(`<${root}>`, ...rows.flatMap((r) => xmlNode(item, r, 1)), `</${root}>`);
	}
	return lines.join('\n');
}
