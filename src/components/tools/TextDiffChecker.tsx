import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type RefObject, type UIEvent } from 'react';
import {
	buildDiffHtml,
	buildUnifiedPatch,
	buildUnifiedRows,
	collapseContext,
	compileIgnorePatterns,
	countLineStats,
	getHunkStartRows,
	getUnifiedHunkStarts,
	renderMergedColumn,
	type DiffGranularity,
	type DiffLineEntry,
	type DiffInputNotes,
	type HunkOverride,
} from '@/lib/text-diff';
import type { TextDiffRequest, TextDiffResponse } from './textDiffWorker';
import { formatXmlStrict } from '@/lib/text-format';
import {
	checkFormatSize,
	DEFAULT_FORMAT_OPTIONS,
	detectLanguage,
	FORMAT_LANGUAGES,
	FORMAT_MAX_CHARS,
	INDENT_CHOICES,
	indentUnit,
	isDecisive,
	isSqlDialect,
	languageLabel,
	PRINT_WIDTHS,
	SQL_DIALECTS,
	type FormatErrorInfo,
	type FormatLanguage,
	type FormatOptions,
} from '@/lib/format-languages';
import type { FormatRunResult } from '@/lib/format-run';
import { FORMAT_TIMEOUT_MESSAGE, formatInWorker } from './formatClient';
import { Button } from '@/components/ui/button';
import UnifiedDiffView, { UNIFIED_ROW_HEIGHT, UNIFIED_VIEWPORT_HEIGHT, type TextDiffExtraMessages } from './TextDiffUnified';
import { FileChip, FileLimitsPanel, FileOptionsPanel, type LoadedFile, type TextDiffFileMessages } from './TextDiffFiles';
import {
	DEFAULT_EXTRACT_OPTIONS,
	extractFromBuffer,
	FileExtractError,
	finalizeExtractedText,
	MAX_FILE_BYTES,
	MAX_SHARE_CHARS,
	type ExtractOptions,
} from '@/lib/file-diff-extract';

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
	formatButton: string;
	formatError: string;
	clearedNotice: string;
	undo: string;
	replacedNotice: string;
	clearAria: string;
	swapAria: string;
	uploadAria: string;
	copyMergedAria: string;
	saveMergedAria: string;
	formatDuplicateKeys: string;
	formatLanguageLabel: string;
	formatAuto: string;
	formatIndentLabel: string;
	formatIndent2: string;
	formatIndent4: string;
	formatIndentTab: string;
	formatWidthLabel: string;
	formatSqlDialectLabel: string;
	formatBothAria: string;
	formatEmptyBoth: string;
	formatOptions: string;
	formatOptionsHint: string;
	dismissNotice: string;
	compareButton: string;
	compareAria: string;
	compareEmpty: string;
	compareFound: string;
	compareIdentical: string;
	resultsHeading: string;
	formatBusy: string;
	formatDone: string;
	formatDoneAuto: string;
	formatNoChange: string;
	formatEmpty: string;
	formatErrorAt: string;
	formatErrorLine: string;
	formatErrorNoPos: string;
	formatAmbiguous: string;
	formatUnknown: string;
	formatTooLarge: string;
	formatLargeWarning: string;
	formatTimeout: string;
	formatFailed: string;
	formatStale: string;
	formatMismatch: string;
	largeInputWarning: string;
	workerError: string;
	trailingNewlineNote: string;
	lineEndingsNote: string;
	noLineChangesButNotes: string;
	sharedLoadedNotice: string;
	restoreDraft: string;
	clipboardError: string;
	fileReadError: string;
	x: TextDiffExtraMessages;
	files: TextDiffFileMessages;
}

const DEBOUNCE_MS = 150;
const DRAFT_STORAGE_KEY = 'text-diff-draft';
const AUTOSAVE_DEBOUNCE_MS = 500;
const CLEAR_UNDO_TIMEOUT_MS = 6000;
const LARGE_INPUT_CHARS = 2_000_000;
// Texts that came from big files are not mirrored into localStorage (slow + quota).
const AUTOSAVE_MAX_CHARS = 1_000_000;

type Side = 'original' | 'changed';
// 'all' = a notice that is not about one particular box (e.g. both boxes empty).
type NoticeKey = Side | 'all';
const FILE_ACCEPT =
	'.txt,.text,.md,.markdown,.json,.jsonl,.yaml,.yml,.toml,.xml,.html,.htm,.css,.scss,.js,.mjs,.ts,.tsx,.jsx,.py,.rb,.php,.java,.c,.h,.cpp,.cs,.go,.rs,.sh,.sql,.log,.ini,.conf,.cfg,.env,.csv,.tsv,.diff,.patch,.srt,.docx,.pdf,.xlsx,.odt,.ods,.odp,.pptx,.rtf,text/*';
const EXTRACT_AFFECTED_KINDS = new Set(['docx', 'pdf', 'xlsx', 'odt', 'ods', 'odp', 'pptx']);

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

// Synced scrolling for N panes. Assigning scrollTop on a sibling fires that sibling's own
// asynchronous `scroll` event (next frame), so a synchronous "suppress" flag cannot
// stop the echo — the echo re-synced the source to a stale position and made scrolling
// jitter backwards. Instead, remember the exact scrollTop we programmatically assigned
// to each pane and swallow the one echo event that reports that same value.
function useSyncedScrollGroup(refs: Array<RefObject<HTMLElement | null>>) {
	const expectedRef = useRef<Array<number | null>>([]);
	return (sourceIndex: number) => (event: UIEvent<HTMLElement>) => {
		const scrollTop = event.currentTarget.scrollTop;
		if (expectedRef.current[sourceIndex] === scrollTop) {
			expectedRef.current[sourceIndex] = null;
			return;
		}
		refs.forEach((ref, i) => {
			const el = ref.current;
			if (i === sourceIndex || !el || el.scrollTop === scrollTop) return;
			el.scrollTop = scrollTop;
			expectedRef.current[i] = el.scrollTop; // the browser may clamp the value
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					expectedRef.current[i] = null;
				}),
			);
		});
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
	ariaLabel: string;
	onScrollSync: (event: UIEvent<HTMLTextAreaElement>) => void;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	gutterRef: RefObject<HTMLDivElement | null>;
}

function LineNumberedTextarea({ id, value, onChange, placeholder, ariaLabel, onScrollSync, textareaRef, gutterRef }: LineNumberedTextareaProps) {
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
				aria-label={ariaLabel}
				wrap="off"
				spellCheck={false}
				className="flex-1 resize-none overflow-auto whitespace-pre bg-transparent p-3 font-mono text-sm leading-6 text-foreground focus:outline-none"
			/>
		</div>
	);
}

