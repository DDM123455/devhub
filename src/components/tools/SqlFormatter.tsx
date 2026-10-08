import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
	DEFAULT_FORMAT_SETTINGS,
	EXPRESSION_WIDTH_RANGE,
	sanitizeSettings,
	type CaseOption,
	type FormatSettings,
} from '@/lib/sql-format';
import {
	FORMAT_LANGUAGES,
	PARSER_DIALECTS,
	buildDownloadFilename,
	isValidateChoice,
	resolveParserDialect,
	type FormatLanguage,
	type ParserDialect,
	type ValidateChoice,
} from '@/lib/sql-dialects';
import { SQL_SAMPLE_IDS, SQL_SAMPLES, type SqlSampleId } from '@/lib/sql-samples';
import type { SqlErrorInfo } from '@/lib/sql-validate';
import { useCopyToClipboard } from './useCopyToClipboard';
import { useSqlWorker } from './useSqlWorker';
import SqlLineArea from './SqlLineArea';
import SqlValidationPanel, { tpl, type ValidationMessages, type ValidationState } from './SqlValidationPanel';

interface Messages extends ValidationMessages {
	privacyNote: string;
	inputLabel: string;
	inputPlaceholder: string;
	dropHint: string;
	outputLabelFormat: string;
	outputLabelMinify: string;
	outputPlaceholder: string;
	chooseFile: string;
	samplePlaceholder: string;
	samples: Record<SqlSampleId, string>;
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
	autoOffNotice: string;
	checkNow: string;
	fileTooLarge: string;
	fileReadError: string;
	optionsHeading: string;
	resetOptions: string;
	dialectLabel: string;
	dialectStandard: string;
	validateAsLabel: string;
	validateAuto: string;
	indentLabel: string;
	indent2: string;
	indent4: string;
	indentTab: string;
	keywordCaseLabel: string;
	dataTypeCaseLabel: string;
	functionCaseLabel: string;
	caseUpper: string;
	caseLower: string;
	casePreserve: string;
	commaLabel: string;
	commaAfter: string;
	commaBefore: string;
	indentStyleLabel: string;
	styleStandard: string;
	styleTabularLeft: string;
	styleTabularRight: string;
	logicalOpLabel: string;
	logicalBefore: string;
	logicalAfter: string;
	widthLabel: string;
	linesBetweenLabel: string;
	denseOperators: string;
	newlineBeforeSemicolon: string;
	paramStyleLabel: string;
	paramAuto: string;
	paramPositional: string;
	paramDollar: string;
	paramColon: string;
	paramAt: string;
	keepComments: string;
	statsLines: string;
	statsMinify: string;
	formatInvalidWarning: string;
	formatFailed: string;
}

// Tên riêng của hệ quản trị — không dịch.
const LANGUAGE_NAMES: Record<Exclude<FormatLanguage, 'sql'>, string> = {
	bigquery: 'Google BigQuery',
	clickhouse: 'ClickHouse',
	db2: 'IBM Db2',
	db2i: 'IBM Db2 for i',
	duckdb: 'DuckDB',
	hive: 'Apache Hive',
	mariadb: 'MariaDB',
	mysql: 'MySQL',
	n1ql: 'Couchbase N1QL',
	plsql: 'Oracle PL/SQL',
	postgresql: 'PostgreSQL',
	redshift: 'Amazon Redshift',
	singlestoredb: 'SingleStoreDB',
	snowflake: 'Snowflake',
	spark: 'Apache Spark SQL',
	sqlite: 'SQLite',
	tidb: 'TiDB',
	transactsql: 'SQL Server (T-SQL)',
	trino: 'Trino / Presto',
};

const PARSER_NAMES: Record<ParserDialect, string> = {
	athena: 'Amazon Athena',
	bigquery: 'Google BigQuery',
	db2: 'IBM Db2',
	flinksql: 'Apache Flink SQL',
	hive: 'Apache Hive',
	mariadb: 'MariaDB',
	mysql: 'MySQL',
	postgresql: 'PostgreSQL',
	redshift: 'Amazon Redshift',
	snowflake: 'Snowflake',
	sqlite: 'SQLite',
	transactsql: 'SQL Server (T-SQL)',
	trino: 'Trino / Presto',
};

