import { useMemo, useRef, type KeyboardEventHandler, type ReactNode, type RefObject } from 'react';

interface Props {
	id: string;
	label: string;
	value: string;
	onChange?: (value: string) => void;
	readOnly?: boolean;
	placeholder?: string;
	/** Các dòng (1-indexed) cần tô đỏ ở cột số dòng. */
	errorLines?: number[];
	textareaRef?: RefObject<HTMLTextAreaElement | null>;
	onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
	describedBy?: string;
}

const MAX_GUTTER_LINES = 100000;

function countLines(text: string): number {
	let n = 1;
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
	return n;
}

function numbers(from: number, to: number): string {
	const parts: string[] = [];
	for (let i = from; i <= to; i++) parts.push(String(i));
	return parts.join('\n');
}

// Ô văn bản có cột số dòng đồng bộ cuộn (textarea không xuống dòng tự động để số dòng luôn khớp).
export default function SqlLineArea({ id, label, value, onChange, readOnly, placeholder, errorLines = [], textareaRef, onKeyDown, describedBy }: Props) {
	const gutterRef = useRef<HTMLPreElement>(null);
	const total = useMemo(() => Math.min(MAX_GUTTER_LINES, countLines(value)), [value]);
	const errorKey = errorLines.join(',');

	const gutter = useMemo<ReactNode>(() => {
		const errs = Array.from(new Set(errorLines.filter((l) => l >= 1 && l <= total))).sort((a, b) => a - b);
		if (errs.length === 0) return numbers(1, total);
		const out: ReactNode[] = [];
		let cursor = 1;
		for (const line of errs) {
			if (line > cursor) out.push(numbers(cursor, line - 1) + '\n');
			out.push(
				<span key={line} className="font-bold text-destructive">
					{line}
				</span>,
			);
			out.push(line < total ? '\n' : '');
			cursor = line + 1;
		}
		if (cursor <= total) out.push(numbers(cursor, total));
		return out;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [total, errorKey]);

	return (
		<div className="flex h-72 min-w-0 overflow-hidden rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-ring sm:h-96">
			<pre
				ref={gutterRef}
				aria-hidden="true"
				className="m-0 shrink-0 select-none overflow-hidden border-r border-border bg-muted/40 px-2 pt-3 pb-6 text-right font-mono text-xs leading-5 text-muted-foreground"
			>
				{gutter}
			</pre>
			<textarea
				id={id}
				ref={textareaRef}
				aria-label={label}
				aria-describedby={describedBy}
				value={value}
				readOnly={readOnly}
				onChange={onChange ? (e) => onChange(e.target.value) : undefined}
				onKeyDown={onKeyDown}
				onScroll={(e) => {
					if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
				}}
				placeholder={placeholder}
				wrap="off"
				spellCheck={false}
				autoCapitalize="off"
				autoCorrect="off"
				className="min-w-0 flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-3 pt-3 pb-3 font-mono text-xs leading-5 text-foreground outline-none"
			/>
		</div>
	);
}
