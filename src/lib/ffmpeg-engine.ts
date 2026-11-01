// Shared helpers for the ffmpeg.wasm engine used by the Audio Converter and the Video Trimmer.
//
// The 32 MB wasm is fetched by ffmpeg-core itself from the CDN (a plain https URL; see the CSP note in
// public/_headers). To show real progress and to start downloading before the user presses Convert, the
// wasm is read once through a streaming `fetch` here, which also primes the browser HTTP cache so the engine's
// own fetch of the same URL is normally served from it.

export const FFMPEG_CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
export const FFMPEG_WASM_URL = `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`;
/** Decoded size of ffmpeg-core.wasm (the response is brotli-compressed, so Content-Length is not usable as a total). */
export const FFMPEG_WASM_BYTES = 32_232_419;

let warmPromise: Promise<void> | null = null;
const listeners = new Set<(percent: number) => void>();
let lastPercent = 0;

/** Percent (0..100) of the wasm downloaded so far; 100 once finished. */
export function subscribeEngineProgress(listener: (percent: number) => void): () => void {
	listeners.add(listener);
	listener(lastPercent);
	return () => {
		listeners.delete(listener);
	};
}

function publish(percent: number) {
	lastPercent = percent;
	listeners.forEach((l) => l(percent));
}

/**
 * Starts (once) downloading the wasm and reports progress to subscribers. Never rejects: a failed warm-up only
 * means the engine will download the file itself later, where a real error is reported to the user.
 */
export function warmFfmpegEngine(): Promise<void> {
	if (warmPromise) return warmPromise;
	warmPromise = (async () => {
		try {
			const response = await fetch(FFMPEG_WASM_URL);
			if (!response.ok || !response.body) throw new Error(String(response.status));
			const reader = response.body.getReader();
			let loaded = 0;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				loaded += value.byteLength;
				publish(Math.min(99, Math.round((loaded / FFMPEG_WASM_BYTES) * 100)));
			}
			publish(100);
		} catch {
			warmPromise = null; // allow a retry on the next attempt
			publish(0);
		}
	})();
	return warmPromise;
}
