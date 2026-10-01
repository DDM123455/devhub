/// <reference lib="webworker" />
// Worker nén sâu: MozJPEG (@jsquash/jpeg) cho JPEG và OxiPNG (@jsquash/oxipng) cho PNG.
// Chỉ được tạo khi người dùng bật "Tối ưu sâu" và bấm nén; WASM chỉ được fetch lần đầu mỗi codec dùng tới.
// Import tĩnh (không dùng dynamic import của thư viện) vì worker build ở dạng IIFE không code-split được;
// URL wasm được truyền tường minh qua `?url` để Vite phát hành file .wasm đúng chỗ.
import encodeJpeg, { init as initJpeg } from '@jsquash/jpeg/encode.js';
import initOxipng, { optimise as oxipngOptimise } from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js';
import jpegWasmUrl from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url';
import oxipngWasmUrl from '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url';
import { fitWithin, searchQualityForTarget } from '../../lib/image-compress-utils';

export type OptimizeRequest =
	| {
			id: number;
			kind: 'png-bytes';
			bytes: ArrayBuffer;
			level: number;
	  }
	| {
			id: number;
			kind: 'png-pixels' | 'jpeg';
			bitmap: ImageBitmap;
			maxDimension?: number;
			level: number;
			// JPEG: quality 0-1 (chế độ quality) hoặc targetBytes (chế độ dung lượng mục tiêu).
			quality: number;
			targetBytes?: number;
	  };

export type OptimizeResponse =
	| { id: number; ok: true; bytes: ArrayBuffer; mime: string; targetMet?: boolean }
	| { id: number; ok: false; error: string; unsupported?: boolean };

let oxipngReady: Promise<unknown> | null = null;
let jpegReady: Promise<void> | null = null;

function ensureOxipng() {
	oxipngReady ??= initOxipng(oxipngWasmUrl);
	return oxipngReady;
}

function ensureJpeg() {
	jpegReady ??= (async () => {
		const response = await fetch(jpegWasmUrl);
		const module = await WebAssembly.compile(await response.arrayBuffer());
		await initJpeg(module);
	})();
	return jpegReady;
}

async function optimisePng(bytes: Uint8Array, level: number): Promise<Uint8Array> {
	await ensureOxipng();
	return oxipngOptimise(bytes, level, false, false);
}

// Vẽ bitmap lên OffscreenCanvas (đã resize); JPEG thì đổ nền trắng vì không có alpha.
function drawBitmap(bitmap: ImageBitmap, maxDimension: number | undefined, whiteBackground: boolean) {
	const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D context unavailable');
	if (whiteBackground) {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);
	}
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, width, height);
	return { canvas, ctx, width, height };
}

async function handle(request: OptimizeRequest): Promise<OptimizeResponse> {
	if (request.kind === 'png-bytes') {
		const out = await optimisePng(new Uint8Array(request.bytes), request.level);
		const copy = out.slice().buffer as ArrayBuffer;
		return { id: request.id, ok: true, bytes: copy, mime: 'image/png' };
	}
	if (typeof OffscreenCanvas === 'undefined') {
		request.bitmap.close();
		return { id: request.id, ok: false, error: 'OffscreenCanvas unavailable', unsupported: true };
	}
	try {
		if (request.kind === 'png-pixels') {
			const { canvas } = drawBitmap(request.bitmap, request.maxDimension, false);
			const png = await canvas.convertToBlob({ type: 'image/png' });
			const out = await optimisePng(new Uint8Array(await png.arrayBuffer()), request.level);
			return { id: request.id, ok: true, bytes: out.slice().buffer as ArrayBuffer, mime: 'image/png' };
		}
		// jpeg
		await ensureJpeg();
		const { ctx, width, height } = drawBitmap(request.bitmap, request.maxDimension, true);
		const imageData = ctx.getImageData(0, 0, width, height);
		const encodeAt = (quality: number) => encodeJpeg(imageData, { quality });
		if (request.targetBytes) {
			const target = request.targetBytes;
			const cache = new Map<number, ArrayBuffer>();
			const result = await searchQualityForTarget(async (q) => {
				const buf = await encodeAt(q);
				cache.set(q, buf);
				return buf.byteLength;
			}, target);
			return { id: request.id, ok: true, bytes: cache.get(result.quality)!, mime: 'image/jpeg', targetMet: result.met };
		}
		const bytes = await encodeAt(Math.max(1, Math.min(100, Math.round(request.quality * 100))));
		return { id: request.id, ok: true, bytes, mime: 'image/jpeg' };
	} finally {
		request.bitmap.close();
	}
}

self.onmessage = async (event: MessageEvent<OptimizeRequest>) => {
	const request = event.data;
	try {
		const response = await handle(request);
		(self as unknown as Worker).postMessage(response, response.ok ? [response.bytes] : []);
	} catch (err) {
		(self as unknown as Worker).postMessage({
			id: request.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		} satisfies OptimizeResponse);
	}
};
