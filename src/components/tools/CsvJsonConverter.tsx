import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	csvToJson,
	dedupeFileNames,
	jsonToCsv,
	mergeColumnSpec,
	parseJsonOrJsonl,
	suggestDelimiter,
	validateDelimiter,
	type ColumnSpec,
	type CsvWarning,
	type OutputFormat,
} from '@/lib/csv-json';
import { ENCODING_OPTIONS, decodeBuffer, detectDelimiter } from '@/lib/csv-encoding';
import type { SqlDialect } from '@/lib/csv-json-formats';
import { copyTextSafe } from '@/lib/safe-clipboard';

interface Messages {
	modeCsvToJson: string;
	modeJsonToCsv: string;
	delimiterLabel: string;
	delimiterComma: string;
	delimiterSemicolon: string;
	delimiterTab: string;
	delimiterCustom: string;
	customDelimiterPlaceholder: string;
	headerLabel: string;
	nestedLabel: string;
	nestedHint: string;
	prettyPrintLabel: string;
	inputLabelCsv: string;
	inputLabelJson: string;
	inputPlaceholderCsv: string;
	inputPlaceholderJson: string;
	dropLabel: string;
	chooseFile: string;
	loadSample: string;
	clear: string;
	swap: string;
	previewHeading: string;
	previewInfo: string;
	moreRows: string;
	outputLabel: string;
	copy: string;
	copied: string;
	download: string;
	csvParseError: string;
	jsonParseError: string;
	jsonRootError: string;
	batchConvertedCount: string;
	batchDownloadAll: string;
	batchFileError: string;
	copyFailed: string;
	formulaLabel: string;
	bomLabel: string;
	typedLabel: string;
	customDelimiterInvalid: string;
	delimiterSuggest: string;
	delimiterSuggestApply: string;
	csvWarningSummary: string;
	csvCollisionWarning: string;
	jsonCollisionWarning: string;
	batchReadError: string;
	formatLabel: string;
	formatObjects: string;
	formatJsonl: string;
	formatKeyed: string;
	formatArrays: string;
	formatColumns: string;
	formatSql: string;
	formatYaml: string;
	formatMarkdown: string;
	formatHtml: string;
	formatXml: string;
	advancedHeading: string;
	trimLabel: string;
	skipEmptyLabel: string;
	skipLinesLabel: string;
	maxRecordsLabel: string;
	transposeLabel: string;
	sqlDialectLabel: string;
	sqlTableLabel: string;
	encodingLabel: string;
	encodingAuto: string;
	encodingDetected: string;
	delimiterDetected: string;
	columnsHeading: string;
	columnInclude: string;
	columnRename: string;
	columnMoveUp: string;
	columnMoveDown: string;
	columnsReset: string;
	truncatedNote: string;
	keyedDuplicatesNote: string;
	jsonlDetectedNote: string;
}

type Mode = 'csv-to-json' | 'json-to-csv';
type DelimiterOption = 'comma' | 'semicolon' | 'tab' | 'custom';

const DELIMITER_VALUES: Record<Exclude<DelimiterOption, 'custom'>, string> = {
	comma: ',',
	semicolon: ';',
	tab: '\t',
};

const SAMPLE_JSON = JSON.stringify(
	[
		{ name: 'Ada Lovelace', age: 36, address: { city: 'London', country: 'UK' } },
		{ name: 'Alan Turing', age: 41, address: { city: 'Maida Vale', country: 'UK' } },
	],
	null,
	2,
);

const SAMPLE_CSV = 'name,age,address.city,address.country\n"Ada Lovelace",36,London,UK\n"Alan Turing",41,"Maida Vale",UK';

const PREVIEW_ROW_LIMIT = 20;

const FORMATS: OutputFormat[] = ['objects', 'jsonl', 'keyed', 'arrays', 'columns', 'sql', 'yaml', 'markdown', 'html', 'xml'];
const SQL_DIALECTS: { value: SqlDialect; label: string }[] = [
	{ value: 'mysql', label: 'MySQL / MariaDB' },
	{ value: 'postgres', label: 'PostgreSQL' },
	{ value: 'sqlite', label: 'SQLite' },
	{ value: 'mssql', label: 'SQL Server' },
];

