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
//
// Pinned to 5.0.375 (not the latest 6.x) — see PROGRESS.md for the full
// investigation, but in short: every pdfjs-dist release after 5.0.375 calls
// brand-new JS engine built-ins (Uint8Array.prototype.toHex(),
// Map.prototype.getOrInsertComputed()) with no feature-detect fallback and no
// polyfill, which crashes on any browser that doesn't yet ship them —
// including real, currently-installed Chrome builds, not just old ones
// (confirmed upstream via pdf.js GitHub issue #20759). 5.0.375 is the last
// version that still guards these calls itself.
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
	const loadingTask = pdfjsLib.getDocument({ data: bytes });
	try {
		const pdf = await loadingTask.promise;
		const thumbnails: PdfPageThumbnail[] = [];
		for (let i = 1; i <= pdf.numPages; i++) {
			const page = await pdf.getPage(i);
			const viewport = page.getViewport({ scale });
			const canvas = document.createElement('canvas');
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			try {
				const canvasContext = canvas.getContext('2d');
				if (!canvasContext) throw new Error('2D canvas context unavailable');
				await page.render({ canvasContext, viewport }).promise;
				thumbnails.push({
					pageIndex: i - 1,
					dataUrl: canvas.toDataURL('image/jpeg', 0.7),
					width: viewport.width,
					height: viewport.height,
				});
			} finally {
				page.cleanup();
				// Giải phóng bộ nhớ bitmap của canvas ngay (đặc biệt trên Safari/iOS).
				canvas.width = 0;
				canvas.height = 0;
			}
		}
		return thumbnails;
	} finally {
		// Luôn huỷ task + worker dù thành công hay lỗi, tránh rò rỉ worker/bộ nhớ.
		try {
			await loadingTask.destroy();
		} catch {
			/* bỏ qua */
		}
	}
}

export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
	const pdfjsLib = await loadPdfJs();
	const loadingTask = pdfjsLib.getDocument({ data: bytes });
	try {
		const pdf = await loadingTask.promise;
		return pdf.numPages;
	} finally {
		try {
			await loadingTask.destroy();
		} catch {
			/* bỏ qua */
		}
	}
}

export interface PdfOutlineEntry {
	title: string;
	/** Chỉ số trang 0-based của đích bookmark. */
	pageIndex: number;
}

/**
 * Bookmark (outline) cấp cao nhất của PDF, đã giải đích (kể cả named destination) sang chỉ số trang.
 * Mục không có đích trang (link ngoài, action...) bị bỏ. Mảng rỗng nếu PDF không có outline.
 */
export async function getPdfOutline(bytes: ArrayBuffer): Promise<PdfOutlineEntry[]> {
	const pdfjsLib = await loadPdfJs();
	const loadingTask = pdfjsLib.getDocument({ data: bytes });
	try {
		const pdf = await loadingTask.promise;
		const outline = await pdf.getOutline();
		if (!outline) return [];
		const entries: PdfOutlineEntry[] = [];
		for (const item of outline) {
			try {
				let dest: unknown = item.dest;
				if (typeof dest === 'string') dest = await pdf.getDestination(dest);
				if (!Array.isArray(dest) || dest.length === 0) continue;
				const target = dest[0];
				let pageIndex: number;
				if (typeof target === 'number') pageIndex = target;
				else if (target && typeof target === 'object') pageIndex = await pdf.getPageIndex(target as never);
				else continue;
				entries.push({ title: String(item.title ?? '').trim(), pageIndex });
			} catch {
				/* bỏ qua bookmark hỏng */
			}
		}
		return entries;
	} finally {
		try {
			await loadingTask.destroy();
		} catch {
			/* bỏ qua */
		}
	}
}
