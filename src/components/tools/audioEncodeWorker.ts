/// <reference lib="webworker" />

import { encodeWavPcm, type WavBitDepth } from '../../lib/wav-encode';

export interface EncodeRequest {
	format: 'mp3' | 'wav';
	bitrate: number;
	sampleRate: number;
	channels: Float32Array[];
	/** WAV only: 8/16/24 PCM or 32 (IEEE float). Defaults to 16. */
	bitDepth?: WavBitDepth;
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

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
	const { format, bitrate, sampleRate, channels, bitDepth = 16 } = event.data;
	try {
		postMessage({ type: 'progress', percent: 0 } satisfies EncodeProgressMessage);
		if (format === 'mp3') {
			const pcmChannels = channels.map(floatTo16BitPCM);
			const data = await encodeMp3(pcmChannels, sampleRate, bitrate);
			postMessage({ type: 'done', data, mimeType: 'audio/mpeg' } satisfies EncodeDoneMessage, [data.buffer]);
		} else {
			const data = encodeWavPcm(channels, sampleRate, bitDepth);
			postMessage({ type: 'progress', percent: 100 } satisfies EncodeProgressMessage);
			postMessage({ type: 'done', data, mimeType: 'audio/wav' } satisfies EncodeDoneMessage, [data.buffer]);
		}
	} catch (e) {
		postMessage({ type: 'error', message: e instanceof Error ? e.message : 'unknown error' } satisfies EncodeErrorMessage);
	}
};
