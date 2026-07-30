import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';

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
const EMPTY_PREVIEW = { previewHeaders: [] as string[], previewRows: [] as string[][] };

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
		} else {
			result[fullKey] = value;
		}
	}
	return result;
}

function unflattenObject(row: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		const parts = key.split('.');
		let target = result;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (typeof target[part] !== 'object' || target[part] === null || Array.isArray(target[part])) {
				target[part] = {};
			}
			target = target[part] as Record<string, unknown>;
		}
		target[parts[parts.length - 1]] = value;
	}
	return result;
}

function csvCellValue(value: unknown): string {
	if (value === undefined || value === null) return '';
	return Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// CSV is inherently tabular: an array of objects becomes one row per object (nested
// objects flattened with dot-notation keys; arrays kept as a stringified cell since a
// single CSV cell can't represent a list); a single object becomes one row.
function jsonToCsv(
	json: unknown,
	delimiter: string,
	header: boolean,
): { output: string; rootError: boolean; previewHeaders: string[]; previewRows: string[][] } {
	let rows: Record<string, unknown>[];
	if (Array.isArray(json)) {
		if (json.length === 0) return { output: '', rootError: false, previewHeaders: [], previewRows: [] };
		rows = json.map((item) =>
			item !== null && typeof item === 'object' && !Array.isArray(item)
				? flattenObject(item as Record<string, unknown>)
				: { value: item },
		);
	} else if (json !== null && typeof json === 'object') {
		rows = [flattenObject(json as Record<string, unknown>)];
	} else {
		return { output: '', rootError: true, previewHeaders: [], previewRows: [] };
	}

	const fields: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!fields.includes(key)) fields.push(key);
		}
	}
	const data = rows.map((row) => fields.map((field) => csvCellValue(row[field])));
	return {
		output: Papa.unparse({ fields, data }, { delimiter, header }),
		rootError: false,
		previewHeaders: fields,
		previewRows: data,
	};
}

function csvToJson(
	csv: string,
	delimiter: string,
	header: boolean,
	nested: boolean,
	pretty: boolean,
): {
	output: string;
	errorRow: number | null;
	errorMessage: string | null;
	previewHeaders: string[];
	previewRows: string[][];
} {
	const result = Papa.parse<Record<string, string> | string[]>(csv, {
		delimiter,
		header,
		skipEmptyLines: true,
		dynamicTyping: false,
	});

	if (result.errors.length > 0) {
		const first = result.errors[0];
		return { output: '', errorRow: first.row ?? 0, errorMessage: first.message, previewHeaders: [], previewRows: [] };
	}

	// Preview always reflects the flat, tabular shape actually parsed from the CSV — the
	// same regardless of the "nested" toggle, since nesting only reshapes the final JSON.
	let previewHeaders: string[];
	let previewRows: string[][];
	if (header) {
		previewHeaders = result.meta.fields ?? [];
		previewRows = (result.data as Record<string, string>[]).map((row) => previewHeaders.map((h) => row[h] ?? ''));
	} else {
		const rawRows = result.data as string[][];
		previewHeaders = Array.from({ length: rawRows[0]?.length ?? 0 }, (_, i) => `column${i + 1}`);
		previewRows = rawRows;
	}

	let data: unknown[];
	if (header) {
		data = nested
			? (result.data as Record<string, string>[]).map((row) => unflattenObject(row))
			: result.data;
	} else {
		data = (result.data as string[][]).map((row) => {
			const obj: Record<string, string> = {};
			row.forEach((cell, i) => {
				obj[`column${i + 1}`] = cell;
			});
			return obj;
		});
	}

	return {
		output: JSON.stringify(data, null, pretty ? 2 : undefined),
		errorRow: null,
		errorMessage: null,
		previewHeaders,
		previewRows,
	};
}

// Pulled out of the live-preview useMemo so batch file conversion (each file
// independently, same settings) can reuse the exact same logic instead of
// duplicating the csv-to-json / json-to-csv branching.
function convertOne(
	text: string,
	mode: Mode,
	delimiter: string,
	header: boolean,
	nested: boolean,
	prettyPrint: boolean,
	messages: Messages,
): { output: string; error: string | null; previewHeaders: string[]; previewRows: string[][] } {
	if (text.trim() === '') return { output: '', error: null, ...EMPTY_PREVIEW };

	if (mode === 'csv-to-json') {
		const result = csvToJson(text, delimiter, header, nested, prettyPrint);
		if (result.errorMessage !== null) {
			return {
				output: '',
				error: messages.csvParseError
					.replace('{{row}}', String(result.errorRow))
					.replace('{{message}}', result.errorMessage),
				...EMPTY_PREVIEW,
			};
		}
		return {
			output: result.output,
			error: null,
			previewHeaders: result.previewHeaders,
			previewRows: result.previewRows,
		};
	}

	try {
		const parsed = JSON.parse(text);
		const result = jsonToCsv(parsed, delimiter, header);
		if (result.rootError) return { output: '', error: messages.jsonRootError, ...EMPTY_PREVIEW };
		return {
			output: result.output,
			error: null,
			previewHeaders: result.previewHeaders,
			previewRows: result.previewRows,
		};
	} catch (e) {
		return {
			output: '',
			error: messages.jsonParseError.replace('{{message}}', e instanceof Error ? e.message : ''),
			...EMPTY_PREVIEW,
		};
	}
}

