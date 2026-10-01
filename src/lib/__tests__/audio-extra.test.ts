import { describe, expect, it } from 'vitest';
import { applyChannelMode, toMono, toStereo, trimChannels } from '../audio-utils';
import { AUDIO_FORMATS, bitratesFor, buildEncodeArgs, buildExtractAudioArgs, outputFileName, pickBitrate, trimRangeValid } from '../audio-formats';
import { encodeWavPcm } from '../wav-encode';
import { isAudioFile, isAudioOrVideoFile, safeMediaExt } from '../media-ext';

const f = (...v: number[]) => new Float32Array(v);

describe('channel helpers', () => {
	it('mono averages channels', () => {
		const [m] = toMono([f(1, 0, -1), f(0, 1, -1)]);
		expect(Array.from(m)).toEqual([0.5, 0.5, -1]);
		const single = [f(1, 2)];
		expect(toMono(single)).toBe(single);
	});
	it('stereo duplicates mono and keeps first two channels otherwise', () => {
		const out = toStereo([f(0.5, -0.5)]);
		expect(out).toHaveLength(2);
		expect(Array.from(out[1])).toEqual([0.5, -0.5]);
		expect(out[0]).not.toBe(out[1]);
		expect(toStereo([f(1), f(2), f(3)])).toHaveLength(2);
	});
	it('applyChannelMode', () => {
		const ch = [f(1), f(0)];
		expect(applyChannelMode(ch, 'keep')).toBe(ch);
		expect(applyChannelMode(ch, 'mono')).toHaveLength(1);
		expect(applyChannelMode([f(1)], 'stereo')).toHaveLength(2);
	});
});

describe('trimChannels', () => {
	const ch = [new Float32Array(100).map((_, i) => i)];
	it('slices by seconds', () => {
		const out = trimChannels(ch, 10, 2, 5)!;
		expect(out[0]).toHaveLength(30);
		expect(out[0][0]).toBe(20);
	});
	it('end <= 0 means to the end; full range returns the same data', () => {
		expect(trimChannels(ch, 10, 3, 0)![0]).toHaveLength(70);
		expect(trimChannels(ch, 10, 0, 0)).toBe(ch);
		expect(trimChannels(ch, 10, 0, 999)).toBe(ch);
	});
	it('returns null for an empty range', () => {
		expect(trimChannels(ch, 10, 5, 5)).toBeNull();
		expect(trimChannels(ch, 10, 20, 0)).toBeNull();
	});
});

describe('encodeWavPcm', () => {
	const view = (u: Uint8Array) => new DataView(u.buffer, u.byteOffset, u.byteLength);
	const ascii = (u: Uint8Array, o: number, n: number) => String.fromCharCode(...u.subarray(o, o + n));

	it('16-bit header and samples', () => {
		const wav = encodeWavPcm([f(0, 1, -1), f(0, 0, 0)], 44100, 16);
		const v = view(wav);
		expect(ascii(wav, 0, 4)).toBe('RIFF');
		expect(ascii(wav, 8, 4)).toBe('WAVE');
		expect(v.getUint16(20, true)).toBe(1);
		expect(v.getUint16(22, true)).toBe(2);
		expect(v.getUint32(24, true)).toBe(44100);
		expect(v.getUint16(34, true)).toBe(16);
		expect(v.getUint32(40, true)).toBe(12);
		expect(v.getUint32(4, true)).toBe(wav.length - 8);
		expect(v.getInt16(44 + 4, true)).toBe(0x7fff); // frame 1, left = +1
		expect(v.getInt16(44 + 8, true)).toBe(-0x8000); // frame 2, left = -1
	});
	it('8-bit is unsigned and centred on 128', () => {
		const wav = encodeWavPcm([f(0, 1, -1)], 8000, 8);
		expect(wav[44]).toBe(128);
		expect(wav[45]).toBe(255);
		expect(wav[46]).toBe(0);
	});
	it('24-bit is little-endian packed', () => {
		const wav = encodeWavPcm([f(1, -1)], 8000, 24);
		expect(view(wav).getUint16(34, true)).toBe(24);
		expect(Array.from(wav.subarray(44, 47))).toEqual([0xff, 0xff, 0x7f]);
		expect(Array.from(wav.subarray(47, 50))).toEqual([0x00, 0x00, 0x80]);
	});
	it('32-bit float uses format 3 with fact chunk and exact values', () => {
		const wav = encodeWavPcm([f(0.25, -0.5)], 48000, 32);
		const v = view(wav);
		expect(v.getUint16(20, true)).toBe(3);
		expect(v.getUint16(34, true)).toBe(32);
		expect(ascii(wav, 38, 4)).toBe('fact');
		expect(ascii(wav, 50, 4)).toBe('data');
		expect(v.getUint32(54, true)).toBe(8);
		expect(v.getFloat32(58, true)).toBe(0.25);
		expect(v.getFloat32(62, true)).toBe(-0.5);
	});
	it('clamps out-of-range values and downsizes to 2 channels', () => {
		const wav = encodeWavPcm([f(2), f(-2), f(1)], 8000, 16);
		const v = view(wav);
		expect(v.getUint16(22, true)).toBe(2);
		expect(v.getInt16(44, true)).toBe(0x7fff);
		expect(v.getInt16(46, true)).toBe(-0x8000);
	});
});

