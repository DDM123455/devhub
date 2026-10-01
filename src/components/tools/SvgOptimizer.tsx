import { useEffect, useMemo, useRef, useState } from 'react';
import { optimize } from 'svgo/browser';
import { Button } from '@/components/ui/button';
import { copyTextSafe } from '@/lib/safe-clipboard';
import { SVG_MAX_BYTES, SVG_WARN_BYTES, buildPreviewDoc, detectSvgRisks, type SvgRisk } from '@/lib/svg-safety';
import { compressedSize, svgToDataUri, svgToJsx, uniqueFileName } from '@/lib/svg-export';

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
	gzipLabel: string;
	brotliLabel: string;
	copyDataUriBase64: string;
	copyDataUriEncoded: string;
	copyJsx: string;
	compareTab: string;
	compareSliderLabel: string;
	compareBefore: string;
	compareAfter: string;
	previewBgLabel: string;
	bgChecker: string;
	bgWhite: string;
	bgBlack: string;
	bgCustom: string;
	bgCustomColorLabel: string;
	optTransformPrecisionLabel: string;
	batchHeading: string;
	batchDropHint: string;
	batchFileCount: string;
	batchSkipped: string;
	batchTooMany: string;
	batchTotal: string;
	batchColName: string;
	batchColOriginal: string;
	batchColOptimized: string;
	batchColSaved: string;
	batchColStatus: string;
	batchFailedRow: string;
	batchDownloadZip: string;
	batchClear: string;
	batchZipError: string;
}

type View = 'preview' | 'code' | 'compare';
type PreviewBg = 'checker' | 'white' | 'black' | 'custom';

const BATCH_MAX_FILES = 50;
const BATCH_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const DEFAULT_TRANSFORM_PRECISION = 5;

interface OptJob {
	multipass: boolean;
	precision: number;
	transformPrecision: number;
	removeDimensions: boolean;
	removeViewBox: boolean;
	prettify: boolean;
	removeScripts: boolean;
	pluginEnabled: Record<string, boolean>;
}

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

// Runs SVGO with the user's settings; throws on malformed SVG. Shared by the single editor and batch mode.
function runOptimize(svg: string, job: OptJob): string {
	const overrides: Record<string, false | { transformPrecision: number }> = {};
	for (const id of PRESET_PLUGIN_IDS) {
		if (!job.pluginEnabled[id]) overrides[id] = false;
	}
	if (job.transformPrecision !== DEFAULT_TRANSFORM_PRECISION) {
		for (const id of ['convertTransform', 'convertPathData'] as const) {
			if (job.pluginEnabled[id]) overrides[id] = { transformPrecision: job.transformPrecision };
		}
	}
	return optimize(svg, {
		multipass: job.multipass,
		js2svg: job.prettify ? { indent: 2, pretty: true } : undefined,
		plugins: [
			{ name: 'preset-default', params: { floatPrecision: job.precision, overrides } },
			...(job.removeDimensions ? [{ name: 'removeDimensions' as const }] : []),
			...(job.removeViewBox ? [{ name: 'removeViewBox' as const }] : []),
			...(job.removeScripts ? [{ name: 'removeScripts' as const }] : []),
		],
	}).data;
}

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

function previewBgStyle(bg: PreviewBg, custom: string): React.CSSProperties | undefined {
	if (bg === 'white') return { background: '#ffffff' };
	if (bg === 'black') return { background: '#000000' };
	if (bg === 'custom') return { background: custom };
	return undefined;
}

function SvgPreview({ svg, title, bg, customBg }: { svg: string; title: string; bg: PreviewBg; customBg: string }) {
	// sandbox="" blocks scripts; the CSP meta additionally blocks any network access from the SVG.
	const srcDoc = buildPreviewDoc(svg);
	return (
		<div className="relative h-56 w-full overflow-hidden rounded-md border border-border">
			<div
				className={`absolute inset-0 ${bg === 'checker' ? 'bg-[repeating-conic-gradient(#d4d4d4_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]' : ''}`}
				style={previewBgStyle(bg, customBg)}
			/>
			<iframe title={title} sandbox="" srcDoc={srcDoc} className="relative h-full w-full" />
		</div>
	);
}

