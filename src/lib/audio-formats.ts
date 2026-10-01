// Output formats and ffmpeg argument builders for the Audio Converter (pure, unit-testable).

export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a';

export interface AudioFormatInfo {
	ext: string;
	mime: string;
	/** Encoded by ffmpeg.wasm (loaded lazily) instead of the in-house workers. */
	viaFfmpeg: boolean;
	/** Offers a bitrate selector. */
	lossy: boolean;
}

export const AUDIO_FORMATS: Record<AudioFormat, AudioFormatInfo> = {
	mp3: { ext: 'mp3', mime: 'audio/mpeg', viaFfmpeg: false, lossy: true },
	wav: { ext: 'wav', mime: 'audio/wav', viaFfmpeg: false, lossy: false },
	ogg: { ext: 'ogg', mime: 'audio/ogg', viaFfmpeg: true, lossy: true },
	flac: { ext: 'flac', mime: 'audio/flac', viaFfmpeg: true, lossy: false },
	m4a: { ext: 'm4a', mime: 'audio/mp4', viaFfmpeg: true, lossy: true },
};

export const AUDIO_FORMAT_ORDER: AudioFormat[] = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];

export function bitratesFor(format: AudioFormat): number[] {
	if (format === 'mp3') return [128, 192, 256, 320];
	if (format === 'ogg') return [96, 128, 160, 192, 256, 320];
	if (format === 'm4a') return [96, 128, 192, 256, 320];
	return [];
}

/** Keeps the chosen bitrate when valid for the format, otherwise the closest available one. */
export function pickBitrate(format: AudioFormat, current: number): number {
	const list = bitratesFor(format);
	if (list.length === 0) return current;
	return list.reduce((best, b) => (Math.abs(b - current) < Math.abs(best - current) ? b : best), list[0]);
}

/** Encode a 16-bit PCM WAV (already trimmed/processed) with ffmpeg: Vorbis-in-Ogg, FLAC or AAC-in-M4A. */
export function buildEncodeArgs(format: AudioFormat, input: string, output: string, bitrate: number): string[] {
	switch (format) {
		case 'ogg':
			return ['-i', input, '-vn', '-c:a', 'libvorbis', '-b:a', `${bitrate}k`, output];
		case 'flac':
			return ['-i', input, '-vn', '-c:a', 'flac', output];
		case 'm4a':
			return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', `${bitrate}k`, '-movflags', '+faststart', output];
		default:
			throw new Error(`Format ${format} is not encoded by ffmpeg`);
	}
}

/** Pull the audio track of a video (or an audio file the browser cannot decode) into a PCM WAV. */
export function buildExtractAudioArgs(input: string, output: string): string[] {
	return ['-i', input, '-vn', '-c:a', 'pcm_s16le', output];
}

/** Output file name: "<base>.<ext>", with "-converted" when it would equal the source name. */
export function outputFileName(sourceName: string, base: string, format: AudioFormat): string {
	const ext = AUDIO_FORMATS[format].ext;
	const sameExt = sourceName.toLowerCase().endsWith(`.${ext}`);
	return `${base}${sameExt ? '-converted' : ''}.${ext}`;
}

/** Trim range check: start >= 0, end (0 = to the end) greater than start, within the clip. */
export function trimRangeValid(start: number, end: number, duration: number): boolean {
	if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) return false;
	if (start >= duration) return false;
	return end <= 0 || end > start;
}
