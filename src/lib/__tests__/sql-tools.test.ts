import { describe, it, expect } from 'vitest';
import {
	computeLineStarts,
	findStructuralProblems,
	minifySql,
	offsetToLineCol,
	splitStatements,
	syntaxFor,
	tokenizeSql,
} from '../sql-tokenize';
import { DEFAULT_FORMAT_SETTINGS, formatSql, moveCommasToLineStart, sanitizeSettings } from '../sql-format';
import { buildSnippet, editDistance, suggestKeyword, validateSql } from '../sql-validate';
import {
	FORMAT_LANGUAGES,
	FORMAT_TO_PARSER,
	PARSER_DATABASE_NAME,
	PARSER_DIALECTS,
	buildDownloadFilename,
	resolveParserDialect,
} from '../sql-dialects';
import { SQL_SAMPLES, SQL_SAMPLE_IDS } from '../sql-samples';

function split(sql: string, dialect = 'sql') {
	const syntax = syntaxFor(dialect);
	return splitStatements(tokenizeSql(sql, syntax), sql).map((s) => s.text);
}

async function validate(sql: string, dialect: (typeof PARSER_DIALECTS)[number]) {
	const mod = (await import(/* @vite-ignore */ `node-sql-parser/build/${dialect}`)) as { Parser?: new () => never; default?: { Parser: new () => never } };
	const Ctor = (mod.Parser ?? mod.default!.Parser) as new () => import('../sql-validate').ParserLike;
	const parser = new Ctor();
	return validateSql(sql, { syntax: syntaxFor(dialect), parser, databaseName: PARSER_DATABASE_NAME[dialect] });
}

