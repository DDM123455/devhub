import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ISO_STANDARDS, MAX_LINES, resultsToCsv, validateText, type IsoDetail, type IsoResult, type IsoStandardId, type LineResult, type LineStatus } from '@/lib/iso-validate';
import { copyTextSafe } from '@/lib/safe-clipboard';

export interface IsoMessages {
	inputLabel: string;
	inputPlaceholder: string;
	standardLabel: string;
	auto: string;
	loadSample: string;
	clear: string;
	privacyNote: string;
	summary: string;
	summaryAria: string;
	filterAll: string;
	filterValid: string;
	filterInvalid: string;
	filterUnrecognized: string;
	statusValid: string;
	statusInvalid: string;
	statusUnrecognized: string;
	unrecognizedHint: string;
	copyValid: string;
	copyInvalid: string;
	downloadCsv: string;
	copied: string;
	copyFailed: string;
	showMore: string;
	truncated: string;
	empty: string;
	cardWarning: string;
	standards: Record<IsoStandardId, string>;
	reasons: Record<string, string>;
	detail: Record<string, string>;
	types: Record<string, string>;
	notes: Record<string, string>;
	regions: Record<string, string>;
	mii: Record<string, string>;
	categories: Record<string, string>;
}

const SAMPLE = [
	'GB82 WEST 1234 5698 7654 32',
	'DE89370400440532013001',
	'2024-02-29T10:00:00+07:00',
	'2023-02-29',
	'P3Y6M4DT12H30M5S',
	'978-0-306-40615-7',
	'0-306-40615-3',
	'US0378331005',
	'EUR',
	'vi-VN',
	'CSQU3054383',
	'1M8GDM9AXKP042788',
	'DEUTDEFF',
	'10.1038/nphys1170',
	'0200723800000080800016411111111111111100000000000001000002292359591234562359590229TERM0001704',
	'not an iso code',
].join('\n');

const PAGE = 100;

function fill(template: string, params: Record<string, string | number> = {}): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(params[k] ?? ''));
}

// a few reasons have one message per variant (badCalendar_month / badCalendar_day)
const reasonKey = (r: IsoResult) => (r.reasonParams?.part ? `${r.reason}_${r.reasonParams.part}` : (r.reason ?? ""));

const STATUS_STYLE: Record<LineStatus, string> = {
	valid: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
	invalid: 'bg-destructive/15 text-destructive',
	unrecognized: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};
const STATUS_ICON: Record<LineStatus, string> = { valid: '✓', invalid: '✗', unrecognized: '?' };

