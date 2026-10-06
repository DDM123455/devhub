import type { ExtractErrorCode, ExtractOptions, ExtractResult, ExtractWarning, FileKind, Reliability } from '@/lib/file-diff-extract';
import { reliabilityFor } from '@/lib/file-diff-extract';

export interface TextDiffFileMessages {
	uploadAny: string;
	dropHint: string;
	dropActive: string;
	loading: string;
	removeFile: string;
	removeFileAria: string;
	edited: string;
	pages: string;
	sheets: string;
	slides: string;
	encoding: string;
	sheetsLabel: string;
	sheetsAria: string;
	onlyTwoFiles: string;
	editedKept: string;
	shareTooLarge: string;
	optionsHeading: string;
	optionsHint: string;
	optPageMarkers: string;
	optJoinWraps: string;
	optStructure: string;
	optFormulas: string;
	optSeparator: string;
	sepTab: string;
	sepPipe: string;
	limitsHeading: string;
	limitsIntro: string;
	reliabilityLabel: string;
	rel: Record<Reliability, string>;
	kinds: Record<FileKind, string>;
	warn: Record<ExtractWarning, string>;
	err: Record<ExtractErrorCode | 'read', string>;
	limit: Record<FileKind | 'general', string>;
}

export interface LoadedFile {
	name: string;
	size: number;
	result: ExtractResult;
	/** null = all sheets */
	sheets: string[] | null;
	/** The text that was put in the box (used to tell whether the user edited it afterwards). */
	text: string;
}

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const RELIABILITY_CLASS: Record<Reliability, string> = {
	high: 'text-green-700 dark:text-green-300',
	medium: 'text-amber-700 dark:text-amber-400',
	low: 'text-red-700 dark:text-red-300',
};

interface FileChipProps {
	file: LoadedFile;
	edited: boolean;
	side: string;
	messages: TextDiffFileMessages;
	onRemove: () => void;
	onSheetsChange: (sheets: string[] | null) => void;
}

export function FileChip({ file, edited, side, messages, onRemove, onSheetsChange }: FileChipProps) {
	const r = file.result;
	const meta: string[] = [messages.kinds[r.kind], formatBytes(file.size)];
	if (r.pages !== undefined) meta.push(messages.pages.replace('{{count}}', String(r.pages)));
	if (r.slides) meta.push(messages.slides.replace('{{count}}', String(r.slides)));
	if (r.sheetNames) meta.push(messages.sheets.replace('{{count}}', String(r.sheetNames.length)));
	if (r.encoding && r.encoding !== 'utf-8') meta.push(messages.encoding.replace('{{encoding}}', r.encoding.toUpperCase()));
	const used = file.sheets ?? r.sheetNames ?? [];
	const toggleSheet = (name: string, checked: boolean) => {
		const base = file.sheets ?? r.sheetNames ?? [];
		const next = checked ? [...base, name] : base.filter((s) => s !== name);
		const ordered = (r.sheetNames ?? []).filter((s) => next.includes(s));
		onSheetsChange(ordered.length === (r.sheetNames ?? []).length ? null : ordered);
	};
	return (
		<div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 [overflow-wrap:anywhere]">
					<span className="font-medium text-foreground">{file.name}</span>
					{edited && <span className="ml-1.5 rounded bg-orange-500/15 px-1 text-orange-700 dark:text-orange-300">{messages.edited}</span>}
					<div className="text-muted-foreground">
						{meta.join(' · ')} ·{' '}
						<span className={RELIABILITY_CLASS[reliabilityFor(r.kind)]}>
							{messages.reliabilityLabel}: {messages.rel[reliabilityFor(r.kind)]}
						</span>
					</div>
				</div>
				<button
					type="button"
					onClick={onRemove}
					aria-label={messages.removeFileAria.replace('{{name}}', file.name).replace('{{side}}', side)}
					className="min-h-9 shrink-0 rounded-md border border-border px-2.5 text-foreground hover:bg-muted"
				>
					{messages.removeFile}
				</button>
			</div>
			{r.warnings.length > 0 && (
				<ul className="list-disc pl-4 text-amber-700 dark:text-amber-400">
					{r.warnings.map((w) => (
						<li key={w.code}>{messages.warn[w.code].replace('{{count}}', String(w.count ?? ''))}</li>
					))}
				</ul>
			)}
			{r.sheetNames && r.sheetNames.length > 1 && (
				<fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 border-0 p-0" aria-label={messages.sheetsAria.replace('{{name}}', file.name)}>
					<legend className="sr-only">{messages.sheetsAria.replace('{{name}}', file.name)}</legend>
					<span className="text-muted-foreground" aria-hidden="true">
						{messages.sheetsLabel}
					</span>
					{r.sheetNames.map((s) => (
						<label key={s} className="flex min-h-9 cursor-pointer items-center gap-1.5 text-foreground">
							<input type="checkbox" checked={used.includes(s)} onChange={(e) => toggleSheet(s, e.target.checked)} />
							<span className="[overflow-wrap:anywhere]">{s}</span>
						</label>
					))}
				</fieldset>
			)}
		</div>
	);
}

