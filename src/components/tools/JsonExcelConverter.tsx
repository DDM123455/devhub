import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	EXCEL_MAX_CELL_CHARS,
	EXCEL_MAX_COLS,
	EXCEL_MAX_ROWS,
	buildSheets,
	sanitizeFileName,
	type BuildStats,
	type Sheet,
} from '@/lib/json-excel';

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
	unwrapLabel: string;
	unwrappedInfo: string;
	emptyState: string;
	emptyKey: string;
	previewCaption: string;
	fileReadError: string;
	warnTruncatedCells: string;
	warnRowLimit: string;
	warnColLimit: string;
	warnUnsafeIntegers: string;
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
const PREVIEW_CELL_CHARS = 200;

function previewText(value: unknown): string {
	const text = String(value ?? '');
	return text.length > PREVIEW_CELL_CHARS ? `${text.slice(0, PREVIEW_CELL_CHARS)}…` : text;
}

function warningsFor(stats: BuildStats, messages: Messages): string[] {
	const out: string[] = [];
	if (stats.truncatedCells > 0) {
		out.push(
			messages.warnTruncatedCells
				.replace('{{count}}', String(stats.truncatedCells))
				.replace('{{max}}', EXCEL_MAX_CELL_CHARS.toLocaleString('en-US')),
		);
	}
	if (stats.rowLimitSheets.length > 0) {
		out.push(
			messages.warnRowLimit
				.replace('{{sheets}}', stats.rowLimitSheets.join(', '))
				.replace('{{max}}', (EXCEL_MAX_ROWS - 1).toLocaleString('en-US')),
		);
	}
	if (stats.colLimitSheets.length > 0) {
		out.push(
			messages.warnColLimit
				.replace('{{sheets}}', stats.colLimitSheets.join(', '))
				.replace('{{max}}', EXCEL_MAX_COLS.toLocaleString('en-US')),
		);
	}
	if (stats.unsafeIntegers > 0) {
		out.push(messages.warnUnsafeIntegers.replace('{{count}}', String(stats.unsafeIntegers)));
	}
	return out;
}

