import { describe, expect, it } from 'vitest';
import {
	atempoChain,
	buildAudioFilter,
	buildConcatArgs,
	buildConcatList,
	buildGifArgs,
	buildMp3Args,
	buildSegmentArgs,
	buildVideoFilter,
	effectiveMode,
	frameStepSeconds,
	needsReencode,
	nextSegment,
	outputExtension,
	segmentsValid,
	thumbnailTimes,
	totalSegmentsDuration,
	type VideoOptions,
} from '../video-ffmpeg';

const base: VideoOptions = { mode: 'fast', mute: false, speed: 1, height: 0, crf: 23 };

describe('speed / filters', () => {
	it('chains atempo into the 0.5..2 range', () => {
		expect(atempoChain(1)).toEqual([]);
		expect(atempoChain(1.5)).toEqual(['atempo=1.5']);
		expect(atempoChain(4)).toEqual(['atempo=2', 'atempo=2']);
		expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5']);
		expect(atempoChain(0.5)).toEqual(['atempo=0.5']);
	});
	it('video filter escapes the comma in min()', () => {
		expect(buildVideoFilter({ speed: 2, height: 720 })).toBe('setpts=PTS/2,scale=-2:min(720\\,ih)');
		expect(buildVideoFilter({ speed: 1, height: 0 })).toBe('');
		expect(buildAudioFilter({ speed: 4 })).toBe('atempo=2,atempo=2');
	});
	it('speed or resize force re-encode', () => {
		expect(needsReencode(base)).toBe(false);
		expect(needsReencode({ ...base, speed: 2 })).toBe(true);
		expect(needsReencode({ ...base, height: 480 })).toBe(true);
		expect(effectiveMode({ ...base, height: 480 })).toBe('precise');
		expect(effectiveMode({ ...base, mode: 'precise' })).toBe('precise');
		expect(effectiveMode(base)).toBe('fast');
	});
});

describe('segment args', () => {
	it('stream copy with optional mute', () => {
		expect(buildSegmentArgs('in.mp4', 'o.mp4', { start: 1, end: 3.5 }, base)).toEqual([
			'-ss', '1.000', '-i', 'in.mp4', '-t', '2.500', '-c', 'copy', '-avoid_negative_ts', 'make_zero', 'o.mp4',
		]);
		expect(buildSegmentArgs('in.mp4', 'o.mp4', { start: 0, end: 1 }, { ...base, mute: true })).toContain('-an');
	});
	it('re-encode uses libx264 with crf, filters, and drops audio when muted', () => {
		const args = buildSegmentArgs('in.mov', 'o.mp4', { start: 0, end: 2 }, { ...base, speed: 2, height: 720, crf: 28 });
		expect(args).toContain('libx264');
		expect(args[args.indexOf('-crf') + 1]).toBe('28');
		expect(args[args.indexOf('-vf') + 1]).toBe('setpts=PTS/2,scale=-2:min(720\\,ih)');
		expect(args[args.indexOf('-af') + 1]).toBe('atempo=2');
		expect(args).toContain('aac');
		const muted = buildSegmentArgs('in.mov', 'o.mp4', { start: 0, end: 2 }, { ...base, mode: 'precise', mute: true });
		expect(muted).toContain('-an');
		expect(muted).not.toContain('aac');
		expect(muted).not.toContain('-af');
	});
});

describe('concat', () => {
	it('builds list and args', () => {
		expect(buildConcatList(['seg0.mp4', 'seg1.mp4'])).toBe("file 'seg0.mp4'\nfile 'seg1.mp4'\n");
		expect(buildConcatArgs('list.txt', 'out.mp4')).toEqual(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mp4']);
	});
});

describe('gif / mp3', () => {
	it('gif uses palettegen + paletteuse and respects cut', () => {
		const args = buildGifArgs({ input: 'in.mp4', cut: { start: 2, end: 5 } }, { fps: 10, width: 480, speed: 1 }, 'o.gif');
		expect(args.slice(0, 6)).toEqual(['-ss', '2.000', '-i', 'in.mp4', '-t', '3.000']);
		const graph = args[args.indexOf('-vf') + 1];
		expect(graph).toContain('fps=10');
		expect(graph).toContain('scale=min(480\\,iw):-1:flags=lanczos');
		expect(graph).toContain('palettegen');
		expect(graph).toContain('paletteuse');
		expect(args).toContain('-loop');
		expect(buildGifArgs({ input: 'm.mp4' }, { fps: 5, width: 240, speed: 2 }, 'o.gif')[1]).toBe('m.mp4');
	});
	it('mp3 drops video, sets bitrate and tempo', () => {
		const args = buildMp3Args({ input: 'in.mp4', cut: { start: 0, end: 10 } }, { bitrate: 192, speed: 1.5 }, 'o.mp3');
		expect(args).toContain('-vn');
		expect(args).toContain('libmp3lame');
		expect(args[args.indexOf('-b:a') + 1]).toBe('192k');
		expect(args[args.indexOf('-af') + 1]).toBe('atempo=1.5');
	});
});

describe('segments helpers', () => {
	it('totals and validates', () => {
		const segs = [
			{ start: 0, end: 2 },
			{ start: 5, end: 6.5 },
		];
		expect(totalSegmentsDuration(segs)).toBeCloseTo(3.5);
		expect(segmentsValid(segs, 10)).toBe(true);
		expect(segmentsValid(segs, 6)).toBe(false);
		expect(segmentsValid([], 10)).toBe(false);
		expect(segmentsValid([{ start: 3, end: 3 }], 10)).toBe(false);
	});
	it('proposes the next segment after the last one', () => {
		expect(nextSegment([{ start: 0, end: 10 }], 100)).toEqual({ start: 10, end: 20 });
		const wrap = nextSegment([{ start: 0, end: 100 }], 100);
		expect(wrap).toEqual({ start: 0, end: 10 });
		expect(nextSegment(Array.from({ length: 20 }, () => ({ start: 0, end: 1 })), 100)).toBeNull();
	});
	it('output extension', () => {
		expect(outputExtension('gif', 'mov', base)).toBe('gif');
		expect(outputExtension('mp3', 'mov', base)).toBe('mp3');
		expect(outputExtension('video', 'mov', base)).toBe('mov');
		expect(outputExtension('video', 'mov', { ...base, speed: 2 })).toBe('mp4');
	});
	it('thumbnail times and frame step', () => {
		const t = thumbnailTimes(10, 5);
		expect(t).toHaveLength(5);
		expect(t[0]).toBeCloseTo(1);
		expect(t[4]).toBeCloseTo(9);
		expect(thumbnailTimes(0, 5)).toEqual([]);
		expect(frameStepSeconds()).toBeCloseTo(1 / 30);
		expect(frameStepSeconds(24)).toBeCloseTo(1 / 24);
		expect(frameStepSeconds(0)).toBeCloseTo(1 / 30);
	});
});
