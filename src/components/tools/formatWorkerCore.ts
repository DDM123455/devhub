/// <reference lib="webworker" />

import { runFormat, type FormatLoaders, type FormatRunResult } from '@/lib/format-run';
import type { FormatLanguage, FormatOptions } from '@/lib/format-languages';

// Shared message loop of the format workers. Formatting (prettier / sql-formatter) runs off the
// main thread so large inputs never freeze the page. Every language group has its own tiny entry
// file (formatWorker<Group>.ts) that passes in ONLY the libraries of that group.

export interface FormatWorkerRequest {
	id: number;
	text: string;
	language: Exclude<FormatLanguage, 'xml'>;
	options: FormatOptions;
}

export interface FormatWorkerResponse {
	id: number;
	result: FormatRunResult;
}

export function installFormatWorker(loaders: FormatLoaders): void {
	self.onmessage = async (event: MessageEvent<FormatWorkerRequest>) => {
		const { id, text, language, options } = event.data;
		const result = await runFormat(text, language, options, loaders);
		(self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, result } satisfies FormatWorkerResponse);
	};
}
