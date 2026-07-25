export interface PdfPageThumbnail {
	pageIndex: number;
	dataUrl: string;
	width: number;
	height: number;
}

let workerConfigured = false;

// pdfjs-dist runs its parser in a Web Worker; the worker script itself has to
// be loaded via a URL Vite can resolve at build time. Loaded through a
// dynamic import (not a top-level one) so nothing here executes during
// Astro's Node-based SSR pass for client:load islands.
async function loadPdfJs() {
	const pdfjsLib = await import('pdfjs-dist');
	if (!workerConfigured) {
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
			'pdfjs-dist/build/pdf.worker.min.mjs',
			import.meta.url,
		).href;
		workerConfigured = true;
	}
	return pdfjsLib;
}

export async function renderPdfThumbnails(bytes: ArrayBuffer, scale = 0.25): Promise<PdfPageThumbnail[]> {
	const pdfjsLib = await loadPdfJs();
	const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
	const thumbnails: PdfPageThumbnail[] = [];

	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const viewport = page.getViewport({ scale });
		const canvas = document.createElement('canvas');
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		await page.render({ canvas, viewport }).promise;
		thumbnails.push({
			pageIndex: i - 1,
			dataUrl: canvas.toDataURL('image/jpeg', 0.7),
			width: viewport.width,
			height: viewport.height,
		});
		page.cleanup();
	}

	await pdf.destroy();
	return thumbnails;
}

export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
	const pdfjsLib = await loadPdfJs();
	const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
	const count = pdf.numPages;
	await pdf.destroy();
	return count;
}
