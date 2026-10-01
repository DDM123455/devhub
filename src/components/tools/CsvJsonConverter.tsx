import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	csvToJson,
	dedupeFileNames,
	jsonToCsv,
	suggestDelimiter,
	validateDelimiter,
	type CsvWarning,
} from '@/lib/csv-json';
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

interface Settings {
	mode: Mode;
	delimiter: string;
	header: boolean;
	nested: boolean;
	prettyPrint: boolean;
	typed: boolean;
	escapeFormulae: boolean;
}

interface Converted {
	output: string;
	error: string | null;
	warnings: CsvWarning[];
	notes: string[];
	previewHeaders: string[];
	previewRows: string[][];
}

const EMPTY: Converted = { output: '', error: null, warnings: [], notes: [], previewHeaders: [], previewRows: [] };

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
		return {
			output: result.output,
			error: null,
			warnings: result.warnings,
			notes,
			previewHeaders: result.previewHeaders,
			previewRows: result.previewRows,
		};
	}

	try {
		const parsed: unknown = JSON.parse(text);
		const result = jsonToCsv(parsed, { delimiter: s.delimiter, header: s.header, escapeFormulae: s.escapeFormulae });
		if (result.rootError) return { ...EMPTY, error: messages.jsonRootError };
		const notes: string[] = [];
		if (result.warnings.length > 0) {
			notes.push(messages.jsonCollisionWarning.replace('{{keys}}', result.warnings.slice(0, 5).join(', ')));
		}
		return {
			output: result.output,
			error: null,
			warnings: [],
			notes,
			previewHeaders: result.previewHeaders,
			previewRows: result.previewRows,
		};
	} catch (e) {
		return { ...EMPTY, error: messages.jsonParseError.replace('{{message}}', e instanceof Error ? e.message : '') };
	}
}

interface BatchEntry {
	name: string;
	text: string;
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
	const [input, setInput] = useState('');
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const loadToken = useRef(0);

	const customDelimiterValid = delimiterOption !== 'custom' || validateDelimiter(customDelimiter);
	const delimiter = delimiterOption === 'custom' ? customDelimiter : DELIMITER_VALUES[delimiterOption];

	const settings: Settings = useMemo(
		() => ({ mode, delimiter, header, nested, prettyPrint, typed, escapeFormulae }),
		[mode, delimiter, header, nested, prettyPrint, typed, escapeFormulae],
	);

	const converted = useMemo<Converted>(() => {
		if (!customDelimiterValid) return { ...EMPTY, error: messages.customDelimiterInvalid };
		return convertOne(input, settings, messages);
	}, [input, settings, messages, customDelimiterValid]);
	const { output, error, warnings, notes, previewHeaders, previewRows } = converted;

	// Hint when the result is a single column but another common delimiter is on the first line.
	const suggestedDelimiter = useMemo(() => {
		if (mode !== 'csv-to-json' || !customDelimiterValid || input.trim() === '') return null;
		if (previewHeaders.length > 1) return null;
		return suggestDelimiter(input, delimiter);
	}, [mode, customDelimiterValid, input, previewHeaders.length, delimiter]);

	const applySuggestedDelimiter = () => {
		if (!suggestedDelimiter) return;
		if (suggestedDelimiter === ',') setDelimiterOption('comma');
		else if (suggestedDelimiter === ';') setDelimiterOption('semicolon');
		else if (suggestedDelimiter === '\t') setDelimiterOption('tab');
		else {
			setDelimiterOption('custom');
			setCustomDelimiter(suggestedDelimiter);
		}
	};

	// Batch results are derived from the raw files + current settings, so changing
	// any setting recomputes them instead of leaving a stale zip behind.
	const [batchEntries, setBatchEntries] = useState<BatchEntry[] | null>(null);
	const [isBatchZipping, setIsBatchZipping] = useState(false);
	const batchResults = useMemo<BatchResultItem[] | null>(() => {
		if (!batchEntries) return null;
		const outExt = mode === 'csv-to-json' ? 'json' : delimiterOption === 'tab' ? 'tsv' : 'csv';
		const names = dedupeFileNames(batchEntries.map((e) => `${e.name.replace(/\.[^./\\]+$/, '')}.${outExt}`));
		return batchEntries.map((entry, i) => {
			if (entry.readFailed) return { fileName: names[i], content: '', error: messages.batchReadError };
			if (!customDelimiterValid) return { fileName: names[i], content: '', error: messages.customDelimiterInvalid };
			const result = convertOne(entry.text, settings, messages);
			return { fileName: names[i], content: result.output, error: result.error };
		});
	}, [batchEntries, mode, delimiterOption, settings, messages, customDelimiterValid]);

	const handleSwap = () => {
		setMode((m) => (m === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json'));
		setInput(output);
	};

	const handleLoadSample = () => {
		setInput(mode === 'csv-to-json' ? SAMPLE_CSV : SAMPLE_JSON);
	};

	const readFileAsText = (file: File): Promise<BatchEntry> =>
		new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? ''), readFailed: false });
			reader.onerror = () => resolve({ name: file.name, text: '', readFailed: true });
			reader.onabort = () => resolve({ name: file.name, text: '', readFailed: true });
			reader.readAsText(file);
		});

	const handleFiles = (fileList: FileList | null, inputEl?: HTMLInputElement) => {
		if (!fileList || fileList.length === 0) return;
		const files = Array.from(fileList);
		// Reset so choosing the same file again still fires onChange.
		if (inputEl) inputEl.value = '';
		// A .tsv upload almost always means tab-delimited — switching the
		// delimiter automatically saves a manual step.
		if (files.every((file) => file.name.toLowerCase().endsWith('.tsv'))) setDelimiterOption('tab');

		// Token: only the most recently started load may write state, so a slow
		// earlier read can never overwrite a newer one.
		const token = ++loadToken.current;
		setBatchEntries(null);
		void Promise.all(files.map(readFileAsText)).then((entries) => {
			if (token !== loadToken.current) return;
			setInput(entries[0].readFailed ? '' : entries[0].text);
			// Batch: the first file loads into the editor for preview/tweaking, all files
			// are kept for the "Download All" zip (single file: no batch panel).
			if (entries.length > 1 || entries[0].readFailed) setBatchEntries(entries);
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
		const isJson = mode === 'csv-to-json';
		const isTsv = !isJson && delimiterOption === 'tab';
		// UTF-8 BOM so Excel on Windows detects the encoding (otherwise accented text is garbled).
		const parts = !isJson && addBom ? [BOM, output] : [output];
		const blob = new Blob(parts, {
			type: isJson ? 'application/json' : isTsv ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8',
		});
		saveBlob(blob, isJson ? 'output.json' : isTsv ? 'output.tsv' : 'output.csv');
	};

	const checkboxLabel = 'flex min-h-9 items-center gap-2 text-sm text-muted-foreground';

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
							onChange={(e) => setDelimiterOption(e.target.value as DelimiterOption)}
							className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
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
					accept=".csv,.tsv,.json,.txt"
					multiple
					className="sr-only"
					onChange={(e) => handleFiles(e.currentTarget.files, e.currentTarget)}
				/>
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
					onChange={(e) => setInput(e.target.value)}
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
				<Button type="button" size="sm" variant="ghost" onClick={() => setInput('')}>
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
				<Button type="button" size="sm" variant="outline" onClick={handleSwap} disabled={output === ''}>
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
