// IMG.LY 1.7 bundles ndarray in its ESM distribution. Its pixel accessors use
// new Function at runtime. The image pipeline only needs contiguous tensor views.
export function imglyStaticTensors() {
	return {
		name: 'imgly-static-tensors',
		enforce: 'pre',
		transform(code, id) {
			if (!id.replaceAll('\\', '/').endsWith('/@imgly/background-removal/dist/index.mjs')) return;
			const factory = '__toESM(require_ndarray())';
			if (code.split(factory).length !== 5) {
				throw new Error('Review tensor access in the updated IMG.LY distribution.');
			}
			return {
				code: "import { imageTensor } from '/src/lib/image-tensor.ts';\n" +
					code.replaceAll(factory, '{ default: imageTensor }'),
				map: null,
			};
		},
	};
}
