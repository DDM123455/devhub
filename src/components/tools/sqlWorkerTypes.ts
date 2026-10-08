import type { FormatSettings, FormatResult } from '@/lib/sql-format';
import type { FormatLanguage, ParserDialect } from '@/lib/sql-dialects';
import type { ValidationReport } from '@/lib/sql-validate';

// Hai loại worker:
//  - "main" (sqlWorker.ts): format + minify, chỉ nạp sql-formatter.
//  - một worker RIÊNG cho từng dialect parser (sql-parser-workers/<dialect>.ts): mỗi file chứa đúng một
//    bản build node-sql-parser, nên chỉ được tải khi người dùng kiểm tra cú pháp dialect đó lần đầu.

export type MainWorkerRequest =
	| { id: number; op: 'format'; sql: string; settings: FormatSettings }
	| { id: number; op: 'minify'; sql: string; language: FormatLanguage; keepComments: boolean };

export type ParserWorkerRequest = { id: number; op: 'validate'; sql: string };

export type SqlWorkerRequest = MainWorkerRequest | ParserWorkerRequest;

export type SqlWorkerResponse =
	| { id: number; op: 'format'; result: FormatResult }
	| { id: number; op: 'minify'; output: string }
	| { id: number; op: 'validate'; report: ValidationReport }
	| { id: number; op: 'error'; message: string };

export type ValidateOutcome =
	| { status: 'report'; report: ValidationReport; parser: ParserDialect; exact: boolean }
	| { status: 'no-parser' }
	| { status: 'load-error' };
