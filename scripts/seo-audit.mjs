#!/usr/bin/env node
// SEO audit of the built site (dist/). No dependencies. Usage:
//   node scripts/seo-audit.mjs [--dist dist] [--json out.json] [--verbose]
// Exit code 1 when any P0/P1 finding exists. Checks what is actually in the generated HTML.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const DIST = opt('--dist', 'dist');
const JSON_OUT = opt('--json', '');
const VERBOSE = args.includes('--verbose');

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

const dp = (p) => {
	try {
		return decodeURIComponent(p);
	} catch {
		return p;
	}
};
const pnOf = (u, base) => dp(new URL(u, base).pathname);
const decode = (s) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'");
const strip = (s) => decode(s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function attr(tag, name) {
	const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
	return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null;
}
const tags = (html, re) => [...html.matchAll(re)].map((m) => m[0]);

// Space-separated words for alphabetic scripts; CJK/Thai have no spaces, so count characters / 2 instead.
function wordCount(text) {
	const cjk = (text.match(/[぀-ヿ㐀-鿿가-힯฀-๿]/g) || []).length;
	const latin = text.replace(/[぀-ヿ㐀-鿿가-힯฀-๿]/g, ' ').split(' ').filter(Boolean).length;
	return latin + Math.round(cjk / 2);
}

const files = walk(DIST).filter((f) => f.endsWith('.html'));
const pathOf = (file) => {
	let rel = '/' + relative(DIST, file).split(sep).join('/');
	rel = rel.replace(/index\.html$/, '');
	return rel;
};

const siteOrigin = (() => {
	const idx = readFileSync(join(DIST, 'sitemap-index.xml'), 'utf8');
	const m = idx.match(/<loc>(https?:\/\/[^/<]+)/);
	return m ? m[1] : '';
})();

const pages = new Map();
for (const f of files) {
	const html = readFileSync(f, 'utf8');
	const url = pathOf(f);
	const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
	const body = (html.match(/<body[\s\S]*<\/body>/i) || [''])[0];
	const main = (html.match(/<main[\s\S]*?<\/main>/i) || [''])[0];
	const title = decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]).trim();
	const metas = tags(head, /<meta\b[^>]*>/gi);
	const metaBy = (key, val) => {
		const t = metas.find((m) => (attr(m, key) || '').toLowerCase() === val);
		return t ? attr(t, 'content') : null;
	};
	const links = tags(head, /<link\b[^>]*>/gi);
	const canonical = (() => {
		const t = links.find((l) => (attr(l, 'rel') || '').toLowerCase() === 'canonical');
		return t ? attr(t, 'href') : null;
	})();
	const hreflangs = links
		.filter((l) => (attr(l, 'rel') || '').toLowerCase() === 'alternate' && attr(l, 'hreflang'))
		.map((l) => ({ lang: attr(l, 'hreflang'), href: attr(l, 'href') }));
	const jsonld = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
	const hs = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: strip(m[2]) }));
	const imgs = tags(body, /<img\b[^>]*>/gi).map((t) => ({ src: attr(t, 'src'), alt: attr(t, 'alt'), w: attr(t, 'width'), h: attr(t, 'height'), loading: attr(t, 'loading') }));
	const anchors = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: attr('<a ' + m[1] + '>', 'href'), aria: attr('<a ' + m[1] + '>', 'aria-label'), text: strip(m[2]), inner: m[2], rel: attr('<a ' + m[1] + '>', 'rel') }));
	pages.set(url, {
		file: f,
		url,
		lang: (html.match(/<html[^>]*\slang=["']([^"']*)["']/i) || [, null])[1],
		dir: (html.match(/<html[^>]*\sdir=["']([^"']*)["']/i) || [, null])[1],
		title,
		description: metaBy('name', 'description'),
		robots: metaBy('name', 'robots'),
		viewport: metaBy('name', 'viewport'),
		ogTitle: metaBy('property', 'og:title'),
		ogDesc: metaBy('property', 'og:description'),
		ogUrl: metaBy('property', 'og:url'),
		ogImage: metaBy('property', 'og:image'),
		twCard: metaBy('name', 'twitter:card'),
		canonical,
		hreflangs,
		jsonld,
		hs,
		imgs,
		anchors,
		words: wordCount(strip(main)),
		htmlBytes: Buffer.byteLength(html),
		isRedirect: /http-equiv=["']refresh["']/i.test(html),
		scriptSrcs: tags(html, /<script\b[^>]*\ssrc=[^>]*>/gi).map((t) => attr(t, 'src')),
		cssBlocking: tags(head, /<link\b[^>]*>/gi).filter((l) => (attr(l, 'rel') || '').toLowerCase() === 'stylesheet').length,
	});
}

