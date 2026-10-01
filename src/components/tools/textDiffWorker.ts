/// <reference lib="webworker" />

import { analyzeDiffInput, buildLineDiff, compileIgnorePatterns, preprocessDiffInput, type DiffGranularity, type DiffInputNotes, type DiffLineEntry } from '@/lib/text-diff';

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
	/** Regex sources removed from every line before comparing (see DiffOptions.ignorePatterns). */
	ignorePatterns?: string[];
}

export interface TextDiffResponse {
	requestId: number;
	entries: DiffLineEntry[];
	notes: DiffInputNotes;
	error?: string;
}

self.onmessage = (event: MessageEvent<TextDiffRequest>) => {
	const { requestId, original, changed, granularity, ignoreCase, ignoreWhitespace, ignoreEmptyLines, normalizeLineEndings, normalizeUnicode, ignorePatterns } =
		event.data;
	const emptyNotes: DiffInputNotes = { lineEndingsDiffer: false, trailingNewlineDiffers: false };
	try {
		const preprocessOptions = { normalizeLineEndings, normalizeUnicode, ignoreEmptyLines };
		const left = preprocessDiffInput(original, preprocessOptions);
		const right = preprocessDiffInput(changed, preprocessOptions);
		const entries = buildLineDiff(left, right, granularity, {
			ignoreCase,
			ignoreWhitespace,
			ignorePatterns: compileIgnorePatterns(ignorePatterns ?? []).patterns,
		});
		const notes = analyzeDiffInput(original, changed, left, right);
		postMessage({ requestId, entries, notes } satisfies TextDiffResponse);
	} catch (error) {
		postMessage({ requestId, entries: [], notes: emptyNotes, error: String(error) } satisfies TextDiffResponse);
	}
};
