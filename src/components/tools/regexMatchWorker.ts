/// <reference lib="webworker" />

export interface RegexMatchRequest {
	requestId: number;
	pattern: string;
	flags: string;
	testString: string;
	replacement: string;
}

export interface RegexMatchGroup {
	fullMatch: string;
	index: number;
	groups: (string | undefined)[];
	namedGroups: Record<string, string | undefined> | null;
}

export interface RegexMatchResponse {
	requestId: number;
	error: string | null;
	matches: RegexMatchGroup[];
	replaceResult: string | null;
}

self.onmessage = (event: MessageEvent<RegexMatchRequest>) => {
	const { requestId, pattern, flags, testString, replacement } = event.data;
	try {
		const displayFlags = flags.includes('g') ? flags : `${flags}g`;
		const displayRegex = new RegExp(pattern, displayFlags);
		const found = [...testString.matchAll(displayRegex)];
		const matches: RegexMatchGroup[] = found.map((m) => ({
			fullMatch: m[0],
			index: m.index ?? 0,
			groups: m.slice(1),
			namedGroups: m.groups ? { ...m.groups } : null,
		}));

		let replaceResult: string | null = null;
		try {
			const replaceRegex = new RegExp(pattern, flags);
			replaceResult = testString.replace(replaceRegex, replacement);
		} catch {
			replaceResult = null;
		}

		postMessage({ requestId, error: null, matches, replaceResult } satisfies RegexMatchResponse);
	} catch (err) {
		postMessage({
			requestId,
			error: err instanceof Error ? err.message : 'invalid pattern',
			matches: [],
			replaceResult: null,
		} satisfies RegexMatchResponse);
	}
};
