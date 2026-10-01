import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { baseNameOf, dedupeName } from '@/lib/file-utils';
import {
	applyChannelMode,
	clampMp3Bitrate,
	downmixToStereo,
	nearestMp3SampleRate,
	trimChannels,
	type ChannelMode,
} from '@/lib/audio-utils';
import {
	AUDIO_FORMATS,
	AUDIO_FORMAT_ORDER,
	bitratesFor,
	buildEncodeArgs,
	buildExtractAudioArgs,
	outputFileName,
	pickBitrate,
	trimRangeValid,
	type AudioFormat,
} from '@/lib/audio-formats';
import { isAudioOrVideoFile, safeMediaExt } from '@/lib/media-ext';
import { encodeWavPcm, WAV_BIT_DEPTHS, type WavBitDepth } from '@/lib/wav-encode';
import type { EncodeRequest, EncodeResponseMessage } from './audioEncodeWorker';

interface Messages {
	dropLabel: string;
	chooseFile: string;
	previewLabel: string;
	outputFormatLabel: string;
	formatMp3: string;
	formatWav: string;
	bitrateLabel: string;
	convertButton: string;
	decodingLabel: string;
	encodingLabel: string;
	resultLabel: string;
	download: string;
	originalLabel: string;
	convertedLabel: string;
	sizeAndDuration: string;
	clear: string;
	decodeError: string;
	encodeError: string;
	channelDownmixWarning: string;
	resampleToggleLabel: string;
	sampleRateLabel: string;
	normalizeToggleLabel: string;
	fadeInLabel: string;
	fadeOutLabel: string;
	resampleError: string;
	bitrateAdjusted: string;
	sampleRateAdjusted: string;
	formatOgg: string;
	formatFlac: string;
	formatM4a: string;
	wavBitDepthLabel: string;
	wavBitDepthOption: string;
	wavBitDepthFloat: string;
	channelsLabel: string;
	channelsKeep: string;
	channelsMono: string;
	channelsStereo: string;
	trimHeading: string;
	trimStartLabel: string;
	trimEndLabel: string;
	trimUseCurrent: string;
	trimHint: string;
	trimDisabledBatch: string;
	trimInvalid: string;
	engineLoading: string;
	engineLoadError: string;
	videoFallbackNote: string;
	unsupportedFileError: string;
	addFiles: string;
	batchProgress: string;
	statusPending: string;
	statusProcessing: string;
	statusDone: string;
	statusFailed: string;
	downloadAll: string;
	removeFile: string;
	zipError: string;
	filesHeading: string;
}

type Stage = 'decoding' | 'resampling' | 'encoding';
type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

interface Item {
	id: number;
	file: File;
	previewUrl: string;
	status: ItemStatus;
	resultUrl?: string;
	resultBlob?: Blob;
	resultName?: string;
	resultSize?: number;
	duration?: number;
	error?: string;
	notes: string[];
}

interface Settings {
	format: AudioFormat;
	bitrate: number;
	bitDepth: WavBitDepth;
	channelMode: ChannelMode;
	resample: boolean;
	sampleRate: number;
	normalize: boolean;
	fadeIn: number;
	fadeOut: number;
	trimStart: number;
	trimEnd: number;
	useTrim: boolean;
}

class StageError extends Error {
	stage: Stage | 'engine' | 'trim';
	constructor(stage: Stage | 'engine' | 'trim') {
		super(stage);
		this.stage = stage;
	}
}

const SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100, 48000];
const MAX_FADE_SECONDS = 5;
const MAX_FILES = 50;
// -1dBFS, the conventional "normalize" target most audio tools default to —
// leaves a hair of headroom instead of slamming every peak to exactly 0dBFS.
const NORMALIZE_TARGET_PEAK = 0.891;
const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

