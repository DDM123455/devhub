import { useMemo, useRef, useState } from 'react';
import { optimize } from 'svgo/browser';
import { Button } from '@/components/ui/button';

interface Messages {
	inputLabel: string;
	inputPlaceholder: string;
	dropHint: string;
	chooseFile: string;
	loadSample: string;
	clear: string;
	optionsHeading: string;
	optMultipass: string;
	optPrecisionLabel: string;
	optRemoveDimensions: string;
	optPrettify: string;
	originalHeading: string;
	optimizedHeading: string;
	previewTab: string;
	codeTab: string;
	sizeLabel: string;
	reduced: string;
	copy: string;
	copied: string;
	download: string;
	invalidSvgError: string;
	notSvgError: string;
	noInput: string;
}

type View = 'preview' | 'code';

const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Sample icon -->
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <metadata>Created with an editor</metadata>
  <g id="layer1">
    <circle cx="32.000000" cy="32.000000" r="28.000000" fill="#ff5a3c" stroke="#000000" stroke-width="0"/>
    <path d="M 20.000000,32.000000 L 28.000000,40.000000 L 44.000000,24.000000" fill="none" stroke="#ffffff" stroke-width="6.000000" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;

function looksLikeSvg(input: string): boolean {
	return /<svg[\s>]/i.test(input);
}

function formatBytes(bytes: number): string {
	return `${bytes.toLocaleString()} B`;
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

function SvgPreview({ svg }: { svg: string }) {
	const srcDoc = `<!doctype html><html><head><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%}</style></head><body>${svg}</body></html>`;
	return (
		<div className="relative h-56 w-full overflow-hidden rounded-md border border-border">
			<div className="absolute inset-0 bg-[repeating-conic-gradient(#d4d4d4_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]" />
			<iframe title="svg-preview" sandbox="" srcDoc={srcDoc} className="relative h-full w-full" />
		</div>
	);
}

export default function SvgOptimizer({ messages }: { messages: Messages }) {
	const [input, setInput] = useState('');
	const [multipass, setMultipass] = useState(true);
	const [precision, setPrecision] = useState(3);
	const [removeDimensions, setRemoveDimensions] = useState(false);
	const [prettify, setPrettify] = useState(false);
	const [view, setView] = useState<View>('preview');
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { output, error } = useMemo(() => {
		const trimmed = input.trim();
		if (trimmed === '') return { output: '', error: null as string | null };
		if (!looksLikeSvg(trimmed)) return { output: '', error: messages.notSvgError };
		try {
			const result = optimize(trimmed, {
				multipass,
				js2svg: prettify ? { indent: 2, pretty: true } : undefined,
				plugins: [
					{ name: 'preset-default', params: { floatPrecision: precision } },
					...(removeDimensions ? [{ name: 'removeDimensions' }] : []),
				],
			});
			return { output: result.data, error: null as string | null };
		} catch (err) {
			return { output: '', error: messages.invalidSvgError.replace('{{message}}', (err as Error).message) };
		}
	}, [input, multipass, precision, removeDimensions, prettify, messages.invalidSvgError, messages.notSvgError]);

	const originalSize = new TextEncoder().encode(input).length;
	const optimizedSize = new TextEncoder().encode(output).length;
	const percentSaved = originalSize > 0 && output ? Math.max(0, Math.round((1 - optimizedSize / originalSize) * 100)) : 0;

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setInput(String(reader.result ?? ''));
		reader.readAsText(file);
	};

	const handleDownload = () => {
		if (!output) return;
		const blob = new Blob([output], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'optimized.svg';
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-4">
			<div
				className={`flex flex-col gap-2 rounded-lg border-2 border-dashed p-4 transition-colors ${
					isDragOver ? 'border-primary bg-primary/5' : 'border-border'
				}`}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragOver(false);
					handleFile(e.dataTransfer.files);
				}}
			>
				<div className="flex items-center justify-between">
					<label htmlFor="svg-input" className="text-sm font-medium text-foreground">
						{messages.inputLabel}
					</label>
					<div className="flex gap-2">
						<label
							htmlFor="svg-file-input"
							className="inline-flex cursor-pointer items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
						>
							{messages.chooseFile}
						</label>
						<input
							id="svg-file-input"
							ref={fileInputRef}
							type="file"
							accept=".svg,image/svg+xml"
							className="hidden"
							onChange={(e) => handleFile(e.target.files)}
						/>
						<Button type="button" size="sm" variant="outline" onClick={() => setInput(SAMPLE_SVG)}>
							{messages.loadSample}
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
				<textarea
					id="svg-input"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={messages.inputPlaceholder}
					rows={6}
					spellCheck={false}
					className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
				/>
				<div>
					<Button type="button" size="sm" variant="ghost" onClick={() => setInput('')}>
						{messages.clear}
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.optionsHeading}</span>
				<div className="flex flex-wrap items-center gap-4">
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input type="checkbox" checked={multipass} onChange={(e) => setMultipass(e.target.checked)} />
						{messages.optMultipass}
					</label>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input
							type="checkbox"
							checked={removeDimensions}
							onChange={(e) => setRemoveDimensions(e.target.checked)}
						/>
						{messages.optRemoveDimensions}
					</label>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input type="checkbox" checked={prettify} onChange={(e) => setPrettify(e.target.checked)} />
						{messages.optPrettify}
					</label>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						{messages.optPrecisionLabel.replace('{{value}}', String(precision))}
						<input
							type="range"
							min={0}
							max={6}
							step={1}
							value={precision}
							onChange={(e) => setPrecision(Number(e.target.value))}
							className="w-24"
						/>
					</label>
				</div>
			</div>

			{error && <p role="alert" className="text-sm text-destructive">{error}</p>}

			{input !== '' && !error && (
				<>
					<div className="flex items-center gap-2">
						<Button type="button" size="sm" variant={view === 'preview' ? 'default' : 'outline'} onClick={() => setView('preview')}>
							{messages.previewTab}
						</Button>
						<Button type="button" size="sm" variant={view === 'code' ? 'default' : 'outline'} onClick={() => setView('code')}>
							{messages.codeTab}
						</Button>
					</div>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.originalHeading}</span>
								<span className="text-xs text-muted-foreground">{messages.sizeLabel.replace('{{size}}', formatBytes(originalSize))}</span>
							</div>
							{view === 'preview' ? (
								<SvgPreview svg={input} />
							) : (
								<textarea readOnly value={input} rows={10} className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground" />
							)}
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.optimizedHeading}</span>
								<span className="text-xs text-muted-foreground">
									{messages.sizeLabel.replace('{{size}}', formatBytes(optimizedSize))}
									{output && ` — ${messages.reduced.replace('{{percent}}', String(percentSaved))}`}
								</span>
							</div>
							{view === 'preview' ? (
								<SvgPreview svg={output} />
							) : (
								<textarea readOnly value={output} rows={10} className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground" />
							)}
							<div className="flex justify-end gap-2">
								<CopyButton value={output} label={messages.copy} copiedLabel={messages.copied} />
								<Button type="button" size="sm" onClick={handleDownload} disabled={!output}>
									{messages.download}
								</Button>
							</div>
						</div>
					</div>
				</>
			)}

			{input === '' && <p className="text-sm text-muted-foreground">{messages.noInput}</p>}
		</div>
	);
}
