import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject, type UIEvent } from 'react';
import {
	buildLineDiff,
	countLineStats,
	getHunkStartRows,
	renderMergedColumn,
	type DiffGranularity,
	type DiffLineEntry,
	type HunkOverride,
} from '@/lib/text-diff';
import { Button } from '@/components/ui/button';

interface Messages {
	originalLabel: string;
	changedLabel: string;
	modeWord: string;
	modeLine: string;
	modeChar: string;
	noChanges: string;
	placeholder: string;
	ignoreWhitespace: string;
	ignoreCase: string;
	statsAdded: string;
	statsRemoved: string;
	statsModified: string;
	clear: string;
	swap: string;
	uploadFile: string;
	prevChange: string;
	nextChange: string;
	changeCounter: string;
	fullscreen: string;
	exitFullscreen: string;
	mergeToolHeading: string;
	mergeLeftHeading: string;
	mergeRightHeading: string;
	acceptRightAria: string;
	acceptLeftAria: string;
	copy: string;
	copied: string;
	save: string;
}

const DEBOUNCE_MS = 150;

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

function useFullscreen(ref: RefObject<HTMLElement | null>) {
	const [isFullscreen, setIsFullscreen] = useState(false);
	useEffect(() => {
		const handler = () => setIsFullscreen(document.fullscreenElement === ref.current);
		document.addEventListener('fullscreenchange', handler);
		return () => document.removeEventListener('fullscreenchange', handler);
	}, [ref]);
	const toggle = () => {
		if (document.fullscreenElement === ref.current) {
			void document.exitFullscreen();
		} else {
			void ref.current?.requestFullscreen();
		}
	};
	return [isFullscreen, toggle] as const;
}

function useSyncedScroll() {
	const isSyncingRef = useRef(false);
	return (target: RefObject<HTMLElement | null>) => (event: UIEvent<HTMLElement>) => {
		if (isSyncingRef.current) {
			isSyncingRef.current = false;
			return;
		}
		if (!target.current) return;
		isSyncingRef.current = true;
		target.current.scrollTop = event.currentTarget.scrollTop;
	};
}

function lineNumbersFor(text: string): number[] {
	const count = text === '' ? 1 : text.split('\n').length;
	return Array.from({ length: count }, (_, i) => i + 1);
}

interface LineNumberedTextareaProps {
	id: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	onScrollSync: (event: UIEvent<HTMLTextAreaElement>) => void;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	gutterRef: RefObject<HTMLDivElement | null>;
}

function LineNumberedTextarea({ id, value, onChange, placeholder, onScrollSync, textareaRef, gutterRef }: LineNumberedTextareaProps) {
	const lines = lineNumbersFor(value);
	const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
		if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
		onScrollSync(event);
	};
	return (
		<div className="flex h-64 overflow-hidden rounded-md border border-border bg-background">
			<div
				ref={gutterRef}
				className="select-none overflow-hidden bg-muted px-2 py-3 text-right font-mono text-xs leading-6 text-muted-foreground"
				aria-hidden="true"
			>
				{lines.map((n) => (
					<div key={n}>{n}</div>
				))}
			</div>
			<textarea
				id={id}
				ref={textareaRef}
				value={value}
				onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
				onScroll={handleScroll}
				placeholder={placeholder}
				spellCheck={false}
				className="flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-foreground focus:outline-none"
			/>
		</div>
	);
}

function lineBackgroundClass(type: DiffLineEntry['type']): string {
	if (type === 'added') return 'bg-green-500/15';
	if (type === 'removed') return 'bg-red-500/15';
	if (type === 'modified') return 'bg-orange-500/15';
	return '';
}

