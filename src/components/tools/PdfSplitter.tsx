import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { renderPdfThumbnails } from '@/lib/pdf-thumbnails';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
	combineRotation,
	everyNRanges,
	isPasswordError,
	parseRanges,
	RangeParseError,
	type PositionRange,
} from '@/lib/pdf-utils';
import { dedupeName } from '@/lib/file-utils';

interface Messages {
	selectFile: string;
	dropHint: string;
	noFile: string;
	changeFile: string;
	loadingThumbnails: string;
	pageCount: string;
	rotate: string;
	deletePage: string;
	undo: string;
	modeLabel: string;
	modeRanges: string;
	modeEveryN: string;
	modeCheckbox: string;
	everyNLabel: string;
	rangesLabel: string;
	rangesPlaceholder: string;
	rangesHint: string;
	selectedCount: string;
	selectAll: string;
	clearSelection: string;
	dragHint: string;
	split: string;
	splitting: string;
	resultsHeading: string;
	download: string;
	downloadAll: string;
	errorGeneric: string;
	errorPassword: string;
	errorInvalidRange: string;
	errorInvalidEveryN: string;
	errorNoPagesSelected: string;
	selectPageAria: string;
	processingQueue: string;
}

interface PageEntry {
	id: string;
	pageIndex: number;
	dataUrl: string;
	rotation: 0 | 90 | 180 | 270;
}

interface ResultFile {
	id: string;
	label: string;
	blob: Blob;
	previewThumbnails: string[];
}

interface SplitGroup {
	entries: PageEntry[];
	label: string;
}

type SplitMode = 'ranges' | 'everyN' | 'checkbox';

