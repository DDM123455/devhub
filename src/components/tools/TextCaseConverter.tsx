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
	copy: string;
	copied: string;
	clear: string;
}

type CaseMode = 'upper' | 'lower' | 'title' | 'camel' | 'snake';

// Normalizes any mix of spaces, hyphens, underscores, punctuation, and
// existing camelCase/PascalCase boundaries into a flat list of lowercase-able
// word tokens, so camelCase/snake_case conversion works whether the input is
// "hello world", "hello-world", or already "helloWorld".
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
			return text.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
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
	}
}

export default function TextCaseConverter({ messages }: { messages: Messages }) {
	const [text, setText] = useState('');
	const [mode, setMode] = useState<CaseMode>('upper');
	const [copied, setCopied] = useState(false);

	const output = useMemo(() => convertCase(text, mode), [text, mode]);

	const modes: Array<{ value: CaseMode; label: string }> = [
		{ value: 'upper', label: messages.caseUpper },
		{ value: 'lower', label: messages.caseLower },
		{ value: 'title', label: messages.caseTitle },
		{ value: 'camel', label: messages.caseCamel },
		{ value: 'snake', label: messages.caseSnake },
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

			<div className="flex flex-wrap gap-2">
				{modes.map((item) => (
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
			</div>

			<div className="flex items-center gap-3">
				<Button type="button" onClick={handleCopy} disabled={output === ''}>
					{copied ? messages.copied : messages.copy}
				</Button>
				<Button type="button" variant="outline" onClick={() => setText('')} disabled={text === ''}>
					{messages.clear}
				</Button>
			</div>
		</div>
	);
}
