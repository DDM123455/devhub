import type { RemovalReply } from './backgroundRemovalWorker';

// The component submits one image at a time. Keep the model warm between images.
export class BackgroundRemovalClient {
	private worker?: Worker;
	private rejectPending?: (error: Error) => void;

	run(source: Blob, progress: (key: string, current: number, total: number) => void): Promise<Blob> {
		const worker = this.worker ??= new Worker(new URL('./backgroundRemovalWorker.ts', import.meta.url), { type: 'module' });
		return new Promise((resolve, reject) => {
			this.rejectPending = reject;
			worker.onmessage = ({ data }: MessageEvent<RemovalReply>) => {
				if (data.type === 'progress') {
					progress(data.key, data.current, data.total);
				} else if (data.type === 'done') {
					this.rejectPending = undefined;
					worker.onmessage = null;
					resolve(data.result);
				} else {
					this.close(new Error(data.message));
				}
			};
			worker.onerror = (event) => this.close(new Error(event.message));
			worker.onmessageerror = () => this.close(new Error('Invalid worker response'));
			worker.postMessage(source);
		});
	}

	close(reason = new Error('Worker closed')) {
		this.worker?.terminate();
		this.worker = undefined;
		this.rejectPending?.(reason);
		this.rejectPending = undefined;
	}
}
