// Pure helpers for the Markdown Editor's extra features: math extraction (for KaTeX), outline
// (table of contents) extraction, and the local multi-document ("tabs") store.

/* ------------------------------------------------------------------ math */

export interface MathSegment {
	id: number;
	tex: string;
	display: boolean;
}

export interface MathExtraction {
	text: string;
	segments: MathSegment[];
}

export function mathPlaceholder(id: number): string {
	return `zzmathph${id}zz`;
}

// Replaces $...$ (inline) and $$...$$ (display) with alphanumeric placeholders so `marked`
// never touches the TeX. Code is left alone: fenced blocks (``` / ~~~) and inline `code`.
// Heuristics that avoid false positives on prose: an inline formula may not start or end with
// whitespace, may not span lines, and the closing `$` may not be followed by a digit ("$5 and
// $10" stays text). `\$` is an escaped dollar sign.
export function extractMath(markdown: string): MathExtraction {
	const segments: MathSegment[] = [];
	let out = '';
	let i = 0;
	const n = markdown.length;
	const push = (tex: string, display: boolean) => {
		const id = segments.length;
		segments.push({ id, tex, display });
		out += mathPlaceholder(id);
	};
	let atLineStart = true;
	while (i < n) {
		const ch = markdown[i];
		// fenced code block
		if (atLineStart && (markdown.startsWith('```', i) || markdown.startsWith('~~~', i))) {
			const fence = markdown.slice(i, i + 3);
			const lineEnd = markdown.indexOf('\n', i);
			let searchFrom = lineEnd === -1 ? n : lineEnd + 1;
			let close = -1;
			while (searchFrom < n) {
				const nl = markdown.indexOf('\n', searchFrom);
				const lineEndPos = nl === -1 ? n : nl;
				if (markdown.slice(searchFrom, lineEndPos).trimStart().startsWith(fence)) {
					close = lineEndPos;
					break;
				}
				searchFrom = lineEndPos + 1;
			}
			const end = close === -1 ? n : close;
			out += markdown.slice(i, end);
			i = end;
			atLineStart = false;
			continue;
		}
		if (ch === '\n') {
			out += ch;
			i++;
			atLineStart = true;
			continue;
		}
		atLineStart = false;
		if (ch === '\\' && i + 1 < n) {
			out += ch + markdown[i + 1];
			i += 2;
			continue;
		}
		if (ch === '`') {
			let run = 1;
			while (markdown[i + run] === '`') run++;
			const ticks = '`'.repeat(run);
			const close = markdown.indexOf(ticks, i + run);
			if (close === -1) {
				out += ticks;
				i += run;
			} else {
				out += markdown.slice(i, close + run);
				i = close + run;
			}
			continue;
		}
		if (ch === '$') {
			if (markdown[i + 1] === '$') {
				const close = markdown.indexOf('$$', i + 2);
				if (close !== -1 && markdown.slice(i + 2, close).trim() !== '') {
					push(markdown.slice(i + 2, close).trim(), true);
					i = close + 2;
					continue;
				}
			} else {
				let j = i + 1;
				let found = -1;
				while (j < n && markdown[j] !== '\n') {
					if (markdown[j] === '\\') {
						j += 2;
						continue;
					}
					if (markdown[j] === '$') {
						found = j;
						break;
					}
					j++;
				}
				if (found !== -1) {
					const tex = markdown.slice(i + 1, found);
					const next = markdown[found + 1];
					if (tex.trim() !== '' && tex === tex.trim() && !(next !== undefined && /\d/.test(next))) {
						push(tex, false);
						i = found + 1;
						continue;
					}
				}
			}
		}
		out += ch;
		i++;
	}
	return { text: out, segments };
}

// Substitutes each placeholder in the (already sanitized) HTML with its rendered formula.
export function restoreMath(html: string, rendered: string[]): string {
	return html.replace(/zzmathph(\d+)zz/g, (match, id: string) => rendered[Number(id)] ?? match);
}

/* ------------------------------------------------------------------ outline */

export interface OutlineItem {
	level: number;
	/** May be empty: DOMPurify strips ids that clash with document properties (e.g. "title"). */
	id: string;
	text: string;
	/** Position among ALL headings of the document, used to find the element when there is no id. */
	index: number;
}

function decodeBasicEntities(text: string): string {
	return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// Reads the headings (with the ids the preview renderer assigned) out of sanitized HTML.
export function extractOutline(html: string): OutlineItem[] {
	const items: OutlineItem[] = [];
	const re = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g;
	let match: RegExpExecArray | null;
	let index = -1;
	while ((match = re.exec(html)) !== null) {
		index += 1;
		const text = decodeBasicEntities(match[3].replace(/<[^>]*>/g, '')).trim();
		const id = /\bid="([^"]*)"/.exec(match[2])?.[1] ?? '';
		if (text !== '') items.push({ level: Number(match[1]), id: decodeBasicEntities(id), text, index });
	}
	return items;
}

/* ------------------------------------------------------------------ local documents (tabs) */

export interface MarkdownDoc {
	id: string;
	content: string;
}

export interface DocsState {
	docs: MarkdownDoc[];
	activeId: string;
}

export const MAX_DOCS = 10;
export const MAX_DOCS_TOTAL_CHARS = 2_000_000;

export function newDocId(): string {
	return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function deriveDocTitle(content: string, fallback: string): string {
	for (const rawLine of content.split('\n')) {
		const line = rawLine.replace(/^#{1,6}\s*/, '').replace(/[*_`>#\[\]]/g, '').trim();
		if (line !== '') return line.length > 24 ? `${line.slice(0, 24)}…` : line;
	}
	return fallback;
}

export function parseDocsState(raw: string | null): DocsState | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { docs?: unknown; activeId?: unknown };
		if (!Array.isArray(parsed.docs) || parsed.docs.length === 0) return null;
		const docs: MarkdownDoc[] = [];
		for (const doc of parsed.docs) {
			if (doc && typeof doc.id === 'string' && typeof doc.content === 'string') docs.push({ id: doc.id, content: doc.content });
		}
		if (docs.length === 0) return null;
		const activeId = typeof parsed.activeId === 'string' && docs.some((d) => d.id === parsed.activeId) ? parsed.activeId : docs[0].id;
		return { docs: docs.slice(0, MAX_DOCS), activeId };
	} catch {
		return null;
	}
}

export function totalChars(docs: MarkdownDoc[]): number {
	return docs.reduce((sum, d) => sum + d.content.length, 0);
}

export function canAddDoc(docs: MarkdownDoc[]): boolean {
	return docs.length < MAX_DOCS && totalChars(docs) < MAX_DOCS_TOTAL_CHARS;
}