const FORMAT_FILE: Record<OutputFormat, { ext: string; mime: string }> = {
	objects: { ext: 'json', mime: 'application/json' },
	keyed: { ext: 'json', mime: 'application/json' },
	arrays: { ext: 'json', mime: 'application/json' },
	columns: { ext: 'json', mime: 'application/json' },
	jsonl: { ext: 'jsonl', mime: 'application/x-ndjson' },
	sql: { ext: 'sql', mime: 'application/sql' },
	yaml: { ext: 'yaml', mime: 'application/yaml' },
	markdown: { ext: 'md', mime: 'text/markdown' },
	html: { ext: 'html', mime: 'text/html' },
	xml: { ext: 'xml', mime: 'application/xml' },
};

interface Settings {
	mode: Mode;
	delimiter: string;
	header: boolean;
	nested: boolean;
	prettyPrint: boolean;
	typed: boolean;
	escapeFormulae: boolean;
	format: OutputFormat;
	trim: boolean;
	skipEmpty: boolean;
	skipLines: number;
	maxRecords: number;
	transpose: boolean;
	sqlDialect: SqlDialect;
	sqlTable: string;
	/** Only set when the user changed the column layout. */
	columns: ColumnSpec[] | undefined;
}

interface Converted {
	output: string;
	error: string | null;
	warnings: CsvWarning[];
	notes: string[];
	sourceHeaders: string[];
	previewHeaders: string[];
	previewRows: string[][];
}

const EMPTY: Converted = { output: '', error: null, warnings: [], notes: [], sourceHeaders: [], previewHeaders: [], previewRows: [] };

// Pulled out of the live-preview useMemo so batch file conversion (each file
// independently, same settings) reuses the exact same logic.
function convertOne(text: string, s: Settings, messages: Messages): Converted {
	if (text.trim() === '') return EMPTY;

	if (s.mode === 'csv-to-json') {
		const result = csvToJson(text, {
			delimiter: s.delimiter,
			header: s.header,
			nested: s.nested,
			pretty: s.prettyPrint,
			typed: s.typed,
			format: s.format,
			trim: s.trim,
			skipEmptyFields: s.skipEmpty,
			skipLines: s.skipLines,
			maxRecords: s.maxRecords,
			transpose: s.transpose,
			columns: s.columns,
			sql: { dialect: s.sqlDialect, table: s.sqlTable },
		});
		if (result.error) {
			return {
				...EMPTY,
				error: messages.csvParseError.replace('{{row}}', String(result.error.line)).replace('{{message}}', result.error.message),
				warnings: result.warnings,
			};
		}
		const notes: string[] = [];
		if (result.collisions.length > 0) {
			notes.push(messages.csvCollisionWarning.replace('{{keys}}', result.collisions.slice(0, 5).join(', ')));
		}
		if (result.truncated > 0) notes.push(messages.truncatedNote.replace('{{count}}', String(result.truncated)));
		if (result.duplicateKeys.length > 0) {
			notes.push(messages.keyedDuplicatesNote.replace('{{keys}}', result.duplicateKeys.slice(0, 5).join(', ')));
		}
		return {
			output: result.output,
			error: null,
			warnings: result.warnings,
			notes,
			sourceHeaders: result.sourceHeaders,
			previewHeaders: result.previewHeaders,
			previewRows: result.previewRows,
		};
	}

	try {
		const { value: parsed, jsonl } = parseJsonOrJsonl(text);
		const result = jsonToCsv(parsed, {
			delimiter: s.delimiter,
			header: s.header,
			escapeFormulae: s.escapeFormulae,
			columns: s.columns,
			maxRecords: s.maxRecords,
		});
		if (result.rootError) return { ...EMPTY, error: messages.jsonRootError };
		const notes: string[] = [];
		if (jsonl) notes.push(messages.jsonlDetectedNote);
		if (result.warnings.length > 0) {
			notes.push(messages.jsonCollisionWarning.replace('{{keys}}', result.warnings.slice(0, 5).join(', ')));
		}
		return {
			output: result.output,
			error: null,
			warnings: [],
			notes,
			sourceHeaders: result.sourceHeaders,
			previewHeaders: result.previewHeaders,
			previewRows: result.previewRows,
		};
	} catch (e) {
		return { ...EMPTY, error: messages.jsonParseError.replace('{{message}}', e instanceof Error ? e.message : '') };
	}
}

interface BatchEntry {
	name: string;
	/** Raw bytes, re-decoded whenever the encoding choice changes. */
	buffer: ArrayBuffer | null;
	readFailed: boolean;
}

interface BatchResultItem {
	fileName: string;
	content: string;
	error: string | null;
}

