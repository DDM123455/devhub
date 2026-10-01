// Small pure helpers for the Markdown Editor (unit-testable without a DOM).

export const MAX_MARKDOWN_RENDER_CHARS = 500_000;

/** GitHub-style heading slug that keeps non-Latin letters ("Giới thiệu" -> "giới-thiệu"). */
export function slugifyHeading(text: string): string {
	const slug = text
		.normalize('NFC')
		.toLowerCase()
		.replace(/<[^>]*>/g, '')
		.replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
		.trim()
		.replace(/\s+/g, '-');
	return slug || 'section';
}

/** Returns a slug generator that de-duplicates repeated headings ("intro", "intro-1", ...). */
export function createSlugger() {
	const seen = new Map<string, number>();
	return (text: string): string => {
		const base = slugifyHeading(text);
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count === 0 ? base : `${base}-${count}`;
	};
}

export function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EXPORT_CSS =
	'body{max-width:48rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;color:#1f2328}' +
	'h1,h2,h3,h4{line-height:1.25}img{max-width:100%}pre{overflow:auto;padding:1rem;background:#f6f8fa;border-radius:6px}' +
	'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f6f8fa;padding:.1em .3em;border-radius:4px}pre code{padding:0;background:none}' +
	'blockquote{margin:1rem 0;padding:0 1rem;border-left:4px solid #d0d7de;color:#59636e}' +
	'table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:.4rem .7rem}th{background:#f6f8fa}a{color:#0969da}hr{border:0;border-top:1px solid #d0d7de}';

export function buildExportHtml(title: string, lang: string, bodyHtml: string): string {
	return (
		'<!doctype html>\n' +
		`<html lang="${escapeHtml(lang)}">\n<head>\n<meta charset="utf-8">\n` +
		'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
		`<title>${escapeHtml(title)}</title>\n<style>${EXPORT_CSS}</style>\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>\n`
	);
}