describe('tokenizer + splitStatements', () => {
	it('tách theo ; và bỏ câu rỗng', () => {
		expect(split('select 1; select 2;;  ;')).toEqual(['select 1', 'select 2']);
	});
	it('input rỗng / chỉ khoảng trắng / chỉ comment', () => {
		expect(split('')).toEqual([]);
		expect(split('  \n\t ')).toEqual([]);
		expect(split('-- hi\n/* x */')).toEqual([]);
	});
	it('không tách trong chuỗi chứa ;', () => {
		expect(split("select 'a;b'; select \"c;d\" from t")).toEqual(["select 'a;b'", 'select "c;d" from t']);
	});
	it("xử lý '' trong chuỗi", () => {
		expect(split("select 'it''s; ok'; select 2")).toEqual(["select 'it''s; ok'", 'select 2']);
	});
	it('không tách trong comment -- và /* */', () => {
		const out = split('select 1 -- a;b\n, 2; /* x; y */ select 3');
		expect(out).toHaveLength(2);
		expect(out[0]).toContain('-- a;b');
		expect(out[1]).toContain('select 3');
	});
	it('comment lồng nhau của PostgreSQL', () => {
		expect(split('select 1 /* a /* ; */ ; */; select 2', 'postgresql')).toEqual(['select 1 /* a /* ; */ ; */', 'select 2']);
	});
	it('dollar-quote PostgreSQL $$...$$ và $tag$...$tag$', () => {
		const sql = "create function f() returns int as $$ begin select 1; return 1; end $$ language plpgsql; select $body$a;b$body$; select $1";
		expect(split(sql, 'postgresql')).toEqual([
			'create function f() returns int as $$ begin select 1; return 1; end $$ language plpgsql',
			'select $body$a;b$body$',
			'select $1',
		]);
	});
	it('backtick MySQL và comment # chỉ ở MySQL', () => {
		expect(split('select `a;b` from t; select 2', 'mysql')).toEqual(['select `a;b` from t', 'select 2']);
		expect(split('select 1 # c;d\n; select 2', 'mysql')).toHaveLength(2);
		// PostgreSQL: # là toán tử, không phải comment -> ; vẫn tách
		expect(split('select 1 # 2; select 3', 'postgresql')).toEqual(['select 1 # 2', 'select 3']);
	});
	it('MySQL: "--" không có khoảng trắng không phải comment', () => {
		expect(split('select 5--3; select 2', 'mysql')).toEqual(['select 5--3', 'select 2']);
	});
	it('[bracket] T-SQL', () => {
		expect(split('select [a;b] from [dbo].[t]; select 2', 'transactsql')).toEqual(['select [a;b] from [dbo].[t]', 'select 2']);
	});
	it('GO của T-SQL tách batch', () => {
		expect(split('select 1\nGO\nselect 2\ngo 3\nselect 4', 'transactsql')).toEqual(['select 1', 'select 2', 'select 4']);
		// "go" trong câu lệnh không phải batch separator
		expect(split('select go from t', 'transactsql')).toEqual(['select go from t']);
	});
	it('giữ nguyên thân CREATE PROCEDURE ... BEGIN ... END', () => {
		const sql = 'create procedure p() begin declare x int; set x = case when 1 = 1 then 2 else 3 end; if x > 1 then select 1; end if; end; select 9';
		const out = split(sql, 'mysql');
		expect(out).toHaveLength(2);
		expect(out[0].endsWith('end if; end')).toBe(true);
		expect(out[1]).toBe('select 9');
	});
	it('BEGIN TRANSACTION không phải khối', () => {
		expect(split('begin transaction; select 1; commit', 'transactsql')).toEqual(['begin transaction', 'select 1', 'commit']);
		expect(split('begin; select 1; commit;', 'postgresql')).toEqual(['begin', 'select 1', 'commit']);
	});
	it('chuỗi chưa đóng nuốt hết phần còn lại và được báo', () => {
		const tokens = tokenizeSql("select 'abc; select 2", syntaxFor('sql'));
		const problems = findStructuralProblems(tokens);
		expect(problems[0].kind).toBe('unterminated-string');
		expect(problems[0].offset).toBe(7);
		expect(split("select 'abc; select 2")).toHaveLength(1);
	});
	it('findStructuralProblems: ngoặc lệch và comment chưa đóng', () => {
		const p1 = findStructuralProblems(tokenizeSql('select (a + (b)', syntaxFor('sql')));
		expect(p1).toEqual([{ kind: 'unclosed-paren', offset: 7, length: 1 }]);
		const p2 = findStructuralProblems(tokenizeSql('select a) from t', syntaxFor('sql')));
		expect(p2[0].kind).toBe('unmatched-close-paren');
		const p3 = findStructuralProblems(tokenizeSql('select 1 /* oops', syntaxFor('sql')));
		expect(p3[0].kind).toBe('unterminated-comment');
		// dấu ngoặc trong chuỗi/comment không được tính
		expect(findStructuralProblems(tokenizeSql("select '(' /* ) */ , \")\"", syntaxFor('sql')))).toEqual([]);
	});
	it('offsetToLineCol', () => {
		const sql = 'ab\ncde\n\nf';
		const starts = computeLineStarts(sql);
		expect(offsetToLineCol(starts, 0)).toEqual({ line: 1, column: 1 });
		expect(offsetToLineCol(starts, 4)).toEqual({ line: 2, column: 2 });
		expect(offsetToLineCol(starts, 7)).toEqual({ line: 3, column: 1 });
		expect(offsetToLineCol(starts, 8)).toEqual({ line: 4, column: 1 });
	});
});

