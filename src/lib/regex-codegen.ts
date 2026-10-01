// Generates ready-to-paste snippets for several languages from an ECMAScript pattern + flags.
// The pattern itself is not translated between flavors except for the well-known differences
// (named-group syntax, flag mapping, replacement tokens); lookbehind/backrefs etc. may behave
// differently in the target engine — the UI says so.

export type CodegenLanguage = 'javascript' | 'python' | 'php' | 'go' | 'java' | 'csharp' | 'ruby';

export const CODEGEN_LANGUAGES: CodegenLanguage[] = ['javascript', 'python', 'php', 'go', 'java', 'csharp', 'ruby'];

type ReplToken = { type: 'text'; value: string } | { type: 'group'; ref: string } | { type: 'whole' };

// Splits a JS replacement string into literal text / group refs / whole-match tokens.
export function parseReplacement(repl: string): ReplToken[] {
	const tokens: ReplToken[] = [];
	let text = '';
	const flush = () => {
		if (text) tokens.push({ type: 'text', value: text });
		text = '';
	};
	for (let i = 0; i < repl.length; i++) {
		const c = repl[i];
		if (c === '$') {
			const rest = repl.slice(i + 1);
			if (rest[0] === '$') {
				text += '$';
				i += 1;
			} else if (rest[0] === '&') {
				flush();
				tokens.push({ type: 'whole' });
				i += 1;
			} else {
				const named = /^<([^>]+)>/.exec(rest);
				const num = /^(\d{1,2})/.exec(rest);
				if (named) {
					flush();
					tokens.push({ type: 'group', ref: named[1] });
					i += named[0].length;
				} else if (num) {
					flush();
					tokens.push({ type: 'group', ref: num[1] });
					i += num[1].length;
				} else text += c;
			}
		} else text += c;
	}
	flush();
	return tokens;
}

function convertReplacement(lang: CodegenLanguage, repl: string): string {
	const tokens = parseReplacement(repl);
	const isName = (ref: string) => !/^\d+$/.test(ref);
	return tokens
		.map((t) => {
			if (t.type === 'text') {
				// Escape characters that are special in the target replacement syntax.
				if (lang === 'python' || lang === 'ruby') return t.value.replace(/\\/g, '\\\\');
				if (lang === 'java') return t.value.replace(/[\\$]/g, '\\$&');
				if (lang === 'go' || lang === 'csharp') return t.value.replace(/\$/g, '$$$$');
				return t.value;
			}
			if (t.type === 'whole') {
				return { javascript: '$&', python: '\\g<0>', php: '$0', go: '${0}', java: '$0', csharp: '$&', ruby: '\\0' }[lang];
			}
			const r = t.ref;
			switch (lang) {
				case 'javascript':
					return isName(r) ? `$<${r}>` : `$${r}`;
				case 'python':
					return `\\g<${r}>`;
				case 'php':
					return isName(r) ? `\${${r}}` : `\${${r}}`;
				case 'go':
					return `\${${r}}`;
				case 'java':
					return isName(r) ? `\${${r}}` : `$${r}`;
				case 'csharp':
					return `\${${r}}`;
				case 'ruby':
					return isName(r) ? `\\k<${r}>` : `\\${r}`;
			}
		})
		.join('');
}

