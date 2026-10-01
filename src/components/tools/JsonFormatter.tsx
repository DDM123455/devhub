import { useEffect, useRef, useState } from 'react';
import type JSONEditor from 'jsoneditor/dist/jsoneditor-minimalist.js';
import type { JSONEditorMode, ParseError, SchemaValidationError } from 'jsoneditor';
import 'jsoneditor/dist/jsoneditor.min.css';
import './jsoneditor-a11y.css';
import { Button } from '@/components/ui/button';
import {
	analyzeJsonText,
	convertJsonToCsvDetailed,
	convertJsonToXml,
	convertJsonToYaml,
	diffJson,
	type DiffEntry,
	type JsonTextWarnings,
} from '@/lib/json-convert';
import { useCopyToClipboard } from './useCopyToClipboard';

interface Messages {
	heading: string;
	themeNotice: string;
	errorWithLine: string;
	errorNoLine: string;
	goToErrorLine: string;
	exportHeading: string;
	exportXml: string;
	exportYaml: string;
	exportCsv: string;
	exportInvalidJson: string;
	copy: string;
	copied: string;
	download: string;
	validJsonBadge: string;
	invalidJsonBadge: string;
	compareHeading: string;
	compareToggle: string;
	compareInputLabel: string;
	compareInputPlaceholder: string;
	compareButton: string;
	compareInvalidLeft: string;
	compareInvalidRight: string;
	compareIdentical: string;
	compareDiffCount: string;
	compareAdded: string;
	compareRemoved: string;
	compareChanged: string;
	warnUnsafeNumbers: string;
	warnDuplicateKeys: string;
	warnCsvCollisions: string;
	copyFailed: string;
	copyExportAria: string;
	downloadExportAria: string;
}

type ExportFormat = 'xml' | 'yaml' | 'csv';

const SAMPLE_JSON = {
	name: 'Web Tool Hub',
	tools: ['compress', 'convert', 'merge-pdf'],
	privacyFirst: true,
};

function isParseError(error: SchemaValidationError | ParseError): error is ParseError {
	return error.type === 'error';
}

function lineToCharRange(text: string, oneIndexedLine: number): { start: number; end: number } | null {
	const lines = text.split('\n');
	const index = oneIndexedLine - 1;
	if (index < 0 || index >= lines.length) return null;
	let start = 0;
	for (let i = 0; i < index; i++) start += lines[i].length + 1;
	return { start, end: start + lines[index].length };
}

const CONVERTERS: Record<ExportFormat, (json: unknown) => { text: string; collisions: string[] }> = {
	xml: (json) => ({ text: convertJsonToXml(json), collisions: [] }),
	yaml: (json) => ({ text: convertJsonToYaml(json), collisions: [] }),
	csv: convertJsonToCsvDetailed,
};

const EXPORT_MIME: Record<ExportFormat, string> = {
	xml: 'application/xml',
	yaml: 'application/x-yaml',
	csv: 'text/csv',
};

function diffValueLabel(value: unknown): string {
	if (value === undefined) return '—';
	if (value !== null && typeof value === 'object') return JSON.stringify(value);
	return JSON.stringify(value);
}

