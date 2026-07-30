import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
}

type OutputFormat = 'mp3' | 'wav';

const BITRATES = [128, 192, 256, 320];
const SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100, 48000];
const MAX_FADE_SECONDS = 5;
// -1dBFS, the conventional "normalize" target most audio tools default to —
// leaves a hair of headroom instead of slamming every peak to exactly 0dBFS.
const NORMALIZE_TARGET_PEAK = 0.891;

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

export default function AudioConverter({ messages }: { messages: Messages }) {
	const [audioFile, setAudioFile] = useState<File | null>(null);
	const [audioUrl, setAudioUrl] = useState<string | null>(null);
	const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp3');
	const [bitrate, setBitrate] = useState(192);
	const [isDragOver, setIsDragOver] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [stage, setStage] = useState<'idle' | 'decoding' | 'encoding'>('idle');
	const [progress, setProgress] = useState(0);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [resultSize, setResultSize] = useState<number | null>(null);
	const [resultDuration, setResultDuration] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [channelCount, setChannelCount] = useState<number | null>(null);
	const [resampleEnabled, setResampleEnabled] = useState(false);
	const [targetSampleRate, setTargetSampleRate] = useState(44100);
	const [normalizeEnabled, setNormalizeEnabled] = useState(false);
	const [fadeInSeconds, setFadeInSeconds] = useState(0);
	const [fadeOutSeconds, setFadeOutSeconds] = useState(0);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const workerRef = useRef<Worker | null>(null);

	useEffect(() => {
		return () => {
			if (audioUrl) URL.revokeObjectURL(audioUrl);
			if (resultUrl) URL.revokeObjectURL(resultUrl);
			workerRef.current?.terminate();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const loadFile = (file: File) => {
		if (audioUrl) URL.revokeObjectURL(audioUrl);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		setError(null);
		setChannelCount(null);
		setAudioFile(file);
		setAudioUrl(URL.createObjectURL(file));
		const lower = file.name.toLowerCase();
		if (lower.endsWith('.mp3')) setOutputFormat('wav');
		else if (lower.endsWith('.wav')) setOutputFormat('mp3');
	};

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (file) loadFile(file);
	};

	const getWorker = () => {
		if (!workerRef.current) {
			workerRef.current = new Worker(new URL('./audioEncodeWorker.ts', import.meta.url), { type: 'module' });
		}
		return workerRef.current;
	};

	const handleConvert = async () => {
		if (!audioFile) return;
		setError(null);
		setProcessing(true);
		setProgress(0);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);

		let audioCtx: AudioContext | null = null;
		let currentStage: 'decoding' | 'encoding' = 'decoding';
		try {
			setStage('decoding');
			const arrayBuffer = await audioFile.arrayBuffer();
			const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			audioCtx = new AudioCtx();
			const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
			setChannelCount(audioBuffer.numberOfChannels > 2 ? audioBuffer.numberOfChannels : null);
			let channels: Float32Array[] = [];
			for (let i = 0; i < audioBuffer.numberOfChannels; i++) channels.push(audioBuffer.getChannelData(i).slice());
			let sampleRate = audioBuffer.sampleRate;
			const duration = audioBuffer.duration;

			// All three run on the decoded samples before handing off to the
			// encode worker — cheap per-sample math (or, for resample, a native
			// OfflineAudioContext render), so there's no need to push this work
			// into the worker too.
			if (resampleEnabled && targetSampleRate !== sampleRate) {
				channels = await resampleChannels(channels, sampleRate, targetSampleRate);
				sampleRate = targetSampleRate;
			}
			if (normalizeEnabled) channels = normalizeChannels(channels);
			if (fadeInSeconds > 0 || fadeOutSeconds > 0) {
				channels = applyFade(channels, sampleRate, fadeInSeconds, fadeOutSeconds);
			}

			currentStage = 'encoding';
			setStage('encoding');
			const worker = getWorker();
			const { data, mimeType } = await new Promise<{ data: Uint8Array; mimeType: string }>((resolve, reject) => {
				worker.onmessage = (event: MessageEvent<EncodeResponseMessage>) => {
					const msg = event.data;
					if (msg.type === 'progress') setProgress(msg.percent);
					else if (msg.type === 'done') resolve({ data: msg.data, mimeType: msg.mimeType });
					else if (msg.type === 'error') reject(new Error(msg.message));
				};
				worker.onerror = (e) => reject(new Error(e.message));
				const request: EncodeRequest = { format: outputFormat, bitrate, sampleRate, channels };
				worker.postMessage(request, channels.map((c) => c.buffer));
			});

			const blob = new Blob([data], { type: mimeType });
			setResultUrl(URL.createObjectURL(blob));
			setResultSize(blob.size);
			setResultDuration(duration);
		} catch {
			setError(currentStage === 'decoding' ? messages.decodeError : messages.encodeError);
		} finally {
			setProcessing(false);
			setStage('idle');
			void audioCtx?.close();
		}
	};

	const handleClear = () => {
		if (audioUrl) URL.revokeObjectURL(audioUrl);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setAudioFile(null);
		setAudioUrl(null);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		setError(null);
		setChannelCount(null);
	};

	const handleDownload = () => {
		if (!resultUrl) return;
		const link = document.createElement('a');
		link.href = resultUrl;
		link.download = outputFormat === 'mp3' ? 'converted.mp3' : 'converted.wav';
		link.click();
	};

	return (
		<div className="flex flex-col gap-4">
			{!audioFile && (
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
						handleFile(e.dataTransfer.files);
					}}
				>
					<p className="text-xs text-muted-foreground">{messages.dropLabel}</p>
					<label
						htmlFor="audio-converter-file-input"
						className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
					>
						{messages.chooseFile}
					</label>
					<input
						id="audio-converter-file-input"
						ref={fileInputRef}
						type="file"
						accept="audio/*"
						className="hidden"
						onChange={(e) => handleFile(e.target.files)}
					/>
				</div>
			)}

			{audioFile && audioUrl && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<label className="text-sm font-medium text-foreground">{messages.previewLabel}</label>
						{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
						<audio src={audioUrl} controls className="w-full max-w-xl" />
					</div>

					<div className="flex flex-wrap items-end gap-4 rounded-lg border border-border p-4">
						<div className="flex flex-col gap-1">
							<label htmlFor="audio-converter-format" className="text-xs text-muted-foreground">
								{messages.outputFormatLabel}
							</label>
							<select
								id="audio-converter-format"
								value={outputFormat}
								onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
								className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
							>
								<option value="mp3">{messages.formatMp3}</option>
								<option value="wav">{messages.formatWav}</option>
							</select>
						</div>
						{outputFormat === 'mp3' && (
							<div className="flex flex-col gap-1">
								<label htmlFor="audio-converter-bitrate" className="text-xs text-muted-foreground">
									{messages.bitrateLabel}
								</label>
								<select
									id="audio-converter-bitrate"
									value={bitrate}
									onChange={(e) => setBitrate(Number(e.target.value))}
									className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
								>
									{BITRATES.map((b) => (
										<option key={b} value={b}>
											{b} kbps
										</option>
									))}
								</select>
							</div>
						)}
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<label className="flex items-center gap-1.5 text-sm text-foreground">
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
									className="w-40 rounded-md border border-border bg-background p-2 text-sm text-foreground"
								>
									{SAMPLE_RATES.map((rate) => (
										<option key={rate} value={rate}>
											{rate} Hz
										</option>
									))}
								</select>
							</div>
						)}

						<label className="flex items-center gap-1.5 text-sm text-foreground">
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
									className="w-32"
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
									className="w-32"
								/>
							</div>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Button type="button" size="sm" onClick={handleConvert} disabled={processing}>
							{messages.convertButton}
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={handleClear}>
							{messages.clear}
						</Button>
						{processing && stage === 'decoding' && (
							<p role="status" className="text-xs text-muted-foreground">{messages.decodingLabel}</p>
						)}
						{processing && stage === 'encoding' && (
							<p role="status" className="text-xs text-muted-foreground">
								{messages.encodingLabel.replace('{{percent}}', String(progress))}
							</p>
						)}
					</div>

					{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
					{channelCount !== null && (
						<p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-300">
							{messages.channelDownmixWarning.replace('{{count}}', String(channelCount))}
						</p>
					)}

					{resultUrl && (
						<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
							<label className="text-sm font-medium text-foreground">{messages.resultLabel}</label>
							{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
							<audio src={resultUrl} controls className="w-full max-w-xl" />
							<div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
								<span>
									{messages.originalLabel}:{' '}
									{messages.sizeAndDuration
										.replace('{{size}}', formatBytes(audioFile.size))
										.replace('{{duration}}', formatDuration(resultDuration ?? 0))}
								</span>
								<span>
									{messages.convertedLabel}:{' '}
									{messages.sizeAndDuration
										.replace('{{size}}', formatBytes(resultSize ?? 0))
										.replace('{{duration}}', formatDuration(resultDuration ?? 0))}
								</span>
							</div>
							<div>
								<Button type="button" size="sm" onClick={handleDownload}>
									{messages.download}
								</Button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