// Rows are absolutely positioned (virtualised), so they do not widen the scroll
// container by themselves: a long line overflowed its row and the highlight
// stopped at the viewport edge. Reserve the width of the longest line instead.
function longestLineChars(entries: DiffLineEntry[]): number {
	let max = 0;
	for (const e of entries) {
		const l = e.leftText?.length ?? 0;
		const r = e.rightText?.length ?? 0;
		if (l > max) max = l;
		if (r > max) max = r;
	}
	return max;
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
				adoptedFromOtherSide
					? 'bg-blue-500/15'
					: // A modified line with segments highlights only the changed part (like
						// Diffchecker/Mergely); tinting the whole line hid which part changed.
						entry.type === 'modified' && segments
						? ''
						: lineBackgroundClass(entry.type)
			}`}
		>
			{segments
				? segments.map((seg, index) => {
						const isChangedPart = side === 'left' ? seg.removed : seg.added;
						return (
							<span key={index} className={isChangedPart ? 'rounded-sm bg-orange-400/60 font-semibold' : undefined}>
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
	collapsedLabel: string;
}

function DiffColumn({ entries, lineNumbers, side, scrollRef, onScroll, activeRowIndex, collapsedLabel }: DiffColumnProps) {
	const [scrollTop, setScrollTop] = useState(0);
	const handleScroll = (event: UIEvent<HTMLDivElement>) => {
		setScrollTop(event.currentTarget.scrollTop);
		onScroll(event);
	};
	const { startIndex, endIndex } = computeVisibleRange(scrollTop, DIFF_VIEWPORT_HEIGHT, entries.length, OVERSCAN_ROWS);
	const contentWidth = `calc(3.5rem + ${longestLineChars(entries)}ch)`;
	return (
		<div ref={scrollRef} onScroll={handleScroll} className="h-96 overflow-auto bg-background">
			<div style={{ height: entries.length * ROW_HEIGHT, position: 'relative', minWidth: contentWidth }}>
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
								{entry.collapsed !== undefined ? (
									<div className="h-6 bg-muted px-2 text-xs leading-6 text-muted-foreground italic">
										{collapsedLabel.replace('{{count}}', String(entry.collapsed))}
									</div>
								) : (
									<DiffRowContent entry={entry} side={side} />
								)}
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
	const contentWidth = `calc(1rem + ${longestLineChars(entries)}ch)`;
	return (
		<div ref={scrollRef} onScroll={onScroll} className="h-72 overflow-auto rounded-md border border-border">
			<div style={{ height: entries.length * ROW_HEIGHT, position: 'relative', minWidth: contentWidth }}>
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
	// On by default: a CRLF file vs. an LF file would otherwise flag every single line as
	// modified. The difference is still surfaced as a note (see `notes` below).
	const [normalizeLineEndings, setNormalizeLineEndings] = useState(true);
	const [normalizeUnicode, setNormalizeUnicode] = useState(false);
	const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
	// null = show every unchanged line; a number = keep that many lines of context around changes.
	const [contextLines, setContextLines] = useState<number | null>(null);
	const [wrapLines, setWrapLines] = useState(false);
	const [ignoreRegexText, setIgnoreRegexText] = useState('');
	const ignoreSources = useMemo(() => ignoreRegexText.split('\n').filter((line) => line.trim() !== ''), [ignoreRegexText]);
	const ignoreCompile = useMemo(() => compileIgnorePatterns(ignoreSources), [ignoreSources]);
	const [activeHunk, setActiveHunk] = useState(0);
	const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null);
	const [hunkOverrides, setHunkOverrides] = useState<Map<number, HunkOverride>>(new Map());
	const [shareLinkCopied, setShareLinkCopied] = useState(false);
	const [formatFeedback, setFormatFeedback] = useState<Record<NoticeKey, { message: string; error: boolean } | null>>({ all: null, original: null, changed: null });
	const [optionsOpen, setOptionsOpen] = useState(false);
	const [compareRequested, setCompareRequested] = useState(false);
	const [compareNote, setCompareNote] = useState<string | null>(null);
	const compareNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const diffInflightRef = useRef(false);
	const resultsRef = useRef<HTMLElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const optionsButtonRef = useRef<HTMLButtonElement>(null);
	const optionsFirstRef = useRef<HTMLSelectElement>(null);
	const [formatBusy, setFormatBusy] = useState<Record<Side, boolean>>({ original: false, changed: false });
	const [formatLang, setFormatLang] = useState<FormatLanguage | 'auto'>('auto');
	const [formatOptions, setFormatOptions] = useState<FormatOptions>(DEFAULT_FORMAT_OPTIONS);
	const [formatCrossNote, setFormatCrossNote] = useState<string | null>(null);
	const formatNoteTimers = useRef<Record<NoticeKey, ReturnType<typeof setTimeout> | null>>({ all: null, original: null, changed: null });
	// Stack of snapshots (not a single slot) so clearing/replacing twice in a row can
	// still be undone one step at a time.
	const [undoStack, setUndoStack] = useState<Array<{ side: 'original' | 'changed'; previousText: string; kind: 'clear' | 'replace' }>>([]);
	const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [sharedLoaded, setSharedLoaded] = useState(false);
	const [hasSavedDraft, setHasSavedDraft] = useState(false);
	const [toolError, setToolError] = useState<string | null>(null);
	// While a share link has been opened, the autosave must NOT overwrite the user's own
	// previously saved draft — it only resumes once the user actually edits something.
	const autosaveSuspendedRef = useRef(false);

	const editOriginal = (value: string) => {
		autosaveSuspendedRef.current = false;
		setOriginalText(value);
	};
	const editChanged = (value: string) => {
		autosaveSuspendedRef.current = false;
		setChangedText(value);
	};

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
		autosaveSuspendedRef.current = true;
		try {
			setHasSavedDraft(!!localStorage.getItem(DRAFT_STORAGE_KEY));
		} catch {
			// storage unavailable
		}
		Promise.all([decompressFromUrlSafeBase64(original), decompressFromUrlSafeBase64(changed)])
			.then(([o, c]) => {
				setOriginalText(o);
				setChangedText(c);
				setSharedLoaded(true);
			})
			.catch(() => {
				// Corrupt or truncated share link (e.g. cut off by a chat app) — leave
				// the inputs empty rather than showing a decode error for a link the
				// user didn't necessarily create themselves.
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Restores an autosaved draft after mount — localStorage isn't available during Astro's
	// build-time SSR pass, so this must run client-side only. Skipped entirely when a
	// share-link hash is present: a link the user explicitly opened wins, and the saved
	// draft stays untouched (offered back via the "Restore my draft" button).
	useEffect(() => {
		if (window.location.hash) return;
		try {
			const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
			if (!saved) return;
			const draft = JSON.parse(saved) as { original?: string; changed?: string };
			if (typeof draft.original === 'string') setOriginalText(draft.original);
			if (typeof draft.changed === 'string') setChangedText(draft.changed);
		} catch {
			// Unavailable (private browsing, quota) or corrupt JSON — autosave is a
			// convenience, not a requirement, so fail silently and start from empty.
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleRestoreDraft = () => {
		try {
			const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
			if (!saved) return;
			const draft = JSON.parse(saved) as { original?: string; changed?: string };
			autosaveSuspendedRef.current = false;
			setOriginalText(typeof draft.original === 'string' ? draft.original : '');
			setChangedText(typeof draft.changed === 'string' ? draft.changed : '');
			setSharedLoaded(false);
		} catch {
			setToolError(messages.fileReadError);
		}
	};

	// Debounced autosave: clearing both boxes removes the saved draft instead of persisting
	// two empty strings, so hitting Clear (or its Undo) doesn't leave a stale draft to
	// resurrect on the next visit.
	useEffect(() => {
		const timer = setTimeout(() => {
			if (autosaveSuspendedRef.current) return;
			if (originalText.length + changedText.length > AUTOSAVE_MAX_CHARS) return;
			try {
				if (originalText || changedText) {
					localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ original: originalText, changed: changedText }));
				} else {
					localStorage.removeItem(DRAFT_STORAGE_KEY);
				}
			} catch {
				// See note above — autosave failures (quota, private mode) are non-fatal.
			}
		}, AUTOSAVE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [originalText, changedText]);

	// ---- File loading (text / Word / PDF / Excel / OpenDocument / PowerPoint / RTF) ----
	// The File's bytes are kept in memory only (never in localStorage and never uploaded) so that
	// changing an extraction option can re-read the file without asking for it again.
	const fm = messages.files;
	const [extractOptions, setExtractOptions] = useState<ExtractOptions>(DEFAULT_EXTRACT_OPTIONS);
	const [loaded, setLoaded] = useState<Record<Side, LoadedFile | null>>({ original: null, changed: null });
	const [busyName, setBusyName] = useState<Record<Side, string | null>>({ original: null, changed: null });
	const [fileError, setFileError] = useState<Record<Side, string | null>>({ original: null, changed: null });
	const [fileNotice, setFileNotice] = useState<string | null>(null);
	const [dragSide, setDragSide] = useState<Side | 'page' | null>(null);
	const buffersRef = useRef<Record<Side, { buffer: ArrayBuffer; mime: string } | null>>({ original: null, changed: null });
	const loadTokenRef = useRef<Record<Side, number>>({ original: 0, changed: 0 });
	const textsRef = useRef({ original: '', changed: '' });
	textsRef.current = { original: originalText, changed: changedText };
	const optionsRef = useRef(extractOptions);
	const loadedRef = useRef(loaded);
	loadedRef.current = loaded;

	const setSideText = (side: Side, text: string) => (side === 'original' ? editOriginal(text) : editChanged(text));
	const fileErrorMessage = (error: unknown) =>
		error instanceof FileExtractError ? fm.err[error.code].replace('{{max}}', String(MAX_FILE_BYTES / 1024 / 1024)) : fm.err.read;
	const dropFile = (side: Side) => {
		loadTokenRef.current[side]++;
		buffersRef.current[side] = null;
		setLoaded((prev) => ({ ...prev, [side]: null }));
		setFileError((prev) => ({ ...prev, [side]: null }));
		setBusyName((prev) => ({ ...prev, [side]: null }));
	};
	const ifCurrent = (side: Side, token: number, fn: () => void) => {
		if (token === loadTokenRef.current[side]) fn();
	};

	const loadFile = async (side: Side, file: File) => {
		const token = ++loadTokenRef.current[side];
		setFileError((prev) => ({ ...prev, [side]: null }));
		setFileNotice(null);
		setBusyName((prev) => ({ ...prev, [side]: file.name }));
		try {
			if (file.size > MAX_FILE_BYTES) throw new FileExtractError('tooLarge');
			const buffer = await file.arrayBuffer();
			const result = await extractFromBuffer(file.name, file.type, buffer, optionsRef.current, null);
			if (token !== loadTokenRef.current[side]) return;
			const text = finalizeExtractedText(result);
			buffersRef.current[side] = { buffer, mime: file.type };
			pushUndo(side, textsRef.current[side], 'replace');
			setLoaded((prev) => ({ ...prev, [side]: { name: file.name, size: file.size, result, sheets: null, text } }));
			setSideText(side, text);
		} catch (error) {
			ifCurrent(side, token, () => setFileError((prev) => ({ ...prev, [side]: fileErrorMessage(error) })));
		} finally {
			ifCurrent(side, token, () => setBusyName((prev) => ({ ...prev, [side]: null })));
		}
	};

	// Re-reads an already loaded file with new options / a new sheet selection. Text the user has
	// edited since loading is never overwritten.
	const reextract = async (side: Side, options: ExtractOptions, sheets: string[] | null) => {
		const current = loadedRef.current[side];
		const source = buffersRef.current[side];
		if (!current || !source || !EXTRACT_AFFECTED_KINDS.has(current.result.kind)) return;
		if (textsRef.current[side] !== current.text) {
			setFileNotice(fm.editedKept);
			return;
		}
		const token = ++loadTokenRef.current[side];
		setBusyName((prev) => ({ ...prev, [side]: current.name }));
		try {
			const result = await extractFromBuffer(current.name, source.mime, source.buffer, options, sheets);
			if (token !== loadTokenRef.current[side]) return;
			const text = finalizeExtractedText(result);
			setLoaded((prev) => ({ ...prev, [side]: { ...current, result, sheets, text } }));
			setSideText(side, text);
		} catch (error) {
			ifCurrent(side, token, () => setFileError((prev) => ({ ...prev, [side]: fileErrorMessage(error) })));
		} finally {
			ifCurrent(side, token, () => setBusyName((prev) => ({ ...prev, [side]: null })));
		}
	};

	const handleExtractOptionsChange = (next: ExtractOptions) => {
		setExtractOptions(next);
		optionsRef.current = next;
		setFileNotice(null);
		(['original', 'changed'] as const).forEach((side) => void reextract(side, next, loadedRef.current[side]?.sheets ?? null));
	};

	// One file goes to the given side (or the first empty one); two or more files go to
	// Original / Changed in the order they were dropped or chosen.
	const handleFiles = (files: File[], target: Side | null) => {
		if (files.length === 0) return;
		setFileNotice(null);
		if (files.length >= 2) {
			void loadFile('original', files[0]);
			void loadFile('changed', files[1]);
			if (files.length > 2) setFileNotice(fm.onlyTwoFiles);
			return;
		}
		const side = target ?? (textsRef.current.original === '' ? 'original' : textsRef.current.changed === '' ? 'changed' : 'original');
		void loadFile(side, files[0]);
	};

	const pushUndo = (side: 'original' | 'changed', previousText: string, kind: 'clear' | 'replace') => {
		if (previousText === '') return;
		setUndoStack((stack) => [...stack.slice(-9), { side, previousText, kind }]);
		if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		undoTimerRef.current = setTimeout(() => setUndoStack([]), CLEAR_UNDO_TIMEOUT_MS);
	};

	// Clearing a box is a one-click, full-content-loss action with no confirmation prompt
	// — instead the previous text is kept in memory for a few seconds and offered back via
	// an inline Undo (replacing content via Upload/Format is undoable the same way).
	const handleClear = (which: 'original' | 'changed') => {
		const previousText = which === 'original' ? originalText : changedText;
		dropFile(which);
		if (previousText === '') return;
		if (which === 'original') editOriginal('');
		else editChanged('');
		pushUndo(which, previousText, 'clear');
	};

	const handleUndo = () => {
		const top = undoStack[undoStack.length - 1];
		if (!top) return;
		if (top.side === 'original') editOriginal(top.previousText);
		else editChanged(top.previousText);
		setUndoStack((stack) => stack.slice(0, -1));
		if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		undoTimerRef.current = setTimeout(() => setUndoStack([]), CLEAR_UNDO_TIMEOUT_MS);
	};

	const handleCopyShareLink = async () => {
		try {
			const [originalCompressed, changedCompressed] = await Promise.all([
				compressToUrlSafeBase64(originalText),
				compressToUrlSafeBase64(changedText),
			]);
			const hash = new URLSearchParams({ original: originalCompressed, changed: changedCompressed }).toString();
			const link = `${window.location.origin}${window.location.pathname}#${hash}`;
			await navigator.clipboard.writeText(link);
			setShareLinkCopied(true);
			setTimeout(() => setShareLinkCopied(false), 1500);
		} catch {
			setToolError(messages.clipboardError);
		}
	};

	const debouncedOriginal = useDebouncedValue(originalText, DEBOUNCE_MS);
	const debouncedChanged = useDebouncedValue(changedText, DEBOUNCE_MS);

	const [entries, setEntries] = useState<DiffLineEntry[]>([]);
	const [notes, setNotes] = useState<DiffInputNotes>({ lineEndingsDiffer: false, trailingNewlineDiffers: false });
	const [isComputing, setIsComputing] = useState(false);
	const [diffError, setDiffError] = useState(false);

	// Diffing runs in a dedicated Web Worker, not on the main thread: a large paste can take
	// long enough to freeze the tab if run synchronously. Each new request TERMINATES the
	// previous worker (cancelling a stale, possibly very slow computation instead of
	// queueing behind it) and starts a fresh one; onerror clears the spinner so a crashed
	// worker can never leave "Computing…" stuck forever.
	useEffect(() => {
		const worker = new Worker(new URL('./textDiffWorker.ts', import.meta.url), { type: 'module' });
		diffInflightRef.current = true;
		setIsComputing(true);
		setDiffError(false);
		worker.onmessage = (event: MessageEvent<TextDiffResponse>) => {
			if (event.data.error) {
				setDiffError(true);
			} else {
				setEntries(event.data.entries);
				setNotes(event.data.notes);
			}
			diffInflightRef.current = false;
			setIsComputing(false);
			worker.terminate();
		};
		worker.onerror = () => {
			setDiffError(true);
			diffInflightRef.current = false;
			setIsComputing(false);
			worker.terminate();
		};
		const request: TextDiffRequest = {
			requestId: 0,
			original: debouncedOriginal,
			changed: debouncedChanged,
			granularity,
			ignoreCase,
			ignoreWhitespace,
			ignoreEmptyLines,
			normalizeLineEndings,
			normalizeUnicode,
			ignorePatterns: ignoreCompile.error ? [] : ignoreSources,
		};
		worker.postMessage(request);
		return () => worker.terminate();
	}, [
		debouncedOriginal,
		debouncedChanged,
		granularity,
		ignoreCase,
		ignoreWhitespace,
		ignoreEmptyLines,
		normalizeLineEndings,
		normalizeUnicode,
		ignoreSources,
		ignoreCompile.error,
	]);

	useEffect(() => {
		return () => {
			if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		};
	}, []);

	const isLargeInput = originalText.length + changedText.length > LARGE_INPUT_CHARS;
	const stats = useMemo(() => countLineStats(entries), [entries]);
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

	// "Hide unchanged lines": display-only. The merge tool and exports always use the full `entries`.
	const collapsedView = useMemo(
		() => (contextLines === null ? { entries, sourceIndex: entries.map((_, i) => i) } : collapseContext(entries, contextLines)),
		[entries, contextLines],
	);
	const viewEntries = collapsedView.entries;
	const viewLeftNumbers = useMemo(
		() => collapsedView.sourceIndex.map((i) => (i === -1 ? null : leftLineNumbers[i])),
		[collapsedView, leftLineNumbers],
	);
	const viewRightNumbers = useMemo(
		() => collapsedView.sourceIndex.map((i) => (i === -1 ? null : rightLineNumbers[i])),
		[collapsedView, rightLineNumbers],
	);
	const hunkStartRows = useMemo(() => getHunkStartRows(viewEntries), [viewEntries]);
	const unifiedRows = useMemo(() => (viewMode === 'unified' ? buildUnifiedRows(entries, contextLines) : []), [viewMode, entries, contextLines]);
	const unifiedHunkStarts = useMemo(() => getUnifiedHunkStarts(unifiedRows), [unifiedRows]);
	const unifiedScrollRef = useRef<HTMLDivElement>(null);
	const [exportNote, setExportNote] = useState<string | null>(null);

	const downloadText = (content: string, filename: string, mime: string) => {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	};
	const cleanName = (name: string | undefined) => (name ? name.replace(/\s+/g, ' ').trim() || undefined : undefined);
	const patchNames = { oldName: cleanName(loaded.original?.name), newName: cleanName(loaded.changed?.name) };
	const leftTitle = loaded.original?.name ?? messages.originalLabel;
	const rightTitle = loaded.changed?.name ?? messages.changedLabel;
	const handleExportPatch = () => {
		const patch = buildUnifiedPatch(entries, patchNames);
		if (!patch) {
			setExportNote(messages.x.exportNothing);
			return;
		}
		setExportNote(null);
		downloadText(patch, 'changes.diff', 'text/x-diff');
	};
	const handleCopyPatch = () => {
		const patch = buildUnifiedPatch(entries, patchNames);
		if (!patch) {
			setExportNote(messages.x.exportNothing);
			return;
		}
		navigator.clipboard
			.writeText(patch)
			.then(() => setExportNote(messages.x.patchCopied))
			.catch(() => setToolError(messages.clipboardError));
	};
	const handleExportHtml = () => {
		downloadText(
buildDiffHtml(entries, { title: `${leftTitle} / ${rightTitle}`, left: leftTitle, right: rightTitle, lang: document.documentElement.lang || 'en' }),
			'diff.html',
			'text/html',
		);
	};

	const handleUploadFile = (which: Side) => (fileList: FileList | null) => {
		handleFiles(Array.from(fileList ?? []), which);
	};

	const handleSwap = () => {
		editOriginal(changedText);
		editChanged(originalText);
		setLoaded((prev) => ({ original: prev.changed, changed: prev.original }));
		buffersRef.current = { original: buffersRef.current.changed, changed: buffersRef.current.original };
		loadTokenRef.current = { original: loadTokenRef.current.original + 1, changed: loadTokenRef.current.changed + 1 };
		setBusyName({ original: null, changed: null });
	};

	// Formats one side with the chosen (or auto-detected) language so two pastes that differ only
	// in style diff cleanly. Everything runs in this browser: JSON/XML here, SQL and the
	// prettier languages in a lazily created worker that loads only the parser needed
	// (see `format-languages.ts`, `format-run.ts`). A failure never touches the text; success
	// is undoable like the other replace actions.
	const setFormatNote = (side: NoticeKey, note: { message: string; error: boolean } | null) => {
		const timer = formatNoteTimers.current[side];
		if (timer) clearTimeout(timer);
		setFormatFeedback((prev) => ({ ...prev, [side]: note }));
		formatNoteTimers.current[side] = note ? setTimeout(() => setFormatFeedback((prev) => ({ ...prev, [side]: null })), note.error ? 12000 : 6000) : null;
	};

	const formatErrorMessage = (label: string, error: FormatErrorInfo): string => {
		if (error.message === FORMAT_TIMEOUT_MESSAGE) return messages.formatTimeout;
		if (error.message === 'worker-error') return messages.formatFailed;
		const template = error.line === undefined ? messages.formatErrorNoPos : error.column === undefined ? messages.formatErrorLine : messages.formatErrorAt;
		return template
			.replace('{{language}}', label)
			.replace('{{line}}', String(error.line ?? ''))
			.replace('{{column}}', String(error.column ?? ''))
			.replace('{{message}}', error.message);
	};

	const formatOne = async (side: Side): Promise<FormatLanguage | null> => {
		const text = textsRef.current[side];
		if (text.trim() === '') {
			setFormatNote(side, { message: messages.formatEmpty, error: true });
			return null;
		}
		const size = checkFormatSize(text.length);
		if (size === 'tooLarge') {
			setFormatNote(side, { message: messages.formatTooLarge.replace('{{max}}', FORMAT_MAX_CHARS.toLocaleString('en-US')), error: true });
			return null;
		}
		let language: FormatLanguage;
		let auto = false;
		if (formatLang === 'auto') {
			const detection = detectLanguage(text, loadedRef.current[side]?.name);
			if (!isDecisive(detection) || !detection.language) {
				const names = detection.candidates.map(languageLabel).join(', ');
				setFormatNote(side, { message: names ? messages.formatAmbiguous.replace('{{candidates}}', names) : messages.formatUnknown, error: true });
				return null;
			}
			language = detection.language;
			auto = true;
		} else {
			language = formatLang;
		}
		const label = languageLabel(language);
		setFormatNote(side, null);
		setFormatBusy((prev) => ({ ...prev, [side]: true }));
		let result: FormatRunResult;
		try {
			if (language === 'xml') {
				const xml = formatXmlStrict(text, indentUnit(formatOptions.indent));
				result = 'error' in xml ? { ok: false, error: xml.error } : { ok: true, value: xml.value, warnings: [] };
			} else {
				result = await formatInWorker(text, language, formatOptions);
			}
		} catch {
			result = { ok: false, error: { message: 'worker-error' } };
		} finally {
			setFormatBusy((prev) => ({ ...prev, [side]: false }));
		}
		if (textsRef.current[side] !== text) {
			setFormatNote(side, { message: messages.formatStale, error: true });
			return language;
		}
		if (!result.ok) {
			setFormatNote(side, { message: formatErrorMessage(label, result.error), error: true });
			return language;
		}
		if (result.value === text) {
			setFormatNote(side, { message: messages.formatNoChange.replace('{{language}}', label), error: false });
			return language;
		}
		pushUndo(side, text, 'replace');
		setSideText(side, result.value);
		const parts = [(auto ? messages.formatDoneAuto : messages.formatDone).replace('{{language}}', label)];
		if (result.warnings.includes('duplicateKeys')) parts.push(messages.formatDuplicateKeys);
		if (size === 'warn') parts.push(messages.formatLargeWarning);
		setFormatNote(side, { message: parts.join(' '), error: false });
		return language;
	};

	// The single toolbar "Format" button: formats BOTH boxes, each with its own auto-detected
	// language (unless the user forced one in the options menu). An empty box is skipped silently
	// when the other one has text; warns when auto-detection found two different languages (the
	// diff will then still show style differences).
	const handleFormatAll = async () => {
		setFormatCrossNote(null);
		setOptionsOpen(false);
		const sides = (['original', 'changed'] as const).filter((side) => textsRef.current[side].trim() !== '');
		if (sides.length === 0) {
			setFormatNote('original', null);
			setFormatNote('changed', null);
			setFormatNote('all', { message: messages.formatEmptyBoth, error: true });
			return;
		}
		setFormatNote('all', null);
		(['original', 'changed'] as const).filter((side) => !sides.includes(side)).forEach((side) => setFormatNote(side, null));
		const results = await Promise.all(sides.map((side) => formatOne(side)));
		if (results.length === 2 && results[0] && results[1] && results[0] !== results[1])
			setFormatCrossNote(messages.formatMismatch.replace('{{a}}', languageLabel(results[0])).replace('{{b}}', languageLabel(results[1])));
	};

	const showCompareNote = (text: string) => {
		if (compareNoteTimer.current) clearTimeout(compareNoteTimer.current);
		setCompareNote(text);
		compareNoteTimer.current = setTimeout(() => setCompareNote(null), 6000);
	};

	// "Compare": the diff already runs live while typing, so this waits until any in-flight
	// computation has finished (see the effect below), then scrolls to the results region.
	const handleCompare = () => {
		setOptionsOpen(false);
		if (originalText.trim() === '' && changedText.trim() === '') {
			showCompareNote(messages.compareEmpty);
			return;
		}
		setCompareNote(null);
		setCompareRequested(true);
	};

	useEffect(() => {
		if (!compareRequested) return;
		const pending =
			originalText !== debouncedOriginal || changedText !== debouncedChanged || diffInflightRef.current || isComputing;
		if (pending) return;
		setCompareRequested(false);
		const target = resultsRef.current;
		if (target) {
			const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
			target.focus({ preventScroll: true });
		}
		if (!diffError) {
			const total = hunkStartRows.length || stats.added + stats.removed + stats.modified;
			showCompareNote(hasChanges ? messages.compareFound.replace('{{count}}', String(total)) : messages.compareIdentical);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [compareRequested, originalText, changedText, debouncedOriginal, debouncedChanged, isComputing, entries]);

	// Options popover: Esc closes (focus returns to the gear), as does a pointer press or focus
	// moving outside of the toolbar.
	useEffect(() => {
		if (!optionsOpen) return;
		optionsFirstRef.current?.focus();
		const onPointer = (event: PointerEvent) => {
			if (!toolbarRef.current?.contains(event.target as Node)) setOptionsOpen(false);
		};
		const onFocusIn = (event: FocusEvent) => {
			if (!toolbarRef.current?.contains(event.target as Node)) setOptionsOpen(false);
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('focusin', onFocusIn);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('focusin', onFocusIn);
		};
	}, [optionsOpen]);

	useEffect(
		() => () => {
			if (compareNoteTimer.current) clearTimeout(compareNoteTimer.current);
			Object.values(formatNoteTimers.current).forEach((timer) => timer && clearTimeout(timer));
		},
		[],
	);


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
		if (viewMode === 'unified') {
			const unifiedRow = unifiedHunkStarts[clamped] ?? 0;
			unifiedScrollRef.current?.scrollTo({
				top: Math.max(0, unifiedRow * UNIFIED_ROW_HEIGHT - UNIFIED_VIEWPORT_HEIGHT / 2 + UNIFIED_ROW_HEIGHT / 2),
				behavior: 'smooth',
			});
			return;
		}
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
		navigator.clipboard
			.writeText(text)
			.then(() => {
				setCopiedSide(side);
				setTimeout(() => setCopiedSide(null), 1500);
			})
			.catch(() => setToolError(messages.clipboardError));
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

	const renderNotes = () =>
		(notes.trailingNewlineDiffers || notes.lineEndingsDiffer) && (
			<ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
				{notes.trailingNewlineDiffers && <li>{messages.trailingNewlineNote}</li>}
				{notes.lineEndingsDiffer && <li>{messages.lineEndingsNote}</li>}
			</ul>
		);

	const renderPanel = (which: 'original' | 'changed') => {
		const isOriginal = which === 'original';
		const label = isOriginal ? messages.originalLabel : messages.changedLabel;
		const fileRef = isOriginal ? originalFileInputRef : changedFileInputRef;
		const topUndo = undoStack[undoStack.length - 1];
		return (
			<div
					data-diff-side={which}
					className={`flex flex-col gap-2 rounded-md md:row-span-3 md:grid md:grid-rows-subgrid md:gap-y-2 ${dragSide === which || dragSide === 'page' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
				>
				<div className="relative flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<label htmlFor={`text-diff-${which}`} className="text-sm font-medium text-foreground">
							{label}
						</label>
						{isOriginal && (
							<div
								ref={toolbarRef}
								className="flex items-center gap-1"
								onKeyDown={(event) => {
									if (event.key === 'Escape' && optionsOpen) {
										event.stopPropagation();
										setOptionsOpen(false);
										optionsButtonRef.current?.focus();
									}
								}}
							>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="min-h-9 px-3"
									disabled={anyFormatBusy}
									aria-label={messages.formatBothAria}
									onClick={() => void handleFormatAll()}
								>
									{anyFormatBusy ? messages.formatBusy : messages.formatButton}
								</Button>
								<Button
									ref={optionsButtonRef}
									type="button"
									size="sm"
									variant="outline"
									className="min-h-9 min-w-9 px-0"
									aria-label={messages.formatOptions}
									title={messages.formatOptions}
									aria-expanded={optionsOpen}
									aria-controls="text-diff-format-options"
									aria-haspopup="true"
									onClick={() => setOptionsOpen((open) => !open)}
								>
									<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
								<circle cx="12" cy="12" r="3" />
								<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
							</svg>
								</Button>
					{optionsOpen && (
						<div
							id="text-diff-format-options"
							role="group"
							aria-label={messages.formatOptions}
							className="absolute left-0 top-full z-20 mt-1 flex w-[min(20rem,calc(100vw-3rem))] flex-col gap-3 rounded-md border border-border bg-background p-3 shadow-lg"
						>
							<label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
								{messages.formatLanguageLabel}
								<select
									ref={optionsFirstRef}
									value={formatLang}
									onChange={(event) => setFormatLang(event.target.value as FormatLanguage | 'auto')}
									className="min-h-9 max-w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
								>
									<option value="auto">{messages.formatAuto}</option>
									{FORMAT_LANGUAGES.map((language) => (
										<option key={language.id} value={language.id}>
											{language.label}
										</option>
									))}
								</select>
							</label>
							<label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
								{messages.formatIndentLabel}
								<select
									value={formatOptions.indent}
									onChange={(event) => setFormatOptions((prev) => ({ ...prev, indent: event.target.value as FormatOptions['indent'] }))}
									className="min-h-9 max-w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
								>
									{INDENT_CHOICES.map((choice) => (
										<option key={choice} value={choice}>
											{choice === '2' ? messages.formatIndent2 : choice === '4' ? messages.formatIndent4 : messages.formatIndentTab}
										</option>
									))}
								</select>
							</label>
							{formatLang !== 'json' && formatLang !== 'xml' && formatLang !== 'sql' && (
								<label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
									{messages.formatWidthLabel}
									<select
										value={formatOptions.printWidth}
										onChange={(event) => setFormatOptions((prev) => ({ ...prev, printWidth: Number(event.target.value) }))}
										className="min-h-9 max-w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
									>
										{PRINT_WIDTHS.map((width) => (
											<option key={width} value={width}>
												{width}
											</option>
										))}
									</select>
								</label>
							)}
							{(formatLang === 'sql' || formatLang === 'auto') && (
								<label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
									{messages.formatSqlDialectLabel}
									<select
										value={formatOptions.sqlDialect}
										onChange={(event) => isSqlDialect(event.target.value) && setFormatOptions((prev) => ({ ...prev, sqlDialect: event.target.value as FormatOptions['sqlDialect'] }))}
										className="min-h-9 max-w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
									>
										{SQL_DIALECTS.map((dialect) => (
											<option key={dialect.id} value={dialect.id}>
												{dialect.label}
											</option>
										))}
									</select>
								</label>
							)}
							<p className="text-xs text-muted-foreground">{messages.formatOptionsHint}</p>
						</div>
					)}
							</div>
						)}
					</div>
					<div className="flex flex-wrap gap-1">
						<Button type="button" size="sm" variant="ghost" aria-label={messages.clearAria.replace('{{side}}', label)} onClick={() => handleClear(which)}>
							{messages.clear}
						</Button>
						<Button type="button" size="sm" variant="ghost" aria-label={messages.swapAria} onClick={handleSwap}>
							{messages.swap}
						</Button>
						<Button
							type="button"
							size="sm"
								variant="ghost"
								className="min-h-9"
								aria-label={messages.uploadAria.replace('{{side}}', label)}
							onClick={() => fileRef.current?.click()}
						>
							{messages.uploadFile}
						</Button>
						<input
							ref={fileRef}
							type="file"
accept={FILE_ACCEPT}
								multiple
							className="hidden"
							tabIndex={-1}
							aria-hidden="true"
							onChange={(event) => {
								handleUploadFile(which)(event.target.files);
								event.target.value = '';
							}}
						/>
					</div>
				</div>
				<LineNumberedTextarea
					id={`text-diff-${which}`}
					value={isOriginal ? originalText : changedText}
					onChange={isOriginal ? editOriginal : editChanged}
					placeholder={messages.placeholder}
					ariaLabel={label}
					textareaRef={isOriginal ? originalInputRef : changedInputRef}
					gutterRef={isOriginal ? originalGutterRef : changedGutterRef}
					onScrollSync={syncInputScroll(isOriginal ? 0 : 1)}
				/>
				<div className="flex min-w-0 flex-col gap-2">
					{loaded[which] && (
						<FileChip
							file={loaded[which] as LoadedFile}
							edited={(isOriginal ? originalText : changedText) !== (loaded[which] as LoadedFile).text}
							side={label}
							messages={fm}
							onRemove={() => handleClear(which)}
							onSheetsChange={(sheets) => void reextract(which, extractOptions, sheets)}
						/>
					)}
					{busyName[which] && (
						<p role="status" className="text-xs text-muted-foreground">
							{fm.loading.replace('{{name}}', busyName[which] as string)}
						</p>
					)}
					{fileError[which] && (
						<p role="alert" className="text-xs text-destructive [overflow-wrap:anywhere]">
							{fileError[which]}
						</p>
					)}
					{!loaded[which] && !busyName[which] && (isOriginal ? originalText : changedText) === '' && (
						<p className="text-xs text-muted-foreground">{dragSide === which || dragSide === 'page' ? fm.dropActive : fm.dropHint}</p>
					)}
					<p role="status" aria-live="polite" className="flex min-h-4 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
					{topUndo?.side === which && (
						<>
							<span>{topUndo.kind === 'clear' ? messages.clearedNotice : messages.replacedNotice}</span>
							<button type="button" onClick={handleUndo} className="font-medium text-primary underline-offset-2 hover:underline">
								{messages.undo}
							</button>
						</>
					)}
				</p>
				</div>
			</div>
		);
	};

	const hasDraggedFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
	const sideFromTarget = (target: EventTarget | null): Side | null => {
		const value = (target as HTMLElement | null)?.closest?.('[data-diff-side]')?.getAttribute('data-diff-side');
		return value === 'original' || value === 'changed' ? value : null;
	};

	const anyFormatBusy = formatBusy.original || formatBusy.changed;
	const notices = (['all', 'original', 'changed'] as const).filter((key) => formatFeedback[key] !== null);
	const noticeText = (key: NoticeKey) => {
		const message = formatFeedback[key]!.message;
		return key === 'all' ? message : `${key === 'original' ? messages.originalLabel : messages.changedLabel}: ${message}`;
	};

	const shareBlocked = (loaded.original !== null || loaded.changed !== null) && originalText.length + changedText.length > MAX_SHARE_CHARS;

	return (
		<div
			className="flex flex-col gap-6"
			onDragOver={(event) => {
				if (!hasDraggedFiles(event)) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = 'copy';
				const count = event.dataTransfer.items?.length ?? 1;
				setDragSide(count >= 2 ? 'page' : (sideFromTarget(event.target) ?? 'page'));
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragSide(null);
			}}
			onDrop={(event) => {
				if (!hasDraggedFiles(event)) return;
				event.preventDefault();
				setDragSide(null);
				handleFiles(Array.from(event.dataTransfer.files), sideFromTarget(event.target));
			}}
		>
			<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
				{sharedLoaded && (
					<p role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
						{messages.sharedLoadedNotice}
						{hasSavedDraft && (
							<button type="button" onClick={handleRestoreDraft} className="font-medium text-primary underline-offset-2 hover:underline">
								{messages.restoreDraft}
							</button>
						)}
					</p>
				)}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:gap-y-0">
					{renderPanel('original')}
					{renderPanel('changed')}
				</div>
				<div className="flex justify-center">
					<Button type="button" className="min-h-9 w-full px-8 font-semibold md:w-auto md:min-w-48" aria-label={messages.compareAria} onClick={handleCompare}>
						{messages.compareButton}
					</Button>
				</div>
				{/* Compact notices right under the toolbar: format results/errors and the compare summary.
				    The polite live region is always mounted so announcements are reliably read. */}
				<div className="flex flex-col gap-1 empty:hidden">
					<div role="status" aria-live="polite" className="flex flex-col gap-1 text-xs text-muted-foreground empty:hidden">
						{compareNote && <p className="[overflow-wrap:anywhere]">{compareNote}</p>}
						{anyFormatBusy && <p>{messages.formatBusy}</p>}
						{notices
							.filter((key) => !formatFeedback[key]!.error)
							.map((key) => (
								<p key={key} className="[overflow-wrap:anywhere]">
									{noticeText(key)}
								</p>
							))}
						{formatCrossNote && <p className="text-amber-700 dark:text-amber-400 [overflow-wrap:anywhere]">{formatCrossNote}</p>}
					</div>
					{notices.some((key) => formatFeedback[key]!.error) && (
						<div role="alert" className="flex flex-col gap-1 text-xs text-destructive">
							{notices
								.filter((key) => formatFeedback[key]!.error)
								.map((key) => (
									<p key={key} className="[overflow-wrap:anywhere]">
										{noticeText(key)}
									</p>
								))}
						</div>
					)}
					{(notices.length > 0 || formatCrossNote) && (
						<button
							type="button"
							className="min-h-9 self-start rounded-md px-2 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => {
								(['all', 'original', 'changed'] as const).forEach((key) => setFormatNote(key, null));
								setFormatCrossNote(null);
							}}
						>
							{messages.dismissNotice}
						</button>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-4">
					<div className="flex items-center gap-1 text-sm text-foreground">
						{(['char', 'word', 'line'] as const).map((g) => (
							<button
								key={g}
								type="button"
								onClick={() => setGranularity(g)} aria-pressed={granularity === g}
								className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
									granularity === g ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'
								}`}
							>
								{g === 'char' ? messages.modeChar : g === 'word' ? messages.modeWord : messages.modeLine}
							</button>
						))}
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground">
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
						{(originalText !== '' || changedText !== '') &&
							(shareBlocked ? (
								<p role="status" className="text-xs text-muted-foreground">
									{fm.shareTooLarge.replace('{{max}}', MAX_SHARE_CHARS.toLocaleString('en-US'))}
								</p>
							) : (
								<Button type="button" size="sm" variant="outline" className="min-h-9" aria-live="polite" onClick={() => void handleCopyShareLink()}>
									{shareLinkCopied ? messages.copied : messages.copyShareLink}
								</Button>
							))}
				</div>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground">
					<div className="flex items-center gap-1">
						<span className="text-xs text-muted-foreground">{messages.x.viewLabel}</span>
						{(['split', 'unified'] as const).map((mode) => (
							<button
								key={mode}
								type="button"
								onClick={() => setViewMode(mode)}
								aria-pressed={viewMode === mode}
								className={`min-h-9 rounded-md border px-2.5 py-1 text-xs font-medium ${
									viewMode === mode ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'
								}`}
							>
								{mode === 'split' ? messages.x.viewSplit : messages.x.viewUnified}
							</button>
						))}
					</div>
					<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
						{messages.x.contextLabel}
						<select
							value={contextLines === null ? 'all' : String(contextLines)}
							onChange={(event) => setContextLines(event.target.value === 'all' ? null : Number(event.target.value))}
							className="min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
						>
							<option value="all">{messages.x.contextAll}</option>
							{[0, 1, 3, 5, 10].map((n) => (
								<option key={n} value={String(n)}>
									{messages.x.contextN.replace('{{n}}', String(n))}
								</option>
							))}
						</select>
					</label>
					{viewMode === 'unified' && (
						<label className="flex min-h-9 cursor-pointer items-center gap-1.5">
							<input type="checkbox" checked={wrapLines} onChange={(event) => setWrapLines(event.target.checked)} />
							{messages.x.wrapLines}
						</label>
					)}
				</div>
				<details className="rounded-md border border-border p-3">
					<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.x.ignoreRegexHeading}</summary>
					<div className="mt-2 flex flex-col gap-1">
						<label htmlFor="text-diff-ignore-regex" className="text-xs text-muted-foreground">
							{messages.x.ignoreRegexHelp}
						</label>
						<textarea
							id="text-diff-ignore-regex"
							value={ignoreRegexText}
							onChange={(event) => setIgnoreRegexText(event.target.value)}
							placeholder={messages.x.ignoreRegexPlaceholder}
							rows={3}
							spellCheck={false}
							className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
						/>
						{ignoreCompile.error && (
							<p role="alert" className="text-xs text-destructive">
								{messages.x.ignoreRegexInvalid.replace('{{message}}', ignoreCompile.error)}
							</p>
						)}
					</div>
				</details>
					<FileOptionsPanel options={extractOptions} onChange={handleExtractOptionsChange} messages={fm} />
					<FileLimitsPanel messages={fm} />
					{fileNotice && (
						<p role="status" className="text-xs text-amber-700 dark:text-amber-400">
							{fileNotice}
						</p>
					)}
					{isLargeInput && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">{messages.largeInputWarning}</p>}
				{isComputing && <p role="status" className="text-xs text-muted-foreground">{messages.computing}</p>}
				{(diffError || toolError) && (
					<p role="alert" className="text-xs text-destructive">
						{diffError ? messages.workerError : toolError}
					</p>
				)}
			</div>

			<section
				id="text-diff-results"
				ref={resultsRef}
				tabIndex={-1}
				aria-label={messages.resultsHeading}
				className="flex scroll-mt-28 flex-col gap-6 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:scroll-mt-20"
			>
			<h2 className="sr-only">{messages.resultsHeading}</h2>
			{hasChanges ? (
				<div
					ref={sideBySideContainerRef}
					className={`flex flex-col gap-3 rounded-lg border border-border p-4 ${isSideBySideFullscreen ? 'bg-background' : ''}`}
				>
											{renderNotes()}
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
						<div className="flex flex-wrap items-center gap-2">
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
							<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={handleExportPatch}>
								{messages.x.exportPatch}
							</Button>
							<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={handleCopyPatch}>
								{messages.x.copyPatch}
							</Button>
							<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={handleExportHtml}>
								{messages.x.exportHtml}
							</Button>
							<Button type="button" size="sm" variant="outline" aria-label={`${isSideBySideFullscreen ? messages.exitFullscreen : messages.fullscreen} – ${messages.originalLabel} / ${messages.changedLabel}`} onClick={toggleSideBySideFullscreen}>
								{isSideBySideFullscreen ? messages.exitFullscreen : messages.fullscreen}
							</Button>
						</div>
					</div>

					{/* Side by side on desktop; stacked (Original above Changed) below `md` — two
					    ~180px-wide diff columns are too cramped to read comfortably on a phone,
					    so each gets the full width and its own labeled block instead. */}
					{exportNote && (
						<p role="status" className="text-xs text-muted-foreground">
							{exportNote}
						</p>
					)}
					{viewMode === 'unified' ? (
						<UnifiedDiffView
							rows={unifiedRows}
							wrap={wrapLines}
							scrollRef={unifiedScrollRef}
							activeRowIndex={unifiedHunkStarts[activeHunk] ?? null}
							collapsedLabel={messages.x.collapsedLines}
							ariaLabel={messages.x.unifiedAria}
						/>
					) : (
					<div className="flex flex-col overflow-hidden rounded-md border border-border md:flex-row">
						<div className="flex flex-col md:min-w-0 md:flex-1">
							<span className="border-b border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
								{messages.originalLabel}
							</span>
							<DiffColumn
								entries={viewEntries}
								lineNumbers={viewLeftNumbers}
								collapsedLabel={messages.x.collapsedLines}
								side="left"
								scrollRef={leftColumnRef}
								onScroll={syncDiffScroll(0)}
								activeRowIndex={hunkStartRows[activeHunk] ?? null}
							/>
						</div>
						<div className="h-px bg-border md:hidden" />
						<div className="hidden w-px flex-shrink-0 bg-border md:block" />
						<div className="flex flex-col md:min-w-0 md:flex-1">
							<span className="border-b border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
								{messages.changedLabel}
							</span>
							<DiffColumn
								entries={viewEntries}
								lineNumbers={viewRightNumbers}
								collapsedLabel={messages.x.collapsedLines}
								side="right"
								scrollRef={rightColumnRef}
								onScroll={syncDiffScroll(1)}
								activeRowIndex={hunkStartRows[activeHunk] ?? null}
							/>
						</div>
					</div>
					)}
				</div>
			) : (
				(originalText !== '' || changedText !== '') &&
				!isComputing && (
					<div className="text-sm text-muted-foreground">
						{notes.trailingNewlineDiffers || notes.lineEndingsDiffer ? messages.noLineChangesButNotes : messages.noChanges}
						{renderNotes()}
					</div>
				)
			)}

			{hasChanges && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
					<h2 className="text-sm font-semibold text-foreground">{messages.mergeToolHeading}</h2>
					<div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_2.5rem_1fr]">
						<div ref={mergeLeftContainerRef} className={`flex flex-col gap-2 ${isMergeLeftFullscreen ? 'bg-background p-4' : ''}`}>
							<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
								<span className="text-sm font-medium text-foreground">{messages.mergeLeftHeading}</span>
								<div className="flex gap-1">
									<Button type="button" size="sm" variant="ghost" aria-live="polite" aria-label={messages.copyMergedAria.replace('{{side}}', messages.mergeLeftHeading)} onClick={() => handleCopy('left', mergedLeftText)}>
										{copiedSide === 'left' ? messages.copied : messages.copy}
									</Button>
									<Button type="button" size="sm" variant="ghost" aria-label={messages.saveMergedAria.replace('{{side}}', messages.mergeLeftHeading)} onClick={() => handleSave('left', mergedLeftText)}>
										{messages.save}
									</Button>
									<Button type="button" size="sm" variant="ghost" aria-label={`${isMergeLeftFullscreen ? messages.exitFullscreen : messages.fullscreen} – ${messages.mergeLeftHeading}`} onClick={toggleMergeLeftFullscreen}>
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
									<Button type="button" size="sm" variant="ghost" aria-live="polite" aria-label={messages.copyMergedAria.replace('{{side}}', messages.mergeRightHeading)} onClick={() => handleCopy('right', mergedRightText)}>
										{copiedSide === 'right' ? messages.copied : messages.copy}
									</Button>
									<Button type="button" size="sm" variant="ghost" aria-label={messages.saveMergedAria.replace('{{side}}', messages.mergeRightHeading)} onClick={() => handleSave('right', mergedRightText)}>
										{messages.save}
									</Button>
									<Button type="button" size="sm" variant="ghost" aria-label={`${isMergeRightFullscreen ? messages.exitFullscreen : messages.fullscreen} – ${messages.mergeRightHeading}`} onClick={toggleMergeRightFullscreen}>
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
			</section>
		</div>
	);
}
