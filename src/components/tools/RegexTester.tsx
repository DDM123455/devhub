import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

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

function flagsToString(flags: FlagState): string {
	return (['g', 'i', 'm', 's', 'u', 'y'] as const).filter((f) => flags[f]).join('');
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

	const { matches, error, segments } = useMemo(() => {
		if (pattern === '') return { matches: [] as RegExpMatchArray[], error: null as string | null, segments: null };
		const displayFlags = selectedFlags.includes('g') ? selectedFlags : selectedFlags + 'g';
		try {
			const displayRegex = new RegExp(pattern, displayFlags);
			const found = [...testString.matchAll(displayRegex)];
			const parts: { text: string; isMatch: boolean }[] = [];
			let lastIndex = 0;
			for (const m of found) {
				if (m.index === undefined) continue;
				if (m.index > lastIndex) parts.push({ text: testString.slice(lastIndex, m.index), isMatch: false });
				parts.push({ text: m[0], isMatch: true });
				lastIndex = m.index + m[0].length;
				if (m[0].length === 0) lastIndex++;
			}
			if (lastIndex < testString.length) parts.push({ text: testString.slice(lastIndex), isMatch: false });
			return { matches: found, error: null as string | null, segments: parts };
		} catch (err) {
			return {
				matches: [] as RegExpMatchArray[],
				error: messages.invalidPatternError.replace('{{message}}', (err as Error).message),
				segments: null,
			};
		}
	}, [pattern, selectedFlags, testString, messages.invalidPatternError]);

	const replaceResult = useMemo(() => {
		if (pattern === '' || error) return null;
		try {
			const regex = new RegExp(pattern, selectedFlags);
			return testString.replace(regex, replacement);
		} catch {
			return null;
		}
	}, [pattern, selectedFlags, testString, replacement, error]);

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

				{error && <p className="text-sm text-destructive">{error}</p>}

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

			{segments && testString !== '' && (
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

			{pattern !== '' && !error && (
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
										{messages.fullMatchLabel}: <span className="text-foreground">{m[0]}</span>{' '}
										({messages.indexLabel}: {m.index})
									</div>
									{m.slice(1).map((group, gi) =>
										group === undefined ? null : (
											<div key={gi} className="mt-0.5 font-mono text-muted-foreground">
												{messages.groupLabel.replace('{{index}}', String(gi + 1))}:{' '}
												<span className="text-foreground">{group}</span>
											</div>
										),
									)}
									{m.groups &&
										Object.entries(m.groups).map(([name, value]) =>
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

			{pattern !== '' && !error && (
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
