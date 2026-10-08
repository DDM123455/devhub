// Pure (DOM-free, dependency-free) logic for the Text Diff Checker's multi-language Format
// button: which languages exist, how to guess one from a file name or from the text itself,
// which prettier parser/plugins a language needs, size limits and error-position extraction.
// Heavy libraries are NOT imported here - see format-run.ts (loaded lazily inside a worker).

export type FormatLanguage =
	| 'json'
	| 'xml'
	| 'sql'
	| 'html'
	| 'css'
	| 'scss'
	| 'less'
	| 'javascript'
	| 'typescript'
	| 'yaml'
	| 'markdown'
	| 'graphql';

/** Display order of the language dropdown (after "Auto"). Labels are proper names, not translated. */
export const FORMAT_LANGUAGES: ReadonlyArray<{ id: FormatLanguage; label: string }> = [
	{ id: 'json', label: 'JSON' },
	{ id: 'xml', label: 'XML' },
	{ id: 'sql', label: 'SQL' },
	{ id: 'html', label: 'HTML' },
	{ id: 'css', label: 'CSS' },
	{ id: 'scss', label: 'SCSS' },
	{ id: 'less', label: 'LESS' },
	{ id: 'javascript', label: 'JavaScript / JSX' },
	{ id: 'typescript', label: 'TypeScript / TSX' },
	{ id: 'yaml', label: 'YAML' },
	{ id: 'markdown', label: 'Markdown' },
	{ id: 'graphql', label: 'GraphQL' },
];

