// Tiny ECMAScript regex tokenizer that turns a pattern into a flat, depth-annotated list of
// "token -> meaning" items. It covers the common syntax (classes, groups, lookaround, quantifiers,
// anchors, backreferences, escapes); anything exotic is reported as a literal/escape.
// The human-readable sentence for each `kind` lives in i18n (ui.x.explain.<kind>).

export interface ExplainItem {
	/** The exact source text of the token (e.g. `\d`, `(?<year>`, `{2,4}`). */
	token: string;
	/** i18n key suffix describing the token. */
	kind: string;
	/** Values substituted into the i18n template (`{{name}}`). */
	args?: Record<string, string>;
	/** Group nesting depth, for indentation. */
	depth: number;
}

const ESCAPES: Record<string, string> = {
	d: 'digit',
	D: 'notDigit',
	w: 'word',
	W: 'notWord',
	s: 'space',
	S: 'notSpace',
	b: 'wordBoundary',
	B: 'notWordBoundary',
	t: 'tab',
	n: 'newline',
	r: 'carriageReturn',
	f: 'formFeed',
	v: 'verticalTab',
	'0': 'nul',
};

export function explainRegex(pattern: string): ExplainItem[] {
	const items: ExplainItem[] = [];
	let depth = 0;
	let i = 0;
	const n = pattern.length;

	const push = (token: string, kind: string, args?: Record<string, string>, d = depth) => {
		items.push({ token, kind, args, depth: d });
	};

	while (i < n) {
		const c = pattern[i];

		if (c === '\\') {
			const next = pattern[i + 1];
			if (next === undefined) {
				push('\\', 'escapeLiteral', { char: '\\' });
				i += 1;
				continue;
			}
			// Backreferences: \1..\9 (and multi-digit), \k<name>
			if (/[1-9]/.test(next)) {
				const m = /^\\([1-9]\d*)/.exec(pattern.slice(i))!;
				push(m[0], 'backref', { n: m[1] });
				i += m[0].length;
				continue;
			}
			if (next === 'k' && pattern[i + 2] === '<') {
				const end = pattern.indexOf('>', i + 3);
				if (end !== -1) {
					push(pattern.slice(i, end + 1), 'namedBackref', { name: pattern.slice(i + 3, end) });
					i = end + 1;
					continue;
				}
			}
			if ((next === 'p' || next === 'P') && pattern[i + 2] === '{') {
				const end = pattern.indexOf('}', i + 3);
				if (end !== -1) {
					push(pattern.slice(i, end + 1), next === 'p' ? 'unicodeProp' : 'notUnicodeProp', { prop: pattern.slice(i + 3, end) });
					i = end + 1;
					continue;
				}
			}
			if (next === 'u' && pattern[i + 2] === '{') {
				const end = pattern.indexOf('}', i + 3);
				if (end !== -1) {
					push(pattern.slice(i, end + 1), 'unicodeEscape', { code: pattern.slice(i + 3, end) });
					i = end + 1;
					continue;
				}
			}
			const uni = /^\\u([0-9a-fA-F]{4})/.exec(pattern.slice(i));
			if (uni) {
				push(uni[0], 'unicodeEscape', { code: uni[1] });
				i += uni[0].length;
				continue;
			}
			const hex = /^\\x([0-9a-fA-F]{2})/.exec(pattern.slice(i));
			if (hex) {
				push(hex[0], 'hexEscape', { code: hex[1] });
				i += hex[0].length;
				continue;
			}
			const ctrl = /^\\c([A-Za-z])/.exec(pattern.slice(i));
			if (ctrl) {
				push(ctrl[0], 'controlEscape', { char: ctrl[1] });
				i += ctrl[0].length;
				continue;
			}
			if (ESCAPES[next]) {
				push(`\\${next}`, ESCAPES[next]);
				i += 2;
				continue;
			}
			push(`\\${next}`, 'escapeLiteral', { char: next });
			i += 2;
			continue;
		}

		if (c === '[') {
			// Character class: scan to the matching unescaped ] (nested [] allowed for the v flag).
			let j = i + 1;
			let nest = 1;
			if (pattern[j] === '^') j++;
			if (pattern[j] === ']' ) j++; // not valid ES, but keeps the scan from stopping at `[]`
			for (; j < n; j++) {
				if (pattern[j] === '\\') j++;
				else if (pattern[j] === '[') nest++;
				else if (pattern[j] === ']' && --nest === 0) break;
			}
			const token = pattern.slice(i, Math.min(j + 1, n));
			const negated = token.startsWith('[^');
			const inner = token.slice(negated ? 2 : 1, token.endsWith(']') ? -1 : undefined);
			push(token, negated ? 'classNegated' : 'class', { set: inner });
			i += token.length;
			continue;
		}

		if (c === '(') {
			if (pattern.startsWith('(?:', i)) {
				push('(?:', 'groupNonCapture');
				depth++;
				i += 3;
			} else if (pattern.startsWith('(?=', i)) {
				push('(?=', 'lookahead');
				depth++;
				i += 3;
			} else if (pattern.startsWith('(?!', i)) {
				push('(?!', 'negLookahead');
				depth++;
				i += 3;
			} else if (pattern.startsWith('(?<=', i)) {
				push('(?<=', 'lookbehind');
				depth++;
				i += 4;
			} else if (pattern.startsWith('(?<!', i)) {
				push('(?<!', 'negLookbehind');
				depth++;
				i += 4;
			} else if (pattern.startsWith('(?<', i)) {
				const end = pattern.indexOf('>', i + 3);
				if (end !== -1) {
					push(pattern.slice(i, end + 1), 'groupNamed', { name: pattern.slice(i + 3, end) });
					depth++;
					i = end + 1;
				} else {
					push('(', 'groupCapture');
					depth++;
					i += 1;
				}
			} else {
				push('(', 'groupCapture');
				depth++;
				i += 1;
			}
			continue;
		}

		if (c === ')') {
			depth = Math.max(0, depth - 1);
			push(')', 'groupEnd');
			i += 1;
			continue;
		}

		if (c === '|') {
			push('|', 'alternation');
			i += 1;
			continue;
		}
		if (c === '^') {
			push('^', 'lineStart');
			i += 1;
			continue;
		}
		if (c === '$') {
			push('$', 'lineEnd');
			i += 1;
			continue;
		}
		if (c === '.') {
			push('.', 'anyChar');
			i += 1;
			continue;
		}

		if (c === '*' || c === '+' || c === '?' || c === '{') {
			let token = c;
			let kind = '';
			let args: Record<string, string> | undefined;
			if (c === '{') {
				const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(pattern.slice(i));
				if (!m) {
					push('{', 'literal', { char: '{' });
					i += 1;
					continue;
				}
				token = m[0];
				if (!m[2]) {
					kind = 'quantExact';
					args = { n: m[1] };
				} else if (m[3] === '') {
					kind = 'quantMin';
					args = { n: m[1] };
				} else {
					kind = 'quantRange';
					args = { min: m[1], max: m[3] };
				}
			} else {
				kind = c === '*' ? 'quantStar' : c === '+' ? 'quantPlus' : 'quantOptional';
			}
			let lazy = false;
			if (pattern[i + token.length] === '?') {
				lazy = true;
				token += '?';
			}
			push(token, lazy ? `${kind}Lazy` : kind, args);
			i += token.length;
			continue;
		}

		// Literal run: consecutive plain characters, stopping before one that carries a quantifier.
		const isQuant = (ch: string | undefined) => ch !== undefined && /[*+?{]/.test(ch);
		const isPlain = (ch: string | undefined) => ch !== undefined && !/[\\[()|^$.*+?{]/.test(ch);
		let run = String.fromCodePoint(pattern.codePointAt(i)!);
		let end = i + run.length;
		while (!isQuant(pattern[end]) && isPlain(pattern[end])) {
			const cp = String.fromCodePoint(pattern.codePointAt(end)!);
			if (isQuant(pattern[end + cp.length])) break;
			run += cp;
			end += cp.length;
		}
		if (Array.from(run).length === 1) push(run, 'literal', { char: run });
		else push(run, 'literalRun', { text: run });
		i = end;
	}
	return items;
}
