import { describe, expect, it } from 'vitest';
import { buildExportHtml, createSlugger, slugifyHeading } from '../markdown-utils';

describe('slugify', () => {
	it('keeps unicode letters and strips punctuation', () => {
		expect(slugifyHeading('Giới thiệu & Cài đặt!')).toBe('giới-thiệu-cài-đặt');
		expect(slugifyHeading('  Hello,   World  ')).toBe('hello-world');
		expect(slugifyHeading('!!!')).toBe('section');
	});
	it('de-duplicates repeated headings', () => {
		const slug = createSlugger();
		expect([slug('Intro'), slug('Intro'), slug('Intro')]).toEqual(['intro', 'intro-1', 'intro-2']);
	});
});

describe('buildExportHtml', () => {
	it('adds lang, viewport, escaped title and basic css', () => {
		const html = buildExportHtml('A <b> & "c"', 'vi', '<h1>x</h1>');
		expect(html).toContain('<html lang="vi">');
		expect(html).toContain('name="viewport"');
		expect(html).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
		expect(html).toContain('<style>');
		expect(html).toContain('<h1>x</h1>');
	});
});
