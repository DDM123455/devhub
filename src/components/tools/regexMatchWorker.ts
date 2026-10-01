/// <reference lib="webworker" />

import { runRegex, runRegexTests, type RegexMatchGroup } from '@/lib/regex-match';

export type { RegexMatchGroup };

export interface RegexMatchRequest {
	requestId: number;
	pattern: string;
	flags: string;
	testString: string;
	replacement: string;
	/** Texts for the unit-test panel; each is tested independently. */
	tests?: string[];
}

export interface RegexMatchResponse {
	requestId: number;
	error: string | null;
	/** At most MAX_RETURNED_MATCHES entries — enough to display; see totalCount for the real number. */
	matches: RegexMatchGroup[];
	/** Number of matches found (counting stops at MAX_COUNTED_MATCHES; see countCapped). */
	totalCount: number;
	countCapped: boolean;
	replaceResult: string | null;
	/** One entry per requested test text: did the pattern match anywhere in it? */
	testResults: boolean[];
}

/** Sent once when the worker script has been loaded, so the caller's timeout excludes startup time. */
export interface RegexWorkerReady {
	ready: true;
}

self.onmessage = (event: MessageEvent<RegexMatchRequest>) => {
	const { requestId, pattern, flags, testString, replacement, tests } = event.data;
	try {
		const result = runRegex(pattern, flags, testString, replacement);
		const testResults = tests && tests.length > 0 ? runRegexTests(pattern, flags, tests) : [];
		postMessage({ requestId, error: null, ...result, testResults } satisfies RegexMatchResponse);
	} catch (err) {
		postMessage({
			requestId,
			error: err instanceof Error ? err.message : 'invalid pattern',
			matches: [],
			totalCount: 0,
			countCapped: false,
			replaceResult: null,
			testResults: [],
		} satisfies RegexMatchResponse);
	}
};

postMessage({ ready: true } satisfies RegexWorkerReady);
