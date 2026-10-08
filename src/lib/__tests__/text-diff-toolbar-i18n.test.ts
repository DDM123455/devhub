import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const page = readFileSync(resolve(root, 'components/tools/TextDiffPage.astro'), 'utf8');
const checker = readFileSync(resolve(root, 'components/tools/TextDiffChecker.tsx'), 'utf8');
const locale = (lang: string) => JSON.parse(readFileSync(resolve(root, `i18n/locales/${lang}/tool-text-diff.json`), 'utf8'));

const pageKeys = [...page.matchAll(/t\('ui\.([A-Za-z0-9]+)'/g)].map((m) => m[1]);
const NEW_KEYS = [
	'formatEmptyBoth',
	'formatOptions',
	'formatOptionsHint',
	'dismissNotice',
	'compareButton',
	'compareAria',
	'compareEmpty',
	'compareFound',
	'compareIdentical',
	'resultsHeading',
];

describe.each(['en', 'vi'])('Text Diff toolbar i18n (%s)', (lang) => {
	const ui = locale(lang).ui as Record<string, unknown>;
	it('every key the page passes to the component exists', () => {
		const missing = pageKeys.filter((key) => typeof ui[key] !== 'string' && typeof ui[key] !== 'object');
		expect(missing).toEqual([]);
	});
	it('has the new Compare / options keys', () => {
		for (const key of NEW_KEYS) expect(typeof ui[key]).toBe('string');
		expect(ui.compareFound as string).toContain('{{count}}');
	});
	it('no longer ships the removed format panel keys, and nothing references them', () => {
		for (const key of ['formatBoth', 'formatSettingsHeading', 'formatNote', 'formatAria']) {
			expect(ui[key]).toBeUndefined();
			expect(pageKeys).not.toContain(key);
			expect(checker).not.toMatch(new RegExp(`messages\\.${key}\\b`));
		}
	});
	it('article no longer mentions the removed Format both button', () => {
		const p5 = (locale(lang).article as Record<string, string>).p5;
		expect(p5).not.toMatch(/Format both|Định dạng cả hai/);
	});
});

describe('Text Diff checker wiring', () => {
	it('exposes a single results region that Compare scrolls to', () => {
		expect(checker).toContain('id="text-diff-results"');
		expect(checker).toContain('scrollIntoView');
		expect(checker).toContain('prefers-reduced-motion');
	});
	it('no longer renders the big format panel or per-side format buttons', () => {
		expect(checker).not.toContain('text-diff-format-heading');
		expect(checker).not.toContain('handleFormatBoth');
	});
});
