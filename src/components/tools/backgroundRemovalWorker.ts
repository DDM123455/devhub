import { removeBackground } from '@imgly/background-removal';

export type RemovalReply =
	| { type: 'progress'; key: string; current: number; total: number }
	| { type: 'done'; result: Blob }
	| { type: 'error'; message: string };

function reply(message: RemovalReply) {
	self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<Blob>) => {
	try {
		const result = await removeBackground(event.data, {
			output: { format: 'image/png' },
			progress: (key, current, total) => reply({ type: 'progress', key, current, total }),
		});
		reply({ type: 'done', result });
	} catch (error) {
		reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
	}
};
