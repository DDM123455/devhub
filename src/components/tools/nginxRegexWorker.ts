/// <reference lib="webworker" />

import {
	simulateRewrite,
	testNginxLocationRegex,
	type RegexTestResult,
	type RewriteSimulationResult,
} from '@/lib/nginx-parser';

export type NginxRegexRequest =
	| { kind: 'location'; pattern: string; caseInsensitive: boolean; testUrl: string }
	| { kind: 'rewrite'; pattern: string; replacement: string; testUrl: string };

export type NginxRegexResult = RegexTestResult | RewriteSimulationResult;

// User-supplied regexes can backtrack catastrophically (ReDoS); running them here lets the page
// terminate the worker after a timeout instead of freezing the tab.
self.onmessage = (event: MessageEvent<NginxRegexRequest & { requestId: number }>) => {
	const data = event.data;
	const result: NginxRegexResult =
		data.kind === 'location'
			? testNginxLocationRegex(data.pattern, data.caseInsensitive, data.testUrl)
			: simulateRewrite(data.pattern, data.replacement, data.testUrl);
	postMessage({ requestId: data.requestId, result });
};

postMessage({ ready: true });
