// Beautifies structured text pasted into the Text Diff Checker before it gets diffed —
// two JSON/XML payloads that are logically identical but minified differently (different
// indentation, key order preserved but everything on one line, etc.) otherwise show up as
// "completely different" in a line/word diff even though nothing meaningful changed.
// Detection + formatting both run purely with built-in browser APIs (JSON.parse/stringify,
// DOMParser/XMLSerializer) — no new dependency, per the project's "don't add a dependency
// unless truly necessary" rule.

export type DetectedFormat = 'json' | 'xml';

export interface FormatResult {
	value: string;
	detected: DetectedFormat;
}

function tryFormatJson(text: string): string | null {
	const trimmed = text.trim();
	if (trimmed === '' || !(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
	try {
		return JSON.stringify(JSON.parse(trimmed), null, 2);
	} catch {
		return null;
	}
}

// DOMParser has no built-in pretty-printer (XMLSerializer round-trips the DOM back to a
// single-line string), so indentation is rebuilt by hand walking the parsed tree. Elements
// whose only child is a single text node are kept inline (`<tag>value</tag>`) rather than
// wrapped onto 3 lines, which matches how most XML formatters (including Diffchecker's)
// render leaf values and keeps line-level diffing meaningful.
function indentXmlNode(node: Node, depth: number, lines: string[]): void {
	const indent = '  '.repeat(depth);
	if (node.nodeType === Node.COMMENT_NODE) {
		lines.push(`${indent}<!--${node.textContent ?? ''}-->`);
		return;
	}
	if (node.nodeType === Node.CDATA_SECTION_NODE) {
		lines.push(`${indent}<![CDATA[${node.textContent ?? ''}]]>`);
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;

	const element = node as Element;
	const attrs = Array.from(element.attributes)
		.map((attr) => ` ${attr.name}="${attr.value}"`)
		.join('');
	const meaningfulChildren = Array.from(element.childNodes).filter(
		(child) => !(child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() === ''),
	);

	if (meaningfulChildren.length === 0) {
		lines.push(`${indent}<${element.tagName}${attrs}/>`);
		return;
	}
	if (meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === Node.TEXT_NODE) {
		lines.push(`${indent}<${element.tagName}${attrs}>${(meaningfulChildren[0].textContent ?? '').trim()}</${element.tagName}>`);
		return;
	}
	lines.push(`${indent}<${element.tagName}${attrs}>`);
	for (const child of meaningfulChildren) indentXmlNode(child, depth + 1, lines);
	lines.push(`${indent}</${element.tagName}>`);
}

function tryFormatXml(text: string): string | null {
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
		if (child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.COMMENT_NODE) {
			indentXmlNode(child, 0, lines);
		}
	}
	return lines.length > 0 ? lines.join('\n') : null;
}

// Tries JSON first (cheap syntactic check, no DOM work) then XML. Returns null rather than
// throwing so the caller can leave the user's text untouched and show an inline hint instead
// of losing their input on a false-positive detection.
export function autoFormatText(text: string): FormatResult | null {
	const asJson = tryFormatJson(text);
	if (asJson !== null) return { value: asJson, detected: 'json' };
	const asXml = tryFormatXml(text);
	if (asXml !== null) return { value: asXml, detected: 'xml' };
	return null;
}
