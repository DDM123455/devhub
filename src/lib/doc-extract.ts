// Client-side text extraction from .docx (mammoth) and .pdf (pdfjs-dist). Both libraries are
// heavy, so they are loaded with dynamic import() only when such a file is actually chosen.
// Files never leave the browser.

export const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;

export type DocumentKind = 'text' | 'docx' | 'pdf';

export function detectDocumentKind(name: string, mime: string): DocumentKind {
	const lower = name.toLowerCase();
	if (lower.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
	if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
	return 'text';
}

let pdfWorkerConfigured = false;

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
	const pdfjsLib = await import('pdfjs-dist');
	if (!pdfWorkerConfigured) {
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
		pdfWorkerConfigured = true;
	}
	const loadingTask = pdfjsLib.getDocument({ data: buffer });
	try {
		const pdf = await loadingTask.promise;
		const pages: string[] = [];
		for (let i = 1; i <= pdf.numPages; i++) {
			const page = await pdf.getPage(i);
			const content = await page.getTextContent();
			let pageText = '';
			for (const item of content.items) {
				if (!('str' in item)) continue;
				pageText += item.str;
				pageText += item.hasEOL ? '\n' : ' ';
			}
			pages.push(pageText.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim());
		}
		return pages.join('\n\n');
	} finally {
		void loadingTask.destroy();
	}
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
	// The pre-bundled browser build avoids Node-only dependencies (fs/zlib shims).
	// @ts-ignore - no type declarations for this deep path; the API matches mammoth's index.d.ts
	const module = await import('mammoth/mammoth.browser.js');
	const mammoth = (module.default ?? module) as { extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
	const result = await mammoth.extractRawText({ arrayBuffer: buffer });
	return result.value;
}

export async function extractTextFromFile(file: File): Promise<string> {
	const kind = detectDocumentKind(file.name, file.type);
	if (kind === 'text') return (await file.text()).replace(/\r\n?/g, '\n');
	const buffer = await file.arrayBuffer();
	const text = kind === 'docx' ? await extractDocx(buffer) : await extractPdf(buffer);
	return text.replace(/\r\n?/g, '\n');
}
