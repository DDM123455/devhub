// Pure logic of the Code Formatter tool (no DOM, no heavy libraries): language choice and
// resolution (auto-detect vs. manual), download file names, size limits, persisted settings,
// error-position helpers. Detection / mapping itself lives in format-languages.ts (shared with
// the Text Diff Checker) and is only wrapped here, never re-implemented.
import {
	DEFAULT_FORMAT_OPTIONS,
	FORMAT_LANGUAGES,
	INDENT_CHOICES,
	PRINT_WIDTHS,
	detectLanguage,
	isDecisive,
	isPrettierLanguage,
	isSqlDialect,
	type DetectConfidence,
	type FormatLanguage,
	type FormatOptions,
	type IndentChoice,
	type SqlDialect,
} from './format-languages';

export type LanguageChoice = 'auto' | FormatLanguage;

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Drafts bigger than this are not saved to localStorage (quota). */
export const DRAFT_MAX_CHARS = 200_000;
/** Auto-format (while typing) pauses above this size; the Format button still works. */
export const AUTO_FORMAT_MAX_CHARS = 200_000;
/** The "compare in Text Diff" link carries both texts in the URL hash; keep it reasonably short. */
export const COMPARE_MAX_CHARS = 200_000;

export const STORAGE_SETTINGS_KEY = 'code-formatter:settings';
export const STORAGE_DRAFT_KEY = 'code-formatter:draft';

/** Extension of the downloaded file for each language. */
export const FILE_EXTENSION: Record<FormatLanguage, string> = {
	json: 'json',
	xml: 'xml',
	sql: 'sql',
	html: 'html',
	css: 'css',
	scss: 'scss',
	less: 'less',
	javascript: 'js',
	typescript: 'ts',
	yaml: 'yaml',
	markdown: 'md',
	graphql: 'graphql',
};

/** `accept` attribute of the file input (extensions of every supported language + plain text). */
export const FILE_ACCEPT =
	'.json,.xml,.svg,.xsd,.xsl,.xslt,.rss,.atom,.plist,.csproj,.sql,.html,.htm,.xhtml,.css,.scss,.less,.js,.mjs,.cjs,.jsx,.ts,.mts,.cts,.tsx,.yaml,.yml,.md,.markdown,.graphql,.gql,.txt,text/plain';

export function isLanguageChoice(value: unknown): value is LanguageChoice {
	return value === 'auto' || FORMAT_LANGUAGES.some((l) => l.id === value);
}

export interface CodeFormatterSettings {
	language: LanguageChoice;
	indent: IndentChoice;
	printWidth: number;
	sqlDialect: SqlDialect;
	/** Format while typing (debounced). Off by default: the user presses Format / Ctrl+Enter. */
	autoFormat: boolean;
}

export const DEFAULT_SETTINGS: CodeFormatterSettings = {
	language: 'auto',
	indent: DEFAULT_FORMAT_OPTIONS.indent,
	printWidth: DEFAULT_FORMAT_OPTIONS.printWidth,
	sqlDialect: DEFAULT_FORMAT_OPTIONS.sqlDialect,
	autoFormat: false,
};

/** Validates whatever was read back from localStorage; unknown / corrupt values fall back to defaults. */
export function sanitizeSettings(raw: unknown): CodeFormatterSettings {
	const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return {
		language: isLanguageChoice(o.language) ? o.language : DEFAULT_SETTINGS.language,
		indent: INDENT_CHOICES.includes(o.indent as IndentChoice) ? (o.indent as IndentChoice) : DEFAULT_SETTINGS.indent,
		printWidth: typeof o.printWidth === 'number' && PRINT_WIDTHS.includes(o.printWidth) ? o.printWidth : DEFAULT_SETTINGS.printWidth,
		sqlDialect: typeof o.sqlDialect === 'string' && isSqlDialect(o.sqlDialect) ? o.sqlDialect : DEFAULT_SETTINGS.sqlDialect,
		autoFormat: o.autoFormat === true,
	};
}

export function toFormatOptions(settings: CodeFormatterSettings): FormatOptions {
	return { indent: settings.indent, printWidth: settings.printWidth, sqlDialect: settings.sqlDialect };
}

// ---------------------------------------------------------------------------
// Language resolution
// ---------------------------------------------------------------------------

