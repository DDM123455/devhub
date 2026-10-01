import { locales, type Locale } from '../i18n/config';
import { tools } from '../data/tools';

/**
 * Chuyển một pathname (đã thuộc locale `from`) sang pathname tương đương của locale `to`.
 * - /{from}/tools/{slug}/ -> /{to}/tools/{slugBảnĐịa}/ (nếu không tìm thấy tool thì về trang chủ locale đích)
 * - /{from}/privacy/ -> /{to}/privacy/
 * - các trang còn lại (home, 404, ...) -> trang chủ locale đích.
 */
export function localizePath(pathname: string, from: Locale, to: Locale): string {
	const home = `/${to}/`;
	const prefix = `/${from}`;
	if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return home;
	const rest = pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '');
	if (rest === '') return home;
	if (rest === 'privacy') return `/${to}/privacy/`;
	const m = rest.match(/^tools\/(.+)$/);
	if (m) {
		let slug = m[1];
		try {
			slug = decodeURIComponent(slug);
		} catch {
			/* giữ nguyên */
		}
		const tool = tools.find((tl) => tl.slugs[from] === slug);
		if (tool && tool.slugs[to]) return `/${to}/tools/${tool.slugs[to]}/`;
	}
	return home;
}

/** Danh sách alternate hreflang cho một trang; rỗng nếu không phải trang có bản dịch tương ứng (vd 404). */
export function getAlternates(pathname: string, from: Locale): { locale: Locale; path: string }[] {
	const rest = pathname.replace(new RegExp(`^/${from}(?=/|$)`), '').replace(/^\/+|\/+$/g, '');
	const isTool = rest.startsWith('tools/');
	const isKnown = rest === '' || rest === 'privacy' || isTool;
	if (!isKnown) return [];
	if (isTool) {
		let slug = rest.slice('tools/'.length);
		try {
			slug = decodeURIComponent(slug);
		} catch {
			/* giữ nguyên */
		}
		if (!tools.some((tl) => tl.slugs[from] === slug)) return [];
	}
	return locales.map((loc) => ({ locale: loc, path: localizePath(pathname, from, loc) }));
}

/** hreflang chuẩn BCP47: 'zh-tw' -> 'zh-TW'. */
export function toHreflang(locale: Locale): string {
	return locale === 'zh-tw' ? 'zh-TW' : locale;
}