interface OptionsProps {
	options: ExtractOptions;
	onChange: (next: ExtractOptions) => void;
	messages: TextDiffFileMessages;
}

export function FileOptionsPanel({ options, onChange, messages }: OptionsProps) {
	const check = (key: 'pageMarkers' | 'joinWraps' | 'structure' | 'showFormulas', label: string) => (
		<label className="flex min-h-9 cursor-pointer items-center gap-1.5 text-sm text-foreground">
			<input type="checkbox" checked={options[key]} onChange={(e) => onChange({ ...options, [key]: e.target.checked })} />
			{label}
		</label>
	);
	return (
		<details className="rounded-md border border-border p-3">
			<summary className="min-h-9 cursor-pointer text-sm font-medium text-foreground">{messages.optionsHeading}</summary>
			<div className="mt-2 flex flex-col gap-1">
				<p className="text-xs text-muted-foreground">{messages.optionsHint}</p>
				{check('pageMarkers', messages.optPageMarkers)}
				{check('joinWraps', messages.optJoinWraps)}
				{check('structure', messages.optStructure)}
				{check('showFormulas', messages.optFormulas)}
				<label className="flex min-h-9 items-center gap-1.5 text-sm text-foreground">
					{messages.optSeparator}
					<select
						value={options.cellSeparator}
						onChange={(e) => onChange({ ...options, cellSeparator: e.target.value === 'pipe' ? 'pipe' : 'tab' })}
						className="min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
					>
						<option value="tab">{messages.sepTab}</option>
						<option value="pipe">{messages.sepPipe}</option>
					</select>
				</label>
			</div>
		</details>
	);
}

const LIMIT_ORDER: FileKind[] = ['text', 'docx', 'pdf', 'xlsx', 'odt', 'ods', 'pptx', 'rtf'];

export function FileLimitsPanel({ messages }: { messages: TextDiffFileMessages }) {
	return (
		<details className="rounded-md border border-border p-3">
			<summary className="min-h-9 cursor-pointer text-sm font-medium text-foreground">{messages.limitsHeading}</summary>
			<div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">
				<p>{messages.limitsIntro}</p>
				<ul className="flex flex-col gap-1.5">
					{LIMIT_ORDER.map((kind) => (
						<li key={kind} className="[overflow-wrap:anywhere]">
							<span className="font-medium text-foreground">{messages.kinds[kind]}</span>{' '}
							<span className={RELIABILITY_CLASS[reliabilityFor(kind)]}>({messages.rel[reliabilityFor(kind)]})</span>: {messages.limit[kind]}
						</li>
					))}
				</ul>
				<p>{messages.limit.general}</p>
			</div>
		</details>
	);
}
