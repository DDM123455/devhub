import { describe, it, expect } from 'vitest';
import { tools } from '../../data/tools';
import { locales } from '../../i18n/config';
import { localizePath, getAlternates } from '../locale-paths';

describe('tools.ts data integrity', () => {
	it('có đủ 20 locale', () => {
		expect(locales.length).toBe(20);
	});
	it('mỗi tool có slug và name không rỗng cho mọi locale', () => {
		for (const tool of tools) {
			for (const loc of locales) {
				expect(tool.slugs[loc], `${tool.id}.slugs.${loc}`).toBeTruthy();
				expect(tool.slugs[loc].trim()).not.toBe('');
				expect(tool.names[loc], `${tool.id}.names.${loc}`).toBeTruthy();
			}
		}
	});
	it('slug duy nhất trong mỗi locale', () => {
		for (const loc of locales) {
			const slugs = tools.map((t) => t.slugs[loc]);
			expect(new Set(slugs).size, `locale ${loc}`).toBe(slugs.length);
		}
	});
	it('id tool duy nhất', () => {
		expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
	});
});

describe('locale-paths', () => {
	it('map slug sang locale đích', () => {
		const tool = tools[0];
		expect(localizePath(`/en/tools/${tool.slugs.en}/`, 'en', 'vi')).toBe(`/vi/tools/${tool.slugs.vi}/`);
		expect(localizePath(`/vi/tools/${tool.slugs.vi}/`, 'vi', 'ja')).toBe(`/ja/tools/${tool.slugs.ja}/`);
	});
	it('slug không tồn tại -> trang chủ locale đích', () => {
		expect(localizePath('/en/tools/khong-co/', 'en', 'vi')).toBe('/vi/');
		expect(localizePath('/en/404/', 'en', 'vi')).toBe('/vi/');
	});
	it('home và privacy', () => {
		expect(localizePath('/en/', 'en', 'de')).toBe('/de/');
		expect(localizePath('/en/privacy/', 'en', 'de')).toBe('/de/privacy/');
	});
	it('getAlternates đủ 20 locale cho trang tool, rỗng cho 404', () => {
		expect(getAlternates(`/en/tools/${tools[0].slugs.en}/`, 'en').length).toBe(20);
		expect(getAlternates('/en/404/', 'en')).toEqual([]);
	});
});
