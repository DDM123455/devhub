import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RegexMatchGroup, RegexMatchRequest, RegexMatchResponse, RegexWorkerReady } from './regexMatchWorker';
import { useCopyToClipboard } from './useCopyToClipboard';

function CopyButton({
	value,
	label,
	copiedLabel,
	failedLabel,
	ariaLabel,
}: {
	value: string;
	label: string;
	copiedLabel: string;
	failedLabel: string;
	ariaLabel?: string;
}) {
	const { copied, failed, copy } = useCopyToClipboard();
	return (
		<Button aria-live="polite" aria-label={ariaLabel} type="button" size="sm" variant="ghost" disabled={value === ''} onClick={() => void copy(value)}>
			{copied ? copiedLabel : failed ? failedLabel : label}
		</Button>
	);
}

interface Messages {
	patternLabel: string;
	patternPlaceholder: string;
	flagsLabel: string;
	flagGlobal: string;
	flagIgnoreCase: string;
	flagMultiline: string;
	flagDotAll: string;
	flagUnicode: string;
	flagSticky: string;
	testStringLabel: string;
	testStringPlaceholder: string;
	invalidPatternError: string;
	timeoutError: string;
	computingLabel: string;
	highlightedHeading: string;
	matchesHeading: string;
	matchCount: string;
	noMatches: string;
	matchLabel: string;
	fullMatchLabel: string;
	groupLabel: string;
	namedGroupLabel: string;
	indexLabel: string;
	replaceHeading: string;
	replacementLabel: string;
	replacementPlaceholder: string;
	resultLabel: string;
	copy: string;
	copied: string;
	clear: string;
	cheatSheetHeading: string;
	cheat1: string;
	cheat2: string;
	cheat3: string;
	cheat4: string;
	cheat5: string;
	cheat6: string;
	cheat7: string;
	cheat8: string;
	cheat9: string;
	cheat10: string;
	cheat11: string;
	cheat12: string;
	historyHeading: string;
	historyClear: string;
	copyShareLink: string;
	matchCountOne: string;
	matchCountTruncated: string;
	matchCountTruncatedMore: string;
	unicodeHint: string;
	copyFailed: string;
	copyResultAria: string;
	clearAria: string;
}

interface FlagState {
	g: boolean;
	i: boolean;
	m: boolean;
	s: boolean;
	u: boolean;
	y: boolean;
}

const DEFAULT_FLAGS: FlagState = { g: true, i: false, m: false, s: false, u: false, y: false };
const DEBOUNCE_MS = 300;
const WORKER_TIMEOUT_MS = 1500;
const HISTORY_STORAGE_KEY = 'regex-tester-history';
const HISTORY_LIMIT = 10;

interface HistoryEntry {
	pattern: string;
	flags: string;
}

function flagsToString(flags: FlagState): string {
	return (['g', 'i', 'm', 's', 'u', 'y'] as const).filter((f) => flags[f]).join('');
}

function flagsFromString(value: string): FlagState {
	return {
		g: value.includes('g'),
		i: value.includes('i'),
		m: value.includes('m'),
		s: value.includes('s'),
		u: value.includes('u'),
		y: value.includes('y'),
	};
}

function loadHistory(): HistoryEntry[] {
	try {
		const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(entry): entry is HistoryEntry => typeof entry?.pattern === 'string' && typeof entry?.flags === 'string',
		);
	} catch {
		return [];
	}
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

