declare module 'virtual:ocr-create-worker' {
	import type { Worker as OcrWorker, WorkerOptions, OEM } from 'tesseract.js';
	export default function createWorker(languages: string[], mode: OEM,
		options: Partial<WorkerOptions> & { onSpawn(worker: Worker): void }): Promise<OcrWorker>;
}
