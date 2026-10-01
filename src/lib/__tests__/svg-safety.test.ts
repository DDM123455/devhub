import { describe, expect, it } from 'vitest';
import { optimize } from 'svgo/browser';
import { buildPreviewDoc, detectSvgRisks } from '../svg-safety';

describe('detectSvgRisks', () => {
	it('returns nothing for a clean SVG', () => {
		expect(detectSvgRisks('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>')).toEqual([]);
	});

	it('finds scripts, handlers, javascript: links, foreignObject and external refs', () => {
		const svg =
			'<svg><script>alert(1)</script><rect onclick="x()"/><a href="javascript:alert(1)"/>' +
			'<foreignObject><div/></foreignObject><use href="https://evil.test/a.svg#x"/>' +
			'<image xlink:href="//evil.test/p.png"/></svg>';
		expect(detectSvgRisks(svg).sort()).toEqual(
			['eventHandler', 'externalImage', 'externalUse', 'foreignObject', 'javascriptUrl', 'script'].sort(),
		);
	});

	it('does not flag local use references or data: images', () => {
		expect(detectSvgRisks('<svg><use href="#a"/><image href="data:image/png;base64,AAAA"/></svg>')).toEqual([]);
	});
});

describe('preview document', () => {
	it('embeds a restrictive CSP meta tag', () => {
		const doc = buildPreviewDoc('<svg/>');
		expect(doc).toContain('http-equiv="Content-Security-Policy"');
		expect(doc).toContain("default-src 'none'");
	});
});

describe('svgo removeScripts plugin', () => {
	it('strips scripts and event handlers', () => {
		const out = optimize('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1" onclick="x()"/></svg>', {
			plugins: [{ name: 'removeScripts' }],
		}).data;
		expect(out).not.toContain('script');
		expect(out).not.toContain('onclick');
	});
});