export type Resolution =
	| { kind: 'empty' }
	| { kind: 'ok'; language: FormatLanguage; confidence: DetectConfidence; source: 'manual' | 'extension' | 'content' }
	| { kind: 'ambiguous'; candidates: FormatLanguage[] };

/**
 * Decide which language to format `text` as. A manual choice always wins; "auto" uses the file
 * extension (if a file was loaded) and then the content. Low-confidence guesses are NOT used:
 * the caller must ask the user to pick a language instead.
 */
export function resolveLanguage(choice: LanguageChoice, text: string, fileName?: string | null): Resolution {
	if (text.trim() === '') return { kind: 'empty' };
	if (choice !== 'auto') return { kind: 'ok', language: choice, confidence: 'high', source: 'manual' };
	const d = detectLanguage(text, fileName);
	if (d.language && isDecisive(d)) {
		return { kind: 'ok', language: d.language, confidence: d.confidence, source: d.source === 'extension' ? 'extension' : 'content' };
	}
	return { kind: 'ambiguous', candidates: d.candidates };
}

/** Options only prettier honours (line width); JSON / XML / SQL ignore it. */
export function supportsPrintWidth(language: FormatLanguage | null): boolean {
	return language !== null && isPrettierLanguage(language);
}

/** Minify is offered for JSON only: other languages cannot be minified safely without changing meaning. */
export function supportsMinify(language: FormatLanguage | null): boolean {
	return language === 'json';
}

// ---------------------------------------------------------------------------
// File names / size
// ---------------------------------------------------------------------------

export function baseNameWithoutExtension(fileName: string | null | undefined): string {
	if (!fileName) return '';
	const last = fileName.split(/[\\/]/).pop() ?? '';
	return last
		.replace(/\.[^.]*$/, '')
		.replace(/[^\p{L}\p{N}._-]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

/**
 * Name of the downloaded file: `<original>.formatted.<ext>` (or `.min.` for minified output),
 * falling back to `formatted.<ext>` / `minified.<ext>` when the text was pasted. The extension
 * always matches the language of the output, not of the loaded file.
 */
export function buildDownloadName(language: FormatLanguage, sourceFileName?: string | null, minified = false): string {
	const origin = baseNameWithoutExtension(sourceFileName);
	if (!origin) return `${minified ? 'minified' : 'formatted'}.${FILE_EXTENSION[language]}`;
	return `${origin}${minified ? '.min' : '.formatted'}.${FILE_EXTENSION[language]}`;
}

export function isFileTooLarge(bytes: number): boolean {
	return bytes > MAX_FILE_BYTES;
}

// ---------------------------------------------------------------------------
// Text statistics / error position
// ---------------------------------------------------------------------------

export function countLines(text: string): number {
	if (text === '') return 0;
	let n = 1;
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
	return n;
}

export function humanBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Selection range for "jump to error": from the 1-based (line, column) to the end of the token
 * that starts there (at most 24 characters, at least one). Out-of-range positions are clamped.
 */
export function errorSelection(text: string, line: number, column = 1): { start: number; end: number } {
	if (text === '') return { start: 0, end: 0 };
	let lineStart = 0;
	let current = 1;
	const target = Math.max(1, Math.floor(line));
	while (current < target) {
		const nl = text.indexOf('\n', lineStart);
		if (nl === -1) break;
		lineStart = nl + 1;
		current++;
	}
	let lineEnd = text.indexOf('\n', lineStart);
	if (lineEnd === -1) lineEnd = text.length;
	if (lineEnd > lineStart && text[lineEnd - 1] === '\r') lineEnd--;
	let start = Math.min(lineStart + Math.max(0, Math.floor(column) - 1), lineEnd);
	if (start >= lineEnd && lineEnd > lineStart) start = lineEnd - 1;
	const token = /^\S{1,24}/.exec(text.slice(start, lineEnd));
	const end = Math.min(lineEnd, start + Math.max(1, token ? token[0].length : 1));
	return { start, end: Math.max(start, end) };
}

/** Percentage size reduction, never negative. */
export function percentSmaller(before: number, after: number): number {
	return before > 0 ? Math.max(0, Math.round(((before - after) / before) * 100)) : 0;
}

/** Fills `{{name}}` placeholders. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (key in vars ? String(vars[key]) : ''));
}
