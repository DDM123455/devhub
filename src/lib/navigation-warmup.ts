// Astro prefetch warms HTML only. Warm the destination's initial React modules on deliberate
// pointer/keyboard intent too, without executing the component or loading its file-processing engines.
const warmed = new Set<string>();
const modules = new Set<string>();
const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
let timer: ReturnType<typeof setTimeout>;
let inFlight = false;

async function warm(anchor: HTMLAnchorElement) {
	const url = new URL(anchor.href);
	if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '') ||
		url.origin !== location.origin || url.pathname === location.pathname ||
		!url.pathname.includes('/tools/') || warmed.has(url.href) || warmed.size >= 4 || inFlight) return;
	inFlight = true;
	warmed.add(url.href);
	try {
		const response = await fetch(url.href, { priority: 'low', cache: 'force-cache' } as RequestInit);
		if (!response.ok) return;
		const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
		for (const island of doc.querySelectorAll('astro-island[client="load"]')) {
			for (const attr of ['component-url', 'renderer-url']) {
				const path = island.getAttribute(attr);
				if (!path) continue;
				const src = new URL(path, url);
				if (src.origin !== location.origin || !src.pathname.startsWith('/_astro/') || modules.has(src.href)) continue;
				modules.add(src.href);
				const link = document.createElement('link');
				link.rel = 'modulepreload';
				link.href = src.href;
				document.head.append(link);
			}
		}
	} catch { warmed.delete(url.href); } finally { inFlight = false; }
}
for (const event of ['pointerover', 'focusin'] as const) {
	document.addEventListener(event, e => {
		const anchor = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
		clearTimeout(timer);
		if (anchor) timer = setTimeout(() => void warm(anchor), 120);
	});
}
