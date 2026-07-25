import { useMemo, useState } from 'react';
import { diffWords, diffLines, type Change } from 'diff';
import { Button } from '@/components/ui/button';

interface Messages {
	originalLabel: string;
	changedLabel: string;
	compare: string;
	modeWord: string;
	modeLine: string;
	noChanges: string;
	placeholder: string;
}

type DiffMode = 'word' | 'line';

export default function TextDiffChecker({ messages }: { messages: Messages }) {
	const [originalText, setOriginalText] = useState('');
	const [changedText, setChangedText] = useState('');
	const [mode, setMode] = useState<DiffMode>('word');
	const [result, setResult] = useState<Change[] | null>(null);

	const handleCompare = () => {
		const parts =
			mode === 'word' ? diffWords(originalText, changedText) : diffLines(originalText, changedText);
		setResult(parts);
	};

	const hasChanges = useMemo(() => {
		if (!result) return false;
		return result.some((part) => part.added || part.removed);
	}, [result]);

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
				<Button type="button" onClick={handleCompare}>
					{messages.compare}
				</Button>
			</div>

			{result && (
				<div className="rounded-md border border-border p-3">
					{hasChanges ? (
						<pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
							{result.map((part, index) => {
								if (part.added) {
									return (
										<span key={index} className="bg-green-500/20 text-green-800 dark:text-green-300">
											{part.value}
										</span>
									);
								}
								if (part.removed) {
									return (
										<span
											key={index}
											className="bg-red-500/20 text-red-800 line-through dark:text-red-300"
										>
											{part.value}
										</span>
									);
								}
								return <span key={index}>{part.value}</span>;
							})}
						</pre>
					) : (
						<p className="text-sm text-muted-foreground">{messages.noChanges}</p>
					)}
				</div>
			)}
		</div>
	);
}
