// KaTeX's stylesheet (30 KB, render-blocking) ends up linked from every tool page because Astro attaches the CSS of
// every island reachable from the shared tool route. Only the Markdown editor renders math, so drop the link from all
// other pages. Runs after `astro build`; harmless if the link is absent.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const LINK = /<link rel="stylesheet" href="\/_astro\/katex\.[A-Za-z0-9_-]+\.css">/g;

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.name.endsWith('.html')) yield full;
	}
}

async function main() {
	if (!existsSync(distDir)) {
		console.error('[strip-katex-css] dist/ not found — run "astro build" first.');
		process.exitCode = 1;
		return;
	}
	let stripped = 0;
	let kept = 0;
	for await (const file of walk(distDir)) {
		const html = await readFile(file, 'utf8');
		if (!LINK.test(html)) continue;
		LINK.lastIndex = 0;
		// The Markdown editor island is what needs the stylesheet.
		if (/MarkdownEditor/.test(html)) {
			kept += 1;
			continue;
		}
		await writeFile(file, html.replace(LINK, ''));
		stripped += 1;
	}
	console.log(`[strip-katex-css] removed the KaTeX stylesheet link from ${stripped} page(s), kept on ${kept} Markdown page(s)`);
}

main();
