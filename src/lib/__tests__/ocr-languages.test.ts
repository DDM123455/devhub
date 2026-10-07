import { describe, it, expect } from 'vitest';
import { locales } from '../../i18n/config';
import {
	buildLangParam,
	defaultOcrLanguages,
	isOcrLanguage,
	MAX_OCR_LANGUAGES,
	normalizeOcrLanguages,
	OCR_LANGUAGES,
	OCR_LANGUAGE_BYTES,
	ocrLanguageForLocale,
	totalLanguageBytes,
} from '../ocr-languages';

describe('ocr-languages', () => {
	it('mọi locale của site đều ánh xạ ra mã tessdata hợp lệ', () => {
		for (const locale of locales) {
			expect(isOcrLanguage(ocrLanguageForLocale(locale)), locale).toBe(true);
		}
	});
	it('ánh xạ đúng mã tessdata cho các locale đặc biệt', () => {
		expect(ocrLanguageForLocale('zh')).toBe('chi_sim');
		expect(ocrLanguageForLocale('zh-tw')).toBe('chi_tra');
		expect(ocrLanguageForLocale('ja')).toBe('jpn');
		expect(ocrLanguageForLocale('vi')).toBe('vie');
		expect(ocrLanguageForLocale('xx')).toBe('eng');
	});
	it('mặc định: ngôn ngữ trang + eng; en chỉ eng', () => {
		expect(defaultOcrLanguages('en')).toEqual(['eng']);
		expect(defaultOcrLanguages('vi')).toEqual(['vie', 'eng']);
	});
	it('normalize: bỏ mã lạ, trùng, cắt tối đa, không bao giờ rỗng', () => {
		expect(normalizeOcrLanguages(['vie', 'xxx', 'vie', 'eng'])).toEqual(['vie', 'eng']);
		expect(normalizeOcrLanguages([])).toEqual(['eng']);
		expect(normalizeOcrLanguages(['eng', 'vie', 'spa', 'por', 'fra', 'deu']).length).toBe(MAX_OCR_LANGUAGES);
	});
	it('buildLangParam nối bằng +', () => {
		expect(buildLangParam(['vie', 'eng'])).toBe('vie+eng');
	});
	it('mọi ngôn ngữ có kích thước và tổng được cộng đúng', () => {
		for (const code of OCR_LANGUAGES) expect(OCR_LANGUAGE_BYTES[code], code).toBeGreaterThan(0);
		expect(totalLanguageBytes(['vie', 'eng'])).toBe(OCR_LANGUAGE_BYTES.vie + OCR_LANGUAGE_BYTES.eng);
	});
});