// ---- findings -------------------------------------------------------------------------------
const findings = [];
const add = (sev, id, msg, urls = [], extra = '') => findings.push({ sev, id, msg, count: urls.length || 1, urls: urls.slice(0, 8), extra });

const indexable = [...pages.values()].filter((p) => !(p.robots || '').includes('noindex') && !p.isRedirect);
const is404 = (p) => /\/404\.html$/.test(p.file.split(sep).join('/')) || p.url === '/404.html';

// sitemap
const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const sitemapSet = new Set(sitemapUrls);
const sitemapDup = sitemapUrls.length - sitemapSet.size;
if (sitemapDup) add('P2', 'SITEMAP-DUP', 'Duplicate URLs in sitemap', []);
const sitemapPaths = new Set(sitemapUrls.map((u) => pnOf(u)));
const canonicalPaths = (p) => (p.canonical ? pnOf(p.canonical, siteOrigin) : null);
const notInSitemap = indexable.filter((p) => !is404(p) && p.canonical && !sitemapPaths.has(canonicalPaths(p))).map((p) => p.url);
if (notInSitemap.length) add('P1', 'SITEMAP-MISSING', 'Indexable pages missing from sitemap', notInSitemap);
const sitemapDead = sitemapUrls.filter((u) => !pages.has(pnOf(u))).map((u) => u);
if (sitemapDead.length) add('P0', 'SITEMAP-404', 'Sitemap URLs without a built page', sitemapDead);
const sitemapNoindex = [...pages.values()].filter((p) => (p.robots || '').includes('noindex') && sitemapPaths.has(p.url)).map((p) => p.url);
if (sitemapNoindex.length) add('P0', 'SITEMAP-NOINDEX', 'noindex pages listed in sitemap', sitemapNoindex);
const sitemapRedirects = [...pages.values()].filter((p) => p.isRedirect && sitemapPaths.has(p.url)).map((p) => p.url);
if (sitemapRedirects.length) add('P1', 'SITEMAP-REDIRECT', 'Redirect (meta-refresh) pages listed in sitemap', sitemapRedirects);
const sitemapHttp = sitemapUrls.filter((u) => !u.startsWith(siteOrigin)).slice(0, 5);
if (sitemapHttp.length) add('P1', 'SITEMAP-ORIGIN', 'Sitemap URLs on a different origin than the index', sitemapHttp);
const sitemapNoSlash = sitemapUrls.filter((u) => !u.endsWith('/')).slice(0, 5);

// robots.txt
const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
if (!robots) add('P0', 'ROBOTS-MISSING', 'robots.txt missing');
else {
	if (/Disallow:\s*\/\s*$/m.test(robots)) add('P0', 'ROBOTS-BLOCKALL', 'robots.txt disallows everything');
	if (!/Sitemap:/i.test(robots)) add('P1', 'ROBOTS-NOSITEMAP', 'robots.txt has no Sitemap line');
}

const perPage = [];
const titles = new Map();
const descs = new Map();
const h1s = new Map();

