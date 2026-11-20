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
			.filter((r) => r.description.length < 50 || [...r.description].length > 160)
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

	// Trước đây hàm này trả về cả nhóm, nên mỗi trang trong nhóm `dev` (14 công cụ) có 13 link.
	it('never exceeds four links, even in the 14-tool dev category', () => {
		const tooMany = tools
			.map((tool) => ({ id: tool.id, count: getRelatedTools(tool).length }))
			.filter((row) => row.count > 4);
		expect(tooMany).toEqual([]);
	});

	it('points at tools that exist', () => {
		const ids = new Set(tools.map((tool) => tool.id));
		for (const tool of tools) {
			for (const related of getRelatedTools(tool)) expect(ids.has(related.id), `${tool.id} -> ${related.id}`).toBe(true);
		}
	});

	// Hai công cụ làm việc chồng nhau thì phải trỏ sang nhau, để người dùng còn biết đường
	// so sánh — nếu chỉ một chiều thì nửa số người vào trang sai sẽ mắc kẹt ở đó.
	it('links overlapping tools in both directions', () => {
		const pairs = [
			['code-formatter', 'json-formatter'],
			['code-formatter', 'sql-formatter'],
			['video-trim', 'audio-converter'],
			['pdf-merge', 'image-convert'],
			['csv-json-converter', 'json-excel-converter'],
		];
		for (const [a, b] of pairs) {
			const toolA = tools.find((tool) => tool.id === a)!;
			const toolB = tools.find((tool) => tool.id === b)!;
			expect(getRelatedTools(toolA).map((t) => t.id), `${a} -> ${b}`).toContain(b);
			expect(getRelatedTools(toolB).map((t) => t.id), `${b} -> ${a}`).toContain(a);
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
