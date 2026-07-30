import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Messages {
	placeholder: string;
	outputLabel: string;
	caseUpper: string;
	caseLower: string;
	caseTitle: string;
	caseCamel: string;
	caseSnake: string;
	caseSentence: string;
	caseAlternating: string;
	caseInverse: string;
	caseOptionsHeading: string;
	utilRemoveSpaces: string;
	utilRemoveLineBreaks: string;
	utilSortLines: string;
	utilitiesHeading: string;
	copy: string;
	copied: string;
	clear: string;
	outputStats: string;
	uploadFile: string;
	downloadFile: string;
}

type CaseMode =
	| 'upper'
	| 'lower'
	| 'title'
	| 'camel'
	| 'snake'
	| 'sentence'
	| 'alternating'
	| 'inverse'
	| 'removeSpaces'
	| 'removeLineBreaks'
	| 'sortLines';

// Normalizes any mix of spaces, hyphens, underscores, punctuation, and
// existing camelCase/PascalCase boundaries into a flat list of lowercase-able
// word tokens, so camelCase/snake_case conversion works whether the input is
// "hello world", "hello-world", or already "helloWorld".
// Short articles/conjunctions/prepositions that AP/Chicago-style title case
// convention (and ConvertCase.net, the benchmark for this tool) leaves
// lowercase — except when one starts or ends the title, which always stays
// capitalized regardless of this list.
const TITLE_CASE_MINOR_WORDS = new Set([
	'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet',
]);

function titleCase(text: string): string {
	const matchCount = (text.match(/\w\S*/g) ?? []).length;
	if (matchCount === 0) return text;
	const lastWordIndex = matchCount - 1;
	let wordIndex = -1;
	return text.replace(/\w\S*/g, (word) => {
		wordIndex++;
		const bareWord = word.toLowerCase().replace(/[^a-z']/g, '');
		const isMinorWord = TITLE_CASE_MINOR_WORDS.has(bareWord);
		if (isMinorWord && wordIndex !== 0 && wordIndex !== lastWordIndex) {
			return word.toLowerCase();
		}
		return word[0].toUpperCase() + word.slice(1).toLowerCase();
	});
}

function splitWords(text: string): string[] {
	const withSpaces = text
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
	return withSpaces.split(/[^a-zA-Z0-9]+/).filter(Boolean);
}

function convertCase(text: string, mode: CaseMode): string {
	switch (mode) {
		case 'upper':
			return text.toUpperCase();
		case 'lower':
			return text.toLowerCase();
		case 'title':
			return titleCase(text);
		case 'camel':
			return splitWords(text)
				.map((word, index) =>
					index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
				)
				.join('');
		case 'snake':
			return splitWords(text)
				.map((word) => word.toLowerCase())
				.join('_');
		case 'sentence': {
			const lower = text.toLowerCase();
			return lower.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (match) => match.toUpperCase());
		}
		case 'alternating': {
			let letterIndex = 0;
			return text
				.split('')
				.map((char) => {
					const upper = char.toUpperCase();
					const lower = char.toLowerCase();
					if (upper === lower) return char; // not a cased letter, don't advance the counter
					const result = letterIndex % 2 === 0 ? lower : upper;
					letterIndex++;
					return result;
				})
				.join('');
		}
		case 'inverse':
			return text
				.split('')
				.map((char) => {
					const upper = char.toUpperCase();
					const lower = char.toLowerCase();
					if (upper === lower) return char;
					return char === upper ? lower : upper;
				})
				.join('');
		case 'removeSpaces':
			return text
				.replace(/\r\n/g, '\n')
				.replace(/[ \t]+/g, ' ')
				.replace(/^ +| +$/gm, '');
		case 'removeLineBreaks': {
			const normalized = text.replace(/\r\n/g, '\n');
			const collapsed = normalized.replace(/[ \t]*\n(?:[ \t]*\n)+/g, '\n');
			return collapsed.replace(/^[ \t]*\n+/, '').replace(/\n+[ \t]*$/, '');
		}
		case 'sortLines':
			return text.split('\n').sort((a, b) => a.localeCompare(b)).join('\n');
	}
}

export default function TextCaseConverter({ messages }: { messages: Messages }) {
	const [text, setText] = useState('');
	const [mode, setMode] = useState<CaseMode>('upper');
	const [copied, setCopied] = useState(false);

	const output = useMemo(() => convertCase(text, mode), [text, mode]);
	const charCount = output.length;
	const wordCount = output.trim() === '' ? 0 : output.trim().split(/\s+/).length;

	const handleFileUpload = (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') setText(reader.result);
		};
		reader.readAsText(file);
	};

	const handleFileDownload = () => {
		if (!output) return;
		const blob = new Blob([output], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'converted.txt';
		link.click();
		URL.revokeObjectURL(url);
	};

	const caseModes: Array<{ value: CaseMode; label: string }> = [
		{ value: 'upper', label: messages.caseUpper },
		{ value: 'lower', label: messages.caseLower },
		{ value: 'title', label: messages.caseTitle },
		{ value: 'camel', label: messages.caseCamel },
		{ value: 'snake', label: messages.caseSnake },
		{ value: 'sentence', label: messages.caseSentence },
		{ value: 'alternating', label: messages.caseAlternating },
		{ value: 'inverse', label: messages.caseInverse },
	];

	const utilityModes: Array<{ value: CaseMode; label: string }> = [
		{ value: 'removeSpaces', label: messages.utilRemoveSpaces },
		{ value: 'removeLineBreaks', label: messages.utilRemoveLineBreaks },
		{ value: 'sortLines', label: messages.utilSortLines },
	];

	const handleCopy = async () => {
		if (!output) return;
		await navigator.clipboard.writeText(output);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={messages.placeholder}
				rows={8}
				className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
			/>

			<div>
				<label
					htmlFor="text-case-file-input"
					className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
				>
					{messages.uploadFile}
				</label>
				<input
					id="text-case-file-input"
					type="file"
					accept=".txt,text/plain"
					className="hidden"
					onChange={(event) => handleFileUpload(event.target.files)}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold text-foreground">{messages.caseOptionsHeading}</h3>
				<div className="flex flex-wrap gap-2">
					{caseModes.map((item) => (
						<button
							key={item.value}
							type="button"
							onClick={() => setMode(item.value)}
							className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
								mode === item.value
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border text-foreground hover:bg-muted'
							}`}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold text-foreground">{messages.utilitiesHeading}</h3>
				<div className="flex flex-wrap gap-2">
					{utilityModes.map((item) => (
						<button
							key={item.value}
							type="button"
							onClick={() => setMode(item.value)}
							className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
								mode === item.value
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border text-foreground hover:bg-muted'
							}`}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<label htmlFor="case-output" className="text-sm font-medium text-foreground">
					{messages.outputLabel}
				</label>
				<textarea
					id="case-output"
					value={output}
					readOnly
					rows={8}
					className="w-full resize-y rounded-md border border-border bg-muted p-3 text-sm text-foreground"
				/>
				<p className="text-xs text-muted-foreground">
					{messages.outputStats.replace('{{chars}}', String(charCount)).replace('{{words}}', String(wordCount))}
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Button type="button" onClick={handleCopy} disabled={output === ''}>
					{copied ? messages.copied : messages.copy}
				</Button>
				<Button type="button" variant="outline" onClick={handleFileDownload} disabled={output === ''}>
					{messages.downloadFile}
				</Button>
				<Button type="button" variant="outline" onClick={() => setText('')} disabled={text === ''}>
					{messages.clear}
				</Button>
			</div>
		</div>
	);
}
