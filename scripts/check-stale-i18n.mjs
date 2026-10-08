// Usage: node scripts/check-stale-i18n.mjs [--base <commit>] [--locale xx] [--list] [--json out.json]
// Finds translations that are probably STALE: the English text changed since <base>, but the locale value is
// exactly what it was at <base> (so nobody re-translated it). Needs git; reads files via `git show`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const arg = (n, d = null) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const base = arg('--base', 'ba193b2');
const only = arg('--locale');
const list = process.argv.includes('--list');
const jsonOut = arg('--json');
const root = path.resolve('src/i18n/locales');
const flat = (o, p = '', out = {}) => {
	for (const [k, v] of Object.entries(o)) {
		const key = p ? `${p}.${k}` : k;
		if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
		else out[key] = v;
	}
	return out;
};
const gitShow = (rel) => {
	try {
		return JSON.parse(execFileSync('git', ['show', `${base}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
	} catch { return null; }
};
const norm = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : JSON.stringify(s));
const enFiles = fs.readdirSync(path.join(root, 'en')).filter((f) => f.endsWith('.json'));
const locales = fs.readdirSync(root).filter((l) => l !== 'en' && (!only || l === only));
const enNow = {}, enOld = {};
for (const f of enFiles) {
	enNow[f] = flat(JSON.parse(fs.readFileSync(path.join(root, 'en', f), 'utf8')));
	const o = gitShow(`src/i18n/locales/en/${f}`);
	enOld[f] = o ? flat(o) : null;
}
const result = {};
let total = 0;
for (const loc of locales) {
	result[loc] = {};
	for (const f of enFiles) {
		if (!enOld[f]) continue; // file is new since base: translated fresh, can't be stale
		const pOld = gitShow(`src/i18n/locales/${loc}/${f}`);
		const pNowPath = path.join(root, loc, f);
		if (!pOld || !fs.existsSync(pNowPath)) continue;
		const lOld = flat(pOld), lNow = flat(JSON.parse(fs.readFileSync(pNowPath, 'utf8')));
		for (const k of Object.keys(enNow[f])) {
			if (!(k in enOld[f]) || !(k in lOld) || !(k in lNow)) continue;
			if (norm(enOld[f][k]) === norm(enNow[f][k])) continue; // English unchanged
			if (norm(lOld[k]) !== norm(lNow[k])) continue; // translation already touched
			(result[loc][f] ??= []).push(k);
			total++;
		}
	}
}
for (const loc of locales) {
	const files = result[loc];
	const n = Object.values(files).reduce((a, b) => a + b.length, 0);
	console.log(`${loc}: stale keys=${n} in ${Object.keys(files).length} file(s)`);
	if (list) for (const [f, ks] of Object.entries(files)) console.log(`  ${f}: ${ks.join(', ')}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(result, null, 1));
process.exitCode = total > 0 ? 1 : 0;
