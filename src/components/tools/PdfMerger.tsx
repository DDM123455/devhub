import { useCallback, useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { renderPdfThumbnails, type PdfPageThumbnail } from '@/lib/pdf-thumbnails';
import { Button } from '@/components/ui/button';

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
}

interface PageItem {
	id: string;
	fileId: string;
	file: File;
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

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const allFiles = Array.from(fileList);
		const newFiles = allFiles.filter(
			(file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
		);
		setSkippedCount(allFiles.length - newFiles.length);
		if (newFiles.length === 0) return;
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
					const bytes = await file.arrayBuffer();
					const thumbnails = await renderPdfThumbnails(bytes);
					setPages((prev) => [
						...prev,
						...thumbnails.map(
							(thumb): PageItem => ({
								id: `${fileId}-${thumb.pageIndex}`,
								fileId,
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
					const isPasswordProtected = err instanceof Error && err.name === 'PasswordException';
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
	}, []);

	const handleRemovePage = useCallback((id: string) => {
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => prev.filter((page) => page.id !== id));
	}, []);

	const handleRotatePage = useCallback((id: string) => {
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) =>
			prev.map((page) =>
				page.id === id ? { ...page, rotation: ((page.rotation + 90) % 360) as PageItem['rotation'] } : page,
			),
		);
	}, []);

	const handleMove = useCallback((id: string, direction: -1 | 1) => {
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => {
			const index = prev.findIndex((page) => page.id === id);
			const targetIndex = index + direction;
			if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
			const next = [...prev];
			[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
			return next;
		});
	}, []);

	const handleDrop = useCallback((targetId: string) => {
		setMergedBlob(null);
		setPreviewThumbnails(null);
		setPages((prev) => {
			if (!dragPageId || dragPageId === targetId) return prev;
			const fromIndex = prev.findIndex((page) => page.id === dragPageId);
			const toIndex = prev.findIndex((page) => page.id === targetId);
			if (fromIndex === -1 || toIndex === -1) return prev;
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			return next;
		});
		setDragPageId(null);
	}, [dragPageId]);

	const handleMerge = useCallback(async () => {
		setIsProcessing(true);
		setMergeError(null);
		setMergedBlob(null);
		setPreviewThumbnails(null);

		try {
			const mergedDoc = await PDFDocument.create();
			const sourceDocCache = new Map<string, PDFDocument>();

			for (const pageItem of pages) {
				let sourceDoc = sourceDocCache.get(pageItem.fileId);
				if (!sourceDoc) {
					const bytes = await pageItem.file.arrayBuffer();
					sourceDoc = await PDFDocument.load(bytes);
					sourceDocCache.set(pageItem.fileId, sourceDoc);
				}
				const [copiedPage] = await mergedDoc.copyPages(sourceDoc, [pageItem.pageIndex]);
				if (pageItem.rotation !== 0) {
					copiedPage.setRotation(degrees(pageItem.rotation));
				}
				mergedDoc.addPage(copiedPage);
			}

			const mergedBytes = await mergedDoc.save();
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
				setPreviewThumbnails(thumbnails);
			} catch {
				setPreviewThumbnails(null);
			} finally {
				setIsGeneratingPreview(false);
			}
		} catch {
			setMergeError(messages.errorGeneric);
		}
		setIsProcessing(false);
	}, [pages, messages.errorGeneric]);

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
	const canMerge = !isProcessing && !isLoadingAny && pages.length >= 2;
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
				<label
					htmlFor="pdf-merger-input"
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{messages.selectFiles}
				</label>
				<input
					id="pdf-merger-input"
					type="file"
					accept="application/pdf"
					multiple
					className="hidden"
					onChange={(event) => handleFiles(event.target.files)}
				/>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			{skippedCount > 0 && (
				<p role="status" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{messages.skippedFiles.replace('{{count}}', String(skippedCount))}
				</p>
			)}

			{files.some((f) => f.status === 'loading') && (
				<p role="status" className="text-sm text-muted-foreground">{messages.loadingThumbnails}</p>
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
									handleDrop(page.id);
								}}
								className={`flex w-28 cursor-grab flex-col gap-1 rounded-md border border-border bg-card p-1.5 ${
									dragPageId === page.id ? 'opacity-50' : ''
								}`}
							>
								<div className="relative overflow-hidden rounded bg-muted">
									<img
										src={page.dataUrl}
										alt={`${page.file.name} — page ${page.pageIndex + 1}`}
										className="w-full"
										style={{ transform: `rotate(${page.rotation}deg)` }}
									/>
									<span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
										{index + 1}
									</span>
								</div>
								<div className="flex items-center justify-between gap-0.5">
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={messages.moveUp}
										disabled={index === 0}
										onClick={() => handleMove(page.id, -1)}
									>
										←
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={messages.rotate}
										onClick={() => handleRotatePage(page.id)}
									>
										⟳
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="outline"
										aria-label={messages.moveDown}
										disabled={index === pages.length - 1}
										onClick={() => handleMove(page.id, 1)}
									>
										→
									</Button>
									<Button
										type="button"
										size="icon-xs"
										variant="destructive"
										aria-label={messages.remove}
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

			<div className="flex items-center gap-3">
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
