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
	outputLabel: string;
	copy: string;
	copied: string;
	download: string;
	csvParseError: string;
	jsonParseError: string;
	jsonRootError: string;
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
): { output: string; rootError: boolean } {
	let rows: Record<string, unknown>[];
	if (Array.isArray(json)) {
		if (json.length === 0) return { output: '', rootError: false };
		rows = json.map((item) =>
			item !== null && typeof item === 'object' && !Array.isArray(item)
				? flattenObject(item as Record<string, unknown>)
				: { value: item },
		);
	} else if (json !== null && typeof json === 'object') {
		rows = [flattenObject(json as Record<string, unknown>)];
	} else {
		return { output: '', rootError: true };
	}

	const fields: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!fields.includes(key)) fields.push(key);
		}
	}
	const data = rows.map((row) => fields.map((field) => csvCellValue(row[field])));
	return { output: Papa.unparse({ fields, data }, { delimiter, header }), rootError: false };
}

function csvToJson(
	csv: string,
	delimiter: string,
	header: boolean,
	nested: boolean,
	pretty: boolean,
): { output: string; errorRow: number | null; errorMessage: string | null } {
	const result = Papa.parse<Record<string, string> | string[]>(csv, {
		delimiter,
		header,
		skipEmptyLines: true,
		dynamicTyping: false,
	});

	if (result.errors.length > 0) {
		const first = result.errors[0];
		return { output: '', errorRow: first.row ?? 0, errorMessage: first.message };
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

	return { output: JSON.stringify(data, null, pretty ? 2 : undefined), errorRow: null, errorMessage: null };
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

	const { output, error } = useMemo(() => {
		if (input.trim() === '') return { output: '', error: null as string | null };

		if (mode === 'csv-to-json') {
			const result = csvToJson(input, delimiter, header, nested, prettyPrint);
			if (result.errorMessage !== null) {
				return {
					output: '',
					error: messages.csvParseError
						.replace('{{row}}', String(result.errorRow))
						.replace('{{message}}', result.errorMessage),
				};
			}
			return { output: result.output, error: null as string | null };
		}

		try {
			const parsed = JSON.parse(input);
			const result = jsonToCsv(parsed, delimiter, header);
			if (result.rootError) return { output: '', error: messages.jsonRootError };
			return { output: result.output, error: null as string | null };
		} catch (e) {
			return {
				output: '',
				error: messages.jsonParseError.replace('{{message}}', e instanceof Error ? e.message : ''),
			};
		}
	}, [input, mode, delimiter, header, nested, prettyPrint, messages]);

	const handleSwap = () => {
		setMode((m) => (m === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json'));
		setInput(output);
	};

	const handleLoadSample = () => {
		setInput(mode === 'csv-to-json' ? SAMPLE_CSV : SAMPLE_JSON);
	};

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setInput(String(reader.result ?? ''));
		reader.readAsText(file);
	};

	const handleDownload = () => {
		if (output === '') return;
		const isJson = mode === 'csv-to-json';
		const blob = new Blob([output], { type: isJson ? 'application/json' : 'text/csv' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = isJson ? 'output.json' : 'output.csv';
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
					handleFile(e.dataTransfer.files);
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
					accept=".csv,.json,.txt"
					className="hidden"
					onChange={(e) => handleFile(e.target.files)}
				/>
			</div>

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

			{error && <p className="text-sm text-destructive">{error}</p>}

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