describe('minifySql', () => {
	const min = (sql: string, dialect = 'sql', keepComments = false) => minifySql(sql, syntaxFor(dialect), { keepComments });

	it('gộp khoảng trắng, bỏ comment', () => {
		expect(min('SELECT  a ,\n   b\nFROM   t -- note\nWHERE a = 1 /* c */ AND b > 2;')).toBe('SELECT a,b FROM t WHERE a=1 AND b>2;');
	});
	it('giữ comment khi được yêu cầu, comment dòng kết thúc bằng xuống dòng', () => {
		expect(min('select 1 -- hi\nfrom t', 'sql', true)).toBe('select 1 -- hi\nfrom t');
		expect(min('select /* c */ 1', 'sql', true)).toBe('select /* c */ 1');
	});
	it('luôn giữ hint comment /*+ */ và /*! */', () => {
		expect(min('select /*+ INDEX(t i) */ a from t')).toContain('/*+ INDEX(t i) */');
		expect(min('select /*! SQL_NO_CACHE */ a from t', 'mysql')).toContain('/*! SQL_NO_CACHE */');
	});
	it('KHÔNG đụng vào chuỗi, định danh quote, dollar-quote', () => {
		const sql = "select 'a   ;  -- not comment', \"my   col\", `bq  col`, [br  ck] from t where x = $$  a   b  $$";
		const out = min(sql, 'sql');
		expect(out).toContain("'a   ;  -- not comment'");
		expect(out).toContain('"my   col"');
		expect(out).toContain('`bq  col`');
		expect(out).toContain('$$  a   b  $$');
		expect(min('select [br  ck] from t', 'transactsql')).toBe('select [br  ck] from t');
	});
	it('không tạo ra comment ngoài ý muốn: "a - -b" và "a / *"', () => {
		expect(min('select a - -b')).toBe('select a- -b');
		expect(min('select a - - b')).not.toContain('--');
		expect(min('select a / * b')).not.toContain('/*');
	});
	it('hai chuỗi liên tiếp / từ-chuỗi giữ khoảng trắng', () => {
		expect(min("select 'a'   'b'")).toBe("select 'a' 'b'");
		expect(min('select x   as   "y"')).toBe('select x as "y"');
	});
	it('chuỗi nhiều dòng giữ nguyên xuống dòng bên trong', () => {
		expect(min("select 'line1\n  line2'   from t")).toBe("select 'line1\n  line2' from t");
	});
	it('toán tử PostgreSQL ::, ->> và tham số', () => {
		expect(min("select a :: int, b ->> 'k' from t where c = :id and d = ? and e = $1 and f = @p", 'postgresql')).toBe(
			"select a::int,b->>'k' from t where c=:id and d=? and e=$1 and f=@p",
		);
	});
	it('GO của T-SQL ở dòng riêng', () => {
		expect(min('select 1\nGO\nselect 2', 'transactsql')).toBe('select 1\nGO\nselect 2');
	});
	it('rỗng', () => {
		expect(min('')).toBe('');
		expect(min('  -- only comment  ')).toBe('');
	});
	it('bất biến: chuỗi token (không gồm khoảng trắng/comment) giữ nguyên sau minify', () => {
		const corpus = [
			SQL_SAMPLES.join,
			SQL_SAMPLES.cte,
			SQL_SAMPLES.multi,
			"select a.b , c.d::text , 'x''y' , \"q\"\"z\" from s.t as a join u on a.id=u.id where x between 1 and 2 and y like '%;%' ;",
			'select 1.5e-3 , .5 , 0x1F , a.* , count ( * ) from t where a <> b and c >= d || e',
		];
		const sig = (s: string) =>
			tokenizeSql(s, syntaxFor('sql'))
				.filter((t) => t.type !== 'ws' && t.type !== 'lineComment' && t.type !== 'blockComment')
				.map((t) => t.value)
				.join('\u0001');
		for (const sql of corpus) expect(sig(min(sql))).toBe(sig(sql));
	});
});

