// Runs the actual formatting. Heavy libraries (prettier standalone, each prettier plugin,
// sql-formatter) come in through injected loaders and are only requested when a language needs
// them, so a visitor who just pastes text downloads none of it. Used from the format workers
// (and, as a fallback when Workers are unavailable, lazily from the main thread).
// No eval / new Function / fs: prettier/standalone + plugins are plain ESM, CSP-safe.
import { formatJsonLossless } from './text-format';
import {
	extractFormatError,
	indentUnit,
	isPrettierLanguage,
	PRETTIER_PARSERS,
	pluginsFor,
	type FormatErrorInfo,
	type FormatLanguage,
	type FormatOptions,
	type PrettierPluginName,
} from './format-languages';

export type FormatRunResult =
	| { ok: true; value: string; warnings: Array<'duplicateKeys'> }
	| { ok: false; error: FormatErrorInfo };

/**
 * How to obtain the heavy libraries. Injected so that each worker entry bundles ONLY the
 * libraries of its own language group (workers are built as IIFE, where a dynamic import()
 * is inlined into the same file) - see components/tools/formatWorker*.ts.
 */
export interface FormatLoaders {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	prettier?: () => Promise<any>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	plugins?: Partial<Record<PrettierPluginName, () => Promise<any>>>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sql?: () => Promise<any>;
}

async function formatWithPrettier(
	text: string,
	language: Exclude<FormatLanguage, 'json' | 'xml' | 'sql'>,
	options: FormatOptions,
	loaders: FormatLoaders,
): Promise<string> {
	if (!loaders.prettier) throw new Error('prettier is not available');
	// Plugins the text would additionally need (embedded script/style/front matter) are used when this
	// bundle has them and silently skipped otherwise (prettier then leaves that fragment as is).
	const names = pluginsFor(language, text).filter((n) => loaders.plugins?.[n]);
	const [prettier, ...plugins] = await Promise.all([loaders.prettier(), ...names.map((n) => loaders.plugins![n]!())]);
	return prettier.format(text, {
		parser: PRETTIER_PARSERS[language].parser,
		plugins,
		tabWidth: options.indent === 'tab' ? 4 : Number(options.indent),
		useTabs: options.indent === 'tab',
		printWidth: options.printWidth,
	});
}

async function formatWithSqlFormatter(text: string, options: FormatOptions, loaders: FormatLoaders): Promise<string> {
	if (!loaders.sql) throw new Error('sql-formatter is not available');
	const { format } = await loaders.sql();
	return format(text, {
		language: options.sqlDialect,
		tabWidth: options.indent === 'tab' ? 4 : Number(options.indent),
		useTabs: options.indent === 'tab',
		keywordCase: 'preserve',
		dataTypeCase: 'preserve',
		functionCase: 'preserve',
		identifierCase: 'preserve',
		linesBetweenQueries: 1,
	});
}

/** Formats `text` as `language`. XML is not handled here (it needs a DOM) - see TextDiffChecker. */
export async function runFormat(text: string, language: Exclude<FormatLanguage, 'xml'>, options: FormatOptions, loaders: FormatLoaders = {}): Promise<FormatRunResult> {
	try {
		if (language === 'json') {
			const result = formatJsonLossless(text, false, indentUnit(options.indent));
			if (result) return { ok: true, value: result.value, warnings: result.hasDuplicateKeys ? ['duplicateKeys'] : [] };
			try {
				JSON.parse(text);
			} catch (error) {
				return { ok: false, error: extractFormatError(error, text) };
			}
			return { ok: false, error: { message: 'Invalid JSON' } };
		}
		if (language === 'sql') {
			return { ok: true, value: finish(await formatWithSqlFormatter(text, options, loaders), text), warnings: [] };
		}
		if (isPrettierLanguage(language)) {
			return { ok: true, value: finish(await formatWithPrettier(text, language, options, loaders), text), warnings: [] };
		}
		return { ok: false, error: { message: 'Unsupported language' } };
	} catch (error) {
		return { ok: false, error: extractFormatError(error, text) };
	}
}

// Keep the user's own end-of-text convention: prettier always appends a final newline, which
// would show up as a spurious "trailing newline differs" note against an unformatted side.
function finish(formatted: string, original: string): string {
	return /\n\s*$/.test(original) ? formatted : formatted.replace(/\n+$/, '');
}
