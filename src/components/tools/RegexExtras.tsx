import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CODEGEN_LANGUAGES, generateRegexCode, type CodegenLanguage } from '@/lib/regex-codegen';
import { explainRegex } from '@/lib/regex-explain';
import { REGEX_LIBRARY, type RegexLibraryEntry } from '@/lib/regex-library';
import { useCopyToClipboard } from './useCopyToClipboard';

export interface RegexExtraMessages {
	engineNote: string;
	flagHasIndices: string;
	flagUnicodeSets: string;
	flagUnsupported: string;
	explainHeading: string;
	explainEmpty: string;
	explain: Record<string, string>;
	libraryHeading: string;
	libraryHint: string;
	lib: Record<string, string>;
	codeHeading: string;
	codeLanguage: string;
	codeNote: string;
	codeEmpty: string;
	testsHeading: string;
	testsHelp: string;
	testsPlaceholder: string;
	testsSummary: string;
	testPass: string;
	testFail: string;
	testExpectMatch: string;
	testExpectNoMatch: string;
	testRunning: string;
	indicesLabel: string;
	copy: string;
	copied: string;
	copyFailed: string;
}

const LANGUAGE_LABELS: Record<CodegenLanguage, string> = {
	javascript: 'JavaScript',
	python: 'Python',
	php: 'PHP',
	go: 'Go',
	java: 'Java',
	csharp: 'C#',
	ruby: 'Ruby',
};

export function RegexExplainPanel({ pattern, messages }: { pattern: string; messages: RegexExtraMessages }) {
	const items = useMemo(() => (pattern === '' ? [] : explainRegex(pattern)), [pattern]);
	return (
		<details className="rounded-lg border border-border p-4" open>
			<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.explainHeading}</summary>
			{items.length === 0 ? (
				<p className="mt-2 text-xs text-muted-foreground">{messages.explainEmpty}</p>
			) : (
				<ul className="mt-3 flex max-h-96 flex-col gap-1 overflow-auto text-xs">
					{items.map((item, index) => {
						const template = messages.explain[item.kind] ?? item.kind;
						const text = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => item.args?.[key] ?? '');
						return (
							<li
								key={index}
								className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
								style={{ paddingInlineStart: `${Math.min(item.depth, 8) * 16}px` }}
							>
								<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground [overflow-wrap:anywhere]">{item.token}</code>
								<span className="text-muted-foreground [overflow-wrap:anywhere]">{text}</span>
							</li>
						);
					})}
				</ul>
			)}
		</details>
	);
}

export function RegexLibraryPanel({
	messages,
	onPick,
}: {
	messages: RegexExtraMessages;
	onPick: (entry: RegexLibraryEntry) => void;
}) {
	return (
		<details className="rounded-lg border border-border p-4">
			<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.libraryHeading}</summary>
			<p className="mt-2 text-xs text-muted-foreground">{messages.libraryHint}</p>
			<div className="mt-2 flex flex-wrap gap-2">
				{REGEX_LIBRARY.map((entry) => (
					<button
						key={entry.id}
						type="button"
						onClick={() => onPick(entry)}
						className="min-h-9 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
					>
						{messages.lib[entry.id] ?? entry.id}
					</button>
				))}
			</div>
		</details>
	);
}

export function RegexCodePanel({
	pattern,
	flags,
	replacement,
	messages,
}: {
	pattern: string;
	flags: string;
	replacement: string;
	messages: RegexExtraMessages;
}) {
	const [language, setLanguage] = useState<CodegenLanguage>('javascript');
	const { copied, failed, copy } = useCopyToClipboard();
	const code = useMemo(() => (pattern === '' ? '' : generateRegexCode(language, pattern, flags, replacement)), [language, pattern, flags, replacement]);
	return (
		<details className="rounded-lg border border-border p-4">
			<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.codeHeading}</summary>
			<div className="mt-3 flex flex-col gap-2">
				<label className="flex items-center gap-2 text-sm text-foreground">
					{messages.codeLanguage}
					<select
						value={language}
						onChange={(e) => setLanguage(e.target.value as CodegenLanguage)}
						className="min-h-9 rounded-md border border-border bg-background px-2 text-sm"
					>
						{CODEGEN_LANGUAGES.map((lang) => (
							<option key={lang} value={lang}>
								{LANGUAGE_LABELS[lang]}
							</option>
						))}
					</select>
				</label>
				{code === '' ? (
					<p className="text-xs text-muted-foreground">{messages.codeEmpty}</p>
				) : (
					<>
						<textarea
							readOnly
							value={code}
							rows={Math.min(14, code.split('\n').length + 1)}
							spellCheck={false}
							aria-label={messages.codeHeading}
							className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground"
						/>
						<div>
							<Button type="button" size="sm" variant="outline" className="min-h-9" aria-live="polite" onClick={() => void copy(code)}>
								{copied ? messages.copied : failed ? messages.copyFailed : messages.copy}
							</Button>
						</div>
					</>
				)}
				<p className="text-xs text-muted-foreground">{messages.codeNote}</p>
			</div>
		</details>
	);
}
