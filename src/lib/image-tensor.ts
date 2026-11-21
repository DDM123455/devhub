type TensorData = Float32Array | Uint8Array | Uint8ClampedArray;

// ONNX consumes data and shape directly. IMG.LY additionally reads and writes
// pixels in its three-dimensional, contiguous [height, width, channels] tensors.
export function imageTensor(data: TensorData, shape: number[]) {
	const width = shape[1];
	const channels = shape[2];
	return {
		data,
		shape,
		get(y: number, x: number, channel: number) {
			return data[(y * width + x) * channels + channel];
		},
		set(y: number, x: number, channel: number, value: number) {
			data[(y * width + x) * channels + channel] = value;
		},
	};
}
