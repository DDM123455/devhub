import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
	AUTO_FORMAT_MAX_CHARS,
	COMPARE_MAX_CHARS,
	DEFAULT_SETTINGS,
	DRAFT_MAX_CHARS,
	FILE_ACCEPT,
	FILE_EXTENSION,
	MAX_FILE_BYTES,
	STORAGE_DRAFT_KEY,
	STORAGE_SETTINGS_KEY,
	buildDownloadName,
	countLines,
	errorSelection,
	fillTemplate,
	humanBytes,
	isFileTooLarge,
	percentSmaller,
	resolveLanguage,
	sanitizeSettings,
	supportsMinify,
	supportsPrintWidth,
	toFormatOptions,
	type CodeFormatterSettings,
	type LanguageChoice,
} from '@/lib/code-formatter-utils';
import { SAMPLES, SAMPLE_IDS, type SampleId } from '@/lib/code-formatter-samples';
import {
	FORMAT_LANGUAGES,
	FORMAT_MAX_CHARS,
	FORMAT_WARN_CHARS,
	INDENT_CHOICES,
	PRINT_WIDTHS,
	SQL_DIALECTS,
	checkFormatSize,
	languageLabel,
	type FormatLanguage,
	type IndentChoice,
	type SqlDialect,
} from '@/lib/format-languages';
import { compressToUrlSafeBase64 } from '@/lib/hash-share';
import { useCopyToClipboard } from './useCopyToClipboard';
import SqlLineArea from './SqlLineArea';
import { runCodeFormatter, type CodeRunMode } from './codeFormatterRun';
import { FORMAT_TIMEOUT_MESSAGE } from './formatClient';

export interface CodeFormatterMessages {
	privacyNote: string;
	inputLabel: string;
	inputPlaceholder: string;
	dropHint: string;
	outputLabel: string;
	outputLabelMinify: string;
	outputPlaceholder: string;
	chooseFile: string;
	paste: string;
	pasteFailed: string;
	clear: string;
	undo: string;
	copy: string;
	copied: string;
	copyFailed: string;
	download: string;
	format: string;
	minify: string;
	runHint: string;
	loadSample: string;
	sampleBroken: string;
	languageLabel: string;
	languageAuto: string;
	detectedContent: string;
	detectedExtension: string;
	detectedManual: string;
	detectedNone: string;
	detectedEmpty: string;
	ambiguous: string;
	ambiguousCandidates: string;
	formatAs: string;
	emptyInput: string;
	optionsHeading: string;
	resetOptions: string;
	indentLabel: string;
	indent2: string;
	indent4: string;
	indentTab: string;
	widthLabel: string;
	sqlDialectLabel: string;
	sqlDialectStandard: string;
	optionsNote: string;
	autoFormat: string;
	autoFormatPaused: string;
	statsInput: string;
	statsOutput: string;
	statsMinify: string;
	running: string;
	doneFormat: string;
	doneMinify: string;
	duplicateKeys: string;
	formatFailed: string;
	errorAt: string;
	jumpToError: string;
	inputKept: string;
	timeout: string;
	workerError: string;
	sizeWarn: string;
	tooLarge: string;
	fileTooLarge: string;
	fileReadError: string;
	fileLoaded: string;
	compareDiff: string;
	compareTooLarge: string;
}

type OutputState =
	| { phase: 'idle' }
	| { phase: 'running' }
	| { phase: 'empty' }
	| { phase: 'ambiguous'; candidates: FormatLanguage[] }
	| { phase: 'tooLarge'; chars: number }
	| { phase: 'done'; mode: CodeRunMode; language: FormatLanguage; text: string; source: string; duplicateKeys: boolean }
	| { phase: 'error'; language: FormatLanguage; message: string; line?: number; column?: number }
	| { phase: 'failure'; kind: 'timeout' | 'worker' };

const DEBOUNCE_AUTO_MS = 700;
const DETECT_DEBOUNCE_MS = 250;
/** Content detection runs many regexes; skip live detection above this size (Format still detects). */
const DETECT_LIVE_MAX_CHARS = 300_000;

const fieldCls =
	'h-11 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-9';
const labelCls = 'text-xs font-medium text-muted-foreground';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<label htmlFor={id} className={labelCls}>
				{label}
			</label>
			{children}
		</div>
	);
}

interface Props {
	messages: CodeFormatterMessages;
	textDiffHref: string;
}

