/// <reference lib="webworker" />

import { buildLineDiff, preprocessDiffInput, type DiffGranularity, type DiffLineEntry } from '@/lib/text-diff';

export interface TextDiffRequest {
	requestId: number;
	original: string;
	changed: string;
	granularity: DiffGranularity;
	ignoreCase: boolean;
	ignoreWhitespace: boolean;
	ignoreEmptyLines: boolean;
	normalizeLineEndings: boolean;
	normalizeUnicode: boolean;
}

export interface TextDiffResponse {
	requestId: number;
	entries: DiffLineEntry[];
}

self.onmessage = (event: MessageEvent<TextDiffRequest>) => {
	const { requestId, original, changed, granularity, ignoreCase, ignoreWhitespace, ignoreEmptyLines, normalizeLineEndings, normalizeUnicode } =
		event.data;
	const preprocessOptions = { normalizeLineEndings, normalizeUnicode, ignoreEmptyLines };
	const left = preprocessDiffInput(original, preprocessOptions);
	const right = preprocessDiffInput(changed, preprocessOptions);
	const entries = buildLineDiff(left, right, granularity, { ignoreCase, ignoreWhitespace });
	postMessage({ requestId, entries } satisfies TextDiffResponse);
};
