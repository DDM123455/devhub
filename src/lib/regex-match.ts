// Core matching loop for the Regex Tester, shared by the Web Worker and the unit tests.

export interface RegexMatchGroup {
	fullMatch: string;
	index: number;
	groups: (string | undefined)[];
	namedGroups: Record<string, string | undefined> | null;
	/** [start, end) of the full match and every group — only present when the `d` flag is set. */
	indices?: Array<[number, number] | null>;
}

export interface RegexRunResult {
	/** At most `maxReturned` entries — enough to display; see totalCount for the real number. */
	matches: RegexMatchGroup[];
	/** Number of matches found (counting stops at `maxCounted`; see countCapped). */
	totalCount: number;
	countCapped: boolean;
	replaceResult: string | null;
}

export const MAX_RETURNED_MATCHES = 500;
export const MAX_COUNTED_MATCHES = 100_000;

// Throws the RegExp SyntaxError for an invalid pattern/flags combination.
export function runRegex(
	pattern: string,
	flags: string,
	testString: string,
	replacement: string,
	maxReturned = MAX_RETURNED_MATCHES,
	maxCounted = MAX_COUNTED_MATCHES,
): RegexRunResult {
	const isGlobal = flags.includes('g');
	const isUnicode = flags.includes('u') || flags.includes('v');
	const regex = new RegExp(pattern, flags);

	const matches: RegexMatchGroup[] = [];
	let totalCount = 0;
	let countCapped = false;
	// Without the `g` flag a regex only ever matches ONCE (that's what String.replace does too),
	// so the match list shows just the first match to stay consistent with the Replace result.
	for (;;) {
		const m = regex.exec(testString);
		if (m === null) break;
		totalCount += 1;
		if (matches.length < maxReturned) {
			matches.push({
				fullMatch: m[0],
				index: m.index,
				groups: m.slice(1),
				namedGroups: m.groups ? { ...m.groups } : null,
				...((m as RegExpExecArray & { indices?: Array<[number, number] | undefined> }).indices
					? {
							indices: (m as RegExpExecArray & { indices: Array<[number, number] | undefined> }).indices.map((pair) =>
								pair ? ([pair[0], pair[1]] as [number, number]) : null,
							),
						}
					: {}),
			});
		}
		if (!isGlobal) break;
		if (totalCount >= maxCounted) {
			countCapped = true;
			break;
		}
		if (m[0] === '') {
			// Zero-length match: advance manually (by a full code point in unicode mode)
			// or the loop would never terminate.
			const code = testString.codePointAt(regex.lastIndex);
			regex.lastIndex += isUnicode && code !== undefined && code > 0xffff ? 2 : 1;
			if (regex.lastIndex > testString.length) break;
		}
	}

	let replaceResult: string | null = null;
	try {
		replaceResult = testString.replace(new RegExp(pattern, flags), replacement);
	} catch {
		replaceResult = null;
	}
	return { matches, totalCount, countCapped, replaceResult };
}

export interface RegexTestCase {
	/** The text to test. */
	text: string;
	/** true = the pattern must match somewhere in the text; false = it must not. */
	shouldMatch: boolean;
}

// Parses the unit-test textarea: "+ text" must match, "- text" must NOT match; other lines ignored.
export function parseRegexTestCases(source: string): RegexTestCase[] {
	const cases: RegexTestCase[] = [];
	for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
		const m = /^([+-])\s?(.*)$/.exec(line);
		if (m) cases.push({ text: m[2], shouldMatch: m[1] === '+' });
	}
	return cases;
}

// Returns, per case, whether the pattern matched anywhere in the text (the g/y flags are
// dropped so every case is evaluated independently). Throws on an invalid pattern.
export function runRegexTests(pattern: string, flags: string, texts: string[]): boolean[] {
	const regex = new RegExp(pattern, flags.replace(/[gy]/g, ''));
	return texts.map((text) => regex.test(text));
}
