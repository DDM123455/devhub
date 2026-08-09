// Astro's flat "404.html" (no index.html wrapper) build convention — the
// shape Cloudflare Pages walks up directories looking for when a request
// matches nothing — is hardcoded to apply only to the literal top-level
// `src/pages/404.astro`. The localized 404 pages live at
// `src/pages/[locale]/404.astro` (a dynamic route), so Astro builds them the
// same as any other page: `dist/{locale}/404/index.html`. Cloudflare's
// not-found lookup does not follow into that directory, so without this step
// every locale would silently fall back to the plain English root 404 instead
// of its own translated one. This script runs after `astro build` and
// flattens each `dist/{locale}/404/index.html` into `dist/{locale}/404.html`.
import { readdir, rename, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

async function main() {
	if (!existsSync(distDir)) {
		console.error(`[fix-404-output] dist/ not found at ${distDir} — run "astro build" first.`);
		process.exitCode = 1;
		return;
	}

	const entries = await readdir(distDir, { withFileTypes: true });
	let fixed = 0;

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const localeDir = path.join(distDir, entry.name);
		const nestedIndex = path.join(localeDir, '404', 'index.html');
		const flatTarget = path.join(localeDir, '404.html');
		if (!existsSync(nestedIndex)) continue;

		await rename(nestedIndex, flatTarget);
		await rmdir(path.join(localeDir, '404'));
		fixed += 1;
	}

	console.log(`[fix-404-output] flattened ${fixed} localized 404 page(s) to {locale}/404.html`);
}

await main();