function DiffRowContent({
	entry,
	side,
	override,
}: {
	entry: DiffLineEntry;
	side: 'left' | 'right';
	override?: HunkOverride;
}) {
	// In the Merge Tool, an accepted hunk swaps which side's line is actually
	// displayed — otherwise the two preview columns would keep showing the raw
	// diff forever and clicking accept would look like it did nothing.
	const adoptedFromOtherSide = side === 'left' ? override?.leftUsesRight : override?.rightUsesLeft;
	const text = adoptedFromOtherSide
		? side === 'left'
			? entry.rightText
			: entry.leftText
		: side === 'left'
			? entry.leftText
			: entry.rightText;
	const segments = adoptedFromOtherSide ? undefined : side === 'left' ? entry.leftSegments : entry.rightSegments;
	if (text === undefined) {
		return <div className="h-6" />;
	}
	return (
		<div
			className={`h-6 whitespace-pre px-2 font-mono text-sm leading-6 text-foreground ${
				adoptedFromOtherSide ? 'bg-blue-500/15' : lineBackgroundClass(entry.type)
			}`}
		>
			{segments
				? segments.map((seg, index) => {
						const isChangedPart = side === 'left' ? seg.removed : seg.added;
						return (
							<span key={index} className={isChangedPart ? 'bg-orange-400/50 font-semibold' : undefined}>
								{seg.value}
							</span>
						);
					})
				: text === ''
					? ' '
					: text}
		</div>
	);
}

interface DiffColumnProps {
	entries: DiffLineEntry[];
	side: 'left' | 'right';
	scrollRef: RefObject<HTMLDivElement | null>;
	onScroll: (event: UIEvent<HTMLDivElement>) => void;
	activeRowIndex: number | null;
}

function DiffColumn({ entries, side, scrollRef, onScroll, activeRowIndex }: DiffColumnProps) {
	let runningNumber = 0;
	return (
		<div ref={scrollRef} onScroll={onScroll} className="h-96 flex-1 overflow-auto bg-background">
			{entries.map((entry, index) => {
				const hasNumber = (side === 'left' ? entry.leftText : entry.rightText) !== undefined;
				if (hasNumber) runningNumber += 1;
				return (
					<div key={index} id={`diff-row-${side}-${index}`} className={`flex ${index === activeRowIndex ? 'ring-1 ring-primary' : ''}`}>
						<div className="w-10 flex-shrink-0 select-none bg-muted px-2 text-right font-mono text-xs leading-6 text-muted-foreground">
							{hasNumber ? runningNumber : ''}
						</div>
						<div className="min-w-0 flex-1">
							<DiffRowContent entry={entry} side={side} />
						</div>
					</div>
				);
			})}
		</div>
	);
}