// Splitting with pdf-lib is byte-level page copying, no ML inference or pixel
// decoding involved, so it stays fast on the main thread — same reasoning as
// the Merge PDF tool for not needing a dedicated Web Worker. Page thumbnails
// are rendered separately with pdf.js purely for the visual picker.
export default function PdfSplitter({ messages }: { messages: Messages }) {
	const [file, setFile] = useState<File | null>(null);
	const [pages, setPages] = useState<PageEntry[]>([]);
	const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);
	const [splitMode, setSplitMode] = useState<SplitMode>('ranges');
	const [rangesInput, setRangesInput] = useState('');
	const [everyN, setEveryN] = useState(1);
	const [isProcessing, setIsProcessing] = useState(false);
	const [splitProgress, setSplitProgress] = useState<{ current: number; total: number } | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [results, setResults] = useState<ResultFile[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isZipping, setIsZipping] = useState(false);
	const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
	const [dragPageId, setDragPageId] = useState<string | null>(null);

	// Minimal undo for rotate/delete/reorder (same pattern as PDF Merge): a
	// stack of `{pages, selectedPageIds}` snapshots — both together, since
	// deleting a page also drops it from the selection, and undoing the
	// delete should bring the selection back too.
	const undoStackRef = useRef<{ pages: PageEntry[]; selectedPageIds: Set<string> }[]>([]);
	const [canUndo, setCanUndo] = useState(false);

	const pushUndoSnapshot = useCallback((snapshot: { pages: PageEntry[]; selectedPageIds: Set<string> }) => {
		undoStackRef.current.push(snapshot);
		if (undoStackRef.current.length > 50) undoStackRef.current.shift();
		setCanUndo(true);
	}, []);

	const handleUndo = useCallback(() => {
		const previous = undoStackRef.current.pop();
		if (!previous) return;
		setCanUndo(undoStackRef.current.length > 0);
		setResults([]);
		setPages(previous.pages);
		setSelectedPageIds(previous.selectedPageIds);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
			if (!isUndoShortcut) return;
			// Để input/textarea tự undo văn bản của chúng.
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
			event.preventDefault();
			handleUndo();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [handleUndo]);

	const loadTokenRef = useRef(0);

	const loadFile = useCallback(async (candidate: File) => {
		const token = ++loadTokenRef.current;
		undoStackRef.current = [];
		setCanUndo(false);
		setError(null);
		setResults([]);
		setFile(null);
		setPages([]);
		setSelectedPageIds(new Set());
		setIsLoadingThumbnails(true);
		try {
			const bytes = await candidate.arrayBuffer();
			const thumbnails = await renderPdfThumbnails(bytes);
			// Người dùng đã chọn file khác trong lúc đang đọc file này: bỏ kết quả cũ.
			if (token !== loadTokenRef.current) return;
			setFile(candidate);
			setPages(
				thumbnails.map((thumb) => ({
					id: `page-${thumb.pageIndex}`,
					pageIndex: thumb.pageIndex,
					dataUrl: thumb.dataUrl,
					rotation: 0,
				})),
			);
		} catch (err) {
			if (token !== loadTokenRef.current) return;
			setError(isPasswordError(err) ? messages.errorPassword : messages.errorGeneric);
		}
		if (token === loadTokenRef.current) setIsLoadingThumbnails(false);
	}, [messages.errorGeneric, messages.errorPassword]);

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) return;
		const candidate = Array.from(fileList).find(
			(item) => item.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf'),
		);
		if (candidate) void loadFile(candidate);
	}, [loadFile]);

	const handleDeletePage = useCallback((id: string) => {
		pushUndoSnapshot({ pages, selectedPageIds });
		setResults([]);
		setPages((prev) => prev.filter((page) => page.id !== id));
		setSelectedPageIds((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, [pages, selectedPageIds, pushUndoSnapshot]);

	const handleRotatePage = useCallback((id: string) => {
		pushUndoSnapshot({ pages, selectedPageIds });
		setResults([]);
		setPages((prev) =>
			prev.map((page) =>
				page.id === id ? { ...page, rotation: ((page.rotation + 90) % 360) as PageEntry['rotation'] } : page,
			),
		);
	}, [pages, selectedPageIds, pushUndoSnapshot]);

	const handleTogglePageSelected = useCallback((id: string) => {
		setResults([]);
		setSelectedPageIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const handleSelectAllPages = useCallback(() => {
		setResults([]);
		setSelectedPageIds(new Set(pages.map((page) => page.id)));
	}, [pages]);

	const handleClearSelection = useCallback(() => {
		setResults([]);
		setSelectedPageIds(new Set());
	}, []);

	// Drag-to-reorder pages before splitting — same pattern as PDF Merge — is
	// useful here too: range/every-N splitting both operate on the CURRENT
	// on-screen position of each page, so reordering first changes what "1-3"
	// or "every 2 pages" actually selects.
	const handleDropPage = useCallback(
		(targetId: string) => {
			setResults([]);
			setPages((prev) => {
				if (!dragPageId || dragPageId === targetId) return prev;
				const fromIndex = prev.findIndex((page) => page.id === dragPageId);
				const toIndex = prev.findIndex((page) => page.id === targetId);
				if (fromIndex === -1 || toIndex === -1) return prev;
				pushUndoSnapshot({ pages: prev, selectedPageIds });
				const next = [...prev];
				const [moved] = next.splice(fromIndex, 1);
				next.splice(toIndex, 0, moved);
				return next;
			});
			setDragPageId(null);
		},
		[dragPageId, selectedPageIds, pushUndoSnapshot],
	);

	const handleSplit = useCallback(async () => {
		if (!file || pages.length === 0) return;
		setIsProcessing(true);
		setError(null);
		setResults([]);
		setSplitProgress(null);

		try {
			let splitGroups: SplitGroup[];
			if (splitMode === 'everyN') {
				if (!Number.isInteger(everyN) || everyN < 1) {
					setError(messages.errorInvalidEveryN);
					setIsProcessing(false);
					return;
				}
				splitGroups = everyNRanges(everyN, pages.length).map((r) => ({
					entries: pages.slice(r.start - 1, r.end),
					label: r.start === r.end ? `page-${r.start}.pdf` : `pages-${r.start}-${r.end}.pdf`,
				}));
			} else if (splitMode === 'checkbox') {
				// Preserves current on-screen order (not selection order) — matches
				// the intuitive "extract these pages in document order" behavior of
				// checkbox-based extraction in iLovePDF/Smallpdf.
				const selected = pages.filter((page) => selectedPageIds.has(page.id));
				if (selected.length === 0) {
					setError(messages.errorNoPagesSelected);
					setIsProcessing(false);
					return;
				}
				splitGroups = [{ entries: selected, label: 'selected-pages.pdf' }];
			} else {
				const ranges: PositionRange[] = parseRanges(rangesInput, pages.length);
				splitGroups = ranges.map((r) => ({
					entries: pages.slice(r.start - 1, r.end),
					label: r.start === r.end ? `page-${r.start}.pdf` : `pages-${r.start}-${r.end}.pdf`,
				}));
			}

			// Tên file/nhãn trùng (vd "1,1") -> thêm hậu tố -1, -2 để không ghi đè nhau trong zip.
			const usedLabels = new Set<string>();
			splitGroups = splitGroups.map((group) => ({ ...group, label: dedupeName(group.label, usedLabels) }));

			const bytes = await file.arrayBuffer();
			const sourceDoc = await PDFDocument.load(bytes);

			const newResults: ResultFile[] = [];
			setSplitProgress({ current: 0, total: splitGroups.length });
			for (const [groupIndex, group] of splitGroups.entries()) {
				const outDoc = await PDFDocument.create();
				const copiedPages = await outDoc.copyPages(
					sourceDoc,
					group.entries.map((entry) => entry.pageIndex),
				);
				copiedPages.forEach((copiedPage, i) => {
					const rotation = group.entries[i].rotation;
					// Cộng với /Rotate gốc của trang (nếu không, trang gốc đã xoay sẽ bị đặt lại).
					if (rotation !== 0) {
						copiedPage.setRotation(degrees(combineRotation(copiedPage.getRotation().angle, rotation)));
					}
					outDoc.addPage(copiedPage);
				});
				const outBytes = await outDoc.save();
				newResults.push({
					id: `${group.label}-${Math.random().toString(36).slice(2)}`,
					label: group.label,
					blob: new Blob([outBytes], { type: 'application/pdf' }),
					// Reuses the thumbnails already rendered for the page picker —
					// each output file's pages are a subset of the source file's, so
					// there's nothing new to rasterize for the preview.
					previewThumbnails: group.entries.map((entry) => entry.dataUrl),
				});
				setSplitProgress({ current: groupIndex + 1, total: splitGroups.length });
			}
			setResults(newResults);
		} catch (err) {
			if (err instanceof RangeParseError) {
				setError(
					messages.errorInvalidRange
						.replace('{{range}}', err.token)
						.replace('{{max}}', String(pages.length)),
				);
			} else {
				setError(isPasswordError(err) ? messages.errorPassword : messages.errorGeneric);
			}
		}
		setIsProcessing(false);
	}, [file, pages, splitMode, rangesInput, everyN, selectedPageIds, messages]);

	const handleDownload = useCallback((result: ResultFile) => {
		const url = URL.createObjectURL(result.blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = result.label;
		link.click();
		URL.revokeObjectURL(url);
	}, []);

	const handleDownloadAll = useCallback(async () => {
		setIsZipping(true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			for (const result of results) zip.file(result.label, result.blob);
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'split-pages.zip';
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			setIsZipping(false);
		}
	}, [results]);

	const canSplit = !isProcessing && file !== null && pages.length > 0;

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<div
				className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed p-4 transition-colors ${
					isDragOver ? 'border-primary bg-primary/5' : 'border-border'
				}`}
				onDragOver={(event) => {
					event.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(event) => {
					event.preventDefault();
					setIsDragOver(false);
					handleFiles(event.dataTransfer.files);
				}}
			>
				<label className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-3 focus-within:ring-ring/50">
					{file ? messages.changeFile : messages.selectFile}
					<input
						id="pdf-splitter-input"
						type="file"
						accept="application/pdf"
						className="sr-only"
						onChange={(event) => {
							handleFiles(event.target.files);
							// Cho phép chọn lại đúng file đó lần nữa.
							event.target.value = '';
						}}
					/>
				</label>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			{isLoadingThumbnails && <p role="status" className="text-sm text-muted-foreground">{messages.loadingThumbnails}</p>}

			{!file || pages.length === 0 ? (
				!isLoadingThumbnails && <p className="text-sm text-muted-foreground">{messages.noFile}</p>
			) : (
				<div className="flex flex-col gap-4">
					<div className="flex items-center justify-between gap-2">
						<p className="text-sm text-foreground">
							{file.name} — {messages.pageCount.replace('{{count}}', String(pages.length))}
						</p>
						<Button type="button" size="sm" variant="ghost" onClick={handleUndo} disabled={!canUndo} title={`${messages.undo} (Ctrl+Z)`}>
							{messages.undo}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">{messages.dragHint}</p>

					<ul className="flex flex-wrap gap-3">
						{pages.map((page, index) => (
							<li
								key={page.id}
								draggable
								onDragStart={() => setDragPageId(page.id)}
								onDragOver={(event) => event.preventDefault()}
								onDrop={(event) => {
									event.preventDefault();
									handleDropPage(page.id);
								}}
								className={`flex w-28 cursor-grab flex-col gap-1 rounded-md border border-border bg-card p-1.5 ${
									dragPageId === page.id ? 'opacity-50' : ''
								}`}
							>
								<div
									className="relative overflow-hidden rounded bg-muted"
									// Click vào ảnh cũng chọn trang (tiện cho chuột). Điều khiển bàn phím/AT là checkbox bên trong,
									// nên không bọc role=button và bỏ qua click đến từ chính checkbox (tránh toggle 2 lần).
									onClick={
										splitMode === 'checkbox'
											? (event) => {
													if ((event.target as HTMLElement).tagName === 'INPUT') return;
													handleTogglePageSelected(page.id);
												}
											: undefined
									}
								>
									<img
										src={page.dataUrl}
										alt={`${file.name} — page ${page.pageIndex + 1}`}
										className="w-full"
										style={{ transform: `rotate(${page.rotation}deg)` }}
									/>
									<span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[11px] font-medium text-white">
										{index + 1}
									</span>
									{splitMode === 'checkbox' && (
										<input
											type="checkbox"
											checked={selectedPageIds.has(page.id)}
											onChange={() => handleTogglePageSelected(page.id)}
											className="absolute left-1 top-1 size-4 cursor-pointer"
											aria-label={messages.selectPageAria.replace('{{number}}', String(index + 1))}
										/>
									)}
								</div>
								<div className="flex items-center justify-between gap-1">
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={`${messages.rotate} ${index + 1}`}
										onClick={() => handleRotatePage(page.id)}
									>
										⟳
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="destructive"
										aria-label={`${messages.deletePage} ${index + 1}`}
										onClick={() => handleDeletePage(page.id)}
									>
										×
									</Button>
								</div>
							</li>
						))}
					</ul>

					<div className="flex flex-col gap-2">
						<span className="text-sm font-medium text-foreground">{messages.modeLabel}</span>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => { setResults([]); setSplitMode('ranges'); }}
								aria-pressed={splitMode === 'ranges'}
								className={`rounded-md border px-2.5 py-1 text-xs font-medium ${splitMode === 'ranges' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
							>
								{messages.modeRanges}
							</button>
							<button
								type="button"
								onClick={() => { setResults([]); setSplitMode('everyN'); }}
								aria-pressed={splitMode === 'everyN'}
								className={`rounded-md border px-2.5 py-1 text-xs font-medium ${splitMode === 'everyN' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
							>
								{messages.modeEveryN}
							</button>
							<button
								type="button"
								onClick={() => { setResults([]); setSplitMode('checkbox'); }}
								aria-pressed={splitMode === 'checkbox'}
								className={`rounded-md border px-2.5 py-1 text-xs font-medium ${splitMode === 'checkbox' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
							>
								{messages.modeCheckbox}
							</button>
						</div>

						{splitMode === 'ranges' && (
							<div className="flex flex-col gap-1">
								<label htmlFor="pdf-splitter-ranges" className="text-sm font-medium text-foreground">
									{messages.rangesLabel}
								</label>
								<input
									id="pdf-splitter-ranges"
									type="text"
									value={rangesInput}
									onChange={(event) => {
										setResults([]);
										setRangesInput(event.target.value);
									}}
									placeholder={messages.rangesPlaceholder}
									className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
								/>
								<p className="text-xs text-muted-foreground">{messages.rangesHint}</p>
							</div>
						)}
						{splitMode === 'everyN' && (
							<div className="flex items-center gap-2">
								<label htmlFor="pdf-splitter-every-n" className="text-sm font-medium text-foreground">
									{messages.everyNLabel}
								</label>
								<input
									id="pdf-splitter-every-n"
									type="number"
									min={1}
									max={pages.length}
									value={everyN}
									onChange={(event) => {
										setResults([]);
										setEveryN(Number(event.target.value));
									}}
									className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
								/>
							</div>
						)}
						{splitMode === 'checkbox' && (
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm text-foreground">
									{messages.selectedCount
										.replace('{{count}}', String(selectedPageIds.size))
										.replace('{{total}}', String(pages.length))}
								</span>
								<Button type="button" size="sm" variant="outline" onClick={handleSelectAllPages}>
									{messages.selectAll}
								</Button>
								<Button type="button" size="sm" variant="outline" onClick={handleClearSelection}>
									{messages.clearSelection}
								</Button>
							</div>
						)}
					</div>
				</div>
			)}

			{error && <p role="alert" className="text-sm text-destructive">{error}</p>}

			{isProcessing && splitProgress && splitProgress.total > 1 && (
				<div role="status" className="flex flex-col gap-1.5">
					<p className="text-xs text-muted-foreground">
						{messages.processingQueue
							.replace('{{current}}', String(splitProgress.current))
							.replace('{{total}}', String(splitProgress.total))}
					</p>
					<Progress value={Math.round((splitProgress.current / splitProgress.total) * 100)} />
				</div>
			)}

			<div>
				<Button type="button" onClick={handleSplit} disabled={!canSplit}>
					{isProcessing ? messages.splitting : messages.split}
				</Button>
			</div>

			{results.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="text-sm font-semibold text-foreground">{messages.resultsHeading}</h3>
						{results.length > 1 && (
							<Button type="button" size="sm" variant="outline" onClick={handleDownloadAll} disabled={isZipping}>
								{messages.downloadAll}
							</Button>
						)}
					</div>
					<ul id="split-results" className="flex flex-col gap-2">
						{results.map((result) => (
							<li key={result.id} className="flex flex-col gap-2 rounded-md border border-border p-2 text-sm">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="truncate text-foreground">{result.label}</span>
									<Button
										type="button"
										size="sm"
										variant="secondary"
										onClick={() => handleDownload(result)}
									>
										{messages.download}
									</Button>
								</div>
								<div className="flex flex-wrap gap-1">
									{result.previewThumbnails.map((dataUrl, i) => (
										<img
											key={i}
											src={dataUrl}
											alt={`${result.label} — ${i + 1}`}
											className="h-12 w-auto rounded border border-border object-cover"
										/>
									))}
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
