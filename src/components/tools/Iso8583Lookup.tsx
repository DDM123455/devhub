import { useMemo, useState } from 'react';
import { ISO8583_FIELDS } from '@/lib/iso-data/iso8583-fields';
import { RESPONSE_CODE_LIST, describeField, type ResponseCategory } from '@/lib/iso-data/iso8583-codes';

export interface LookupMessages {
	heading: string;
	hint: string;
	tabResponse: string;
	tabFields: string;
	searchPlaceholder: string;
	searchLabel: string;
	colCode: string;
	colMeaning: string;
	colCategory: string;
	colField: string;
	colName: string;
	colFormat: string;
	empty: string;
	networkNote: string;
	categories: Record<ResponseCategory, string>;
}

const CATEGORY_STYLE: Record<ResponseCategory, string> = {
	approved: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
	declined: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
	pickup: 'bg-destructive/15 text-destructive',
	error: 'bg-muted text-foreground',
	system: 'bg-primary/10 text-foreground',
};

function specOf(de: number): string {
	const f = ISO8583_FIELDS.get(de)!;
	const t = f.type === 'xn' ? 'x+n' : f.type;
	if (f.lv > 0) return `${t}${'.'.repeat(f.lv)}${f.len} (${f.lv === 2 ? 'LLVAR' : 'LLLVAR'})`;
	return f.type === 'b' ? `b ${f.len} bits` : `${t} ${f.len}`;
}

type Tab = 'response' | 'fields';
const TABS: readonly Tab[] = ['response', 'fields'];

/** Reference tables next to the ISO 8583 validator: DE 39 response codes and what every data element means. */
export default function Iso8583Lookup({ messages: m }: { messages: LookupMessages }) {
	const [tab, setTab] = useState<Tab>('response');
	const [query, setQuery] = useState('');
	const q = query.trim().toLowerCase();

	const responses = useMemo(
		() =>
			RESPONSE_CODE_LIST.filter(
				([code, meaning, cat]) => q === '' || code.toLowerCase().includes(q) || meaning.toLowerCase().includes(q) || m.categories[cat].toLowerCase().includes(q),
			),
		[q, m.categories],
	);
	const fields = useMemo(
		() =>
			[...ISO8583_FIELDS.values()].filter((f) => {
				if (q === '') return true;
				const num = String(f.de);
				return num === q.replace(/^de\s*/, '') || f.name.toLowerCase().includes(q) || describeField(f.de).toLowerCase().includes(q) || `de${num}` === q.replace(/\s/g, '');
			}),
		[q],
	);

	const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const i = TABS.indexOf(tab);
		let next = -1;
		if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
		else if (e.key === 'ArrowLeft') next = (i + TABS.length - 1) % TABS.length;
		if (next < 0) return;
		e.preventDefault();
		setTab(TABS[next]);
		document.getElementById(`iso8583-tab-${TABS[next]}`)?.focus();
	};

	return (
		<section className="mt-6 flex flex-col gap-3 rounded-lg border border-border p-4" aria-labelledby="iso8583-lookup-heading">
			<div>
				<h2 id="iso8583-lookup-heading" className="text-sm font-semibold text-foreground">
					{m.heading}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
			</div>
			<div role="tablist" aria-label={m.heading} className="flex flex-wrap gap-1 border-b border-border" onKeyDown={onKey}>
				{TABS.map((id) => (
					<button
						key={id}
						type="button"
						role="tab"
						id={`iso8583-tab-${id}`}
						aria-selected={tab === id}
						aria-controls="iso8583-lookup-panel"
						tabIndex={tab === id ? 0 : -1}
						onClick={() => setTab(id)}
						className={`-mb-px min-h-10 rounded-t-md border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
							tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
						}`}
					>
						{id === 'response' ? m.tabResponse : m.tabFields}
					</button>
				))}
			</div>
			<label className="flex flex-col gap-1 text-xs text-muted-foreground">
				{m.searchLabel}
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={m.searchPlaceholder}
					className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
				/>
			</label>
			<div id="iso8583-lookup-panel" role="tabpanel" aria-labelledby={`iso8583-tab-${tab}`} className="max-h-[28rem] overflow-auto rounded-md border border-border">
				{tab === 'response' ? (
					responses.length === 0 ? (
						<p className="p-3 text-sm text-muted-foreground">{m.empty}</p>
					) : (
						<table className="w-full border-collapse text-left text-sm">
							<thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
								<tr>
									<th scope="col" className="px-3 py-1.5 font-medium">{m.colCode}</th>
									<th scope="col" className="px-3 py-1.5 font-medium">{m.colMeaning}</th>
									<th scope="col" className="px-3 py-1.5 font-medium">{m.colCategory}</th>
								</tr>
							</thead>
							<tbody>
								{responses.map(([code, meaning, cat]) => (
									<tr key={code} className="border-t border-border">
										<td className="px-3 py-1.5 font-mono font-semibold text-foreground">{code}</td>
										<td className="px-3 py-1.5 text-foreground">{meaning}</td>
										<td className="px-3 py-1.5">
											<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLE[cat]}`}>{m.categories[cat]}</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)
				) : fields.length === 0 ? (
					<p className="p-3 text-sm text-muted-foreground">{m.empty}</p>
				) : (
					<table className="w-full border-collapse text-left text-sm">
						<thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
							<tr>
								<th scope="col" className="px-3 py-1.5 font-medium">{m.colField}</th>
								<th scope="col" className="px-3 py-1.5 font-medium">{m.colName}</th>
								<th scope="col" className="px-3 py-1.5 font-medium">{m.colFormat}</th>
								<th scope="col" className="px-3 py-1.5 font-medium">{m.colMeaning}</th>
							</tr>
						</thead>
						<tbody>
							{fields.map((f) => (
								<tr key={f.de} className="border-t border-border align-top">
									<td className="px-3 py-1.5 font-mono font-semibold text-foreground">DE {f.de}</td>
									<td className="px-3 py-1.5 text-foreground">{f.name}</td>
									<td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted-foreground">{specOf(f.de)}</td>
									<td className="px-3 py-1.5 text-xs text-muted-foreground">{describeField(f.de)}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
			<p className="text-xs text-muted-foreground">{m.networkNote}</p>
		</section>
	);
}
