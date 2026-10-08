// Ánh xạ dialect cho SQL Formatter & Validator.
//
// Có HAI họ dialect độc lập:
//  - sql-formatter: `language` (hỗ trợ ~20 dialect) — dùng cho Format.
//  - node-sql-parser: mỗi dialect là một bản build riêng (`node-sql-parser/build/<name>.js`) —
//    dùng cho Validate; chỉ nạp ĐỘNG đúng bản người dùng chọn.
// Người dùng chọn MỘT dialect; validator dùng bản gần nhất (có thể ghi đè bằng ô "Validate as").

export type FormatLanguage =
	| 'sql'
	| 'bigquery'
	| 'clickhouse'
	| 'db2'
	| 'db2i'
	| 'duckdb'
	| 'hive'
	| 'mariadb'
	| 'mysql'
	| 'n1ql'
	| 'plsql'
	| 'postgresql'
	| 'redshift'
	| 'singlestoredb'
	| 'snowflake'
	| 'spark'
	| 'sqlite'
	| 'tidb'
	| 'transactsql'
	| 'trino';

/** Khớp với sql-formatter 15.x `supportedDialects` (không tính alias `tsql`). */
export const FORMAT_LANGUAGES: readonly FormatLanguage[] = [
	'sql',
	'bigquery',
	'clickhouse',
	'db2',
	'db2i',
	'duckdb',
	'hive',
	'mariadb',
	'mysql',
	'n1ql',
	'plsql',
	'postgresql',
	'redshift',
	'singlestoredb',
	'snowflake',
	'spark',
	'sqlite',
	'tidb',
	'transactsql',
	'trino',
];

/** Tên bản build trong node_modules/node-sql-parser/build/<name>.js */
export type ParserDialect =
	| 'athena'
	| 'bigquery'
	| 'db2'
	| 'flinksql'
	| 'hive'
	| 'mariadb'
	| 'mysql'
	| 'postgresql'
	| 'redshift'
	| 'snowflake'
	| 'sqlite'
	| 'transactsql'
	| 'trino';

export const PARSER_DIALECTS: readonly ParserDialect[] = [
	'athena',
	'bigquery',
	'db2',
	'flinksql',
	'hive',
	'mariadb',
	'mysql',
	'postgresql',
	'redshift',
	'snowflake',
	'sqlite',
	'transactsql',
	'trino',
];

/** Giá trị `database` mà node-sql-parser mong đợi cho từng bản build. */
export const PARSER_DATABASE_NAME: Record<ParserDialect, string> = {
	athena: 'Athena',
	bigquery: 'BigQuery',
	db2: 'DB2',
	flinksql: 'FlinkSQL',
	hive: 'Hive',
	mariadb: 'MariaDB',
	mysql: 'MySQL',
	postgresql: 'PostgresQL',
	redshift: 'Redshift',
	snowflake: 'Snowflake',
	sqlite: 'Sqlite',
	transactsql: 'TransactSQL',
	trino: 'Trino',
};

/**
 * Dialect của sql-formatter -> bản parser gần nhất.
 * `exact` = bản parser đúng dialect; ngược lại là xấp xỉ (UI phải nói rõ).
 * `null` = không có parser phù hợp (người dùng phải chọn "Validate as" thủ công).
 */
export const FORMAT_TO_PARSER: Record<FormatLanguage, { parser: ParserDialect | null; exact: boolean }> = {
	sql: { parser: 'postgresql', exact: false },
	bigquery: { parser: 'bigquery', exact: true },
	clickhouse: { parser: null, exact: false },
	db2: { parser: 'db2', exact: true },
	db2i: { parser: 'db2', exact: false },
	duckdb: { parser: 'postgresql', exact: false },
	hive: { parser: 'hive', exact: true },
	mariadb: { parser: 'mariadb', exact: true },
	mysql: { parser: 'mysql', exact: true },
	n1ql: { parser: null, exact: false },
	plsql: { parser: null, exact: false },
	postgresql: { parser: 'postgresql', exact: true },
	redshift: { parser: 'redshift', exact: true },
	singlestoredb: { parser: 'mysql', exact: false },
	snowflake: { parser: 'snowflake', exact: true },
	spark: { parser: 'hive', exact: false },
	sqlite: { parser: 'sqlite', exact: true },
	tidb: { parser: 'mysql', exact: false },
	transactsql: { parser: 'transactsql', exact: true },
	trino: { parser: 'trino', exact: true },
};

export type ValidateChoice = 'auto' | ParserDialect;

export function resolveParserDialect(
	language: FormatLanguage,
	choice: ValidateChoice,
): { parser: ParserDialect | null; exact: boolean } {
	if (choice !== 'auto') return { parser: choice, exact: true };
	return FORMAT_TO_PARSER[language];
}

export function isFormatLanguage(value: unknown): value is FormatLanguage {
	return typeof value === 'string' && (FORMAT_LANGUAGES as readonly string[]).includes(value);
}

export function isValidateChoice(value: unknown): value is ValidateChoice {
	return value === 'auto' || (typeof value === 'string' && (PARSER_DIALECTS as readonly string[]).includes(value));
}

/** Tên file tải về, ví dụ `formatted.sql`, `minified.sql`, `query-postgresql.sql`. */
export function buildDownloadFilename(kind: 'formatted' | 'minified' | 'query', language?: FormatLanguage): string {
	const base = kind === 'query' ? 'query' : kind;
	const suffix = language && language !== 'sql' ? `-${language}` : '';
	return `${base}${suffix}.sql`;
}
