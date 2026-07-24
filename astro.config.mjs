// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Domain thật do Cloudflare cấp sau khi connect Git (Workers static assets, không phải *.pages.dev cổ điển).
  site: 'https://devhub.duongdangmanh01.workers.dev',

  i18n: {
    locales: ['en', 'vi', 'es', 'pt', 'fr', 'de', 'ja', 'ko'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true
    }
  },

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    react(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          vi: 'vi',
          es: 'es',
          pt: 'pt',
          fr: 'fr',
          de: 'de',
          ja: 'ja',
          ko: 'ko'
        }
      }
    })
  ]
});