import { useEffect, useRef, useState } from 'react';

export type WorkerRequestStatus = 'idle' | 'running' | 'timeout' | 'error';

interface Options<Req> {
	/** Creates a fresh module worker. The worker must post `{ ready: true }` once loaded and then answer `{ requestId, result }`. */
	createWorker: () => Worker;
	/** `null` = nothing to run. */
	request: Req | null;
	timeoutMs?: number;
	debounceMs?: number;
}

// Runs one request at a time in a throw-away Web Worker with a hard timeout. This is the only
// way to stop a catastrophically-backtracking user regex: a try/catch on the main thread can't
// interrupt it, but terminating the worker can. The timeout is armed only after the worker
// reports `ready`, so slow worker start-up is never mistaken for a runaway pattern.
export function useWorkerRequest<Req extends object, Res>({ createWorker, request, timeoutMs = 1500, debounceMs = 250 }: Options<Req>) {
	const [result, setResult] = useState<Res | null>(null);
	const [status, setStatus] = useState<WorkerRequestStatus>('idle');
	const createRef = useRef(createWorker);
	createRef.current = createWorker;
	const requestKey = request === null ? null : JSON.stringify(request);

	useEffect(() => {
		if (requestKey === null) {
			setResult(null);
			setStatus('idle');
			return;
		}
		let worker: Worker | null = null;
		let timeout: ReturnType<typeof setTimeout> | null = null;
		let finished = false;
		const finish = () => {
			finished = true;
			if (timeout) clearTimeout(timeout);
			worker?.terminate();
			worker = null;
		};
		const startTimer = setTimeout(() => {
			setStatus('running');
			worker = createRef.current();
			worker.onmessage = (event: MessageEvent<{ ready?: true; requestId?: number; result?: Res }>) => {
				if (finished) return;
				if (event.data.ready) {
					worker?.postMessage({ requestId: 1, ...JSON.parse(requestKey) });
					timeout = setTimeout(() => {
						if (finished) return;
						finish();
						setResult(null);
						setStatus('timeout');
					}, timeoutMs);
					return;
				}
				finish();
				setResult(event.data.result ?? null);
				setStatus('idle');
			};
			worker.onerror = () => {
				if (finished) return;
				finish();
				setResult(null);
				setStatus('error');
			};
		}, debounceMs);
		return () => {
			clearTimeout(startTimer);
			finish();
		};
	}, [requestKey, timeoutMs, debounceMs]);

	return { result, status };
}