describe('formatSql', () => {
	it('format cơ bản + từ khoá HOA', () => {
		const r = formatSql('select a,b from t where x=1', DEFAULT_FORMAT_SETTINGS);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.output).toBe('SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1');
	});
	it('thụt 4 / tab, chữ thường', () => {
		const r4 = formatSql('select a from t', { ...DEFAULT_FORMAT_SETTINGS, indent: '4', keywordCase: 'lower' });
		expect(r4.ok && r4.output).toBe('select\n    a\nfrom\n    t');
		const rt = formatSql('select a from t', { ...DEFAULT_FORMAT_SETTINGS, indent: 'tab' });
		expect(rt.ok && rt.output).toBe('SELECT\n\ta\nFROM\n\tt');
	});
	it('dấu phẩy đầu dòng', () => {
		const r = formatSql('select a,b,c from t', { ...DEFAULT_FORMAT_SETTINGS, commaPosition: 'before' });
		expect(r.ok && r.output).toBe('SELECT\n  a\n, b\n, c\nFROM\n  t');
	});
	it('dấu phẩy trong chuỗi / comment không bị động tới', () => {
		const out = moveCommasToLineStart("select 'a,\nb',\n  c -- x,\n  from t", 'sql');
		expect(out).toBe("select 'a,\nb'\n, c -- x,\n  from t");
	});
	it('nhiều câu lệnh + số dòng trống', () => {
		const r = formatSql('select 1; select 2', { ...DEFAULT_FORMAT_SETTINGS, linesBetweenQueries: 2 });
		expect(r.ok && r.output).toBe('SELECT\n  1;\n\n\nSELECT\n  2');
	});
	it('dense operators', () => {
		const r = formatSql('select a+b from t', { ...DEFAULT_FORMAT_SETTINGS, denseOperators: true });
		expect(r.ok && r.output).toContain('a+b');
	});
	it('tham số theo dialect và kiểu ép buộc', () => {
		const pg = formatSql('select * from t where a = $1 and b = $2', { ...DEFAULT_FORMAT_SETTINGS, language: 'postgresql' });
		expect(pg.ok && pg.output).toContain('$1');
		const q = formatSql('select * from t where a = ? and b = ?', { ...DEFAULT_FORMAT_SETTINGS, paramStyle: 'positional' });
		expect(q.ok).toBe(true);
		const named = formatSql('select * from t where a = @name', { ...DEFAULT_FORMAT_SETTINGS, language: 'transactsql' });
		expect(named.ok && named.output).toContain('@name');
	});
	it('backtick MySQL, [bracket] T-SQL, dollar-quote PG không bị phá', () => {
		const my = formatSql('select `my col` from `db`.`t`', { ...DEFAULT_FORMAT_SETTINGS, language: 'mysql' });
		expect(my.ok && my.output).toContain('`my col`');
		const ms = formatSql('select [my col] from [dbo].[t]', { ...DEFAULT_FORMAT_SETTINGS, language: 'transactsql' });
		expect(ms.ok && ms.output).toContain('[my col]');
		const pg = formatSql("select 'a;b' as s", { ...DEFAULT_FORMAT_SETTINGS, language: 'postgresql' });
		expect(pg.ok && pg.output).toContain("'a;b'");
	});
	it('rỗng -> rỗng', () => {
		expect(formatSql('  \n', DEFAULT_FORMAT_SETTINGS)).toEqual({ ok: true, output: '' });
	});
	it('mọi mẫu format được với mọi dialect (không ném lỗi)', () => {
		for (const lang of FORMAT_LANGUAGES) {
			for (const id of SQL_SAMPLE_IDS) {
				if (id === 'broken') continue;
				const r = formatSql(SQL_SAMPLES[id], { ...DEFAULT_FORMAT_SETTINGS, language: lang });
				expect(r.ok, `${lang}/${id}`).toBe(true);
			}
		}
	}, 60000);
	it('sanitizeSettings chống dữ liệu hỏng', () => {
		expect(sanitizeSettings(null)).toEqual(DEFAULT_FORMAT_SETTINGS);
		const s = sanitizeSettings({ language: 'nope', indent: '9', expressionWidth: 99999, linesBetweenQueries: -3, keywordCase: 'lower', denseOperators: 'x' });
		expect(s.language).toBe('sql');
		expect(s.indent).toBe('2');
		expect(s.expressionWidth).toBe(200);
		expect(s.linesBetweenQueries).toBe(0);
		expect(s.keywordCase).toBe('lower');
		expect(s.denseOperators).toBe(false);
	});
});

describe('dialect mapping', () => {
	it('mọi dialect parser đều ánh xạ được tên database', () => {
		for (const p of PARSER_DIALECTS) expect(PARSER_DATABASE_NAME[p]).toBeTruthy();
	});
	it('mọi dialect formatter có mục ánh xạ sang parser (hoặc null)', () => {
		for (const l of FORMAT_LANGUAGES) {
			const m = FORMAT_TO_PARSER[l];
			expect(m).toBeDefined();
			if (m.parser) expect(PARSER_DIALECTS).toContain(m.parser);
		}
	});
	it('resolveParserDialect: ghi đè thủ công luôn "exact"', () => {
		expect(resolveParserDialect('tidb', 'auto')).toEqual({ parser: 'mysql', exact: false });
		expect(resolveParserDialect('plsql', 'auto').parser).toBeNull();
		expect(resolveParserDialect('plsql', 'postgresql')).toEqual({ parser: 'postgresql', exact: true });
	});
	it('tên file tải về', () => {
		expect(buildDownloadFilename('formatted')).toBe('formatted.sql');
		expect(buildDownloadFilename('minified', 'postgresql')).toBe('minified-postgresql.sql');
	});
});

