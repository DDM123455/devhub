// Beautifies structured text pasted into the Text Diff Checker before it gets diffed —
// two JSON/XML payloads that are logically identical but minified differently (different
// indentation, key order preserved but everything on one line, etc.) otherwise show up as
// "completely different" in a line/word diff even though nothing meaningful changed.
// Detection + formatting both run purely with built-in browser APIs (DOMParser/
// XMLSerializer for XML) plus a tiny lossless JSON pretty-printer — no new dependency.

export type DetectedFormat = 'json' | 'xml';
export type FormatWarning = 'duplicateKeys';

export interface FormatResult {
	value: string;
	detected: DetectedFormat;
	warnings: FormatWarning[];
}

// ---------------------------------------------------------------------------
// JSON — lossless pretty-printer.
// JSON.parse + JSON.stringify silently corrupts data: integers beyond 2^53 are rounded,
// duplicate keys are dropped, and integer-like keys are re-ordered. This printer keeps
// numbers as their raw source text, keeps duplicate keys and key order, and only
// normalises string escapes (via JSON.parse of the single string token).
// ---------------------------------------------------------------------------

class JsonSyntaxError extends Error {}

type JsonNode =
	| { t: 'raw'; text: string }
	| { t: 'array'; items: JsonNode[] }
	| { t: 'object'; entries: Array<[string, JsonNode]> };

function parseJsonPreserving(text: string): { node: JsonNode; hasDuplicateKeys: boolean } {
	let pos = 0;
	let hasDuplicateKeys = false;
	const ws = () => {
		while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t' || text[pos] === '\n' || text[pos] === '\r')) pos++;
	};
	const fail = (): never => {
		throw new JsonSyntaxError(`Unexpected token at ${pos}`);
	};
	const parseString = (): string => {
		const start = pos;
		pos++; // opening quote
		while (pos < text.length && text[pos] !== '"') {
			if (text[pos] === '\\') pos++;
			pos++;
		}
		if (pos >= text.length) fail();
		pos++; // closing quote
		// JSON.parse validates escapes and control characters for us.
		const parsed = JSON.parse(text.slice(start, pos)) as string;
		return parsed;
	};
	const parseValue = (): JsonNode => {
		ws();
		const ch = text[pos];
		if (ch === '{') {
			pos++;
			const entries: Array<[string, JsonNode]> = [];
			const seen = new Set<string>();
			ws();
			if (text[pos] === '}') {
				pos++;
				return { t: 'object', entries };
			}
			for (;;) {
				ws();
				if (text[pos] !== '"') fail();
				const key = parseString();
				if (seen.has(key)) hasDuplicateKeys = true;
				seen.add(key);
				ws();
				if (text[pos] !== ':') fail();
				pos++;
				entries.push([key, parseValue()]);
				ws();
				if (text[pos] === ',') {
					pos++;
					continue;
				}
				if (text[pos] === '}') {
					pos++;
					return { t: 'object', entries };
				}
				fail();
			}
		}
		if (ch === '[') {
			pos++;
			const items: JsonNode[] = [];
			ws();
			if (text[pos] === ']') {
				pos++;
				return { t: 'array', items };
			}
			for (;;) {
				items.push(parseValue());
				ws();
				if (text[pos] === ',') {
					pos++;
					continue;
				}
				if (text[pos] === ']') {
					pos++;
					return { t: 'array', items };
				}
				fail();
			}
		}
		if (ch === '"') return { t: 'raw', text: JSON.stringify(parseString()) };
		const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(pos, pos + 400));
		if (!literal) return fail();
		pos += literal[0].length;
		return { t: 'raw', text: literal[0] };
	};
	const node = parseValue();
	ws();
	if (pos !== text.length) fail();
	return { node, hasDuplicateKeys };
}

