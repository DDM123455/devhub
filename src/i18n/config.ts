export const locales = [
	'en',
	'vi',
	'es',
	'pt',
	'fr',
	'de',
	'ja',
	'ko',
	'zh',
	'zh-tw',
	'it',
	'ru',
	'nl',
	'pl',
	'tr',
	'id',
	'ar',
	'hi',
	'th',
	'sv',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// Locales allowed in search engines for now. The other translations are `noindex` (and left out of the
// sitemap/hreflang) until a native speaker has reviewed them — add a locale here to open it up.
export const indexableLocales: ReadonlySet<Locale> = new Set<Locale>(['en', 'vi']);

// Right-to-left locales — Layout.astro sets <html dir="rtl"> for these so
// native browser behavior (text alignment, form control alignment) flips
// correctly. Full mirrored layout (icons, margins) is a larger follow-up.
export const rtlLocales: ReadonlySet<Locale> = new Set(['ar']);