describe('validate (node-sql-parser thật)', () => {
	it('input rỗng', async () => {
		const r = await validate('  \n', 'mysql');
		expect(r.status).toBe('empty');
	});
	it('câu đúng: loại câu lệnh, bảng, cột', async () => {
		const r = await validate('select u.id, name from users u join orders o on o.uid = u.id where o.total > 10', 'mysql');
		expect(r.status).toBe('valid');
		expect(r.results[0].kind).toBe('SELECT');
		expect(r.tables.sort()).toEqual(['orders', 'users']);
		expect(r.results[0].columns).toContain('name');
	});
	it('CREATE TABLE / INSERT / UPDATE / DELETE', async () => {
		const r = await validate('create table t (a int primary key, b text); insert into t values (1, \'x\'); update t set b = \'y\' where a = 1; delete from t', 'postgresql');
		expect(r.status).toBe('valid');
		expect(r.results.map((x) => x.kind)).toEqual(['CREATE TABLE', 'INSERT', 'UPDATE', 'DELETE']);
	});
	it('thiếu FROM / sai từ khoá: báo đúng dòng-cột và gợi ý', async () => {
		const r = await validate('select a, b\nfrom t\nwhere x = 1;\nselect * frm orders;', 'mysql');
		expect(r.status).toBe('invalid');
		expect(r.validCount).toBe(1);
		expect(r.invalidCount).toBe(1);
		const bad = r.results.find((x) => !x.ok)!;
		expect(bad.startLine).toBe(4);
		expect(bad.error!.line).toBe(4);
		expect(bad.error!.column).toBe(10);
		expect(bad.error!.key).toBe('unexpected-token');
		expect(bad.error!.hints.some((h) => h.key === 'did-you-mean' && h.params.suggestion === 'FROM')).toBe(true);
	});
	it('thiếu dấu ngoặc đóng: nguyên nhân gốc là dấu "(" mở', async () => {
		const r = await validate('select *\nfrom t\nwhere (a = 1 and b = 2\norder by a', 'postgresql');
		const err = r.results[0].error!;
		expect(err.key).toBe('unclosed-paren');
		expect(err.line).toBe(3);
		expect(err.column).toBe(7);
	});
	it('thừa dấu ngoặc đóng', async () => {
		const r = await validate('select a) from t', 'sqlite');
		expect(r.results[0].error!.key).toBe('unmatched-close-paren');
		expect(r.results[0].error!.column).toBe(9);
	});
	it('chuỗi chưa đóng', async () => {
		const r = await validate("select 'abc from t", 'mysql');
		expect(r.results[0].error!.key).toBe('unterminated-string');
		expect(r.results[0].error!.column).toBe(8);
	});
	it('câu lệnh chưa hoàn chỉnh: unexpected-end', async () => {
		const r = await validate('select * from', 'mysql');
		expect(r.results[0].error!.key).toBe('unexpected-end');
	});
	it('dấu phẩy thừa trước FROM', async () => {
		const r = await validate('select a, from t', 'postgresql');
		expect(r.results[0].ok).toBe(false);
		expect(r.results[0].error!.hints.some((h) => h.key === 'trailing-comma')).toBe(true);
	});
	it('vị trí lỗi trong câu lệnh thứ hai tính theo toàn văn bản (CRLF)', async () => {
		const sql = 'select 1;\r\nselect 2;\r\nselect from;';
		const r = await validate(sql, 'mysql');
		const bad = r.results.find((x) => !x.ok)!;
		expect(bad.error!.line).toBe(3);
		expect(sql.slice(bad.error!.offset, bad.error!.offset + bad.error!.length)).toBe('from');
	});
	it('; trong chuỗi/comment/dollar-quote không tạo câu lệnh sai', async () => {
		const r = await validate("select 'a;b'; -- c; d\nselect 2 /* ; */", 'postgresql');
		expect(r.status).toBe('valid');
		expect(r.statementCount).toBe(2);
	});
	it('backtick MySQL và [bracket] T-SQL hợp lệ ở đúng dialect', async () => {
		expect((await validate('select `a b` from `t`', 'mysql')).status).toBe('valid');
		expect((await validate('select [a b] from [dbo].[t]', 'transactsql')).status).toBe('valid');
		expect((await validate('select [a b] from [dbo].[t]', 'mysql')).status).toBe('invalid');
	});
	it('mọi bản dialect nạp được và parse SELECT đơn giản', async () => {
		for (const d of PARSER_DIALECTS) {
			const r = await validate('select a from t where b = 1', d);
			expect(r.status, d).toBe('valid');
		}
	}, 60000);
	it('các mẫu hợp lệ (trừ "broken") parse được ở MySQL & PostgreSQL', async () => {
		for (const id of SQL_SAMPLE_IDS) {
			if (id === 'broken') continue;
			for (const d of ['mysql', 'postgresql'] as const) {
				const r = await validate(SQL_SAMPLES[id], d);
				expect(r.status, `${d}/${id}: ${JSON.stringify(r.results.find((x) => !x.ok)?.error)}`).toBe('valid');
			}
		}
	});
	it('mẫu "broken" báo lỗi ở nhiều câu', async () => {
		const r = await validate(SQL_SAMPLES.broken, 'postgresql');
		expect(r.status).toBe('invalid');
		expect(r.invalidCount).toBe(2);
	});
});

