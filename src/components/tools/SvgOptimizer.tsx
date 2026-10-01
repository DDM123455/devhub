import { useEffect, useMemo, useRef, useState } from 'react';
import { optimize } from 'svgo/browser';
import { Button } from '@/components/ui/button';
import { copyTextSafe } from '@/lib/safe-clipboard';
import { SVG_MAX_BYTES, SVG_WARN_BYTES, buildPreviewDoc, detectSvgRisks, type SvgRisk } from '@/lib/svg-safety';

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
	increased: string;
	scriptTagWarning: string;
	copy: string;
	copied: string;
	download: string;
	invalidSvgError: string;
	notSvgError: string;
	noInput: string;
	pluginsToggle: string;
	pluginRemoveDoctype: string;
	pluginRemoveXMLProcInst: string;
	pluginRemoveComments: string;
	pluginRemoveDeprecatedAttrs: string;
	pluginRemoveMetadata: string;
	pluginRemoveEditorsNSData: string;
	pluginCleanupAttrs: string;
	pluginMergeStyles: string;
	pluginInlineStyles: string;
	pluginMinifyStyles: string;
	pluginCleanupIds: string;
	pluginRemoveUselessDefs: string;
	pluginCleanupNumericValues: string;
	pluginConvertColors: string;
	pluginRemoveUnknownsAndDefaults: string;
	pluginRemoveNonInheritableGroupAttrs: string;
	pluginRemoveUselessStrokeAndFill: string;
	pluginCleanupEnableBackground: string;
	pluginRemoveHiddenElems: string;
	pluginRemoveEmptyText: string;
	pluginConvertShapeToPath: string;
	pluginConvertEllipseToCircle: string;
	pluginMoveElemsAttrsToGroup: string;
	pluginMoveGroupAttrsToElems: string;
	pluginCollapseGroups: string;
	pluginConvertPathData: string;
	pluginConvertTransform: string;
	pluginRemoveEmptyAttrs: string;
	pluginRemoveEmptyContainers: string;
	pluginMergePaths: string;
	pluginRemoveUnusedNS: string;
	pluginSortAttrs: string;
	pluginSortDefsChildren: string;
	pluginRemoveDesc: string;
	pluginRemoveViewBox: string;
	optRemoveScripts: string;
	risksFound: string;
	riskScript: string;
	riskEventHandler: string;
	riskJavascriptUrl: string;
	riskForeignObject: string;
	riskExternalUse: string;
	riskExternalImage: string;
	riskExternalStyle: string;
	previewTitleOriginal: string;
	previewTitleOptimized: string;
	optimizing: string;
	tooLargeError: string;
	largeWarning: string;
	fileReadError: string;
	copyFailed: string;
}

type View = 'preview' | 'code';

// Every plugin bundled in SVGO's preset-default (v4), in the order SVGO itself declares
// them. Each is individually toggleable via preset-default's `overrides` option — passing
// `{ [id]: false }` disables just that one plugin while leaving the rest of the preset
// (and its own internal defaults) untouched. `removeViewBox` is NOT part of preset-default
// in this SVGO version, so it's handled separately as a standalone plugin entry, and its
// checkbox defaults to OFF (keep viewBox) rather than mirroring an "enabled" default, since
// stripping viewBox breaks responsive/scalable use of the SVG in most real-world cases.
const PRESET_PLUGIN_IDS = [
	'removeDoctype',
	'removeXMLProcInst',
	'removeComments',
	'removeDeprecatedAttrs',
	'removeMetadata',
	'removeEditorsNSData',
	'cleanupAttrs',
	'mergeStyles',
	'inlineStyles',
	'minifyStyles',
	'cleanupIds',
	'removeUselessDefs',
	'cleanupNumericValues',
	'convertColors',
	'removeUnknownsAndDefaults',
	'removeNonInheritableGroupAttrs',
	'removeUselessStrokeAndFill',
	'cleanupEnableBackground',
	'removeHiddenElems',
	'removeEmptyText',
	'convertShapeToPath',
	'convertEllipseToCircle',
	'moveElemsAttrsToGroup',
	'moveGroupAttrsToElems',
	'collapseGroups',
	'convertPathData',
	'convertTransform',
	'removeEmptyAttrs',
	'removeEmptyContainers',
	'mergePaths',
	'removeUnusedNS',
	'sortAttrs',
	'sortDefsChildren',
	'removeDesc',
] as const;

type PresetPluginId = (typeof PRESET_PLUGIN_IDS)[number];

function messageKeyForPlugin(id: PresetPluginId | 'removeViewBox'): keyof Messages {
	return (`plugin${id[0].toUpperCase()}${id.slice(1)}`) as keyof Messages;
}

