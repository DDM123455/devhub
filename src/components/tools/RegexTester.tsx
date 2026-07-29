import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RegexMatchGroup, RegexMatchRequest, RegexMatchResponse } from './regexMatchWorker';

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

function flagsToString(flags: FlagState): string {
	return (['g', 'i', 'm', 's', 'u', 'y'] as const).filter((f) => flags[f]).join('');
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			disabled={value === ''}
			onClick={() => {
				void navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? copiedLabel : label}
		</Button>
	);
}

export default function RegexTester({ messages }: { messages: Messages }) {
	const [pattern, setPattern] = useState('');
	const [flags, setFlags] = useState<FlagState>(DEFAULT_FLAGS);
	const [testString, setTestString] = useState('');
	const [replacement, setReplacement] = useState('');

	const selectedFlags = flagsToString(flags);

	const debouncedPattern = useDebouncedValue(pattern, DEBOUNCE_MS);
	const debouncedFlags = useDebouncedValue(selectedFlags, DEBOUNCE_MS);
	const debouncedTestString = useDebouncedValue(testString, DEBOUNCE_MS);
	const debouncedReplacement = useDebouncedValue(replacement, DEBOUNCE_MS);

	const [matches, setMatches] = useState<RegexMatchGroup[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [replaceResult, setReplaceResult] = useState<string | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	const workerRef = useRef<Worker | null>(null);
	const requestIdRef = useRef(0);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
	// worker thread can actually stop it — a main-thread try/catch cannot.
	useEffect(() => {
		stopWorker();

		if (debouncedPattern === '') {
			setMatches([]);
			setError(null);
			setReplaceResult(null);
			setIsRunning(false);
			return;
		}

		const requestId = ++requestIdRef.current;
		setIsRunning(true);

		const worker = new Worker(new URL('./regexMatchWorker.ts', import.meta.url), { type: 'module' });
		workerRef.current = worker;

		worker.onmessage = (event: MessageEvent<RegexMatchResponse>) => {
			if (event.data.requestId !== requestIdRef.current) return;
			stopWorker();
			setIsRunning(false);
			if (event.data.error) {
				setError(messages.invalidPatternError.replace('{{message}}', event.data.error));
				setMatches([]);
				setReplaceResult(null);
			} else {
				setError(null);
				setMatches(event.data.matches);
				setReplaceResult(event.data.replaceResult);
			}
		};
		worker.onerror = () => {
			if (requestId !== requestIdRef.current) return;
			stopWorker();
			setIsRunning(false);
			setError(messages.invalidPatternError.replace('{{message}}', 'worker error'));
			setMatches([]);
			setReplaceResult(null);
		};

		const request: RegexMatchRequest = {
			requestId,
			pattern: debouncedPattern,
			flags: debouncedFlags,
			testString: debouncedTestString,
			replacement: debouncedReplacement,
		};
		worker.postMessage(request);

		timeoutRef.current = setTimeout(() => {
			if (requestId !== requestIdRef.current) return;
			stopWorker();
			setIsRunning(false);
			setError(messages.timeoutError);
			setMatches([]);
			setReplaceResult(null);
		}, WORKER_TIMEOUT_MS);

		return stopWorker;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedPattern, debouncedFlags, debouncedTestString, debouncedReplacement]);

	const segments = useMemo(() => {
		if (debouncedPattern === '' || error) return null;
		const parts: { text: string; isMatch: boolean }[] = [];
		let lastIndex = 0;
		for (const m of matches) {
			if (m.index > lastIndex) parts.push({ text: debouncedTestString.slice(lastIndex, m.index), isMatch: false });
			if (m.fullMatch.length > 0) {
				parts.push({ text: m.fullMatch, isMatch: true });
				lastIndex = m.index + m.fullMatch.length;
			} else {
				lastIndex = m.index;
			}
		}
		if (lastIndex < debouncedTestString.length) parts.push({ text: debouncedTestString.slice(lastIndex), isMatch: false });
		return parts;
	}, [matches, debouncedTestString, debouncedPattern, error]);

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

				{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
				{isRunning && <p role="status" className="text-xs text-muted-foreground">{messages.computingLabel}</p>}

				<div>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => {
							setPattern('');
							setTestString('');
							setReplacement('');
						}}
					>
						{messages.clear}
					</Button>
				</div>
			</div>

			{segments && debouncedTestString !== '' && (
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
						{matches.length > 0
							? messages.matchCount.replace('{{count}}', String(matches.length))
							: messages.noMatches}
					</span>
					{matches.length > 0 && (
						<ul className="flex flex-col gap-3">
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
								<CopyButton value={replaceResult} label={messages.copy} copiedLabel={messages.copied} />
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
