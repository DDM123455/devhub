import { formatJsonLossless, formatXmlStrict } from '../../lib/text-format';
import { indentUnit, type FormatLanguage, type FormatOptions } from '../../lib/format-languages';
import { locateJsonError } from '../../lib/code-formatter-json-error';
import { runFormat, type FormatRunResult } from '../../lib/format-run';

export type CodeRunMode = 'format' | 'minify';

/**
 * One entry point for the Code Formatter screen. It only dispatches to the code shared with the
 * Text Diff Checker: JSON runs on the main thread (lossless formatter, no heavy library), XML
 * through the DOM-based strict formatter, everything else through formatClient's per-language
 * worker bundles (prettier / sql-formatter are downloaded only when a language needs them).
 * Minify exists for JSON only.
 */
/** Formats a prettier / SQL language; the default goes through the per-language workers (lazy import). */
export type OtherFormatter = (text: string, language: Exclude<FormatLanguage, 'xml'>, options: FormatOptions) => Promise<FormatRunResult>;

const viaWorkers: OtherFormatter = async (text, language, options) => (await import('./formatClient')).formatInWorker(text, language, options);

export async function runCodeFormatter(
	text: string,
	language: FormatLanguage,
	mode: CodeRunMode,
	options: FormatOptions,
	formatOther: OtherFormatter = viaWorkers,
): Promise<FormatRunResult> {
	if (language === 'xml') {
		const xml = formatXmlStrict(text, indentUnit(options.indent));
		return 'error' in xml ? { ok: false, error: xml.error } : { ok: true, value: xml.value, warnings: xml.warnings };
	}
	if (language === 'json') {
		if (mode === 'minify') {
			const compact = formatJsonLossless(text, true);
			if (compact) return { ok: true, value: compact.value, warnings: compact.hasDuplicateKeys ? ['duplicateKeys'] : [] };
			// Invalid JSON: the normal path produces the error message with line / column.
		}
		const result = await runFormat(text, 'json', options);
		// The engine's own JSON message often carries no position: compute line/column ourselves.
		if (!result.ok) return { ok: false, error: locateJsonError(text) ?? result.error };
		return result;
	}
	return formatOther(text, language, options);
}
