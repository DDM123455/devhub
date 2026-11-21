import { build } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const moduleId = 'virtual:ocr-create-worker';

// The v7 SDK exposes the native worker only after language initialization.
// Capture it at creation so cancellation and failed downloads release it too.
export function ocrBrowserClient() {
	return {
		name: 'ocr-browser-client',
		resolveId(id) { if (id === moduleId) return '\0' + moduleId; },
		async load(id) {
			if (id !== '\0' + moduleId) return;
			const result = await build({
				entryPoints: [require.resolve('tesseract.js/src/createWorker.js')],
				bundle: true, platform: 'browser', format: 'esm', write: false,
				plugins: [{
					name: 'ocr-worker-lifecycle',
					setup(builder) {
						builder.onLoad({ filter: /tesseract\.js[/\\]src[/\\]worker[/\\]browser[/\\]spawnWorker\.js$/ }, () => ({
							contents: `module.exports = options => {
								const worker = new Worker(options.workerPath);
								options.onSpawn(worker);
								return worker;
							};`,
						}));
					},
				}],
			});
			return result.outputFiles[0].text;
		},
	};
}
