import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRelatedTools, tools } from '../../data/tools';

const LOCALES_DIR = join(process.cwd(), 'src/i18n/locales');
const locales = readdirSync(LOCALES_DIR).filter((d) => !d.startsWith('.'));

interface MetaRow {
	locale: string;
	file: string;
	title: string;
	description: string;
}

const rows: MetaRow[] = [];
for (const locale of locales) {
	for (const file of readdirSync(join(LOCALES_DIR, locale)).filter((f) => f.startsWith('tool-') && f.endsWith('.json'))) {
		const json = JSON.parse(readFileSync(join(LOCALES_DIR, locale, file), 'utf8')) as { meta?: { title?: string; description?: string } };
		if (json.meta?.title) rows.push({ locale, file, title: json.meta.title, description: json.meta.description ?? '' });
	}
}

// Display width: CJK characters take two columns in a search-result title.
const columns = (s: string) => [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠]/.test(ch) ? 2 : 1), 0);

describe('tool page <title>', () => {
	it('exists for every locale and tool file', () => {
		expect(rows.length).toBeGreaterThan(400);
		expect(rows.filter((r) => !r.title.trim())).toEqual([]);
	});

	it('fits a search-result title (<= 70 columns) in every locale', () => {
		const long = rows.filter((r) => columns(r.title) > 70).map((r) => `${r.locale}/${r.file}: ${columns(r.title)}`);
		expect(long).toEqual([]);
	});

	it('is unique across every locale (no two URLs share one title)', () => {
		const seen = new Map<string, string[]>();
		for (const r of rows) seen.set(r.title, [...(seen.get(r.title) ?? []), `${r.locale}/${r.file}`]);
		const dupes = [...seen.entries()].filter(([, where]) => where.length > 1).map(([t, where]) => `${t} -> ${where.join(', ')}`);
		expect(dupes).toEqual([]);
	});
});

describe('tool page meta description (en, vi)', () => {
	it('is present and does not exceed ~160 characters', () => {
		const bad = rows
			.filter((r) => r.locale === 'en' || r.locale === 'vi')
			.filter((r) => r.description.length < 50 || [...r.description].length > 165)
			.map((r) => `${r.locale}/${r.file}: ${[...r.description].length}`);
		expect(bad).toEqual([]);
	});
});

describe('internal "related tools" links', () => {
	it('never links a tool to itself and has no duplicates', () => {
		for (const tool of tools) {
			const ids = getRelatedTools(tool).map((t) => t.id);
			expect(ids).not.toContain(tool.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	it('gives every tool at least one related link, and the small categories at least two', () => {
		for (const tool of tools) expect(getRelatedTools(tool).length, tool.id).toBeGreaterThanOrEqual(1);
		for (const id of ['pdf-merge', 'pdf-split', 'audio-converter', 'video-trim']) {
			const tool = tools.find((t) => t.id === id)!;
			expect(getRelatedTools(tool).length, id).toBeGreaterThanOrEqual(2);
		}
	});
});

describe('localized slugs', () => {
	it('are unique within each locale', () => {
		for (const locale of locales) {
			const slugs = tools.map((t) => (t.slugs as Record<string, string>)[locale]).filter(Boolean);
			expect(new Set(slugs).size, locale).toBe(slugs.length);
		}
	});
});