// jsoneditor's UMD bundle touches `self` at module load time, which only
// exists in the browser. Astro still server-renders `client:load` islands
// once during the build to produce the initial HTML, so the library must be
// loaded with a dynamic import() inside an effect (which never runs during
// that server pass) instead of a static top-level import — otherwise the
// build itself crashes in Node with "self is not defined".
export default function JsonFormatter({ messages }: { messages: Messages }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<JSONEditor | null>(null);
	const [mode, setMode] = useState<JSONEditorMode>('text');
	const [parseError, setParseError] = useState<{ line?: number; message: string } | null>(null);
	const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
	const [exportResult, setExportResult] = useState<string | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const { copied, failed: copyFailed, copy } = useCopyToClipboard();
	const [exportWarnings, setExportWarnings] = useState<JsonTextWarnings & { collisions: string[] }>({
		unsafeNumbers: false,
		duplicateKeys: false,
		collisions: [],
	});
	const [compareWarnings, setCompareWarnings] = useState<JsonTextWarnings | null>(null);
	const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid' | null>(null);
	const [showCompare, setShowCompare] = useState(false);
	const [compareInput, setCompareInput] = useState('');
	const [compareError, setCompareError] = useState<string | null>(null);
	const [diffResult, setDiffResult] = useState<DiffEntry[] | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;
		let cancelled = false;

		// jsoneditor's "text" mode textarea has no accessible name of its own, and it
		// gets torn down/recreated whenever the mode toggles back to "text" — a
		// MutationObserver re-labels it every time it (re)appears instead of relying
		// on fragile timing around onModeChange.
		const observer = new MutationObserver(() => {
			const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>('textarea.jsoneditor-text');
			if (textarea && !textarea.getAttribute('aria-label')) {
				textarea.setAttribute('aria-label', messages.heading);
			}
		});
		observer.observe(containerRef.current, { childList: true, subtree: true });

		void import('jsoneditor/dist/jsoneditor-minimalist.js').then(({ default: JSONEditorCtor }) => {
			if (cancelled || !containerRef.current) return;
			const editor = new JSONEditorCtor(containerRef.current, {
				modes: ['text', 'tree'],
				mode: 'text',
				mainMenuBar: true,
				navigationBar: true,
				statusBar: true,
				indentation: 2,
				onModeChange: (newMode) => {
					setMode(newMode);
					if (newMode !== 'text') setParseError(null);
				},
				onChange: () => {
					setExportResult(null);
					setExportError(null);
				},
				onValidationError: (errors) => {
					const parseErr = errors.find(isParseError);
					setParseError(parseErr ? { line: parseErr.line, message: parseErr.message.replace(/<br>/g, ' ') } : null);
					setValidationStatus(errors.length === 0 ? 'valid' : 'invalid');
				},
				// Without this, jsoneditor's default error handler is `window.alert(err)`
				// (see its `_onError`) — a *synchronous, blocking* native dialog fired by
				// the Format/Compact/Sort/Transform buttons (and Ctrl+I/Ctrl+Shift+I) the
				// moment the current text isn't valid JSON. That reads as the whole tab
				// freezing: no console error, nothing in the DOM to click, and it doesn't
				// go away until the (invisible, off-page) dialog is dismissed — confirmed
				// by reproducing it with Puppeteer, where a real mouse click on the
				// "Format" button hung the page indefinitely while the same action via a
				// synthetic Ctrl+I keydown did not (the alert-triggering code path is only
				// reached through the toolbar button's onclick / the internal keydown
				// handler that also calls `format()`, both of which land here). The parse
				// error itself is already surfaced non-blockingly via `onValidationError`
				// above, so this only needs to swallow it instead of alerting.
				onError: (err) => {
					console.error('JSON Formatter action failed:', err);
				},
			});
			editor.set(SAMPLE_JSON);
			editorRef.current = editor;
		});

		return () => {
			cancelled = true;
			observer.disconnect();
			editorRef.current?.destroy();
			editorRef.current = null;
		};
	}, [messages.heading]);

	const handleGoToErrorLine = () => {
		if (!parseError?.line || !editorRef.current || !containerRef.current) return;
		const text = editorRef.current.getText();
		const range = lineToCharRange(text, parseError.line);
		const textarea = containerRef.current.querySelector<HTMLTextAreaElement>('textarea.jsoneditor-text');
		if (!range || !textarea) return;
		textarea.focus();
		textarea.setSelectionRange(range.start, range.end);
		const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 18;
		textarea.scrollTop = Math.max(0, (parseError.line - 1) * lineHeight - textarea.clientHeight / 2);
	};

	const handleExport = (format: ExportFormat) => {
		setExportFormat(format);
		setExportError(null);
		setExportResult(null);
		if (!editorRef.current) return;
		let json: unknown;
		try {
			json = editorRef.current.get();
		} catch {
			setExportError(messages.exportInvalidJson);
			return;
		}
		const converted = CONVERTERS[format](json);
		setExportWarnings({ ...analyzeJsonText(editorRef.current.getText()), collisions: converted.collisions });
		setExportResult(converted.text);
	};

	const handleCompare = () => {
		setCompareError(null);
		setDiffResult(null);
		setCompareWarnings(null);
		if (!editorRef.current) return;
		let leftJson: unknown;
		try {
			leftJson = editorRef.current.get();
		} catch {
			setCompareError(messages.compareInvalidLeft);
			return;
		}
		let rightJson: unknown;
		try {
			rightJson = JSON.parse(compareInput);
		} catch {
			setCompareError(messages.compareInvalidRight);
			return;
		}
		const left = analyzeJsonText(editorRef.current.getText());
		const right = analyzeJsonText(compareInput);
		setCompareWarnings({
			unsafeNumbers: left.unsafeNumbers || right.unsafeNumbers,
			duplicateKeys: left.duplicateKeys || right.duplicateKeys,
		});
		setDiffResult(diffJson(leftJson, rightJson));
	};

	const handleCopy = () => {
		if (exportResult === null) return;
		void copy(exportResult);
	};

	const handleDownload = () => {
		if (exportResult === null || !exportFormat) return;
		const blob = new Blob([exportResult], { type: EXPORT_MIME[exportFormat] });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `data.${exportFormat}`;
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-3">
			<div ref={containerRef} className="h-[550px] w-full overflow-hidden rounded-md border border-border" />
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground">{messages.themeNotice}</p>
				{validationStatus === 'valid' && (
					<span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
						✓ {messages.validJsonBadge}
					</span>
				)}
				{validationStatus === 'invalid' && (
					<span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
						✗ {messages.invalidJsonBadge}
					</span>
				)}
			</div>

			{parseError && mode === 'text' && (
				<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					<span>
						{parseError.line
							? messages.errorWithLine
									.replace('{{line}}', String(parseError.line))
									.replace('{{message}}', parseError.message)
							: messages.errorNoLine.replace('{{message}}', parseError.message)}
					</span>
					{parseError.line && (
						<Button type="button" size="sm" variant="outline" onClick={handleGoToErrorLine}>
							{messages.goToErrorLine}
						</Button>
					)}
				</div>
			)}

			<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.exportHeading}</span>
				<div className="flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="outline" onClick={() => handleExport('xml')}>
						{messages.exportXml}
					</Button>
					<Button type="button" size="sm" variant="outline" onClick={() => handleExport('yaml')}>
						{messages.exportYaml}
					</Button>
					<Button type="button" size="sm" variant="outline" onClick={() => handleExport('csv')}>
						{messages.exportCsv}
					</Button>
				</div>

				{exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}

				{exportResult !== null && exportFormat && (
											<div className="flex flex-col gap-2">
							{(exportWarnings.unsafeNumbers || exportWarnings.duplicateKeys || exportWarnings.collisions.length > 0) && (
								<ul role="status" className="list-disc rounded-md border border-amber-500/40 bg-amber-500/10 p-2 pl-6 text-xs text-amber-800 dark:text-amber-300">
									{exportWarnings.unsafeNumbers && <li>{messages.warnUnsafeNumbers}</li>}
									{exportWarnings.duplicateKeys && <li>{messages.warnDuplicateKeys}</li>}
									{exportWarnings.collisions.length > 0 && (
										<li>{messages.warnCsvCollisions.replace('{{keys}}', exportWarnings.collisions.slice(0, 5).join(', '))}</li>
									)}
								</ul>
							)}
							<div className="flex items-center justify-between">
								<span className="text-xs uppercase text-muted-foreground">{exportFormat}</span>
							<div className="flex gap-2">
								<Button type="button" size="sm" variant="ghost" aria-live="polite" aria-label={messages.copyExportAria.replace('{{format}}', exportFormat.toUpperCase())} onClick={handleCopy}>
									{copied ? messages.copied : copyFailed ? messages.copyFailed : messages.copy}
								</Button>
								<Button type="button" size="sm" variant="ghost" aria-label={messages.downloadExportAria.replace('{{format}}', exportFormat.toUpperCase())} onClick={handleDownload}>
									{messages.download}
								</Button>
							</div>
						</div>
						<textarea
							readOnly
							value={exportResult}
							rows={10}
							className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
						/>
					</div>
				)}
			</div>

			<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium text-foreground">{messages.compareHeading}</span>
					<Button type="button" size="sm" variant="outline" onClick={() => setShowCompare((v) => !v)}>
						{messages.compareToggle}
					</Button>
				</div>
				{showCompare && (
					<div className="flex flex-col gap-2">
						<div className="flex flex-col gap-1">
							<label htmlFor="json-compare-input" className="text-xs text-muted-foreground">
								{messages.compareInputLabel}
							</label>
							<textarea
								id="json-compare-input"
								value={compareInput}
								onChange={(e) => setCompareInput(e.target.value)}
								placeholder={messages.compareInputPlaceholder}
								rows={6}
								spellCheck={false}
								className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
							/>
						</div>
						<div>
							<Button type="button" size="sm" onClick={handleCompare}>
								{messages.compareButton}
							</Button>
						</div>
						{compareError && <p role="alert" className="text-sm text-destructive">{compareError}</p>}
													{diffResult && compareWarnings && (compareWarnings.unsafeNumbers || compareWarnings.duplicateKeys) && (
								<ul role="status" className="list-disc rounded-md border border-amber-500/40 bg-amber-500/10 p-2 pl-6 text-xs text-amber-800 dark:text-amber-300">
									{compareWarnings.unsafeNumbers && <li>{messages.warnUnsafeNumbers}</li>}
									{compareWarnings.duplicateKeys && <li>{messages.warnDuplicateKeys}</li>}
								</ul>
							)}
							{diffResult && diffResult.length === 0 && (
							<p role="status" className="text-sm text-primary">{messages.compareIdentical}</p>
						)}
						{diffResult && diffResult.length > 0 && (
							<div className="flex flex-col gap-1">
								<p className="text-xs text-muted-foreground">
									{messages.compareDiffCount.replace('{{count}}', String(diffResult.length))}
								</p>
								<ul className="flex flex-col gap-1 rounded-md border border-border p-2 font-mono text-xs">
									{diffResult.map((entry, i) => (
										<li key={i} className="flex flex-wrap items-baseline gap-1.5">
											<span
												className={
													entry.type === 'added'
														? 'text-emerald-600 dark:text-emerald-400'
														: entry.type === 'removed'
															? 'text-destructive'
															: 'text-amber-600 dark:text-amber-400'
												}
											>
												{entry.type === 'added'
													? messages.compareAdded
													: entry.type === 'removed'
														? messages.compareRemoved
														: messages.compareChanged}
											</span>
											<span className="text-foreground">{entry.path}</span>
											{entry.type === 'changed' && (
												<span className="text-muted-foreground">
													{diffValueLabel(entry.leftValue)} → {diffValueLabel(entry.rightValue)}
												</span>
											)}
											{entry.type === 'added' && (
												<span className="text-muted-foreground">{diffValueLabel(entry.rightValue)}</span>
											)}
											{entry.type === 'removed' && (
												<span className="text-muted-foreground">{diffValueLabel(entry.leftValue)}</span>
											)}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