export function languageLabel(id: FormatLanguage): string {
	return FORMAT_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export type IndentChoice = '2' | '4' | 'tab';
export const INDENT_CHOICES: ReadonlyArray<IndentChoice> = ['2', '4', 'tab'];
export const PRINT_WIDTHS: ReadonlyArray<number> = [80, 100, 120];

export interface FormatOptions {
	indent: IndentChoice;
	printWidth: number;
	sqlDialect: SqlDialect;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = { indent: '2', printWidth: 80, sqlDialect: 'sql' };

export function indentUnit(indent: IndentChoice): string {
	return indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
}

// ---------------------------------------------------------------------------
// SQL dialects (names match sql-formatter's `language` option)
// ---------------------------------------------------------------------------

export const SQL_DIALECTS = [
	{ id: 'sql', label: 'Standard SQL' },
	{ id: 'mysql', label: 'MySQL' },
	{ id: 'mariadb', label: 'MariaDB' },
	{ id: 'postgresql', label: 'PostgreSQL' },
	{ id: 'transactsql', label: 'SQL Server (T-SQL)' },
	{ id: 'sqlite', label: 'SQLite' },
	{ id: 'plsql', label: 'Oracle PL/SQL' },
	{ id: 'bigquery', label: 'BigQuery' },
	{ id: 'snowflake', label: 'Snowflake' },
	{ id: 'redshift', label: 'Redshift' },
	{ id: 'spark', label: 'Spark SQL' },
	{ id: 'trino', label: 'Trino' },
	{ id: 'db2', label: 'IBM Db2' },
] as const;
export type SqlDialect = (typeof SQL_DIALECTS)[number]['id'];

export function isSqlDialect(value: string): value is SqlDialect {
	return SQL_DIALECTS.some((d) => d.id === value);
}

// ---------------------------------------------------------------------------
// prettier mapping
// ---------------------------------------------------------------------------

export type PrettierPluginName = 'babel' | 'estree' | 'typescript' | 'postcss' | 'html' | 'markdown' | 'yaml' | 'graphql';
export type PrettierLanguage = Exclude<FormatLanguage, 'json' | 'xml' | 'sql'>;

export const PRETTIER_PARSERS: Record<PrettierLanguage, { parser: string; plugins: PrettierPluginName[] }> = {
	javascript: { parser: 'babel', plugins: ['babel', 'estree'] },
	typescript: { parser: 'typescript', plugins: ['typescript', 'estree'] },
	css: { parser: 'css', plugins: ['postcss'] },
	scss: { parser: 'scss', plugins: ['postcss'] },
	less: { parser: 'less', plugins: ['postcss'] },
	html: { parser: 'html', plugins: ['html'] },
	markdown: { parser: 'markdown', plugins: ['markdown'] },
	yaml: { parser: 'yaml', plugins: ['yaml'] },
	graphql: { parser: 'graphql', plugins: ['graphql'] },
};

export function isPrettierLanguage(language: FormatLanguage): language is PrettierLanguage {
	return language in PRETTIER_PARSERS;
}

function addPlugins(set: Set<PrettierPluginName>, names: PrettierPluginName[]) {
	for (const n of names) set.add(n);
}

/**
 * Plugins needed to format `text` as `language`. Embedded languages (script/style in HTML,
 * front matter / fenced code in Markdown) are only added when the text actually contains them,
 * so e.g. a plain CSS file loads postcss and nothing else.
 */
export function pluginsFor(language: PrettierLanguage, text: string): PrettierPluginName[] {
	const set = new Set<PrettierPluginName>(PRETTIER_PARSERS[language].plugins);
	if (language === 'html') {
		if (/<script\b/i.test(text)) addPlugins(set, ['babel', 'estree']);
		if (/<style\b/i.test(text)) addPlugins(set, ['postcss']);
	} else if (language === 'markdown') {
		if (/^\s*---\s*\n/.test(text)) addPlugins(set, ['yaml']);
		for (const m of text.matchAll(/^[ \t]*(?:```|~~~)[ \t]*([\w+-]+)/gm)) {
			const lang = m[1].toLowerCase();
			if (['js', 'jsx', 'javascript', 'json', 'json5', 'mjs', 'cjs'].includes(lang)) addPlugins(set, ['babel', 'estree']);
			else if (['ts', 'tsx', 'typescript'].includes(lang)) addPlugins(set, ['typescript', 'estree']);
			else if (['css', 'scss', 'less'].includes(lang)) addPlugins(set, ['postcss']);
			else if (['yaml', 'yml'].includes(lang)) addPlugins(set, ['yaml']);
			else if (['graphql', 'gql'].includes(lang)) addPlugins(set, ['graphql']);
			else if (['html', 'vue'].includes(lang)) addPlugins(set, ['html']);
		}
	}
	return [...set];
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Above this many characters the UI warns that formatting may take a while. */
export const FORMAT_WARN_CHARS = 300_000;
/** Above this many characters formatting is refused (the parsers would take minutes / run out of memory). */
export const FORMAT_MAX_CHARS = 2_000_000;
/** A format job that runs longer than this is aborted (worker terminated). */
export const FORMAT_TIMEOUT_MS = 60_000;

export type SizeCheck = 'ok' | 'warn' | 'tooLarge';
export function checkFormatSize(length: number): SizeCheck {
	if (length > FORMAT_MAX_CHARS) return 'tooLarge';
	return length > FORMAT_WARN_CHARS ? 'warn' : 'ok';
}

// ---------------------------------------------------------------------------
// File extension -> language
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, FormatLanguage> = {
	json: 'json',
	xml: 'xml',
	svg: 'xml',
	xsd: 'xml',
	xsl: 'xml',
	xslt: 'xml',
	rss: 'xml',
	atom: 'xml',
	plist: 'xml',
	csproj: 'xml',
	sql: 'sql',
	html: 'html',
	htm: 'html',
	xhtml: 'html',
	css: 'css',
	scss: 'scss',
	less: 'less',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'javascript',
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'typescript',
	yaml: 'yaml',
	yml: 'yaml',
	md: 'markdown',
	markdown: 'markdown',
	graphql: 'graphql',
	gql: 'graphql',
};

export function languageFromFileName(name: string | null | undefined): FormatLanguage | null {
	if (!name) return null;
	const match = /\.([A-Za-z0-9]+)$/.exec(name.trim());
	if (!match) return null;
	return EXTENSION_MAP[match[1].toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Content detection
// ---------------------------------------------------------------------------

export type DetectConfidence = 'high' | 'medium' | 'low';
export interface Detection {
	/** null when nothing plausible (or nothing decisive) was found. */
	language: FormatLanguage | null;
	confidence: DetectConfidence;
	source: 'extension' | 'content' | 'none';
	/** Plausible languages when ambiguous (used to tell the user what to choose from). */
	candidates: FormatLanguage[];
}

/** Auto-format only goes ahead for high / medium confidence; low means "ask the user". */
export function isDecisive(d: Detection): boolean {
	return d.language !== null && d.confidence !== 'low';
}

const none = (candidates: FormatLanguage[] = []): Detection => ({ language: null, confidence: 'low', source: 'none', candidates });

const HTML_TAGS = new Set(
	'html head body div span p a ul ol li table thead tbody tr td th form input button label select option textarea img br hr h1 h2 h3 h4 h5 h6 section nav header footer main article aside script style link meta title iframe pre code strong em b i small canvas video audio source'.split(
		' ',
	),
);

function looksLikeJson(trimmed: string): boolean {
	try {
		JSON.parse(trimmed);
		return true;
	} catch {
		return false;
	}
}

function detectMarkup(trimmed: string): Detection {
	if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return { language: 'html', confidence: 'high', source: 'content', candidates: [] };
	if (/^<\?xml[\s?]/i.test(trimmed)) {
		return /<html[\s>]/i.test(trimmed)
			? { language: 'html', confidence: 'medium', source: 'content', candidates: [] }
			: { language: 'xml', confidence: 'high', source: 'content', candidates: [] };
	}
	if (/^<!--/.test(trimmed) && !/^<!--[\s\S]*?-->\s*</.test(trimmed)) return none(['html', 'xml']);
	const tags = [...trimmed.matchAll(/<\/?([A-Za-z][\w:-]*)/g)].map((m) => m[1].toLowerCase());
	if (tags.length === 0) return none();
	const known = new Set(tags.filter((t) => HTML_TAGS.has(t)));
	const root = tags[0];
	if (/\sxmlns(?::\w+)?=/.test(trimmed) || root === 'svg') {
		return { language: 'xml', confidence: root === 'svg' || /<\w+:\w+/.test(trimmed) ? 'high' : 'medium', source: 'content', candidates: [] };
	}
	if (known.size >= 2 || (known.size === 1 && HTML_TAGS.has(root) && /^(div|p|ul|ol|table|h[1-6]|form|section|span|a)$/.test(root))) {
		return { language: 'html', confidence: known.size >= 2 ? 'high' : 'medium', source: 'content', candidates: [] };
	}
	if (known.size === 1) return none(['html', 'xml']);
	// Only unknown (custom) tag names: well-formed XML is the most likely reading.
	return { language: 'xml', confidence: 'medium', source: 'content', candidates: [] };
}

type Scores = Partial<Record<FormatLanguage, number>>;

function scoreText(text: string): Scores {
	const scores: Scores = {};
	const add = (lang: FormatLanguage, n: number) => {
		scores[lang] = (scores[lang] ?? 0) + n;
	};
	const lines = text.split(/\r?\n/);
	const nonEmpty = lines.filter((l) => l.trim() !== '');
	const noSqlComments = text.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)+/, '').trimStart();

	// --- SQL
	const sqlStart = /^(select|insert\s+into|update\s+[\w."`\[\]]+\s+set|delete\s+from|create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:table|view|index|unique|database|schema|function|procedure|trigger|sequence)|alter\s+table|drop\s+(?:table|view|index|database|schema)|truncate\s+table|merge\s+into|with\s+(?:recursive\s+)?[\w"`]+(?:\s*\([^)]*\))?\s+as\s*\(|replace\s+into|explain\b|grant\b|revoke\b)/i.exec(noSqlComments);
	if (sqlStart) {
		const kw = sqlStart[1].toLowerCase();
		const hasClause = /\b(from|where|join|group\s+by|order\s+by|values|set|into|limit|having|union)\b/i.test(noSqlComments);
		if (kw === 'select') add('sql', hasClause || /^select\s+(\*|[\w."`]+\s*,)/i.test(noSqlComments) ? 3 : 1);
		else add('sql', hasClause || /^(create|alter|drop|truncate)/i.test(kw) ? 3 : 2);
		if (/;\s*$/.test(noSqlComments)) add('sql', 0.5);
	}

	// --- GraphQL
	if (/^\s*(?:query|mutation|subscription|fragment)\b[^{;]*\{/.test(text) && !/\bfunction\b/.test(text)) add('graphql', 3);
	if (/^\s*(?:extend\s+)?(?:type|input|interface|enum)\s+\w+[^{=;]*\{\s*\w+\s*(?:\([^)]*\))?\s*:\s*[\[\w]/m.test(text)) add('graphql', 3);
	if (/^\s*(?:schema|scalar|union|enum)\s+\w+/m.test(text) && !scores.graphql) add('graphql', 1);

	// GraphQL SDL looks like a CSS rule without semicolons; a clear GraphQL match wins over that.
	const graphqlWins = (scores.graphql ?? 0) >= 3 && !/;/.test(text);

	// --- CSS family
	const cssRule = /[^{};]+\{\s*(?:[-\w]+\s*:\s*[^;{}]+;?\s*)+\}/.test(text.replace(/\/\*[\s\S]*?\*\//g, ''));
	const cssDecl = /^[ \t]*[-\w]+[ \t]*:[ \t]*[^;{}]+;[ \t]*$/m.test(text);
	const atRule = /^\s*@(?:media|import|font-face|keyframes|charset|supports|page|layer|namespace)\b/m.test(text);
	let cssBase = 0;
	if (cssRule) cssBase += 3;
	else if (text.includes('{') && (cssDecl || /[^{}\s][^{}]*\{\s*[-\w]+\s*:[^;{}]+;/.test(text))) cssBase += 2;
	if (atRule) cssBase += 2;
	if (cssBase > 0 && /\b(?:function|const|let|var|=>|import\s+.+from)\b/.test(text) && !atRule) cssBase -= 2;
	let scssBoost = 0;
	let lessBoost = 0;
	if (/^\s*\$[\w-]+\s*:/m.test(text)) scssBoost += 2;
	if (/@(?:mixin|include|use|forward|extend|function|return|if|else|each|for|while)\b/.test(text)) scssBoost += 2;
	if (/#\{/.test(text) || /^\s*&[\s:.\-_\[]/m.test(text)) scssBoost += 1;
	if (/^\s*\/\/.*$/m.test(text) && cssBase > 0) { scssBoost += 0.5; lessBoost += 0.5; }
	if (/^\s*@[\w-]+\s*:\s*[^;]+;/m.test(text)) lessBoost += 2;
	if (/@\{[\w-]+\}|~["']|^\s*\.[\w-]+\s*\([^)]*\)\s*;|\.mixin|\bwhen\s*\(/m.test(text)) lessBoost += 2;
	if (graphqlWins) cssBase = 0;
	if (cssBase > 0) {
		add('css', cssBase);
		if (scssBoost > lessBoost && scssBoost >= 1) {
			add('scss', cssBase + scssBoost);
			scores.css = Math.min(scores.css ?? 0, cssBase - 0.5);
		} else if (lessBoost > scssBoost && lessBoost >= 1) {
			add('less', cssBase + lessBoost);
			scores.css = Math.min(scores.css ?? 0, cssBase - 0.5);
		} else if (scssBoost >= 1 && scssBoost === lessBoost) {
			add('scss', cssBase + scssBoost);
			add('less', cssBase + lessBoost);
		}
	}

	// --- JS / TS
	let js = 0;
	if (/^\s*import\s+(?:[\w*{}\s,]+\s+from\s+)?["'][^"']+["']/m.test(text)) js += 2;
	if (/^\s*export\s+(?:default|const|let|var|function|class|async|\{|\*)/m.test(text)) js += 2;
	if (/\b(?:const|let|var)\s+[\w${}\[\],\s]+=/.test(text)) js += 2;
	if (/\bfunction\s*\*?\s*[\w$]*\s*\(/.test(text)) js += 2;
	if (/=>/.test(text)) js += 1;
	if (/\b(?:console|document|window|module|process)\.\w+/.test(text) || /\brequire\(/.test(text)) js += 1;
	if (/^\s*(?:async\s+)?class\s+\w+/m.test(text)) js += 1;
	if (/^\s*(?:if|for|while)\s*\(/m.test(text) || /\breturn\b[^;\n]*;/.test(text)) js += 1;
	if (js > 0 && /^\s*(?:select|insert|update|delete)\b/i.test(noSqlComments)) js -= 2;
	let ts = 0;
	if (/^\s*(?:export\s+)?(?:declare\s+)?interface\s+\w+/m.test(text)) ts += 3;
	if (/^\s*(?:export\s+)?type\s+\w+(?:<[^>]*>)?\s*=/m.test(text)) ts += 3;
	if (/^\s*(?:export\s+)?(?:const\s+)?enum\s+\w+/m.test(text)) ts += 2;
	if (/[\w)\]]\s*:\s*(?:string|number|boolean|any|void|unknown|never|bigint|object|null|undefined|Array<|Promise<|Record<)\b/.test(text)) ts += 2;
	if (/\b(?:implements|readonly|private|protected|public|abstract)\s+\w+/.test(text)) ts += 1;
	if (/\bas\s+(?:const|string|number|any|unknown|\w+\[\])/.test(text)) ts += 1;
	if (/<\w+(?:,\s*\w+)*>\s*\(/.test(text) && !/<\/?\w+[^>]*>[^<]*<\//.test(text)) ts += 1;
	if (js >= 2 || ts >= 2) {
		if (ts >= 2) {
			add('typescript', Math.max(js, 2) + ts);
			add('javascript', js);
		} else add('javascript', js);
	}

	// --- YAML
	const keyLines = nonEmpty.filter((l) => /^\s*(?:-\s+)?[\w."'/@-][^:{}\[\]]*:(?:\s+\S.*|\s*)$/.test(l) && !/;\s*$/.test(l)).length;
	const listLines = nonEmpty.filter((l) => /^\s*-\s+\S/.test(l)).length;
	const commentLines = nonEmpty.filter((l) => /^\s*#/.test(l)).length;
	const yamlLike = keyLines + listLines + commentLines;
	if (nonEmpty.length > 0 && keyLines >= 2 && yamlLike / nonEmpty.length >= 0.6) add('yaml', 3);
	else if (keyLines >= 1 && nonEmpty.length >= 1 && yamlLike / nonEmpty.length >= 0.8 && !/[{};]/.test(text)) add('yaml', 2);
	if (/^---\s*$/m.test(text.split(/\r?\n/).slice(0, 3).join('\n')) && keyLines >= 1) add('yaml', 1);
	if (cssBase > 0 && scores.yaml) scores.yaml -= 2;

	// --- Markdown
	let md = 0;
	const headings = nonEmpty.filter((l) => /^#{1,6}\s+\S/.test(l)).length;
	if (headings > 0) md += headings >= 2 ? 3 : 2;
	if (/^\s*```/m.test(text)) md += 2;
	if (/\[[^\]\n]+\]\([^)\n]+\)/.test(text)) md += 1;
	if (/\*\*[^*\n]+\*\*|__[^_\n]+__/.test(text)) md += 1;
	if (/^\s*>\s+\S/m.test(text)) md += 1;
	if (listLines >= 2 && keyLines < listLines) md += 1.5;
	if (/^\s*\d+\.\s+\S/m.test(text)) md += 1;
	if (/^(?:-{3,}|\*{3,}|={3,})\s*$/m.test(text) && headings > 0) md += 0.5;
	if (md >= 2 && !(cssBase > 0)) add('markdown', md);
	if (md > 0 && scores.yaml && headings === 0 && !/```|\]\(/.test(text)) scores.markdown = (scores.markdown ?? 0) - 1;

	return scores;
}

/**
 * Guess the language of `text`. A known file extension wins (high confidence); otherwise the
 * content is scored. `language: null` + low confidence means "not sure - let the user choose".
 */
export function detectLanguage(text: string, fileName?: string | null): Detection {
	const byName = languageFromFileName(fileName);
	if (byName) return { language: byName, confidence: 'high', source: 'extension', candidates: [] };

	const trimmed = text.trim();
	if (trimmed === '') return none();

	const first = trimmed[0];
	if (first === '{' || first === '[') {
		if (looksLikeJson(trimmed)) return { language: 'json', confidence: 'high', source: 'content', candidates: [] };
		if (/^\{\s*(?:"|\})/.test(trimmed) || /^\[\s*(?:\{|"|\[|-?\d|true|false|null|\])/.test(trimmed)) {
			// Looks like JSON but does not parse: still try JSON so the user sees *where* it breaks.
			if (!/^\{\s*(?:query|mutation|subscription)\b/.test(trimmed)) return { language: 'json', confidence: 'medium', source: 'content', candidates: [] };
		}
		// A leading brace/bracket that is not clearly JSON: could be GraphQL, JS, CSS ... -> ambiguous.
		const scores = scoreText(trimmed);
		const cands = rank(scores).map((r) => r.lang);
		return none(['json', ...cands.filter((c) => c !== 'json')].slice(0, 4) as FormatLanguage[]);
	}
	if (first === '<') {
		const markup = detectMarkup(trimmed);
		if (markup.language || markup.candidates.length > 0) return markup;
	}

	const ranked = rank(scoreText(text));
	if (ranked.length === 0) return none();
	const [top, second] = ranked;
	const margin = top.score - (second?.score ?? 0);
	let confidence: DetectConfidence;
	if (top.score >= 3 && margin >= 2) confidence = 'high';
	else if (top.score >= 2 && margin >= 1) confidence = 'medium';
	else confidence = 'low';
	if (confidence === 'low') {
		return none(ranked.filter((r) => r.score >= top.score - 1 && r.score >= 1).map((r) => r.lang).slice(0, 4));
	}
	return { language: top.lang, confidence, source: 'content', candidates: [] };
}

function rank(scores: Scores): Array<{ lang: FormatLanguage; score: number }> {
	return (Object.entries(scores) as Array<[FormatLanguage, number]>)
		.filter(([, s]) => s > 0)
		.map(([lang, score]) => ({ lang, score }))
		.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Error extraction
// ---------------------------------------------------------------------------

export interface FormatErrorInfo {
	line?: number;
	column?: number;
	/** Short, single-line message (no code frame). */
	message: string;
}

const MAX_MESSAGE_CHARS = 160;

function clip(message: string): string {
	const oneLine = message
		.replace(/\s+/g, ' ')
		.replace(/\s*(?:in JSON )?at position \d+(?: \(line \d+ column \d+\))?/i, '')
		.replace(/\s*For more info see \S+/i, '')
		.trim();
	return oneLine.length > MAX_MESSAGE_CHARS ? `${oneLine.slice(0, MAX_MESSAGE_CHARS - 1)}…` : oneLine;
}

/** Convert a 0-based character offset to 1-based line/column. */
export function positionToLineColumn(text: string, offset: number): { line: number; column: number } {
	const clamped = Math.max(0, Math.min(offset, text.length));
	let line = 1;
	let last = -1;
	for (let i = 0; i < clamped; i++) {
		if (text.charCodeAt(i) === 10) {
			line++;
			last = i;
		}
	}
	return { line, column: clamped - last };
}

/**
 * Normalise whatever a formatter threw (prettier SyntaxError with `loc`, sql-formatter parse
 * error, JSON.parse error ...) into `{line, column, message}`. `text` is only used to turn a
 * JSON "at position N" offset into line/column.
 */
export function extractFormatError(error: unknown, text = ''): FormatErrorInfo {
	const err = error as { message?: unknown; loc?: { start?: { line?: number; column?: number }; line?: number; column?: number } } | null;
	const raw = typeof err?.message === 'string' ? err.message : String(error ?? '');
	// Drop prettier's code frame ("> 1 | ...") and anything after the first blank line.
	let first = raw.split(/\r?\n/)[0] ?? raw;
	let line: number | undefined;
	let column: number | undefined;

	const loc = err?.loc;
	const start = loc?.start ?? (loc && typeof loc.line === 'number' ? loc : undefined);
	if (start && typeof start.line === 'number') {
		line = start.line;
		column = typeof start.column === 'number' ? start.column : undefined;
	}
	// "Unexpected token (3:5)" - strip the trailing "(line:col)" and use it when loc is missing.
	const paren = /\s*\((\d+):(\d+)\)\s*$/.exec(first);
	if (paren) {
		if (line === undefined) {
			line = Number(paren[1]);
			column = Number(paren[2]);
		}
		first = first.slice(0, paren.index);
	}
	// sql-formatter: 'Parse error: Unexpected "x" at line 3 column 7'
	const sqlPos = /\bat line (\d+) column (\d+)/i.exec(raw);
	if (sqlPos) {
		if (line === undefined) {
			line = Number(sqlPos[1]);
			column = Number(sqlPos[2]);
		}
		first = first.replace(/\s*at line \d+ column \d+\.?/i, '');
	}
	// V8 JSON.parse: "... at position 12" / "(line 2 column 5)"
	if (line === undefined) {
		const lc = /\(line (\d+) column (\d+)\)/i.exec(raw);
		const pos = /\bposition (\d+)/i.exec(raw);
		if (lc) {
			line = Number(lc[1]);
			column = Number(lc[2]);
		} else if (pos && text) {
			({ line, column } = positionToLineColumn(text, Number(pos[1])));
		}
	}
	return { line, column, message: clip(first.replace(/^SyntaxError:\s*/i, '').replace(/^Parse error:\s*/i, '')) || 'Syntax error' };
}

// ---------------------------------------------------------------------------
// Worker groups: each group is its own worker bundle containing only the libraries it needs
// ---------------------------------------------------------------------------

export type WorkerGroup = 'js' | 'ts' | 'css' | 'html' | 'htmlEmbed' | 'markdown' | 'yaml' | 'graphql' | 'sql';

/** Which worker bundle formats `language`; null = runs on the main thread (JSON, XML: no heavy library). */
export function workerGroupFor(language: FormatLanguage, text: string): WorkerGroup | null {
	switch (language) {
		case 'json':
		case 'xml':
			return null;
		case 'javascript':
			return 'js';
		case 'typescript':
			return 'ts';
		case 'css':
		case 'scss':
		case 'less':
			return 'css';
		case 'html':
			return /<script\b|<style\b/i.test(text) ? 'htmlEmbed' : 'html';
		case 'markdown':
			return 'markdown';
		case 'yaml':
			return 'yaml';
		case 'graphql':
			return 'graphql';
		case 'sql':
			return 'sql';
	}
}