export default function JsonExcelConverter({ messages }: { messages: Messages }) {
	const [input, setInput] = useState('');
	const [sheetName, setSheetName] = useState('Sheet1');
	const [fileName, setFileName] = useState('');
	const [flatten, setFlatten] = useState(true);
	const [unwrap, setUnwrap] = useState(true);
	const [isDragOver, setIsDragOver] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [activeSheet, setActiveSheet] = useState(0);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const loadToken = useRef(0);

	const { sheets, stats, error } = useMemo(() => {
		if (input.trim() === '') return { sheets: null as Sheet[] | null, stats: null as BuildStats | null, error: null as string | null };
		try {
			const parsed: unknown = JSON.parse(input);
			const result = buildSheets(parsed, { sheetName: sheetName || 'Sheet1', flatten, unwrap });
			if (result === null) return { sheets: null, stats: null, error: messages.jsonRootError };
			return { sheets: result.sheets, stats: result.stats, error: null as string | null };
		} catch (e) {
			return {
				sheets: null,
				stats: null,
				error: messages.jsonParseError.replace('{{message}}', e instanceof Error ? e.message : ''),
			};
		}
	}, [input, sheetName, flatten, unwrap, messages]);

	// A different set of sheets (new input / options) must not leave a stale tab selected.
	useEffect(() => {
		setActiveSheet(0);
	}, [sheets]);

	const currentSheet = sheets ? sheets[Math.min(activeSheet, sheets.length - 1)] : null;
	const totalRows = sheets ? sheets.reduce((sum, s) => sum + s.rows.length, 0) : 0;
	const warnings = stats ? warningsFor(stats, messages) : [];
	const unwrappedKey = sheets && sheets.length === 1 ? sheets[0].sourceKey : undefined;

	const handleLoadSample = () => {
		setInput(SAMPLE_JSON);
		setFileError(null);
	};

	const handleFile = (files: FileList | null, inputEl?: HTMLInputElement) => {
		const file = files?.[0];
		if (inputEl) inputEl.value = '';
		if (!file) return;
		setFileError(null);
		const token = ++loadToken.current;
		const reader = new FileReader();
		reader.onload = () => {
			if (token !== loadToken.current) return;
			setInput(String(reader.result ?? ''));
		};
		reader.onerror = () => {
			if (token === loadToken.current) setFileError(messages.fileReadError);
		};
		reader.readAsText(file);
	};

	const handleDownload = async () => {
		if (!sheets || sheets.length === 0) return;
		setIsGenerating(true);
		setDownloadError(null);
		const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
		try {
			// Let React paint the "Generating…" state before the heavy work starts.
			await tick();
			const ExcelJS = (await import('exceljs')).default;
			const workbook = new ExcelJS.Workbook();
			for (const sheet of sheets) {
				const worksheet = workbook.addWorksheet(sheet.name);
				if (sheet.headers.length === 0) continue;
				// Positional arrays (not keyed objects) so empty-string and "__proto__" headers keep their data.
				worksheet.addRow(sheet.headers);
				worksheet.getRow(1).font = { bold: true };
				sheet.headers.forEach((header, i) => {
					worksheet.getColumn(i + 1).width = Math.min(40, Math.max(10, header.length + 2));
				});
				let added = 0;
				for (const row of sheet.rows) {
					worksheet.addRow(row);
					// Yield periodically so very large sheets do not freeze the page.
					added += 1;
					if (added % 5000 === 0) await tick();
				}
				await tick();
			}
			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			const name = sanitizeFileName(fileName.trim() || 'output');
			link.download = name.toLowerCase().endsWith('.xlsx') ? name : `${name}.xlsx`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 10000);
		} catch (e) {
			setDownloadError(messages.downloadError.replace('{{message}}', e instanceof Error ? e.message : String(e)));
		} finally {
			setIsGenerating(false);
		}
	};

	const checkboxLabel = 'flex min-h-9 items-center gap-2 text-sm text-muted-foreground';

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<div className="flex flex-wrap items-end gap-x-4 gap-y-1">
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
					<label className={checkboxLabel}>
						<input type="checkbox" className="size-4" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
						{messages.flattenLabel}
					</label>
					<label className={checkboxLabel}>
						<input type="checkbox" className="size-4" checked={unwrap} onChange={(e) => setUnwrap(e.target.checked)} />
						{messages.unwrapLabel}
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
					className="inline-flex min-h-9 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-2 focus-within:ring-ring"
				>
					{messages.chooseFile}
				</label>
				<input
					id="json-excel-file-input"
					ref={fileInputRef}
					type="file"
					accept=".json,.txt"
					className="sr-only"
					onChange={(e) => handleFile(e.currentTarget.files, e.currentTarget)}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<label htmlFor="json-excel-input" className="text-sm font-medium text-foreground">
					{messages.inputLabel}
				</label>
				<textarea
					id="json-excel-input"
					value={input}
					onChange={(e) => setInput(e.target.value)}
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
			{fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
			{downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}

			{warnings.length > 0 && (
				<ul role="status" className="flex flex-col gap-1 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
					{warnings.map((w) => (
						<li key={w}>{w}</li>
					))}
				</ul>
			)}

			{sheets && currentSheet && totalRows === 0 && (
				<p role="status" className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
					{messages.emptyState}
				</p>
			)}

			{sheets && currentSheet && totalRows > 0 && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="text-sm font-medium text-foreground">{messages.previewHeading}</h3>
						<Button type="button" size="sm" onClick={handleDownload} disabled={isGenerating || totalRows === 0}>
							{isGenerating ? messages.generating : messages.download}
						</Button>
					</div>

					{unwrappedKey !== undefined && (
						<p className="text-xs text-muted-foreground">{messages.unwrappedInfo.replace('{{key}}', unwrappedKey)}</p>
					)}

					{sheets.length > 1 && (
						<div className="flex flex-wrap gap-2">
							{sheets.map((sheet, i) => (
								<Button
									key={sheet.name.toLowerCase()}
									type="button"
									size="sm"
									variant={i === activeSheet ? 'default' : 'outline'}
									aria-pressed={i === activeSheet}
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
							<caption className="sr-only">{messages.previewCaption.replace('{{sheet}}', currentSheet.name)}</caption>
							<thead>
								<tr className="bg-muted">
									{currentSheet.headers.map((h, i) => (
										<th key={i} scope="col" className="border-b border-border px-2 py-1.5 font-medium text-foreground">
											{h === '' ? <em>{messages.emptyKey}</em> : h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{currentSheet.rows.slice(0, PREVIEW_ROW_LIMIT).map((row, i) => (
									<tr key={i} className="border-b border-border last:border-0">
										{row.map((cell, j) => (
											<td key={j} className="px-2 py-1.5 text-muted-foreground">
												{previewText(cell)}
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
