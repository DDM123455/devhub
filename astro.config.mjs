// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Placeholder cho tới khi có domain/tên project Cloudflare Pages thật (xem task CI/CD kế tiếp).
  site: 'https://web-tool-hub.pages.dev',

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