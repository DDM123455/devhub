/** Sample rate mà MP3 (MPEG-1/2/2.5 Layer III) thực sự hỗ trợ. */
export const MP3_SAMPLE_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

/** Sample rate MP3 gần nhất hợp lệ (trên 48 kHz -> 48 kHz). */
export function nearestMp3SampleRate(rate: number): number {
	if (MP3_SAMPLE_RATES.includes(rate)) return rate;
	if (rate > 48000) return 48000;
	return MP3_SAMPLE_RATES.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), MP3_SAMPLE_RATES[0]);
}

/** Bitrate tối đa hợp lệ theo sample rate: MPEG-1 (>=32k) 320, MPEG-2 (16-24k) 160, MPEG-2.5 (<=12k) 64. */
export function maxMp3Bitrate(sampleRate: number): number {
	if (sampleRate >= 32000) return 320;
	if (sampleRate >= 16000) return 160;
	return 64;
}

export function clampMp3Bitrate(sampleRate: number, bitrate: number): number {
	return Math.min(bitrate, maxMp3Bitrate(sampleRate));
}

const SQRT_HALF = Math.SQRT1_2;

/**
 * Downmix đa kênh -> stereo theo công thức ITU-R BS.775 (hệ số 0.7071 cho center/surround, bỏ LFE),
 * chia cho tổng hệ số để không bị clip. Thứ tự kênh theo Web Audio:
 * 4ch quad: L R SL SR; 6ch (5.1): L R C LFE SL SR; 8ch (7.1): L R C LFE SL SR BL BR.
 * Số kênh khác (3, 5, 7, >8): giữ 2 kênh đầu.
 */
export function downmixToStereo(channels: Float32Array[]): Float32Array[] {
	const n = channels.length;
	if (n <= 2) return channels;
	const len = channels[0].length;
	const left = new Float32Array(len);
	const right = new Float32Array(len);

	let weights: { l: [number, number][]; r: [number, number][] };
	if (n === 4) {
		weights = { l: [[0, 1], [2, SQRT_HALF]], r: [[1, 1], [3, SQRT_HALF]] };
	} else if (n === 6) {
		weights = { l: [[0, 1], [2, SQRT_HALF], [4, SQRT_HALF]], r: [[1, 1], [2, SQRT_HALF], [5, SQRT_HALF]] };
	} else if (n === 8) {
		weights = {
			l: [[0, 1], [2, SQRT_HALF], [4, SQRT_HALF], [6, SQRT_HALF]],
			r: [[1, 1], [2, SQRT_HALF], [5, SQRT_HALF], [7, SQRT_HALF]],
		};
	} else {
		return [channels[0], channels[1]];
	}
	const norm = 1 / weights.l.reduce((sum, [, w]) => sum + w, 0);
	for (let i = 0; i < len; i++) {
		let l = 0;
		let r = 0;
		for (const [ch, w] of weights.l) l += channels[ch][i] * w;
		for (const [ch, w] of weights.r) r += channels[ch][i] * w;
		left[i] = l * norm;
		right[i] = r * norm;
	}
	return [left, right];
}

// ---------------------------------------------------------------------------
// Channel layout + trimming (operate on decoded Float32 channel data)
// ---------------------------------------------------------------------------

export type ChannelMode = 'keep' | 'mono' | 'stereo';

/** Average all channels into one. */
export function toMono(channels: Float32Array[]): Float32Array[] {
	if (channels.length <= 1) return channels;
	const len = channels[0].length;
	const out = new Float32Array(len);
	const inv = 1 / channels.length;
	for (const ch of channels) for (let i = 0; i < len; i++) out[i] += ch[i] * inv;
	return [out];
}

/** Mono -> two identical channels; stereo (or more, already downmixed) untouched. */
export function toStereo(channels: Float32Array[]): Float32Array[] {
	if (channels.length >= 2) return channels.slice(0, 2);
	return [channels[0], channels[0].slice()];
}

export function applyChannelMode(channels: Float32Array[], mode: ChannelMode): Float32Array[] {
	if (mode === 'mono') return toMono(channels);
	if (mode === 'stereo') return toStereo(channels);
	return channels;
}

/**
 * Cuts [startSec, endSec) out of every channel. endSec <= 0 or beyond the end means "until the end".
 * Returns null when the range is empty/invalid.
 */
export function trimChannels(channels: Float32Array[], sampleRate: number, startSec: number, endSec: number): Float32Array[] | null {
	const total = channels[0]?.length ?? 0;
	const from = Math.max(0, Math.round(startSec * sampleRate));
	const to = endSec > 0 ? Math.min(total, Math.round(endSec * sampleRate)) : total;
	if (!(to > from)) return null;
	if (from === 0 && to === total) return channels;
	return channels.map((c) => c.slice(from, to));
}
