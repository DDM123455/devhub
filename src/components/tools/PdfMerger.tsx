import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { renderPdfThumbnails, type PdfPageThumbnail } from '@/lib/pdf-thumbnails';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { combineRotation, isPasswordError } from '@/lib/pdf-utils';
import { computePdfPlacement, PAGE_SIZES_PT, type PdfPageMode } from '@/lib/image-pdf';
import {
	computePageNumberPlacement,
	isJpegFile,
	isMergeImageFile,
	isPdfFile,
	isPngFile,
	readJpegOrientation,
	sortPageGroups,
	type MergeFileMeta,
	type MergeSortMode,
} from '@/lib/pdf-merge-utils';

interface Messages {
	selectFiles: string;
	dropHint: string;
	merge: string;
	merging: string;
	download: string;
	moveUp: string;
	moveDown: string;
	remove: string;
	rotate: string;
	undo: string;
	loadingThumbnails: string;
	dragHint: string;
	noFiles: string;
	errorGeneric: string;
	skippedFiles: string;
	largeFileWarning: string;
	passwordProtectedError: string;
	fileErrorHeading: string;
	previewHeading: string;
	generatingPreview: string;
		processingQueue: string;
	sortHeading: string;
	sortNameAsc: string;
	sortNameDesc: string;
	sortDateAsc: string;
	sortDateDesc: string;
	insertBlankAfter: string;
	blankPage: string;
	addPageNumbers: string;
	imagePageSizeLabel: string;
	imagePageFit: string;
}

interface PageItem {
	id: string;
	fileId: string;
		kind: 'pdf' | 'image' | 'blank';
	// null cho trang trắng.
	file: File | null;
	pageIndex: number;
	dataUrl: string;
	rotation: 0 | 90 | 180 | 270;
}

interface FileEntry {
	id: string;
	file: File;
	status: 'loading' | 'done' | 'error';
	errorMessage?: string;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Merging happens entirely in the tab's memory (every source PDF loaded, copied,
// and re-saved) — there's no server-side upload limit to warn about, but a very
// large combined selection can still spike memory enough to crash the tab, which
// is worth flagging before the user waits through a merge that might not finish.
const LARGE_TOTAL_SIZE_WARNING_BYTES = 200 * 1024 * 1024;

function bitmapHasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
	const data = ctx.getImageData(0, 0, w, h).data;
	for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
	return false;
}

// Ảnh thumbnail nhỏ (createImageBitmap áp EXIF orientation mặc định ở trình duyệt hiện đại).
async function renderImageThumbnail(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	try {
		const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2D canvas context unavailable');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const url = canvas.toDataURL('image/jpeg', 0.7);
		canvas.width = 0;
		canvas.height = 0;
		return url;
	} finally {
		bitmap.close();
	}
}

// JPEG gốc không xoay EXIF và PNG được nhúng nguyên bản (không nén lại); các định dạng khác
// (WebP, GIF, BMP, AVIF, JPEG có EXIF orientation) đi qua canvas -> PNG nếu có alpha, JPEG 0.92 nếu không.
async function embedImageFile(doc: PDFDocument, file: File) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	try {
		if (isJpegFile(file) && readJpegOrientation(bytes) === 1) return await doc.embedJpg(bytes);
		if (isPngFile(file)) return await doc.embedPng(bytes);
	} catch {
		/* rơi xuống đường canvas */
	}
	const bitmap = await createImageBitmap(file);
	try {
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2D canvas context unavailable');
		ctx.drawImage(bitmap, 0, 0);
		const alpha = bitmapHasAlpha(ctx, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error('toBlob null'))),
				alpha ? 'image/png' : 'image/jpeg',
				0.92,
			),
		);
		const out = new Uint8Array(await blob.arrayBuffer());
		canvas.width = 0;
		canvas.height = 0;
		return alpha ? await doc.embedPng(out) : await doc.embedJpg(out);
	} finally {
		bitmap.close();
	}
}

