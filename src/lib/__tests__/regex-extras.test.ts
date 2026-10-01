import { describe, expect, it } from 'vitest';
import { explainRegex } from '../regex-explain';
import { REGEX_LIBRARY } from '../regex-library';
import { generateRegexCode, parseReplacement } from '../regex-codegen';
import { parseRegexTestCases, runRegex, runRegexTests } from '../regex-match';

describe('explainRegex', () => {
	it('explains tokens, groups, quantifiers and classes', () => {
		const items = explainRegex('^(?<year>\\d{4})-[a-z]+?$');
		expect(items.map((i) => [i.token, i.kind])).toEqual([
			['^', 'lineStart'],
			['(?<year>', 'groupNamed'],
			['\\d', 'digit'],
			['{4}', 'quantExact'],
			[')', 'groupEnd'],
			['-', 'literal'],
			['[a-z]', 'class'],
			['+?', 'quantPlusLazy'],
			['$', 'lineEnd'],
		]);
		expect(items[1].args).toEqual({ name: 'year' });
		expect(items[2].depth).toBe(1);
		expect(items[4].depth).toBe(0);
	});
	it('handles lookaround, backrefs, escapes, unicode props, negated class', () => {
		const kinds = explainRegex('(?=a)(?!b)(?<=c)(?<!d)\\1\\k<n>\\p{L}\\.[^x]\\u00e9|\\bfoo').map((i) => i.kind);
		expect(kinds).toEqual([
			'lookahead', 'literal', 'groupEnd', 'negLookahead', 'literal', 'groupEnd', 'lookbehind', 'literal', 'groupEnd',
			'negLookbehind', 'literal', 'groupEnd', 'backref', 'namedBackref', 'unicodeProp', 'escapeLiteral', 'classNegated',
			'unicodeEscape', 'alternation', 'wordBoundary', 'literalRun',
		]);
	});
	it('groups plain literal runs but keeps the quantified char alone', () => {
		const items = explainRegex('abc+');
		expect(items.map((i) => [i.token, i.kind])).toEqual([
			['ab', 'literalRun'],
			['c', 'literal'],
			['+', 'quantPlus'],
		]);
	});
	it('range and open quantifiers', () => {
		expect(explainRegex('a{2,5}b{3,}c{2}?').map((i) => i.kind)).toEqual(['literal', 'quantRange', 'literal', 'quantMin', 'literal', 'quantExactLazy']);
	});
});

describe('REGEX_LIBRARY', () => {
	it('every pattern compiles and matches its sample', () => {
		for (const entry of REGEX_LIBRARY) {
			const result = runRegex(entry.pattern, entry.flags, entry.sample, '');
			expect(result.totalCount, entry.id).toBeGreaterThan(0);
		}
	});
	it('spot checks', () => {
		const run = (id: string, text: string) => {
			const e = REGEX_LIBRARY.find((x) => x.id === id)!;
			return runRegex(e.pattern, e.flags, text, '').matches.map((m) => m.fullMatch);
		};
		expect(run('email', 'a@b.co\nbad@\nx.y+z@mail.example.org')).toEqual(['a@b.co', 'x.y+z@mail.example.org']);
		expect(run('ipv4', '1.2.3.4 256.1.1.1')).toEqual(['1.2.3.4']);
		expect(run('vnPhone', '0912345678 0123456789')).toEqual(['0912345678']);
		expect(run('isoDate', '2024-02-29 2024-13-01')).toEqual(['2024-02-29']);
		expect(run('strongPassword', 'Passw0rd!\nweakpass')).toEqual(['Passw0rd!']);
	});
});

describe('regex unit tests', () => {
	it('parses and runs cases', () => {
		const cases = parseRegexTestCases('+ abc\n- xyz\nignored\n+ zzabc');
		expect(cases).toEqual([
			{ text: 'abc', shouldMatch: true },
			{ text: 'xyz', shouldMatch: false },
			{ text: 'zzabc', shouldMatch: true },
		]);
		expect(runRegexTests('^abc$', 'g', cases.map((c) => c.text))).toEqual([true, false, false]);
	});
});

describe('hasIndices (d flag)', () => {
	it('returns group spans', () => {
		const result = runRegex('(b)(c)?', 'dg', 'abc', '');
		expect(result.matches[0].indices).toEqual([[1, 3], [1, 2], [2, 3]]);
	});
});

describe('generateRegexCode', () => {
	const p = '(?<y>\\d{4})-\\d+';
	it('javascript', () => {
		const code = generateRegexCode('javascript', p, 'gi', '$<y>!');
		expect(code).toContain('new RegExp("(?<y>\\\\d{4})-\\\\d+", "gi")');
		expect(code).toContain('matchAll');
		expect(code).toContain('text.replace(re, "$<y>!")');
	});
	it('python converts named groups, flags and replacement', () => {
		const code = generateRegexCode('python', p, 'gim', '$<y>-$1');
		expect(code).toContain('r"(?P<y>\\d{4})-\\d+"');
		expect(code).toContain('re.IGNORECASE | re.MULTILINE');
		expect(code).toContain('\\g<y>-\\g<1>');
	});
	it('php escapes delimiters and quotes', () => {
		const code = generateRegexCode('php', "a/b'c\\d", 'i', '');
		expect(code).toContain("$pattern = '/a\\/b\\'c\\d/i';");
	});
	it('go uses a raw string, inline flags and warns about lookahead', () => {
		const code = generateRegexCode('go', '(?=a)b', 'i', '');
		expect(code).toContain('regexp.MustCompile(`(?i)(?=a)b`)');
		expect(code).toContain('RE2');
	});
	it('java / csharp / ruby', () => {
		expect(generateRegexCode('java', '\\d+"', 's', '')).toContain('Pattern.compile("\\\\d+\\"", Pattern.DOTALL)');
		expect(generateRegexCode('csharp', 'a"b', 'i', '')).toContain('new Regex(@"a""b", RegexOptions.IgnoreCase)');
		expect(generateRegexCode('ruby', 'a/b', 's', '')).toContain('re = /a\\/b/m');
	});
	it('parses replacement tokens', () => {
		expect(parseReplacement('a$1$<n>$&$$')).toEqual([
			{ type: 'text', value: 'a' },
			{ type: 'group', ref: '1' },
			{ type: 'group', ref: 'n' },
			{ type: 'whole' },
			{ type: 'text', value: '$' },
		]);
	});
});
