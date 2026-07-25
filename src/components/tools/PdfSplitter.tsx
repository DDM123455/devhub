import { useCallback, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button } from '@/components/ui/button';

interface Messages {
	selectFile: string;
	dropHint: string;
	noFile: string;
	changeFile: string;
	pageCount: string;
	rangesLabel: string;
	rangesPlaceholder: string;
	rangesHint: string;
	split: string;
	splitting: string;
	resultsHeading: string;
	download: string;
	errorGeneric: string;
	errorInvalidRange: string;
}

interface ResultFile {
	id: string;
	label: string;
	blob: Blob;
}

interface PageRange {
	start: number;
	end: number;
}

class RangeParseError extends Error {
	constructor(public token: string) {
		super(`Invalid page range: ${token}`);
	}
}

function parseRanges(input: string, pageCount: number): PageRange[] {
	const trimmed = input.trim();
	if (trimmed === '') {
		return Array.from({ length: pageCount }, (_, index) => ({ start: index + 1, end: index + 1 }));
	}

	return trimmed.split(',').map((token) => {
		const part = token.trim();
		const singleMatch = /^(\d+)$/.exec(part);
		const rangeMatch = /^(\d+)-(\d+)$/.exec(part);

		let start: number;
		let end: number;
		if (singleMatch) {
			start = end = Number(singleMatch[1]);
		} else if (rangeMatch) {
			start = Number(rangeMatch[1]);
			end = Number(rangeMatch[2]);
		} else {
			throw new RangeParseError(part);
		}

		if (start < 1 || end < start || end > pageCount) {
			throw new RangeParseError(part);
		}
		return { start, end };
	});
}

// Splitting with pdf-lib is byte-level page copying, no ML inference or pixel
// decoding involved, so it stays fast on the main thread — same reasoning as
// the Merge PDF tool for not needing a dedicated Web Worker.
export default function PdfSplitter({ messages }: { messages: Messages }) {
	const [file, setFile] = useState<File | null>(null);
	const [pageCount, setPageCount] = useState<number | null>(null);
	const [rangesInput, setRangesInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [results, setResults] = useState<ResultFile[]>([]);
	const [error, setError] = useState<string | null>(null);

	const loadFile = useCallback(async (candidate: File) => {
		setError(null);
		setResults([]);
		setFile(null);
		setPageCount(null);
		try {
			const bytes = await candidate.arrayBuffer();
			const doc = await PDFDocument.load(bytes);
			setFile(candidate);
			setPageCount(doc.getPageCount());
		} catch {
			setError(messages.errorGeneric);
		}
	}, [messages.errorGeneric]);

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) return;
		const candidate = Array.from(fileList).find(
			(item) => item.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf'),
		);
		if (candidate) void loadFile(candidate);
	}, [loadFile]);

	const handleSplit = useCallback(async () => {
		if (!file || !pageCount) return;
		setIsProcessing(true);
		setError(null);
		setResults([]);

		try {
			const ranges = parseRanges(rangesInput, pageCount);
			const bytes = await file.arrayBuffer();
			const sourceDoc = await PDFDocument.load(bytes);

			const newResults: ResultFile[] = [];
			for (const range of ranges) {
				const outDoc = await PDFDocument.create();
				const indices = Array.from(
					{ length: range.end - range.start + 1 },
					(_, i) => range.start - 1 + i,
				);
				const copiedPages = await outDoc.copyPages(sourceDoc, indices);
				copiedPages.forEach((page) => outDoc.addPage(page));
				const outBytes = await outDoc.save();
				const label = range.start === range.end
					? `page-${range.start}.pdf`
					: `pages-${range.start}-${range.end}.pdf`;
				newResults.push({
					id: `${label}-${Math.random().toString(36).slice(2)}`,
					label,
					blob: new Blob([outBytes], { type: 'application/pdf' }),
				});
			}
			setResults(newResults);
		} catch (err) {
			if (err instanceof RangeParseError) {
				setError(
					messages.errorInvalidRange
						.replace('{{range}}', err.token)
						.replace('{{max}}', String(pageCount)),
				);
			} else {
				setError(messages.errorGeneric);
			}
		}
		setIsProcessing(false);
	}, [file, pageCount, rangesInput, messages.errorInvalidRange, messages.errorGeneric]);

	const handleDownload = useCallback((result: ResultFile) => {
		const url = URL.createObjectURL(result.blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = result.label;
		link.click();
		URL.revokeObjectURL(url);
	}, []);

	const canSplit = !isProcessing && file !== null && pageCount !== null;

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
					htmlFor="pdf-splitter-input"
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{file ? messages.changeFile : messages.selectFile}
				</label>
				<input
					id="pdf-splitter-input"
					type="file"
					accept="application/pdf"
					className="hidden"
					onChange={(event) => handleFiles(event.target.files)}
				/>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			{!file || pageCount === null ? (
				<p className="text-sm text-muted-foreground">{messages.noFile}</p>
			) : (
				<div className="flex flex-col gap-3">
					<p className="text-sm text-foreground">
						{file.name} — {messages.pageCount.replace('{{count}}', String(pageCount))}
					</p>
					<div className="flex flex-col gap-1">
						<label htmlFor="pdf-splitter-ranges" className="text-sm font-medium text-foreground">
							{messages.rangesLabel}
						</label>
						<input
							id="pdf-splitter-ranges"
							type="text"
							value={rangesInput}
							onChange={(event) => setRangesInput(event.target.value)}
							placeholder={messages.rangesPlaceholder}
							className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
						/>
						<p className="text-xs text-muted-foreground">{messages.rangesHint}</p>
					</div>
				</div>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}

			<div>
				<Button type="button" onClick={handleSplit} disabled={!canSplit}>
					{isProcessing ? messages.splitting : messages.split}
				</Button>
			</div>

			{results.length > 0 && (
				<div className="flex flex-col gap-2">
					<h3 className="text-sm font-semibold text-foreground">{messages.resultsHeading}</h3>
					<ul className="flex flex-col gap-2">
						{results.map((result) => (
							<li
								key={result.id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
							>
								<span className="truncate text-foreground">{result.label}</span>
								<Button
									type="button"
									size="sm"
									variant="secondary"
									onClick={() => handleDownload(result)}
								>
									{messages.download}
								</Button>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
