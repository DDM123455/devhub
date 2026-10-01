import { describe, it, expect } from 'vitest';
import { clampMp3Bitrate, downmixToStereo, maxMp3Bitrate, nearestMp3SampleRate } from '../audio-utils';

describe('MP3 constraints', () => {
	it('sample rate hợp lệ giữ nguyên, không hợp lệ -> gần nhất', () => {
		expect(nearestMp3SampleRate(44100)).toBe(44100);
		expect(nearestMp3SampleRate(96000)).toBe(48000);
		expect(nearestMp3SampleRate(88200)).toBe(48000);
		expect(nearestMp3SampleRate(37800)).toBe(32000);
	});
	it('bitrate tối đa theo sample rate', () => {
		expect(maxMp3Bitrate(44100)).toBe(320);
		expect(maxMp3Bitrate(22050)).toBe(160);
		expect(maxMp3Bitrate(8000)).toBe(64);
		expect(clampMp3Bitrate(16000, 320)).toBe(160);
		expect(clampMp3Bitrate(44100, 128)).toBe(128);
		expect(clampMp3Bitrate(8000, 128)).toBe(64);
	});
});

describe('downmixToStereo', () => {
	it('giữ nguyên mono/stereo', () => {
		const ch = [new Float32Array([1]), new Float32Array([0.5])];
		expect(downmixToStereo(ch)).toBe(ch);
	});
	it('5.1: center chia đều hai bên, bỏ LFE, không clip', () => {
		const one = (v: number) => new Float32Array([v]);
		// L R C LFE SL SR
		const out = downmixToStereo([one(0), one(0), one(1), one(1), one(0), one(0)]);
		expect(out.length).toBe(2);
		expect(out[0][0]).toBeCloseTo(out[1][0], 6);
		expect(out[0][0]).toBeGreaterThan(0);
		const full = downmixToStereo([one(1), one(1), one(1), one(0), one(1), one(1)]);
		expect(full[0][0]).toBeLessThanOrEqual(1.0001);
	});
	it('số kênh lạ -> 2 kênh đầu', () => {
		const ch = [3, 4, 5].map((v) => new Float32Array([v]));
		const out = downmixToStereo(ch);
		expect(out[0][0]).toBe(3);
		expect(out[1][0]).toBe(4);
	});
});