function printJson(node: JsonNode, depth: number, compact = false, unit = '  '): string {
	if (node.t === 'raw') return node.text;
	if (compact) {
		if (node.t === 'array') return `[${node.items.map((item) => printJson(item, 0, true, unit)).join(',')}]`;
		return `{${node.entries.map(([k, v]) => `${JSON.stringify(k)}:${printJson(v, 0, true, unit)}`).join(',')}}`;
	}
	const pad = unit.repeat(depth + 1);
	const end = unit.repeat(depth);
	if (node.t === 'array') {
		if (node.items.length === 0) return '[]';
		return `[\n${node.items.map((item) => pad + printJson(item, depth + 1, false, unit)).join(',\n')}\n${end}]`;
	}
	if (node.entries.length === 0) return '{}';
	return `{\n${node.entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${printJson(v, depth + 1, false, unit)}`).join(',\n')}\n${end}}`;
}

export function formatJsonLossless(text: string, compact = false, unit = '  '): { value: string; hasDuplicateKeys: boolean } | null {
	try {
		const { node, hasDuplicateKeys } = parseJsonPreserving(text.trim());
		return { value: printJson(node, 0, compact, unit), hasDuplicateKeys };
	} catch {
		return null;
	}
}

function tryFormatJson(text: string, unit: string): FormatResult | null {
	const trimmed = text.trim();
	if (trimmed === '' || !(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
	const result = formatJsonLossless(trimmed, false, unit);
	if (!result) return null;
	return { value: result.value, detected: 'json', warnings: result.hasDuplicateKeys ? ['duplicateKeys'] : [] };
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

export function escapeXmlText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/\t/g, '&#9;')
		.replace(/\n/g, '&#10;')
		.replace(/\r/g, '&#13;');
}

// DOMParser has no built-in pretty-printer (XMLSerializer round-trips the DOM back to a
// single-line string), so indentation is rebuilt by hand walking the parsed tree. Elements
// whose only child is a single text node are kept inline (`<tag>value</tag>`), and
// MIXED content (text interleaved with child elements, e.g. `<p>Hi <b>x</b></p>`) is
// emitted verbatim on one line since re-indenting it would change the document's text.
function indentXmlNode(node: Node, depth: number, lines: string[], unit = '  '): void {
	const indent = unit.repeat(depth);
	if (node.nodeType === Node.COMMENT_NODE) {
		lines.push(`${indent}<!--${node.textContent ?? ''}-->`);
		return;
	}
	if (node.nodeType === Node.CDATA_SECTION_NODE) {
		lines.push(`${indent}<![CDATA[${node.textContent ?? ''}]]>`);
		return;
	}
	if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
		lines.push(`${indent}<?${(node as ProcessingInstruction).target} ${(node as ProcessingInstruction).data}?>`);
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;

	const element = node as Element;
	const attrs = Array.from(element.attributes)
		.map((attr) => ` ${attr.name}="${escapeXmlAttr(attr.value)}"`)
		.join('');
	const meaningfulChildren = Array.from(element.childNodes).filter(
		(child) => !(child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() === ''),
	);

	if (meaningfulChildren.length === 0) {
		lines.push(`${indent}<${element.tagName}${attrs}/>`);
		return;
	}
	if (meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === Node.TEXT_NODE) {
		lines.push(
			`${indent}<${element.tagName}${attrs}>${escapeXmlText((meaningfulChildren[0].textContent ?? '').trim())}</${element.tagName}>`,
		);
		return;
	}
	const hasTextChild = meaningfulChildren.some((child) => child.nodeType === Node.TEXT_NODE);
	if (hasTextChild) {
		lines.push(indent + new XMLSerializer().serializeToString(element));
		return;
	}
	lines.push(`${indent}<${element.tagName}${attrs}>`);
	for (const child of meaningfulChildren) indentXmlNode(child, depth + 1, lines, unit);
	lines.push(`${indent}</${element.tagName}>`);
}

function tryFormatXml(text: string, unit: string): FormatResult | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith('<')) return null;
	const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
	// A malformed document doesn't throw — the browser injects a `<parsererror>` element
	// into the returned Document instead, so that's the actual failure signal to check for.
	if (doc.getElementsByTagName('parsererror').length > 0) return null;

	const lines: string[] = [];
	const declarationMatch = trimmed.match(/^<\?xml[^>]*\?>/);
	if (declarationMatch) lines.push(declarationMatch[0]);
	for (const child of Array.from(doc.childNodes)) {
		if (
			child.nodeType === Node.ELEMENT_NODE ||
			child.nodeType === Node.COMMENT_NODE ||
			(child.nodeType === Node.PROCESSING_INSTRUCTION_NODE && (child as ProcessingInstruction).target !== 'xml')
		) {
			indentXmlNode(child, 0, lines, unit);
		}
	}
	return lines.length > 0 ? { value: lines.join('\n'), detected: 'xml', warnings: [] } : null;
}

// Tries JSON first (cheap syntactic check, no DOM work) then XML. Returns null rather than
// throwing so the caller can leave the user's text untouched and show an inline hint instead
// of losing their input on a false-positive detection.
export function autoFormatText(text: string, unit = '  '): FormatResult | null {
	const asJson = tryFormatJson(text, unit);
	if (asJson) return asJson;
	if (typeof DOMParser === 'undefined') return null;
	return tryFormatXml(text, unit);
}

/**
 * Formats strictly as XML (no JSON attempt) and, on malformed XML, returns the parser's
 * message with line/column when the browser reports them (Chrome: "error on line 2 at column 5",
 * Firefox: "Line Number 2, Column 5"). Needs a DOM.
 */
export function formatXmlStrict(text: string, unit = '  '): FormatResult | { error: { line?: number; column?: number; message: string } } {
	const trimmed = text.trim();
	if (typeof DOMParser === 'undefined' || !trimmed.startsWith('<')) return { error: { message: 'Not XML' } };
	const result = tryFormatXml(trimmed, unit);
	if (result) return result;
	const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
	const raw = doc.getElementsByTagName('parsererror')[0]?.textContent ?? '';
	const pos = /line(?: number)?\s*:?\s*(\d+)[^\d]{1,12}column(?: number)?\s*:?\s*(\d+)/i.exec(raw);
	const detail =
		/column\s*\d+\s*:\s*([^\n]+)/i.exec(raw)?.[1] ??
		raw.split('\n').find((l) => l.trim() !== '' && !/^this page contains/i.test(l.trim())) ??
		'Malformed XML';
	return {
		error: {
			line: pos ? Number(pos[1]) : undefined,
			column: pos ? Number(pos[2]) : undefined,
			message: detail.replace(/\s+/g, ' ').trim().slice(0, 160),
		},
	};
}
