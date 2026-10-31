// Search over the tool list on the home page.
//
// The first version lowercased the query and looked for it as a substring of the localized tool name. That
// broke in practice: Vietnamese typed without diacritics ("nen anh") found nothing, "anh" matched the "anh" inside
// "âm th-anh" (the audio converter) while missing every image tool, a different tone-mark position ("xoá"
// vs "xóa") failed, and English words such as "compress", "compare", "photo" or "token" found nothing at all.

/** Lowercase, strip diacritics (NFD + combining marks, đ → d), turn every non-alphanumeric run into one space. */
export function normalizeSearchText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[đĐ]/g, 'd')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/**
 * Language-neutral search terms per tool id: what people type that is not in the tool's name. English because that is
 * what people type on every locale ("pdf", "json", "ocr", "compress"). Only claim what the tool really does.
 */
export const TOOL_KEYWORDS: Record<string, string> = {
	'image-compress': 'compress reduce shrink optimize resize photo picture jpeg jpg png webp size kb',
	'image-convert': 'convert format change jpg jpeg png webp avif gif bmp heic ico svg photo picture resize',
	'background-remover': 'remove background transparent cutout erase bg png photo picture',
	'image-to-text': 'ocr extract text scan scanned recognize screenshot photo picture pdf',
	'svg-optimizer': 'svg optimize minify vector clean shrink',
	'pdf-merge': 'merge combine join pdf images to pdf',
	'pdf-split': 'split extract pages cut separate pdf',
	'text-diff': 'compare diff difference files changes merge patch',
	'word-counter': 'count words characters letters sentences paragraphs reading time length limit seo',
	'text-case-converter': 'case upper lower title camel snake kebab capitalize uppercase lowercase text',
	'markdown-editor': 'markdown md preview editor viewer html readme',
	'json-formatter': 'json format beautify pretty minify validate lint repair viewer',
	'qr-generator': 'qr code barcode generator wifi vcard link',
	'jwt-decoder': 'jwt token decode verify bearer auth jws',
	'base64-tool': 'base64 encode decode data uri binary',
	'regex-tester': 'regex regexp regular expression pattern match test',
	'color-picker': 'color colour picker palette hex rgb hsl eyedropper contrast',
	'csv-json-converter': 'csv json convert spreadsheet table jsonl xml yaml',
	'json-excel-converter': 'json excel xlsx spreadsheet convert',
	'nginx-config-validator': 'nginx config conf validate server lint web server',
	'kubernetes-yaml-validator': 'kubernetes k8s yaml validate manifest deployment kubectl lint',
	'sql-formatter': 'sql format beautify pretty minify validate mysql postgres query',
	'code-formatter': 'code format beautify pretty prettier javascript typescript css html js ts yaml markdown graphql minify indent',
	'video-trim': 'video trim cut clip mp4 gif shorten',
	'audio-converter': 'audio convert mp3 wav ogg flac m4a aac sound music',
	'iso-validator': 'iso validate validator check standard iban bic swift isin lei isbn issn vin container doi 8601 date time duration currency country language luhn credit card',
};

/**
 * Extra terms for a single locale: what that language's speakers type that is not in the (shorter) tool name.
 * Written without diacritics; matching strips them anyway. Vietnamese is the main audience besides English.
 */
export const LOCALE_KEYWORDS: Record<string, Record<string, string>> = {
	vi: {
		'image-compress': 'giam dung luong hinh anh nhe',
		'image-convert': 'doi dinh dang hinh anh',
		'background-remover': 'tach nen xoa phong nen anh',
		'image-to-text': 'trich chu doc chu hinh anh',
		'svg-optimizer': 'toi uu nen svg',
		'pdf-merge': 'noi ghep gop file pdf',
		'pdf-split': 'chia cat tach file pdf',
		'text-diff': 'doi chieu khac biet so sanh file',
		'word-counter': 'dem chu so tu ky tu',
		'text-case-converter': 'viet hoa viet thuong',
		'markdown-editor': 'soan thao xem truoc',
		'json-formatter': 'dinh dang lam dep kiem tra',
		'qr-generator': 'tao ma qr',
		'jwt-decoder': 'giai ma token',
		'base64-tool': 'ma hoa giai ma',
		'regex-tester': 'bieu thuc chinh quy kiem tra',
		'color-picker': 'mau sac bang mau chon mau',
		'csv-json-converter': 'chuyen doi bang',
		'json-excel-converter': 'chuyen doi bang tinh',
		'nginx-config-validator': 'kiem tra cau hinh may chu',
		'kubernetes-yaml-validator': 'kiem tra cau hinh',
		'sql-formatter': 'dinh dang lam dep cau lenh',
		'code-formatter': 'dinh dang lam dep ma nguon',
		'video-trim': 'cat video ngan',
		'audio-converter': 'doi am thanh nhac',
		'iso-validator': 'kiem tra chuan iso ngay gio tien te quoc gia ngon ngu ngan hang the so khung xe',
	},
};

/** The text a tool's card is searchable by on a given locale's page. */
export function toolSearchText(id: string, locale: string, names: readonly string[]): string {
	return buildSearchText(names, `${TOOL_KEYWORDS[id] ?? ''} ${LOCALE_KEYWORDS[locale]?.[id] ?? ''}`);
}

/** One normalized string holding every name and keyword a tool can be found by. */
export function buildSearchText(names: readonly string[], keywords = ''): string {
	return normalizeSearchText([...names, keywords].join(' '));
}

/** The names alone (no keywords), normalized: what `scoreQuery` treats as a strong match. */
export function toolNameText(names: readonly string[]): string {
	return normalizeSearchText(names.join(' '));
}

/**
 * How well a tool answers a query; 0 = not a match (same rule as `matchesQuery`). Per typed word: a word-start
 * in the tool NAME is worth far more than one only in its keywords; a name that is exactly the query, or starts
 * with it, wins over a name that merely contains the words. Used to order results and pick what Enter opens.
 */
export function scoreQuery(searchText: string, nameText: string, query: string): number {
	const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
	if (tokens.length === 0) return 0;
	if (!matchesQuery(searchText, query)) return 0;
	const paddedName = ` ${nameText} `;
	let score = 0;
	for (const token of tokens) score += paddedName.includes(` ${token}`) ? 100 : 20;
	const phrase = tokens.join(' ');
	if (nameText === phrase) score += 300;
	else if (nameText.startsWith(phrase)) score += 150;
	else if (paddedName.includes(` ${phrase}`)) score += 50;
	return score;
}

/**
 * Every word the user typed must be the START of some word in the tool's search text, in any order
 * ("pdf merge" finds "Merge PDF"). Prefix, not substring: "anh" must not match "thanh".
 */
export function matchesQuery(searchText: string, query: string): boolean {
	const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
	if (tokens.length === 0) return true;
	const padded = ` ${searchText} `;
	return tokens.every((token) => padded.includes(` ${token}`));
}
