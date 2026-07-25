import i18next from 'i18next';

import { defaultLocale, type Locale } from './config';

const dictionaryModules = import.meta.glob<{ default: Record<string, unknown> }>(
  './locales/*/*.json',
  { eager: true },
);

const resources: Record<string, Record<string, Record<string, unknown>>> = {};

for (const [path, mod] of Object.entries(dictionaryModules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, locale, namespace] = match;
  resources[locale] ??= {};
  resources[locale][namespace] = mod.default;
}

void i18next.init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  defaultNS: 'common',
  resources,
  interpolation: {
    escapeValue: false,
  },
  // Without this, i18next's default language-code formatting reformats
  // 'zh-tw' to 'zh-TW' for lookup, which doesn't match our lowercase
  // 'zh-tw' resource key — it silently falls back to 'zh' (Simplified)
  // instead of erroring, so the bug is easy to miss without this comment.
  lowerCaseLng: true,
});

export function getFixedT(locale: Locale, ns: string = 'common') {
  return i18next.getFixedT(locale, ns);
}
