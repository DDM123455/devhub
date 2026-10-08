import { useCallback, useEffect, useRef } from 'react';
import type { ParserDialect } from '@/lib/sql-dialects';
import type { SqlWorkerRequest, SqlWorkerResponse } from './sqlWorkerTypes';

type Distribute<T> = T extends { id: number } ? Omit<T, 'id'> : never;
export type SqlRequest = Distribute<SqlWorkerRequest>;
export type WorkerKey = 'main' | ParserDialect;

// `new URL('<literal>', import.meta.url)` phải là literal để bundler tạo một worker bundle riêng cho
// từng dialect (mỗi bundle ~0.2-0.3 MB) — chỉ tải khi dialect đó được dùng lần đầu.
const FACTORIES: Record<WorkerKey, () => Worker> = {
	main: () => new Worker(new URL('./sqlWorker.ts', import.meta.url), { type: 'module' }),
	athena: () => new Worker(new URL('./sql-parser-workers/athena.ts', import.meta.url), { type: 'module' }),
	bigquery: () => new Worker(new URL('./sql-parser-workers/bigquery.ts', import.meta.url), { type: 'module' }),
	db2: () => new Worker(new URL('./sql-parser-workers/db2.ts', import.meta.url), { type: 'module' }),
	flinksql: () => new Worker(new URL('./sql-parser-workers/flinksql.ts', import.meta.url), { type: 'module' }),
	hive: () => new Worker(new URL('./sql-parser-workers/hive.ts', import.meta.url), { type: 'module' }),
	mariadb: () => new Worker(new URL('./sql-parser-workers/mariadb.ts', import.meta.url), { type: 'module' }),
	mysql: () => new Worker(new URL('./sql-parser-workers/mysql.ts', import.meta.url), { type: 'module' }),
	postgresql: () => new Worker(new URL('./sql-parser-workers/postgresql.ts', import.meta.url), { type: 'module' }),
	redshift: () => new Worker(new URL('./sql-parser-workers/redshift.ts', import.meta.url), { type: 'module' }),
	snowflake: () => new Worker(new URL('./sql-parser-workers/snowflake.ts', import.meta.url), { type: 'module' }),
	sqlite: () => new Worker(new URL('./sql-parser-workers/sqlite.ts', import.meta.url), { type: 'module' }),
	transactsql: () => new Worker(new URL('./sql-parser-workers/transactsql.ts', import.meta.url), { type: 'module' }),
	trino: () => new Worker(new URL('./sql-parser-workers/trino.ts', import.meta.url), { type: 'module' }),
};

interface Pending {
	key: WorkerKey;
	resolve: (r: SqlWorkerResponse | null) => void;
	reject: (e: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface Slot {
	busy: boolean;
	queued: { req: SqlRequest; resolve: (r: SqlWorkerResponse | null) => void; reject: (e: unknown) => void } | null;
}

const TIMEOUT_MS = 30000;

// Web Worker bền vững, tạo lười khi dùng lần đầu (một worker "main" cho format/minify + một worker riêng
// cho mỗi dialect parser).
// - Mỗi (worker, thao tác) chỉ chạy 1 yêu cầu tại một thời điểm; yêu cầu mới đến trong lúc đang chạy sẽ
//   thay thế yêu cầu đang chờ (bản cũ được resolve bằng null = "đã bị thay thế"), nên gõ liên tục trên
//   input lớn không dồn hàng đợi.
// - Quá TIMEOUT_MS thì terminate worker đó (cách duy nhất ngắt một lần parse quá nặng) và báo lỗi timeout.
export function useSqlWorker() {
	const workers = useRef(new Map<WorkerKey, Worker>());
	const nextId = useRef(1);
	const waiting = useRef(new Map<number, Pending>());
	const slots = useRef(new Map<string, Slot>());

	const resetWorker = useCallback((key: WorkerKey, reason: Error) => {
		workers.current.get(key)?.terminate();
		workers.current.delete(key);
		for (const [id, w] of waiting.current) {
			if (w.key !== key) continue;
			clearTimeout(w.timer);
			waiting.current.delete(id);
			w.reject(reason);
		}
		for (const [slotKey, slot] of slots.current) {
			if (!slotKey.startsWith(`${key}:`)) continue;
			if (slot.queued) slot.queued.reject(reason);
			slot.queued = null;
			slot.busy = false;
		}
	}, []);

	const getWorker = useCallback(
		(key: WorkerKey) => {
			const existing = workers.current.get(key);
			if (existing) return existing;
			const worker = FACTORIES[key]();
			worker.onmessage = (event: MessageEvent<SqlWorkerResponse>) => {
				const w = waiting.current.get(event.data.id);
				if (!w) return;
				waiting.current.delete(event.data.id);
				clearTimeout(w.timer);
				w.resolve(event.data);
			};
			worker.onerror = () => resetWorker(key, new Error('worker-error'));
			workers.current.set(key, worker);
			return worker;
		},
		[resetWorker],
	);

	useEffect(() => {
		const map = workers.current;
		return () => {
			for (const key of Array.from(map.keys())) resetWorker(key, new Error('unmounted'));
		};
	}, [resetWorker]);

	const execute = useCallback(
		(key: WorkerKey, req: SqlRequest): Promise<SqlWorkerResponse | null> =>
			new Promise((resolve, reject) => {
				let worker: Worker;
				try {
					worker = getWorker(key);
				} catch (e) {
					reject(new Error('worker-error', { cause: e }));
					return;
				}
				const id = nextId.current++;
				const timer = setTimeout(() => resetWorker(key, new Error('timeout')), TIMEOUT_MS);
				waiting.current.set(id, { key, resolve, reject, timer });
				worker.postMessage({ ...req, id });
			}),
		[getWorker, resetWorker],
	);

	const run = useCallback(
		(key: WorkerKey, req: SqlRequest): Promise<SqlWorkerResponse | null> => {
			const slotKey = `${key}:${req.op}`;
			let slot = slots.current.get(slotKey);
			if (!slot) {
				slot = { busy: false, queued: null };
				slots.current.set(slotKey, slot);
			}
			const s = slot;
			if (s.busy) {
				return new Promise((resolve, reject) => {
					s.queued?.resolve(null);
					s.queued = { req, resolve, reject };
				});
			}
			s.busy = true;
			const finish = () => {
				s.busy = false;
				const q = s.queued;
				s.queued = null;
				if (q) run(key, q.req).then(q.resolve, q.reject);
			};
			return execute(key, req).then(
				(r) => {
					finish();
					return r;
				},
				(e) => {
					finish();
					throw e;
				},
			);
		},
		[execute],
	);

	return { run };
}
