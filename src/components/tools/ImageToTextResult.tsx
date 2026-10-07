import { useMemo } from 'react';
import { Check, Copy, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	confidenceLevel,
	countLowConfidenceWords,
	countOcrStats,
	LOW_WORD_CONFIDENCE,
	type OcrLineInfo,
} from '@/lib/ocr-text';

export interface OcrResultItem {
	id: string;
	sourceId: string;
	sourceName: string;
	pageNumber: number | null;
	label: string;
	status: 'done' | 'empty' | 'error';
	rawText: string;
	text: string;
	confidence: number | null;
	lines: OcrLineInfo[];
	previewUrl: string | null;
	/** Kích thước canvas đã gửi OCR — toạ độ từ khớp với kích thước này. */
	canvasWidth: number;
	canvasHeight: number;
	errorText: string | null;
}

export interface ResultMessages {
	original: string;
	originalAlt: string;
	textLabel: string;
	confidenceLabel: string;
	confidenceHigh: string;
	confidenceMedium: string;
	confidenceLow: string;
	confidenceUnknown: string;
	lowConfidenceWarning: string;
	statsLine: string;
	copy: string;
	copied: string;
	downloadTxt: string;
	removeResult: string;
	joinLines: string;
	collapseBlank: string;
	restoreOcr: string;
	highlightLegend: string;
	reviewTitle: string;
	reviewNote: string;
	noTextFound: string;
	noTextTips: string;
}

interface Props {
	item: OcrResultItem;
	messages: ResultMessages;
	showLowConfidence: boolean;
	copied: boolean;
	onChangeText: (id: string, text: string) => void;
	onCopy: (item: OcrResultItem) => void;
	onDownload: (item: OcrResultItem) => void;
	onRemove: (id: string) => void;
	onJoinLines: (id: string) => void;
	onCollapseBlank: (id: string) => void;
	onRestore: (id: string) => void;
}

const BTN = 'sm:h-9';

const LEVEL_CLASS = {
	high: 'text-emerald-700 dark:text-emerald-300',
	medium: 'text-amber-700 dark:text-amber-300',
	low: 'text-destructive',
} as const;

