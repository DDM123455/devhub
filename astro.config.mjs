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
      // false: the root redirect is src/pages/index.astro (301, immediate). With true, Astro generates its own 302 page, which waits 2 s.
      redirectToDefaultLocale: false
    }
  },

  vite: {
    plugins: [tailwindcss()],
    // Dev only: these are loaded with a dynamic import() inside client islands, so Vite would
    // otherwise discover and re-optimise them mid-session — which invalidates the page's
    // `?v=` hash and makes the import fail ("Failed to fetch dynamically imported module",
    // blank QR preview / OCR error) until the dev server is restarted. Pre-bundle them up front.
    optimizeDeps: {
      include: [
        'jszip',
        'qr-code-styling',
        'heic2any',
        'pdfjs-dist',
        'pdf-lib',
        'exceljs',
        'mammoth/mammoth.browser.js',
        'katex',
        'tesseract.js',
        'tesseract.js/dist/tesseract.esm.min.js',
        'sql-formatter',
        'prettier/standalone',
        'marked',
        'jsonrepair',
        'dompurify',
        'gifenc',
        '@breezystack/lamejs'
      ]
    }
  },

  integrations: [
    react(),
    sitemap({
      // Bỏ trang 404 (mọi biến thể) khỏi sitemap; trang '/' chỉ là redirect nên không có file riêng.
      filter: (page) => {
        const path = new URL(page).pathname;
        // Also drop the /<locale>/tools/ index pages: they only meta-refresh (noindex) to the locale home.
        return !/\/404\/?$/.test(page) && path !== '/' && !/^\/[^/]+\/tools\/?$/.test(path);
      },
      i18n: {
        defaultLocale: 'en',
        locales: sitemapLocales
      }
    })
  ]
});