/// <reference lib="webworker" />

import { formatSql } from '@/lib/sql-format';
import { minifySql, syntaxFor } from '@/lib/sql-tokenize';
import type { MainWorkerRequest, SqlWorkerResponse } from './sqlWorkerTypes';

// Format / minify chạy ở đây để input lớn (vài MB) không treo giao diện.
self.onmessage = (event: MessageEvent<MainWorkerRequest>) => {
	const req = event.data;
	try {
		const res: SqlWorkerResponse =
			req.op === 'format'
				? { id: req.id, op: 'format', result: formatSql(req.sql, req.settings) }
				: { id: req.id, op: 'minify', output: minifySql(req.sql, syntaxFor(req.language), { keepComments: req.keepComments }) };
		postMessage(res);
	} catch (err) {
		postMessage({ id: req.id, op: 'error', message: err instanceof Error ? err.message : String(err) } satisfies SqlWorkerResponse);
	}
};