// (?<name>…) -> (?P<name>…) and \k<name> -> (?P=name) for Python/Go (RE2 also accepts (?P<name>)).
function convertNamedGroups(pattern: string, style: 'python' | 'go'): string {
	let out = pattern.replace(/\(\?<(?![=!])([^>]+)>/g, '(?P<$1>');
	if (style === 'python') out = out.replace(/\\k<([^>]+)>/g, '(?P=$1)');
	return out;
}

function jsString(s: string): string {
	return JSON.stringify(s)
		.split(String.fromCharCode(0x2028))
		.join('\\u2028')
		.split(String.fromCharCode(0x2029))
		.join('\\u2029');
}

function pyString(s: string): string {
	if (!/["\n\r]/.test(s) && !s.endsWith('\\')) return `r"${s}"`;
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

function phpPattern(pattern: string, flags: string): string {
	const delimited = `/${pattern.replace(/\//g, '\\/')}/${flags}`;
	let out = '';
	for (let i = 0; i < delimited.length; i++) {
		const c = delimited[i];
		if (c === "'") out += "\\'";
		else if (c === '\\') {
			const next = delimited[i + 1];
			out += next === undefined || next === '\\' || next === "'" ? '\\\\' : '\\';
		} else out += c;
	}
	return `'${out}'`;
}

function goString(s: string): string {
	if (!s.includes('`')) return `\`${s}\``;
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function javaString(s: string): string {
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

function csString(s: string): string {
	return `@"${s.replace(/"/g, '""')}"`;
}

function rubyLiteral(pattern: string, flags: string): string {
	const body = pattern.replace(/(^|[^\\])((?:\\\\)*)\//g, '$1$2\\/');
	let f = '';
	// ECMAScript `s` (dot matches newline) is Ruby's `m`; `^`/`$` are always per-line in Ruby.
	if (flags.includes('i')) f += 'i';
	if (flags.includes('s')) f += 'm';
	return `/${body}/${f}`;
}

export function generateRegexCode(lang: CodegenLanguage, pattern: string, flags: string, replacement: string): string {
	const global = flags.includes('g');
	const i = flags.includes('i');
	const m = flags.includes('m');
	const s = flags.includes('s');
	const u = flags.includes('u') || flags.includes('v');
	const hasRepl = replacement !== '';
	const lines: string[] = [];

	switch (lang) {
		case 'javascript': {
			const f = flags;
			lines.push(`const re = new RegExp(${jsString(pattern)}, ${jsString(f)});`);
			lines.push('const text = "...";');
			lines.push(global ? 'const matches = [...text.matchAll(re)];' : 'const match = re.exec(text);');
			if (hasRepl) lines.push(`const result = text.replace(re, ${jsString(replacement)});`);
			break;
		}
		case 'python': {
			const opts = [i && 're.IGNORECASE', m && 're.MULTILINE', s && 're.DOTALL'].filter(Boolean).join(' | ');
			lines.push('import re');
			lines.push('');
			lines.push(`pattern = re.compile(${pyString(convertNamedGroups(pattern, 'python'))}${opts ? `, ${opts}` : ''})`);
			lines.push('text = "..."');
			lines.push(global ? 'matches = [m.group(0) for m in pattern.finditer(text)]' : 'match = pattern.search(text)');
			if (hasRepl) lines.push(`result = pattern.sub(${pyString(convertReplacement('python', replacement))}, text${global ? '' : ', count=1'})`);
			break;
		}
		case 'php': {
			const f = [i && 'i', m && 'm', s && 's', u && 'u'].filter(Boolean).join('');
			lines.push('<?php');
			lines.push(`$pattern = ${phpPattern(pattern, f)};`);
			lines.push('$text = "...";');
			lines.push(global ? 'preg_match_all($pattern, $text, $matches, PREG_SET_ORDER);' : 'preg_match($pattern, $text, $match);');
			if (hasRepl) {
				const phpRepl = `'${convertReplacement('php', replacement).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
				lines.push(`$result = preg_replace($pattern, ${phpRepl}, $text${global ? '' : ', 1'});`);
			}
			break;
		}
		case 'go': {
			const prefix = [i && 'i', m && 'm', s && 's'].filter(Boolean).join('');
			const body = (prefix ? `(?${prefix})` : '') + convertNamedGroups(pattern, 'go');
			lines.push('import "regexp"');
			lines.push('');
			lines.push(`re := regexp.MustCompile(${goString(body)})`);
			lines.push('text := "..."');
			lines.push(global ? 'matches := re.FindAllStringSubmatch(text, -1)' : 'match := re.FindStringSubmatch(text)');
			if (hasRepl) {
				const goRepl = convertReplacement('go', replacement);
				lines.push(
					global
						? `result := re.ReplaceAllString(text, ${goString(goRepl)})`
						: `// Go has no replace-first helper: use FindStringSubmatchIndex + re.ExpandString, or ReplaceAllString for all matches.\nresult := re.ReplaceAllString(text, ${goString(goRepl)})`,
				);
			}
			if (/\(\?<?[=!]|\\[1-9]|\\k</.test(pattern)) lines.push('// Note: Go (RE2) does not support lookaround or backreferences.');
			break;
		}
		case 'java': {
			const opts = [i && 'Pattern.CASE_INSENSITIVE', m && 'Pattern.MULTILINE', s && 'Pattern.DOTALL', u && 'Pattern.UNICODE_CASE']
				.filter(Boolean)
				.join(' | ');
			lines.push('import java.util.regex.*;');
			lines.push('');
			lines.push(`Pattern pattern = Pattern.compile(${javaString(pattern)}${opts ? `, ${opts}` : ''});`);
			lines.push('Matcher matcher = pattern.matcher("...");');
			lines.push(global ? 'while (matcher.find()) {\n    String match = matcher.group();\n}' : 'if (matcher.find()) {\n    String match = matcher.group();\n}');
			if (hasRepl) {
				lines.push(`String result = pattern.matcher("...").${global ? 'replaceAll' : 'replaceFirst'}(${javaString(convertReplacement('java', replacement))});`);
			}
			break;
		}
		case 'csharp': {
			const opts = [i && 'RegexOptions.IgnoreCase', m && 'RegexOptions.Multiline', s && 'RegexOptions.Singleline'].filter(Boolean).join(' | ');
			lines.push('using System.Text.RegularExpressions;');
			lines.push('');
			lines.push(`var re = new Regex(${csString(pattern)}${opts ? `, ${opts}` : ''});`);
			lines.push('var text = "...";');
			lines.push(global ? 'MatchCollection matches = re.Matches(text);' : 'Match match = re.Match(text);');
			if (hasRepl) lines.push(`var result = re.Replace(text, ${csString(convertReplacement('csharp', replacement))}${global ? '' : ', 1'});`);
			break;
		}
		case 'ruby': {
			lines.push(`re = ${rubyLiteral(pattern, flags)}`);
			lines.push('text = "..."');
			lines.push(global ? 'matches = text.scan(re)' : 'match = text.match(re)');
			if (hasRepl) lines.push(`result = text.${global ? 'gsub' : 'sub'}(re, ${javaString(convertReplacement('ruby', replacement))})`);
			break;
		}
	}
	return lines.join('\n');
}
