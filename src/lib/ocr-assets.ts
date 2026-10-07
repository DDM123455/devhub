// Địa chỉ các file nhị phân của tesseract.js được TỰ HOST cùng site (qua `?url` của Vite → file
// băm tên trong /_astro/). Bắt buộc vì CSP production chỉ cho script/worker từ 'self' và blob:
// — mặc định tesseract.js tải worker + core WASM từ CDN sẽ bị chặn.
//
// Chỉ nạp module này khi người dùng bắt đầu OCR (dynamic import) — import `?url` chỉ trả về chuỗi
// URL, không kéo nội dung 3.9MB vào bundle JS.
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import coreBaseUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

// Byte kiểm tra hỗ trợ WebAssembly SIMD (cùng đoạn với thư viện wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

export function supportsWasmSimd(): boolean {
	try {
		return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);
	} catch {
		return false;
	}
}

export interface OcrAssetUrls {
	workerPath: string;
	corePath: string;
}

export function resolveOcrAssets(): OcrAssetUrls {
	const abs = (url: string) => new URL(url, location.href).href;
	return {
		workerPath: abs(workerUrl),
		// Truyền thẳng đường dẫn file .js (kết thúc bằng "js") để tesseract dùng đúng biến thể đã chọn.
		corePath: abs(supportsWasmSimd() ? coreSimdUrl : coreBaseUrl),
	};
}
