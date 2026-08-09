// Hand-rolled nginx.conf parser + linter — no dependency added, same "hand-roll
// it in pure JS" precedent as this repo's BMP/ICO encoders and Regex Tester's
// own match engine. nginx's real config grammar has no formal public spec
// (it's whatever nginx's own C tokenizer accepts), so this covers the common,
// well-documented subset: `{ }` blocks, `;`-terminated directives, `#`
// line comments, single/double-quoted strings. It is NOT a full reimplementation
// of nginx's parser or of Gixy's full rule set — see the rule list below for
// exactly what is (and isn't) checked.

export type Severity = 'error' | 'warning';

export interface NginxIssue {
	line: number;
	severity: Severity;
	ruleId: string;
	message: string;
}

export interface NginxNode {
	type: 'directive' | 'block';
	name: string;
	args: string[];
	line: number;
	children?: NginxNode[];
}

export interface NginxParseResult {
	issues: NginxIssue[];
	root: NginxNode;
}

interface Token {
	kind: 'word' | 'open' | 'close' | 'semi';
	value?: string;
	line: number;
}

// Directives common enough to name-check against for the "did you forget a
// semicolon?" heuristic below (see `checkMissingSemicolonHeuristic`) — this
// list intentionally overlaps `DIRECTIVE_CONTEXTS`' keys plus a few more
// frequently-typed ones, since the heuristic only needs "is this word a
// directive name", not full context validity.
const KNOWN_DIRECTIVE_NAMES = new Set<string>();

// Contexts a directive is valid in. Not exhaustive — covers the directives
// common enough to appear in a hand-written config, or listed explicitly in
// the security checks below. An unlisted directive is assumed context-free
// (no context error raised) rather than guessed at, since a false "wrong
// context" report is worse than staying silent on a directive we don't know.
const DIRECTIVE_CONTEXTS: Record<string, string[]> = {
	worker_processes: ['main'],
	worker_connections: ['events'],
	pid: ['main'],
	user: ['main'],
	error_log: ['main', 'http', 'server', 'location'],
	events: ['main'],
	http: ['main'],
	include: ['main', 'http', 'server', 'location', 'events', 'upstream'],
	server: ['http'],
	upstream: ['http'],
	listen: ['server'],
	server_name: ['server'],
	root: ['http', 'server', 'location'],
	index: ['http', 'server', 'location'],
	location: ['server', 'location'],
	proxy_pass: ['location', 'if'],
	proxy_set_header: ['http', 'server', 'location'],
	proxy_redirect: ['http', 'server', 'location'],
	rewrite: ['server', 'location', 'if'],
	return: ['server', 'location', 'if'],
	try_files: ['server', 'location'],
	gzip: ['http', 'server', 'location'],
	gzip_types: ['http', 'server', 'location'],
	ssl_certificate: ['http', 'server'],
	ssl_certificate_key: ['http', 'server'],
	client_max_body_size: ['http', 'server', 'location'],
	add_header: ['http', 'server', 'location'],
	autoindex: ['http', 'server', 'location'],
	server_tokens: ['http', 'server', 'location'],
	deny: ['http', 'server', 'location'],
	allow: ['http', 'server', 'location'],
	internal: ['location'],
	alias: ['location'],
	fastcgi_pass: ['location', 'if'],
	limit_req: ['http', 'server', 'location'],
	limit_req_zone: ['http'],
	map: ['http'],
	log_format: ['http'],
	access_log: ['main', 'http', 'server', 'location'],
	keepalive_timeout: ['http', 'server', 'location'],
	sendfile: ['http', 'server', 'location'],
	set: ['server', 'location', 'if'],
	if: ['server', 'location'],
	expires: ['http', 'server', 'location'],
	charset: ['http', 'server', 'location'],
	error_page: ['http', 'server', 'location'],
	resolver: ['http', 'server'],
	proxy_connect_timeout: ['http', 'server', 'location'],
	proxy_read_timeout: ['http', 'server', 'location'],
	proxy_send_timeout: ['http', 'server', 'location'],
};

