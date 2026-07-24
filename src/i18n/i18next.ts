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

import enImageConvert from './locales/en/tool-image-convert.json';
import viImageConvert from './locales/vi/tool-image-convert.json';
import esImageConvert from './locales/es/tool-image-convert.json';
import ptImageConvert from './locales/pt/tool-image-convert.json';
import frImageConvert from './locales/fr/tool-image-convert.json';
import deImageConvert from './locales/de/tool-image-convert.json';
import jaImageConvert from './locales/ja/tool-image-convert.json';
import koImageConvert from './locales/ko/tool-image-convert.json';

import { defaultLocale, type Locale } from './config';

void i18next.init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  defaultNS: 'common',
  resources: {
    en: { common: en, 'tool-image-compress': enImageCompress, 'tool-image-convert': enImageConvert },
    vi: { common: vi, 'tool-image-compress': viImageCompress, 'tool-image-convert': viImageConvert },
    es: { common: es, 'tool-image-compress': esImageCompress, 'tool-image-convert': esImageConvert },
    pt: { common: pt, 'tool-image-compress': ptImageCompress, 'tool-image-convert': ptImageConvert },
    fr: { common: fr, 'tool-image-compress': frImageCompress, 'tool-image-convert': frImageConvert },
    de: { common: de, 'tool-image-compress': deImageCompress, 'tool-image-convert': deImageConvert },
    ja: { common: ja, 'tool-image-compress': jaImageCompress, 'tool-image-convert': jaImageConvert },
    ko: { common: ko, 'tool-image-compress': koImageCompress, 'tool-image-convert': koImageConvert },
  },
  interpolation: {
    escapeValue: false,
  },
});

export function getFixedT(locale: Locale, ns: string = 'common') {
  return i18next.getFixedT(locale, ns);
}