function defaultPluginState(): Record<PresetPluginId, boolean> {
	const state = {} as Record<PresetPluginId, boolean>;
	for (const id of PRESET_PLUGIN_IDS) state[id] = true;
	return state;
}

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

function CopyButton({ value, label, copiedLabel, failedLabel }: { value: string; label: string; copiedLabel: string; failedLabel: string }) {
	const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	return (
		<Button
			aria-live="polite"
			type="button"
			size="sm"
			variant="ghost"
			disabled={value === ''}
			onClick={() => {
				void copyTextSafe(value).then((ok) => {
					setStatus(ok ? 'copied' : 'failed');
					if (timer.current) clearTimeout(timer.current);
					timer.current = setTimeout(() => setStatus('idle'), 1500);
				});
			}}
		>
			{status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : label}
		</Button>
	);
}

// Debounces rapidly changing values (typing, slider drags) so SVGO is not re-run on every keystroke.
function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return debounced;
}

function SvgPreview({ svg, title }: { svg: string; title: string }) {
	// sandbox="" blocks scripts; the CSP meta additionally blocks any network access from the SVG.
	const srcDoc = buildPreviewDoc(svg);
	return (
		<div className="relative h-56 w-full overflow-hidden rounded-md border border-border">
			<div className="absolute inset-0 bg-[repeating-conic-gradient(#d4d4d4_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]" />
			<iframe title={title} sandbox="" srcDoc={srcDoc} className="relative h-full w-full" />
		</div>
	);
}

