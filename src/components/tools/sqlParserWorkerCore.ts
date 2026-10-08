/// <reference lib="webworker" />

import { PARSER_DATABASE_NAME, type ParserDialect } from '@/lib/sql-dialects';
import { syntaxFor } from '@/lib/sql-tokenize';
import { validateSql, type ParserLike } from '@/lib/sql-validate';
import type { ParserWorkerRequest, SqlWorkerResponse } from './sqlWorkerTypes';

type ParserModule = { Parser?: new () => ParserLike; default?: { Parser?: new () => ParserLike } };

// Dùng chung cho 13 file sql-parser-workers/<dialect>.ts. Mỗi file import tĩnh đúng MỘT bản build của
// node-sql-parser rồi gọi hàm này.
export function setupParserWorker(dialect: ParserDialect, mod: unknown): void {
	const m = mod as ParserModule;
	// CJS interop: tuỳ bundler, `Parser` nằm ở namespace hoặc ở `default`.
	const Ctor = m.Parser ?? m.default?.Parser;
	const parser = Ctor ? new Ctor() : null;
	self.onmessage = (event: MessageEvent<ParserWorkerRequest>) => {
		const req = event.data;
		try {
			if (!parser) throw new Error(`node-sql-parser/${dialect}: Parser export not found`);
			const report = validateSql(req.sql, { syntax: syntaxFor(dialect), parser, databaseName: PARSER_DATABASE_NAME[dialect] });
			postMessage({ id: req.id, op: 'validate', report } satisfies SqlWorkerResponse);
		} catch (err) {
			postMessage({ id: req.id, op: 'error', message: err instanceof Error ? err.message : String(err) } satisfies SqlWorkerResponse);
		}
	};
}
