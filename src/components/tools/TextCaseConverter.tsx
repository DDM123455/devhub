import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { convertCase, type CaseMode } from '@/lib/text-case';
import { useCopyToClipboard } from './useCopyToClipboard';

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
	inputLabel: string;
	naturalSort: string;
	copyFailed: string;
	fileReadError: string;
}

export default function TextCaseConverter({ messages }: { messages: Messages }) {
	const [text, setText] = useState('');
	const [mode, setMode] = useState<CaseMode>('upper');
	const [naturalSort, setNaturalSort] = useState(false);
	const [uploadError, setUploadError] = useState(false);
	const { copied, failed, copy } = useCopyToClipboard();

	const output = useMemo(() => convertCase(text, mode, { naturalSort }), [text, mode, naturalSort]);
	const charCount = output.length;
	const wordCount = output.trim() === '' ? 0 : output.trim().split(/\s+/).length;

	const handleFileUpload = (input: HTMLInputElement) => {
		const file = input.files?.[0];
		if (!file) return;
		setUploadError(false);
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') setText(reader.result.replace(/\r\n?/g, '\n'));
		};
		reader.onerror = () => setUploadError(true);
		reader.readAsText(file);
		input.value = '';
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

	const handleCopy = () => {
		if (!output) return;
		void copy(output);
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={messages.placeholder}
				aria-label={messages.inputLabel}
				rows={8}
				className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
			/>

			<div>
				<label
					htmlFor="text-case-file-input"
					className="has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
				>
					{messages.uploadFile}
				</label>
				<input
					id="text-case-file-input"
					type="file"
					accept=".txt,text/plain"
					className="sr-only"
					onChange={(event) => handleFileUpload(event.target)}
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
							aria-pressed={mode === item.value}
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
							aria-pressed={mode === item.value}
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

			{mode === 'sortLines' && (
				<label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
					<input type="checkbox" checked={naturalSort} onChange={(event) => setNaturalSort(event.target.checked)} />
					{messages.naturalSort}
				</label>
			)}
			{uploadError && (
				<p role="alert" className="text-sm text-destructive">
					{messages.fileReadError}
				</p>
			)}

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
				<Button type="button" aria-live="polite" onClick={handleCopy} disabled={output === ''}>
					{copied ? messages.copied : failed ? messages.copyFailed : messages.copy}
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
