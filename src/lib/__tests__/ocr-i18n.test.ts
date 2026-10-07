import { describe, it, expect } from 'vitest';
import en from '../../i18n/locales/en/tool-image-to-text.json';
import vi from '../../i18n/locales/vi/tool-image-to-text.json';
import { IMAGE_TO_TEXT_UI_KEYS } from '../ocr-ui-keys';
import { OCR_LANGUAGES } from '../ocr-languages';

type Dict = Record<string, unknown>;
const placeholders = (value: unknown) => [...String(value).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('tool-image-to-text i18n (en + vi)', () => {
	for (const [name, dict] of [['en', en], ['vi', vi]] as const) {
		const ui = dict.ui as Dict;
		it(`${name}: đủ mọi key ui mà component dùng, không dư key`, () => {
			for (const key of IMAGE_TO_TEXT_UI_KEYS) expect(ui[key], `${name}.ui.${key}`).toBeTruthy();
			expect(Object.keys(ui).sort()).toEqual([...IMAGE_TO_TEXT_UI_KEYS].sort());
		});
		it(`${name}: đủ tên cho mọi ngôn ngữ OCR`, () => {
			const languages = dict.languages as Dict;
			for (const code of OCR_LANGUAGES) expect(languages[code], `${name}.languages.${code}`).toBeTruthy();
			expect(Object.keys(languages).length).toBe(OCR_LANGUAGES.length);
		});
		it(`${name}: có meta, heading, faq 5 câu, bài viết 5 đoạn`, () => {
			expect((dict.meta as Dict).title).toBeTruthy();
			expect((dict.meta as Dict).description).toBeTruthy();
			expect(dict.heading).toBeTruthy();
			for (let i = 1; i <= 5; i++) {
				expect((dict.faq as Dict)[`q${i}`]).toBeTruthy();
				expect((dict.faq as Dict)[`a${i}`]).toBeTruthy();
				expect((dict.article as Dict)[`p${i}`]).toBeTruthy();
			}
		});
	}
	it('vi giữ đúng các placeholder của en cho từng key', () => {
		for (const key of IMAGE_TO_TEXT_UI_KEYS) {
			expect(placeholders((vi.ui as Dict)[key]), key).toEqual(placeholders((en.ui as Dict)[key]));
		}
	});
	it('bài viết en/vi dài khoảng 300-500 từ', () => {
		const count = (article: Dict) => {
			let n = 0;
			for (let i = 1; i <= 5; i++) n += String(article[`p${i}`]).split(/\s+/).length;
			return n;
		};
		expect(count(en.article as Dict)).toBeGreaterThanOrEqual(300);
		expect(count(en.article as Dict)).toBeLessThanOrEqual(520);
		expect(count(vi.article as Dict)).toBeGreaterThanOrEqual(300);
		expect(count(vi.article as Dict)).toBeLessThanOrEqual(600);
	});
});