describe('formats', () => {
	it('lists bitrates per lossy format and snaps to the nearest', () => {
		expect(bitratesFor('wav')).toEqual([]);
		expect(bitratesFor('ogg')).toContain(96);
		expect(pickBitrate('mp3', 64)).toBe(128);
		expect(pickBitrate('ogg', 192)).toBe(192);
		expect(pickBitrate('m4a', 64)).toBe(96);
		expect(pickBitrate('ogg', 64)).toBe(96);
		expect(pickBitrate('flac', 192)).toBe(192);
	});
	it('ffmpeg args', () => {
		expect(buildEncodeArgs('ogg', 'in.wav', 'o.ogg', 128)).toEqual(['-i', 'in.wav', '-vn', '-c:a', 'libvorbis', '-b:a', '128k', 'o.ogg']);
		expect(buildEncodeArgs('flac', 'in.wav', 'o.flac', 0)).toContain('flac');
		expect(buildEncodeArgs('m4a', 'in.wav', 'o.m4a', 192)).toContain('aac');
		expect(() => buildEncodeArgs('mp3', 'a', 'b', 1)).toThrow();
		expect(buildExtractAudioArgs('in.mp4', 'x.wav')).toEqual(['-i', 'in.mp4', '-vn', '-c:a', 'pcm_s16le', 'x.wav']);
		expect(AUDIO_FORMATS.m4a.mime).toBe('audio/mp4');
	});
	it('output names', () => {
		expect(outputFileName('song.wav', 'song', 'mp3')).toBe('song.mp3');
		expect(outputFileName('Song.MP3', 'Song', 'mp3')).toBe('Song-converted.mp3');
	});
	it('trim range validation', () => {
		expect(trimRangeValid(0, 0, 10)).toBe(true);
		expect(trimRangeValid(2, 5, 10)).toBe(true);
		expect(trimRangeValid(5, 2, 10)).toBe(false);
		expect(trimRangeValid(10, 0, 10)).toBe(false);
		expect(trimRangeValid(-1, 0, 10)).toBe(false);
		expect(trimRangeValid(NaN, 0, 10)).toBe(false);
	});
});

describe('media type detection', () => {
	it('accepts audio and video, rejects others', () => {
		expect(isAudioFile({ name: 'a.flac', type: '' })).toBe(true);
		expect(isAudioFile({ name: 'a.bin', type: 'audio/x-foo' })).toBe(true);
		expect(isAudioOrVideoFile({ name: 'clip.MOV', type: '' })).toBe(true);
		expect(isAudioOrVideoFile({ name: 'doc.pdf', type: 'application/pdf' })).toBe(false);
	});
	it('safe extension for ffmpeg FS', () => {
		expect(safeMediaExt({ name: 'a.m4a', type: '' })).toBe('m4a');
		expect(safeMediaExt({ name: 'weird.exe', type: '' })).toBe('bin');
		expect(safeMediaExt({ name: 'noext', type: 'video/webm' })).toBe('webm');
	});
});