describe('hỗ trợ lỗi', () => {
	it('editDistance + suggestKeyword', () => {
		expect(editDistance('frm', 'from')).toBe(1);
		expect(editDistance('selcet', 'select')).toBe(1);
		expect(suggestKeyword('frm', [])).toBe('FROM');
		expect(suggestKeyword('selct', [])).toBe('SELECT');
		expect(suggestKeyword('users', [])).toBeNull();
		expect(suggestKeyword('from', [])).toBeNull();
	});
	it('buildSnippet đánh dấu đúng cột và cắt dòng quá dài', () => {
		const s = buildSnippet('a\nselect * frm t\nz', 2, 10, 3);
		expect(s.map((l) => l.line)).toEqual([1, 2, 3]);
		expect(s[1]).toMatchObject({ text: 'select * frm t', markFrom: 9, markTo: 12 });
		const long = buildSnippet('x'.repeat(500) + 'ERR' + 'y'.repeat(500), 1, 501, 3, 0, 60);
		expect(long[0].text.length).toBeLessThan(70);
		expect(long[0].text.slice(long[0].markFrom, long[0].markTo)).toBe('ERR');
	});
});

describe('formatSql lỗi + i18n', () => {
	it('lỗi định dạng có vị trí và thông điệp không lặp "at line"', () => {
		const r = formatSql(SQL_SAMPLES.broken, DEFAULT_FORMAT_SETTINGS);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.line).toBeGreaterThan(0);
			expect(r.message).not.toMatch(/at line \d+ column/);
		}
	});
	it('en và vi có cùng tập khoá và cùng biến {{...}}', async () => {
		const en = (await import('../../i18n/locales/en/tool-sql-formatter.json')).default as Record<string, unknown>;
		const vi = (await import('../../i18n/locales/vi/tool-sql-formatter.json')).default as Record<string, unknown>;
		const flat = (o: unknown, prefix = ''): Record<string, string> =>
			Object.entries(o as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
				if (v && typeof v === 'object') Object.assign(acc, flat(v, `${prefix}${k}.`));
				else acc[`${prefix}${k}`] = String(v);
				return acc;
			}, {});
		const fe = flat(en);
		const fv = flat(vi);
		expect(Object.keys(fv).sort()).toEqual(Object.keys(fe).sort());
		const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
		for (const k of Object.keys(fe)) expect(vars(fv[k]), k).toBe(vars(fe[k]));
	});
});