export default function IsoValidator({ messages: m, lang }: { messages: IsoMessages; lang: string }) {
	const [text, setText] = useState('');
	const [debounced, setDebounced] = useState('');
	const [forced, setForced] = useState<'auto' | IsoStandardId>('auto');
	const [filter, setFilter] = useState<'all' | LineStatus>('all');
	const [visible, setVisible] = useState(PAGE);
	const [toast, setToast] = useState('');
	const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Nothing the user pastes is stored (it may well be a card or account number); only the debounce state lives here.
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(text), 150);
		return () => clearTimeout(timer);
	}, [text]);
	useEffect(() => () => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
	}, []);
	useEffect(() => setVisible(PAGE), [debounced, forced, filter]);

	const result = useMemo(() => validateText(debounced, forced === 'auto' ? undefined : forced), [debounced, forced]);
	const rows = useMemo(() => (filter === 'all' ? result.rows : result.rows.filter((r) => r.status === filter)), [result, filter]);
	const hasCard = result.rows.some((r) => r.matches.some((x) => x.standard === 'card' && x.ok));
	const standardName = (id: IsoStandardId) => {
		const iso = ISO_STANDARDS.find((s) => s.id === id)!.iso;
		return `${iso} · ${m.standards[id]}`;
	};

	const flash = (message: string) => {
		setToast(message);
		if (toastTimer.current) clearTimeout(toastTimer.current);
		toastTimer.current = setTimeout(() => setToast(''), 1600);
	};
	const copy = async (value: string) => flash((await copyTextSafe(value)) ? m.copied : m.copyFailed);

	const valueText = (key: string, value: string): string => {
		if (key === 'type') return m.types[value] ?? value;
		if (key === 'note') return m.notes[value] ?? value;
		if (key === 'region') return m.regions[value] ?? value;
		if (key === 'mii') return m.mii[value] ?? value;
		if (key === 'category') return `${value} — ${m.categories[value] ?? ''}`;
		if (key === 'weekdayIndex') {
			try {
				return new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + Number(value))));
			} catch {
				return value;
			}
		}
		return value;
	};

	const renderDetails = (details: IsoDetail[]) => (
		<dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
			{details.map((x, i) => (
				<div key={`${x.key}-${i}`} className={x.key === 'field' ? 'mt-1 flex basis-full gap-1' : x.key === 'fieldSpec' || x.key === 'fieldInfo' || x.key === 'fieldSub' ? 'flex basis-full gap-1 pl-4' : 'flex gap-1'}>
					<dt className="text-muted-foreground">{m.detail[x.key] ?? x.key}:</dt>
					<dd className={x.key === 'fieldInfo' ? 'text-muted-foreground [overflow-wrap:anywhere]' : 'font-mono text-foreground [overflow-wrap:anywhere]'}>{valueText(x.key, x.value)}</dd>
				</div>
			))}
		</dl>
	);

	const renderMatch = (r: IsoResult, i: number) => (
		<div key={`${r.standard}-${i}`} className="mt-1.5 first:mt-0">
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-medium text-foreground">{standardName(r.standard)}</span>
				{!r.ok && r.reason && <span className="text-destructive">{fill(m.reasons[reasonKey(r)] ?? r.reason, r.reasonParams)}</span>}
				{r.ok && r.normalized && (
					<button
						type="button"
						onClick={() => void copy(r.normalized!)}
						className="inline-flex min-h-9 items-center rounded px-1 font-mono text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
						title={m.copied}
					>
						{r.normalized}
					</button>
				)}
			</div>
			{r.details.length > 0 && renderDetails(r.details)}
		</div>
	);

	const renderRow = (row: LineResult, index: number) => (
		<li key={index} className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:gap-3">
			<span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status]}`}>
				<span aria-hidden="true">{STATUS_ICON[row.status]}</span>
				{row.status === 'valid' ? m.statusValid : row.status === 'invalid' ? m.statusInvalid : m.statusUnrecognized}
			</span>
			<div className="min-w-0 flex-1">
				<p className="font-mono text-sm text-foreground [overflow-wrap:anywhere]">{row.input.trim()}</p>
				{row.status === 'unrecognized' ? <p className="mt-0.5 text-xs text-muted-foreground">{m.unrecognizedHint}</p> : row.matches.map(renderMatch)}
			</div>
		</li>
	);

	const downloadCsv = () => {
		const csv = resultsToCsv(result.rows, (id) => standardName(id));
		const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = 'iso-validation.csv';
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const values = (status: LineStatus) =>
		result.rows
			.filter((r) => r.status === status)
			.map((r) => (status === 'valid' ? (r.matches[0].normalized ?? r.input.trim()) : r.input.trim()))
			.join('\n');

	const total = result.rows.length;
	const chip = (id: 'all' | LineStatus, label: string, n: number) => (
		<button
			key={id}
			type="button"
			onClick={() => setFilter(id)}
			aria-pressed={filter === id}
			className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium ${filter === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'}`}
		>
			{fill(label, { n })}
		</button>
	);

	return (
		<div className="flex flex-col gap-4">
			<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">{m.privacyNote}</p>

			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<label htmlFor="iso-input" className="text-sm font-medium text-foreground">
						{m.inputLabel}
					</label>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						{m.standardLabel}
						<select
							value={forced}
							onChange={(e) => setForced(e.target.value as 'auto' | IsoStandardId)}
							className="max-w-[16rem] rounded-md border border-border bg-background px-2 text-sm text-foreground"
						>
							<option value="auto">{m.auto}</option>
							{ISO_STANDARDS.map((s) => (
								<option key={s.id} value={s.id}>
									{standardName(s.id)}
								</option>
							))}
						</select>
					</label>
				</div>
				<textarea
					id="iso-input"
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder={m.inputPlaceholder}
					rows={7}
					spellCheck={false}
					autoComplete="off"
					autoCapitalize="off"
					className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
				/>
				<div className="flex flex-wrap items-center gap-2">
					{text === '' && (
						<Button type="button" variant="outline" className="min-h-9" onClick={() => setText(SAMPLE)}>
							{m.loadSample}
						</Button>
					)}
					{text !== '' && (
						<Button type="button" variant="outline" className="min-h-9" onClick={() => setText('')}>
							{m.clear}
						</Button>
					)}
				</div>
			</div>

			<div role="status" aria-live="polite" className="sr-only">
				{total > 0 ? fill(m.summaryAria, { valid: result.counts.valid, invalid: result.counts.invalid, unrecognized: result.counts.unrecognized }) : ''}
			</div>

			{total === 0 ? (
				<p className="text-sm text-muted-foreground">{m.empty}</p>
			) : (
				<div className="flex flex-col gap-3">
					<p className="text-sm font-medium text-foreground">{fill(m.summary, { valid: result.counts.valid, invalid: result.counts.invalid, unrecognized: result.counts.unrecognized })}</p>
					<div className="flex flex-wrap items-center gap-2">
						{chip('all', m.filterAll, total)}
						{chip('valid', m.filterValid, result.counts.valid)}
						{chip('invalid', m.filterInvalid, result.counts.invalid)}
						{chip('unrecognized', m.filterUnrecognized, result.counts.unrecognized)}
						<span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />
						<Button type="button" size="sm" variant="outline" className="min-h-9" disabled={result.counts.valid === 0} onClick={() => void copy(values('valid'))}>
							{m.copyValid}
						</Button>
						<Button type="button" size="sm" variant="outline" className="min-h-9" disabled={result.counts.invalid + result.counts.unrecognized === 0} onClick={() => void copy([values('invalid'), values('unrecognized')].filter(Boolean).join('\n'))}>
							{m.copyInvalid}
						</Button>
						<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={downloadCsv}>
							{m.downloadCsv}
						</Button>
						<span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
							{toast}
						</span>
					</div>
					{hasCard && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{m.cardWarning}</p>}
					{result.truncated && <p className="text-xs text-amber-700 dark:text-amber-400">{fill(m.truncated, { max: MAX_LINES })}</p>}
					<ul className="flex flex-col gap-2">{rows.slice(0, visible).map(renderRow)}</ul>
					{rows.length > visible && (
						<Button type="button" variant="outline" className="min-h-9 self-start" onClick={() => setVisible((v) => v + PAGE)}>
							{fill(m.showMore, { n: Math.min(PAGE, rows.length - visible) })}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