// Before/after slider: both renders are stacked and the optimized one is clipped from the left edge
// to the slider position, so dragging reveals the original underneath.
function CompareView({
	original,
	optimized,
	bg,
	customBg,
	sliderLabel,
	beforeLabel,
	afterLabel,
}: {
	original: string;
	optimized: string;
	bg: PreviewBg;
	customBg: string;
	sliderLabel: string;
	beforeLabel: string;
	afterLabel: string;
}) {
	const [pos, setPos] = useState(50);
	return (
		<div className="flex flex-col gap-2">
			<div className="relative h-72 w-full overflow-hidden rounded-md border border-border">
				<div
					className={`absolute inset-0 ${bg === 'checker' ? 'bg-[repeating-conic-gradient(#d4d4d4_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]' : ''}`}
					style={previewBgStyle(bg, customBg)}
				/>
				<iframe title={beforeLabel} sandbox="" srcDoc={buildPreviewDoc(original)} className="absolute inset-0 h-full w-full" />
				<iframe
					title={afterLabel}
					sandbox=""
					srcDoc={buildPreviewDoc(optimized)}
					className="absolute inset-0 h-full w-full"
					style={{ clipPath: `inset(0 0 0 ${pos}%)`, background: bg === 'checker' ? 'transparent' : undefined }}
				/>
				<div className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${pos}%` }} />
				<span className="pointer-events-none absolute left-2 top-2 rounded bg-background/80 px-1.5 text-xs text-foreground">{beforeLabel}</span>
				<span className="pointer-events-none absolute right-2 top-2 rounded bg-background/80 px-1.5 text-xs text-foreground">{afterLabel}</span>
			</div>
			<label className="flex items-center gap-2 text-sm text-muted-foreground">
				{sliderLabel}
				<input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="h-9 flex-1" />
			</label>
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
	const [transformPrecision, setTransformPrecision] = useState(DEFAULT_TRANSFORM_PRECISION);
	const [previewBg, setPreviewBg] = useState<PreviewBg>('checker');
	const [customBg, setCustomBg] = useState('#ffcc00');
	const [batchFiles, setBatchFiles] = useState<Array<{ name: string; text: string }>>([]);
	const [batchNotice, setBatchNotice] = useState<string | null>(null);
	const [gzipSizes, setGzipSizes] = useState<{
		original: number | null;
		optimized: number | null;
		brotliOriginal: number | null;
		brotliOptimized: number | null;
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const togglePlugin = (id: PresetPluginId) => {
		setPluginEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	// Everything that feeds SVGO is bundled and debounced together: typing or dragging the
	// precision slider re-runs the optimizer once things settle, not on every event.
	const job = useMemo(
		() => ({ input, multipass, precision, transformPrecision, removeDimensions, removeViewBox, prettify, removeScripts, pluginEnabled }),
		[input, multipass, precision, transformPrecision, removeDimensions, removeViewBox, prettify, removeScripts, pluginEnabled],
	);
	const settledJob = useDebounced(job, input === '' ? 0 : 200);
	const isPending = settledJob !== job;

	const { output, error } = useMemo(() => {
		const trimmed = settledJob.input.trim();
		if (trimmed === '') return { output: '', error: null as string | null };
		if (!looksLikeSvg(trimmed)) return { output: '', error: messages.notSvgError };
		if (new TextEncoder().encode(trimmed).length > SVG_MAX_BYTES) return { output: '', error: messages.tooLargeError };
		try {
			return { output: runOptimize(trimmed, settledJob), error: null as string | null };
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

	// gzip / brotli sizes (Compression Streams API; brotli is shown only when the browser supports it).
	useEffect(() => {
		if (!output) {
			setGzipSizes(null);
			return;
		}
		let cancelled = false;
		const source = settledJob.input.trim();
		void Promise.all([
			compressedSize(source, 'gzip'),
			compressedSize(output, 'gzip'),
			compressedSize(source, 'brotli'),
			compressedSize(output, 'brotli'),
		]).then(([original, optimized, brotliOriginal, brotliOptimized]) => {
			if (!cancelled) setGzipSizes({ original, optimized, brotliOriginal, brotliOptimized });
		});
		return () => {
			cancelled = true;
		};
	}, [output, settledJob.input]);

	const dataUriBase64 = useMemo(() => (output ? svgToDataUri(output, 'base64') : ''), [output]);
	const dataUriEncoded = useMemo(() => (output ? svgToDataUri(output, 'encoded') : ''), [output]);
	const jsxComponent = useMemo(() => {
		if (!output) return '';
		try {
			return svgToJsx(output);
		} catch {
			return '';
		}
	}, [output]);

	// Batch mode: runs the same SVGO job over every loaded file.
	const batchResults = useMemo(
		() =>
			batchFiles.map((file) => {
				const originalBytes = new TextEncoder().encode(file.text).length;
				if (!looksLikeSvg(file.text)) return { name: file.name, originalBytes, optimizedBytes: 0, output: '', error: messages.notSvgError };
				try {
					const out = runOptimize(file.text.trim(), settledJob);
					return { name: file.name, originalBytes, optimizedBytes: new TextEncoder().encode(out).length, output: out, error: null as string | null };
				} catch (err) {
					return { name: file.name, originalBytes, optimizedBytes: 0, output: '', error: messages.invalidSvgError.replace('{{message}}', (err as Error).message) };
				}
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[batchFiles, settledJob],
	);
	const batchOk = batchResults.filter((r) => r.error === null);
	const batchTotalOriginal = batchOk.reduce((sum, r) => sum + r.originalBytes, 0);
	const batchTotalOptimized = batchOk.reduce((sum, r) => sum + r.optimizedBytes, 0);

	const readFileText = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(new Error('read'));
			reader.readAsText(file);
		});

	const handleFile = (files: FileList | null, inputEl?: HTMLInputElement) => {
		const list = files ? Array.from(files) : [];
		if (inputEl) inputEl.value = '';
		if (list.length === 0) return;
		setFileError(null);
		setBatchNotice(null);
		if (list.length === 1) {
			const file = list[0];
			setBatchFiles([]);
			if (file.size > SVG_MAX_BYTES) {
				setFileError(messages.tooLargeError);
				return;
			}
			readFileText(file).then(setInput, () => setFileError(messages.fileReadError));
			return;
		}
		// Several files: batch mode (capped by count and total size).
		const notices: string[] = [];
		if (list.length > BATCH_MAX_FILES) notices.push(messages.batchTooMany.replace('{{max}}', String(BATCH_MAX_FILES)));
		let total = 0;
		let skipped = 0;
		const accepted: File[] = [];
		for (const file of list.slice(0, BATCH_MAX_FILES)) {
			if (file.size > SVG_MAX_BYTES || total + file.size > BATCH_MAX_TOTAL_BYTES) {
				skipped += 1;
				continue;
			}
			total += file.size;
			accepted.push(file);
		}
		if (skipped > 0) notices.push(messages.batchSkipped.replace('{{count}}', String(skipped)));
		void Promise.allSettled(accepted.map(readFileText)).then((results) => {
			const loaded: Array<{ name: string; text: string }> = [];
			let failed = 0;
			results.forEach((res, i) => {
				if (res.status === 'fulfilled') loaded.push({ name: accepted[i].name, text: res.value });
				else failed += 1;
			});
			if (failed > 0) notices.push(messages.fileReadError);
			setBatchNotice(notices.length ? notices.join(' ') : null);
			setBatchFiles(loaded);
		});
	};

	const saveBlob = (blob: Blob, name: string) => {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	};

	const handleDownloadZip = async () => {
		if (batchOk.length === 0) return;
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			const used = new Set<string>();
			for (const r of batchOk) zip.file(uniqueFileName(r.name, used), r.output);
			saveBlob(await zip.generateAsync({ type: 'blob' }), 'optimized-svgs.zip');
		} catch {
			setBatchNotice(messages.batchZipError);
		}
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
							multiple
							className="sr-only"
							onChange={(e) => handleFile(e.currentTarget.files, e.currentTarget)}
						/>
						<Button type="button" size="sm" variant="outline" onClick={() => setInput(SAMPLE_SVG)}>
							{messages.loadSample}
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{messages.dropHint} {messages.batchDropHint}</p>
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
						{messages.optTransformPrecisionLabel.replace('{{value}}', String(transformPrecision))}
						<input
							type="range"
							min={1}
							max={8}
							step={1}
							value={transformPrecision}
							onChange={(e) => setTransformPrecision(Number(e.target.value))}
							className="w-24"
						/>
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

			{batchNotice && <p role="status" className="text-xs text-muted-foreground">{batchNotice}</p>}

			{batchFiles.length > 0 && (
				<section className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-labelledby="svg-batch-heading">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 id="svg-batch-heading" className="text-sm font-medium text-foreground">
							{messages.batchHeading.replace('{{count}}', String(batchFiles.length))}
						</h2>
						<div className="flex gap-2">
							<Button type="button" size="sm" onClick={() => void handleDownloadZip()} disabled={batchOk.length === 0 || isPending}>
								{messages.batchDownloadZip}
							</Button>
							<Button type="button" size="sm" variant="outline" onClick={() => setBatchFiles([])}>
								{messages.batchClear}
							</Button>
						</div>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[420px] text-left text-xs">
							<thead>
								<tr className="text-muted-foreground">
									<th scope="col" className="py-1 pr-2 font-medium">{messages.batchColName}</th>
									<th scope="col" className="py-1 pr-2 font-medium">{messages.batchColOriginal}</th>
									<th scope="col" className="py-1 pr-2 font-medium">{messages.batchColOptimized}</th>
									<th scope="col" className="py-1 font-medium">{messages.batchColSaved}</th>
								</tr>
							</thead>
							<tbody>
								{batchResults.map((r, i) => (
									<tr key={`${r.name}-${i}`} className="border-t border-border text-foreground">
										<td className="max-w-[10rem] truncate py-1 pr-2" title={r.name}>{r.name}</td>
										<td className="py-1 pr-2">{formatBytes(r.originalBytes)}</td>
										{r.error ? (
											<td colSpan={2} className="py-1 text-destructive">{messages.batchFailedRow.replace('{{message}}', r.error)}</td>
										) : (
											<>
												<td className="py-1 pr-2">{formatBytes(r.optimizedBytes)}</td>
												<td className="py-1">
													{r.originalBytes > 0 ? `${Math.round((1 - r.optimizedBytes / r.originalBytes) * 100)}%` : '-'}
												</td>
											</>
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{batchOk.length > 0 && (
						<p className="text-xs text-muted-foreground">
							{messages.batchTotal
								.replace('{{original}}', formatBytes(batchTotalOriginal))
								.replace('{{optimized}}', formatBytes(batchTotalOptimized))
								.replace('{{percent}}', String(batchTotalOriginal > 0 ? Math.round((1 - batchTotalOptimized / batchTotalOriginal) * 100) : 0))}
						</p>
					)}
				</section>
			)}

			{input !== '' && !error && (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" size="sm" variant={view === 'preview' ? 'default' : 'outline'} aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
							{messages.previewTab}
						</Button>
						<Button type="button" size="sm" variant={view === 'compare' ? 'default' : 'outline'} aria-pressed={view === 'compare'} onClick={() => setView('compare')}>
							{messages.compareTab}
						</Button>
						<Button type="button" size="sm" variant={view === 'code' ? 'default' : 'outline'} aria-pressed={view === 'code'} onClick={() => setView('code')}>
							{messages.codeTab}
						</Button>
						{view !== 'code' && (
							<div className="ml-auto flex items-center gap-2">
								<label htmlFor="svg-preview-bg" className="text-xs text-muted-foreground">
									{messages.previewBgLabel}
								</label>
								<select
									id="svg-preview-bg"
									value={previewBg}
									onChange={(e) => setPreviewBg(e.target.value as PreviewBg)}
									className="min-h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground"
								>
									<option value="checker">{messages.bgChecker}</option>
									<option value="white">{messages.bgWhite}</option>
									<option value="black">{messages.bgBlack}</option>
									<option value="custom">{messages.bgCustom}</option>
								</select>
								{previewBg === 'custom' && (
									<input
										type="color"
										aria-label={messages.bgCustomColorLabel}
										value={customBg}
										onChange={(e) => setCustomBg(e.target.value)}
										className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background"
									/>
								)}
							</div>
						)}
					</div>

					{view === 'compare' && output && (
						<CompareView
							original={settledJob.input}
							optimized={output}
							bg={previewBg}
							customBg={customBg}
							sliderLabel={messages.compareSliderLabel}
							beforeLabel={messages.compareBefore}
							afterLabel={messages.compareAfter}
						/>
					)}

					<div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${view === 'compare' ? 'hidden' : ''}`}>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-2">
								<span className="text-sm font-medium text-foreground">{messages.originalHeading}</span>
								<span className="text-right text-xs text-muted-foreground">
									{messages.sizeLabel.replace('{{size}}', formatBytes(originalSize))}
									{gzipSizes?.original != null && ` · ${messages.gzipLabel.replace('{{size}}', formatBytes(gzipSizes.original))}`}
									{gzipSizes?.brotliOriginal != null && ` · ${messages.brotliLabel.replace('{{size}}', formatBytes(gzipSizes.brotliOriginal))}`}
								</span>
							</div>
							{view === 'preview' ? (
								<SvgPreview svg={settledJob.input} title={messages.previewTitleOriginal} bg={previewBg} customBg={customBg} />
							) : (
								<textarea readOnly aria-label={messages.originalHeading} value={input} rows={10} className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground" />
							)}
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-2">
								<span className="text-sm font-medium text-foreground">{messages.optimizedHeading}</span>
								<span className={`text-right text-xs ${isLarger ? 'text-destructive' : 'text-muted-foreground'}`}>
									{messages.sizeLabel.replace('{{size}}', formatBytes(optimizedSize))}
									{output &&
										` — ${
											isLarger
												? messages.increased.replace('{{percent}}', String(Math.abs(percentDelta)))
												: messages.reduced.replace('{{percent}}', String(percentDelta))
										}`}
									{gzipSizes?.optimized != null && ` · ${messages.gzipLabel.replace('{{size}}', formatBytes(gzipSizes.optimized))}`}
									{gzipSizes?.brotliOptimized != null && ` · ${messages.brotliLabel.replace('{{size}}', formatBytes(gzipSizes.brotliOptimized))}`}
								</span>
							</div>
							{view === 'preview' ? (
								<SvgPreview svg={output} title={messages.previewTitleOptimized} bg={previewBg} customBg={customBg} />
							) : (
								<textarea readOnly aria-label={messages.optimizedHeading} value={output} rows={10} className="w-full rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground" />
							)}
						</div>
					</div>
					<div className="flex flex-wrap justify-end gap-2">
						<CopyButton value={output} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
						<CopyButton value={dataUriBase64} label={messages.copyDataUriBase64} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
						<CopyButton value={dataUriEncoded} label={messages.copyDataUriEncoded} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
						<CopyButton value={jsxComponent} label={messages.copyJsx} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
						<Button type="button" size="sm" onClick={handleDownload} disabled={!output}>
							{messages.download}
						</Button>
					</div>
				</>
			)}

			{input === '' && batchFiles.length === 0 && <p className="text-sm text-muted-foreground">{messages.noInput}</p>}
		</div>
	);
}
