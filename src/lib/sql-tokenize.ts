// Bộ tách token SQL an toàn (không phụ thuộc DOM / thư viện ngoài) dùng cho:
//  - tách nhiều câu lệnh theo `;` mà KHÔNG tách trong chuỗi / comment / định danh quote / dollar-quote;
//  - minify (loại khoảng trắng + comment thừa nhưng không phá chuỗi, định danh, hint);
//  - kiểm tra dấu ngoặc / chuỗi chưa đóng trước khi đưa vào parser.
// Đây KHÔNG phải parser SQL: nó chỉ nhận biết ranh giới token theo từng họ dialect.

export type SqlTokenType =
	| 'ws'
	| 'lineComment'
	| 'blockComment'
	| 'string' // '...', $$...$$, q'[...]'
	| 'quoted' // "...", `...`, [...]
	| 'word'
	| 'number'
	| 'param' // ?, ?1, :name, @name, $1
	| 'op' // một ký tự toán tử, hoặc "::"
	| 'dot'
	| 'comma'
	| 'lparen'
	| 'rparen'
	| 'semicolon'
	| 'go' // T-SQL batch separator trên dòng riêng
	| 'other';

export interface SqlToken {
	type: SqlTokenType;
	value: string;
	start: number;
	end: number; // exclusive
	/** Chuỗi / định danh / comment mở ra mà không bao giờ đóng. */
	unterminated?: boolean;
}

export interface SqlSyntax {
	hashComment: boolean; // `# ...` là comment (MySQL, BigQuery...)
	dashNeedsSpace: boolean; // MySQL: `--` chỉ là comment khi theo sau là khoảng trắng
	backslashEscapes: boolean; // `\'` thoát ký tự trong '...' và "..."
	bracketIdent: boolean; // [ten] là định danh (T-SQL, SQLite)
	dollarQuote: boolean; // $$ ... $$ / $tag$ ... $tag$
	nestedComments: boolean; // /* /* */ */
	tripleQuote: boolean; // '''...''' (BigQuery)
	batchGo: boolean; // dòng `GO`
	eStrings: boolean; // E'...' có backslash escape (PostgreSQL)
	qQuote: boolean; // q'[...]' (Oracle PL/SQL)
	hashIdent: boolean; // #temp / ##temp (T-SQL)
}

const BASE: SqlSyntax = {
	hashComment: false,
	dashNeedsSpace: false,
	backslashEscapes: false,
	bracketIdent: false,
	dollarQuote: false,
	nestedComments: false,
	tripleQuote: false,
	batchGo: false,
	eStrings: false,
	qQuote: false,
	hashIdent: false,
};

const MYSQL_FAMILY: Partial<SqlSyntax> = { hashComment: true, dashNeedsSpace: true, backslashEscapes: true };

const SYNTAX_BY_NAME: Record<string, Partial<SqlSyntax>> = {
	sql: { dollarQuote: true },
	postgresql: { dollarQuote: true, nestedComments: true, eStrings: true },
	redshift: { dollarQuote: true, eStrings: true },
	duckdb: { dollarQuote: true, nestedComments: true, eStrings: true },
	snowflake: { dollarQuote: true, backslashEscapes: true },
	mysql: MYSQL_FAMILY,
	mariadb: MYSQL_FAMILY,
	tidb: MYSQL_FAMILY,
	singlestoredb: MYSQL_FAMILY,
	bigquery: { hashComment: true, backslashEscapes: true, tripleQuote: true },
	hive: { backslashEscapes: true },
	spark: { backslashEscapes: true },
	clickhouse: { hashComment: true, backslashEscapes: true },
	transactsql: { bracketIdent: true, batchGo: true, hashIdent: true },
	sqlite: { bracketIdent: true },
	plsql: { qQuote: true },
};

/** Cờ cú pháp theo tên dialect (tên sql-formatter hoặc node-sql-parser đều dùng được). */
export function syntaxFor(name: string): SqlSyntax {
	return { ...BASE, ...(SYNTAX_BY_NAME[name] ?? {}) };
}

