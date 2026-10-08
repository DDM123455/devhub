// Bọc sql-formatter: cài đặt có kiểm tra, định dạng, và các bước hậu xử lý mà sql-formatter không có
// (dấu phẩy đứng đầu dòng). Thuần JS, chạy được trong Web Worker lẫn test không DOM.

import { format as sqlFormat, type FormatOptionsWithLanguage } from 'sql-formatter';
import { FORMAT_LANGUAGES, isFormatLanguage, type FormatLanguage } from './sql-dialects';
import { syntaxFor, tokenizeSql } from './sql-tokenize';

export type CaseOption = 'upper' | 'lower' | 'preserve';
export type IndentOption = '2' | '4' | 'tab';
export type ParamStyle = 'auto' | 'positional' | 'dollar' | 'colon' | 'at';

export interface FormatSettings {
	language: FormatLanguage;
	indent: IndentOption;
	keywordCase: CaseOption;
	dataTypeCase: CaseOption;
	functionCase: CaseOption;
	indentStyle: 'standard' | 'tabularLeft' | 'tabularRight';
	logicalOperatorNewline: 'before' | 'after';
	expressionWidth: number;
	linesBetweenQueries: number;
	denseOperators: boolean;
	newlineBeforeSemicolon: boolean;
	commaPosition: 'after' | 'before';
	paramStyle: ParamStyle;
	keepCommentsOnMinify: boolean;
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
	language: 'sql',
	indent: '2',
	keywordCase: 'upper',
	dataTypeCase: 'upper',
	functionCase: 'upper',
	indentStyle: 'standard',
	logicalOperatorNewline: 'before',
	expressionWidth: 50,
	linesBetweenQueries: 1,
	denseOperators: false,
	newlineBeforeSemicolon: false,
	commaPosition: 'after',
	paramStyle: 'auto',
	keepCommentsOnMinify: false,
};

export const EXPRESSION_WIDTH_RANGE = { min: 20, max: 200 } as const;
export const LINES_BETWEEN_RANGE = { min: 0, max: 5 } as const;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

/** Làm sạch cài đặt đọc từ localStorage (có thể bị sửa tay / từ phiên bản cũ). */
export function sanitizeSettings(raw: unknown): FormatSettings {
	const d = DEFAULT_FORMAT_SETTINGS;
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const cases = ['upper', 'lower', 'preserve'] as const;
	return {
		language: isFormatLanguage(r.language) ? r.language : d.language,
		indent: pick(r.indent, ['2', '4', 'tab'] as const, d.indent),
		keywordCase: pick(r.keywordCase, cases, d.keywordCase),
		dataTypeCase: pick(r.dataTypeCase, cases, d.dataTypeCase),
		functionCase: pick(r.functionCase, cases, d.functionCase),
		indentStyle: pick(r.indentStyle, ['standard', 'tabularLeft', 'tabularRight'] as const, d.indentStyle),
		logicalOperatorNewline: pick(r.logicalOperatorNewline, ['before', 'after'] as const, d.logicalOperatorNewline),
		expressionWidth: clampInt(r.expressionWidth, EXPRESSION_WIDTH_RANGE.min, EXPRESSION_WIDTH_RANGE.max, d.expressionWidth),
		linesBetweenQueries: clampInt(r.linesBetweenQueries, LINES_BETWEEN_RANGE.min, LINES_BETWEEN_RANGE.max, d.linesBetweenQueries),
		denseOperators: typeof r.denseOperators === 'boolean' ? r.denseOperators : d.denseOperators,
		newlineBeforeSemicolon: typeof r.newlineBeforeSemicolon === 'boolean' ? r.newlineBeforeSemicolon : d.newlineBeforeSemicolon,
		commaPosition: pick(r.commaPosition, ['after', 'before'] as const, d.commaPosition),
		paramStyle: pick(r.paramStyle, ['auto', 'positional', 'dollar', 'colon', 'at'] as const, d.paramStyle),
		keepCommentsOnMinify: typeof r.keepCommentsOnMinify === 'boolean' ? r.keepCommentsOnMinify : d.keepCommentsOnMinify,
	};
}

export type FormatResult = { ok: true; output: string } | { ok: false; message: string; line?: number; column?: number };

function paramTypesFor(style: ParamStyle): FormatOptionsWithLanguage['paramTypes'] | undefined {
	switch (style) {
		case 'positional':
			return { positional: true, numbered: [], named: [], quoted: [] };
		case 'dollar':
			return { positional: false, numbered: ['$'], named: [], quoted: [] };
		case 'colon':
			return { positional: false, numbered: [], named: [':'], quoted: [] };
		case 'at':
			return { positional: false, numbered: [], named: ['@'], quoted: [] };
		default:
			return undefined;
	}
}

export function formatSql(sql: string, s: FormatSettings): FormatResult {
	if (sql.trim() === '') return { ok: true, output: '' };
	const cfg: FormatOptionsWithLanguage = {
		language: s.language,
		tabWidth: s.indent === 'tab' ? 2 : Number(s.indent),
		useTabs: s.indent === 'tab',
		keywordCase: s.keywordCase,
		dataTypeCase: s.dataTypeCase,
		functionCase: s.functionCase,
		indentStyle: s.indentStyle,
		logicalOperatorNewline: s.logicalOperatorNewline,
		expressionWidth: s.expressionWidth,
		linesBetweenQueries: s.linesBetweenQueries,
		denseOperators: s.denseOperators,
		newlineBeforeSemicolon: s.newlineBeforeSemicolon,
	};
	const pt = paramTypesFor(s.paramStyle);
	if (pt) cfg.paramTypes = pt;
	let output: string;
	try {
		output = sqlFormat(sql, cfg);
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err);
		const firstLine = raw
			.split('\n')[0]
			.replace(/^Parse error:?\s*/, '')
			.replace(/\s+at line \d+ column \d+\.?$/, '');
		const m = /line (\d+) column (\d+)/.exec(raw);
		return { ok: false, message: firstLine, line: m ? Number(m[1]) : undefined, column: m ? Number(m[2]) : undefined };
	}
	if (s.commaPosition === 'before') output = moveCommasToLineStart(output, s.language);
	return { ok: true, output };
}

/**
 * Chuyển dấu phẩy cuối dòng thành đầu dòng kế tiếp ("a,\n  b" -> "a\n  , b"), giữ thẳng cột.
 * Chỉ động vào dấu phẩy là token thật (không phải trong chuỗi / comment) và đứng sát cuối dòng.
 */
export function moveCommasToLineStart(formatted: string, language: FormatLanguage): string {
	const tokens = tokenizeSql(formatted, syntaxFor(language));
	const parts: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const next = tokens[i + 1];
		const after = tokens[i + 2];
		if (
			t.type === 'comma' &&
			next &&
			next.type === 'ws' &&
			next.value.includes('\n') &&
			after &&
			after.type !== 'lineComment' &&
			after.type !== 'blockComment'
		) {
			const lastNl = next.value.lastIndexOf('\n');
			const head = next.value.slice(0, lastNl + 1);
			const indent = next.value.slice(lastNl + 1);
			let newIndent: string;
			if (indent.endsWith('\t')) newIndent = indent.slice(0, -1);
			else if (indent.length >= 2) newIndent = indent.slice(0, -2);
			else newIndent = '';
			parts.push(head + newIndent + ', ');
			i++; // đã xử lý khoảng trắng đi kèm
			continue;
		}
		parts.push(t.value);
	}
	return parts.join('');
}

export { FORMAT_LANGUAGES };
