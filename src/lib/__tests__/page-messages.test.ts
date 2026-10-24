import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every string a React tool component declares in its top-level `Messages` interface must be handed to it
// by its *Page.astro. A missing key is not a type error across the Astro/React boundary: the string is
// simply `undefined` and the UI shows nothing (the Regex Tester "timed out" error was silently blank).
const dir = join(process.cwd(), 'src/components/tools');

function topLevelKeys(tsx: string): string[] {
	const m = tsx.match(/\ninterface Messages(?:\s+extends\s+[^{]+)?\s*\{([\s\S]*?)\n\}/);
	if (!m) return [];
	// only keys at one tab of indentation (nested groups such as `x: {…}` are checked separately)
	return [...m[1].matchAll(/^\t([A-Za-z0-9_]+)\??:\s*string\s*;/gm)].map((x) => x[1]);
}

describe('tool pages pass every message their component declares', () => {
	const pages = readdirSync(dir).filter((f) => f.endsWith('Page.astro'));
	for (const page of pages) {
		const astro = readFileSync(join(dir, page), 'utf8');
		if (astro.includes('returnObjects')) continue; // hands over the whole `ui` object, nothing can be missing
		const comps = [...astro.matchAll(/import\s+\w+\s+from\s+'\.\/(\w+)'/g)].map((m) => m[1]).filter((n) => existsSync(join(dir, `${n}.tsx`)));
		for (const comp of comps) {
			const keys = topLevelKeys(readFileSync(join(dir, `${comp}.tsx`), 'utf8'));
			if (keys.length === 0) continue;
			it(`${page} -> ${comp}`, () => {
				// keys may be passed as `key: t(...)`, `key,` shorthand, or via a spread, so look for the identifier at all
				const word = String.raw`\b`;
				const missing = keys.filter((k) => !new RegExp(`${word}${k}${word}`).test(astro));
				expect(missing).toEqual([]);
			});
		}
	}
});
