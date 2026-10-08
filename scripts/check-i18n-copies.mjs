// Usage: node scripts/check-i18n-copies.mjs [--list]
// Detects COPIED translations: a long string that is identical, at the same key, in two different non-English
// locales (and different from English). Catches a locale file that accidentally holds another language's text
// (e.g. ko containing Russian/Indonesian, fr containing Thai). Known harmless repeats (URLs, PEM/code examples,
// words shared by related languages) are expected and can be ignored after a quick look.
import fs from 'node:fs';
import path from 'node:path';
const list = process.argv.includes('--list');
const MINLEN = Number(process.argv.includes('--min') ? process.argv[process.argv.indexOf('--min') + 1] : 50);
const root = path.resolve('src/i18n/locales');
const flat = (o, p = '', out = {}) => {
	for (const [k, v] of Object.entries(o)) {
		const key = p ? `${p}.${k}` : k;
		if (Array.isArray(v)) v.forEach((x, i) => (x && typeof x === 'object' ? flat(x, `${key}[${i}]`, out) : (out[`${key}[${i}]`] = x)));
		else if (v && typeof v === 'object') flat(v, key, out);
		else out[key] = v;
	}
	return out;
};
const locs = fs.readdirSync(root);
const data = {};
for (const l of locs) {
	data[l] = {};
	for (const f of fs.readdirSync(path.join(root, l)).filter((x) => x.endsWith('.json'))) data[l][f] = flat(JSON.parse(fs.readFileSync(path.join(root, l, f), 'utf8')));
}
const pairs = {};
for (const f of Object.keys(data.en)) {
	for (const k of Object.keys(data.en[f])) {
		const seen = {};
		for (const l of locs) {
			if (l === 'en') continue;
			const v = data[l]?.[f]?.[k];
			if (typeof v !== 'string' || v.length < MINLEN || v === data.en[f][k]) continue;
			if (!seen[v]) seen[v] = [];
			seen[v].push(l);
		}
		for (const ls of Object.values(seen)) {
			if (ls.length < 2) continue;
			const id = ls.sort().join('+');
			if (!pairs[id]) pairs[id] = [];
			pairs[id].push(`${f}:${k}`);
		}
	}
}
let total = 0;
for (const [id, ks] of Object.entries(pairs)) {
	total += ks.length;
	console.log(`${id}: ${ks.length}${list ? '\n  ' + ks.join('\n  ') : '  e.g. ' + ks.slice(0, 3).join(' | ')}`);
}
if (total === 0) console.log('no copied strings found');
process.exitCode = total > 0 ? 1 : 0;
