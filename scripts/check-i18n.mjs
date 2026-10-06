// Usage: node scripts/check-i18n.mjs [--locale xx] [--list]
// Reports keys that exist in the `en` locale files but are missing in other locales
// (missing file = every key missing), plus placeholder ({{x}}) mismatches.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('src/i18n/locales');
const only = process.argv.includes('--locale') ? process.argv[process.argv.indexOf('--locale') + 1] : null;
const list = process.argv.includes('--list');
const flat = (o, p = '', out = {}) => {
	for (const [k, v] of Object.entries(o)) {
		const key = p ? `${p}.${k}` : k;
		if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
		else out[key] = v;
	}
	return out;
};
const ph = (s) => (typeof s === 'string' ? (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((x) => x.replace(/\s/g, '')).sort().join(',') : '');
const enFiles = fs.readdirSync(path.join(root, 'en')).filter((f) => f.endsWith('.json'));
const locales = fs.readdirSync(root).filter((l) => l !== 'en' && (!only || l === only));
let total = 0;
for (const loc of locales) {
	let missing = 0, phBad = 0, files = 0;
	const detail = [];
	for (const f of enFiles) {
		const en = flat(JSON.parse(fs.readFileSync(path.join(root, 'en', f), 'utf8')));
		const p = path.join(root, loc, f);
		const lo = fs.existsSync(p) ? flat(JSON.parse(fs.readFileSync(p, 'utf8'))) : null;
		if (!lo) files++;
		let m = 0;
		for (const k of Object.keys(en)) {
			if (!lo || !(k in lo)) { m++; if (list) detail.push(`${f}:${k}`); }
			else if (ph(en[k]) !== ph(lo[k])) { phBad++; if (list) detail.push(`PLACEHOLDER ${f}:${k}`); }
		}
		missing += m;
	}
	total += missing + phBad;
	console.log(`${loc}: missing keys=${missing} (missing files=${files}) placeholderMismatch=${phBad}`);
	if (list) console.log(detail.join('\n'));
}
process.exitCode = total > 0 ? 1 : 0;
