import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Messages {
	sheetNameLabel: string;
	sheetNamePlaceholder: string;
	fileNameLabel: string;
	fileNamePlaceholder: string;
	flattenLabel: string;
	flattenHint: string;
	inputLabel: string;
	inputPlaceholder: string;
	dropLabel: string;
	chooseFile: string;
	loadSample: string;
	clear: string;
	jsonParseError: string;
	jsonRootError: string;
	previewHeading: string;
	previewInfo: string;
	sheetsInfo: string;
	moreRows: string;
	download: string;
	generating: string;
	downloadError: string;
}

interface Sheet {
	name: string;
	headers: string[];
	rows: Record<string, unknown>[];
}

const SAMPLE_JSON = JSON.stringify(
	{
		employees: [
			{ name: 'Ada Lovelace', department: 'Engineering', address: { city: 'London' } },
			{ name: 'Alan Turing', department: 'Engineering', address: { city: 'Maida Vale' } },
		],
		departments: [{ name: 'Engineering', headcount: 12 }],
	},
	null,
	2,
);

const PREVIEW_ROW_LIMIT = 20;

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

function cellValue(value: unknown): unknown {
	if (value === undefined || value === null) return '';
	if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
	return value;
}

function rowsFromArray(items: unknown[], flatten: boolean): { headers: string[]; rows: Record<string, unknown>[] } {
	const rows = items.map((item) => {
		const raw =
			item !== null && typeof item === 'object' && !Array.isArray(item)
				? flatten
					? flattenObject(item as Record<string, unknown>)
					: (item as Record<string, unknown>)
				: { value: item };
		const row: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(raw)) row[key] = cellValue(value);
		return row;
	});
	const headers: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!headers.includes(key)) headers.push(key);
		}
	}
	return { headers, rows };
}

function sanitizeSheetName(name: string): string {
	const cleaned = name.replace(/[\\/?*[\]:]/g, '_').trim();
	return (cleaned || 'Sheet1').slice(0, 31);
}

function uniqueSheetName(base: string, used: Set<string>): string {
	let candidate = sanitizeSheetName(base);
	let i = 2;
	while (used.has(candidate)) {
		const suffix = ` (${i})`;
		candidate = sanitizeSheetName(base).slice(0, 31 - suffix.length) + suffix;
		i++;
	}
	used.add(candidate);
	return candidate;
}

function buildSheets(json: unknown, sheetName: string, flatten: boolean): Sheet[] | null {
	const used = new Set<string>();

	if (Array.isArray(json)) {
		const { headers, rows } = rowsFromArray(json, flatten);
		return [{ name: uniqueSheetName(sheetName, used), headers, rows }];
	}

	if (json !== null && typeof json === 'object') {
		const entries = Object.entries(json as Record<string, unknown>);
		const allArrays = entries.length > 1 && entries.every(([, value]) => Array.isArray(value));
		if (allArrays) {
			return entries.map(([key, value]) => {
				const { headers, rows } = rowsFromArray(value as unknown[], flatten);
				return { name: uniqueSheetName(key, used), headers, rows };
			});
		}
		const { headers, rows } = rowsFromArray([json], flatten);
		return [{ name: uniqueSheetName(sheetName, used), headers, rows }];
	}

	return null;
}

