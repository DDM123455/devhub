/// <reference lib="webworker" />

export interface EncodeRequest {
	format: 'mp3' | 'wav';
	bitrate: number;
	sampleRate: number;
	channels: Float32Array[];
}

export interface EncodeProgressMessage {
	type: 'progress';
	percent: number;
}

export interface EncodeDoneMessage {
	type: 'done';
	data: Uint8Array;
	mimeType: string;
}

export interface EncodeErrorMessage {
	type: 'error';
	message: string;
}

export type EncodeResponseMessage = EncodeProgressMessage | EncodeDoneMessage | EncodeErrorMessage;

const MP3_BLOCK_SIZE = 1152;

function floatTo16BitPCM(input: Float32Array): Int16Array {
	const output = new Int16Array(input.length);
	for (let i = 0; i < input.length; i++) {
		const s = Math.max(-1, Math.min(1, input[i]));
		output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return output;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
	const total = chunks.reduce((sum, c) => sum + c.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

async function encodeMp3(channels: Int16Array[], sampleRate: number, bitrate: number): Promise<Uint8Array> {
	const { Mp3Encoder } = await import('@breezystack/lamejs');
	const numChannels = Math.min(channels.length, 2);
	const encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);
	const left = channels[0];
	const right = numChannels === 2 ? channels[1] : undefined;
	const chunks: Uint8Array[] = [];
	const totalSamples = left.length;

	for (let i = 0; i < totalSamples; i += MP3_BLOCK_SIZE) {
		const leftChunk = left.subarray(i, i + MP3_BLOCK_SIZE);
		const rightChunk = right ? right.subarray(i, i + MP3_BLOCK_SIZE) : undefined;
		const mp3buf = rightChunk ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk);
		if (mp3buf.length > 0) chunks.push(mp3buf);
		if (i % (MP3_BLOCK_SIZE * 40) === 0) {
			postMessage({ type: 'progress', percent: Math.round((i / totalSamples) * 100) } satisfies EncodeProgressMessage);
		}
	}
	const final = encoder.flush();
	if (final.length > 0) chunks.push(final);
	return concatUint8Arrays(chunks);
}

function encodeWav(channels: Int16Array[], sampleRate: number): Uint8Array {
	const numChannels = Math.min(channels.length, 2);
	const frameCount = channels[0].length;
	const bytesPerSample = 2;
	const blockAlign = numChannels * bytesPerSample;
	const dataSize = frameCount * blockAlign;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	const writeString = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
	};

	writeString(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bytesPerSample * 8, true);
	writeString(36, 'data');
	view.setUint32(40, dataSize, true);

	let offset = 44;
	if (numChannels === 2) {
		const [left, right] = channels;
		for (let i = 0; i < frameCount; i++) {
			view.setInt16(offset, left[i], true);
			offset += 2;
			view.setInt16(offset, right[i], true);
			offset += 2;
		}
	} else {
		const mono = channels[0];
		for (let i = 0; i < frameCount; i++) {
			view.setInt16(offset, mono[i], true);
			offset += 2;
		}
	}

	return new Uint8Array(buffer);
}

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
	const { format, bitrate, sampleRate, channels } = event.data;
	try {
		const pcmChannels = channels.map(floatTo16BitPCM);
		postMessage({ type: 'progress', percent: 0 } satisfies EncodeProgressMessage);
		if (format === 'mp3') {
			const data = await encodeMp3(pcmChannels, sampleRate, bitrate);
			postMessage({ type: 'done', data, mimeType: 'audio/mpeg' } satisfies EncodeDoneMessage, [data.buffer]);
		} else {
			const data = encodeWav(pcmChannels, sampleRate);
			postMessage({ type: 'progress', percent: 100 } satisfies EncodeProgressMessage);
			postMessage({ type: 'done', data, mimeType: 'audio/wav' } satisfies EncodeDoneMessage, [data.buffer]);
		}
	} catch (e) {
		postMessage({ type: 'error', message: e instanceof Error ? e.message : 'unknown error' } satisfies EncodeErrorMessage);
	}
};