const OP_CHARS = '+-*/%<>=!|&^~#@:';
const WORD_START = /[\p{L}_]/u;
const WORD_REST = /[\p{L}\p{N}_$]/u;
const DOLLAR_TAG = /^\$([\p{L}_][\p{L}\p{N}_]*)?\$/u;
const NUMBER = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/;

export function isOpChar(ch: string | undefined): boolean {
	return ch !== undefined && ch !== '' && OP_CHARS.includes(ch);
}

const Q_CLOSE: Record<string, string> = { '[': ']', '(': ')', '{': '}', '<': '>' };

export function tokenizeSql(sql: string, syntax: SqlSyntax): SqlToken[] {
	const tokens: SqlToken[] = [];
	const n = sql.length;
	let i = 0;

	const push = (type: SqlTokenType, start: number, end: number, unterminated?: boolean) => {
		const t: SqlToken = { type, value: sql.slice(start, end), start, end };
		if (unterminated) t.unterminated = true;
		tokens.push(t);
		i = end;
	};

	// Quét chuỗi/định danh bắt đầu bằng `quote` tại vị trí `from`; trả về [end, unterminated].
	const scanQuoted = (from: number, quote: string, close: string, backslash: boolean): [number, boolean] => {
		let j = from + 1;
		while (j < n) {
			const ch = sql[j];
			if (backslash && ch === '\\') {
				j += 2;
				continue;
			}
			if (ch === close) {
				if (sql[j + 1] === close) {
					j += 2; // '' hoặc "" hoặc `` hoặc ]] = ký tự thoát
					continue;
				}
				return [j + 1, false];
			}
			j++;
		}
		void quote;
		return [n, true];
	};

	while (i < n) {
		const ch = sql[i];

		// Khoảng trắng
		if (/\s/.test(ch)) {
			let j = i + 1;
			while (j < n && /\s/.test(sql[j])) j++;
			push('ws', i, j);
			continue;
		}

		// Comment dòng `--`
		if (ch === '-' && sql[i + 1] === '-') {
			const next = sql[i + 2];
			if (!syntax.dashNeedsSpace || next === undefined || /\s/.test(next) || next < ' ') {
				let j = i + 2;
				while (j < n && sql[j] !== '\n') j++;
				push('lineComment', i, j);
				continue;
			}
		}
		// Comment dòng `#`
		if (ch === '#' && syntax.hashComment) {
			let j = i + 1;
			while (j < n && sql[j] !== '\n') j++;
			push('lineComment', i, j);
			continue;
		}
		// Comment khối
		if (ch === '/' && sql[i + 1] === '*') {
			let depth = 1;
			let j = i + 2;
			while (j < n && depth > 0) {
				if (sql[j] === '*' && sql[j + 1] === '/') {
					depth--;
					j += 2;
				} else if (syntax.nestedComments && sql[j] === '/' && sql[j + 1] === '*') {
					depth++;
					j += 2;
				} else j++;
			}
			push('blockComment', i, j, depth > 0);
			continue;
		}

		// Chuỗi '...' (có thể là E'...' của PostgreSQL)
		if (ch === "'") {
			if (syntax.tripleQuote && sql.startsWith("'''", i)) {
				const close = sql.indexOf("'''", i + 3);
				if (close === -1) push('string', i, n, true);
				else push('string', i, close + 3);
				continue;
			}
			let backslash = syntax.backslashEscapes;
			if (syntax.eStrings && i > 0 && (sql[i - 1] === 'e' || sql[i - 1] === 'E') && !(i > 1 && WORD_REST.test(sql[i - 2]))) {
				backslash = true;
			}
			const [end, bad] = scanQuoted(i, "'", "'", backslash);
			push('string', i, end, bad);
			continue;
		}
		// "..." (định danh, hoặc chuỗi trong MySQL)
		if (ch === '"') {
			if (syntax.tripleQuote && sql.startsWith('"""', i)) {
				const close = sql.indexOf('"""', i + 3);
				if (close === -1) push('string', i, n, true);
				else push('string', i, close + 3);
				continue;
			}
			const [end, bad] = scanQuoted(i, '"', '"', syntax.backslashEscapes);
			push('quoted', i, end, bad);
			continue;
		}
		if (ch === '`') {
			const [end, bad] = scanQuoted(i, '`', '`', false);
			push('quoted', i, end, bad);
			continue;
		}
		if (ch === '[' && syntax.bracketIdent) {
			const [end, bad] = scanQuoted(i, '[', ']', false);
			push('quoted', i, end, bad);
			continue;
		}

		// `$`: dollar-quote, `$1`, `$name`
		if (ch === '$') {
			if (syntax.dollarQuote) {
				const m = DOLLAR_TAG.exec(sql.slice(i, i + 80));
				if (m) {
					const tag = m[0];
					const close = sql.indexOf(tag, i + tag.length);
					if (close === -1) push('string', i, n, true);
					else push('string', i, close + tag.length);
					continue;
				}
			}
			let j = i + 1;
			while (j < n && WORD_REST.test(sql[j])) j++;
			if (j > i + 1) push('param', i, j);
			else push('other', i, i + 1);
			continue;
		}

		// `@name`, `@@var`
		if (ch === '@') {
			let j = i + 1;
			if (sql[j] === '@') j++;
			if (j < n && WORD_REST.test(sql[j])) {
				while (j < n && (WORD_REST.test(sql[j]) || sql[j] === '#')) j++;
				push('param', i, j);
				continue;
			}
			push('op', i, i + 1);
			continue;
		}

		// `::`, `:name`
		if (ch === ':') {
			if (sql[i + 1] === ':') {
				push('op', i, i + 2);
				continue;
			}
			const prev = i > 0 ? sql[i - 1] : '';
			if (WORD_START.test(sql[i + 1] ?? '') && !(prev && (WORD_REST.test(prev) || prev === ')' || prev === ']'))) {
				let j = i + 1;
				while (j < n && WORD_REST.test(sql[j])) j++;
				push('param', i, j);
				continue;
			}
			push('op', i, i + 1);
			continue;
		}

		// `?`, `?1`
		if (ch === '?') {
			let j = i + 1;
			while (j < n && /\d/.test(sql[j])) j++;
			push('param', i, j);
			continue;
		}

		// T-SQL #temp
		if (ch === '#' && syntax.hashIdent && /[\p{L}_#]/u.test(sql[i + 1] ?? '')) {
			let j = i + 1;
			while (j < n && (WORD_REST.test(sql[j]) || sql[j] === '#')) j++;
			push('word', i, j);
			continue;
		}

		// Số (kể cả .5)
		if (/\d/.test(ch) || (ch === '.' && /\d/.test(sql[i + 1] ?? '') && !(i > 0 && /[\p{L}\p{N}_)\]"`]/u.test(sql[i - 1])))) {
			const m = NUMBER.exec(sql.slice(i, i + 64));
			if (m) {
				let j = i + m[0].length;
				// "1abc" (MySQL cho phép định danh bắt đầu bằng số) -> gộp thành một word
				if (j < n && WORD_START.test(sql[j])) {
					while (j < n && WORD_REST.test(sql[j])) j++;
					push('word', i, j);
				} else push('number', i, j);
				continue;
			}
		}

		// Từ / định danh / từ khoá
		if (WORD_START.test(ch)) {
			let j = i + 1;
			while (j < n && WORD_REST.test(sql[j])) j++;
			const word = sql.slice(i, j);
			// Oracle q'[ ... ]'
			if (syntax.qQuote && /^n?q$/i.test(word) && sql[j] === "'" && j + 1 < n && !/\s/.test(sql[j + 1])) {
				const open = sql[j + 1];
				const closeCh = Q_CLOSE[open] ?? open;
				const close = sql.indexOf(closeCh + "'", j + 2);
				if (close === -1) push('string', i, n, true);
				else push('string', i, close + 2);
				continue;
			}
			if (syntax.batchGo && /^go$/i.test(word) && isAloneOnLine(sql, i, j)) {
				let k = j;
				while (k < n && (sql[k] === ' ' || sql[k] === '\t')) k++;
				const num = /^\d+/.exec(sql.slice(k, k + 12));
				push('go', i, num ? k + num[0].length : j);
				continue;
			}
			push('word', i, j);
			continue;
		}

		switch (ch) {
			case ';':
				push('semicolon', i, i + 1);
				continue;
			case ',':
				push('comma', i, i + 1);
				continue;
			case '(':
				push('lparen', i, i + 1);
				continue;
			case ')':
				push('rparen', i, i + 1);
				continue;
			case '.':
				push('dot', i, i + 1);
				continue;
			default:
		}
		if (OP_CHARS.includes(ch)) {
			push('op', i, i + 1);
			continue;
		}
		push('other', i, i + 1);
	}
	return tokens;
}

function isAloneOnLine(sql: string, start: number, end: number): boolean {
	let a = start - 1;
	while (a >= 0 && sql[a] !== '\n') {
		if (sql[a] !== ' ' && sql[a] !== '\t' && sql[a] !== '\r') return false;
		a--;
	}
	let b = end;
	while (b < sql.length && sql[b] !== '\n') {
		if (sql[b] !== ' ' && sql[b] !== '\t' && sql[b] !== '\r' && !/\d/.test(sql[b])) return false;
		b++;
	}
	return true;
}

// ---------------------------------------------------------------- vị trí

export function computeLineStarts(src: string): number[] {
	const starts = [0];
	for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
	return starts;
}

/** offset -> { line, column } (cả hai 1-indexed). */
export function offsetToLineCol(lineStarts: number[], offset: number): { line: number; column: number } {
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (lineStarts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
}

// ---------------------------------------------------------------- tách câu lệnh

export interface SqlStatement {
	/** Nội dung câu lệnh (gồm comment đứng trước nó), KHÔNG gồm dấu `;` kết thúc. */
	text: string;
	start: number;
	end: number; // exclusive
	/** Khoảng token [from, to) trong mảng token gốc. */
	tokenFrom: number;
	tokenTo: number;
	/** Có token "thật" (không phải khoảng trắng/comment) hay không. */
	hasCode: boolean;
}

const ROUTINE_WORDS = new Set(['PROCEDURE', 'PROC', 'FUNCTION', 'TRIGGER', 'EVENT', 'PACKAGE']);
const BEGIN_NOT_BLOCK = new Set(['TRANSACTION', 'TRAN', 'WORK', 'DISTRIBUTED', 'DEFERRED', 'IMMEDIATE', 'EXCLUSIVE', 'ISOLATION']);
const END_NO_CLOSE = new Set(['IF', 'LOOP', 'WHILE', 'REPEAT', 'FOR']);

/**
 * Tách câu lệnh theo `;` (và `GO` của T-SQL), bỏ qua `;` nằm trong chuỗi / comment / dollar-quote /
 * định danh quote (vì các thứ đó đã là một token). Thân CREATE PROCEDURE/FUNCTION/TRIGGER ... BEGIN ... END
 * được giữ nguyên là MỘT câu lệnh (đếm BEGIN/CASE ... END). Chỉ trả về các câu lệnh có code thật.
 */
export function splitStatements(tokens: SqlToken[], sql: string): SqlStatement[] {
	const out: SqlStatement[] = [];
	let from = 0; // token đầu của câu hiện tại
	let hasCode = false;
	let firstWords: string[] = [];
	let routine = false;
	let depth = 0;
	let sawBegin = false;

	const sig = (idx: number): SqlToken | null => {
		for (let k = idx; k < tokens.length; k++) {
			const t = tokens[k];
			if (t.type !== 'ws' && t.type !== 'lineComment' && t.type !== 'blockComment') return t;
		}
		return null;
	};
	const sigIndex = (idx: number): number => {
		for (let k = idx; k < tokens.length; k++) {
			const t = tokens[k];
			if (t.type !== 'ws' && t.type !== 'lineComment' && t.type !== 'blockComment') return k;
		}
		return -1;
	};

	const finish = (toExclusive: number) => {
		// cắt khoảng trắng ở hai đầu (giữ comment)
		let a = from;
		let b = toExclusive;
		while (a < b && tokens[a].type === 'ws') a++;
		while (b > a && tokens[b - 1].type === 'ws') b--;
		if (hasCode && a < b) {
			out.push({
				text: sql.slice(tokens[a].start, tokens[b - 1].end),
				start: tokens[a].start,
				end: tokens[b - 1].end,
				tokenFrom: a,
				tokenTo: b,
				hasCode: true,
			});
		}
		hasCode = false;
		firstWords = [];
		routine = false;
		depth = 0;
		sawBegin = false;
	};

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.type === 'ws' || t.type === 'lineComment' || t.type === 'blockComment') continue;

		if (t.type === 'semicolon' && depth === 0) {
			finish(i);
			from = i + 1;
			continue;
		}
		if (t.type === 'go') {
			finish(i);
			from = i + 1;
			continue;
		}

		hasCode = true;
		if (t.type === 'word') {
			const up = t.value.toUpperCase();
			if (firstWords.length < 8) {
				firstWords.push(up);
				if (firstWords.length >= 2 && (firstWords[0] === 'CREATE' || firstWords[0] === 'ALTER') && ROUTINE_WORDS.has(up)) routine = true;
			}
			if (routine) {
				const next = sig(i + 1);
				const nextUp = next && next.type === 'word' ? next.value.toUpperCase() : '';
				if (up === 'BEGIN' && !BEGIN_NOT_BLOCK.has(nextUp)) {
					depth++;
					sawBegin = true;
				} else if (up === 'CASE' && sawBegin) {
					depth++;
				} else if (up === 'END' && depth > 0) {
					if (END_NO_CLOSE.has(nextUp)) {
						// END IF / END LOOP ...: không đóng khối
					} else {
						depth--;
						if (nextUp === 'CASE') i = sigIndex(i + 1); // nuốt "CASE" của END CASE
						if (depth === 0) {
							// Kết thúc thân routine: gộp `;` ngay sau (nếu có), nếu không thì kết thúc luôn tại END.
							const after = sigIndex(i + 1);
							if (after !== -1 && tokens[after].type === 'semicolon') {
								finish(after);
								from = after + 1;
								i = after;
							} else {
								finish(i + 1);
								from = i + 1;
							}
						}
					}
				}
			}
		}
	}
	finish(tokens.length);
	return out;
}

// ---------------------------------------------------------------- vấn đề cấu trúc

export type SqlProblemKind = 'unterminated-string' | 'unterminated-quoted' | 'unterminated-comment' | 'unclosed-paren' | 'unmatched-close-paren';

export interface SqlProblem {
	kind: SqlProblemKind;
	offset: number; // tương đối so với chuỗi đã tokenize
	length: number;
	/** Với unterminated-*: ký tự mở (', ", `, [, $$, /*). */
	opener?: string;
}

/** Tìm chuỗi/comment chưa đóng và dấu ngoặc lệch trong một đoạn token. */
export function findStructuralProblems(tokens: SqlToken[]): SqlProblem[] {
	const problems: SqlProblem[] = [];
	const stack: SqlToken[] = [];
	for (const t of tokens) {
		if (t.unterminated) {
			if (t.type === 'blockComment') problems.push({ kind: 'unterminated-comment', offset: t.start, length: 2, opener: '/*' });
			else if (t.type === 'string') {
				const opener = t.value.startsWith('$') ? (DOLLAR_TAG.exec(t.value)?.[0] ?? '$$') : t.value.slice(0, t.value.startsWith("'''") ? 3 : 1);
				problems.push({ kind: 'unterminated-string', offset: t.start, length: Math.max(1, opener.length), opener });
			} else problems.push({ kind: 'unterminated-quoted', offset: t.start, length: 1, opener: t.value[0] });
			continue;
		}
		if (t.type === 'lparen') stack.push(t);
		else if (t.type === 'rparen') {
			if (stack.length === 0) problems.push({ kind: 'unmatched-close-paren', offset: t.start, length: 1 });
			else stack.pop();
		}
	}
	for (const open of stack) problems.push({ kind: 'unclosed-paren', offset: open.start, length: 1 });
	return problems.sort((a, b) => a.offset - b.offset);
}

// ---------------------------------------------------------------- minify

export interface MinifyOptions {
	keepComments: boolean;
}

function isHintComment(value: string): boolean {
	// /*+ hint */ (Oracle/MySQL optimizer) và /*! code */ (MySQL conditional) có ý nghĩa với DB -> luôn giữ.
	return value.startsWith('/*+') || value.startsWith('/*!');
}

function tokenIsWordLike(t: SqlToken): boolean {
	return t.type === 'word' || t.type === 'number' || t.type === 'param' || t.type === 'string' || t.type === 'quoted' || t.type === 'other';
}

/** Có cần giữ một khoảng trắng giữa hai token (vốn cách nhau bởi khoảng trắng/comment) không? */
function needSpaceBetween(prev: SqlToken, cur: SqlToken): boolean {
	if (cur.type === 'comma' || cur.type === 'semicolon' || cur.type === 'rparen') return false;
	if (prev.type === 'lparen' || prev.type === 'comma' || prev.type === 'semicolon') return false;
	if (prev.type === 'rparen' && cur.type === 'lparen') return false;
	if (prev.type === 'dot' || cur.type === 'dot') {
		// "1 .5" / "t . 5": giữ khoảng trắng để không sinh số thập phân / token khác
		return prev.type === 'number' || cur.type === 'number' || (prev.type === 'dot' && cur.type === 'dot');
	}
	if (prev.type === 'op' && cur.type === 'op') return true; // tránh ghép "- -" thành "--", "/ *" thành "/*", ...
	if (prev.type === 'op' || cur.type === 'op') return false;
	if (prev.type === 'lparen' || cur.type === 'lparen' || prev.type === 'rparen' || cur.type === 'rparen') {
		// word ( ... ) và ) word: giữ khoảng trắng (an toàn với từ khoá/hàm)
		return tokenIsWordLike(prev) || tokenIsWordLike(cur);
	}
	return true;
}

/**
 * Minify SQL: gộp khoảng trắng, bỏ comment (tuỳ chọn). Mọi chuỗi, định danh quote, dollar-quote,
 * hint comment đều giữ nguyên từng ký tự. Hai token vốn liền nhau thì vẫn liền nhau.
 */
export function minifySql(sql: string, syntax: SqlSyntax, options: MinifyOptions): string {
	const tokens = tokenizeSql(sql, syntax);
	let out = '';
	let prev: SqlToken | null = null;
	let gap = false;
	let forceNewline = false;

	for (const t of tokens) {
		if (t.type === 'ws') {
			gap = true;
			continue;
		}
		if (t.type === 'lineComment' || t.type === 'blockComment') {
			if (!options.keepComments && !(t.type === 'blockComment' && isHintComment(t.value))) {
				gap = true;
				continue;
			}
			if (out !== '') out += forceNewline ? '\n' : ' ';
			out += t.type === 'lineComment' ? t.value.replace(/\s+$/, '') : t.value;
			forceNewline = t.type === 'lineComment';
			prev = null; // comment luôn được ngăn cách bằng khoảng trắng ở cả hai phía
			gap = false;
			if (t.type === 'blockComment') forceNewline = false;
			continue;
		}
		if (t.type === 'go') {
			if (out !== '' && !out.endsWith('\n')) out += '\n';
			out += t.value.replace(/\s+/g, ' ') + '\n';
			prev = null;
			gap = false;
			forceNewline = false;
			continue;
		}
		if (out !== '') {
			if (forceNewline) out += '\n';
			else if (prev === null) {
				if (!out.endsWith('\n')) out += ' '; // sau comment
			} else if (gap && needSpaceBetween(prev, t)) out += ' ';
		}
		forceNewline = false;
		out += t.value;
		prev = t;
		gap = false;
	}
	return out.trim();
}
