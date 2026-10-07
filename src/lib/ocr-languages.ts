// Ánh xạ ngôn ngữ cho công cụ Ảnh sang văn bản (OCR). Thuần logic, không DOM.
// Mã dùng đúng tên file tessdata của @tesseract.js-data (bản 4.0.0_best_int).

export const OCR_LANGUAGES = [
	'eng',
	'vie',
	'spa',
	'por',
	'fra',
	'deu',
	'jpn',
	'kor',
	'chi_sim',
	'chi_tra',
	'ita',
	'rus',
	'nld',
	'pol',
	'tur',
	'ind',
	'ara',
	'hin',
	'tha',
	'swe',
	'ukr',
	'ces',
	'ell',
	'heb',
	'ron',
	'hun',
	'fin',
	'dan',
	'nor',
	'bul',
	'ben',
	'fas',
	'msa',
	'cat',
	'slk',
] as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

/** Số ngôn ngữ tối đa nhận dạng cùng lúc (nhiều hơn làm chậm và giảm độ chính xác). */
export const MAX_OCR_LANGUAGES = 4;

// Kích thước file .traineddata.gz (byte) trên jsDelivr, đo thực tế — chỉ dùng để báo
// cho người dùng biết sắp tải bao nhiêu dữ liệu ở lần đầu.
export const OCR_LANGUAGE_BYTES: Record<OcrLanguage, number> = {
	eng: 2952873,
	vie: 1423003,
	spa: 2100190,
	por: 1392239,
	fra: 707406,
	deu: 1333102,
	jpn: 2030256,
	kor: 1572336,
	chi_sim: 1718768,
	chi_tra: 1656239,
	ita: 1660998,
	rus: 2679598,
	nld: 3005696,
	pol: 2642356,
	tur: 2141291,
	ind: 1194182,
	ara: 1661906,
	hin: 1389692,
	tha: 896631,
	swe: 2503095,
	ukr: 2114206,
	ces: 2225029,
	ell: 1324749,
	heb: 580576,
	ron: 1692160,
	hun: 2854466,
	fin: 3795323,
	dan: 1845116,
	nor: 2490241,
	bul: 1411343,
	ben: 1373429,
	fas: 424507,
	msa: 1177136,
	cat: 639438,
	slk: 2377899,
};

const LOCALE_TO_LANGUAGE: Record<string, OcrLanguage> = {
	en: 'eng',
	vi: 'vie',
	es: 'spa',
	pt: 'por',
	fr: 'fra',
	de: 'deu',
	ja: 'jpn',
	ko: 'kor',
	zh: 'chi_sim',
	'zh-tw': 'chi_tra',
	it: 'ita',
	ru: 'rus',
	nl: 'nld',
	pl: 'pol',
	tr: 'tur',
	id: 'ind',
	ar: 'ara',
	hi: 'hin',
	th: 'tha',
	sv: 'swe',
};

export function isOcrLanguage(code: string): code is OcrLanguage {
	return (OCR_LANGUAGES as readonly string[]).includes(code);
}

/** Mã tessdata tương ứng với locale của trang (mặc định eng cho locale lạ). */
export function ocrLanguageForLocale(locale: string): OcrLanguage {
	return LOCALE_TO_LANGUAGE[locale.toLowerCase()] ?? 'eng';
}

/**
 * Ngôn ngữ mặc định: ngôn ngữ của trang, kèm tiếng Anh (văn bản thực tế rất hay lẫn từ/ký tự
 * tiếng Anh, số, URL). Locale en chỉ có eng.
 */
export function defaultOcrLanguages(locale: string): OcrLanguage[] {
	const main = ocrLanguageForLocale(locale);
	return main === 'eng' ? ['eng'] : [main, 'eng'];
}

/** Lọc mã không hợp lệ, bỏ trùng, cắt tối đa MAX_OCR_LANGUAGES; luôn trả ít nhất 1 ngôn ngữ. */
export function normalizeOcrLanguages(codes: readonly string[]): OcrLanguage[] {
	const out: OcrLanguage[] = [];
	for (const code of codes) {
		if (isOcrLanguage(code) && !out.includes(code)) out.push(code);
		if (out.length >= MAX_OCR_LANGUAGES) break;
	}
	return out.length > 0 ? out : ['eng'];
}

/** Chuỗi ngôn ngữ kiểu "vie+eng" truyền cho tesseract. */
export function buildLangParam(codes: readonly string[]): string {
	return normalizeOcrLanguages(codes).join('+');
}

/** Tổng dung lượng dữ liệu ngôn ngữ (byte) cần tải ở lần đầu. */
export function totalLanguageBytes(codes: readonly string[]): number {
	return normalizeOcrLanguages(codes).reduce((sum, code) => sum + OCR_LANGUAGE_BYTES[code], 0);
}

/** Chế độ bố cục trang (page segmentation mode) cho phép chọn. 12 (OSD) bị loại vì cần thêm dữ liệu OSD. */
export const OCR_PSM_MODES = [3, 4, 6, 11, 7, 8] as const;
export type OcrPsm = (typeof OCR_PSM_MODES)[number];
export const DEFAULT_OCR_PSM: OcrPsm = 3;

export function isOcrPsm(value: number): value is OcrPsm {
	return (OCR_PSM_MODES as readonly number[]).includes(value);
}
