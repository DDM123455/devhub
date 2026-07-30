import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject, type UIEvent } from 'react';
import {
	countLineStats,
	getHunkStartRows,
	renderMergedColumn,
	type DiffGranularity,
	type DiffLineEntry,
	type HunkOverride,
} from '@/lib/text-diff';
import type { TextDiffRequest, TextDiffResponse } from './textDiffWorker';
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
	ignoreEmptyLines: string;
	normalizeLineEndings: string;
	normalizeUnicode: string;
	computing: string;
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
	copyShareLink: string;
}

const DEBOUNCE_MS = 150;

// Uses the native Compression Streams API (supported in every evergreen
// browser, no library needed) to gzip each text before base64-encoding it
// into the URL — the two documents being compared can be arbitrarily long,
// and gzip usually shrinks plain text by 60-80%, which matters since URLs
// (even the hash portion, never sent to a server) have practical length
// limits in browsers and chat apps that might carry the link.
async function compressToUrlSafeBase64(text: string): Promise<string> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
	const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decompressFromUrlSafeBase64(value: string): Promise<string> {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

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

// Generalizes the old 2-way scroll sync to N panes (used for 2 panes — the
// raw input textareas, the side-by-side diff columns — and 3 panes — the
// Merge Tool's left/accept-buttons/right columns). Setting `suppressRef` true
// for the whole synchronous burst of cross-assignments (rather than relying
// on exactly one nested re-entrant call to reset it, which only happens to
// work for exactly 2 panes) is what makes this safe for 3+ panes: every
// `scroll` event fired by our OWN assignments below re-enters this same
// handler and bails immediately since the guard is still true, and nothing
// resets it until the whole burst for THIS source event has finished.
function useSyncedScrollGroup(refs: Array<RefObject<HTMLElement | null>>) {
	const suppressRef = useRef(false);
	return (sourceIndex: number) => (event: UIEvent<HTMLElement>) => {
		if (suppressRef.current) return;
		suppressRef.current = true;
		const scrollTop = event.currentTarget.scrollTop;
		refs.forEach((ref, i) => {
			if (i !== sourceIndex && ref.current && ref.current.scrollTop !== scrollTop) {
				ref.current.scrollTop = scrollTop;
			}
		});
		suppressRef.current = false;
	};
}

// Fixed-row-height windowing: every row this tool renders (diff lines, merge
// columns, input line-number gutters) is exactly one `leading-6` (24px) line,
// never wraps, so — unlike a general-purpose virtualizer — there's no need to
// measure anything. Only rows within [startIndex, endIndex) actually get a
// DOM node; the rest are represented purely by the spacer's total height, so
// a 100k-line file costs the same number of DOM nodes as a 100-line one.
const ROW_HEIGHT = 24;
const DIFF_VIEWPORT_HEIGHT = 384; // matches the `h-96` column height
const MERGE_VIEWPORT_HEIGHT = 288; // matches the `h-72` merge column height
const INPUT_VIEWPORT_HEIGHT = 256; // matches the `h-64` input textarea height
const OVERSCAN_ROWS = 20;

function computeVisibleRange(scrollTop: number, viewportHeight: number, itemCount: number, overscan: number) {
	const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
	const visibleRows = Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2;
	const endIndex = Math.min(itemCount, startIndex + visibleRows);
	return { startIndex, endIndex };
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
	const [scrollTop, setScrollTop] = useState(0);
	const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
		if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
		setScrollTop(event.currentTarget.scrollTop);
		onScrollSync(event);
	};
	const { startIndex, endIndex } = computeVisibleRange(scrollTop, INPUT_VIEWPORT_HEIGHT, lines.length, OVERSCAN_ROWS);
	return (
		<div className="flex h-64 overflow-hidden rounded-md border border-border bg-background">
			<div
				ref={gutterRef}
				className="select-none overflow-hidden bg-muted px-2 py-3 text-right font-mono text-xs leading-6 text-muted-foreground"
				aria-hidden="true"
			>
				<div style={{ height: lines.length * ROW_HEIGHT, position: 'relative' }}>
					{lines.slice(startIndex, endIndex).map((n, i) => (
						<div key={n} style={{ position: 'absolute', top: (startIndex + i) * ROW_HEIGHT, left: 0, right: 0 }}>
							{n}
						</div>
					))}
				</div>
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
	lineNumbers: Array<number | null>;
	side: 'left' | 'right';
	scrollRef: RefObject<HTMLDivElement | null>;
	onScroll: (event: UIEvent<HTMLDivElement>) => void;
	activeRowIndex: number | null;
}

function DiffColumn({ entries, lineNumbers, side, scrollRef, onScroll, activeRowIndex }: DiffColumnProps) {
	const [scrollTop, setScrollTop] = useState(0);
	const handleScroll = (event: UIEvent<HTMLDivElement>) => {
		setScrollTop(event.currentTarget.scrollTop);
		onScroll(event);
	};
	const { startIndex, endIndex } = computeVisibleRange(scrollTop, DIFF_VIEWPORT_HEIGHT, entries.length, OVERSCAN_ROWS);
	return (
		<div ref={scrollRef} onScroll={handleScroll} className="h-96 flex-1 overflow-auto bg-background">
			<div style={{ height: entries.length * ROW_HEIGHT, position: 'relative' }}>
				{entries.slice(startIndex, endIndex).map((entry, i) => {
					const index = startIndex + i;
					return (
						<div
							key={index}
							id={`diff-row-${side}-${index}`}
							style={{ position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0 }}
							className={`flex ${index === activeRowIndex ? 'ring-1 ring-primary' : ''}`}
						>
							<div className="w-10 flex-shrink-0 select-none bg-muted px-2 text-right font-mono text-xs leading-6 text-muted-foreground">
								{lineNumbers[index] ?? ''}
							</div>
							<div className="min-w-0 flex-1">
								<DiffRowContent entry={entry} side={side} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface MergeColumnProps {
	entries: DiffLineEntry[];
	side: 'left' | 'right';
	hunkOverrides: Map<number, HunkOverride>;
	scrollRef: RefObject<HTMLDivElement | null>;
	scrollTop: number;
	onScroll: (event: UIEvent<HTMLDivElement>) => void;
}

function MergeColumn({ entries, side, hunkOverrides, scrollRef, scrollTop, onScroll }: MergeColumnProps) {
	const { startIndex, endIndex } = computeVisibleRange(scrollTop, MERGE_VIEWPORT_HEIGHT, entries.length, OVERSCAN_ROWS);
	return (
		<div ref={scrollRef} onScroll={onScroll} className="h-72 overflow-auto rounded-md border border-border">
			<div style={{ height: entries.length * ROW_HEIGHT, position: 'relative' }}>
				{entries.slice(startIndex, endIndex).map((entry, i) => {
					const index = startIndex + i;
					return (
						<div key={index} style={{ position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0 }}>
							<DiffRowContent
								entry={entry}
								side={side}
								override={entry.hunkIndex !== null ? hunkOverrides.get(entry.hunkIndex) : undefined}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface MergeAcceptColumnProps {
	entries: DiffLineEntry[];
	hunkOverrides: Map<number, HunkOverride>;
	onAccept: (hunkIndex: number, direction: 'leftUsesRight' | 'rightUsesLeft') => void;
	acceptLeftAria: string;
	acceptRightAria: string;
	scrollRef: RefObject<HTMLDivElement | null>;
	scrollTop: number;
	onScroll: (event: UIEvent<HTMLDivElement>) => void;
}

// Previously this column had no height limit or overflow handling at all —
// it rendered all N accept-buttons rows at full natural height, so for a
// very large diff it stretched far past the other two (scrollable) columns
// and was never actually kept in sync with them. Giving it the same
// `h-72 overflow-auto` + scroll-sync + virtualization treatment as its
// siblings fixes that pre-existing gap, not just the 100k-line case.
function MergeAcceptColumn({
	entries,
	hunkOverrides,
	onAccept,
	acceptLeftAria,
	acceptRightAria,
	scrollRef,
	scrollTop,
	onScroll,
}: MergeAcceptColumnProps) {
	const { startIndex, endIndex } = computeVisibleRange(scrollTop, MERGE_VIEWPORT_HEIGHT, entries.length, OVERSCAN_ROWS);
	return (
		<div ref={scrollRef} onScroll={onScroll} className="hidden h-72 overflow-auto md:block">
			<div style={{ height: entries.length * ROW_HEIGHT, position: 'relative' }}>
				{entries.slice(startIndex, endIndex).map((entry, i) => {
					const index = startIndex + i;
					const isHunkStart = entry.hunkIndex !== null && (index === 0 || entries[index - 1].hunkIndex !== entry.hunkIndex);
					return (
						<div
							key={index}
							style={{ position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0 }}
							className="flex h-6 items-center justify-center"
						>
							{isHunkStart && entry.hunkIndex !== null && (
								<div className="flex gap-0.5">
									<button
										type="button"
										aria-label={acceptLeftAria}
										onClick={() => onAccept(entry.hunkIndex as number, 'rightUsesLeft')}
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
										aria-label={acceptRightAria}
										onClick={() => onAccept(entry.hunkIndex as number, 'leftUsesRight')}
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
		</div>
	);
}

export default function TextDiffChecker({ messages }: { messages: Messages }) {
	const [originalText, setOriginalText] = useState('');
	const [changedText, setChangedText] = useState('');
	const [granularity, setGranularity] = useState<DiffGranularity>('word');
	const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
	const [ignoreCase, setIgnoreCase] = useState(false);
	const [ignoreEmptyLines, setIgnoreEmptyLines] = useState(false);
	const [normalizeLineEndings, setNormalizeLineEndings] = useState(false);
	const [normalizeUnicode, setNormalizeUnicode] = useState(false);
	const [activeHunk, setActiveHunk] = useState(0);
	const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null);
	const [hunkOverrides, setHunkOverrides] = useState<Map<number, HunkOverride>>(new Map());
	const [shareLinkCopied, setShareLinkCopied] = useState(false);

	// Mirrors the `?token=`/`?pattern=` deep-link pattern used elsewhere on the
	// site (JWT Decoder, Regex Tester), but via the URL *hash* instead of query
	// params — the hash never leaves the browser (not sent to any server, not
	// logged), and has a much higher practical length limit than query params
	// for the potentially large documents this tool compares.
	useEffect(() => {
		if (!window.location.hash) return;
		const params = new URLSearchParams(window.location.hash.slice(1));
		const original = params.get('original');
		const changed = params.get('changed');
		if (!original || !changed) return;
		Promise.all([decompressFromUrlSafeBase64(original), decompressFromUrlSafeBase64(changed)])
			.then(([o, c]) => {
				setOriginalText(o);
				setChangedText(c);
			})
			.catch(() => {
				// Corrupt or truncated share link (e.g. cut off by a chat app) — leave
				// the inputs empty rather than showing a decode error for a link the
				// user didn't necessarily create themselves.
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleCopyShareLink = async () => {
		const [originalCompressed, changedCompressed] = await Promise.all([
			compressToUrlSafeBase64(originalText),
			compressToUrlSafeBase64(changedText),
		]);
		const hash = new URLSearchParams({ original: originalCompressed, changed: changedCompressed }).toString();
		const link = `${window.location.origin}${window.location.pathname}#${hash}`;
		await navigator.clipboard.writeText(link);
		setShareLinkCopied(true);
		setTimeout(() => setShareLinkCopied(false), 1500);
	};

	const debouncedOriginal = useDebouncedValue(originalText, DEBOUNCE_MS);
	const debouncedChanged = useDebouncedValue(changedText, DEBOUNCE_MS);

	const [entries, setEntries] = useState<DiffLineEntry[]>([]);
	const [isComputing, setIsComputing] = useState(false);
	const diffWorkerRef = useRef<Worker | null>(null);
	const diffRequestIdRef = useRef(0);

	// Diffing runs in a dedicated Web Worker, not on the main thread: jsdiff's Myers-based
	// algorithms are O(N·D) and a large paste (or a very large uploaded file) can take long
	// enough to freeze the tab if run synchronously. A single worker is reused across
	// requests (unlike the hard-timeout pattern used for user-authored regexes elsewhere on
	// this site) since jsdiff's own algorithm is bounded, not adversarial user input.
	useEffect(() => {
		const requestId = ++diffRequestIdRef.current;
		if (!diffWorkerRef.current) {
			diffWorkerRef.current = new Worker(new URL('./textDiffWorker.ts', import.meta.url), { type: 'module' });
		}
		const worker = diffWorkerRef.current;
		setIsComputing(true);
		worker.onmessage = (event: MessageEvent<TextDiffResponse>) => {
			if (event.data.requestId !== diffRequestIdRef.current) return;
			setEntries(event.data.entries);
			setIsComputing(false);
		};
		const request: TextDiffRequest = {
			requestId,
			original: debouncedOriginal,
			changed: debouncedChanged,
			granularity,
			ignoreCase,
			ignoreWhitespace,
			ignoreEmptyLines,
			normalizeLineEndings,
			normalizeUnicode,
		};
		worker.postMessage(request);
	}, [
		debouncedOriginal,
		debouncedChanged,
		granularity,
		ignoreCase,
		ignoreWhitespace,
		ignoreEmptyLines,
		normalizeLineEndings,
		normalizeUnicode,
	]);

	useEffect(() => {
		return () => {
			diffWorkerRef.current?.terminate();
		};
	}, []);

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
	const mergeLeftScrollRef = useRef<HTMLDivElement>(null);
	const mergeMiddleScrollRef = useRef<HTMLDivElement>(null);
	const mergeRightScrollRef = useRef<HTMLDivElement>(null);

	const [isSideBySideFullscreen, toggleSideBySideFullscreen] = useFullscreen(sideBySideContainerRef);
	const [isMergeLeftFullscreen, toggleMergeLeftFullscreen] = useFullscreen(mergeLeftContainerRef);
	const [isMergeRightFullscreen, toggleMergeRightFullscreen] = useFullscreen(mergeRightContainerRef);

	const syncDiffScroll = useSyncedScrollGroup([leftColumnRef, rightColumnRef]);
	const syncInputScroll = useSyncedScrollGroup([originalInputRef, changedInputRef]);
	const syncMergeScroll = useSyncedScrollGroup([mergeLeftScrollRef, mergeMiddleScrollRef, mergeRightScrollRef]);
	const [mergeScrollTop, setMergeScrollTop] = useState(0);
	const handleMergeScroll = (sourceIndex: number) => (event: UIEvent<HTMLDivElement>) => {
		setMergeScrollTop(event.currentTarget.scrollTop);
		syncMergeScroll(sourceIndex)(event);
	};

	// Precomputed once per diff result (not per scroll/render) so a virtualized
	// column can look up any row's displayed line number in O(1) instead of
	// re-counting from the top every time the visible window changes.
	const leftLineNumbers = useMemo(() => {
		const numbers: Array<number | null> = [];
		let running = 0;
		for (const entry of entries) {
			if (entry.leftText !== undefined) {
				running += 1;
				numbers.push(running);
			} else {
				numbers.push(null);
			}
		}
		return numbers;
	}, [entries]);
	const rightLineNumbers = useMemo(() => {
		const numbers: Array<number | null> = [];
		let running = 0;
		for (const entry of entries) {
			if (entry.rightText !== undefined) {
				running += 1;
				numbers.push(running);
			} else {
				numbers.push(null);
			}
		}
		return numbers;
	}, [entries]);

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

	// Rows outside the current window aren't in the DOM under virtualization,
	// so `scrollIntoView` (which needs a real element to target) no longer
	// works here — instead compute the scrollTop that centers the target row
	// directly from its index and the fixed row height, and scroll the left
	// pane to it. The right pane follows automatically via the existing
	// left<->right scroll-sync (every `scroll` event fired while it animates
	// re-syncs the other pane to match).
	const jumpToHunk = (hunkPosition: number) => {
		if (hunkStartRows.length === 0) return;
		const clamped = ((hunkPosition % hunkStartRows.length) + hunkStartRows.length) % hunkStartRows.length;
		setActiveHunk(clamped);
		const rowIndex = hunkStartRows[clamped];
		const targetScrollTop = Math.max(0, rowIndex * ROW_HEIGHT - DIFF_VIEWPORT_HEIGHT / 2 + ROW_HEIGHT / 2);
		leftColumnRef.current?.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
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
						<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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
							onScrollSync={syncInputScroll(0)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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
							onScrollSync={syncInputScroll(1)}
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
						<label className="flex cursor-pointer items-center gap-1.5">
							<input type="checkbox" checked={ignoreEmptyLines} onChange={(event) => setIgnoreEmptyLines(event.target.checked)} />
							{messages.ignoreEmptyLines}
						</label>
						<label className="flex cursor-pointer items-center gap-1.5">
							<input
								type="checkbox"
								checked={normalizeLineEndings}
								onChange={(event) => setNormalizeLineEndings(event.target.checked)}
							/>
							{messages.normalizeLineEndings}
						</label>
						<label className="flex cursor-pointer items-center gap-1.5">
							<input type="checkbox" checked={normalizeUnicode} onChange={(event) => setNormalizeUnicode(event.target.checked)} />
							{messages.normalizeUnicode}
						</label>
					</div>
					{(originalText !== '' || changedText !== '') && (
						<Button type="button" size="sm" variant="outline" onClick={() => void handleCopyShareLink()}>
							{shareLinkCopied ? messages.copied : messages.copyShareLink}
						</Button>
					)}
				</div>
				{isComputing && <p role="status" className="text-xs text-muted-foreground">{messages.computing}</p>}
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
							lineNumbers={leftLineNumbers}
							side="left"
							scrollRef={leftColumnRef}
							onScroll={syncDiffScroll(0)}
							activeRowIndex={hunkStartRows[activeHunk] ?? null}
						/>
						<div className="w-px flex-shrink-0 bg-border" />
						<DiffColumn
							entries={entries}
							lineNumbers={rightLineNumbers}
							side="right"
							scrollRef={rightColumnRef}
							onScroll={syncDiffScroll(1)}
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
							<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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
							<MergeColumn
								entries={entries}
								side="left"
								hunkOverrides={hunkOverrides}
								scrollRef={mergeLeftScrollRef}
								scrollTop={mergeScrollTop}
								onScroll={handleMergeScroll(0)}
							/>
						</div>

						<MergeAcceptColumn
							entries={entries}
							hunkOverrides={hunkOverrides}
							onAccept={handleAccept}
							acceptLeftAria={messages.acceptLeftAria}
							acceptRightAria={messages.acceptRightAria}
							scrollRef={mergeMiddleScrollRef}
							scrollTop={mergeScrollTop}
							onScroll={handleMergeScroll(1)}
						/>

						<div ref={mergeRightContainerRef} className={`flex flex-col gap-2 ${isMergeRightFullscreen ? 'bg-background p-4' : ''}`}>
							<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
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
							<MergeColumn
								entries={entries}
								side="right"
								hunkOverrides={hunkOverrides}
								scrollRef={mergeRightScrollRef}
								scrollTop={mergeScrollTop}
								onScroll={handleMergeScroll(2)}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