for (const name of Object.keys(DIRECTIVE_CONTEXTS)) KNOWN_DIRECTIVE_NAMES.add(name);

// Blocks that open a nested context named after themselves (`server { ... }`
// pushes context "server"), vs. directives that just happen to take `{ }`-like
// looking args (there are none in practice — every nginx block IS one of these).
const BLOCK_CONTEXT_NAMES = new Set([
	'http',
	'events',
	'server',
	'location',
	'upstream',
	'if',
	'map',
	'types',
	'geo',
	'limit_except',
]);

function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let line = 1;
	let i = 0;
	let word = '';
	let wordStartLine = line;

	const pushWord = () => {
		if (word !== '') {
			tokens.push({ kind: 'word', value: word, line: wordStartLine });
			word = '';
		}
	};

	while (i < input.length) {
		const ch = input[i];

		if (ch === '#') {
			while (i < input.length && input[i] !== '\n') i++;
			continue;
		}

		if (ch === "'" || ch === '"') {
			const quote = ch;
			if (word === '') wordStartLine = line;
			let raw = ch;
			i++;
			while (i < input.length && input[i] !== quote) {
				if (input[i] === '\\') {
					raw += input[i] + (input[i + 1] ?? '');
					i += 2;
					continue;
				}
				if (input[i] === '\n') line++;
				raw += input[i];
				i++;
			}
			raw += input[i] ?? '';
			i++;
			word += raw;
			continue;
		}

		if (ch === '{' || ch === '}' || ch === ';') {
			pushWord();
			tokens.push({ kind: ch === '{' ? 'open' : ch === '}' ? 'close' : 'semi', line });
			i++;
			continue;
		}

		if (ch === '\n') {
			pushWord();
			line++;
			i++;
			continue;
		}
		if (/\s/.test(ch)) {
			pushWord();
			i++;
			continue;
		}

		if (word === '') wordStartLine = line;
		word += ch;
		i++;
	}
	pushWord();
	return tokens;
}

function stripQuotes(raw: string): string {
	if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
		return raw.slice(1, -1);
	}
	return raw;
}

// Heuristic for the single most common real-world typo: forgetting the `;`
// at the end of a directive, so the next directive's name and args silently
// become extra args of the previous one instead of a parse error (nginx's
// grammar genuinely doesn't require newlines between directives, only `;`/
// `{`/`}` — so this can't be detected as a hard grammar violation the way a
// brace mismatch can). The heuristic: within one un-terminated word run, if a
// later word both (a) starts a new source line AND (b) exactly matches a
// known directive name, that's very likely "directive A" + "directive B"
// fused together by a missing `;`, not a legitimate multi-line argument list
// (real multi-word directive args are essentially never also valid directive
// names). Flagged as a warning, not an error, since it's a heuristic.
function checkMissingSemicolonHeuristic(words: Token[], issues: NginxIssue[]) {
	if (words.length < 2) return;
	const firstLine = words[0].line;
	for (let i = 1; i < words.length; i++) {
		const w = words[i];
		if (w.line === firstLine) continue;
		const bare = stripQuotes(w.value ?? '');
		if (KNOWN_DIRECTIVE_NAMES.has(bare)) {
			issues.push({
				line: w.line,
				severity: 'warning',
				ruleId: 'possible-missing-semicolon',
				message: `"${bare}" looks like it starts a new directive, but the previous line has no ";" — did you forget one after "${words[0].value}"?`,
			});
			return;
		}
	}
}

