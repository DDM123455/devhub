export const locales = ['en', 'vi', 'es', 'pt', 'fr', 'de', 'ja', 'ko'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';
