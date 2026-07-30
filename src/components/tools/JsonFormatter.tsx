import { useEffect, useRef, useState } from 'react';
import type JSONEditor from 'jsoneditor/dist/jsoneditor-minimalist.js';
import type { JSONEditorMode, ParseError, SchemaValidationError } from 'jsoneditor';
import 'jsoneditor/dist/jsoneditor.min.css';
import './jsoneditor-a11y.css';
import { Button } from '@/components/ui/button';

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

function xmlEscape(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlTagName(key: string): string {
	const cleaned = key.replace(/[^a-zA-Z0-9_.-]/g, '_');
	return /^[a-zA-Z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function jsonToXml(value: unknown, tagName: string, depth: number): string {
	const indent = '  '.repeat(depth);
	if (value === null || value === undefined) return `${indent}<${tagName} />`;
	if (Array.isArray(value)) {
		if (value.length === 0) return `${indent}<${tagName} />`;
		const items = value.map((item) => jsonToXml(item, 'item', depth + 1)).join('\n');
		return `${indent}<${tagName}>\n${items}\n${indent}</${tagName}>`;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return `${indent}<${tagName} />`;
		const children = entries.map(([key, val]) => jsonToXml(val, xmlTagName(key), depth + 1)).join('\n');
		return `${indent}<${tagName}>\n${children}\n${indent}</${tagName}>`;
	}
	return `${indent}<${tagName}>${xmlEscape(String(value))}</${tagName}>`;
}

function convertJsonToXml(json: unknown): string {
	return `<?xml version="1.0" encoding="UTF-8"?>\n${jsonToXml(json, 'root', 0)}`;
}

function yamlScalar(value: unknown): string {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'boolean' || typeof value === 'number') return String(value);
	const str = String(value);
	if (str === '') return "''";
	const needsQuoting =
		/^\s|\s$/.test(str) ||
		/^(true|false|null|yes|no|on|off|~)$/i.test(str) ||
		/^[-?:,[\]{}#&*!|>'"%@`]/.test(str) ||
		/: |:$/.test(str) ||
		/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(str) ||
		/\n/.test(str);
	if (!needsQuoting) return str;
	return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function yamlScalarOrEmptyContainer(value: unknown): string {
	if (Array.isArray(value)) return '[]';
	if (value !== null && typeof value === 'object') return '{}';
	return yamlScalar(value);
}

function jsonToYamlLines(value: unknown, depth: number): string[] {
	const indent = '  '.repeat(depth);
	if (Array.isArray(value)) {
		if (value.length === 0) return [`${indent}[]`];
		const lines: string[] = [];
		for (const item of value) {
			const isNestedNonEmpty =
				(Array.isArray(item) && item.length > 0) ||
				(item !== null && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length > 0);
			if (isNestedNonEmpty) {
				const childLines = jsonToYamlLines(item, depth + 1);
				childLines[0] = `${indent}- ${childLines[0].slice(indent.length + 2)}`;
				lines.push(...childLines);
			} else {
				lines.push(`${indent}- ${yamlScalarOrEmptyContainer(item)}`);
			}
		}
		return lines;
	}
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return [`${indent}{}`];
		const lines: string[] = [];
		for (const [key, val] of entries) {
			const keyStr = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : yamlScalar(key);
			const isNestedNonEmpty =
				(Array.isArray(val) && val.length > 0) ||
				(val !== null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0);
			if (isNestedNonEmpty) {
				lines.push(`${indent}${keyStr}:`);
				lines.push(...jsonToYamlLines(val, depth + 1));
			} else {
				lines.push(`${indent}${keyStr}: ${yamlScalarOrEmptyContainer(val)}`);
			}
		}
		return lines;
	}
	return [`${indent}${yamlScalar(value)}`];
}

function convertJsonToYaml(json: unknown): string {
	if (json !== null && typeof json === 'object' && Object.keys(json as object).length === 0) {
		return Array.isArray(json) ? '[]' : '{}';
	}
	return jsonToYamlLines(json, 0).join('\n');
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
		} else {
			result[fullKey] = value;
		}
	}
	return result;
}

function csvCell(value: unknown): string {
	if (value === undefined || value === null) return '';
	const str = Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : String(value);
	return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// CSV is inherently tabular, so a JSON array of objects becomes one row per object
// (nested objects flattened with dot-notation keys, arrays kept as a stringified cell
// since a single CSV cell can't represent a list); a single object becomes one row; any
// other JSON becomes a single "value" column.
function convertJsonToCsv(json: unknown): string {
	let rows: Record<string, unknown>[];
	if (Array.isArray(json)) {
		rows = json.map((item) =>
			item !== null && typeof item === 'object' && !Array.isArray(item)
				? flattenObject(item as Record<string, unknown>)
				: { value: item },
		);
	} else if (json !== null && typeof json === 'object') {
		rows = [flattenObject(json as Record<string, unknown>)];
	} else {
		rows = [{ value: json }];
	}

	const headers: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!headers.includes(key)) headers.push(key);
		}
	}
	if (headers.length === 0) return '';

	const lines = [headers.map(csvCell).join(',')];
	for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
	return lines.join('\n');
}

