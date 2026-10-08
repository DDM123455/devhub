// Kiểm tra cú pháp SQL bằng node-sql-parser (parser được TIÊM vào, nên module này thuần và test được
// mà không cần nạp bản build dialect nặng). Việc chính ở đây:
//  - tách câu lệnh an toàn rồi kiểm tra từng câu;
//  - rút gọn lỗi PEG ("Expected ... but ... found", hàng trăm lựa chọn) thành thông điệp ngắn có
//    vị trí dòng/cột tuyệt đối, kèm gợi ý (gõ nhầm từ khoá, dấu ngoặc chưa đóng, dấu phẩy thừa...);
//  - dựng đoạn mã quanh lỗi.
//
// LƯU Ý TRUNG THỰC: "hợp lệ" ở đây chỉ nghĩa là đúng CÚ PHÁP theo ngữ pháp của parser. Không có
// schema nên bảng/cột có tồn tại hay không, câu lệnh có chạy được hay không thì không biết; ngược
// lại parser có thể từ chối cú pháp đặc thù mà DB thật chấp nhận.

import {
	computeLineStarts,
	findStructuralProblems,
	offsetToLineCol,
	splitStatements,
	tokenizeSql,
	type SqlProblem,
	type SqlSyntax,
	type SqlToken,
} from './sql-tokenize';

export interface ParserLike {
	parse(sql: string, options?: { database?: string }): { tableList: string[]; columnList: string[]; ast: unknown };
}

export type SqlErrorKey =
	| 'unexpected-token'
	| 'unexpected-end'
	| 'unterminated-string'
	| 'unterminated-quoted'
	| 'unterminated-comment'
	| 'unclosed-paren'
	| 'unmatched-close-paren'
	| 'parser-failure';

export interface SqlHint {
	key: 'did-you-mean' | 'expected-keywords' | 'trailing-comma' | 'paren-opened-here' | 'parser-near';
	params: Record<string, string | number>;
}

export interface SqlErrorInfo {
	key: SqlErrorKey;
	params: Record<string, string | number>;
	/** Thông điệp tiếng Anh dự phòng (UI dùng bản dịch theo `key`). */
	message: string;
	line: number;
	column: number;
	/** Offset tuyệt đối trong toàn bộ văn bản nhập. */
	offset: number;
	/** Độ dài đoạn cần tô sáng (>= 1). */
	length: number;
	hints: SqlHint[];
}

export interface StatementResult {
	index: number;
	startLine: number;
	endLine: number;
	ok: boolean;
	kind?: string;
	tables?: string[];
	columns?: string[];
	error?: SqlErrorInfo;
}

export interface ValidationReport {
	status: 'empty' | 'valid' | 'invalid';
	statementCount: number;
	validCount: number;
	invalidCount: number;
	results: StatementResult[];
	/** true nếu `results` bị cắt bớt (quá nhiều câu lệnh). */
	truncated: boolean;
	tables: string[];
	kinds: Record<string, number>;
}

export const MAX_DETAILED_RESULTS = 300;

// ---------------------------------------------------------------- gợi ý từ khoá

const CORE_KEYWORDS = [
	'SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'BY', 'HAVING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS',
	'ON', 'USING', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW',
	'LIMIT', 'OFFSET', 'UNION', 'EXCEPT', 'INTERSECT', 'ALL', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IN', 'EXISTS',
	'BETWEEN', 'LIKE', 'IS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT',
	'ASC', 'DESC', 'COUNT', 'TRUNCATE', 'BEGIN', 'COMMIT', 'ROLLBACK',
];

const RESERVED_AFTER_COMMA = new Set(['FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'JOIN', 'INTO', 'VALUES', 'SET', 'ON']);

export function editDistance(a: string, b: string): number {
	// Optimal string alignment (Levenshtein + hoán vị hai ký tự kề nhau).
	const m = a.length;
	const n = b.length;
	if (a === b) return 0;
	const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)]);
	for (let j = 0; j <= n; j++) d[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
		}
	}
	return d[m][n];
}

