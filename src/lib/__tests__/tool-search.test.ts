import { describe, expect, it } from 'vitest';
import { tools } from '../../data/tools';
import { TOOL_KEYWORDS, matchesQuery, normalizeSearchText, toolSearchText } from '../tool-search';

const locales = Object.keys(tools[0].names) as Array<keyof (typeof tools)[number]['names']>;
const textOf = (id: string, locale: (typeof locales)[number]) => {
	const tool = tools.find((t) => t.id === id)!;
	return toolSearchText(id, locale, [tool.names[locale], tool.names.en]);
};
/** ids of the tools a query finds on a given locale's page */
const find = (query: string, locale: (typeof locales)[number] = 'en') =>
	tools.filter((t) => matchesQuery(textOf(t.id, locale), query)).map((t) => t.id);

describe('normalizeSearchText', () => {
	it('strips diacritics, đ and case', () => {
		expect(normalizeSearchText('Nén ảnh')).toBe('nen anh');
		expect(normalizeSearchText('Đếm từ & ký tự')).toBe('dem tu ky tu');
		expect(normalizeSearchText('ĐỔI')).toBe('doi');
	});
	it('treats both tone-mark positions and composed/decomposed input alike', () => {
		expect(normalizeSearchText('xoá nền')).toBe(normalizeSearchText('Xóa nền'));
		expect(normalizeSearchText('ả'.normalize('NFD'))).toBe(normalizeSearchText('ả'.normalize('NFC')));
	});
	it('collapses punctuation and whitespace, keeps non-Latin letters', () => {
		expect(normalizeSearchText('  Base64   Encode/Decode  ')).toBe('base64 encode decode');
		expect(normalizeSearchText('画像圧縮')).toBe('画像圧縮');
		expect(normalizeSearchText('ضغط الصورة')).toBe('ضغط الصورة');
	});
});

describe('matchesQuery', () => {
	it('an empty or blank query matches everything', () => {
		expect(find('')).toHaveLength(tools.length);
		expect(find('   ')).toHaveLength(tools.length);
	});
	it('matches word starts only, never the middle of a word', () => {
		expect(find('anh', 'vi')).not.toContain('audio-converter'); // "âm th-anh"
		expect(find('anh', 'vi').sort()).toEqual(['background-remover', 'image-compress', 'image-convert', 'image-to-text']);
		expect(find('ert')).toEqual([]); // inside "convert"
	});
	it('every word must match, in any order', () => {
		expect(find('pdf merge')).toEqual(['pdf-merge']);
		expect(find('merge pdf')).toEqual(['pdf-merge']);
		expect(find('format json')).toContain('json-formatter');
		expect(find('json format')).toContain('json-formatter');
		expect(find('pdf zzz')).toEqual([]);
	});
	it('no match returns nothing', () => {
		expect(find('xyz')).toEqual([]);
		expect(find('qwertyuiop')).toEqual([]);
	});
});

describe('every tool can be found', () => {
	it('has a keyword entry for every tool id', () => {
		for (const t of tools) expect(TOOL_KEYWORDS[t.id], t.id).toBeTruthy();
		expect(Object.keys(TOOL_KEYWORDS).sort()).toEqual(tools.map((t) => t.id).sort());
	});
	it('by its own name in every locale, with and without diacritics', () => {
		for (const locale of locales) {
			for (const t of tools) {
				expect(find(t.names[locale], locale), `${locale}: ${t.names[locale]}`).toContain(t.id);
				expect(find(normalizeSearchText(t.names[locale]), locale), `${locale} plain: ${t.names[locale]}`).toContain(t.id);
			}
		}
	});
	it('by its English name on any locale', () => {
		for (const locale of locales) for (const t of tools) expect(find(t.names.en, locale)).toContain(t.id);
	});
});

describe('what people really type (English)', () => {
	const cases: Array<[string, string[]]> = [
		['compare', ['text-diff']],
		['diff', ['text-diff']],
		['compress', ['image-compress']],
		['resize', ['image-compress', 'image-convert']],
		['token', ['jwt-decoder']],
		['hex', ['color-picker']],
		['colour', ['color-picker']],
		['k8s', ['kubernetes-yaml-validator']],
		['xlsx', ['json-excel-converter']],
		['regular expression', ['regex-tester']],
		['ocr', ['image-to-text']],
		['qr', ['qr-generator']],
		['pdf', ['image-to-text', 'pdf-merge', 'pdf-split']],
		['photo', ['background-remover', 'image-compress', 'image-convert', 'image-to-text']],
	];
	for (const [query, expected] of cases) {
		it(`"${query}"`, () => {
			const found = find(query);
			for (const id of expected) expect(found, query).toContain(id);
		});
	}
	it('"minify" finds the formatters and the SVG optimizer', () => {
		for (const id of ['json-formatter', 'sql-formatter', 'code-formatter', 'svg-optimizer']) expect(find('minify')).toContain(id);
	});
	it('English words work on a non-English page too', () => {
		expect(find('compress', 'vi')).toContain('image-compress');
		expect(find('compare', 'de')).toContain('text-diff');
	});
});

describe('what people really type (Vietnamese, with and without diacritics)', () => {
	const cases: Array<[string, string]> = [
		['nén ảnh', 'image-compress'],
		['nen anh', 'image-compress'],
		['so sánh', 'text-diff'],
		['so sanh', 'text-diff'],
		['gộp pdf', 'pdf-merge'],
		['gop pdf', 'pdf-merge'],
		['tách pdf', 'pdf-split'],
		['tach pdf', 'pdf-split'],
		['đếm từ', 'word-counter'],
		['dem tu', 'word-counter'],
		['mã qr', 'qr-generator'],
		['ma qr', 'qr-generator'],
		['mau sac', 'color-picker'],
		['xóa nền', 'background-remover'],
		['xoá nền', 'background-remover'],
		['xoa nen', 'background-remover'],
		['cat video', 'video-trim'],
		['chuyen doi', 'image-convert'],
	];
	for (const [query, id] of cases) {
		it(`"${query}" finds ${id}`, () => expect(find(query, 'vi')).toContain(id));
	}
	it('"ảnh" and "anh" find the same tools', () => {
		expect(find('ảnh', 'vi')).toEqual(find('anh', 'vi'));
	});
});
