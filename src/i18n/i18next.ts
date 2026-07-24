import i18next from 'i18next';

import en from './locales/en/common.json';
import vi from './locales/vi/common.json';
import es from './locales/es/common.json';
import pt from './locales/pt/common.json';
import fr from './locales/fr/common.json';
import de from './locales/de/common.json';
import ja from './locales/ja/common.json';
import ko from './locales/ko/common.json';

import { defaultLocale, type Locale } from './config';

void i18next.init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  defaultNS: 'common',
  resources: {
    en: { common: en },
    vi: { common: vi },
    es: { common: es },
    pt: { common: pt },
    fr: { common: fr },
    de: { common: de },
    ja: { common: ja },
    ko: { common: ko },
  },
  interpolation: {
    escapeValue: false,
  },
});

export function getFixedT(locale: Locale) {
  return i18next.getFixedT(locale, 'common');
}