export default function SvgOptimizer({ messages }: { messages: Messages }) {
	const [input, setInput] = useState('');
	const [multipass, setMultipass] = useState(true);
	const [precision, setPrecision] = useState(3);
	const [removeDimensions, setRemoveDimensions] = useState(false);
	const [removeViewBox, setRemoveViewBox] = useState(false);
	const [prettify, setPrettify] = useState(false);
	const [removeScripts, setRemoveScripts] = useState(false);
	const [fileError, setFileError] = useState<string | null>(null);
	const [pluginEnabled, setPluginEnabled] = useState<Record<PresetPluginId, boolean>>(defaultPluginState);
	const [view, setView] = useState<View>('preview');
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const togglePlugin = (id: PresetPluginId) => {
		setPluginEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	// Everything that feeds SVGO is bundled and debounced together: typing or dragging the
	// precision slider re-runs the optimizer once things settle, not on every event.
	const job = useMemo(
		() => ({ input, multipass, precision, removeDimensions, removeViewBox, prettify, removeScripts, pluginEnabled }),
		[input, multipass, precision, removeDimensions, removeViewBox, prettify, removeScripts, pluginEnabled],
	);
	const settledJob = useDebounced(job, input === '' ? 0 : 200);
	const isPending = settledJob !== job;

	const { output, error } = useMemo(() => {
		const trimmed = settledJob.input.trim();
		if (trimmed === '') return { output: '', error: null as string | null };
		if (!looksLikeSvg(trimmed)) return { output: '', error: messages.notSvgError };
		if (new TextEncoder().encode(trimmed).length > SVG_MAX_BYTES) return { output: '', error: messages.tooLargeError };
		try {
			const overrides: Record<string, false> = {};
			for (const id of PRESET_PLUGIN_IDS) {
				if (!settledJob.pluginEnabled[id]) overrides[id] = false;
			}
			const result = optimize(trimmed, {
				multipass: settledJob.multipass,
				js2svg: settledJob.prettify ? { indent: 2, pretty: true } : undefined,
				plugins: [
					{ name: 'preset-default', params: { floatPrecision: settledJob.precision, overrides } },
					...(settledJob.removeDimensions ? [{ name: 'removeDimensions' as const }] : []),
					...(settledJob.removeViewBox ? [{ name: 'removeViewBox' as const }] : []),
					...(settledJob.removeScripts ? [{ name: 'removeScripts' as const }] : []),
				],
			});
			return { output: result.data, error: null as string | null };
		} catch (err) {
			return { output: '', error: messages.invalidSvgError.replace('{{message}}', (err as Error).message) };
		}
	}, [settledJob, messages.invalidSvgError, messages.notSvgError, messages.tooLargeError]);

	const originalSize = new TextEncoder().encode(input).length;
	const optimizedSize = new TextEncoder().encode(output).length;
	// Signed, not clamped to 0: a handful of already-tiny/unusual SVGs come out
	// of svgo LARGER than the input (e.g. prettified output, or plugins that
	// expand shorthand for correctness) — clamping negative values to 0 used to
	// display a misleading "0% smaller" instead of admitting the file grew.
	const percentDelta = originalSize > 0 && output ? Math.round((1 - optimizedSize / originalSize) * 100) : 0;
	const isLarger = percentDelta < 0;
	// SVGO's default behavior is to preserve <script> elements verbatim (it's
	// not something any preset-default plugin strips) — correct for SVGs used
	// as standalone image files, but a real risk if the user then embeds the
	// "optimized" output inline in an HTML page: an inline <svg> runs its
	// <script> in the host page's context. Not a bug to fix, just something
	// worth surfacing since it's easy to assume "optimized" implies "sanitized".
	const risks = useMemo(() => detectSvgRisks(output), [output]);
	const riskLabels: Record<SvgRisk, string> = {
		script: messages.riskScript,
		eventHandler: messages.riskEventHandler,
		javascriptUrl: messages.riskJavascriptUrl,
		foreignObject: messages.riskForeignObject,
		externalUse: messages.riskExternalUse,
		externalImage: messages.riskExternalImage,
		externalStyle: messages.riskExternalStyle,
	};
	const hasLargeInput = originalSize > SVG_WARN_BYTES && originalSize <= SVG_MAX_BYTES;

	const handleFile = (files: FileList | null, inputEl?: HTMLInputElement) => {
		const file = files?.[0];
		if (inputEl) inputEl.value = '';
		if (!file) return;
		setFileError(null);
		if (file.size > SVG_MAX_BYTES) {
			setFileError(messages.tooLargeError);
			return;
		}
		const reader = new FileReader();
		reader.onload = () => setInput(String(reader.result ?? ''));
		reader.onerror = () => setFileError(messages.fileReadError);
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
		setTimeout(() => URL.revokeObjectURL(url), 10000);
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
							className="inline-flex min-h-8 cursor-pointer items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent focus-within:ring-2 focus-within:ring-ring"
						>
							{messages.chooseFile}
						</label>
						<input
							id="svg-file-input"
							ref={fileInputRef}
							type="file"
							accept=".svg,image/svg+xml"
							className="sr-only"
							onChange={(e) => handleFile(e.currentTarget.files, e.currentTarget)}
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
						<input type="checkbox" checked={removeViewBox} onChange={(e) => setRemoveViewBox(e.target.checked)} />
						{messages.pluginRemoveViewBox}
					</label>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input type="checkbox" checked={prettify} onChange={(e) => setPrettify(e.target.checked)} />
						{messages.optPrettify}
					</label>
					<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
						<input type="checkbox" checked={removeScripts} onChange={(e) => setRemoveScripts(e.target.checked)} />
						{messages.optRemoveScripts}
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

			<details className="rounded-lg border border-border p-4">
				<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.pluginsToggle}</summary>
				<div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
					{PRESET_PLUGIN_IDS.map((id) => (
						<label key={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<input type="checkbox" checked={pluginEnabled[id]} onChange={() => togglePlugin(id)} />
							{messages[messageKeyForPlugin(id)]}
						</label>
					))}
				</div>
			</details>

			{error && <p role="alert" className="text-sm text-destructive">{error}</p>}

			{fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}

			{hasLargeInput && !error && (
				<p role="status" className="text-xs text-muted-foreground">{messages.largeWarning}</p>
			)}

			{risks.length > 0 && !error && (
				<p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-300">
					{risks.includes('script') ? `${messages.scriptTagWarning} ` : ''}
					{messages.risksFound.replace('{{list}}', risks.map((r) => riskLabels[r]).join(', '))}
				</p>
			)}

			{isPending && input !== '' && (
				<p role="status" className="text-xs text-muted-foreground">{messages.optimizing}</p>
			)}

			{input !== '' && !error && (
				<>
					<div className="flex items-center gap-2">
						<Button type="button" size="sm" variant={view === 'preview' ? 'default' : 'outline'} aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
							{messages.previewTab}
						</Button>
						<Button type="button" size="sm" variant={view === 'code' ? 'default' : 'outline'} aria-pressed={view === 'code'} onClick={() => setView('code')}>
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
								<SvgPreview svg={settledJob.input} title={messages.previewTitleOriginal} />
							) : (
								<textarea readOnly aria-label={messages.originalHeading} value={input} rows={10} className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground" />
							)}
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.optimizedHeading}</span>
								<span className={`text-xs ${isLarger ? 'text-destructive' : 'text-muted-foreground'}`}>
									{messages.sizeLabel.replace('{{size}}', formatBytes(optimizedSize))}
									{output &&
										` — ${
											isLarger
												? messages.increased.replace('{{percent}}', String(Math.abs(percentDelta)))
												: messages.reduced.replace('{{percent}}', String(percentDelta))
										}`}
								</span>
							</div>
							{view === 'preview' ? (
								<SvgPreview svg={output} title={messages.previewTitleOptimized} />
							) : (
								<textarea readOnly aria-label={messages.optimizedHeading} value={output} rows={10} className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground" />
							)}
							<div className="flex justify-end gap-2">
								<CopyButton value={output} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
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