const CONVERTERS: Record<ExportFormat, (json: unknown) => string> = {
	xml: convertJsonToXml,
	yaml: convertJsonToYaml,
	csv: convertJsonToCsv,
};

const EXPORT_MIME: Record<ExportFormat, string> = {
	xml: 'application/xml',
	yaml: 'application/x-yaml',
	csv: 'text/csv',
};

interface DiffEntry {
	path: string;
	type: 'added' | 'removed' | 'changed';
	leftValue?: unknown;
	rightValue?: unknown;
}

function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	// Cheap deep-equality: fine here since diffJson already recurses into every
	// object/array itself — this only ever runs on values BOTH sides agree are
	// primitives (or one/both aren't objects), never on a full nested tree.
	return JSON.stringify(a) === JSON.stringify(b);
}

// Structural diff between two parsed JSON values — walks both trees in
// parallel, reporting one entry per key/index that was added, removed, or
// whose value changed. Deliberately not a full LCS-style array diff (no
// reordering detection): index-by-index comparison is what every "compare
// two JSON" tool actually shows, since JSON arrays are rarely reordered
// on purpose the way text lines are.
function diffJson(a: unknown, b: unknown, path = '$'): DiffEntry[] {
	if (valuesEqual(a, b)) return [];
	const aIsObj = a !== null && typeof a === 'object';
	const bIsObj = b !== null && typeof b === 'object';
	if (!aIsObj || !bIsObj) return [{ path, type: 'changed', leftValue: a, rightValue: b }];

	const aIsArr = Array.isArray(a);
	const bIsArr = Array.isArray(b);
	if (aIsArr !== bIsArr) return [{ path, type: 'changed', leftValue: a, rightValue: b }];

	const entries: DiffEntry[] = [];
	if (aIsArr) {
		const aArr = a as unknown[];
		const bArr = b as unknown[];
		const maxLen = Math.max(aArr.length, bArr.length);
		for (let i = 0; i < maxLen; i++) {
			const childPath = `${path}[${i}]`;
			if (i >= aArr.length) entries.push({ path: childPath, type: 'added', rightValue: bArr[i] });
			else if (i >= bArr.length) entries.push({ path: childPath, type: 'removed', leftValue: aArr[i] });
			else entries.push(...diffJson(aArr[i], bArr[i], childPath));
		}
	} else {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		for (const key of new Set([...Object.keys(aObj), ...Object.keys(bObj)])) {
			const childPath = `${path}.${key}`;
			if (!(key in aObj)) entries.push({ path: childPath, type: 'added', rightValue: bObj[key] });
			else if (!(key in bObj)) entries.push({ path: childPath, type: 'removed', leftValue: aObj[key] });
			else entries.push(...diffJson(aObj[key], bObj[key], childPath));
		}
	}
	return entries;
}

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
	const [copied, setCopied] = useState(false);
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
		setExportResult(CONVERTERS[format](json));
	};

	const handleCompare = () => {
		setCompareError(null);
		setDiffResult(null);
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
		setDiffResult(diffJson(leftJson, rightJson));
	};

	const handleCopy = () => {
		if (exportResult === null) return;
		void navigator.clipboard.writeText(exportResult).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
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
						<div className="flex items-center justify-between">
							<span className="text-xs uppercase text-muted-foreground">{exportFormat}</span>
							<div className="flex gap-2">
								<Button type="button" size="sm" variant="ghost" onClick={handleCopy}>
									{copied ? messages.copied : messages.copy}
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={handleDownload}>
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