function buildTree(tokens: Token[]): { root: NginxNode; issues: NginxIssue[] } {
	const issues: NginxIssue[] = [];
	const root: NginxNode = { type: 'block', name: 'main', args: [], line: 0, children: [] };
	const stack: NginxNode[] = [root];

	let pending: Token[] = [];

	const contextNameForStack = (): string => {
		for (let i = stack.length - 1; i >= 0; i--) {
			const name = stack[i].name;
			if (name === 'main' || BLOCK_CONTEXT_NAMES.has(name)) return name;
		}
		return 'main';
	};

	const checkContext = (node: NginxNode) => {
		const allowed = DIRECTIVE_CONTEXTS[node.name];
		if (!allowed) return;
		const current = contextNameForStack();
		if (!allowed.includes(current)) {
			issues.push({
				line: node.line,
				severity: 'error',
				ruleId: 'wrong-context',
				message: `"${node.name}" is not valid inside the "${current}" block — valid in: ${allowed.join(', ')}.`,
			});
		}
	};

	for (const token of tokens) {
		if (token.kind === 'word') {
			pending.push(token);
			continue;
		}
		if (token.kind === 'semi') {
			if (pending.length > 0) {
				checkMissingSemicolonHeuristic(pending, issues);
				const [nameTok, ...argToks] = pending;
				const node: NginxNode = {
					type: 'directive',
					name: stripQuotes(nameTok.value ?? ''),
					args: argToks.map((t) => stripQuotes(t.value ?? '')),
					line: nameTok.line,
				};
				stack[stack.length - 1].children!.push(node);
				checkContext(node);
			}
			pending = [];
			continue;
		}
		if (token.kind === 'open') {
			if (pending.length > 0) checkMissingSemicolonHeuristic(pending, issues);
			const [nameTok, ...argToks] = pending.length > 0 ? pending : [{ kind: 'word', value: '(anonymous)', line: token.line } as Token];
			const node: NginxNode = {
				type: 'block',
				name: stripQuotes(nameTok.value ?? ''),
				args: argToks.map((t) => stripQuotes(t.value ?? '')),
				line: nameTok.line,
				children: [],
			};
			stack[stack.length - 1].children!.push(node);
			checkContext(node);
			stack.push(node);
			pending = [];
			continue;
		}
		if (token.kind === 'close') {
			if (pending.length > 0) {
				issues.push({
					line: pending[0].line,
					severity: 'error',
					ruleId: 'missing-semicolon',
					message: `Directive "${pending[0].value}" is missing a terminating ";" before "}".`,
				});
				pending = [];
			}
			if (stack.length <= 1) {
				issues.push({
					line: token.line,
					severity: 'error',
					ruleId: 'unmatched-brace',
					message: 'Unexpected "}" with no matching "{".',
				});
			} else {
				stack.pop();
			}
			continue;
		}
	}

	if (pending.length > 0) {
		issues.push({
			line: pending[0].line,
			severity: 'error',
			ruleId: 'missing-semicolon',
			message: `Directive "${pending[0].value}" is missing a terminating ";" (reached end of file).`,
		});
	}
	if (stack.length > 1) {
		for (let i = stack.length - 1; i > 0; i--) {
			issues.push({
				line: stack[i].line,
				severity: 'error',
				ruleId: 'unmatched-brace',
				message: `Block "${stack[i].name}" opened here is never closed with "}".`,
			});
		}
	}

	return { root, issues };
}

// Security/best-practice checks, inspired by (but a small subset of) Gixy's
// rule set — see https://github.com/yandex/gixy for the full reference this
// only partially mirrors. Walks the already-built tree rather than raw text,
// so each check only fires in the right structural context.
function runSecurityChecks(root: NginxNode, issues: NginxIssue[]) {
	let hasServerTokensOff = false;

	const walk = (node: NginxNode) => {
		if (node.type === 'directive') {
			if (
				(node.name === 'return' || node.name === 'rewrite' || node.name === 'add_header') &&
				node.args.some((arg) => /\$uri\b/.test(arg) && !/\$request_uri\b/.test(arg))
			) {
				issues.push({
					line: node.line,
					severity: 'warning',
					ruleId: 'crlf-injection-risk',
					message: `"${node.name}" uses "$uri" (URL-decoded) — an attacker-controlled decoded value here can inject characters into the response. Prefer "$request_uri" (raw, unaltered) for redirects/headers unless you specifically need the decoded form.`,
				});
			}
			if (node.name === 'server_tokens' && node.args[0] === 'off') hasServerTokensOff = true;
			if (node.name === 'autoindex' && node.args[0] === 'on') {
				issues.push({
					line: node.line,
					severity: 'warning',
					ruleId: 'autoindex-enabled',
					message: '"autoindex on;" lists directory contents to any visitor when no index file exists — confirm this is intentional.',
				});
			}
		}
		for (const child of node.children ?? []) walk(child);
	};
	walk(root);

	if (!hasServerTokensOff) {
		issues.push({
			line: 1,
			severity: 'warning',
			ruleId: 'server-tokens-exposed',
			message: 'No "server_tokens off;" found anywhere — nginx will expose its exact version number in the Server response header and default error pages, which helps an attacker target known CVEs for that version.',
		});
	}
}