const STORAGE_SETTINGS = 'sql-formatter:settings';
const STORAGE_DRAFT = 'sql-formatter:draft';
const DRAFT_MAX_CHARS = 200_000;
const AUTO_MAX_CHARS = 200_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEBOUNCE_MS = 450;
const WIDTH_PRESETS = [30, 50, 80, 120, 200];

type Mode = 'format' | 'minify';

type OutputState =
	| { phase: 'idle' }
	| { phase: 'running' }
	| { phase: 'done'; mode: Mode; text: string }
	| { phase: 'format-error'; message: string; line?: number; column?: number }
	| { phase: 'error'; kind: 'timeout' | 'worker' };

function humanBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function byteLength(s: string): number {
	return new TextEncoder().encode(s).length;
}

function lineCount(s: string): number {
	let n = 1;
	for (let i = s.indexOf('\n'); i !== -1; i = s.indexOf('\n', i + 1)) n++;
	return n;
}

const fieldCls = 'h-10 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring';
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

export default function SqlFormatter({ messages: m }: { messages: Messages }) {
	const [input, setInput] = useState('');
	const [settings, setSettings] = useState<FormatSettings>(DEFAULT_FORMAT_SETTINGS);
	const [validateChoice, setValidateChoice] = useState<ValidateChoice>('auto');
	const [mode, setMode] = useState<Mode>('format');
	const [loaded, setLoaded] = useState(false);
	const [output, setOutput] = useState<OutputState>({ phase: 'idle' });
	const [validation, setValidation] = useState<ValidationState>({ phase: 'idle' });
	const [undoValue, setUndoValue] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const { copied, failed: copyFailed, copy } = useCopyToClipboard();
	const { run } = useSqlWorker();
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const seqRef = useRef(0);
	const lastRunRef = useRef<{ input: string; settings: string; choice: ValidateChoice; mode: Mode } | null>(null);
	const latest = useRef({ input, settings, validateChoice, mode });
	latest.current = { input, settings, validateChoice, mode };

	const autoPaused = input.length > AUTO_MAX_CHARS;

	// ---- nạp cài đặt + bản nháp (chỉ phía client, sau khi hydrate)
	useEffect(() => {
		try {
			const raw = localStorage.getItem(STORAGE_SETTINGS);
			if (raw) {
				const parsed = JSON.parse(raw) as { settings?: unknown; validateChoice?: unknown; mode?: unknown };
				setSettings(sanitizeSettings(parsed.settings));
				if (isValidateChoice(parsed.validateChoice)) setValidateChoice(parsed.validateChoice);
				if (parsed.mode === 'minify') setMode('minify');
			}
			const draft = localStorage.getItem(STORAGE_DRAFT);
			if (draft) setInput(draft);
		} catch {
			/* localStorage bị chặn / dữ liệu hỏng: dùng mặc định */
		}
		setLoaded(true);
	}, []);

	useEffect(() => {
		if (!loaded) return;
		try {
			localStorage.setItem(STORAGE_SETTINGS, JSON.stringify({ settings, validateChoice, mode }));
		} catch {
			/* bỏ qua */
		}
	}, [settings, validateChoice, mode, loaded]);

	useEffect(() => {
		if (!loaded) return;
		const timer = setTimeout(() => {
			try {
				if (input === '' || input.length > DRAFT_MAX_CHARS) localStorage.removeItem(STORAGE_DRAFT);
				else localStorage.setItem(STORAGE_DRAFT, input);
			} catch {
				/* bỏ qua */
			}
		}, 600);
		return () => clearTimeout(timer);
	}, [input, loaded]);

	// ---- xử lý (validate + format/minify) trong worker
	const process = useCallback(
		(force: boolean, forcedMode?: Mode) => {
			const cur = latest.current;
			const runMode = forcedMode ?? cur.mode;
			const settingsJson = JSON.stringify(cur.settings);
			const last = lastRunRef.current;
			if (!force && last && last.input === cur.input && last.settings === settingsJson && last.choice === cur.validateChoice && last.mode === runMode) return;
			lastRunRef.current = { input: cur.input, settings: settingsJson, choice: cur.validateChoice, mode: runMode };
			const seq = ++seqRef.current;
			const sql = cur.input;
			if (sql.trim() === '') {
				setValidation({ phase: 'idle' });
				setOutput({ phase: 'idle' });
				return;
			}
			setValidation({ phase: 'checking' });
			setOutput((o) => (o.phase === 'done' ? o : { phase: 'running' }));
			const failKind = (e: unknown): 'timeout' | 'worker' => (e instanceof Error && e.message === 'timeout' ? 'timeout' : 'worker');

			const target = resolveParserDialect(cur.settings.language, cur.validateChoice);
			if (!target.parser) {
				setValidation({ phase: 'done', outcome: { status: 'no-parser' } });
			} else {
				const { parser, exact } = target;
				run(parser, { op: 'validate', sql }).then(
					(res) => {
						if (!res || seq !== seqRef.current) return;
						if (res.op === 'validate') setValidation({ phase: 'done', outcome: { status: 'report', report: res.report, parser, exact } });
						else setValidation({ phase: 'error', kind: 'worker' });
					},
					(e) => {
						if (seq !== seqRef.current) return;
						// Worker của dialect không tải/khởi động được => báo lỗi tải; timeout giữ riêng.
						if (failKind(e) === 'timeout') setValidation({ phase: 'error', kind: 'timeout' });
						else setValidation({ phase: 'done', outcome: { status: 'load-error' } });
					},
				);
			}
			const outP =
				runMode === 'format'
					? run('main', { op: 'format', sql, settings: cur.settings })
					: run('main', { op: 'minify', sql, language: cur.settings.language, keepComments: cur.settings.keepCommentsOnMinify });
			outP.then(
				(res) => {
					if (!res || seq !== seqRef.current) return;
					if (res.op === 'format') {
						if (res.result.ok) setOutput({ phase: 'done', mode: 'format', text: res.result.output });
						else setOutput({ phase: 'format-error', message: res.result.message, line: res.result.line, column: res.result.column });
					} else if (res.op === 'minify') setOutput({ phase: 'done', mode: 'minify', text: res.output });
					else setOutput({ phase: 'error', kind: 'worker' });
				},
				(e) => {
					if (seq === seqRef.current) setOutput({ phase: 'error', kind: failKind(e) });
				},
			);
		},
		[run],
	);

	// Tự chạy (debounce) khi gõ / đổi cài đặt — tạm dừng với input lớn.
	useEffect(() => {
		if (!loaded || autoPaused) return;
		const timer = setTimeout(() => process(false), DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [input, settings, validateChoice, mode, loaded, autoPaused, process]);

	// ---- thao tác nhập liệu
	const replaceInput = (next: string) => {
		if (input !== '' && next !== input) setUndoValue(input);
		setInput(next);
		setNotice(null);
	};

	const readFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		if (file.size > MAX_FILE_BYTES) {
			setNotice(tpl(m.fileTooLarge, { max: humanBytes(MAX_FILE_BYTES) }));
			return;
		}
		const reader = new FileReader();
		reader.onload = () => replaceInput(String(reader.result ?? ''));
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

	const runMode = (next: Mode) => {
		setMode(next);
		process(true, next);
	};

	const jumpTo = (error: SqlErrorInfo) => {
		const ta = inputRef.current;
		if (!ta) return;
		ta.focus();
		ta.setSelectionRange(error.offset, error.offset + error.length);
		const lineHeight = 20;
		ta.scrollTop = Math.max(0, (error.line - 1) * lineHeight - ta.clientHeight / 2);
		ta.scrollLeft = Math.max(0, (error.column - 1) * 7.3 - ta.clientWidth / 2);
	};

	const download = (text: string, kind: Mode) => {
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = buildDownloadFilename(kind === 'minify' ? 'minified' : 'formatted', settings.language);
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const update = <K extends keyof FormatSettings>(key: K, value: FormatSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

	// ---- giá trị dẫn xuất
	const dialectName = settings.language === 'sql' ? m.dialectStandard : LANGUAGE_NAMES[settings.language];
	const doneText = output.phase === 'done' ? output.text : '';
	const outputStats = useMemo(() => {
		if (output.phase !== 'done' || output.text === '') return null;
		if (output.mode === 'minify') {
			const before = byteLength(input);
			const after = byteLength(output.text);
			const percent = before > 0 ? Math.max(0, Math.round(((before - after) / before) * 100)) : 0;
			return tpl(m.statsMinify, { before: humanBytes(before), after: humanBytes(after), percent });
		}
		return tpl(m.statsLines, { lines: lineCount(output.text), bytes: humanBytes(byteLength(output.text)) });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [output, input]);

	const errorLines = useMemo(() => {
		const lines: number[] = [];
		if (validation.phase === 'done' && validation.outcome.status === 'report') {
			for (const r of validation.outcome.report.results) if (r.error) lines.push(r.error.line);
		}
		if (output.phase === 'format-error' && output.line) lines.push(output.line);
		return lines;
	}, [validation, output]);

	const showFormatWarning =
		output.phase === 'done' &&
		output.mode === 'format' &&
		validation.phase === 'done' &&
		validation.outcome.status === 'report' &&
		validation.outcome.report.status === 'invalid';

	const outputLabel = output.phase === 'done' && output.mode === 'minify' ? m.outputLabelMinify : mode === 'minify' ? m.outputLabelMinify : m.outputLabelFormat;
	const caseOptions = (id: string, label: string, value: CaseOption, key: 'keywordCase' | 'dataTypeCase' | 'functionCase') => (
		<Field id={id} label={label}>
			<select id={id} className={fieldCls} value={value} onChange={(e) => update(key, e.target.value as CaseOption)}>
				<option value="upper">{m.caseUpper}</option>
				<option value="lower">{m.caseLower}</option>
				<option value="preserve">{m.casePreserve}</option>
			</select>
		</Field>
	);

	const outputError =
		output.phase === 'format-error'
			? tpl(m.formatFailed, { message: output.message }) + (output.line ? ` (${tpl(m.errorAt, { line: output.line, column: output.column ?? 1 })})` : '')
			: output.phase === 'error'
				? output.kind === 'timeout'
					? m.workerTimeout
					: m.workerError
				: null;

	return (
		<div className="flex flex-col gap-4">
			<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">{m.privacyNote}</p>

			<details open className="rounded-lg border border-border p-4">
				<summary className="flex min-h-9 cursor-pointer items-center text-sm font-medium text-foreground">{m.optionsHeading}</summary>
				<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<Field id="sql-dialect" label={m.dialectLabel}>
						<select id="sql-dialect" className={fieldCls} value={settings.language} onChange={(e) => update('language', e.target.value as FormatLanguage)}>
							{FORMAT_LANGUAGES.map((l) => (
								<option key={l} value={l}>
									{l === 'sql' ? m.dialectStandard : LANGUAGE_NAMES[l]}
								</option>
							))}
						</select>
					</Field>
					<Field id="sql-validate-as" label={m.validateAsLabel}>
						<select id="sql-validate-as" className={fieldCls} value={validateChoice} onChange={(e) => setValidateChoice(e.target.value as ValidateChoice)}>
							<option value="auto">{m.validateAuto}</option>
							{PARSER_DIALECTS.map((p) => (
								<option key={p} value={p}>
									{PARSER_NAMES[p]}
								</option>
							))}
						</select>
					</Field>
					<Field id="sql-indent" label={m.indentLabel}>
						<select id="sql-indent" className={fieldCls} value={settings.indent} onChange={(e) => update('indent', e.target.value as FormatSettings['indent'])}>
							<option value="2">{m.indent2}</option>
							<option value="4">{m.indent4}</option>
							<option value="tab">{m.indentTab}</option>
						</select>
					</Field>
					<Field id="sql-comma" label={m.commaLabel}>
						<select id="sql-comma" className={fieldCls} value={settings.commaPosition} onChange={(e) => update('commaPosition', e.target.value as FormatSettings['commaPosition'])}>
							<option value="after">{m.commaAfter}</option>
							<option value="before">{m.commaBefore}</option>
						</select>
					</Field>
					{caseOptions('sql-kw-case', m.keywordCaseLabel, settings.keywordCase, 'keywordCase')}
					{caseOptions('sql-type-case', m.dataTypeCaseLabel, settings.dataTypeCase, 'dataTypeCase')}
					{caseOptions('sql-fn-case', m.functionCaseLabel, settings.functionCase, 'functionCase')}
					<Field id="sql-style" label={m.indentStyleLabel}>
						<select id="sql-style" className={fieldCls} value={settings.indentStyle} onChange={(e) => update('indentStyle', e.target.value as FormatSettings['indentStyle'])}>
							<option value="standard">{m.styleStandard}</option>
							<option value="tabularLeft">{m.styleTabularLeft}</option>
							<option value="tabularRight">{m.styleTabularRight}</option>
						</select>
					</Field>
					<Field id="sql-logical" label={m.logicalOpLabel}>
						<select id="sql-logical" className={fieldCls} value={settings.logicalOperatorNewline} onChange={(e) => update('logicalOperatorNewline', e.target.value as FormatSettings['logicalOperatorNewline'])}>
							<option value="before">{m.logicalBefore}</option>
							<option value="after">{m.logicalAfter}</option>
						</select>
					</Field>
					<Field id="sql-width" label={m.widthLabel}>
						<select id="sql-width" className={fieldCls} value={settings.expressionWidth} onChange={(e) => update('expressionWidth', Number(e.target.value))}>
							{(WIDTH_PRESETS.includes(settings.expressionWidth) ? WIDTH_PRESETS : [...WIDTH_PRESETS, settings.expressionWidth].sort((a, b) => a - b))
								.filter((w) => w >= EXPRESSION_WIDTH_RANGE.min && w <= EXPRESSION_WIDTH_RANGE.max)
								.map((w) => (
									<option key={w} value={w}>
										{w}
									</option>
								))}
						</select>
					</Field>
					<Field id="sql-lines-between" label={m.linesBetweenLabel}>
						<select id="sql-lines-between" className={fieldCls} value={settings.linesBetweenQueries} onChange={(e) => update('linesBetweenQueries', Number(e.target.value))}>
							{[0, 1, 2, 3].map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</Field>
					<Field id="sql-params" label={m.paramStyleLabel}>
						<select id="sql-params" className={fieldCls} value={settings.paramStyle} onChange={(e) => update('paramStyle', e.target.value as FormatSettings['paramStyle'])}>
							<option value="auto">{m.paramAuto}</option>
							<option value="positional">{m.paramPositional}</option>
							<option value="dollar">{m.paramDollar}</option>
							<option value="colon">{m.paramColon}</option>
							<option value="at">{m.paramAt}</option>
						</select>
					</Field>
				</div>
				<div className="mt-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
					<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
						<input type="checkbox" className="size-4" checked={settings.denseOperators} onChange={(e) => update('denseOperators', e.target.checked)} />
						{m.denseOperators}
					</label>
					<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
						<input type="checkbox" className="size-4" checked={settings.newlineBeforeSemicolon} onChange={(e) => update('newlineBeforeSemicolon', e.target.checked)} />
						{m.newlineBeforeSemicolon}
					</label>
					<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
						<input type="checkbox" className="size-4" checked={settings.keepCommentsOnMinify} onChange={(e) => update('keepCommentsOnMinify', e.target.checked)} />
						{m.keepComments}
					</label>
				</div>
				<div className="mt-2">
					<Button
						type="button"
						size="lg"
						variant="ghost"
						onClick={() => {
							setSettings(DEFAULT_FORMAT_SETTINGS);
							setValidateChoice('auto');
						}}
					>
						{m.resetOptions}
					</Button>
				</div>
			</details>

			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" size="lg" onClick={() => runMode('format')} aria-pressed={mode === 'format'}>
					{m.format}
					<span className="ml-1.5 hidden text-xs opacity-70 sm:inline">{m.runHint}</span>
				</Button>
				<Button type="button" size="lg" variant="secondary" onClick={() => runMode('minify')} aria-pressed={mode === 'minify'}>
					{m.minify}
				</Button>
				<Button type="button" size="lg" variant="outline" onClick={() => process(true)}>
					{m.checkNow}
				</Button>
			</div>

			{autoPaused && (
				<p role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
					{tpl(m.autoOffNotice, { size: humanBytes(byteLength(input)) })}
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
						<label htmlFor="sql-input" className="text-sm font-medium text-foreground">
							{m.inputLabel}
						</label>
						<span className="text-xs text-muted-foreground">{tpl(m.statsLines, { lines: lineCount(input), bytes: humanBytes(byteLength(input)) })}</span>
					</div>
					<SqlLineArea
						id="sql-input"
						label={m.inputLabel}
						value={input}
						onChange={(v) => {
							setInput(v);
							setNotice(null);
						}}
						placeholder={m.inputPlaceholder}
						errorLines={errorLines}
						textareaRef={inputRef}
						describedBy="sql-drop-hint"
						onKeyDown={(e) => {
							if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
								e.preventDefault();
								runMode(mode);
							}
						}}
					/>
					<p id="sql-drop-hint" className="text-xs text-muted-foreground">
						{m.dropHint}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<label
							htmlFor="sql-file-input"
							className="has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring inline-flex h-11 cursor-pointer items-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-accent sm:h-9"
						>
							{m.chooseFile}
						</label>
						<input
							id="sql-file-input"
							type="file"
							accept=".sql,.txt,text/plain"
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
							aria-label={m.samplePlaceholder}
							className="h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
							value=""
							onChange={(e) => {
								const id = e.target.value as SqlSampleId;
								if (id in SQL_SAMPLES) replaceInput(SQL_SAMPLES[id]);
							}}
						>
							<option value="">{m.samplePlaceholder}</option>
							{SQL_SAMPLE_IDS.map((id) => (
								<option key={id} value={id}>
									{m.samples[id]}
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
									setInput(undoValue);
									setUndoValue(null);
								}}
							>
								{m.undo}
							</Button>
						)}
					</div>
					{notice && (
						<p role="alert" className="text-xs text-destructive">
							{notice}
						</p>
					)}
				</div>

				<div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<label htmlFor="sql-output" className="text-sm font-medium text-foreground">
							{outputLabel}
						</label>
						{outputStats && <span className="text-xs text-muted-foreground">{outputStats}</span>}
					</div>
					<SqlLineArea
						id="sql-output"
						label={outputLabel}
						value={doneText}
						readOnly
						placeholder={m.outputPlaceholder}
									/>
					{showFormatWarning && (
						<p role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
							{m.formatInvalidWarning}
						</p>
					)}
					{outputError && (
						<p role="alert" className="text-sm text-destructive">
							{outputError}
						</p>
					)}
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" size="lg" variant="secondary" disabled={doneText === ''} aria-live="polite" onClick={() => void copy(doneText)}>
							{copied ? m.copied : copyFailed ? m.copyFailed : m.copy}
						</Button>
						<Button type="button" size="lg" variant="outline" disabled={doneText === ''} onClick={() => download(doneText, output.phase === 'done' ? output.mode : mode)}>
							{m.download}
						</Button>
					</div>
				</div>
			</div>

			<SqlValidationPanel
				messages={m}
				state={validation}
				sql={input}
				dialectName={dialectName}
				parserName={(id) => PARSER_NAMES[id as ParserDialect] ?? id}
				onJump={jumpTo}
			/>
		</div>
	);
}