export default function TextDiffChecker({ messages }: { messages: Messages }) {
	const [originalText, setOriginalText] = useState('');
	const [changedText, setChangedText] = useState('');
	const [granularity, setGranularity] = useState<DiffGranularity>('word');
	const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
	const [ignoreCase, setIgnoreCase] = useState(false);
	const [activeHunk, setActiveHunk] = useState(0);
	const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null);
	const [hunkOverrides, setHunkOverrides] = useState<Map<number, HunkOverride>>(new Map());

	const debouncedOriginal = useDebouncedValue(originalText, DEBOUNCE_MS);
	const debouncedChanged = useDebouncedValue(changedText, DEBOUNCE_MS);

	const entries = useMemo(
		() => buildLineDiff(debouncedOriginal, debouncedChanged, granularity, { ignoreCase, ignoreWhitespace }),
		[debouncedOriginal, debouncedChanged, granularity, ignoreCase, ignoreWhitespace],
	);
	const stats = useMemo(() => countLineStats(entries), [entries]);
	const hunkStartRows = useMemo(() => getHunkStartRows(entries), [entries]);
	const hasChanges = stats.added > 0 || stats.removed > 0 || stats.modified > 0;

	// Reset per-hunk merge choices whenever the underlying comparison changes — stale
	// overrides indexed by hunk position could otherwise silently apply to the wrong
	// lines once the source text (and therefore hunk boundaries) has changed.
	useEffect(() => {
		setHunkOverrides(new Map());
		setActiveHunk(0);
	}, [entries]);

	const originalInputRef = useRef<HTMLTextAreaElement>(null);
	const changedInputRef = useRef<HTMLTextAreaElement>(null);
	const originalGutterRef = useRef<HTMLDivElement>(null);
	const changedGutterRef = useRef<HTMLDivElement>(null);
	const originalFileInputRef = useRef<HTMLInputElement>(null);
	const changedFileInputRef = useRef<HTMLInputElement>(null);

	const leftColumnRef = useRef<HTMLDivElement>(null);
	const rightColumnRef = useRef<HTMLDivElement>(null);
	const sideBySideContainerRef = useRef<HTMLDivElement>(null);
	const mergeLeftContainerRef = useRef<HTMLDivElement>(null);
	const mergeRightContainerRef = useRef<HTMLDivElement>(null);

	const [isSideBySideFullscreen, toggleSideBySideFullscreen] = useFullscreen(sideBySideContainerRef);
	const [isMergeLeftFullscreen, toggleMergeLeftFullscreen] = useFullscreen(mergeLeftContainerRef);
	const [isMergeRightFullscreen, toggleMergeRightFullscreen] = useFullscreen(mergeRightContainerRef);

	const syncScroll = useSyncedScroll();
	const syncInputScroll = useSyncedScroll();

	const handleUploadFile = (which: 'original' | 'changed') => (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = typeof reader.result === 'string' ? reader.result : '';
			if (which === 'original') setOriginalText(text);
			else setChangedText(text);
		};
		reader.readAsText(file);
	};

	const handleSwap = () => {
		setOriginalText(changedText);
		setChangedText(originalText);
	};

	const jumpToHunk = (hunkPosition: number) => {
		if (hunkStartRows.length === 0) return;
		const clamped = ((hunkPosition % hunkStartRows.length) + hunkStartRows.length) % hunkStartRows.length;
		setActiveHunk(clamped);
		const rowIndex = hunkStartRows[clamped];
		const el = document.getElementById(`diff-row-left-${rowIndex}`);
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	};

	const handleAccept = (hunkIndex: number, direction: 'leftUsesRight' | 'rightUsesLeft') => {
		setHunkOverrides((prev) => {
			const next = new Map(prev);
			const current = next.get(hunkIndex) ?? {};
			next.set(hunkIndex, { ...current, [direction]: !current[direction] });
			return next;
		});
	};

	const mergedLeftText = useMemo(() => renderMergedColumn(entries, hunkOverrides, 'left'), [entries, hunkOverrides]);
	const mergedRightText = useMemo(() => renderMergedColumn(entries, hunkOverrides, 'right'), [entries, hunkOverrides]);

	const handleCopy = (side: 'left' | 'right', text: string) => {
		void navigator.clipboard.writeText(text).then(() => {
			setCopiedSide(side);
			setTimeout(() => setCopiedSide(null), 1500);
		});
	};

	const handleSave = (side: 'left' | 'right', text: string) => {
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = side === 'left' ? 'merged-left.txt' : 'merged-right.txt';
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<label htmlFor="text-diff-original" className="text-sm font-medium text-foreground">
								{messages.originalLabel}
							</label>
							<div className="flex gap-1">
								<Button type="button" size="sm" variant="ghost" onClick={() => setOriginalText('')}>
									{messages.clear}
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={handleSwap}>
									{messages.swap}
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => originalFileInputRef.current?.click()}>
									{messages.uploadFile}
								</Button>
								<input
									ref={originalFileInputRef}
									type="file"
									accept=".txt,text/plain"
									className="hidden"
									onChange={(event) => handleUploadFile('original')(event.target.files)}
								/>
							</div>
						</div>
						<LineNumberedTextarea
							id="text-diff-original"
							value={originalText}
							onChange={setOriginalText}
							placeholder={messages.placeholder}
							textareaRef={originalInputRef}
							gutterRef={originalGutterRef}
							onScrollSync={syncInputScroll(changedInputRef)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<label htmlFor="text-diff-changed" className="text-sm font-medium text-foreground">
								{messages.changedLabel}
							</label>
							<div className="flex gap-1">
								<Button type="button" size="sm" variant="ghost" onClick={() => setChangedText('')}>
									{messages.clear}
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={handleSwap}>
									{messages.swap}
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => changedFileInputRef.current?.click()}>
									{messages.uploadFile}
								</Button>
								<input
									ref={changedFileInputRef}
									type="file"
									accept=".txt,text/plain"
									className="hidden"
									onChange={(event) => handleUploadFile('changed')(event.target.files)}
								/>
							</div>
						</div>
						<LineNumberedTextarea
							id="text-diff-changed"
							value={changedText}
							onChange={setChangedText}
							placeholder={messages.placeholder}
							textareaRef={changedInputRef}
							gutterRef={changedGutterRef}
							onScrollSync={syncInputScroll(originalInputRef)}
						/>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-4">
					<div className="flex items-center gap-1 text-sm text-foreground">
						{(['char', 'word', 'line'] as const).map((g) => (
							<button
								key={g}
								type="button"
								onClick={() => setGranularity(g)}
								className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
									granularity === g ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'
								}`}
							>
								{g === 'char' ? messages.modeChar : g === 'word' ? messages.modeWord : messages.modeLine}
							</button>
						))}
					</div>
					<div className="flex items-center gap-3 text-sm text-foreground">
						<label className="flex cursor-pointer items-center gap-1.5">
							<input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} />
							{messages.ignoreWhitespace}
						</label>
						<label className="flex cursor-pointer items-center gap-1.5">
							<input type="checkbox" checked={ignoreCase} onChange={(event) => setIgnoreCase(event.target.checked)} />
							{messages.ignoreCase}
						</label>
					</div>
				</div>
			</div>

			{hasChanges ? (
				<div
					ref={sideBySideContainerRef}
					className={`flex flex-col gap-3 rounded-lg border border-border p-4 ${isSideBySideFullscreen ? 'bg-background' : ''}`}
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex flex-wrap gap-2 text-xs font-medium">
							<span className="rounded bg-green-500/15 px-2 py-1 text-green-700 dark:text-green-300">
								{messages.statsAdded.replace('{{count}}', String(stats.added))}
							</span>
							<span className="rounded bg-red-500/15 px-2 py-1 text-red-700 dark:text-red-300">
								{messages.statsRemoved.replace('{{count}}', String(stats.removed))}
							</span>
							<span className="rounded bg-orange-500/15 px-2 py-1 text-orange-700 dark:text-orange-300">
								{messages.statsModified.replace('{{count}}', String(stats.modified))}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<Button type="button" size="icon-xs" variant="outline" aria-label={messages.prevChange} onClick={() => jumpToHunk(activeHunk - 1)}>
								↑
							</Button>
							<span className="text-xs text-muted-foreground">
								{messages.changeCounter
									.replace('{{current}}', String(hunkStartRows.length === 0 ? 0 : activeHunk + 1))
									.replace('{{total}}', String(hunkStartRows.length))}
							</span>
							<Button type="button" size="icon-xs" variant="outline" aria-label={messages.nextChange} onClick={() => jumpToHunk(activeHunk + 1)}>
								↓
							</Button>
							<Button type="button" size="sm" variant="outline" onClick={toggleSideBySideFullscreen}>
								{isSideBySideFullscreen ? messages.exitFullscreen : messages.fullscreen}
							</Button>
						</div>
					</div>

					<div className="flex overflow-hidden rounded-md border border-border">
						<DiffColumn
							entries={entries}
							side="left"
							scrollRef={leftColumnRef}
							onScroll={syncScroll(rightColumnRef)}
							activeRowIndex={hunkStartRows[activeHunk] ?? null}
						/>
						<div className="w-px flex-shrink-0 bg-border" />
						<DiffColumn
							entries={entries}
							side="right"
							scrollRef={rightColumnRef}
							onScroll={syncScroll(leftColumnRef)}
							activeRowIndex={hunkStartRows[activeHunk] ?? null}
						/>
					</div>
				</div>
			) : (
				(originalText !== '' || changedText !== '') && <p className="text-sm text-muted-foreground">{messages.noChanges}</p>
			)}

			{hasChanges && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
					<h2 className="text-sm font-semibold text-foreground">{messages.mergeToolHeading}</h2>
					<div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_2.5rem_1fr]">
						<div ref={mergeLeftContainerRef} className={`flex flex-col gap-2 ${isMergeLeftFullscreen ? 'bg-background p-4' : ''}`}>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.mergeLeftHeading}</span>
								<div className="flex gap-1">
									<Button type="button" size="sm" variant="ghost" onClick={() => handleCopy('left', mergedLeftText)}>
										{copiedSide === 'left' ? messages.copied : messages.copy}
									</Button>
									<Button type="button" size="sm" variant="ghost" onClick={() => handleSave('left', mergedLeftText)}>
										{messages.save}
									</Button>
									<Button type="button" size="sm" variant="ghost" onClick={toggleMergeLeftFullscreen}>
										{isMergeLeftFullscreen ? messages.exitFullscreen : messages.fullscreen}
									</Button>
								</div>
							</div>
							<div className="h-72 overflow-auto rounded-md border border-border">
								{entries.map((entry, index) => (
									<DiffRowContent
										key={index}
										entry={entry}
										side="left"
										override={entry.hunkIndex !== null ? hunkOverrides.get(entry.hunkIndex) : undefined}
									/>
								))}
							</div>
						</div>

						<div className="hidden flex-col items-center gap-0 md:flex">
							{entries.map((entry, index) => {
								const isHunkStart = entry.hunkIndex !== null && (index === 0 || entries[index - 1].hunkIndex !== entry.hunkIndex);
								return (
									<div key={index} className="flex h-6 items-center justify-center">
										{isHunkStart && entry.hunkIndex !== null && (
											<div className="flex gap-0.5">
												<button
													type="button"
													aria-label={messages.acceptLeftAria}
													onClick={() => handleAccept(entry.hunkIndex as number, 'rightUsesLeft')}
													className={`rounded border px-1 text-[10px] leading-4 ${
														hunkOverrides.get(entry.hunkIndex)?.rightUsesLeft
															? 'border-primary bg-primary text-primary-foreground'
															: 'border-border text-foreground'
													}`}
												>
													←
												</button>
												<button
													type="button"
													aria-label={messages.acceptRightAria}
													onClick={() => handleAccept(entry.hunkIndex as number, 'leftUsesRight')}
													className={`rounded border px-1 text-[10px] leading-4 ${
														hunkOverrides.get(entry.hunkIndex)?.leftUsesRight
															? 'border-primary bg-primary text-primary-foreground'
															: 'border-border text-foreground'
													}`}
												>
													→
												</button>
											</div>
										)}
									</div>
								);
							})}
						</div>

						<div ref={mergeRightContainerRef} className={`flex flex-col gap-2 ${isMergeRightFullscreen ? 'bg-background p-4' : ''}`}>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.mergeRightHeading}</span>
								<div className="flex gap-1">
									<Button type="button" size="sm" variant="ghost" onClick={() => handleCopy('right', mergedRightText)}>
										{copiedSide === 'right' ? messages.copied : messages.copy}
									</Button>
									<Button type="button" size="sm" variant="ghost" onClick={() => handleSave('right', mergedRightText)}>
										{messages.save}
									</Button>
									<Button type="button" size="sm" variant="ghost" onClick={toggleMergeRightFullscreen}>
										{isMergeRightFullscreen ? messages.exitFullscreen : messages.fullscreen}
									</Button>
								</div>
							</div>
							<div className="h-72 overflow-auto rounded-md border border-border">
								{entries.map((entry, index) => (
									<DiffRowContent
										key={index}
										entry={entry}
										side="right"
										override={entry.hunkIndex !== null ? hunkOverrides.get(entry.hunkIndex) : undefined}
									/>
								))}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
