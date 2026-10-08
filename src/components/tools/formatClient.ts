import { FORMAT_TIMEOUT_MS, workerGroupFor, type FormatLanguage, type FormatOptions, type WorkerGroup } from '@/lib/format-languages';
import type { FormatRunResult } from '@/lib/format-run';
import type { FormatWorkerRequest, FormatWorkerResponse } from './formatWorkerCore';

// Each language group has its own worker bundle that contains only that group's libraries
// (e.g. CSS -> prettier + postcss only), created lazily on the first Format of that group and
// then reused. Nothing is downloaded until the user presses Format. A job that runs past
// FORMAT_TIMEOUT_MS terminates its worker (the only way to stop a runaway parse). JSON and XML
// need no heavy library and run on the main thread; if Workers are unavailable the same code
// runs on the main thread with lazily imported chunks.

interface Pending {
	resolve: (r: FormatRunResult) => void;
	timer: ReturnType<typeof setTimeout>;
}
interface Entry {
	worker: Worker;
	pending: Map<number, Pending>;
}

const entries = new Map<WorkerGroup, Entry>();
let nextId = 1;

export const FORMAT_TIMEOUT_MESSAGE = 'timeout';

function createWorker(group: WorkerGroup): Worker {
	// Each `new URL(...)` must be a literal so the bundler emits a separate worker file per group.
	switch (group) {
		case 'js':
			return new Worker(new URL('./formatWorkerJs.ts', import.meta.url), { type: 'module' });
		case 'ts':
			return new Worker(new URL('./formatWorkerTs.ts', import.meta.url), { type: 'module' });
		case 'css':
			return new Worker(new URL('./formatWorkerCss.ts', import.meta.url), { type: 'module' });
		case 'html':
			return new Worker(new URL('./formatWorkerHtml.ts', import.meta.url), { type: 'module' });
		case 'htmlEmbed':
			return new Worker(new URL('./formatWorkerHtmlEmbed.ts', import.meta.url), { type: 'module' });
		case 'markdown':
			return new Worker(new URL('./formatWorkerMarkdown.ts', import.meta.url), { type: 'module' });
		case 'yaml':
			return new Worker(new URL('./formatWorkerYaml.ts', import.meta.url), { type: 'module' });
		case 'graphql':
			return new Worker(new URL('./formatWorkerGraphql.ts', import.meta.url), { type: 'module' });
		case 'sql':
			return new Worker(new URL('./formatWorkerSql.ts', import.meta.url), { type: 'module' });
	}
}

function failGroup(group: WorkerGroup, message: string) {
	const entry = entries.get(group);
	if (!entry) return;
	entries.delete(group);
	entry.worker.terminate();
	for (const p of entry.pending.values()) {
		clearTimeout(p.timer);
		p.resolve({ ok: false, error: { message } });
	}
	entry.pending.clear();
}

function getEntry(group: WorkerGroup): Entry | null {
	const existing = entries.get(group);
	if (existing) return existing;
	if (typeof Worker === 'undefined') return null;
	try {
		const worker = createWorker(group);
		const entry: Entry = { worker, pending: new Map() };
		worker.onmessage = (event: MessageEvent<FormatWorkerResponse>) => {
			const p = entry.pending.get(event.data.id);
			if (!p) return;
			entry.pending.delete(event.data.id);
			clearTimeout(p.timer);
			p.resolve(event.data.result);
		};
		worker.onerror = () => failGroup(group, 'worker-error');
		entries.set(group, entry);
		return entry;
	} catch {
		return null;
	}
}

export async function formatInWorker(text: string, language: Exclude<FormatLanguage, 'xml'>, options: FormatOptions): Promise<FormatRunResult> {
	const group = workerGroupFor(language, text);
	const entry = group ? getEntry(group) : null;
	if (!group || !entry) {
		const [{ runFormat }, { allLoaders }] = await Promise.all([import('@/lib/format-run'), import('@/lib/format-loaders')]);
		return runFormat(text, language, options, allLoaders);
	}
	return new Promise((resolve) => {
		const id = nextId++;
		const timer = setTimeout(() => failGroup(group, FORMAT_TIMEOUT_MESSAGE), FORMAT_TIMEOUT_MS);
		entry.pending.set(id, { resolve, timer });
		entry.worker.postMessage({ id, text, language, options } satisfies FormatWorkerRequest);
	});
}
