import { describe, expect, it } from 'vitest';
import { compressedSize, styleAttrToJsx, svgToDataUri, svgToJsx, toJsxAttrName, uniqueFileName, utf8ToBase64 } from '../svg-export';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#f00" d="M0 0h10v10z"/></svg>';

describe('data URI', () => {
	it('base64 round-trips UTF-8', () => {
		const text = '<svg><text>Xin chào ✓</text></svg>';
		const uri = svgToDataUri(text, 'base64');
		expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
		const b64 = uri.split(',')[1];
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		expect(new TextDecoder().decode(bytes)).toBe(text);
		expect(utf8ToBase64('abc')).toBe('YWJj');
	});
	it('url-encoded keeps it quote-safe', () => {
		const uri = svgToDataUri(SVG, 'encoded');
		expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
		expect(uri).not.toContain('"');
		expect(uri).not.toContain('<');
		expect(uri).not.toContain('#');
		expect(uri).toContain('%23f00');
		expect(decodeURIComponent(uri.slice('data:image/svg+xml,'.length))).toContain("fill='#f00'");
	});
});

describe('JSX conversion', () => {
	it('renames attributes', () => {
		expect(toJsxAttrName('stroke-width')).toBe('strokeWidth');
		expect(toJsxAttrName('class')).toBe('className');
		expect(toJsxAttrName('xlink:href')).toBe('xlinkHref');
		expect(toJsxAttrName('xml:space')).toBe('xmlSpace');
		expect(toJsxAttrName('xmlns:xlink')).toBe('xmlnsXlink');
		expect(toJsxAttrName('data-foo-bar')).toBe('data-foo-bar');
		expect(toJsxAttrName('aria-hidden')).toBe('aria-hidden');
	});
	it('converts style strings', () => {
		expect(styleAttrToJsx('fill:red;stroke-width:2')).toBe('{{ fill: "red", strokeWidth: "2" }}');
		expect(styleAttrToJsx('-webkit-mask:none;--c:1')).toBe('{{ WebkitMask: "none", "--c": "1" }}');
	});
	it('wraps into a component and spreads props on the root svg only', () => {
		const out = svgToJsx(
			'<?xml version="1.0"?><!-- c --><svg class="a" xmlns="http://www.w3.org/2000/svg"><g stroke-width="2" style="fill:red"><use xlink:href="#x"/></g></svg>',
		);
		expect(out).toContain('const SvgIcon = (props) => (');
		expect(out).toContain('<svg className="a" xmlns="http://www.w3.org/2000/svg" {...props}>');
		expect(out).toContain('<g strokeWidth="2" style={{ fill: "red" }}>');
		expect(out).toContain('<use xlinkHref="#x" />');
		expect(out).toContain('export default SvgIcon;');
		expect(out).not.toContain('<?xml');
		expect(out.match(/\{\.\.\.props\}/g)?.length).toBe(1);
	});
	it('puts <style> content in a template literal and escapes braces in text', () => {
		const out = svgToJsx('<svg><style>.a{fill:red}.b>.c{x:1}</style><text>{a}</text></svg>');
		expect(out).toContain('<style>{`.a{fill:red}.b>.c{x:1}`}</style>');
		expect(out).toContain("<text>{'{'}a{'}'}</text>");
	});
});

describe('uniqueFileName', () => {
	it('adds numeric suffix on case-insensitive collision', () => {
		const used = new Set<string>();
		expect(uniqueFileName('a.svg', used)).toBe('a.svg');
		expect(uniqueFileName('A.svg', used)).toBe('A-2.svg');
		expect(uniqueFileName('a.svg', used)).toBe('a-3.svg');
	});
});

describe('compressedSize', () => {
	it('gzip is smaller for repetitive text (when supported)', async () => {
		const text = '<g>'.repeat(500);
		const size = await compressedSize(text, 'gzip');
		if (size !== null) expect(size).toBeLessThan(text.length);
	});
});