export default function ImageToTextResult({
	item,
	messages,
	showLowConfidence,
	copied,
	onChangeText,
	onCopy,
	onDownload,
	onRemove,
	onJoinLines,
	onCollapseBlank,
	onRestore,
}: Props) {
	const stats = useMemo(() => countOcrStats(item.text), [item.text]);
	const lowCount = useMemo(() => countLowConfidenceWords(item.lines), [item.lines]);
	const level = item.confidence === null ? null : confidenceLevel(item.confidence);
	const hasText = item.status === 'done';
	const reviewing = showLowConfidence && hasText && item.lines.length > 0;
	const titleId = `ocr-result-${item.id}`;
	const lowWords = useMemo(
		() => item.lines.flatMap((line) => line.words.filter((word) => word.confidence < LOW_WORD_CONFIDENCE)),
		[item.lines],
	);

	return (
		<article aria-labelledby={titleId} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:p-4">
			<header className="flex flex-wrap items-center justify-between gap-2">
				<div className="min-w-0">
					<h3 id={titleId} className="truncate text-sm font-semibold text-foreground" title={item.label}>
						{item.label}
					</h3>
					{item.status !== 'error' && (
						<p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
							<span>
								{messages.statsLine.replace('{{words}}', stats.words.toLocaleString()).replace('{{chars}}', stats.characters.toLocaleString())}
							</span>
							{item.confidence !== null && level && (
								<span>
									{messages.confidenceLabel}:{' '}
									<strong className={LEVEL_CLASS[level]}>
										{item.confidence}%{' '}
										{level === 'high' ? messages.confidenceHigh : level === 'medium' ? messages.confidenceMedium : messages.confidenceLow}
									</strong>
								</span>
							)}
							{item.confidence === null && hasText && <span>{messages.confidenceUnknown}</span>}
						</p>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{hasText && (
						<>
							<Button type="button" variant="outline" className={BTN} onClick={() => onCopy(item)}>
								{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
								<span aria-live="polite">{copied ? messages.copied : messages.copy}</span>
							</Button>
							<Button type="button" variant="outline" className={BTN} onClick={() => onDownload(item)}>
								<Download aria-hidden="true" />
								{messages.downloadTxt}
							</Button>
						</>
					)}
					<Button
						type="button"
						variant="ghost"
						className={`${BTN} text-muted-foreground`}
						onClick={() => onRemove(item.id)}
						aria-label={messages.removeResult.replace('{{name}}', item.label)}
					>
						<Trash2 aria-hidden="true" />
					</Button>
				</div>
			</header>

			{item.status === 'error' && (
				<p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{item.errorText}
				</p>
			)}

			{item.status !== 'error' && (
				<div className="grid gap-3 lg:grid-cols-2">
					{item.previewUrl && (
						<figure className="min-w-0">
							<figcaption className="mb-1 text-xs font-medium text-muted-foreground">{messages.original}</figcaption>
							<div
								className="relative w-full overflow-hidden rounded-md border border-border bg-muted/30"
								style={{ aspectRatio: `${item.canvasWidth} / ${item.canvasHeight}`, maxHeight: '32rem' }}
							>
								<img
									src={item.previewUrl}
									alt={messages.originalAlt.replace('{{name}}', item.label)}
									className="absolute inset-0 h-full w-full object-contain"
								/>
								{reviewing &&
									lowWords.map((word, index) => (
										<span
											key={index}
											aria-hidden="true"
											className="pointer-events-none absolute border-2 border-amber-500 bg-amber-400/25"
											style={{
												left: `${(word.bbox.x0 / item.canvasWidth) * 100}%`,
												top: `${(word.bbox.y0 / item.canvasHeight) * 100}%`,
												width: `${((word.bbox.x1 - word.bbox.x0) / item.canvasWidth) * 100}%`,
												height: `${((word.bbox.y1 - word.bbox.y0) / item.canvasHeight) * 100}%`,
											}}
										/>
									))}
							</div>
						</figure>
					)}

					<div className="flex min-w-0 flex-col gap-2">
						{item.status === 'empty' ? (
							<div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
								<p className="font-medium">{messages.noTextFound}</p>
								<p className="mt-1">{messages.noTextTips}</p>
							</div>
						) : reviewing ? (
							<>
								<p className="text-xs font-medium text-muted-foreground">{messages.reviewTitle}</p>
								<div
									dir="auto"
									className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 text-sm whitespace-pre-wrap text-foreground"
								>
									{item.lines.map((line, lineIndex) => (
										<span key={lineIndex} className="block">
											{line.paragraphStart && lineIndex > 0 && <span className="block h-3" aria-hidden="true" />}
											{line.words.map((word, wordIndex) => (
												<span key={wordIndex}>
													{word.confidence < LOW_WORD_CONFIDENCE ? (
														<mark
															title={`${Math.round(word.confidence)}%`}
															className="rounded bg-amber-300/70 px-0.5 text-foreground dark:bg-amber-400/40"
														>
															{word.text}
														</mark>
													) : (
														word.text
													)}
													{wordIndex < line.words.length - 1 ? ' ' : ''}
												</span>
											))}
										</span>
									))}
								</div>
								<p className="text-xs text-muted-foreground">{messages.highlightLegend.replace('{{count}}', String(lowCount))}</p>
								{item.text !== item.rawText && <p className="text-xs text-muted-foreground">{messages.reviewNote}</p>}
							</>
						) : (
							<>
								<label htmlFor={`${titleId}-text`} className="text-xs font-medium text-muted-foreground">
									{messages.textLabel}
								</label>
								<textarea
									id={`${titleId}-text`}
									dir="auto"
									value={item.text}
									onChange={(event) => onChangeText(item.id, event.target.value)}
									rows={12}
									spellCheck={false}
									className="min-h-48 w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
								/>
							</>
						)}

						{hasText && item.confidence !== null && item.confidence < 65 && (
							<p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
								{messages.lowConfidenceWarning}
							</p>
						)}

						{hasText && !reviewing && (
							<div className="flex flex-wrap gap-2">
								<Button type="button" variant="secondary" className={BTN} onClick={() => onJoinLines(item.id)}>
									{messages.joinLines}
								</Button>
								<Button type="button" variant="secondary" className={BTN} onClick={() => onCollapseBlank(item.id)}>
									{messages.collapseBlank}
								</Button>
								{item.text !== item.rawText && (
									<Button type="button" variant="ghost" className={BTN} onClick={() => onRestore(item.id)}>
										{messages.restoreOcr}
									</Button>
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</article>
	);
}