export default function PdfMerger({ messages }: { messages: Messages }) {
	const [files, setFiles] = useState<FileEntry[]>([]);
	const [pages, setPages] = useState<PageItem[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [dragPageId, setDragPageId] = useState<string | null>(null);
	const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
	const [mergeError, setMergeError] = useState<string | null>(null);
	const [skippedCount, setSkippedCount] = useState(0);
	const [previewThumbnails, setPreviewThumbnails] = useState<PdfPageThumbnail[] | null>(null);
		const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
	const [addNumbers, setAddNumbers] = useState(false);
	const [imagePageMode, setImagePageMode] = useState<PdfPageMode>('a4');


	// Minimal undo for the multi-step page operations below (rotate/remove/
	// reorder) — a plain array-in-a-ref stack of previous `pages` snapshots,
	// since these are cheap (arrays of ids/metadata, not the underlying PDF
	// bytes) and there's no need for anything fancier than "go back one step".
	// `canUndo` is a separate bit of state purely to make the Undo button's
	// disabled state re-render — the ref itself doesn't trigger React updates.
	//
	// Mỗi snapshot nhớ thêm tập fileId đã có trang tại thời điểm chụp (known): khi Undo, trang của
	// các file được thêm SAU snapshot (đọc xong bất đồng bộ) được giữ lại, không bị Undo làm mất.
	const undoStackRef = useRef<{ pages: PageItem[]; known: Set<string> }[]>([]);
	const knownFileIdsRef = useRef<Set<string>>(new Set());
	const [canUndo, setCanUndo] = useState(false);
	// Tăng mỗi khi danh sách trang đổi; handleMerge chỉ lưu kết quả nếu version không đổi trong lúc xử lý.
	const versionRef = useRef(0);
	const isProcessingRef = useRef(false);

	const pushUndoSnapshot = useCallback((snapshot: PageItem[]) => {
		undoStackRef.current.push({ pages: snapshot, known: new Set(knownFileIdsRef.current) });
		if (undoStackRef.current.length > 50) undoStackRef.current.shift();
		setCanUndo(true);
	}, []);

	const handleUndo = useCallback(() => {
		if (isProcessingRef.current) return;
		const previous = undoStackRef.current.pop();
		if (!previous) return;
		versionRef.current++;
		setCanUndo(undoStackRef.current.length > 0);
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((current) => [...previous.pages, ...current.filter((page) => page.kind !== 'blank' && !previous.known.has(page.fileId))]);
	}, []);

	// Ctrl+Z / Cmd+Z anywhere on the tool undoes the last rotate/remove/reorder —
	// there's no text input on this page whose own native undo could conflict.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
			if (!isUndoShortcut) return;
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
			event.preventDefault();
			handleUndo();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [handleUndo]);

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const allFiles = Array.from(fileList);
		const newFiles = allFiles.filter(
						(file) => isPdfFile(file) || isMergeImageFile(file),
		);
		setSkippedCount(allFiles.length - newFiles.length);
		if (newFiles.length === 0) return;
		versionRef.current++;
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setMergeError(null);

		const entries = newFiles.map((file) => ({
			fileId: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
			file,
		}));
		setFiles((prev) => [...prev, ...entries.map(({ fileId, file }) => ({ id: fileId, file, status: 'loading' as const }))]);

		// Processed sequentially (not one Promise per file fired in parallel) so pages land
		// in the ul in file-selection order — a smaller/faster PDF picked second must not be
		// able to finish rendering before a larger one picked first and jump ahead of it.
		void (async () => {
			for (const { fileId, file } of entries) {
				try {
										const isImage = !isPdfFile(file);
					const thumbnails: { pageIndex: number; dataUrl: string }[] = isImage
						? [{ pageIndex: 0, dataUrl: await renderImageThumbnail(file) }]
						: await renderPdfThumbnails(await file.arrayBuffer());
					versionRef.current++;
					knownFileIdsRef.current.add(fileId);
					setMergedBlob(null);
					setPreviewThumbnails(null);
					setPages((prev) => [
						...prev,
						...thumbnails.map(
							(thumb): PageItem => ({
								id: `${fileId}-${thumb.pageIndex}`,
																fileId,
								kind: isImage ? 'image' : 'pdf',
								file,
								pageIndex: thumb.pageIndex,
								dataUrl: thumb.dataUrl,
								rotation: 0,
							}),
						),
					]);
					setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'done' } : f)));
				} catch (err) {
					// pdfjs-dist throws a `PasswordException` (its `.name`, set in its own
					// BaseException base class) specifically for a PDF that needs a
					// password to open — worth telling apart from a generically
					// corrupt/unsupported file, since the fix ("enter the password
					// somewhere else first") is completely different advice.
					const isPasswordProtected = isPasswordError(err);
					setFiles((prev) =>
						prev.map((f) =>
							f.id === fileId
								? {
										...f,
										status: 'error',
										errorMessage: isPasswordProtected ? messages.passwordProtectedError : messages.errorGeneric,
									}
								: f,
						),
					);
				}
			}
		})();
	}, [messages.passwordProtectedError, messages.errorGeneric]);

	const handleRemovePage = useCallback((id: string) => {
		if (isProcessingRef.current) return;
		versionRef.current++;
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => {
			pushUndoSnapshot(prev);
			return prev.filter((page) => page.id !== id);
		});
	}, [pushUndoSnapshot]);

	const handleRotatePage = useCallback((id: string) => {
		if (isProcessingRef.current) return;
		versionRef.current++;
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => {
			pushUndoSnapshot(prev);
			return prev.map((page) =>
				page.id === id ? { ...page, rotation: ((page.rotation + 90) % 360) as PageItem['rotation'] } : page,
			);
		});
	}, [pushUndoSnapshot]);

	const handleMove = useCallback((id: string, direction: -1 | 1) => {
		if (isProcessingRef.current) return;
		versionRef.current++;
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => {
			const index = prev.findIndex((page) => page.id === id);
			const targetIndex = index + direction;
			if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
			pushUndoSnapshot(prev);
			const next = [...prev];
			[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
			return next;
		});
	}, [pushUndoSnapshot]);

	const handleDrop = useCallback((targetId: string) => {
		if (isProcessingRef.current) return;
		versionRef.current++;
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => {
			if (!dragPageId || dragPageId === targetId) return prev;
			const fromIndex = prev.findIndex((page) => page.id === dragPageId);
			const toIndex = prev.findIndex((page) => page.id === targetId);
			if (fromIndex === -1 || toIndex === -1) return prev;
			pushUndoSnapshot(prev);
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			return next;
		});
		setDragPageId(null);
	}, [dragPageId, pushUndoSnapshot]);

		const fileMeta = new Map(
		files.map((f): [string, MergeFileMeta] => [f.id, { name: f.file.name, lastModified: f.file.lastModified }]),
	);
	const fileMetaRef = useRef(fileMeta);
	fileMetaRef.current = fileMeta;

	const handleSort = useCallback((mode: MergeSortMode) => {
		if (isProcessingRef.current) return;
		versionRef.current++;
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => {
			pushUndoSnapshot(prev);
			return sortPageGroups(prev, fileMetaRef.current, mode);
		});
	}, [pushUndoSnapshot]);

	const handleInsertBlank = useCallback((afterId: string | null) => {
		if (isProcessingRef.current) return;
		versionRef.current++;
		setMergedBlob(null);
		setPreviewThumbnails(null);
		const id = `blank-${Math.random().toString(36).slice(2)}`;
		const blank: PageItem = { id, fileId: id, kind: 'blank', file: null, pageIndex: 0, dataUrl: '', rotation: 0 };
		setPages((prev) => {
			pushUndoSnapshot(prev);
			const index = afterId === null ? prev.length - 1 : prev.findIndex((page) => page.id === afterId);
			const next = [...prev];
			next.splice(index + 1, 0, blank);
			return next;
		});
	}, [pushUndoSnapshot]);

	const handleMerge = useCallback(async () => {
		if (isProcessingRef.current) return;
		isProcessingRef.current = true;
		const version = versionRef.current;
		const snapshotPages = pages;
		setIsProcessing(true);
		setMergeError(null);
		setMergedBlob(null);
		setPreviewThumbnails(null);

		try {
			const mergedDoc = await PDFDocument.create();

			// Gom theo file: mỗi file chỉ load 1 lần và copyPages 1 lần cho tất cả trang cần dùng.
			const indexesByFile = new Map<string, { file: File; indexes: number[] }>();
						for (const pageItem of snapshotPages) {
				if (pageItem.kind !== 'pdf' || !pageItem.file) continue;
				const entry = indexesByFile.get(pageItem.fileId) ?? { file: pageItem.file, indexes: [] };
				entry.indexes.push(pageItem.pageIndex);
				indexesByFile.set(pageItem.fileId, entry);
			}
			const copiedByKey = new Map<string, Awaited<ReturnType<PDFDocument['copyPages']>>[number]>();
			for (const [fileId, { file, indexes }] of indexesByFile) {
				const bytes = await file.arrayBuffer();
				const sourceDoc = await PDFDocument.load(bytes);
				const copied = await mergedDoc.copyPages(sourceDoc, indexes);
				copied.forEach((page, i) => copiedByKey.set(fileId + ':' + indexes[i], page));
			}

						const embeddedImages = new Map<string, Awaited<ReturnType<typeof embedImageFile>>>();
			for (const pageItem of snapshotPages) {
				if (pageItem.kind === 'blank') {
					// Trang trắng lấy khổ của trang đứng trước (hoặc A4 nếu ở đầu).
					const count = mergedDoc.getPageCount();
					const size = count > 0 ? mergedDoc.getPage(count - 1).getSize() : null;
					mergedDoc.addPage(size ? [size.width, size.height] : PAGE_SIZES_PT.a4);
					continue;
				}
				if (pageItem.kind === 'image' && pageItem.file) {
					let image = embeddedImages.get(pageItem.fileId);
					if (!image) {
						image = await embedImageFile(mergedDoc, pageItem.file);
						embeddedImages.set(pageItem.fileId, image);
					}
					const place = computePdfPlacement(image.width, image.height, imagePageMode, 0);
					const imagePage = mergedDoc.addPage([place.pageWidth, place.pageHeight]);
					imagePage.drawImage(image, { x: place.x, y: place.y, width: place.width, height: place.height });
					if (pageItem.rotation !== 0) imagePage.setRotation(degrees(pageItem.rotation));
					continue;
				}
				const copiedPage = copiedByKey.get(pageItem.fileId + ':' + pageItem.pageIndex)!;
				if (pageItem.rotation !== 0) {
					// Cộng với /Rotate gốc của trang thay vì ghi đè.
					copiedPage.setRotation(degrees(combineRotation(copiedPage.getRotation().angle, pageItem.rotation)));
				}
				mergedDoc.addPage(copiedPage);
			}

			if (addNumbers) {
				const font = await mergedDoc.embedFont(StandardFonts.Helvetica);
				const all = mergedDoc.getPages();
				const fontSize = 10;
				all.forEach((page, i) => {
					const text = `${i + 1} / ${all.length}`;
					const { width, height } = page.getSize();
					const place = computePageNumberPlacement(
						width,
						height,
						page.getRotation().angle,
						font.widthOfTextAtSize(text, fontSize),
					);
					page.drawText(text, {
						x: place.x,
						y: place.y,
						size: fontSize,
						font,
						color: rgb(0.25, 0.25, 0.25),
						rotate: degrees(place.rotate),
					});
				});
			}


			const mergedBytes = await mergedDoc.save();
			// Người dùng đã đổi danh sách trang trong lúc đang gộp -> kết quả đã cũ, bỏ.
			if (version !== versionRef.current) return;
			setMergedBlob(new Blob([mergedBytes], { type: 'application/pdf' }));

			setIsGeneratingPreview(true);
			try {
				// Re-rasterize the merged result itself (not just its source pages)
				// so the preview reflects the actual output — reordering, rotation,
				// and page removal all show up exactly as they'll appear once
				// downloaded, instead of trusting that those steps applied correctly.
				const mergedArrayBuffer = mergedBytes.buffer.slice(
					mergedBytes.byteOffset,
					mergedBytes.byteOffset + mergedBytes.byteLength,
				) as ArrayBuffer;
				const thumbnails = await renderPdfThumbnails(mergedArrayBuffer, 0.3);
				if (version === versionRef.current) setPreviewThumbnails(thumbnails);
			} catch {
				setPreviewThumbnails(null);
			} finally {
				setIsGeneratingPreview(false);
			}
		} catch (err) {
			if (version === versionRef.current) {
				setMergeError(isPasswordError(err) ? messages.passwordProtectedError : messages.errorGeneric);
			}
		} finally {
			isProcessingRef.current = false;
			setIsProcessing(false);
		}
	}, [pages, addNumbers, imagePageMode, messages.errorGeneric, messages.passwordProtectedError]);

	const handleDownload = useCallback(() => {
		if (!mergedBlob) return;
		const url = URL.createObjectURL(mergedBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'merged.pdf';
		link.click();
		URL.revokeObjectURL(url);
	}, [mergedBlob]);

	const isLoadingAny = files.some((f) => f.status === 'loading');
	const canMerge =
		!isProcessing && !isLoadingAny && (pages.length >= 2 || (pages.length === 1 && pages[0].kind === 'image'));
	const totalFileSize = files.reduce((sum, f) => sum + f.file.size, 0);

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
				<label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-0">
					{messages.selectFiles}
					<input
						id="pdf-merger-input"
						type="file"
						accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.pdf,.jpg,.jpeg,.png,.webp"
						multiple
						className="sr-only"
						onChange={(event) => {
							handleFiles(event.target.files);
							event.target.value = '';
						}}
					/>
				</label>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			{skippedCount > 0 && (
				<p role="status" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{messages.skippedFiles.replace('{{count}}', String(skippedCount))}
				</p>
			)}

			{files.some((f) => f.status === 'loading') && (
				<div role="status" className="flex flex-col gap-1.5">
					<p className="text-sm text-muted-foreground">
						{files.length > 1
							? messages.processingQueue
									.replace('{{current}}', String(files.filter((f) => f.status !== 'loading').length))
									.replace('{{total}}', String(files.length))
							: messages.loadingThumbnails}
					</p>
					{files.length > 1 && (
						<Progress
							value={Math.round(
								(files.filter((f) => f.status !== 'loading').length / files.length) * 100,
							)}
						/>
					)}
				</div>
			)}

			{files.some((f) => f.status === 'error') && (
				<div role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
					<span className="font-medium">{messages.fileErrorHeading}</span>
					<ul className="flex flex-col gap-0.5">
						{files
							.filter((f) => f.status === 'error')
							.map((f) => (
								<li key={f.id}>
									{f.file.name}: {f.errorMessage ?? messages.errorGeneric}
								</li>
							))}
					</ul>
				</div>
			)}

			{totalFileSize > LARGE_TOTAL_SIZE_WARNING_BYTES && (
				<p
					role="alert"
					className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
				>
					{messages.largeFileWarning.replace('{{size}}', formatBytes(totalFileSize))}
				</p>
			)}

			{pages.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<>
					<div className="flex items-center justify-between gap-2">
						<p className="text-xs text-muted-foreground">{messages.dragHint}</p>
						<Button type="button" size="sm" variant="ghost" onClick={handleUndo} disabled={!canUndo || isProcessing} title={`${messages.undo} (Ctrl+Z)`}>
							{messages.undo}
						</Button>
					</div>
					<div className="flex flex-wrap items-center gap-2" role="group" aria-label={messages.sortHeading}>
							<span className="text-xs text-muted-foreground">{messages.sortHeading}:</span>
							{(
								[
									['name-asc', messages.sortNameAsc],
									['name-desc', messages.sortNameDesc],
									['date-asc', messages.sortDateAsc],
									['date-desc', messages.sortDateDesc],
								] as [MergeSortMode, string][]
							).map(([mode, label]) => (
								<Button
									key={mode}
									type="button"
									size="sm"
									variant="outline"
									className="min-h-9"
									disabled={isProcessing || files.length < 2}
									onClick={() => handleSort(mode)}
								>
									{label}
								</Button>
							))}
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="min-h-9"
								disabled={isProcessing}
								onClick={() => handleInsertBlank(null)}
							>
								+ {messages.blankPage}
							</Button>
						</div>
						<ul className="flex flex-wrap gap-3">
							{pages.map((page, index) => (
							<li
								key={page.id}
								draggable={!isProcessing}
								onDragStart={() => setDragPageId(page.id)}
								onDragOver={(event) => event.preventDefault()}
								onDrop={(event) => {
									event.preventDefault();
									handleDrop(page.id);
								}}
								className={`flex w-28 cursor-grab flex-col gap-1 rounded-md border border-border bg-card p-1.5 ${
									dragPageId === page.id ? 'opacity-50' : ''
								}`}
							>
								<div className="relative overflow-hidden rounded bg-muted">
									{page.kind === 'blank' ? (
											<div
												role="img"
												aria-label={messages.blankPage}
												className="flex aspect-[1/1.414] w-full items-center justify-center bg-white text-[10px] text-neutral-400"
												style={{ transform: `rotate(${page.rotation}deg)` }}
											>
												{messages.blankPage}
											</div>
										) : (
											<img
												src={page.dataUrl}
												alt={`${page.file?.name ?? ''} — page ${page.pageIndex + 1}`}
												className="w-full"
												style={{ transform: `rotate(${page.rotation}deg)` }}
											/>
										)}
									<span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[11px] font-medium text-white">
										{index + 1}
									</span>
								</div>
								<div className="flex flex-wrap items-center justify-between gap-0.5">
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={`${messages.moveUp} ${index + 1}`}
										disabled={index === 0 || isProcessing}
										onClick={() => handleMove(page.id, -1)}
									>
										←
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={`${messages.rotate} ${index + 1}`}
										disabled={isProcessing}
										onClick={() => handleRotatePage(page.id)}
									>
										⟳
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={`${messages.moveDown} ${index + 1}`}
										disabled={index === pages.length - 1 || isProcessing}
										onClick={() => handleMove(page.id, 1)}
									>
										→
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={`${messages.insertBlankAfter} ${index + 1}`}
										title={`${messages.insertBlankAfter} ${index + 1}`}
										disabled={isProcessing}
										onClick={() => handleInsertBlank(page.id)}
									>
										＋
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="destructive"
										aria-label={`${messages.remove} ${index + 1}`}
										disabled={isProcessing}
										onClick={() => handleRemovePage(page.id)}
									>
										×
									</Button>
								</div>
							</li>
						))}
					</ul>
				</>
			)}

			{mergeError && <p role="alert" className="text-sm text-destructive">{mergeError}</p>}

			{isGeneratingPreview && (
				<p role="status" className="text-sm text-muted-foreground">{messages.generatingPreview}</p>
			)}

			{previewThumbnails && previewThumbnails.length > 0 && (
				<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
					<span className="text-sm font-medium text-foreground">{messages.previewHeading}</span>
					<ul className="flex flex-wrap gap-2">
						{previewThumbnails.map((thumb) => (
							<li key={thumb.pageIndex} className="w-20 overflow-hidden rounded border border-border bg-muted">
								<img src={thumb.dataUrl} alt={`${messages.previewHeading} — ${thumb.pageIndex + 1}`} className="w-full" />
							</li>
						))}
					</ul>
				</div>
			)}

			{pages.length > 0 && (
				<div className="flex flex-wrap items-center gap-4">
					<label className="flex min-h-9 items-center gap-1.5 text-sm text-foreground">
						<input
							type="checkbox"
							checked={addNumbers}
							disabled={isProcessing}
							onChange={(event) => {
								versionRef.current++;
								setMergedBlob(null);
								setPreviewThumbnails(null);
								setAddNumbers(event.target.checked);
							}}
						/>
						{messages.addPageNumbers}
					</label>
					{pages.some((page) => page.kind === 'image') && (
						<div className="flex items-center gap-2">
							<label htmlFor="pdf-merger-image-size" className="text-sm text-foreground">
								{messages.imagePageSizeLabel}
							</label>
							<select
								id="pdf-merger-image-size"
								value={imagePageMode}
								disabled={isProcessing}
								onChange={(event) => {
									versionRef.current++;
									setMergedBlob(null);
									setPreviewThumbnails(null);
									setImagePageMode(event.target.value as PdfPageMode);
								}}
								className="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
							>
								<option value="a4">A4</option>
								<option value="letter">Letter</option>
								<option value="fit">{messages.imagePageFit}</option>
							</select>
						</div>
					)}
				</div>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button type="button" onClick={handleMerge} disabled={!canMerge}>
					{isProcessing ? messages.merging : messages.merge}
				</Button>
				{mergedBlob && (
					<Button type="button" variant="secondary" onClick={handleDownload}>
						{messages.download}
					</Button>
				)}
			</div>
		</div>
	);
}
