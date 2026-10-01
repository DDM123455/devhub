import { useState, type RefObject, type UIEvent } from 'react';
import type { UnifiedRow } from '@/lib/text-diff';

export interface TextDiffExtraMessages {
	viewLabel: string;
	viewSplit: string;
	viewUnified: string;
	contextLabel: string;
	contextAll: string;
	contextN: string;
	wrapLines: string;
	ignoreRegexHeading: string;
	ignoreRegexHelp: string;
	ignoreRegexPlaceholder: string;
	ignoreRegexInvalid: string;
	exportPatch: string;
	exportHtml: string;
	copyPatch: string;
	patchCopied: string;
	collapsedLines: string;
	exportNothing: string;
	unifiedAria: string;
}

const ROW_HEIGHT = 24;
const VIEWPORT_HEIGHT = 384;
const OVERSCAN = 20;
// Above this many rows wrapping is ignored: variable row heights need every row in the DOM.
export const MAX_WRAPPED_ROWS = 4000;

function rowClass(kind: UnifiedRow['kind']): string {
	if (kind === 'added') return 'bg-green-500/15';
	if (kind === 'removed') return 'bg-red-500/15';
	if (kind === 'collapsed') return 'bg-muted';
	return '';
}

function RowBody({ row, wrap, collapsedLabel }: { row: UnifiedRow; wrap: boolean; collapsedLabel: string }) {
	if (row.kind === 'collapsed') {
		return (
			<div className="px-2 text-xs leading-6 text-muted-foreground italic">
				{collapsedLabel.replace('{{count}}', String(row.collapsed ?? 0))}
			</div>
		);
	}
	const sign = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
	return (
		<div className={`flex font-mono text-sm leading-6 text-foreground ${wrap ? '' : 'h-6'}`}>
			<span className="w-10 flex-shrink-0 select-none bg-muted/60 px-1 text-right text-xs text-muted-foreground" aria-hidden="true">
				{row.leftNo ?? ''}
			</span>
			<span className="w-10 flex-shrink-0 select-none bg-muted/60 px-1 text-right text-xs text-muted-foreground" aria-hidden="true">
				{row.rightNo ?? ''}
			</span>
			<span className="w-5 flex-shrink-0 select-none text-center text-muted-foreground" aria-hidden="true">
				{sign}
			</span>
			<span className={`min-w-0 flex-1 pr-2 ${wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre'}`}>
				{row.segments
					? row.segments.map((seg, i) => {
							const changed = row.kind === 'removed' ? seg.removed : seg.added;
							return (
								<span key={i} className={changed ? 'bg-orange-400/50 font-semibold' : undefined}>
									{seg.value}
								</span>
							);
						})
					: row.text === ''
						? ' '
						: row.text}
			</span>
		</div>
	);
}

export default function UnifiedDiffView({
	rows,
	wrap,
	scrollRef,
	activeRowIndex,
	collapsedLabel,
	ariaLabel,
}: {
	rows: UnifiedRow[];
	wrap: boolean;
	scrollRef: RefObject<HTMLDivElement | null>;
	activeRowIndex: number | null;
	collapsedLabel: string;
	ariaLabel: string;
}) {
	const [scrollTop, setScrollTop] = useState(0);
	const canWrap = wrap && rows.length <= MAX_WRAPPED_ROWS;

	if (canWrap) {
		return (
			<div ref={scrollRef} role="region" aria-label={ariaLabel} tabIndex={0} className="h-96 overflow-auto rounded-md border border-border bg-background">
				{rows.map((row, i) => (
					<div key={i} className={`${rowClass(row.kind)} ${i === activeRowIndex ? 'ring-1 ring-primary' : ''}`}>
						<RowBody row={row} wrap collapsedLabel={collapsedLabel} />
					</div>
				))}
			</div>
		);
	}

	const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
	const endIndex = Math.min(rows.length, startIndex + Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2);
	return (
		<div
			ref={scrollRef}
			role="region"
			aria-label={ariaLabel}
			tabIndex={0}
			onScroll={(event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)}
			className="h-96 overflow-auto rounded-md border border-border bg-background"
		>
			<div style={{ height: rows.length * ROW_HEIGHT, position: 'relative', minWidth: 'max-content' }}>
				{rows.slice(startIndex, endIndex).map((row, i) => {
					const index = startIndex + i;
					return (
						<div
							key={index}
							style={{ position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0 }}
							className={`${rowClass(row.kind)} ${index === activeRowIndex ? 'ring-1 ring-primary' : ''}`}
						>
							<RowBody row={row} wrap={false} collapsedLabel={collapsedLabel} />
						</div>
					);
				})}
			</div>
		</div>
	);
}

export { ROW_HEIGHT as UNIFIED_ROW_HEIGHT, VIEWPORT_HEIGHT as UNIFIED_VIEWPORT_HEIGHT };
