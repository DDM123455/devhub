import i18next from 'i18next';

import en from './locales/en/common.json';
import vi from './locales/vi/common.json';
import es from './locales/es/common.json';
import pt from './locales/pt/common.json';
import fr from './locales/fr/common.json';
import de from './locales/de/common.json';
import ja from './locales/ja/common.json';
import ko from './locales/ko/common.json';

import enImageCompress from './locales/en/tool-image-compress.json';
import viImageCompress from './locales/vi/tool-image-compress.json';
import esImageCompress from './locales/es/tool-image-compress.json';
import ptImageCompress from './locales/pt/tool-image-compress.json';
import frImageCompress from './locales/fr/tool-image-compress.json';
import deImageCompress from './locales/de/tool-image-compress.json';
import jaImageCompress from './locales/ja/tool-image-compress.json';
import koImageCompress from './locales/ko/tool-image-compress.json';

import { defaultLocale, type Locale } from './config';

void i18next.init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  defaultNS: 'common',
  resources: {
    en: { common: en, 'tool-image-compress': enImageCompress },
    vi: { common: vi, 'tool-image-compress': viImageCompress },
    es: { common: es, 'tool-image-compress': esImageCompress },
    pt: { common: pt, 'tool-image-compress': ptImageCompress },
    fr: { common: fr, 'tool-image-compress': frImageCompress },
    de: { common: de, 'tool-image-compress': deImageCompress },
    ja: { common: ja, 'tool-image-compress': jaImageCompress },
    ko: { common: ko, 'tool-image-compress': koImageCompress },
  },
  interpolation: {
    escapeValue: false,
  },
});

export function getFixedT(locale: Locale, ns: string = 'common') {
  return i18next.getFixedT(locale, ns);
}
