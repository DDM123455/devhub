// Vỏ mỏng quanh tesseract.js: một worker dùng lại cho nhiều ảnh/trang, chạy hoàn toàn trên
// trình duyệt (Web Worker của chính thư viện). Worker + core WASM được tự host (ocr-assets.ts);
// chỉ dữ liệu ngôn ngữ (.traineddata, là mô hình chứ không phải dữ liệu người dùng) tải từ
// cdn.jsdelivr.net ở lần đầu rồi được tesseract.js lưu vào IndexedDB của trình duyệt.

import { averageConfidence, extractLines, type OcrLineInfo } from './ocr-text';
import type { OcrPsm } from './ocr-languages';

export type OcrPhase = 'core' | 'lang' | 'init' | 'recognize';

export interface OcrProgress {
	phase: OcrPhase;
	/** 0..1 */
	progress: number;
	/** Dữ liệu ngôn ngữ lấy từ bộ nhớ đệm trình duyệt (không tải mạng). */
	fromCache: boolean;
}

export type OcrEngineErrorKind = 'load' | 'recognize';

export class OcrEngineError extends Error {
	kind: OcrEngineErrorKind;
	constructor(kind: OcrEngineErrorKind, message: string) {
		super(message);
		this.name = 'OcrEngineError';
		this.kind = kind;
	}
}

export interface OcrPageData {
	text: string;
	lines: OcrLineInfo[];
	confidence: number | null;
}

export interface OcrEngine {
	/** Khoá ngôn ngữ ("vie+eng") worker đang giữ. */
	readonly langKey: string;
	recognize(image: Blob, options: { psm: OcrPsm; preserveSpaces: boolean }): Promise<OcrPageData>;
	setProgressHandler(handler: ((progress: OcrProgress) => void) | null): void;
	terminate(): Promise<void>;
}

function errorMessageOf(error: unknown): string {
	if (typeof error === 'string') return error;
	if (error instanceof Error) return error.message;
	if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
	return 'unknown error';
}

function mapStatus(status: string): OcrPhase | null {
	const s = status.toLowerCase();
	if (s.includes('recognizing')) return 'recognize';
	if (s.includes('language') || s.includes('traineddata')) return 'lang';
	if (s.includes('core')) return 'core';
	if (s.includes('initializ')) return 'init';
	return null;
}

export async function createOcrEngine(
	langKey: string,
	onProgress: ((progress: OcrProgress) => void) | null,
): Promise<OcrEngine> {
	let handler = onProgress;
	let worker: import('tesseract.js').Worker | null = null;
	try {
		// Nạp động: tesseract.js không nằm trong bundle ban đầu của trang.
		const [{ default: Tesseract }, { resolveOcrAssets }] = await Promise.all([
			import('tesseract.js/dist/tesseract.esm.min.js'),
			import('./ocr-assets'),
		]);
		const assets = resolveOcrAssets();
		worker = await Tesseract.createWorker(langKey.split('+'), Tesseract.OEM.LSTM_ONLY, {
			workerPath: assets.workerPath,
			corePath: assets.corePath,
			// Worker chạy thẳng từ URL cùng origin (worker-src 'self'), không qua blob importScripts.
			workerBlobURL: false,
			logger: (message) => {
				const phase = mapStatus(message.status ?? '');
				if (phase && handler) {
					handler({ phase, progress: message.progress ?? 0, fromCache: /cache/i.test(message.status ?? '') });
				}
			},
		});
	} catch (error) {
		if (worker) await worker.terminate().catch(() => {});
		throw new OcrEngineError('load', errorMessageOf(error));
	}

	const active = worker;
	return {
		langKey,
		setProgressHandler(next) {
			handler = next;
		},
		async recognize(image, options) {
			try {
				await active.setParameters({
					tessedit_pageseg_mode: String(options.psm) as never,
					preserve_interword_spaces: options.preserveSpaces ? '1' : '0',
				});
				const { data } = await active.recognize(image, {}, { text: true, blocks: true });
				const lines = extractLines(data.blocks);
				const text = (data.text ?? '').replace(/\s+$/g, '');
				let confidence = averageConfidence(lines);
				if (confidence === null && text.trim() !== '' && typeof data.confidence === 'number' && data.confidence > 0) {
					confidence = Math.round(data.confidence);
				}
				return { text, lines, confidence };
			} catch (error) {
				throw new OcrEngineError('recognize', errorMessageOf(error));
			}
		},
		async terminate() {
			handler = null;
			await active.terminate().catch(() => {});
		},
	};
}
