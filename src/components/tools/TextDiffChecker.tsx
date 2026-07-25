import { useMemo, useRef, useState, type UIEvent } from 'react';
import { diffWords, diffLines, type Change, type DiffLinesOptionsNonabortable } from 'diff';
import { Button } from '@/components/ui/button';

interface Messages {
	originalLabel: string;
	changedLabel: string;
	compare: string;
	modeWord: string;
	modeLine: string;
	noChanges: string;
	placeholder: string;
	ignoreWhitespace: string;
	ignoreCase: string;
	statsAdded: string;
	statsRemoved: string;
	statsModified: string;
}

type DiffMode = 'word' | 'line';

interface ChangeStats {
	added: number;
	removed: number;
	modified: number;
}

// A removed run immediately followed by an added run is treated as one "modified"
// block (up to the shorter run's token count) rather than as an unrelated delete +
// insert — this is what a human would call "changed" when reading a diff, even
// though the underlying diff algorithm only knows about pure adds/removes.
function summarizeChanges(parts: Change[]): ChangeStats {
	let added = 0;
	let removed = 0;
	let modified = 0;
	let i = 0;
	while (i < parts.length) {
		const part = parts[i];
		const next = parts[i + 1];
		if (part.removed && next?.added) {
			const pair = Math.min(part.count, next.count);
			modified += pair;
			removed += part.count - pair;
			added += next.count - pair;
			i += 2;
			continue;
		}
		if (part.added) added += part.count;
		else if (part.removed) removed += part.count;
		i += 1;
	}
	return { added, removed, modified };
}

export default function TextDiffChecker({ messages }: { messages: Messages }) {
	const [originalText, setOriginalText] = useState('');
	const [changedText, setChangedText] = useState('');
	const [mode, setMode] = useState<DiffMode>('word');
	const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
	const [ignoreCase, setIgnoreCase] = useState(false);
	const [result, setResult] = useState<Change[] | null>(null);

	const leftPaneRef = useRef<HTMLDivElement>(null);
	const rightPaneRef = useRef<HTMLDivElement>(null);
	const isSyncingScrollRef = useRef(false);

	const handleCompare = () => {
		if (mode === 'word') {
			setResult(diffWords(originalText, changedText, { ignoreCase }));
			return;
		}
		// diffLines' TS type doesn't list `ignoreCase`, but jsdiff's shared base
		// Diff.equals() checks options.ignoreCase regardless of diff granularity, so
		// it works identically to the word-mode case at runtime.
		const lineOptions: DiffLinesOptionsNonabortable & { ignoreCase?: boolean } = {
			ignoreWhitespace,
			ignoreCase,
		};
		setResult(diffLines(originalText, changedText, lineOptions));
	};

	const hasChanges = useMemo(() => {
		if (!result) return false;
		return result.some((part) => part.added || part.removed);
	}, [result]);

	const stats = useMemo(() => (result ? summarizeChanges(result) : null), [result]);

	const handlePaneScroll = (source: 'left' | 'right') => (event: UIEvent<HTMLDivElement>) => {
		if (isSyncingScrollRef.current) {
			isSyncingScrollRef.current = false;
			return;
		}
		const targetEl = source === 'left' ? rightPaneRef.current : leftPaneRef.current;
		if (!targetEl) return;
		isSyncingScrollRef.current = true;
		targetEl.scrollTop = event.currentTarget.scrollTop;
		targetEl.scrollLeft = event.currentTarget.scrollLeft;
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<label htmlFor="text-diff-original" className="text-sm font-medium text-foreground">
						{messages.originalLabel}
					</label>
					<textarea
						id="text-diff-original"
						value={originalText}
						onChange={(event) => setOriginalText(event.target.value)}
						placeholder={messages.placeholder}
						rows={12}
						className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="text-diff-changed" className="text-sm font-medium text-foreground">
						{messages.changedLabel}
					</label>
					<textarea
						id="text-diff-changed"
						value={changedText}
						onChange={(event) => setChangedText(event.target.value)}
						placeholder={messages.placeholder}
						rows={12}
						className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					/>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-3 text-sm text-foreground">
					<label className="flex cursor-pointer items-center gap-1.5">
						<input
							type="radio"
							name="text-diff-mode"
							value="word"
							checked={mode === 'word'}
							onChange={() => setMode('word')}
						/>
						{messages.modeWord}
					</label>
					<label className="flex cursor-pointer items-center gap-1.5">
						<input
							type="radio"
							name="text-diff-mode"
							value="line"
							checked={mode === 'line'}
							onChange={() => setMode('line')}
						/>
						{messages.modeLine}
					</label>
				</div>
				<div className="flex items-center gap-3 text-sm text-foreground">
					<label className="flex cursor-pointer items-center gap-1.5">
						<input
							type="checkbox"
							checked={ignoreWhitespace}
							onChange={(event) => setIgnoreWhitespace(event.target.checked)}
						/>
						{messages.ignoreWhitespace}
					</label>
					<label className="flex cursor-pointer items-center gap-1.5">
						<input
							type="checkbox"
							checked={ignoreCase}
							onChange={(event) => setIgnoreCase(event.target.checked)}
						/>
						{messages.ignoreCase}
					</label>
				</div>
				<Button type="button" onClick={handleCompare}>
					{messages.compare}
				</Button>
			</div>

			{result &&
				(hasChanges ? (
					<div className="flex flex-col gap-3">
						{stats && (
							<div className="flex flex-wrap gap-2 text-xs font-medium">
								<span className="rounded bg-green-500/15 px-2 py-1 text-green-700 dark:text-green-300">
									{messages.statsAdded.replace('{{count}}', String(stats.added))}
								</span>
								<span className="rounded bg-red-500/15 px-2 py-1 text-red-700 dark:text-red-300">
									{messages.statsRemoved.replace('{{count}}', String(stats.removed))}
								</span>
								<span className="rounded bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-300">
									{messages.statsModified.replace('{{count}}', String(stats.modified))}
								</span>
							</div>
						)}
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<span className="text-sm font-medium text-foreground">{messages.originalLabel}</span>
								<div
									ref={leftPaneRef}
									onScroll={handlePaneScroll('left')}
									className="h-72 overflow-auto rounded-md border border-border bg-background p-3"
								>
									<pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
										{result
											.filter((part) => !part.added)
											.map((part, index) =>
												part.removed ? (
													<span
														key={index}
														className="bg-red-500/20 text-red-800 line-through dark:text-red-300"
													>
														{part.value}
													</span>
												) : (
													<span key={index}>{part.value}</span>
												),
											)}
									</pre>
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<span className="text-sm font-medium text-foreground">{messages.changedLabel}</span>
								<div
									ref={rightPaneRef}
									onScroll={handlePaneScroll('right')}
									className="h-72 overflow-auto rounded-md border border-border bg-background p-3"
								>
									<pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
										{result
											.filter((part) => !part.removed)
											.map((part, index) =>
												part.added ? (
													<span key={index} className="bg-green-500/20 text-green-800 dark:text-green-300">
														{part.value}
													</span>
												) : (
													<span key={index}>{part.value}</span>
												),
											)}
									</pre>
								</div>
							</div>
						</div>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">{messages.noChanges}</p>
				))}
		</div>
	);
}