interface BatchResultItem {
	fileName: string;
	content: string;
	error: string | null;
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			disabled={value === ''}
			onClick={() => {
				void navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? copiedLabel : label}
		</Button>
	);
}

export default function CsvJsonConverter({ messages }: { messages: Messages }) {
	const [mode, setMode] = useState<Mode>('csv-to-json');
	const [delimiterOption, setDelimiterOption] = useState<DelimiterOption>('comma');
	const [customDelimiter, setCustomDelimiter] = useState(',');
	const [header, setHeader] = useState(true);
	const [nested, setNested] = useState(false);
	const [prettyPrint, setPrettyPrint] = useState(true);
	const [input, setInput] = useState('');
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const delimiter = delimiterOption === 'custom' ? customDelimiter || ',' : DELIMITER_VALUES[delimiterOption];

	const { output, error, previewHeaders, previewRows } = useMemo(
		() => convertOne(input, mode, delimiter, header, nested, prettyPrint, messages),
		[input, mode, delimiter, header, nested, prettyPrint, messages],
	);

	const [batchResults, setBatchResults] = useState<BatchResultItem[] | null>(null);
	const [isBatchZipping, setIsBatchZipping] = useState(false);

	const handleSwap = () => {
		setMode((m) => (m === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json'));
		setInput(output);
	};

	const handleLoadSample = () => {
		setInput(mode === 'csv-to-json' ? SAMPLE_CSV : SAMPLE_JSON);
	};

	const readFileAsText = (file: File): Promise<string> =>
		new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.readAsText(file);
		});

	const handleFiles = (fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) return;
		const files = Array.from(fileList);
		// A .tsv upload almost always means tab-delimited — switching the
		// delimiter automatically saves a manual step most CSV↔JSON converters
		// (CloudConvert, Convertio) require the user to do themselves.
		if (files.every((file) => file.name.toLowerCase().endsWith('.tsv'))) setDelimiterOption('tab');

		if (files.length === 1) {
			setBatchResults(null);
			void readFileAsText(files[0]).then(setInput);
			return;
		}

		// Batch: convert every file independently with the current settings,
		// load the first one into the main editor so there's still something to
		// preview/tweak, and prepare the rest for a single "Download All" zip —
		// this tool's core UX is a single editable document, so batch mode
		// layers on top of that rather than replacing it with a file list.
		setBatchResults(null);
		void Promise.all(files.map(async (file) => ({ name: file.name, text: await readFileAsText(file) }))).then(
			(entries) => {
				setInput(entries[0].text);
				const outExt = mode === 'csv-to-json' ? 'json' : delimiterOption === 'tab' ? 'tsv' : 'csv';
				setBatchResults(
					entries.map(({ name, text }) => {
						const result = convertOne(text, mode, delimiter, header, nested, prettyPrint, messages);
						return {
							fileName: `${name.replace(/\.[^./\\]+$/, '')}.${outExt}`,
							content: result.output,
							error: result.error,
						};
					}),
				);
			},
		);
	};

	const handleDownloadBatch = async () => {
		if (!batchResults || batchResults.length === 0) return;
		setIsBatchZipping(true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			for (const item of batchResults) {
				if (item.error === null) zip.file(item.fileName, item.content);
			}
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'converted-files.zip';
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			setIsBatchZipping(false);
		}
	};

	const handleDownload = () => {
		if (output === '') return;
		const isJson = mode === 'csv-to-json';
		const isTsv = !isJson && delimiterOption === 'tab';
		const blob = new Blob([output], { type: isJson ? 'application/json' : isTsv ? 'text/tab-separated-values' : 'text/csv' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = isJson ? 'output.json' : isTsv ? 'output.tsv' : 'output.csv';
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<Button
					type="button"
					size="sm"
					variant={mode === 'csv-to-json' ? 'default' : 'outline'}
					onClick={() => setMode('csv-to-json')}
				>
					{messages.modeCsvToJson}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={mode === 'json-to-csv' ? 'default' : 'outline'}
					onClick={() => setMode('json-to-csv')}
				>
					{messages.modeJsonToCsv}
				</Button>
			</div>

			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<div className="flex flex-wrap items-end gap-4">
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
								className="w-16 rounded-md border border-border bg-background p-2 text-center font-mono text-sm text-foreground"
							/>
						</div>
					)}
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
						{messages.headerLabel}
					</label>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input
							type="checkbox"
							checked={nested}
							disabled={mode === 'json-to-csv'}
							onChange={(e) => setNested(e.target.checked)}
						/>
						{messages.nestedLabel}
					</label>
					{mode === 'csv-to-json' && (
						<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<input type="checkbox" checked={prettyPrint} onChange={(e) => setPrettyPrint(e.target.checked)} />
							{messages.prettyPrintLabel}
						</label>
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
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{messages.chooseFile}
				</label>
				<input
					id="csv-json-file-input"
					ref={fileInputRef}
					type="file"
					accept=".csv,.tsv,.json,.txt"
					multiple
					className="hidden"
					onChange={(e) => handleFiles(e.target.files)}
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
						<Button type="button" size="sm" variant="secondary" onClick={() => void handleDownloadBatch()} disabled={isBatchZipping}>
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
									{previewHeaders.map((h) => (
										<th key={h} className="border-b border-border px-2 py-1.5 font-medium text-foreground">
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
						<CopyButton value={output} label={messages.copy} copiedLabel={messages.copied} />
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
