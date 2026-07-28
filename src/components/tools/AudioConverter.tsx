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
}

type OutputFormat = 'mp3' | 'wav';

const BITRATES = [128, 192, 256, 320];

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
			const channels: Float32Array[] = [];
			for (let i = 0; i < audioBuffer.numberOfChannels; i++) channels.push(audioBuffer.getChannelData(i).slice());
			const sampleRate = audioBuffer.sampleRate;
			const duration = audioBuffer.duration;

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

					<div className="flex flex-wrap items-center gap-3">
						<Button type="button" size="sm" onClick={handleConvert} disabled={processing}>
							{messages.convertButton}
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={handleClear}>
							{messages.clear}
						</Button>
						{processing && stage === 'decoding' && <p className="text-xs text-muted-foreground">{messages.decodingLabel}</p>}
						{processing && stage === 'encoding' && (
							<p className="text-xs text-muted-foreground">{messages.encodingLabel.replace('{{percent}}', String(progress))}</p>
						)}
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

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