export default function CodeFormatter({ messages: m, textDiffHref }: Props) {
	const [input, setInput] = useState('');
	const [fileName, setFileName] = useState<string | null>(null);
	const [settings, setSettings] = useState<CodeFormatterSettings>(DEFAULT_SETTINGS);
	const [loaded, setLoaded] = useState(false);
	const [output, setOutput] = useState<OutputState>({ phase: 'idle' });
	const [undoValue, setUndoValue] = useState<{ text: string; fileName: string | null } | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [detectInput, setDetectInput] = useState('');
	const [diffHash, setDiffHash] = useState<string | null>(null);
	const { copied, failed: copyFailed, copy } = useCopyToClipboard();
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const seqRef = useRef(0);
	const latest = useRef({ input, fileName, settings });
	latest.current = { input, fileName, settings };

	// ---- restore settings + draft (client only, after hydration)
	useEffect(() => {
		try {
			const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
			if (raw) setSettings(sanitizeSettings(JSON.parse(raw)));
			const draft = localStorage.getItem(STORAGE_DRAFT_KEY);
			if (draft) setInput(draft);
		} catch {
			/* storage blocked or corrupt: defaults */
		}
		setLoaded(true);
	}, []);

	useEffect(() => {
		if (!loaded) return;
		try {
			localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
		} catch {
			/* ignore */
		}
	}, [settings, loaded]);

	useEffect(() => {
		if (!loaded) return;
		const timer = setTimeout(() => {
			try {
				if (input === '' || input.length > DRAFT_MAX_CHARS) localStorage.removeItem(STORAGE_DRAFT_KEY);
				else localStorage.setItem(STORAGE_DRAFT_KEY, input);
			} catch {
				/* ignore */
			}
		}, 600);
		return () => clearTimeout(timer);
	}, [input, loaded]);

	// ---- live language detection for the badge (debounced; skipped for huge inputs)
	useEffect(() => {
		const timer = setTimeout(() => setDetectInput(input.length > DETECT_LIVE_MAX_CHARS ? '' : input), DETECT_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [input]);
	const liveResolution = useMemo(() => resolveLanguage(settings.language, detectInput, fileName), [settings.language, detectInput, fileName]);
	const detectedLanguage = liveResolution.kind === 'ok' ? liveResolution.language : null;
	// The language the option controls (line width, SQL dialect, minify) apply to.
	const activeLanguage: FormatLanguage | null = settings.language !== 'auto' ? settings.language : detectedLanguage;

	// ---- run
	const run = useCallback(async (mode: CodeRunMode, opts: { silent?: boolean; language?: FormatLanguage } = {}) => {
		const cur = latest.current;
		const text = cur.input;
		const resolution = opts.language
			? ({ kind: 'ok', language: opts.language, confidence: 'high', source: 'manual' } as const)
			: resolveLanguage(cur.settings.language, text, cur.fileName);
		if (resolution.kind === 'empty') {
			if (!opts.silent) setOutput({ phase: 'empty' });
			return;
		}
		if (resolution.kind === 'ambiguous') {
			if (!opts.silent) setOutput({ phase: 'ambiguous', candidates: resolution.candidates });
			return;
		}
		if (checkFormatSize(text.length) === 'tooLarge') {
			setOutput({ phase: 'tooLarge', chars: text.length });
			return;
		}
		const language = resolution.language;
		const seq = ++seqRef.current;
		setOutput((o) => (o.phase === 'done' ? o : { phase: 'running' }));
		let result;
		try {
			result = await runCodeFormatter(text, language, mode, toFormatOptions(cur.settings));
		} catch {
			if (seq === seqRef.current) setOutput({ phase: 'failure', kind: 'worker' });
			return;
		}
		if (seq !== seqRef.current) return;
		if (result.ok) {
			setOutput({ phase: 'done', mode, language, text: result.value, source: text, duplicateKeys: result.warnings.includes('duplicateKeys') });
		} else if (result.error.message === FORMAT_TIMEOUT_MESSAGE) {
			setOutput({ phase: 'failure', kind: 'timeout' });
		} else if (result.error.message === 'worker-error') {
			setOutput({ phase: 'failure', kind: 'worker' });
		} else {
			setOutput({ phase: 'error', language, message: result.error.message, line: result.error.line, column: result.error.column });
		}
	}, []);

	// Optional auto-format while typing (off by default; paused for big inputs; never nags about ambiguity).
	useEffect(() => {
		if (!loaded || !settings.autoFormat || input.trim() === '' || input.length > AUTO_FORMAT_MAX_CHARS) return;
		const timer = setTimeout(() => void run('format', { silent: true }), DEBOUNCE_AUTO_MS);
		return () => clearTimeout(timer);
	}, [input, fileName, settings, loaded, run]);

	// Ctrl/Cmd+Enter anywhere on the page.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
				e.preventDefault();
				void run('format');
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [run]);

	// "Compare in Text Diff": both texts travel gzip+base64 in the URL hash (never sent to a server).
	const doneOutput = output.phase === 'done' ? output : null;
	const compareTooLarge = doneOutput ? doneOutput.source.length + doneOutput.text.length > COMPARE_MAX_CHARS : false;
	useEffect(() => {
		if (!doneOutput || compareTooLarge || doneOutput.text === doneOutput.source) {
			setDiffHash(null);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const [original, changed] = await Promise.all([compressToUrlSafeBase64(doneOutput.source), compressToUrlSafeBase64(doneOutput.text)]);
				if (!cancelled) setDiffHash(new URLSearchParams({ original, changed }).toString());
			} catch {
				if (!cancelled) setDiffHash(null);
			}
		}, 400);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [doneOutput, compareTooLarge]);

	// ---- input handling
	const replaceInput = (next: string, nextFileName: string | null = null) => {
		if (input !== '' && next !== input) setUndoValue({ text: input, fileName });
		seqRef.current++;
		setInput(next);
		setFileName(nextFileName);
		setNotice(null);
		setOutput({ phase: 'idle' });
	};

	const readFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		if (isFileTooLarge(file.size)) {
			setNotice(fillTemplate(m.fileTooLarge, { max: humanBytes(MAX_FILE_BYTES) }));
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			replaceInput(String(reader.result ?? ''), file.name);
			setNotice(fillTemplate(m.fileLoaded, { name: file.name }));
		};
		reader.onerror = () => setNotice(m.fileReadError);
		reader.readAsText(file);
	};

	const pasteFromClipboard = async () => {
		try {
			replaceInput(await navigator.clipboard.readText());
		} catch {
			setNotice(m.pasteFailed);
		}
	};

	const update = <K extends keyof CodeFormatterSettings>(key: K, value: CodeFormatterSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

	const jumpToError = () => {
		if (output.phase !== 'error' || !output.line) return;
		const ta = inputRef.current;
		if (!ta) return;
		const sel = errorSelection(input, output.line, output.column ?? 1);
		ta.focus();
		ta.setSelectionRange(sel.start, sel.end);
		ta.scrollTop = Math.max(0, (output.line - 1) * 20 - ta.clientHeight / 2);
		ta.scrollLeft = Math.max(0, ((output.column ?? 1) - 1) * 7.3 - ta.clientWidth / 2);
	};

	const download = () => {
		if (!doneOutput) return;
		const blob = new Blob([doneOutput.text], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = buildDownloadName(doneOutput.language, fileName, doneOutput.mode === 'minify');
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	// ---- derived values
	const sizeState = checkFormatSize(input.length);
	const doneText = doneOutput?.text ?? '';
	const inputStats = fillTemplate(m.statsInput, { lines: countLines(input), chars: input.length.toLocaleString() });
	const outputStats = doneOutput
		? doneOutput.mode === 'minify'
			? fillTemplate(m.statsMinify, {
					before: humanBytes(new TextEncoder().encode(doneOutput.source).length),
					after: humanBytes(new TextEncoder().encode(doneOutput.text).length),
					percent: percentSmaller(doneOutput.source.length, doneOutput.text.length),
				})
			: fillTemplate(m.statsOutput, { lines: countLines(doneOutput.text), chars: doneOutput.text.length.toLocaleString() })
		: null;
	const outputLabel = doneOutput?.mode === 'minify' ? m.outputLabelMinify : m.outputLabel;
	const errorLines = output.phase === 'error' && output.line ? [output.line] : [];

	let detectedText: string;
	if (liveResolution.kind === 'empty') detectedText = m.detectedEmpty;
	else if (liveResolution.kind === 'ambiguous') detectedText = m.detectedNone;
	else {
		const name = languageLabel(liveResolution.language);
		detectedText = fillTemplate(
			liveResolution.source === 'manual' ? m.detectedManual : liveResolution.source === 'extension' ? m.detectedExtension : m.detectedContent,
			{ language: name, file: fileName ?? '' },
		);
	}

	const statusText =
		output.phase === 'running'
			? m.running
			: doneOutput
				? fillTemplate(doneOutput.mode === 'minify' ? m.doneMinify : m.doneFormat, { language: languageLabel(doneOutput.language) })
				: '';

	let problem: ReactNode = null;
	if (output.phase === 'error') {
		const where = output.line ? ` (${fillTemplate(m.errorAt, { line: output.line, column: output.column ?? 1 })})` : '';
		problem = (
			<div role="alert" className="flex flex-col gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
				<p>
					{fillTemplate(m.formatFailed, { language: languageLabel(output.language), message: output.message })}
					{where}
				</p>
				<p className="text-xs">{m.inputKept}</p>
				{output.line && (
					<div>
						<Button type="button" size="lg" variant="outline" onClick={jumpToError}>
							{m.jumpToError}
						</Button>
					</div>
				)}
			</div>
		);
	} else if (output.phase === 'ambiguous') {
		problem = (
			<div role="alert" className="flex flex-col gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
				<p>
					{output.candidates.length > 0
						? fillTemplate(m.ambiguousCandidates, { list: output.candidates.map(languageLabel).join(', ') })
						: m.ambiguous}
				</p>
				{output.candidates.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{output.candidates.map((c) => (
							<Button
								key={c}
								type="button"
								size="lg"
								variant="outline"
								onClick={() => {
									update('language', c);
									void run('format', { language: c });
								}}
							>
								{fillTemplate(m.formatAs, { language: languageLabel(c) })}
							</Button>
						))}
					</div>
				)}
			</div>
		);
	} else if (output.phase === 'empty') {
		problem = (
			<p role="alert" className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
				{m.emptyInput}
			</p>
		);
	} else if (output.phase === 'tooLarge') {
		problem = (
			<p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{fillTemplate(m.tooLarge, { chars: output.chars.toLocaleString(), max: FORMAT_MAX_CHARS.toLocaleString() })}
			</p>
		);
	} else if (output.phase === 'failure') {
		problem = (
			<p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{output.kind === 'timeout' ? m.timeout : m.workerError}
			</p>
		);
	}

	const sampleLabel = (id: SampleId) => (id === 'broken' ? m.sampleBroken : languageLabel(id));
	const showWidth = supportsPrintWidth(activeLanguage) || activeLanguage === null;
	const showDialect = activeLanguage === 'sql';
	const canMinify = supportsMinify(activeLanguage);

	return (
		<div className="flex flex-col gap-4">
			<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">{m.privacyNote}</p>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Field id="cf-language" label={m.languageLabel}>
					<select id="cf-language" className={fieldCls} value={settings.language} onChange={(e) => update('language', e.target.value as LanguageChoice)}>
						<option value="auto">{m.languageAuto}</option>
						{FORMAT_LANGUAGES.map((l) => (
							<option key={l.id} value={l.id}>
								{l.label}
							</option>
						))}
					</select>
				</Field>
				<Field id="cf-indent" label={m.indentLabel}>
					<select id="cf-indent" className={fieldCls} value={settings.indent} onChange={(e) => update('indent', e.target.value as IndentChoice)}>
						{INDENT_CHOICES.map((c) => (
							<option key={c} value={c}>
								{c === '2' ? m.indent2 : c === '4' ? m.indent4 : m.indentTab}
							</option>
						))}
					</select>
				</Field>
				{showWidth && (
					<Field id="cf-width" label={m.widthLabel}>
						<select id="cf-width" className={fieldCls} value={settings.printWidth} onChange={(e) => update('printWidth', Number(e.target.value))}>
							{PRINT_WIDTHS.map((w) => (
								<option key={w} value={w}>
									{w}
								</option>
							))}
						</select>
					</Field>
				)}
				{showDialect && (
					<Field id="cf-dialect" label={m.sqlDialectLabel}>
						<select id="cf-dialect" className={fieldCls} value={settings.sqlDialect} onChange={(e) => update('sqlDialect', e.target.value as SqlDialect)}>
							{SQL_DIALECTS.map((d) => (
								<option key={d.id} value={d.id}>
									{d.id === 'sql' ? m.sqlDialectStandard : d.label}
								</option>
							))}
						</select>
					</Field>
				)}
			</div>
			<div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
				<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
					<input type="checkbox" className="size-4" checked={settings.autoFormat} onChange={(e) => update('autoFormat', e.target.checked)} />
					{m.autoFormat}
				</label>
				{settings.autoFormat && input.length > AUTO_FORMAT_MAX_CHARS && <span className="text-xs text-amber-800 dark:text-amber-300">{m.autoFormatPaused}</span>}
				<Button
					type="button"
					size="lg"
					variant="ghost"
					onClick={() => setSettings(DEFAULT_SETTINGS)}
				>
					{m.resetOptions}
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">{m.optionsNote}</p>

			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" size="lg" onClick={() => void run('format')}>
					{m.format}
					<span className="ml-1.5 hidden text-xs opacity-70 sm:inline">{m.runHint}</span>
				</Button>
				{canMinify && (
					<Button type="button" size="lg" variant="secondary" onClick={() => void run('minify')}>
						{m.minify}
					</Button>
				)}
				<p role="status" aria-live="polite" className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
					{detectedText}
				</p>
			</div>

			{sizeState === 'warn' && (
				<p role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
					{fillTemplate(m.sizeWarn, { chars: input.length.toLocaleString(), warn: FORMAT_WARN_CHARS.toLocaleString() })}
				</p>
			)}

			<div className="grid gap-4 lg:grid-cols-2">
				<div
					className={`flex min-w-0 flex-col gap-2 rounded-lg border-2 border-dashed p-3 transition-colors ${isDragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
					onDragOver={(e) => {
						e.preventDefault();
						setIsDragOver(true);
					}}
					onDragLeave={() => setIsDragOver(false)}
					onDrop={(e) => {
						e.preventDefault();
						setIsDragOver(false);
						readFile(e.dataTransfer.files);
					}}
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<label htmlFor="cf-input" className="text-sm font-medium text-foreground">
							{m.inputLabel}
						</label>
						<span className="text-xs text-muted-foreground">{inputStats}</span>
					</div>
					<SqlLineArea
						id="cf-input"
						label={m.inputLabel}
						value={input}
						onChange={(v) => {
							setInput(v);
							setNotice(null);
						}}
						placeholder={m.inputPlaceholder}
						errorLines={errorLines}
						textareaRef={inputRef}
						describedBy="cf-drop-hint"
					/>
					<p id="cf-drop-hint" className="text-xs text-muted-foreground">
						{m.dropHint}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<label
							htmlFor="cf-file-input"
							className="has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring inline-flex h-11 cursor-pointer items-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-accent sm:h-9"
						>
							{m.chooseFile}
						</label>
						<input
							id="cf-file-input"
							type="file"
							accept={FILE_ACCEPT}
							className="sr-only"
							onChange={(e) => {
								readFile(e.target.files);
								e.target.value = '';
							}}
						/>
						<Button type="button" size="lg" variant="outline" onClick={() => void pasteFromClipboard()}>
							{m.paste}
						</Button>
						<select
							aria-label={m.loadSample}
							className="h-11 min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
							value=""
							onChange={(e) => {
								const id = e.target.value as SampleId;
								if (id in SAMPLES) replaceInput(SAMPLES[id]);
							}}
						>
							<option value="">{m.loadSample}</option>
							{SAMPLE_IDS.map((id) => (
								<option key={id} value={id}>
									{sampleLabel(id)}
								</option>
							))}
						</select>
						<Button type="button" size="lg" variant="ghost" disabled={input === ''} onClick={() => replaceInput('')}>
							{m.clear}
						</Button>
						{undoValue !== null && (
							<Button
								type="button"
								size="lg"
								variant="ghost"
								onClick={() => {
									seqRef.current++;
									setInput(undoValue.text);
									setFileName(undoValue.fileName);
									setUndoValue(null);
									setOutput({ phase: 'idle' });
								}}
							>
								{m.undo}
							</Button>
						)}
					</div>
					{notice && (
						<p role="status" aria-live="polite" className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
							{notice}
						</p>
					)}
				</div>

				<div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<label htmlFor="cf-output" className="text-sm font-medium text-foreground">
							{outputLabel}
						</label>
						{outputStats && <span className="text-xs text-muted-foreground">{outputStats}</span>}
					</div>
					<SqlLineArea id="cf-output" label={outputLabel} value={doneText} readOnly placeholder={m.outputPlaceholder} />
					<div role="status" aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
						{statusText}
						{doneOutput?.duplicateKeys && <span className="block text-amber-800 dark:text-amber-300">{m.duplicateKeys}</span>}
					</div>
					{problem}
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" size="lg" variant="secondary" disabled={doneText === ''} onClick={() => void copy(doneText)}>
							<span aria-live="polite">{copied ? m.copied : copyFailed ? m.copyFailed : m.copy}</span>
						</Button>
						<Button type="button" size="lg" variant="outline" disabled={doneText === ''} onClick={download}>
							{fillTemplate(m.download, { ext: doneOutput ? FILE_EXTENSION[doneOutput.language] : '…' })}
						</Button>
						{diffHash && (
							<a
								href={`${textDiffHref}#${diffHash}`}
								target="_blank"
								rel="noopener"
								className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium text-primary hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9"
							>
								{m.compareDiff}
							</a>
						)}
						{doneOutput && compareTooLarge && <span className="text-xs text-muted-foreground">{m.compareTooLarge}</span>}
					</div>
				</div>
			</div>
		</div>
	);
}