for (const p of [...pages.values()].sort((a, b) => a.url.localeCompare(b.url))) {
	const issues = [];
	const note = (sev, id) => issues.push(`${sev}:${id}`);
	const skip404 = is404(p);
	if (p.isRedirect) {
		perPage.push({ url: p.url, kind: 'redirect', issues: [] });
		continue;
	}
	if (!p.lang) note('P1', 'no-lang');
	if (!p.viewport) note('P1', 'no-viewport');
	if (!p.title) note('P0', 'no-title');
	else {
		if (p.title.length > 70) note('P3', 'title-long');
		if (p.title.length < 15) note('P3', 'title-short');
		if (!skip404) titles.set(p.title, [...(titles.get(p.title) || []), p.url]);
	}
	if (!p.description) note(skip404 ? 'P3' : 'P1', 'no-description');
	else {
		if (p.description.length > 175) note('P3', 'desc-long');
		if (p.description.length < (/^(ja|zh|zh-tw|ko)$/.test(p.lang || '') ? 25 : 50)) note('P2', 'desc-short');
		if (!skip404) descs.set(p.description, [...(descs.get(p.description) || []), p.url]);
	}
	if (!skip404) {
		if (!p.canonical) note('P0', 'no-canonical');
		else {
			let cp;
			try {
				cp = pnOf(p.canonical);
			} catch {
				note('P0', 'canonical-not-absolute');
			}
			if (cp && cp !== p.url) note('P1', 'canonical-not-self');
			if (cp && !p.canonical.startsWith(siteOrigin)) note('P1', 'canonical-origin');
		}
		if (p.ogUrl && p.canonical && p.ogUrl !== p.canonical) note('P2', 'ogurl-ne-canonical');
		if (!p.ogTitle || !p.ogImage) note('P2', 'og-missing');
		if (!p.twCard) note('P3', 'twitter-missing');
		// headings
		const h1 = p.hs.filter((h) => h.level === 1);
		if (h1.length === 0) note('P1', 'no-h1');
		if (h1.length > 1) note('P2', 'multi-h1');
		if (h1[0]) h1s.set(h1[0].text, [...(h1s.get(h1[0].text) || []), p.url]);
		for (let i = 1; i < p.hs.length; i++) if (p.hs[i].level - p.hs[i - 1].level > 1) { note('P3', 'heading-skip'); break; }
		if (p.hs.some((h) => !h.text)) note('P2', 'empty-heading');
		// hreflang
		if (p.hreflangs.length) {
			const self = p.hreflangs.find((h) => h.href && pnOf(h.href) === p.url);
			if (!self) note('P1', 'hreflang-no-self');
			if (!p.hreflangs.some((h) => h.lang === 'x-default')) note('P2', 'hreflang-no-xdefault');
			const seen = new Set();
			for (const h of p.hreflangs) {
				if (seen.has(h.lang)) note('P1', 'hreflang-dup');
				seen.add(h.lang);
				const target = h.href ? pages.get(pnOf(h.href)) : null;
				if (!target) note('P0', 'hreflang-target-missing');
				else if (!target.hreflangs.some((b) => b.href && pnOf(b.href) === p.url)) note('P1', 'hreflang-not-reciprocal');
			}
		}
		// json-ld
		for (const raw of p.jsonld) {
			try {
				const j = JSON.parse(raw);
				const arr = Array.isArray(j) ? j : j['@graph'] || [j];
				for (const n of arr) if (!n['@type']) note('P2', 'jsonld-no-type');
			} catch {
				note('P0', 'jsonld-invalid');
			}
		}
		// images
		for (const im of p.imgs) {
			if (im.alt === null) note('P2', 'img-no-alt');
			if (!(im.w && im.h)) note('P3', 'img-no-dimensions');
		}
		// links
		for (const a of p.anchors) {
			if (!a.href) note('P2', 'a-no-href');
			else if (a.href === '#' || a.href.startsWith('javascript:')) note('P2', 'a-dead-href');
			const hasLabel = a.text || a.aria || /<img[^>]+alt=["'][^"']+/.test(a.inner) || /<svg/.test(a.inner);
			if (!hasLabel) note('P2', 'a-empty-text');
			if (/^(click here|here|read more|more)$/i.test(a.text)) note('P3', 'a-generic-text');
		}
		if (p.words < 150 && p.url.split('/').filter(Boolean).length > 2) note('P2', 'thin-content');
	}
	perPage.push({ url: p.url, lang: p.lang, title: p.title, description: p.description, canonical: p.canonical, robots: p.robots, h1: (p.hs.find((h) => h.level === 1) || {}).text, jsonldTypes: p.jsonld.map((r) => { try { const j = JSON.parse(r); return (Array.isArray(j) ? j : j['@graph'] || [j]).map((n) => n['@type']).join('+'); } catch { return 'INVALID'; } }), words: p.words, issues: [...new Set(issues)] });
}

// duplicates across pages
const dupTitle = [...titles.entries()].filter(([, u]) => u.length > 1);
const dupDesc = [...descs.entries()].filter(([, u]) => u.length > 1);
const dupH1 = [...h1s.entries()].filter(([, u]) => u.length > 1);
if (dupTitle.length) add('P1', 'DUP-TITLE', `${dupTitle.length} duplicated titles`, dupTitle.flatMap(([t, u]) => u.map((x) => `${x}  «${t}»`)));
if (dupDesc.length) add('P1', 'DUP-DESC', `${dupDesc.length} duplicated meta descriptions`, dupDesc.flatMap(([t, u]) => u.map((x) => `${x}  «${t.slice(0, 60)}»`)));
if (dupH1.length) add('P3', 'DUP-H1', `${dupH1.length} H1 texts shared by several URLs (often a localized product name)`, dupH1.flatMap(([t, u]) => u.map((x) => `${x}  «${t}»`)));

// internal link integrity
const pageExists = (path) => {
	const clean = path.split('#')[0].split('?')[0];
	if (pages.has(clean)) return true;
	if (existsSync(join(DIST, clean))) return statSync(join(DIST, clean)).isFile();
	return false;
};
const broken = new Map();
const redirectsTo = [];
const inlinks = new Map();
for (const p of pages.values()) {
	if (is404(p)) continue;
	for (const a of p.anchors) {
		if (!a.href || /^(mailto:|tel:|javascript:|#)/.test(a.href)) continue;
		let u;
		try {
			u = new URL(a.href, siteOrigin + p.url);
		} catch {
			continue;
		}
		if (u.origin !== siteOrigin) continue;
		const path = dp(u.pathname);
		if (!pageExists(path)) {
			broken.set(path, [...(broken.get(path) || []), p.url]);
			continue;
		}
		if (!path.endsWith('/') && pages.has(path + '/')) redirectsTo.push(`${p.url} -> ${path}`);
		if (pages.has(path)) inlinks.set(path, (inlinks.get(path) || 0) + 1);
		const t = pages.get(path);
		if (t && t.isRedirect) redirectsTo.push(`${p.url} -> ${path} (meta-refresh)`);
	}
}
if (broken.size) add('P0', 'BROKEN-LINKS', `${broken.size} internal link targets do not exist`, [...broken.entries()].map(([t, from]) => `${t}  (from ${from[0]}${from.length > 1 ? ` +${from.length - 1}` : ''})`));
if (redirectsTo.length) add('P2', 'LINK-TO-REDIRECT', 'Internal links pointing at redirecting URLs', redirectsTo);
const orphans = indexable.filter((p) => !is404(p) && !inlinks.get(p.url) && p.url !== '/').map((p) => p.url);
if (orphans.length) add('P1', 'ORPHANS', 'Indexable pages with no internal inlinks', orphans);

// aggregate per-page issues
const agg = new Map();
for (const r of perPage) for (const i of r.issues) agg.set(i, [...(agg.get(i) || []), r.url]);
for (const [key, urls] of agg) {
	const [sev, id] = key.split(':');
	add(sev, 'PAGE-' + id.toUpperCase(), `Pages with "${id}"`, urls);
}

// summary ---------------------------------------------------------------------------------------
const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || b.count - a.count);
const bySev = (s) => findings.filter((f) => f.sev === s).length;
console.log(`SEO audit of ${DIST}/  (origin ${siteOrigin})`);
console.log(`pages: ${pages.size} html, ${indexable.length} indexable, sitemap URLs: ${sitemapUrls.length}, robots.txt: ${robots ? 'yes' : 'NO'}`);
console.log(`findings: P0=${bySev('P0')} P1=${bySev('P1')} P2=${bySev('P2')} P3=${bySev('P3')}\n`);
for (const f of findings) {
	console.log(`[${f.sev}] ${f.id} — ${f.msg}  (${f.count})`);
	for (const u of f.urls.slice(0, VERBOSE ? 8 : 3)) console.log(`      ${u}`);
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ origin: siteOrigin, sitemapUrls: sitemapUrls.length, findings, pages: perPage }, null, 1));
process.exit(bySev('P0') + bySev('P1') > 0 ? 1 : 0);