// Resampling via a native `OfflineAudioContext`: render the decoded buffer
// through an offline context whose sample rate differs from the source, and
// the Web Audio API's own internal resampler does the conversion — no DSP
// library needed for something the platform already does correctly.
async function resampleChannels(
	channels: Float32Array[],
	sourceSampleRate: number,
	targetSampleRate: number,
): Promise<Float32Array[]> {
	if (sourceSampleRate === targetSampleRate) return channels;
	const numberOfChannels = channels.length;
	const length = channels[0].length;

	const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	const scratchCtx = new AudioCtx();
	const sourceBuffer = scratchCtx.createBuffer(numberOfChannels, length, sourceSampleRate);
	channels.forEach((data, i) => sourceBuffer.copyToChannel(data, i));
	void scratchCtx.close();

	const targetLength = Math.ceil(length * (targetSampleRate / sourceSampleRate));
	const OfflineCtx =
		window.OfflineAudioContext ||
		(window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
	const offlineCtx = new OfflineCtx(numberOfChannels, targetLength, targetSampleRate);
	const bufferSource = offlineCtx.createBufferSource();
	bufferSource.buffer = sourceBuffer;
	bufferSource.connect(offlineCtx.destination);
	bufferSource.start();
	const renderedBuffer = await offlineCtx.startRendering();

	const result: Float32Array[] = [];
	for (let i = 0; i < numberOfChannels; i++) result.push(renderedBuffer.getChannelData(i).slice());
	return result;
}

function normalizeChannels(channels: Float32Array[], targetPeak = NORMALIZE_TARGET_PEAK): Float32Array[] {
	let peak = 0;
	for (const channel of channels) {
		for (let i = 0; i < channel.length; i++) {
			const abs = Math.abs(channel[i]);
			if (abs > peak) peak = abs;
		}
	}
	if (peak === 0) return channels;
	const gain = targetPeak / peak;
	return channels.map((channel) => channel.map((value) => value * gain));
}

function applyFade(
	channels: Float32Array[],
	sampleRate: number,
	fadeInSeconds: number,
	fadeOutSeconds: number,
): Float32Array[] {
	if (fadeInSeconds <= 0 && fadeOutSeconds <= 0) return channels;
	const length = channels[0].length;
	const fadeInSamples = Math.min(length, Math.round(fadeInSeconds * sampleRate));
	const fadeOutSamples = Math.min(length, Math.round(fadeOutSeconds * sampleRate));
	return channels.map((channel) => {
		const out = channel.slice();
		for (let i = 0; i < fadeInSamples; i++) out[i] *= i / fadeInSamples;
		for (let i = 0; i < fadeOutSamples; i++) {
			const idx = length - 1 - i;
			out[idx] *= i / fadeOutSamples;
		}
		return out;
	});
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds)) return '0:00';
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds - m * 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

const selectClass = 'min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground';

