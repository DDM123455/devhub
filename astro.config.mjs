// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Một nguồn duy nhất cho danh sách locale: src/i18n/config.ts (đọc bằng regex để tránh import TS vào config).
import { readFileSync } from 'node:fs';
const configSrc = readFileSync(new URL('./src/i18n/config.ts', import.meta.url), 'utf8');
const localesBlock = configSrc.slice(configSrc.indexOf('export const locales'), configSrc.indexOf('as const'));
const locales = [...localesBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const sitemapLocales = Object.fromEntries(locales.map((l) => [l, l === 'zh-tw' ? 'zh-TW' : l]));

// https://astro.build/config
export default defineConfig({
  // Domain thật do Cloudflare cấp sau khi connect Git (Workers static assets, không phải *.pages.dev cổ điển).
  site: 'https://devhub.duongdangmanh01.workers.dev',

  i18n: {
    locales,
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
      // Bỏ trang 404 (mọi biến thể) khỏi sitemap; trang '/' chỉ là redirect nên không có file riêng.
      filter: (page) => !/\/404\/?$/.test(page) && new URL(page).pathname !== '/',
      i18n: {
        defaultLocale: 'en',
        locales: sitemapLocales
      }
    })
  ]
});