function CopyButton({ value, label, copiedLabel, failedLabel }: { value: string; label: string; copiedLabel: string; failedLabel: string }) {
	const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	return (
		<Button
			aria-live="polite"
			type="button"
			size="sm"
			variant="ghost"
			disabled={value === ''}
			onClick={() => {
				void copyTextSafe(value).then((ok) => {
					setStatus(ok ? 'copied' : 'failed');
					if (timer.current) clearTimeout(timer.current);
					timer.current = setTimeout(() => setStatus('idle'), 1500);
				});
			}}
		>
			{status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : label}
		</Button>
	);
}

const BOM = '﻿';

function delimiterName(d: string): string {
	return d === '\t' ? 'Tab' : d;
}

function sameSpec(a: ColumnSpec[], b: ColumnSpec[]): boolean {
	return a.length === b.length && a.every((c, i) => c.source === b[i].source && c.name === b[i].name && c.include === b[i].include);
}

function clampInt(raw: string, max: number): number {
	const n = Math.floor(Number(raw));
	return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

export default function CsvJsonConverter({ messages }: { messages: Messages }) {
	const [mode, setMode] = useState<Mode>('csv-to-json');
	const [delimiterOption, setDelimiterOption] = useState<DelimiterOption>('comma');
	const [customDelimiter, setCustomDelimiter] = useState(',');
	const [header, setHeader] = useState(true);
	const [nested, setNested] = useState(false);
	const [prettyPrint, setPrettyPrint] = useState(true);
	const [typed, setTyped] = useState(false);
	const [escapeFormulae, setEscapeFormulae] = useState(true);
	const [addBom, setAddBom] = useState(true);
	const [format, setFormat] = useState<OutputFormat>('objects');
	const [trim, setTrim] = useState(false);
	const [skipEmpty, setSkipEmpty] = useState(false);
	const [skipLines, setSkipLines] = useState(0);
	const [maxRecords, setMaxRecords] = useState(0);
	const [transpose, setTranspose] = useState(false);
	const [sqlDialect, setSqlDialect] = useState<SqlDialect>('mysql');
	const [sqlTable, setSqlTable] = useState('my_table');
	const [encoding, setEncoding] = useState('auto');
	const [columnConfig, setColumnConfig] = useState<ColumnSpec[]>([]);
	const [input, setInput] = useState('');
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const loadToken = useRef(0);
	// Raw files kept so a different encoding can re-decode them; `inputFromFile` is cleared as soon
	// as the user edits the text so a later encoding change never overwrites their edits.
	const [fileEntries, setFileEntries] = useState<BatchEntry[] | null>(null);
	const [inputFromFile, setInputFromFile] = useState(false);
	const [detectedDelimiter, setDetectedDelimiter] = useState<string | null>(null);

	const customDelimiterValid = delimiterOption !== 'custom' || validateDelimiter(customDelimiter);
	const delimiter = delimiterOption === 'custom' ? customDelimiter : DELIMITER_VALUES[delimiterOption];

	// The layout is only sent to the converter once the user actually changed something, so the
	// default path (including the ragged-row `_extra` column) behaves exactly as before.
	const [knownHeaders, setKnownHeaders] = useState<string[]>([]);
	const columnsCustomized = columnConfig.some((c, i) => !c.include || (c.name.trim() !== '' && c.name !== c.source) || c.source !== knownHeaders[i]);

	const settings: Settings = useMemo(
		() => ({
			mode,
			delimiter,
			header,
			nested,
			prettyPrint,
			typed,
			escapeFormulae,
			format,
			trim,
			skipEmpty,
			skipLines,
			maxRecords,
			transpose,
			sqlDialect,
			sqlTable,
			columns: columnsCustomized ? columnConfig : undefined,
		}),
		[mode, delimiter, header, nested, prettyPrint, typed, escapeFormulae, format, trim, skipEmpty, skipLines, maxRecords, transpose, sqlDialect, sqlTable, columnsCustomized, columnConfig],
	);

	const converted = useMemo<Converted>(() => {
		if (!customDelimiterValid) return { ...EMPTY, error: messages.customDelimiterInvalid };
		return convertOne(input, settings, messages);
	}, [input, settings, messages, customDelimiterValid]);
	const { output, error, warnings, notes, previewHeaders, previewRows } = converted;

	// Keep the column editor in step with the headers of the loaded data.
	const sourceKey = converted.sourceHeaders.join('\u0001');
	useEffect(() => {
		setKnownHeaders(converted.sourceHeaders);
		setColumnConfig((prev) => {
			const merged = mergeColumnSpec(prev, converted.sourceHeaders);
			return sameSpec(prev, merged) ? prev : merged;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sourceKey]);

	// Hint when the result is a single column but another common delimiter is on the first line.
	const suggestedDelimiter = useMemo(() => {
		if (mode !== 'csv-to-json' || !customDelimiterValid || input.trim() === '') return null;
		if (previewHeaders.length > 1) return null;
		return suggestDelimiter(input, delimiter);
	}, [mode, customDelimiterValid, input, previewHeaders.length, delimiter]);

	const applyDelimiter = (d: string) => {
		if (d === ',') setDelimiterOption('comma');
		else if (d === ';') setDelimiterOption('semicolon');
		else if (d === '\t') setDelimiterOption('tab');
		else {
			setDelimiterOption('custom');
			setCustomDelimiter(d);
		}
	};

	const applySuggestedDelimiter = () => {
		if (suggestedDelimiter) applyDelimiter(suggestedDelimiter);
	};

	// Decoded text of every loaded file; recomputed (not re-read) when the encoding changes.
	const decoded = useMemo(
		() =>
			fileEntries
				? fileEntries.map((entry) => (entry.buffer && !entry.readFailed ? decodeBuffer(entry.buffer, encoding) : null))
				: null,
		[fileEntries, encoding],
	);

	useEffect(() => {
		if (!decoded || !inputFromFile || !decoded[0]) return;
		setInput(decoded[0].text);
	}, [decoded, inputFromFile]);

	// Batch results are derived from the raw files + current settings, so changing
	// any setting recomputes them instead of leaving a stale zip behind.
	const batchEntries = fileEntries && (fileEntries.length > 1 || fileEntries[0]?.readFailed) ? fileEntries : null;
	const [isBatchZipping, setIsBatchZipping] = useState(false);
	const batchResults = useMemo<BatchResultItem[] | null>(() => {
		if (!batchEntries || !decoded) return null;
		const outExt = mode === 'csv-to-json' ? FORMAT_FILE[format].ext : delimiterOption === 'tab' ? 'tsv' : 'csv';
		const names = dedupeFileNames(batchEntries.map((e) => `${e.name.replace(/\.[^./\\]+$/, '')}.${outExt}`));
		return batchEntries.map((entry, i) => {
			const text = decoded[i]?.text;
			if (entry.readFailed || text === undefined) return { fileName: names[i], content: '', error: messages.batchReadError };
			if (!customDelimiterValid) return { fileName: names[i], content: '', error: messages.customDelimiterInvalid };
			const result = convertOne(text, settings, messages);
			return { fileName: names[i], content: result.output, error: result.error };
		});
	}, [batchEntries, decoded, mode, format, delimiterOption, settings, messages, customDelimiterValid]);

	const canSwap = output !== '' && (mode === 'json-to-csv' || format === 'objects' || format === 'jsonl');

	const handleSwap = () => {
		setMode((m) => (m === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json'));
		setInput(output);
		setInputFromFile(false);
		setColumnConfig([]);
	};

	const handleLoadSample = () => {
		setInput(mode === 'csv-to-json' ? SAMPLE_CSV : SAMPLE_JSON);
		setInputFromFile(false);
	};

	const readFileAsBuffer = (file: File): Promise<BatchEntry> =>
		new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve({ name: file.name, buffer: reader.result as ArrayBuffer, readFailed: false });
			reader.onerror = () => resolve({ name: file.name, buffer: null, readFailed: true });
			reader.onabort = () => resolve({ name: file.name, buffer: null, readFailed: true });
			reader.readAsArrayBuffer(file);
		});

	const handleFiles = (fileList: FileList | null, inputEl?: HTMLInputElement) => {
		if (!fileList || fileList.length === 0) return;
		const files = Array.from(fileList);
		// Reset so choosing the same file again still fires onChange.
		if (inputEl) inputEl.value = '';

		// Token: only the most recently started load may write state, so a slow
		// earlier read can never overwrite a newer one.
		const token = ++loadToken.current;
		setFileEntries(null);
		setDetectedDelimiter(null);
		void Promise.all(files.map(readFileAsBuffer)).then((entries) => {
			if (token !== loadToken.current) return;
			const first = entries[0].buffer && !entries[0].readFailed ? decodeBuffer(entries[0].buffer, encoding) : null;
			const text = first?.text ?? '';
			// Delimiter: sniffed from the content; a .tsv upload falls back to tab.
			if (mode === 'csv-to-json' && text !== '') {
				const detected = detectDelimiter(text);
				if (detected) {
					applyDelimiter(detected);
					setDetectedDelimiter(detected);
				} else if (files.every((file) => file.name.toLowerCase().endsWith('.tsv'))) setDelimiterOption('tab');
			} else if (files.every((file) => file.name.toLowerCase().endsWith('.tsv'))) setDelimiterOption('tab');
			setFileEntries(entries);
			setInputFromFile(true);
			setInput(text);
		});
	};

	const saveBlob = (blob: Blob, filename: string) => {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	};

	const handleDownloadBatch = async () => {
		if (!batchResults || batchResults.length === 0) return;
		setIsBatchZipping(true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			for (const item of batchResults) {
				if (item.error === null) {
					const withBom = mode === 'json-to-csv' && addBom && !item.fileName.toLowerCase().endsWith('.tsv') ? BOM : '';
					zip.file(item.fileName, withBom + item.content);
				}
			}
			saveBlob(await zip.generateAsync({ type: 'blob' }), 'converted-files.zip');
		} finally {
			setIsBatchZipping(false);
		}
	};

	const handleDownload = () => {
		if (output === '') return;
		const isCsvToJson = mode === 'csv-to-json';
		const isTsv = !isCsvToJson && delimiterOption === 'tab';
		if (isCsvToJson) {
			const file = FORMAT_FILE[format];
			saveBlob(new Blob([output], { type: `${file.mime};charset=utf-8` }), `output.${file.ext}`);
			return;
		}
		// UTF-8 BOM so Excel on Windows detects the encoding (otherwise accented text is garbled).
		const parts = addBom ? [BOM, output] : [output];
		const blob = new Blob(parts, { type: isTsv ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8' });
		saveBlob(blob, isTsv ? 'output.tsv' : 'output.csv');
	};

	const moveColumn = (index: number, delta: number) => {
		setColumnConfig((prev) => {
			const target = index + delta;
			if (target < 0 || target >= prev.length) return prev;
			const next = [...prev];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	};

	const updateColumn = (index: number, patch: Partial<ColumnSpec>) => {
		setColumnConfig((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
	};

	const formatLabels: Record<OutputFormat, string> = {
		objects: messages.formatObjects,
		jsonl: messages.formatJsonl,
		keyed: messages.formatKeyed,
		arrays: messages.formatArrays,
		columns: messages.formatColumns,
		sql: messages.formatSql,
		yaml: messages.formatYaml,
		markdown: messages.formatMarkdown,
		html: messages.formatHtml,
		xml: messages.formatXml,
	};

	const checkboxLabel = 'flex min-h-9 items-center gap-2 text-sm text-muted-foreground';
	const inputClass = 'rounded-md border border-border bg-background p-2 text-sm text-foreground';
	const isCsvMode = mode === 'csv-to-json';

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<Button
					type="button"
					size="sm"
					variant={mode === 'csv-to-json' ? 'default' : 'outline'}
					aria-pressed={mode === 'csv-to-json'}
					onClick={() => setMode('csv-to-json')}
				>
					{messages.modeCsvToJson}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={mode === 'json-to-csv' ? 'default' : 'outline'}
					aria-pressed={mode === 'json-to-csv'}
					onClick={() => setMode('json-to-csv')}
				>
					{messages.modeJsonToCsv}
				</Button>
			</div>

			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<div className="flex flex-wrap items-end gap-x-4 gap-y-1">
					<div className="flex flex-col gap-1">
						<label htmlFor="csv-json-delimiter" className="text-xs text-muted-foreground">
							{messages.delimiterLabel}
						</label>
						<select
							id="csv-json-delimiter"
							value={delimiterOption}
							onChange={(e) => {
								setDelimiterOption(e.target.value as DelimiterOption);
								setDetectedDelimiter(null);
							}}
							className={inputClass}
						>
							<option value="comma">{messages.delimiterComma}</option>
							<option value="semicolon">{messages.delimiterSemicolon}</option>
							<option value="tab">{messages.delimiterTab}</option>
							<option value="custom">{messages.delimiterCustom}</option>
						</select>
					</div>
					{delimiterOption === 'custom' && (
						<div className="flex flex-col gap-1">
							<label htmlFor="csv-json-custom-delimiter" className="text-xs text-muted-foreground">
								{messages.delimiterCustom}
							</label>
							<input
								id="csv-json-custom-delimiter"
								type="text"
								maxLength={1}
								value={customDelimiter}
								onChange={(e) => setCustomDelimiter(e.target.value)}
								placeholder={messages.customDelimiterPlaceholder}
								aria-invalid={!customDelimiterValid}
								className="w-16 rounded-md border border-border bg-background p-2 text-center font-mono text-sm text-foreground"
							/>
						</div>
					)}
					{isCsvMode && (
						<div className="flex flex-col gap-1">
							<label htmlFor="csv-json-format" className="text-xs text-muted-foreground">
								{messages.formatLabel}
							</label>
							<select id="csv-json-format" value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)} className={inputClass}>
								{FORMATS.map((f) => (
									<option key={f} value={f}>
										{formatLabels[f]}
									</option>
								))}
							</select>
						</div>
					)}
					<label className={checkboxLabel}>
						<input type="checkbox" className="size-4" checked={header} onChange={(e) => setHeader(e.target.checked)} />
						{messages.headerLabel}
					</label>
					<label className={checkboxLabel}>
						<input
							type="checkbox"
							className="size-4"
							checked={nested && mode === 'csv-to-json'}
							disabled={mode === 'json-to-csv'}
							onChange={(e) => setNested(e.target.checked)}
						/>
						{messages.nestedLabel}
					</label>
					{mode === 'csv-to-json' && (
						<>
							<label className={checkboxLabel}>
								<input type="checkbox" className="size-4" checked={prettyPrint} onChange={(e) => setPrettyPrint(e.target.checked)} />
								{messages.prettyPrintLabel}
							</label>
							<label className={checkboxLabel}>
								<input type="checkbox" className="size-4" checked={typed} onChange={(e) => setTyped(e.target.checked)} />
								{messages.typedLabel}
							</label>
						</>
					)}
					{mode === 'json-to-csv' && (
						<>
							<label className={checkboxLabel}>
								<input
									type="checkbox"
									className="size-4"
									checked={escapeFormulae}
									onChange={(e) => setEscapeFormulae(e.target.checked)}
								/>
								{messages.formulaLabel}
							</label>
							<label className={checkboxLabel}>
								<input type="checkbox" className="size-4" checked={addBom} onChange={(e) => setAddBom(e.target.checked)} />
								{messages.bomLabel}
							</label>
						</>
					)}
				</div>
				{mode === 'json-to-csv' && <p className="text-xs text-muted-foreground">{messages.nestedHint}</p>}

				<details className="rounded-md border border-border px-3 py-2">
					<summary className="min-h-9 cursor-pointer text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
						{messages.advancedHeading}
					</summary>
					<div className="mt-2 flex flex-col gap-3">
						<div className="flex flex-wrap items-end gap-x-4 gap-y-2">
							<div className="flex flex-col gap-1">
								<label htmlFor="csv-json-encoding" className="text-xs text-muted-foreground">
									{messages.encodingLabel}
								</label>
								<select id="csv-json-encoding" value={encoding} onChange={(e) => setEncoding(e.target.value)} className={inputClass}>
									{ENCODING_OPTIONS.map((o) => (
										<option key={o.value} value={o.value}>
											{o.value === 'auto' ? messages.encodingAuto : o.label}
										</option>
									))}
								</select>
							</div>
							{isCsvMode && (
								<>
									<div className="flex flex-col gap-1">
										<label htmlFor="csv-json-skip-lines" className="text-xs text-muted-foreground">
											{messages.skipLinesLabel}
										</label>
										<input
											id="csv-json-skip-lines"
											type="number"
											min={0}
											max={100000}
											value={skipLines}
											onChange={(e) => setSkipLines(clampInt(e.target.value, 100000))}
											className={`${inputClass} w-24`}
										/>
									</div>
									<label className={checkboxLabel}>
										<input type="checkbox" className="size-4" checked={transpose} onChange={(e) => setTranspose(e.target.checked)} />
										{messages.transposeLabel}
									</label>
									<label className={checkboxLabel}>
										<input type="checkbox" className="size-4" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
										{messages.trimLabel}
									</label>
									<label className={checkboxLabel}>
										<input type="checkbox" className="size-4" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
										{messages.skipEmptyLabel}
									</label>
								</>
							)}
							<div className="flex flex-col gap-1">
								<label htmlFor="csv-json-max-records" className="text-xs text-muted-foreground">
									{messages.maxRecordsLabel}
								</label>
								<input
									id="csv-json-max-records"
									type="number"
									min={0}
									max={10000000}
									value={maxRecords}
									onChange={(e) => setMaxRecords(clampInt(e.target.value, 10000000))}
									className={`${inputClass} w-28`}
								/>
							</div>
						</div>

						{isCsvMode && format === 'sql' && (
							<div className="flex flex-wrap items-end gap-x-4 gap-y-2">
								<div className="flex flex-col gap-1">
									<label htmlFor="csv-json-sql-dialect" className="text-xs text-muted-foreground">
										{messages.sqlDialectLabel}
									</label>
									<select id="csv-json-sql-dialect" value={sqlDialect} onChange={(e) => setSqlDialect(e.target.value as SqlDialect)} className={inputClass}>
										{SQL_DIALECTS.map((d) => (
											<option key={d.value} value={d.value}>
												{d.label}
											</option>
										))}
									</select>
								</div>
								<div className="flex flex-col gap-1">
									<label htmlFor="csv-json-sql-table" className="text-xs text-muted-foreground">
										{messages.sqlTableLabel}
									</label>
									<input
										id="csv-json-sql-table"
										type="text"
										value={sqlTable}
										onChange={(e) => setSqlTable(e.target.value)}
										spellCheck={false}
										className={`${inputClass} w-48 max-w-full font-mono`}
									/>
								</div>
							</div>
						)}

						{columnConfig.length > 0 && (
							<div className="flex flex-col gap-2">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-sm font-medium text-foreground">{messages.columnsHeading}</span>
									<Button type="button" size="sm" variant="ghost" onClick={() => setColumnConfig(mergeColumnSpec([], knownHeaders))}>
										{messages.columnsReset}
									</Button>
								</div>
								<ul className="flex flex-col gap-1">
									{columnConfig.map((col, i) => (
										<li key={col.source} className="flex min-w-0 flex-wrap items-center gap-2">
											<input
												type="checkbox"
												className="size-5"
												checked={col.include}
												aria-label={messages.columnInclude.replace('{{name}}', col.source)}
												onChange={(e) => updateColumn(i, { include: e.target.checked })}
											/>
											<input
												type="text"
												value={col.name}
												spellCheck={false}
												aria-label={messages.columnRename.replace('{{name}}', col.source)}
												onChange={(e) => updateColumn(i, { name: e.target.value })}
												className={`${inputClass} min-h-9 min-w-0 flex-1 basis-32 font-mono`}
											/>
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="min-h-9 min-w-9"
												disabled={i === 0}
												aria-label={messages.columnMoveUp.replace('{{name}}', col.source)}
												onClick={() => moveColumn(i, -1)}
											>
												↑
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="min-h-9 min-w-9"
												disabled={i === columnConfig.length - 1}
												aria-label={messages.columnMoveDown.replace('{{name}}', col.source)}
												onClick={() => moveColumn(i, 1)}
											>
												↓
											</Button>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				</details>
			</div>

			<div
				className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed p-4 transition-colors ${
					isDragOver ? 'border-primary bg-primary/5' : 'border-border'
				}`}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragOver(false);
					handleFiles(e.dataTransfer.files);
				}}
			>
				<p className="text-xs text-muted-foreground">{messages.dropLabel}</p>
				<label
					htmlFor="csv-json-file-input"
					className="inline-flex min-h-9 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-2 focus-within:ring-ring"
				>
					{messages.chooseFile}
				</label>
				<input
					id="csv-json-file-input"
					ref={fileInputRef}
					type="file"
					accept=".csv,.tsv,.json,.jsonl,.ndjson,.txt"
					multiple
					className="sr-only"
					onChange={(e) => handleFiles(e.currentTarget.files, e.currentTarget)}
				/>
				{decoded && decoded[0] && (
					<p role="status" className="text-xs text-muted-foreground">
						{messages.encodingDetected.replace('{{encoding}}', decoded[0].encoding.toUpperCase())}
						{detectedDelimiter !== null && detectedDelimiter === delimiter && (
							<> · {messages.delimiterDetected.replace('{{delimiter}}', delimiterName(detectedDelimiter))}</>
						)}
					</p>
				)}
			</div>

			{batchResults && batchResults.length > 0 && (
				<div className="flex flex-col gap-2 rounded-md border border-border p-3">
					<p className="text-sm text-foreground">
						{messages.batchConvertedCount.replace('{{count}}', String(batchResults.length))}
					</p>
					{batchResults.some((item) => item.error !== null) && (
						<ul className="flex flex-col gap-0.5 text-xs text-destructive">
							{batchResults
								.filter((item) => item.error !== null)
								.map((item) => (
									<li key={item.fileName} role="alert">
										{messages.batchFileError.replace('{{file}}', item.fileName).replace('{{message}}', item.error ?? '')}
									</li>
								))}
						</ul>
					)}
					<div>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							onClick={() => void handleDownloadBatch()}
							disabled={isBatchZipping || batchResults.every((item) => item.error !== null)}
						>
							{messages.batchDownloadAll}
						</Button>
					</div>
				</div>
			)}

			<div className="flex flex-col gap-1">
				<label htmlFor="csv-json-input" className="text-sm font-medium text-foreground">
					{mode === 'csv-to-json' ? messages.inputLabelCsv : messages.inputLabelJson}
				</label>
				<textarea
					id="csv-json-input"
					value={input}
					onChange={(e) => {
						setInput(e.target.value);
						setInputFromFile(false);
					}}
					placeholder={mode === 'csv-to-json' ? messages.inputPlaceholderCsv : messages.inputPlaceholderJson}
					rows={8}
					spellCheck={false}
					className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs break-all text-foreground"
				/>
			</div>

			<div className="flex gap-2">
				<Button type="button" size="sm" variant="ghost" onClick={handleLoadSample}>
					{messages.loadSample}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => {
						setInput('');
						setInputFromFile(false);
					}}
				>
					{messages.clear}
				</Button>
			</div>

			{error && <p role="alert" className="text-sm text-destructive">{error}</p>}

			{suggestedDelimiter && !error && (
				<div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
					<span>{messages.delimiterSuggest.replace('{{delimiter}}', delimiterName(suggestedDelimiter))}</span>
					<Button type="button" size="sm" variant="outline" onClick={applySuggestedDelimiter}>
						{messages.delimiterSuggestApply.replace('{{delimiter}}', delimiterName(suggestedDelimiter))}
					</Button>
				</div>
			)}

			{!error && warnings.length > 0 && (
				<p role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
					{messages.csvWarningSummary
						.replace('{{count}}', String(warnings.length))
						.replace('{{line}}', String(warnings[0].line))
						.replace('{{message}}', warnings[0].message)}
				</p>
			)}

			{!error &&
				notes.map((note) => (
					<p key={note} role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
						{note}
					</p>
				))}

			{!error && previewHeaders.length > 0 && (
				<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="text-sm font-medium text-foreground">{messages.previewHeading}</h3>
						<span className="text-xs text-muted-foreground">
							{messages.previewInfo
								.replace('{{rows}}', String(previewRows.length))
								.replace('{{cols}}', String(previewHeaders.length))}
						</span>
					</div>
					<div className="overflow-x-auto rounded-md border border-border">
						<table className="w-full border-collapse text-left text-xs">
							<thead>
								<tr className="bg-muted">
									{previewHeaders.map((h, i) => (
										<th key={`${h}-${i}`} scope="col" className="border-b border-border px-2 py-1.5 font-medium text-foreground">
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{previewRows.slice(0, PREVIEW_ROW_LIMIT).map((row, i) => (
									<tr key={i} className="border-b border-border last:border-0">
										{row.map((cell, j) => (
											<td key={j} className="px-2 py-1.5 text-muted-foreground">
												{cell}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{previewRows.length > PREVIEW_ROW_LIMIT && (
						<p className="text-xs text-muted-foreground">
							{messages.moreRows.replace('{{count}}', String(previewRows.length - PREVIEW_ROW_LIMIT))}
						</p>
					)}
				</div>
			)}

			<div className="flex justify-center">
				<Button type="button" size="sm" variant="outline" onClick={handleSwap} disabled={!canSwap}>
					{messages.swap}
				</Button>
			</div>

			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between">
					<label htmlFor="csv-json-output" className="text-sm font-medium text-foreground">
						{messages.outputLabel}
					</label>
					<div className="flex items-center gap-1">
						<CopyButton value={output} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
						<Button type="button" size="sm" variant="ghost" disabled={output === ''} onClick={handleDownload}>
							{messages.download}
						</Button>
					</div>
				</div>
				<textarea
					id="csv-json-output"
					readOnly
					value={output}
					rows={8}
					className="w-full rounded-md border border-border bg-muted p-3 font-mono text-xs break-all text-foreground"
				/>
			</div>
		</div>
	);
}