export function parseNginxConfig(input: string): NginxParseResult {
	const tokens = tokenize(input);
	const { root, issues } = buildTree(tokens);
	if (input.trim() !== '') runSecurityChecks(root, issues);
	issues.sort((a, b) => a.line - b.line);
	return { issues, root };
}

// --- Regex tester (for `location ~ pattern` / `location ~* pattern`) ---
// nginx's regex location matching is PCRE (via the bundled PCRE library),
// not JS RegExp — the two are close but not identical (e.g. PCRE supports
// possessive quantifiers/atomic groups that JS doesn't, and named group
// syntax differs slightly). This tester intentionally uses JS RegExp for a
// same-origin, dependency-free implementation and surfaces that caveat in
// the UI rather than silently pretending it's a perfect PCRE match.
export interface RegexTestResult {
	matched: boolean;
	error: string | null;
	groups: string[];
}

export function testNginxLocationRegex(pattern: string, caseInsensitive: boolean, testUrl: string): RegexTestResult {
	try {
		const re = new RegExp(pattern, caseInsensitive ? 'i' : '');
		const match = re.exec(testUrl);
		return { matched: match !== null, error: null, groups: match ? Array.from(match) : [] };
	} catch (err) {
		return { matched: false, error: (err as Error).message, groups: [] };
	}
}

// --- rewrite/return simulator ---
// Supports the common `rewrite <regex> <replacement> [flag];` form (capture
// groups `$1`, `$2`, ... in the replacement). nginx's full rewrite engine
// (named captures, `$args`, multi-pass rewrite loops per flag) is out of
// scope — this simulates the single most common case: one regex substitution
// against one test path.
export interface RewriteSimulationResult {
	outputUrl: string | null;
	error: string | null;
}

export function simulateRewrite(pattern: string, replacement: string, testUrl: string): RewriteSimulationResult {
	try {
		const re = new RegExp(pattern);
		if (!re.test(testUrl)) {
			return { outputUrl: null, error: 'Pattern does not match the test URL — rewrite would not apply.' };
		}
		const output = testUrl.replace(re, replacement.replace(/\$(\d)/g, '$$$1'));
		return { outputUrl: output, error: null };
	} catch (err) {
		return { outputUrl: null, error: (err as Error).message };
	}
}

// --- simple auto-fix for the two most common trivial mistakes ---
// Only handles what's safe to guess mechanically: appending a missing ";" at
// end-of-input, and appending missing "}" for each still-open block. Anything
// structurally ambiguous (e.g. "}" in the wrong place, or the heuristic
// possible-missing-semicolon case, which could be a real multi-line argument
// list) is left for the user to fix by hand.
export function autoFixTrivialIssues(input: string, result: NginxParseResult): string {
	let fixed = input.trimEnd();
	const missingSemicolonAtEof = result.issues.some(
		(issue) => issue.ruleId === 'missing-semicolon' && issue.message.includes('end of file'),
	);
	if (missingSemicolonAtEof && !fixed.endsWith(';') && !fixed.endsWith('}')) {
		fixed += ';';
	}
	const unclosedCount = result.issues.filter(
		(issue) => issue.ruleId === 'unmatched-brace' && issue.message.includes('is never closed'),
	).length;
	for (let i = 0; i < unclosedCount; i++) fixed += '\n}';
	return fixed;
}