export default function AudioConverter({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<Item[]>([]);
	const [outputFormat, setOutputFormat] = useState<AudioFormat>('mp3');
	const [bitrate, setBitrate] = useState(192);
	const [bitDepth, setBitDepth] = useState<WavBitDepth>(16);
	const [channelMode, setChannelMode] = useState<ChannelMode>('keep');
	const [isDragOver, setIsDragOver] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [stage, setStage] = useState<'idle' | Stage | 'engine'>('idle');
	const [progress, setProgress] = useState(0);
	const [batchPos, setBatchPos] = useState<{ current: number; total: number; name: string } | null>(null);
	const [globalError, setGlobalError] = useState<string | null>(null);
	const [resampleEnabled, setResampleEnabled] = useState(false);
	const [targetSampleRate, setTargetSampleRate] = useState(44100);
	const [normalizeEnabled, setNormalizeEnabled] = useState(false);
	const [fadeInSeconds, setFadeInSeconds] = useState(0);
	const [fadeOutSeconds, setFadeOutSeconds] = useState(0);
	const [trimStart, setTrimStart] = useState(0);
	const [trimEnd, setTrimEnd] = useState(0);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const workerRef = useRef<Worker | null>(null);
	const ffmpegRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null);
	const originalAudioRef = useRef<HTMLAudioElement | null>(null);
	// Tăng mỗi lần Clear / đổi file / unmount: tác vụ convert đang chạy so sánh token để bỏ kết quả cũ.
	const runTokenRef = useRef(0);
	const nextIdRef = useRef(1);
	const itemsRef = useRef<Item[]>([]);
	itemsRef.current = items;

	const singleItem = items.length === 1;
	const formatInfo = AUDIO_FORMATS[outputFormat];
	const formatLabels: Record<AudioFormat, string> = {
		mp3: messages.formatMp3,
		wav: messages.formatWav,
		ogg: messages.formatOgg,
		flac: messages.formatFlac,
		m4a: messages.formatM4a,
	};
	const doneItems = items.filter((it) => it.status === 'done' && it.resultBlob);

	const terminateWorker = () => {
		workerRef.current?.terminate();
		workerRef.current = null;
	};

	const terminateFfmpeg = () => {
		try {
			ffmpegRef.current?.terminate();
		} catch {
			/* đã dừng */
		}
		ffmpegRef.current = null;
	};

	const revokeItem = (it: Item) => {
		URL.revokeObjectURL(it.previewUrl);
		if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
	};

	useEffect(() => {
		return () => {
			runTokenRef.current++;
			workerRef.current?.terminate();
			workerRef.current = null;
			try {
				ffmpegRef.current?.terminate();
			} catch {
				/* đã dừng */
			}
			ffmpegRef.current = null;
			itemsRef.current.forEach(revokeItem);
		};
	}, []);

	const patchItem = (id: number, patch: Partial<Item>) =>
		setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

	const resetResult = (it: Item): Item => {
		if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
		return { ...it, status: 'pending', resultUrl: undefined, resultBlob: undefined, resultName: undefined, resultSize: undefined, duration: undefined, error: undefined, notes: [] };
	};

	const addFiles = (files: FileList | File[] | null) => {
		const list = files ? Array.from(files) : [];
		if (list.length === 0) return;
		const accepted = list.filter(isAudioOrVideoFile);
		if (accepted.length === 0) {
			setGlobalError(messages.unsupportedFileError);
			return;
		}
		setGlobalError(accepted.length < list.length ? messages.unsupportedFileError : null);
		const room = Math.max(0, MAX_FILES - itemsRef.current.length);
		const fresh: Item[] = accepted.slice(0, room).map((file) => ({
			id: nextIdRef.current++,
			file,
			previewUrl: URL.createObjectURL(file),
			status: 'pending',
			notes: [],
		}));
		// New files invalidate old results of the same batch only through the user's next Convert; keep what's done.
		setItems((prev) => [...prev, ...fresh]);
		if (itemsRef.current.length === 0 && fresh.length === 1) {
			const lower = fresh[0].file.name.toLowerCase();
			// Gợi ý định dạng đích ngược với nguồn như trước đây.
			if (lower.endsWith('.mp3')) setOutputFormat('wav');
			else if (lower.endsWith('.wav')) setOutputFormat('mp3');
		}
		setTrimStart(0);
		setTrimEnd(0);
	};

	const removeItem = (id: number) => {
		const target = itemsRef.current.find((it) => it.id === id);
		if (target) revokeItem(target);
		setItems((prev) => prev.filter((it) => it.id !== id));
	};

	const ensureFfmpeg = async () => {
		if (ffmpegRef.current) return ffmpegRef.current;
		setStage('engine');
		try {
			const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
			const ffmpeg = new FFmpeg();
			ffmpeg.on('progress', ({ progress: p }) => setProgress(Math.min(100, Math.max(0, Math.round((Number.isFinite(p) ? p : 0) * 100)))));
			// Plain toBlobURL (no progress callback): see VideoTrim for why the progress option breaks on gzip'd CDN responses.
			const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
			const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
			await ffmpeg.load({ coreURL, wasmURL });
			ffmpegRef.current = ffmpeg;
			return ffmpeg;
		} catch {
			throw new StageError('engine');
		}
	};

	// Mỗi lần encode MP3/WAV dùng worker mới và terminate ngay khi xong (không giữ worker + lamejs trong bộ nhớ).
	const createWorker = () => {
		terminateWorker();
		workerRef.current = new Worker(new URL('./audioEncodeWorker.ts', import.meta.url), { type: 'module' });
		return workerRef.current;
	};

	// Converts one item. Returns the encoded blob; throws StageError for the stage that failed.
	const convertItem = async (
		it: Item,
		s: Settings,
		isStale: () => boolean,
	): Promise<{ blob: Blob; duration: number; notes: string[] } | null> => {
		const notes: string[] = [];
		let audioCtx: AudioContext | null = null;
		let currentStage: Stage | 'engine' | 'trim' = 'decoding';
		try {
			setStage('decoding');
			const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			audioCtx = new AudioCtx();
			const arrayBuffer = await it.file.arrayBuffer();
			let audioBuffer: AudioBuffer;
			try {
				audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
			} catch {
				// The browser cannot decode this container/codec directly (typical for MKV/MOV/AVI/WMA...):
				// let ffmpeg.wasm pull the audio track out as a PCM WAV, then decode that.
				const ffmpeg = await ensureFfmpeg();
				if (isStale()) return null;
				setStage('decoding');
				const inName = `src.${safeMediaExt(it.file)}`;
				const outName = 'extracted.wav';
				try {
					await ffmpeg.writeFile(inName, new Uint8Array(arrayBuffer));
					const code = await ffmpeg.exec(buildExtractAudioArgs(inName, outName));
					if (code !== 0) throw new Error('extract failed');
					const wav = (await ffmpeg.readFile(outName)) as Uint8Array;
					const copy = new Uint8Array(wav.length);
					copy.set(wav);
					audioBuffer = await audioCtx.decodeAudioData(copy.buffer);
					notes.push(messages.videoFallbackNote);
				} finally {
					await ffmpeg.deleteFile(inName).catch(() => {});
					await ffmpeg.deleteFile(outName).catch(() => {});
				}
			}
			if (isStale()) return null;
			if (audioBuffer.numberOfChannels > 2) {
				notes.push(messages.channelDownmixWarning.replace('{{count}}', String(audioBuffer.numberOfChannels)));
			}
			let channels: Float32Array[] = [];
			for (let i = 0; i < audioBuffer.numberOfChannels; i++) channels.push(audioBuffer.getChannelData(i).slice());
			// Downmix thật (ITU-R BS.775) thay vì bỏ kênh thừa.
			channels = downmixToStereo(channels);
			let sampleRate = audioBuffer.sampleRate;

			if (s.useTrim && (s.trimStart > 0 || s.trimEnd > 0)) {
				currentStage = 'trim';
				if (!trimRangeValid(s.trimStart, s.trimEnd, audioBuffer.duration)) throw new StageError('trim');
				const cut = trimChannels(channels, sampleRate, s.trimStart, s.trimEnd);
				if (!cut) throw new StageError('trim');
				channels = cut;
			}
			channels = applyChannelMode(channels, s.channelMode);

			// All of these run on the decoded samples before encoding — cheap per-sample math (or, for resample,
			// a native OfflineAudioContext render).
			currentStage = 'resampling';
			let desiredRate = s.resample ? s.sampleRate : sampleRate;
			// MP3 chỉ hỗ trợ một số sample rate nhất định (vd 96 kHz thì không): tự đưa về giá trị hợp lệ gần nhất.
			if (s.format === 'mp3') {
				const valid = nearestMp3SampleRate(desiredRate);
				if (valid !== desiredRate) notes.push(messages.sampleRateAdjusted.replace('{{rate}}', String(valid)));
				desiredRate = valid;
			}
			if (desiredRate !== sampleRate) {
				channels = await resampleChannels(channels, sampleRate, desiredRate);
				sampleRate = desiredRate;
			}
			if (isStale()) return null;
			if (s.normalize) channels = normalizeChannels(channels);
			if (s.fadeIn > 0 || s.fadeOut > 0) channels = applyFade(channels, sampleRate, s.fadeIn, s.fadeOut);
			const duration = channels[0].length / sampleRate;

			// Tổ hợp bitrate/sample rate không hợp lệ cho MP3 (vd 320 kbps ở 16 kHz) -> hạ bitrate.
			let effectiveBitrate = s.bitrate;
			if (s.format === 'mp3') {
				effectiveBitrate = clampMp3Bitrate(sampleRate, s.bitrate);
				if (effectiveBitrate !== s.bitrate) notes.push(messages.bitrateAdjusted.replace('{{bitrate}}', String(effectiveBitrate)));
			}

			currentStage = 'encoding';
			setStage('encoding');
			setProgress(0);
			const info = AUDIO_FORMATS[s.format];

			if (!info.viaFfmpeg) {
				const worker = createWorker();
				const { data, mimeType } = await new Promise<{ data: Uint8Array; mimeType: string }>((resolve, reject) => {
					worker.onmessage = (event: MessageEvent<EncodeResponseMessage>) => {
						const msg = event.data;
						if (isStale()) return;
						if (msg.type === 'progress') setProgress(msg.percent);
						else if (msg.type === 'done') resolve({ data: msg.data, mimeType: msg.mimeType });
						else if (msg.type === 'error') reject(new Error(msg.message));
					};
					worker.onerror = (e) => reject(new Error(e.message));
					const request: EncodeRequest = { format: s.format as 'mp3' | 'wav', bitrate: effectiveBitrate, sampleRate, channels, bitDepth: s.bitDepth };
					worker.postMessage(request, channels.map((c) => c.buffer));
				});
				terminateWorker();
				if (isStale()) return null;
				return { blob: new Blob([data as BlobPart], { type: mimeType }), duration, notes };
			}

			// OGG (Opus) / FLAC / M4A (AAC): hand a 16-bit WAV to ffmpeg.wasm.
			const ffmpeg = await ensureFfmpeg();
			if (isStale()) return null;
			setStage('encoding');
			const inName = 'enc-in.wav';
			const outName = `enc-out.${info.ext}`;
			try {
				await ffmpeg.writeFile(inName, encodeWavPcm(channels, sampleRate, 16));
				const code = await ffmpeg.exec(buildEncodeArgs(s.format, inName, outName, effectiveBitrate));
				if (isStale()) return null;
				if (code !== 0) throw new Error('ffmpeg encode failed');
				const out = (await ffmpeg.readFile(outName)) as Uint8Array;
				const copy = new Uint8Array(out.length);
				copy.set(out);
				return { blob: new Blob([copy], { type: info.mime }), duration, notes };
			} catch (encodeErr) {
				// A crashed wasm instance stays corrupted: drop it so the next file/attempt starts a fresh engine.
				terminateFfmpeg();
				throw encodeErr;
			} finally {
				if (ffmpegRef.current === ffmpeg) {
					await ffmpeg.deleteFile(inName).catch(() => {});
					await ffmpeg.deleteFile(outName).catch(() => {});
				}
			}
		} catch (err) {
			if (err instanceof StageError) throw err;
			throw new StageError(currentStage === 'trim' ? 'trim' : currentStage);
		} finally {
			void audioCtx?.close();
		}
	};

	const handleConvert = async () => {
		if (itemsRef.current.length === 0) return;
		const token = ++runTokenRef.current;
		const isStale = () => token !== runTokenRef.current;
		// Chốt toàn bộ cài đặt tại thời điểm bấm.
		const settings: Settings = {
			format: outputFormat,
			bitrate: pickBitrate(outputFormat, bitrate),
			bitDepth,
			channelMode,
			resample: resampleEnabled,
			sampleRate: targetSampleRate,
			normalize: normalizeEnabled,
			fadeIn: fadeInSeconds,
			fadeOut: fadeOutSeconds,
			trimStart,
			trimEnd,
			useTrim: itemsRef.current.length === 1,
		};
		setGlobalError(null);
		setProcessing(true);
		setProgress(0);
		setItems((prev) => prev.map(resetResult));
		const queue = itemsRef.current.map((it) => it.id);
		try {
			for (let i = 0; i < queue.length; i++) {
				if (isStale()) return;
				const id = queue[i];
				const current = itemsRef.current.find((it) => it.id === id);
				if (!current) continue;
				setBatchPos({ current: i + 1, total: queue.length, name: current.file.name });
				patchItem(id, { status: 'processing' });
				try {
					const result = await convertItem(current, settings, isStale);
					if (isStale() || !result) return;
					const url = URL.createObjectURL(result.blob);
					patchItem(id, {
						status: 'done',
						resultUrl: url,
						resultBlob: result.blob,
						resultSize: result.blob.size,
						duration: result.duration,
						resultName: outputFileName(current.file.name, baseNameOf(current.file.name, 'audio'), settings.format),
						notes: result.notes,
					});
				} catch (err) {
					if (isStale()) return;
					const where = err instanceof StageError ? err.stage : 'encoding';
					const text =
						where === 'decoding'
							? messages.decodeError
							: where === 'resampling'
								? messages.resampleError
								: where === 'engine'
									? messages.engineLoadError
									: where === 'trim'
										? messages.trimInvalid
										: messages.encodeError;
					patchItem(id, { status: 'error', error: text });
				}
			}
		} finally {
			if (!isStale()) {
				setProcessing(false);
				setStage('idle');
				setBatchPos(null);
				terminateWorker();
			}
		}
	};

	const handleClear = () => {
		// Huỷ tác vụ đang chạy + dừng worker encode và ffmpeg thật sự.
		runTokenRef.current++;
		terminateWorker();
		terminateFfmpeg();
		setProcessing(false);
		setStage('idle');
		setBatchPos(null);
		itemsRef.current.forEach(revokeItem);
		setItems([]);
		setGlobalError(null);
		setTrimStart(0);
		setTrimEnd(0);
	};

	const saveBlob = (blob: Blob, name: string) => {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	};

	const handleDownloadAll = async () => {
		if (doneItems.length === 0) return;
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			const used = new Set<string>();
			for (const it of doneItems) zip.file(dedupeName(it.resultName ?? 'audio', used), it.resultBlob as Blob);
			saveBlob(await zip.generateAsync({ type: 'blob' }), 'converted-audio.zip');
		} catch {
			setGlobalError(messages.zipError);
		}
	};

	const bitrateOptions = bitratesFor(outputFormat);
	const currentBitrate = pickBitrate(outputFormat, bitrate);

	return (
		<div className="flex flex-col gap-4">
			<div
				className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed p-4 transition-colors ${
					isDragOver ? 'border-primary bg-primary/5' : 'border-border'
				}`}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragOver(false);
					if (!processing) addFiles(e.dataTransfer.files);
				}}
			>
				<p className="text-xs text-muted-foreground">{messages.dropLabel}</p>
				<label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-0">
					{items.length === 0 ? messages.chooseFile : messages.addFiles}
					<input
						id="audio-converter-file-input"
						ref={fileInputRef}
						type="file"
						multiple
						accept="audio/*,video/*,.mp3,.wav,.ogg,.opus,.flac,.m4a,.aac,.wma,.aif,.aiff,.mp4,.mov,.mkv,.webm,.avi"
						className="sr-only"
						disabled={processing}
						onChange={(e) => {
							addFiles(e.target.files);
							e.target.value = '';
						}}
					/>
				</label>
				{globalError && (
					<p role="alert" className="text-sm text-destructive">
						{globalError}
					</p>
				)}
			</div>

			{items.length > 0 && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-end gap-4 rounded-lg border border-border p-4">
						<div className="flex flex-col gap-1">
							<label htmlFor="audio-converter-format" className="text-xs text-muted-foreground">
								{messages.outputFormatLabel}
							</label>
							<select
								id="audio-converter-format"
								value={outputFormat}
								onChange={(e) => {
									const next = e.target.value as AudioFormat;
									setOutputFormat(next);
									setBitrate((b) => pickBitrate(next, b));
								}}
								className={selectClass}
							>
								{AUDIO_FORMAT_ORDER.map((f) => (
									<option key={f} value={f}>
										{formatLabels[f]}
									</option>
								))}
							</select>
						</div>
						{bitrateOptions.length > 0 && (
							<div className="flex flex-col gap-1">
								<label htmlFor="audio-converter-bitrate" className="text-xs text-muted-foreground">
									{messages.bitrateLabel}
								</label>
								<select
									id="audio-converter-bitrate"
									value={currentBitrate}
									onChange={(e) => setBitrate(Number(e.target.value))}
									className={selectClass}
								>
									{bitrateOptions.map((b) => (
										<option key={b} value={b}>
											{b} kbps
										</option>
									))}
								</select>
							</div>
						)}
						{outputFormat === 'wav' && (
							<div className="flex flex-col gap-1">
								<label htmlFor="audio-converter-bitdepth" className="text-xs text-muted-foreground">
									{messages.wavBitDepthLabel}
								</label>
								<select
									id="audio-converter-bitdepth"
									value={bitDepth}
									onChange={(e) => setBitDepth(Number(e.target.value) as WavBitDepth)}
									className={selectClass}
								>
									{WAV_BIT_DEPTHS.map((d) => (
										<option key={d} value={d}>
											{d === 32 ? messages.wavBitDepthFloat : messages.wavBitDepthOption.replace('{{bits}}', String(d))}
										</option>
									))}
								</select>
							</div>
						)}
						<div className="flex flex-col gap-1">
							<label htmlFor="audio-converter-channels" className="text-xs text-muted-foreground">
								{messages.channelsLabel}
							</label>
							<select
								id="audio-converter-channels"
								value={channelMode}
								onChange={(e) => setChannelMode(e.target.value as ChannelMode)}
								className={selectClass}
							>
								<option value="keep">{messages.channelsKeep}</option>
								<option value="mono">{messages.channelsMono}</option>
								<option value="stereo">{messages.channelsStereo}</option>
							</select>
						</div>
						{formatInfo.viaFfmpeg && <p className="basis-full text-xs text-muted-foreground">{messages.engineLoading}</p>}
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.trimHeading}</span>
						{singleItem ? (
							<div className="flex flex-wrap items-end gap-4">
								<div className="flex flex-col gap-1">
									<label htmlFor="audio-converter-trim-start" className="text-xs text-muted-foreground">
										{messages.trimStartLabel}
									</label>
									<div className="flex items-center gap-2">
										<input
											id="audio-converter-trim-start"
											type="number"
											min={0}
											step={0.1}
											value={trimStart}
											onChange={(e) => setTrimStart(Math.max(0, Number(e.target.value) || 0))}
											className={`${selectClass} w-24`}
										/>
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="min-h-9"
											onClick={() => originalAudioRef.current && setTrimStart(Number(originalAudioRef.current.currentTime.toFixed(1)))}
										>
											{messages.trimUseCurrent}
										</Button>
									</div>
								</div>
								<div className="flex flex-col gap-1">
									<label htmlFor="audio-converter-trim-end" className="text-xs text-muted-foreground">
										{messages.trimEndLabel}
									</label>
									<div className="flex items-center gap-2">
										<input
											id="audio-converter-trim-end"
											type="number"
											min={0}
											step={0.1}
											value={trimEnd}
											onChange={(e) => setTrimEnd(Math.max(0, Number(e.target.value) || 0))}
											className={`${selectClass} w-24`}
										/>
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="min-h-9"
											onClick={() => originalAudioRef.current && setTrimEnd(Number(originalAudioRef.current.currentTime.toFixed(1)))}
										>
											{messages.trimUseCurrent}
										</Button>
									</div>
								</div>
								<p className="basis-full text-xs text-muted-foreground">{messages.trimHint}</p>
							</div>
						) : (
							<p className="text-xs text-muted-foreground">{messages.trimDisabledBatch}</p>
						)}
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<label className="flex min-h-9 items-center gap-1.5 text-sm text-foreground">
							<input
								type="checkbox"
								checked={resampleEnabled}
								onChange={(e) => setResampleEnabled(e.target.checked)}
							/>
							{messages.resampleToggleLabel}
						</label>
						{resampleEnabled && (
							<div className="flex flex-col gap-1 pl-1">
								<label htmlFor="audio-converter-sample-rate" className="text-xs text-muted-foreground">
									{messages.sampleRateLabel}
								</label>
								<select
									id="audio-converter-sample-rate"
									value={targetSampleRate}
									onChange={(e) => setTargetSampleRate(Number(e.target.value))}
									className={`${selectClass} w-40`}
								>
									{SAMPLE_RATES.map((rate) => (
										<option key={rate} value={rate}>
											{rate} Hz
										</option>
									))}
								</select>
							</div>
						)}

						<label className="flex min-h-9 items-center gap-1.5 text-sm text-foreground">
							<input
								type="checkbox"
								checked={normalizeEnabled}
								onChange={(e) => setNormalizeEnabled(e.target.checked)}
							/>
							{messages.normalizeToggleLabel}
						</label>

						<div className="flex flex-wrap items-center gap-4">
							<div className="flex items-center gap-2">
								<label htmlFor="audio-converter-fade-in" className="shrink-0 text-sm text-foreground">
									{messages.fadeInLabel.replace('{{seconds}}', fadeInSeconds.toFixed(1))}
								</label>
								<input
									id="audio-converter-fade-in"
									type="range"
									min={0}
									max={MAX_FADE_SECONDS}
									step={0.5}
									value={fadeInSeconds}
									onChange={(e) => setFadeInSeconds(Number(e.target.value))}
									className="h-9 w-32"
								/>
							</div>
							<div className="flex items-center gap-2">
								<label htmlFor="audio-converter-fade-out" className="shrink-0 text-sm text-foreground">
									{messages.fadeOutLabel.replace('{{seconds}}', fadeOutSeconds.toFixed(1))}
								</label>
								<input
									id="audio-converter-fade-out"
									type="range"
									min={0}
									max={MAX_FADE_SECONDS}
									step={0.5}
									value={fadeOutSeconds}
									onChange={(e) => setFadeOutSeconds(Number(e.target.value))}
									className="h-9 w-32"
								/>
							</div>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Button type="button" size="sm" className="min-h-9" onClick={handleConvert} disabled={processing}>
							{messages.convertButton}
						</Button>
						{doneItems.length > 1 && (
							<Button type="button" size="sm" variant="secondary" className="min-h-9" onClick={() => void handleDownloadAll()}>
								{messages.downloadAll}
							</Button>
						)}
						<Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={handleClear}>
							{messages.clear}
						</Button>
						{processing && batchPos && batchPos.total > 1 && (
							<p role="status" className="text-xs text-muted-foreground">
								{messages.batchProgress
									.replace('{{current}}', String(batchPos.current))
									.replace('{{total}}', String(batchPos.total))
									.replace('{{name}}', batchPos.name)}
							</p>
						)}
						{processing && stage === 'engine' && (
							<p role="status" className="text-xs text-muted-foreground">{messages.engineLoading}</p>
						)}
						{processing && stage === 'decoding' && (
							<p role="status" className="text-xs text-muted-foreground">{messages.decodingLabel}</p>
						)}
						{processing && stage === 'encoding' && (
							<p role="status" className="text-xs text-muted-foreground">
								{messages.encodingLabel.replace('{{percent}}', String(progress))}
							</p>
						)}
					</div>

					<section aria-label={messages.filesHeading} className="flex flex-col gap-3">
						<ul className="flex flex-col gap-3">
							{items.map((it) => (
								<li key={it.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="min-w-0 truncate text-sm font-medium text-foreground" title={it.file.name}>
											{it.file.name}
										</span>
										<div className="flex items-center gap-2">
											<span
												className={`rounded-full px-2 py-0.5 text-xs font-medium ${
													it.status === 'done'
														? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
														: it.status === 'error'
															? 'bg-destructive/15 text-destructive'
															: 'bg-muted text-muted-foreground'
												}`}
											>
												{it.status === 'done'
													? messages.statusDone
													: it.status === 'error'
														? messages.statusFailed
														: it.status === 'processing'
															? messages.statusProcessing
															: messages.statusPending}
											</span>
											{!processing && (
												<Button
													type="button"
													size="sm"
													variant="ghost"
													className="min-h-9"
													aria-label={`${messages.removeFile}: ${it.file.name}`}
													onClick={() => removeItem(it.id)}
												>
													{messages.removeFile}
												</Button>
											)}
										</div>
									</div>

									<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
										<div className="flex flex-col gap-1">
											<span className="text-xs font-medium text-muted-foreground">{messages.originalLabel}</span>
											{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
											<audio
												ref={singleItem ? originalAudioRef : undefined}
												src={it.previewUrl}
												controls
												aria-label={`${messages.previewLabel}: ${it.file.name}`}
												className="w-full"
											/>
											<span className="text-xs text-muted-foreground">{formatBytes(it.file.size)}</span>
										</div>
										{it.status === 'done' && it.resultUrl && (
											<div className="flex flex-col gap-1">
												<span className="text-xs font-medium text-muted-foreground">{messages.convertedLabel}</span>
												{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
												<audio
													src={it.resultUrl}
													controls
													aria-label={`${messages.resultLabel}: ${it.resultName ?? ''}`}
													className="w-full"
												/>
												<span className="text-xs text-muted-foreground">
													{messages.sizeAndDuration
														.replace('{{size}}', formatBytes(it.resultSize ?? 0))
														.replace('{{duration}}', formatDuration(it.duration ?? 0))}
												</span>
											</div>
										)}
									</div>

									{it.status === 'error' && it.error && (
										<p role="alert" className="text-sm text-destructive">
											{it.error}
										</p>
									)}
									{it.notes.map((note, i) => (
										<p key={i} role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-300">
											{note}
										</p>
									))}
									{it.status === 'done' && it.resultBlob && (
										<div>
											<Button
												type="button"
												size="sm"
												className="min-h-9"
												onClick={() => saveBlob(it.resultBlob as Blob, it.resultName ?? 'converted')}
											>
												{messages.download}
											</Button>
										</div>
									)}
								</li>
							))}
						</ul>
					</section>
				</div>
			)}
		</div>
	);
}
