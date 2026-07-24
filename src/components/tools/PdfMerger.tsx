import { useCallback, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
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
	noFiles: string;
	errorGeneric: string;
}

interface PdfItem {
	id: string;
	file: File;
	status: 'pending' | 'error';
	errorMessage?: string;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Note: unlike the AI background remover, merging PDFs with pdf-lib is a fast,
// synchronous byte-manipulation task (copying page objects, no ML inference or
// pixel decoding), so a handful of typical PDF files merge in well under a second.
// A dedicated Web Worker isn't needed here for the same reason it wasn't needed
// for the image format converter — the main thread stays responsive regardless.
export default function PdfMerger({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<PdfItem[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
	const [mergeError, setMergeError] = useState<string | null>(null);

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const newItems: PdfItem[] = Array.from(fileList)
			.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
			.map((file) => ({
				id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
				file,
				status: 'pending' as const,
			}));
		setMergedBlob(null);
		setMergeError(null);
		setItems((prev) => [...prev, ...newItems]);
	}, []);

	const handleRemove = useCallback((id: string) => {
		setMergedBlob(null);
		setItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const handleMove = useCallback((id: string, direction: -1 | 1) => {
		setMergedBlob(null);
		setItems((prev) => {
			const index = prev.findIndex((item) => item.id === id);
			const targetIndex = index + direction;
			if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
			const next = [...prev];
			[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
			return next;
		});
	}, []);

	const handleMerge = useCallback(async () => {
		setIsProcessing(true);
		setMergeError(null);
		setMergedBlob(null);
		setItems((prev) => prev.map((item) => ({ ...item, status: 'pending', errorMessage: undefined })));

		try {
			const mergedDoc = await PDFDocument.create();
			let failedFile: string | null = null;

			for (const item of items) {
				try {
					const bytes = await item.file.arrayBuffer();
					const sourceDoc = await PDFDocument.load(bytes);
					const copiedPages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
					copiedPages.forEach((page) => mergedDoc.addPage(page));
				} catch {
					failedFile = item.file.name;
					setItems((prev) =>
						prev.map((it) =>
							it.id === item.id
								? { ...it, status: 'error', errorMessage: messages.errorGeneric }
								: it,
						),
					);
					break;
				}
			}

			if (failedFile) {
				setMergeError(`${messages.errorGeneric} (${failedFile})`);
				setIsProcessing(false);
				return;
			}

			const mergedBytes = await mergedDoc.save();
			const blob = new Blob([mergedBytes], { type: 'application/pdf' });
			setMergedBlob(blob);
		} catch {
			setMergeError(messages.errorGeneric);
		}
		setIsProcessing(false);
	}, [items, messages.errorGeneric]);

	const handleDownload = useCallback(() => {
		if (!mergedBlob) return;
		const url = URL.createObjectURL(mergedBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'merged.pdf';
		link.click();
		URL.revokeObjectURL(url);
	}, [mergedBlob]);

	const canMerge = !isProcessing && items.length >= 2;

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

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-2">
					{items.map((item, index) => (
						<li
							key={item.id}
							className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
						>
							<span className="truncate text-foreground">
								{index + 1}. {item.file.name}
							</span>
							<span className="flex items-center gap-2">
								<span className="text-muted-foreground">{formatBytes(item.file.size)}</span>
								{item.status === 'error' && (
									<span className="text-destructive">{item.errorMessage ?? messages.errorGeneric}</span>
								)}
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									aria-label={messages.moveUp}
									disabled={index === 0}
									onClick={() => handleMove(item.id, -1)}
								>
									↑
								</Button>
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									aria-label={messages.moveDown}
									disabled={index === items.length - 1}
									onClick={() => handleMove(item.id, 1)}
								>
									↓
								</Button>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									onClick={() => handleRemove(item.id)}
								>
									{messages.remove}
								</Button>
							</span>
						</li>
					))}
				</ul>
			)}

			{mergeError && <p className="text-sm text-destructive">{mergeError}</p>}

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