/** Gợi ý từ khoá gần nhất cho một từ có vẻ gõ sai (null nếu từ đó đã là từ khoá hoặc không đủ gần). */
export function suggestKeyword(word: string, candidates: string[]): string | null {
	const w = word.toUpperCase();
	if (w.length < 3 || !/^[A-Z_]+$/.test(w)) return null;
	const pool = Array.from(new Set([...candidates, ...CORE_KEYWORDS]));
	if (pool.includes(w)) return null;
	const limit = w.length >= 6 ? 2 : 1;
	let best: string | null = null;
	let bestDist = Infinity;
	for (const k of pool) {
		const d = editDistance(w, k);
		if (d <= limit && d < bestDist && k.length >= 3) {
			best = k;
			bestDist = d;
		}
	}
	return best;
}

// ---------------------------------------------------------------- rút gọn lỗi PEG

interface PegError {
	message?: string;
	found?: string | null;
	expected?: { type?: string; text?: string; description?: string }[];
	location?: { start?: { offset: number }; end?: { offset: number } };
}

function isCodeToken(t: SqlToken): boolean {
	return t.type !== 'ws' && t.type !== 'lineComment' && t.type !== 'blockComment';
}

function shorten(s: string, max = 40): string {
	const one = s.replace(/\s+/g, ' ');
	return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

const PROBLEM_KEY: Record<SqlProblem['kind'], SqlErrorKey> = {
	'unterminated-string': 'unterminated-string',
	'unterminated-quoted': 'unterminated-quoted',
	'unterminated-comment': 'unterminated-comment',
	'unclosed-paren': 'unclosed-paren',
	'unmatched-close-paren': 'unmatched-close-paren',
};

const PROBLEM_MESSAGE: Record<SqlErrorKey, string> = {
	'unexpected-token': 'Syntax error near "{token}"',
	'unexpected-end': 'Unexpected end of statement — the SQL looks incomplete',
	'unterminated-string': 'String starting with {opener} is never closed',
	'unterminated-quoted': 'Quoted identifier starting with {opener} is never closed',
	'unterminated-comment': 'Comment starting with /* is never closed',
	'unclosed-paren': 'Opening parenthesis "(" is never closed',
	'unmatched-close-paren': 'Closing parenthesis ")" has no matching "("',
	'parser-failure': 'The parser could not process this statement: {detail}',
};

function fillTemplate(template: string, params: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/**
 * Biến lỗi thô của node-sql-parser (hoặc lỗi cấu trúc do tokenizer phát hiện) thành thông tin ngắn gọn.
 * `stmtTokens` là token của riêng câu lệnh, offset tương đối so với `stmtText`.
 */
export function explainParseError(
	err: unknown,
	stmtText: string,
	stmtStart: number,
	lineStarts: number[],
	stmtTokens: SqlToken[],
): SqlErrorInfo {
	const peg = (err && typeof err === 'object' ? err : {}) as PegError;
	const hints: SqlHint[] = [];
	const abs = (rel: number) => stmtStart + Math.max(0, Math.min(rel, stmtText.length));
	const make = (key: SqlErrorKey, params: Record<string, string | number>, rel: number, length: number): SqlErrorInfo => {
		const offset = abs(rel);
		const { line, column } = offsetToLineCol(lineStarts, offset);
		return { key, params, message: fillTemplate(PROBLEM_MESSAGE[key], params), line, column, offset, length: Math.max(1, length), hints };
	};

	const rawOffset = peg.location?.start?.offset;
	const parserRel = typeof rawOffset === 'number' ? rawOffset : undefined;

	// 1) Chuỗi/comment chưa đóng và dấu ngoặc lệch là nguyên nhân gốc rõ ràng nhất.
	const rel = stmtTokens.map((t) => ({ ...t, start: t.start - stmtStart, end: t.end - stmtStart }));
	const problems = findStructuralProblems(rel);
	const unterminated = problems.find((p) => p.kind.startsWith('unterminated'));
	const structural = unterminated ?? problems.find((p) => p.kind === 'unmatched-close-paren') ?? problems.find((p) => p.kind === 'unclosed-paren');
	if (structural) {
		if (parserRel !== undefined && structural.kind === 'unclosed-paren') {
			const near = tokenAt(rel, parserRel);
			if (near) hints.push({ key: 'parser-near', params: { token: shorten(near.value) } });
		}
		return make(PROBLEM_KEY[structural.kind], { opener: structural.opener ?? '' }, structural.offset, structural.length);
	}

	// 2) Lỗi cú pháp thông thường: tìm token tại vị trí lỗi.
	const atEnd = peg.found == null || parserRel === undefined || parserRel >= stmtText.length;
	const codeTokens = rel.filter(isCodeToken);
	const errTok = atEnd ? null : tokenAt(rel, parserRel as number);

	const expectedKeywords: string[] = [];
	for (const e of peg.expected ?? []) {
		const text = e.text ?? '';
		if (e.type === 'literal' && /^[A-Za-z_]{2,}$/.test(text) && !expectedKeywords.includes(text.toUpperCase())) expectedKeywords.push(text.toUpperCase());
	}

	// Từ gõ nhầm: so sánh từ ngay trước vị trí lỗi (thường chính là từ bị hiểu thành alias) và từ lỗi.
	const idx = errTok ? codeTokens.findIndex((t) => t.start === errTok.start) : codeTokens.length;
	const prevTok = idx > 0 ? codeTokens[idx - 1] : undefined;
	const prev2Tok = idx > 1 ? codeTokens[idx - 2] : undefined;
	for (const cand of [prevTok, errTok]) {
		if (cand && cand.type === 'word') {
			const s = suggestKeyword(cand.value, expectedKeywords);
			if (s) {
				hints.push({ key: 'did-you-mean', params: { wrong: cand.value, suggestion: s } });
				break;
			}
		}
	}
	if (prevTok && prev2Tok && prevTok.type === 'word' && prev2Tok.type === 'comma' && RESERVED_AFTER_COMMA.has(prevTok.value.toUpperCase())) {
		hints.push({ key: 'trailing-comma', params: { keyword: prevTok.value.toUpperCase() } });
	}
	if (expectedKeywords.length > 0 && expectedKeywords.length <= 8 && !hints.some((h) => h.key === 'did-you-mean')) {
		hints.push({ key: 'expected-keywords', params: { list: expectedKeywords.join(', ') } });
	}

	if (atEnd) {
		const last = codeTokens[codeTokens.length - 1];
		return make('unexpected-end', {}, last ? last.start : 0, last ? last.end - last.start : 1);
	}
	const token = errTok?.value ?? String(peg.found);
	const startRel = errTok ? errTok.start : (parserRel as number);
	return make('unexpected-token', { token: shorten(token) }, startRel, errTok ? errTok.end - errTok.start : 1);
}

function tokenAt(tokens: SqlToken[], rel: number): SqlToken | undefined {
	return tokens.find((t) => isCodeToken(t) && t.start <= rel && rel < t.end) ?? tokens.find((t) => isCodeToken(t) && t.start >= rel);
}

// ---------------------------------------------------------------- AST -> thông tin

function describeAst(ast: unknown): string {
	const node = (Array.isArray(ast) ? ast[0] : ast) as { type?: string; keyword?: string } | undefined;
	if (!node || typeof node.type !== 'string') return 'STATEMENT';
	const type = node.type.toUpperCase();
	if ((type === 'CREATE' || type === 'DROP' || type === 'ALTER') && typeof node.keyword === 'string') return `${type} ${node.keyword.toUpperCase()}`;
	return type;
}

function listFromParser(entries: string[] | undefined, column: boolean): string[] {
	const seen = new Set<string>();
	for (const entry of entries ?? []) {
		const parts = entry.split('::');
		let name = parts.slice(2).join('::');
		if (column) {
			if (name === '(.*)' || name === '' || name === '*') continue;
			if (parts[1] && parts[1] !== 'null') name = `${parts[1]}.${name}`;
		} else if (parts[1] && parts[1] !== 'null') name = `${parts[1]}.${name}`;
		if (name) seen.add(name);
	}
	return Array.from(seen);
}

// ---------------------------------------------------------------- validate

export interface ValidateOptions {
	syntax: SqlSyntax;
	parser: ParserLike;
	/** Giá trị `database` truyền cho parser.parse (xem PARSER_DATABASE_NAME). */
	databaseName: string;
}

export function validateSql(sql: string, opts: ValidateOptions): ValidationReport {
	const tokens = tokenizeSql(sql, opts.syntax);
	const statements = splitStatements(tokens, sql);
	if (statements.length === 0) {
		return { status: 'empty', statementCount: 0, validCount: 0, invalidCount: 0, results: [], truncated: false, tables: [], kinds: {} };
	}
	const lineStarts = computeLineStarts(sql);
	const results: StatementResult[] = [];
	const tableSet = new Set<string>();
	const kinds: Record<string, number> = {};
	let valid = 0;
	let invalid = 0;

	statements.forEach((stmt, index) => {
		const startLine = offsetToLineCol(lineStarts, stmt.start).line;
		const endLine = offsetToLineCol(lineStarts, Math.max(stmt.start, stmt.end - 1)).line;
		let result: StatementResult;
		try {
			const parsed = opts.parser.parse(stmt.text, { database: opts.databaseName });
			const kind = describeAst(parsed.ast);
			const tables = listFromParser(parsed.tableList, false);
			result = { index, startLine, endLine, ok: true, kind, tables, columns: listFromParser(parsed.columnList, true) };
			tables.forEach((tb) => tableSet.add(tb));
			kinds[kind] = (kinds[kind] ?? 0) + 1;
			valid++;
		} catch (err) {
			const stmtTokens = tokens.slice(stmt.tokenFrom, stmt.tokenTo);
			const isSyntax = !!err && typeof err === 'object' && ((err as { name?: string }).name === 'SyntaxError' || 'expected' in (err as object));
			let error: SqlErrorInfo;
			if (isSyntax) error = explainParseError(err, stmt.text, stmt.start, lineStarts, stmtTokens);
			else {
				const detail = shorten(err instanceof Error ? err.message : String(err), 120);
				const { line, column } = offsetToLineCol(lineStarts, stmt.start);
				error = {
					key: 'parser-failure',
					params: { detail },
					message: fillTemplate(PROBLEM_MESSAGE['parser-failure'], { detail }),
					line,
					column,
					offset: stmt.start,
					length: 1,
					hints: [],
				};
			}
			result = { index, startLine, endLine, ok: false, error };
			invalid++;
		}
		if (results.length < MAX_DETAILED_RESULTS || !result.ok) {
			// luôn giữ câu lỗi (tối đa 2*MAX), chỉ cắt bớt câu đúng
			if (results.length < MAX_DETAILED_RESULTS * 2) results.push(result);
		}
	});

	return {
		status: invalid === 0 ? 'valid' : 'invalid',
		statementCount: statements.length,
		validCount: valid,
		invalidCount: invalid,
		results,
		truncated: results.length < statements.length,
		tables: Array.from(tableSet).slice(0, 200),
		kinds,
	};
}

// ---------------------------------------------------------------- đoạn mã quanh lỗi

export interface SnippetLine {
	line: number;
	text: string;
	/** Cột (0-indexed trong `text`) bắt đầu/kết thúc đoạn tô sáng, nếu dòng này là dòng lỗi. */
	markFrom?: number;
	markTo?: number;
}

/** Lấy `context` dòng trước/sau dòng lỗi; cắt các dòng quá dài quanh vị trí lỗi. */
export function buildSnippet(sql: string, line: number, column: number, length = 1, context = 1, maxWidth = 120): SnippetLine[] {
	const lines = sql.split('\n');
	const from = Math.max(1, line - context);
	const to = Math.min(lines.length, line + context);
	const out: SnippetLine[] = [];
	for (let n = from; n <= to; n++) {
		let text = lines[n - 1].replace(/\r$/, '');
		const entry: SnippetLine = { line: n, text };
		let shift = 0;
		if (text.length > maxWidth) {
			const focus = n === line ? column - 1 : 0;
			const start = Math.max(0, Math.min(focus - Math.floor(maxWidth / 2), text.length - maxWidth));
			text = (start > 0 ? '…' : '') + text.slice(start, start + maxWidth) + (start + maxWidth < text.length ? '…' : '');
			shift = start > 0 ? start - 1 : 0;
			entry.text = text;
		}
		if (n === line) {
			const markFrom = Math.max(0, column - 1 - shift);
			entry.markFrom = markFrom;
			entry.markTo = Math.min(entry.text.length, markFrom + Math.max(1, length));
			if (entry.markTo <= entry.markFrom) entry.markTo = entry.markFrom + 1;
		}
		out.push(entry);
	}
	return out;
}