export default function RegexTester({ messages }: { messages: Messages }) {
	const [pattern, setPattern] = useState('');
	const [flags, setFlags] = useState<FlagState>(DEFAULT_FLAGS);
	const [testString, setTestString] = useState('');
	const [replacement, setReplacement] = useState('');

	const selectedFlags = flagsToString(flags);

	// `window` doesn't exist during Astro's build-time SSR pass, so this stays
	// empty on that first pre-render and fills in once hydrated in the browser
	// (same guard used in JwtDecoder.tsx's share-link feature).
	const shareLink =
		typeof window !== 'undefined' && pattern.trim() !== ''
			? `${window.location.origin}${window.location.pathname}#${new URLSearchParams({
					pattern,
					flags: selectedFlags,
					test: testString,
					replacement,
				}).toString()}`
			: '';

	const debouncedPattern = useDebouncedValue(pattern, DEBOUNCE_MS);
	const debouncedFlags = useDebouncedValue(selectedFlags, DEBOUNCE_MS);
	const debouncedTestString = useDebouncedValue(testString, DEBOUNCE_MS);
	const debouncedReplacement = useDebouncedValue(replacement, DEBOUNCE_MS);

	const [matches, setMatches] = useState<RegexMatchGroup[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [countCapped, setCountCapped] = useState(false);
	const [resultText, setResultText] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [replaceResult, setReplaceResult] = useState<string | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

	const workerRef = useRef<Worker | null>(null);
	const requestIdRef = useRef(0);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Mirrors regex101/RegExr's URL-state sharing: read a link's pattern/flags/
	// test string once on mount. One-way import, not a synced URL — typing
	// doesn't rewrite the address bar (same reasoning as JWT Decoder's `?token=`).
	useEffect(() => {
		// Hash first (current share links; never sent to a server); legacy ?query links still load.
		const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
		const params = hashParams.has('pattern') ? hashParams : new URLSearchParams(window.location.search);
		const urlPattern = params.get('pattern');
		if (urlPattern === null) return;
		setPattern(urlPattern);
		setFlags(flagsFromString(params.get('flags') ?? ''));
		setTestString(params.get('test') ?? '');
		setReplacement(params.get('replacement') ?? '');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// History only records a pattern the user has settled on (pattern field blurred) AND that
	// compiled without error — not every intermediate keystroke state. The state update and the
	// localStorage write are separate steps (no side effects inside the setState updater).
	const saveToHistory = (patternValue: string, flagsValue: string) => {
		if (patternValue.trim() === '') return;
		const next = [
			{ pattern: patternValue, flags: flagsValue },
			...history.filter((entry) => !(entry.pattern === patternValue && entry.flags === flagsValue)),
		].slice(0, HISTORY_LIMIT);
		setHistory(next);
		try {
			localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
		} catch {
			// Ignore quota/private-mode errors — history is a convenience, not core functionality.
		}
	};

	const visibleError = pattern === '' ? null : error;
	const needsUnicodeHint = !flags.u && /\\[pP]\{/.test(pattern);
	const matchCountText =
		totalCount === 1
			? messages.matchCountOne
			: matches.length < totalCount || countCapped
				? (countCapped ? messages.matchCountTruncatedMore : messages.matchCountTruncated)
						.replace('{{shown}}', String(matches.length))
						.replace('{{total}}', String(totalCount))
				: messages.matchCount.replace('{{count}}', String(totalCount));

	const handleLoadHistoryEntry = (entry: HistoryEntry) => {
		setPattern(entry.pattern);
		setFlags(flagsFromString(entry.flags));
	};

	const handleClearHistory = () => {
		setHistory([]);
		try {
			localStorage.removeItem(HISTORY_STORAGE_KEY);
		} catch {
			// Ignore — same reasoning as above.
		}
	};

	const stopWorker = () => {
		workerRef.current?.terminate();
		workerRef.current = null;
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	};

	useEffect(() => stopWorker, []);

	// Runs matching in a dedicated Web Worker with a hard timeout: a pattern with
	// catastrophic backtracking runs synchronously forever, and only terminating the
	// worker thread can actually stop it — a main-thread try/catch cannot. The timeout is
	// armed only AFTER the worker reports `ready`, so slow worker start-up (cold cache,
	// busy machine) is never mistaken for a runaway pattern.
	useEffect(() => {
		stopWorker();

		if (debouncedPattern === '') {
			setMatches([]);
			setTotalCount(0);
			setCountCapped(false);
			setError(null);
			setReplaceResult(null);
			setIsRunning(false);
			return;
		}

		const requestId = ++requestIdRef.current;
		setIsRunning(true);

		const worker = new Worker(new URL('./regexMatchWorker.ts', import.meta.url), { type: 'module' });
		workerRef.current = worker;

		const request: RegexMatchRequest = {
			requestId,
			pattern: debouncedPattern,
			flags: debouncedFlags,
			testString: debouncedTestString,
			replacement: debouncedReplacement,
		};

		worker.onmessage = (event: MessageEvent<RegexMatchResponse | RegexWorkerReady>) => {
			if ('ready' in event.data) {
				if (requestId !== requestIdRef.current) return;
				worker.postMessage(request);
				timeoutRef.current = setTimeout(() => {
					if (requestId !== requestIdRef.current) return;
					stopWorker();
					setIsRunning(false);
					setError(messages.timeoutError);
					setMatches([]);
					setTotalCount(0);
					setReplaceResult(null);
				}, WORKER_TIMEOUT_MS);
				return;
			}
			if (event.data.requestId !== requestIdRef.current) return;
			stopWorker();
			setIsRunning(false);
			if (event.data.error) {
				setError(messages.invalidPatternError.replace('{{message}}', event.data.error));
				setMatches([]);
				setTotalCount(0);
				setReplaceResult(null);
			} else {
				setError(null);
				setMatches(event.data.matches);
				setTotalCount(event.data.totalCount);
				setCountCapped(event.data.countCapped);
				setReplaceResult(event.data.replaceResult);
				// The matches belong to THIS text — highlighting must not pair them with newer text.
				setResultText(request.testString);
			}
		};
		worker.onerror = () => {
			if (requestId !== requestIdRef.current) return;
			stopWorker();
			setIsRunning(false);
			setError(messages.invalidPatternError.replace('{{message}}', 'worker error'));
			setMatches([]);
			setTotalCount(0);
			setReplaceResult(null);
		};

		return stopWorker;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedPattern, debouncedFlags, debouncedTestString, debouncedReplacement]);

	const segments = useMemo(() => {
		if (debouncedPattern === '' || error) return null;
		const parts: { text: string; isMatch: boolean }[] = [];
		let lastIndex = 0;
		for (const m of matches) {
			if (m.index < lastIndex || m.index > resultText.length) continue;
			if (m.index > lastIndex) parts.push({ text: resultText.slice(lastIndex, m.index), isMatch: false });
			if (m.fullMatch.length > 0) {
				parts.push({ text: m.fullMatch, isMatch: true });
				lastIndex = m.index + m.fullMatch.length;
			} else {
				lastIndex = m.index;
			}
		}
		if (lastIndex < resultText.length) parts.push({ text: resultText.slice(lastIndex), isMatch: false });
		return parts;
	}, [matches, resultText, debouncedPattern, error]);

	const flagCheckbox = (key: keyof FlagState, label: string) => (
		<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
			<input
				type="checkbox"
				checked={flags[key]}
				onChange={(e) => setFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
			/>
			<span className="font-mono">{key}</span> {label}
		</label>
	);

	const cheatItems = [
		messages.cheat1,
		messages.cheat2,
		messages.cheat3,
		messages.cheat4,
		messages.cheat5,
		messages.cheat6,
		messages.cheat7,
		messages.cheat8,
		messages.cheat9,
		messages.cheat10,
		messages.cheat11,
		messages.cheat12,
	];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<div className="flex flex-col gap-1">
					<label htmlFor="regex-pattern" className="text-sm font-medium text-foreground">
						{messages.patternLabel}
					</label>
					<div className="flex items-center gap-1 rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground">
						<span className="text-muted-foreground">/</span>
						<input
							id="regex-pattern"
							type="text"
							value={pattern}
							onChange={(e) => setPattern(e.target.value)}
							onBlur={() => {
								if (!error && pattern === debouncedPattern) saveToHistory(pattern, selectedFlags);
							}}
							aria-invalid={visibleError ? true : undefined}
							aria-describedby={visibleError ? 'regex-error' : undefined}
							placeholder={messages.patternPlaceholder}
							spellCheck={false}
							className="w-full bg-transparent py-2 outline-none"
						/>
						<span className="text-muted-foreground">/{selectedFlags}</span>
					</div>
				</div>

				<div className="flex flex-col gap-1">
					<span className="text-sm font-medium text-foreground">{messages.flagsLabel}</span>
					<div className="flex flex-wrap gap-4">
						{flagCheckbox('g', messages.flagGlobal)}
						{flagCheckbox('i', messages.flagIgnoreCase)}
						{flagCheckbox('m', messages.flagMultiline)}
						{flagCheckbox('s', messages.flagDotAll)}
						{flagCheckbox('u', messages.flagUnicode)}
						{flagCheckbox('y', messages.flagSticky)}
					</div>
				</div>

				<div className="flex flex-col gap-1">
					<label htmlFor="regex-test-string" className="text-sm font-medium text-foreground">
						{messages.testStringLabel}
					</label>
					<textarea
						id="regex-test-string"
						value={testString}
						onChange={(e) => setTestString(e.target.value)}
						placeholder={messages.testStringPlaceholder}
						rows={6}
						spellCheck={false}
						className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
					/>
				</div>

				{visibleError && (
					<p id="regex-error" role="alert" className="text-sm text-destructive">
						{visibleError}
					</p>
				)}
				{needsUnicodeHint && <p className="text-xs text-amber-700 dark:text-amber-400">{messages.unicodeHint}</p>}
				{isRunning && <p role="status" className="text-xs text-muted-foreground">{messages.computingLabel}</p>}

				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						aria-label={messages.clearAria}
						onClick={() => {
							setPattern('');
							setTestString('');
							setReplacement('');
						}}
					>
						{messages.clear}
					</Button>
					{pattern.trim() !== '' && (
						<CopyButton value={shareLink} label={messages.copyShareLink} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
					)}
				</div>

				{history.length > 0 && (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center justify-between">
							<span className="text-xs font-medium text-muted-foreground">{messages.historyHeading}</span>
							<Button type="button" size="sm" variant="ghost" onClick={handleClearHistory}>
								{messages.historyClear}
							</Button>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{history.map((entry, i) => (
								<button
									key={`${entry.pattern}-${entry.flags}-${i}`}
									type="button"
									onClick={() => handleLoadHistoryEntry(entry)}
									className="rounded-md border border-border px-2 py-1 font-mono text-xs text-foreground hover:bg-muted"
									title={`/${entry.pattern}/${entry.flags}`}
								>
									/{entry.pattern.length > 24 ? `${entry.pattern.slice(0, 24)}…` : entry.pattern}/{entry.flags}
								</button>
							))}
						</div>
					</div>
				)}
			</div>

			{segments && resultText !== '' && (
				<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
					<span className="text-sm font-medium text-foreground">{messages.highlightedHeading}</span>
					<pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
						{segments.map((part, i) =>
							part.isMatch ? (
								<mark key={i} className="rounded bg-primary/30 text-foreground">
									{part.text}
								</mark>
							) : (
								<span key={i}>{part.text}</span>
							),
						)}
					</pre>
				</div>
			)}

			{debouncedPattern !== '' && !error && (
				<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
					<span className="text-sm font-medium text-foreground">
						{messages.matchesHeading} —{' '}
						{totalCount > 0 ? matchCountText : messages.noMatches}
					</span>
					{matches.length > 0 && (
						<ul className="flex max-h-[32rem] flex-col gap-3 overflow-auto">
							{matches.map((m, i) => (
								<li key={i} className="rounded-md border border-border p-3 text-xs">
									<div className="font-medium text-foreground">
										{messages.matchLabel.replace('{{index}}', String(i + 1))}
									</div>
									<div className="mt-1 font-mono text-muted-foreground">
										{messages.fullMatchLabel}: <span className="text-foreground">{m.fullMatch}</span>{' '}
										({messages.indexLabel}: {m.index})
									</div>
									{m.groups.map((group, gi) =>
										group === undefined ? null : (
											<div key={gi} className="mt-0.5 font-mono text-muted-foreground">
												{messages.groupLabel.replace('{{index}}', String(gi + 1))}:{' '}
												<span className="text-foreground">{group}</span>
											</div>
										),
									)}
									{m.namedGroups &&
										Object.entries(m.namedGroups).map(([name, value]) =>
											value === undefined ? null : (
												<div key={name} className="mt-0.5 font-mono text-muted-foreground">
													{messages.namedGroupLabel.replace('{{name}}', name)}:{' '}
													<span className="text-foreground">{value}</span>
												</div>
											),
										)}
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			{debouncedPattern !== '' && !error && (
				<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
					<span className="text-sm font-medium text-foreground">{messages.replaceHeading}</span>
					<div className="flex flex-col gap-1">
						<label htmlFor="regex-replacement" className="text-xs text-muted-foreground">
							{messages.replacementLabel}
						</label>
						<input
							id="regex-replacement"
							type="text"
							value={replacement}
							onChange={(e) => setReplacement(e.target.value)}
							placeholder={messages.replacementPlaceholder}
							spellCheck={false}
							className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
						/>
					</div>
					{replaceResult !== null && (
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between">
								<span className="text-xs text-muted-foreground">{messages.resultLabel}</span>
								<CopyButton value={replaceResult} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} ariaLabel={messages.copyResultAria} />
							</div>
							<textarea
								readOnly
								value={replaceResult}
								rows={4}
								className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground"
							/>
						</div>
					)}
				</div>
			)}

			<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.cheatSheetHeading}</span>
				<ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
					{cheatItems.map((item, i) => (
						<li key={i} className="font-mono">
							{item}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