export default function JsonExcelConverter({ messages }: { messages: Messages }) {
	const [input, setInput] = useState('');
	const [sheetName, setSheetName] = useState('Sheet1');
	const [fileName, setFileName] = useState('');
	const [flatten, setFlatten] = useState(true);
	const [isDragOver, setIsDragOver] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [activeSheet, setActiveSheet] = useState(0);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { sheets, error } = useMemo(() => {
		if (input.trim() === '') return { sheets: null as Sheet[] | null, error: null as string | null };
		try {
			const parsed = JSON.parse(input);
			const result = buildSheets(parsed, sheetName || 'Sheet1', flatten);
			if (result === null) return { sheets: null, error: messages.jsonRootError };
			return { sheets: result, error: null as string | null };
		} catch (e) {
			return {
				sheets: null,
				error: messages.jsonParseError.replace('{{message}}', e instanceof Error ? e.message : ''),
			};
		}
	}, [input, sheetName, flatten, messages]);

	const currentSheet = sheets ? sheets[Math.min(activeSheet, sheets.length - 1)] : null;
	const totalRows = sheets ? sheets.reduce((sum, s) => sum + s.rows.length, 0) : 0;

	const handleLoadSample = () => {
		setInput(SAMPLE_JSON);
		setActiveSheet(0);
	};

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			setInput(String(reader.result ?? ''));
			setActiveSheet(0);
		};
		reader.readAsText(file);
	};

	const handleDownload = async () => {
		if (!sheets || sheets.length === 0) return;
		setIsGenerating(true);
		setDownloadError(null);
		try {
			const ExcelJS = (await import('exceljs')).default;
			const workbook = new ExcelJS.Workbook();
			for (const sheet of sheets) {
				const worksheet = workbook.addWorksheet(sheet.name);
				if (sheet.headers.length === 0) continue;
				worksheet.columns = sheet.headers.map((header) => ({
					header,
					key: header,
					width: Math.min(40, Math.max(10, header.length + 2)),
				}));
				worksheet.getRow(1).font = { bold: true };
				for (const row of sheet.rows) worksheet.addRow(row);
			}
			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			const name = fileName.trim() || 'output';
			link.download = name.toLowerCase().endsWith('.xlsx') ? name : `${name}.xlsx`;
			link.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			setDownloadError(messages.downloadError.replace('{{message}}', e instanceof Error ? e.message : String(e)));
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<div className="flex flex-wrap items-end gap-4">
					{(!sheets || sheets.length <= 1) && (
						<div className="flex flex-col gap-1">
							<label htmlFor="json-excel-sheet-name" className="text-xs text-muted-foreground">
								{messages.sheetNameLabel}
							</label>
							<input
								id="json-excel-sheet-name"
								type="text"
								value={sheetName}
								onChange={(e) => setSheetName(e.target.value)}
								placeholder={messages.sheetNamePlaceholder}
								className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
							/>
						</div>
					)}
					<div className="flex flex-col gap-1">
						<label htmlFor="json-excel-file-name" className="text-xs text-muted-foreground">
							{messages.fileNameLabel}
						</label>
						<input
							id="json-excel-file-name"
							type="text"
							value={fileName}
							onChange={(e) => setFileName(e.target.value)}
							placeholder={messages.fileNamePlaceholder}
							className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
						/>
					</div>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
						{messages.flattenLabel}
					</label>
				</div>
				<p className="text-xs text-muted-foreground">{messages.flattenHint}</p>
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
					htmlFor="json-excel-file-input"
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{messages.chooseFile}
				</label>
				<input
					id="json-excel-file-input"
					ref={fileInputRef}
					type="file"
					accept=".json,.txt"
					className="hidden"
					onChange={(e) => handleFile(e.target.files)}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<label htmlFor="json-excel-input" className="text-sm font-medium text-foreground">
					{messages.inputLabel}
				</label>
				<textarea
					id="json-excel-input"
					value={input}
					onChange={(e) => {
						setInput(e.target.value);
						setActiveSheet(0);
					}}
					placeholder={messages.inputPlaceholder}
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
			{downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}

			{sheets && currentSheet && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="text-sm font-medium text-foreground">{messages.previewHeading}</h3>
						<Button type="button" size="sm" onClick={handleDownload} disabled={isGenerating || totalRows === 0}>
							{isGenerating ? messages.generating : messages.download}
						</Button>
					</div>

					{sheets.length > 1 && (
						<div className="flex flex-wrap gap-2">
							{sheets.map((sheet, i) => (
								<Button
									key={sheet.name}
									type="button"
									size="sm"
									variant={i === activeSheet ? 'default' : 'outline'}
									onClick={() => setActiveSheet(i)}
								>
									{sheet.name}
								</Button>
							))}
						</div>
					)}

					<p className="text-xs text-muted-foreground">
						{messages.previewInfo
							.replace('{{rows}}', String(currentSheet.rows.length))
							.replace('{{cols}}', String(currentSheet.headers.length))}
						{sheets.length > 1 && ` — ${messages.sheetsInfo.replace('{{count}}', String(sheets.length))}`}
					</p>

					<div className="overflow-x-auto rounded-md border border-border">
						<table className="w-full border-collapse text-left text-xs">
							<thead>
								<tr className="bg-muted">
									{currentSheet.headers.map((h) => (
										<th key={h} className="border-b border-border px-2 py-1.5 font-medium text-foreground">
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{currentSheet.rows.slice(0, PREVIEW_ROW_LIMIT).map((row, i) => (
									<tr key={i} className="border-b border-border last:border-0">
										{currentSheet.headers.map((h) => (
											<td key={h} className="px-2 py-1.5 text-muted-foreground">
												{String(row[h] ?? '')}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{currentSheet.rows.length > PREVIEW_ROW_LIMIT && (
						<p className="text-xs text-muted-foreground">
							{messages.moreRows.replace('{{count}}', String(currentSheet.rows.length - PREVIEW_ROW_LIMIT))}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
