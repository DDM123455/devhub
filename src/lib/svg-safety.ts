// Lightweight detection of SVG content that can execute code or reach the network
// when the SVG is embedded inline in an HTML page. Detection only — the actual
// removal is done by SVGO's `removeScripts` plugin.

export type SvgRisk = 'script' | 'eventHandler' | 'javascriptUrl' | 'foreignObject' | 'externalUse' | 'externalImage';

export const SVG_MAX_BYTES = 5 * 1024 * 1024;
export const SVG_WARN_BYTES = 1024 * 1024;

const RISK_PATTERNS: Array<[SvgRisk, RegExp]> = [
	['script', /<script[\s>/]/i],
	// Attribute names such as onclick= / onload= preceded by whitespace, a quote or a slash.
	['eventHandler', /[\s"'/]on[a-z]{3,}\s*=/i],
	['javascriptUrl', /(?:xlink:)?href\s*=\s*["']?\s*(?:javascript|vbscript)\s*:/i],
	['foreignObject', /<foreignObject[\s>/]/i],
	['externalUse', /<use\b[^>]*?\b(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i],
	['externalImage', /<image\b[^>]*?\b(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i],
];

export function detectSvgRisks(svg: string): SvgRisk[] {
	if (svg === '') return [];
	return RISK_PATTERNS.filter(([, re]) => re.test(svg)).map(([risk]) => risk);
}

/** Content-Security-Policy for the preview iframe: no scripts, no network, only inline styles and data: images. */
export const PREVIEW_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

export function buildPreviewDoc(svg: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%}</style></head><body>${svg}</body></html>`;
}
