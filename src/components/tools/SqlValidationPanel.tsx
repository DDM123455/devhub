import { Fragment, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { buildSnippet, type SqlErrorInfo, type StatementResult, type ValidationReport } from '@/lib/sql-validate';
import type { ValidateOutcome } from './sqlWorkerTypes';

export interface ValidationMessages {
	statusHeading: string;
	statusEmpty: string;
	statusChecking: string;
	statusValid: string;
	statusInvalid: string;
	typesLabel: string;
	tablesLabel: string;
	columnsLabel: string;
	statementOneLine: string;
	statementLines: string;
	statementOk: string;
	errorAt: string;
	jumpToError: string;
	moreStatements: string;
	noParser: string;
	loadError: string;
	approxGrammar: string;
	validateDisclaimer: string;
	workerTimeout: string;
	workerError: string;
	errors: Record<string, string>;
	hints: Record<string, string>;
}

export type ValidationState =
	| { phase: 'idle' }
	| { phase: 'checking' }
	| { phase: 'done'; outcome: ValidateOutcome }
	| { phase: 'error'; kind: 'timeout' | 'worker' };

export function tpl(template: string | undefined, params: Record<string, string | number>): string {
	return (template ?? '').replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

const MAX_LISTED_OK = 50;
const MAX_LIST_ITEMS = 8;

interface Props {
	messages: ValidationMessages;
	state: ValidationState;
	sql: string;
	dialectName: string;
	parserName: (id: string) => string;
	onJump: (error: SqlErrorInfo) => void;
}

function statementTitle(m: ValidationMessages, r: StatementResult): string {
	return r.startLine === r.endLine
		? tpl(m.statementOneLine, { n: r.index + 1, line: r.startLine })
		: tpl(m.statementLines, { n: r.index + 1, from: r.startLine, to: r.endLine });
}

function joinLimited(items: string[], max = MAX_LIST_ITEMS): string {
	return items.length > max ? `${items.slice(0, max).join(', ')}, … (+${items.length - max})` : items.join(', ');
}

function ErrorBlock({ m, error, sql, onJump }: { m: ValidationMessages; error: SqlErrorInfo; sql: string; onJump: (e: SqlErrorInfo) => void }) {
	const snippet = buildSnippet(sql, error.line, error.column, error.length);
	const width = String(snippet[snippet.length - 1]?.line ?? error.line).length;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-wrap items-center gap-2">
				<span className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-xs font-semibold text-destructive">
					{tpl(m.errorAt, { line: error.line, column: error.column })}
				</span>
				<Button type="button" size="lg" variant="outline" onClick={() => onJump(error)}>
					{m.jumpToError}
				</Button>
			</div>
			<p className="text-sm text-foreground">{tpl(m.errors[error.key], error.params) || error.message}</p>
			{error.hints.length > 0 && (
				<ul className="list-disc pl-5 text-xs text-muted-foreground">
					{error.hints.map((h, i) => (
						<li key={i}>{tpl(m.hints[h.key], h.params)}</li>
					))}
				</ul>
			)}
			<pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-5 text-foreground">
				{snippet.map((l) => (
					<Fragment key={l.line}>
						<span className={l.markFrom === undefined ? 'text-muted-foreground' : 'font-bold text-destructive'}>{String(l.line).padStart(width, ' ')} | </span>
						{l.markFrom === undefined ? (
							l.text
						) : (
							<>
								{l.text.slice(0, l.markFrom)}
								<mark className="rounded-sm bg-destructive/25 text-destructive underline decoration-wavy">{l.text.slice(l.markFrom, l.markTo) || ' '}</mark>
								{l.text.slice(l.markTo)}
							</>
						)}
						{'\n'}
					</Fragment>
				))}
			</pre>
		</div>
	);
}

function Summary({ m, report }: { m: ValidationMessages; report: ValidationReport }) {
	const kinds = Object.entries(report.kinds).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
	return (
		<dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
			{kinds.length > 0 && (
				<>
					<dt className="text-muted-foreground">{m.typesLabel}</dt>
					<dd className="font-mono text-foreground">{joinLimited(kinds, 12)}</dd>
				</>
			)}
			{report.tables.length > 0 && (
				<>
					<dt className="text-muted-foreground">{m.tablesLabel}</dt>
					<dd className="font-mono break-all text-foreground">{joinLimited(report.tables, 30)}</dd>
				</>
			)}
		</dl>
	);
}

export default function SqlValidationPanel({ messages: m, state, sql, dialectName, parserName, onJump }: Props) {
	let badge: { text: string; cls: string };
	let body: ReactNode = null;

	if (state.phase === 'idle') {
		badge = { text: m.statusEmpty, cls: 'bg-muted text-muted-foreground' };
	} else if (state.phase === 'checking') {
		badge = { text: m.statusChecking, cls: 'bg-muted text-muted-foreground' };
	} else if (state.phase === 'error') {
		badge = { text: state.kind === 'timeout' ? m.workerTimeout : m.workerError, cls: 'bg-destructive/15 text-destructive' };
	} else if (state.outcome.status === 'no-parser') {
		badge = { text: m.noParser, cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' };
	} else if (state.outcome.status === 'load-error') {
		badge = { text: m.loadError, cls: 'bg-destructive/15 text-destructive' };
	} else {
		const { report, parser, exact } = state.outcome;
		if (report.status === 'empty') {
			badge = { text: m.statusEmpty, cls: 'bg-muted text-muted-foreground' };
		} else {
			badge =
				report.status === 'valid'
					? { text: `✓ ${tpl(m.statusValid, { count: report.statementCount })}`, cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' }
					: {
							text: `✗ ${tpl(m.statusInvalid, { invalid: report.invalidCount, total: report.statementCount })}`,
							cls: 'bg-destructive/15 text-destructive',
						};
			const multi = report.statementCount > 1;
			const okRows = report.results.filter((r) => r.ok);
			body = (
				<div className="flex flex-col gap-3">
					{!exact && <p className="text-xs text-muted-foreground">{tpl(m.approxGrammar, { grammar: parserName(parser), dialect: dialectName })}</p>}
					{report.validCount > 0 && <Summary m={m} report={report} />}
					{!multi && report.results[0]?.ok && (report.results[0].columns?.length ?? 0) > 0 && (
						<p className="text-xs">
							<span className="text-muted-foreground">{m.columnsLabel}: </span>
							<span className="font-mono break-all text-foreground">{joinLimited(report.results[0].columns ?? [], 30)}</span>
						</p>
					)}
					{(multi || report.status === 'invalid') && (
						<ul className="flex flex-col gap-2">
							{report.results
								.filter((r) => !r.ok)
								.map((r) => (
									<li key={r.index} className="rounded-md border border-destructive/40 p-3">
										{multi && <p className="mb-1.5 text-xs font-semibold text-foreground">{statementTitle(m, r)}</p>}
										{r.error && <ErrorBlock m={m} error={r.error} sql={sql} onJump={onJump} />}
									</li>
								))}
							{multi &&
								okRows.slice(0, MAX_LISTED_OK).map((r) => (
									<li key={r.index} className="flex flex-wrap items-baseline gap-x-2 rounded-md border border-border px-3 py-2 text-xs">
										<span className="font-semibold text-emerald-700 dark:text-emerald-400">✓ {statementTitle(m, r)}</span>
										<span className="font-mono text-muted-foreground">{r.kind}</span>
										{(r.tables?.length ?? 0) > 0 && <span className="font-mono break-all text-muted-foreground">{joinLimited(r.tables ?? [], 5)}</span>}
									</li>
								))}
						</ul>
					)}
					{multi && report.validCount > Math.min(okRows.length, MAX_LISTED_OK) && (
						<p className="text-xs text-muted-foreground">{tpl(m.moreStatements, { count: report.validCount - Math.min(okRows.length, MAX_LISTED_OK) })}</p>
					)}
				</div>
			);
		}
	}

	return (
		<section className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-labelledby="sql-validation-heading">
			<h2 id="sql-validation-heading" className="text-sm font-medium text-foreground">
				{m.statusHeading}
			</h2>
			<div role="status" aria-live="polite" className={`rounded-md px-3 py-2 text-sm font-medium ${badge.cls}`}>
				{badge.text}
			</div>
			{body}
			<p className="text-xs text-muted-foreground">{m.validateDisclaimer}</p>
		</section>
	);
}
