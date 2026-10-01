// Pure helpers for the SVG Optimizer's export features (no DOM: unit-testable).

/** UTF-8 safe base64 for strings (btoa alone throws on non-Latin-1). */
export function utf8ToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/**
 * data: URI for an SVG.
 * - base64: `data:image/svg+xml;base64,...` (~33% larger, works everywhere)
 * - encoded: minimal URL-encoding (like mini-svg-data-uri): double quotes become single quotes so the
 *   result can sit inside url("..."), and only the characters that break parsing are percent-escaped.
 */
export function svgToDataUri(svg: string, mode: 'base64' | 'encoded'): string {
	const text = svg.trim();
	if (mode === 'base64') return `data:image/svg+xml;base64,${utf8ToBase64(text)}`;
	const compact = text.replace(/\s+/g, ' ').replace(/> </g, '><').replace(/"/g, "'");
	const encoded = compact
		.replace(/%/g, '%25')
		.replace(/#/g, '%23')
		.replace(/</g, '%3C')
		.replace(/>/g, '%3E')
		.replace(/\{/g, '%7B')
		.replace(/\}/g, '%7D')
		.replace(/\n/g, '%0A');
	return `data:image/svg+xml,${encoded}`;
}

// ---------------------------------------------------------------------------
// SVG -> JSX
// ---------------------------------------------------------------------------

function kebabToCamel(name: string): string {
	return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Maps an SVG/HTML attribute name to its React prop name. */
export function toJsxAttrName(name: string): string {
	if (name === 'class') return 'className';
	if (name === 'for') return 'htmlFor';
	if (name.startsWith('data-') || name.startsWith('aria-')) return name;
	if (name.includes(':')) {
		// xlink:href -> xlinkHref, xml:space -> xmlSpace, xmlns:xlink -> xmlnsXlink
		const [ns, ...rest] = name.split(':');
		return ns + rest.map((r) => kebabToCamel(r).replace(/^./, (c) => c.toUpperCase())).join('');
	}
	return kebabToCamel(name);
}

function styleKeyToJs(prop: string): string {
	const p = prop.trim();
	if (p.startsWith('--')) return JSON.stringify(p);
	if (p.startsWith('-ms-')) return kebabToCamel(p.slice(1));
	if (p.startsWith('-')) return kebabToCamel(p.slice(1)).replace(/^./, (c) => c.toUpperCase());
	return kebabToCamel(p);
}

/** `fill:red;stroke-width:2` -> `{{ fill: 'red', strokeWidth: '2' }}` */
export function styleAttrToJsx(css: string): string {
	const entries: string[] = [];
	for (const decl of css.split(';')) {
		const idx = decl.indexOf(':');
		if (idx < 0) continue;
		const key = decl.slice(0, idx).trim();
		const value = decl.slice(idx + 1).trim();
		if (!key || !value) continue;
		const jsKey = styleKeyToJs(key);
		entries.push(`${jsKey}: ${JSON.stringify(value)}`);
	}
	return `{{ ${entries.join(', ')} }}`;
}

function decodeAttrValue(raw: string): string {
	return raw.replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function convertAttributes(attrText: string): string {
	const out: string[] = [];
	const attrRe = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
	let m: RegExpExecArray | null;
	while ((m = attrRe.exec(attrText)) !== null) {
		const rawName = m[1];
		const value = m[2] ?? m[3];
		const name = toJsxAttrName(rawName);
		if (value === undefined) {
			out.push(name);
		} else if (rawName === 'style') {
			out.push(`style=${styleAttrToJsx(decodeAttrValue(value))}`);
		} else {
			const v = decodeAttrValue(value);
			out.push(v.includes('"') ? `${name}={${JSON.stringify(v)}}` : `${name}="${v}"`);
		}
	}
	return out.length ? ` ${out.join(' ')}` : '';
}

function escapeTemplateLiteral(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Converts SVG markup into a React component (JSX). Handles attribute renaming, inline `style`
 * strings, `<style>` blocks (as template literals) and `{`/`}` in text, and spreads `props` onto
 * the root <svg>. Regex-based: intended for SVGO-optimized output, not arbitrary XML.
 */
export function svgToJsx(svg: string, componentName = 'SvgIcon'): string {
	const cleaned = svg
		.replace(/<\?xml[\s\S]*?\?>/g, '')
		.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.trim();
	const tokenRe =
		/<(style|script)\b([^>]*)>([\s\S]*?)<\/\1>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
	let result = '';
	let last = 0;
	let rootSpread = false;
	let m: RegExpExecArray | null;
	const text = (t: string) => t.replace(/[{}]/g, (c) => (c === '{' ? "{'{'}" : "{'}'}"));
	while ((m = tokenRe.exec(cleaned)) !== null) {
		result += text(cleaned.slice(last, m.index));
		last = m.index + m[0].length;
		if (m[1]) {
			const attrs = convertAttributes(m[2]);
			result += `<${m[1]}${attrs}>{\`${escapeTemplateLiteral(m[3])}\`}</${m[1]}>`;
			continue;
		}
		const closing = m[4] === '/';
		const tag = m[5];
		const selfClose = m[7] === '/';
		if (closing) {
			result += `</${tag}>`;
			continue;
		}
		let attrs = convertAttributes(m[6]);
		if (!rootSpread && tag.toLowerCase() === 'svg') {
			attrs += ' {...props}';
			rootSpread = true;
		}
		result += `<${tag}${attrs}${selfClose ? ' /' : ''}>`;
	}
	result += text(cleaned.slice(last));
	const body = result
		.split('\n')
		.map((line) => `    ${line}`.trimEnd())
		.join('\n')
		.replace(/^\s+/, '');
	return `const ${componentName} = (props) => (\n  ${body}\n);\n\nexport default ${componentName};\n`;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Case-insensitive unique file name inside a zip: "a.svg", "a-2.svg", "a-3.svg"... */
export function uniqueFileName(name: string, used: Set<string>): string {
	const dot = name.lastIndexOf('.');
	const base = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';
	let candidate = name;
	let n = 1;
	while (used.has(candidate.toLowerCase())) {
		n += 1;
		candidate = `${base}-${n}${ext}`;
	}
	used.add(candidate.toLowerCase());
	return candidate;
}

export type CompressionFormat = 'gzip' | 'brotli';

/**
 * Compressed byte length via the Compression Streams API; null when the format is not supported by
 * this browser (brotli is not available in CompressionStream everywhere).
 */
export async function compressedSize(text: string, format: CompressionFormat): Promise<number | null> {
	if (typeof CompressionStream === 'undefined') return null;
	try {
		const stream = new Blob([text]).stream().pipeThrough(new CompressionStream(format as 'gzip'));
		const buffer = await new Response(stream).arrayBuffer();
		return buffer.byteLength;
	} catch {
		return null;
	}
}
