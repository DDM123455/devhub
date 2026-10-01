// PCM / IEEE-float WAV writer (no DOM, usable from a Web Worker and from tests).

export type WavBitDepth = 8 | 16 | 24 | 32;

export const WAV_BIT_DEPTHS: WavBitDepth[] = [8, 16, 24, 32];

function clamp1(v: number): number {
	return v > 1 ? 1 : v < -1 ? -1 : v;
}

/**
 * Encodes up to two channels as WAV. 8 = unsigned 8-bit PCM, 16/24 = signed little-endian PCM,
 * 32 = 32-bit IEEE float (format tag 3, with the `fact` chunk the spec asks for).
 */
export function encodeWavPcm(channels: Float32Array[], sampleRate: number, bitDepth: WavBitDepth): Uint8Array {
	const numChannels = Math.min(channels.length, 2);
	const frames = channels[0].length;
	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;
	const dataSize = frames * blockAlign;
	const isFloat = bitDepth === 32;
	const fmtSize = isFloat ? 18 : 16;
	const factSize = isFloat ? 12 : 0;
	const headerSize = 12 + (8 + fmtSize) + factSize + 8;
	const buffer = new ArrayBuffer(headerSize + dataSize + (dataSize % 2));
	const view = new DataView(buffer);
	let p = 0;
	const str = (s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
	};
	const u32 = (v: number) => {
		view.setUint32(p, v, true);
		p += 4;
	};
	const u16 = (v: number) => {
		view.setUint16(p, v, true);
		p += 2;
	};

	str('RIFF');
	u32(buffer.byteLength - 8);
	str('WAVE');
	str('fmt ');
	u32(fmtSize);
	u16(isFloat ? 3 : 1);
	u16(numChannels);
	u32(sampleRate);
	u32(sampleRate * blockAlign);
	u16(blockAlign);
	u16(bitDepth);
	if (isFloat) {
		u16(0); // cbSize
		str('fact');
		u32(4);
		u32(frames);
	}
	str('data');
	u32(dataSize);

	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < numChannels; c++) {
			const s = clamp1(channels[c][i]);
			if (bitDepth === 8) {
				view.setUint8(p, Math.round(s * 127.5 + 127.5));
				p += 1;
			} else if (bitDepth === 16) {
				view.setInt16(p, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
				p += 2;
			} else if (bitDepth === 24) {
				const v = s < 0 ? Math.round(s * 0x800000) : Math.round(s * 0x7fffff);
				view.setUint8(p, v & 0xff);
				view.setUint8(p + 1, (v >> 8) & 0xff);
				view.setUint8(p + 2, (v >> 16) & 0xff);
				p += 3;
			} else {
				view.setFloat32(p, s, true);
				p += 4;
			}
		}
	}
	return new Uint8Array(buffer);
}
