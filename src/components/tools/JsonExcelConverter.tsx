import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	EXCEL_MAX_CELL_CHARS,
	EXCEL_MAX_COLS,
	EXCEL_MAX_ROWS,
	applySheetLayout,
	buildSheets,
	sanitizeFileName,
	sheetToCsv,
	type ArrayMode,
	type BuildStats,
	type EpochMode,
	type Sheet,
} from '@/lib/json-excel';
import { mergeColumnSpec, type ColumnSpec } from '@/lib/csv-json';

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
	warnRenamedSheets: string;
	advancedHeading: string;
	arrayModeLabel: string;
	arrayModeJson: string;
	arrayModeDetail: string;
	arrayModeJoin: string;
	arrayModeDetailInfo: string;
	joinSeparatorLabel: string;
	isoDatesLabel: string;
	epochLabel: string;
	epochOff: string;
	epochSeconds: string;
	epochMilliseconds: string;
	datesHint: string;
	freezeLabel: string;
	autoFilterLabel: string;
	tableStyleLabel: string;
	columnsHeading: string;
	columnInclude: string;
	columnRename: string;
	columnMoveUp: string;
	columnMoveDown: string;
	columnsReset: string;
	downloadCsv: string;
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
	if (value instanceof Date) return value.toISOString();
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
	if (stats.renamedSheets.length > 0) {
		out.push(messages.warnRenamedSheets.replace('{{names}}', stats.renamedSheets.join(', ')));
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
	const [arrayMode, setArrayMode] = useState<ArrayMode>('json');
	const [joinSeparator, setJoinSeparator] = useState(', ');
	const [isoDates, setIsoDates] = useState(false);
	const [epoch, setEpoch] = useState<EpochMode>('off');
	const [freezeHeader, setFreezeHeader] = useState(false);
	const [autoFilter, setAutoFilter] = useState(false);
	const [tableStyle, setTableStyle] = useState(false);
	// Column layout per sheet name (select / reorder / rename); only applied once customised.
	const [layouts, setLayouts] = useState<Record<string, ColumnSpec[]>>({});
	const fileInputRef = useRef<HTMLInputElement>(null);
	const loadToken = useRef(0);

	const built = useMemo(() => {
		if (input.trim() === '') return { sheets: null as Sheet[] | null, stats: null as BuildStats | null, error: null as string | null };
		try {
			const parsed: unknown = JSON.parse(input);
			const result = buildSheets(parsed, { sheetName: sheetName || 'Sheet1', flatten, unwrap, arrayMode, joinSeparator, isoDates, epoch });
			if (result === null) return { sheets: null, stats: null, error: messages.jsonRootError };
			return { sheets: result.sheets, stats: result.stats, error: null as string | null };
		} catch (e) {
			return {
				sheets: null,
				stats: null,
				error: messages.jsonParseError.replace('{{message}}', e instanceof Error ? e.message : ''),
			};
		}
	}, [input, sheetName, flatten, unwrap, arrayMode, joinSeparator, isoDates, epoch, messages]);
	const { stats, error } = built;
	const builtSheets = built.sheets;

	const sheets = useMemo(
		() => (builtSheets ? builtSheets.map((sheet) => applySheetLayout(sheet, layouts[sheet.name])) : null),
		[builtSheets, layouts],
	);

	// A different set of built sheets (new input / options) must not leave a stale tab selected.
	useEffect(() => {
		setActiveSheet(0);
	}, [builtSheets]);

	const currentSheet = sheets ? sheets[Math.min(activeSheet, sheets.length - 1)] : null;
	const currentRaw = builtSheets ? builtSheets[Math.min(activeSheet, builtSheets.length - 1)] : null;
	const currentSpec = currentRaw ? mergeColumnSpec(layouts[currentRaw.name] ?? [], currentRaw.headers) : [];

	const setCurrentSpec = (update: (prev: ColumnSpec[]) => ColumnSpec[]) => {
		if (!currentRaw) return;
		const name = currentRaw.name;
		setLayouts((prev) => ({ ...prev, [name]: update(mergeColumnSpec(prev[name] ?? [], currentRaw.headers)) }));
	};
	const moveColumn = (index: number, delta: number) =>
		setCurrentSpec((prev) => {
			const target = index + delta;
			if (target < 0 || target >= prev.length) return prev;
			const next = [...prev];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	const updateColumn = (index: number, patch: Partial<ColumnSpec>) =>
		setCurrentSpec((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
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
				const headerRow = worksheet.getRow(1);
				headerRow.font = tableStyle ? { bold: true, color: { argb: 'FFFFFFFF' } } : { bold: true };
				if (tableStyle) {
					headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
					headerRow.alignment = { vertical: 'middle' };
				}
				const formats = sheet.columnFormats ?? [];
				sheet.headers.forEach((header, i) => {
					const column = worksheet.getColumn(i + 1);
					column.width = Math.min(40, Math.max(formats[i] ? 20 : 10, header.length + 2));
				});
				let added = 0;
				for (const row of sheet.rows) {
					const excelRow = worksheet.addRow(row);
					// Dates need an explicit number format or Excel shows the serial number.
					formats.forEach((format, c) => {
						if (format && row[c] instanceof Date) excelRow.getCell(c + 1).numFmt = format;
					});
					if (tableStyle && added % 2 === 1 && sheet.rows.length <= 50000) {
						excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FA' } };
					}
					// Yield periodically so very large sheets do not freeze the page.
					added += 1;
					if (added % 5000 === 0) await tick();
				}
				if (freezeHeader) worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
				if (autoFilter) {
					worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.headers.length } };
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

	const handleDownloadCsv = () => {
		if (!currentSheet) return;
		// UTF-8 BOM so Excel on Windows detects the encoding.
		const blob = new Blob(['﻿', sheetToCsv(currentSheet)], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		const name = sanitizeFileName(fileName.trim() || 'output').replace(/\.xlsx$/i, '');
		link.download = sheets && sheets.length > 1 ? `${name}-${sanitizeFileName(currentSheet.name)}.csv` : `${name}.csv`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	};

	const checkboxLabel = 'flex min-h-9 items-center gap-2 text-sm text-muted-foreground';
	const fieldClass = 'rounded-md border border-border bg-background p-2 text-sm text-foreground';

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

				<details className="rounded-md border border-border px-3 py-2">
					<summary className="min-h-9 cursor-pointer text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
						{messages.advancedHeading}
					</summary>
					<div className="mt-2 flex flex-col gap-3">
						<div className="flex flex-wrap items-end gap-x-4 gap-y-2">
							<div className="flex flex-col gap-1">
								<label htmlFor="json-excel-array-mode" className="text-xs text-muted-foreground">
									{messages.arrayModeLabel}
								</label>
								<select
									id="json-excel-array-mode"
									value={arrayMode}
									onChange={(e) => setArrayMode(e.target.value as ArrayMode)}
									className={`${fieldClass} max-w-full`}
								>
									<option value="json">{messages.arrayModeJson}</option>
									<option value="detail">{messages.arrayModeDetail}</option>
									<option value="join">{messages.arrayModeJoin}</option>
								</select>
							</div>
							{arrayMode === 'join' && (
								<div className="flex flex-col gap-1">
									<label htmlFor="json-excel-join" className="text-xs text-muted-foreground">
										{messages.joinSeparatorLabel}
									</label>
									<input
										id="json-excel-join"
										type="text"
										value={joinSeparator}
										maxLength={10}
										onChange={(e) => setJoinSeparator(e.target.value)}
										className={`${fieldClass} w-24 font-mono`}
									/>
								</div>
							)}
							<div className="flex flex-col gap-1">
								<label htmlFor="json-excel-epoch" className="text-xs text-muted-foreground">
									{messages.epochLabel}
								</label>
								<select id="json-excel-epoch" value={epoch} onChange={(e) => setEpoch(e.target.value as EpochMode)} className={fieldClass}>
									<option value="off">{messages.epochOff}</option>
									<option value="seconds">{messages.epochSeconds}</option>
									<option value="milliseconds">{messages.epochMilliseconds}</option>
								</select>
							</div>
						</div>
						{arrayMode === 'detail' && <p className="text-xs text-muted-foreground">{messages.arrayModeDetailInfo}</p>}
						<div className="flex flex-wrap items-center gap-x-4">
							<label className={checkboxLabel}>
								<input type="checkbox" className="size-4" checked={isoDates} onChange={(e) => setIsoDates(e.target.checked)} />
								{messages.isoDatesLabel}
							</label>
							<label className={checkboxLabel}>
								<input type="checkbox" className="size-4" checked={freezeHeader} onChange={(e) => setFreezeHeader(e.target.checked)} />
								{messages.freezeLabel}
							</label>
							<label className={checkboxLabel}>
								<input type="checkbox" className="size-4" checked={autoFilter} onChange={(e) => setAutoFilter(e.target.checked)} />
								{messages.autoFilterLabel}
							</label>
							<label className={checkboxLabel}>
								<input type="checkbox" className="size-4" checked={tableStyle} onChange={(e) => setTableStyle(e.target.checked)} />
								{messages.tableStyleLabel}
							</label>
						</div>
						<p className="text-xs text-muted-foreground">{messages.datesHint}</p>

						{currentRaw && currentSpec.length > 0 && (
							<div className="flex flex-col gap-2">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-sm font-medium text-foreground">{messages.columnsHeading.replace('{{sheet}}', currentRaw.name)}</span>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => setLayouts((prev) => ({ ...prev, [currentRaw.name]: mergeColumnSpec([], currentRaw.headers) }))}
									>
										{messages.columnsReset}
									</Button>
								</div>
								<ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
									{currentSpec.map((col, i) => (
										<li key={col.source} className="flex min-w-0 flex-wrap items-center gap-2">
											<input
												type="checkbox"
												className="size-5"
												checked={col.include}
												aria-label={messages.columnInclude.replace('{{name}}', col.source === '' ? messages.emptyKey : col.source)}
												onChange={(e) => updateColumn(i, { include: e.target.checked })}
											/>
											<input
												type="text"
												value={col.name}
												spellCheck={false}
												aria-label={messages.columnRename.replace('{{name}}', col.source === '' ? messages.emptyKey : col.source)}
												onChange={(e) => updateColumn(i, { name: e.target.value })}
												className={`${fieldClass} min-h-9 min-w-0 flex-1 basis-32 font-mono`}
											/>
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="min-h-9 min-w-9"
												disabled={i === 0}
												aria-label={messages.columnMoveUp.replace('{{name}}', col.source === '' ? messages.emptyKey : col.source)}
												onClick={() => moveColumn(i, -1)}
											>
												↑
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="min-h-9 min-w-9"
												disabled={i === currentSpec.length - 1}
												aria-label={messages.columnMoveDown.replace('{{name}}', col.source === '' ? messages.emptyKey : col.source)}
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
						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" size="sm" variant="outline" onClick={handleDownloadCsv} disabled={totalRows === 0}>
								{messages.downloadCsv}
							</Button>
							<Button type="button" size="sm" onClick={handleDownload} disabled={isGenerating || totalRows === 0}>
								{isGenerating ? messages.generating : messages.download}
							</Button>
						</div>
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
