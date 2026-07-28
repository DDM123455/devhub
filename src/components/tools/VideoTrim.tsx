import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Messages {
	dropLabel: string;
	chooseFile: string;
	previewLabel: string;
	startLabel: string;
	endLabel: string;
	markCurrent: string;
	selectionLabel: string;
	fastModeLabel: string;
	preciseModeLabel: string;
	modeHint: string;
	trimButton: string;
	loadingEngineLabel: string;
	processingLabel: string;
	resultLabel: string;
	download: string;
	originalLabel: string;
	trimmedLabel: string;
	sizeAndDuration: string;
	clear: string;
	invalidRangeError: string;
	engineLoadError: string;
	trimError: string;
	metadataError: string;
	manualDurationLabel: string;
}

type Mode = 'fast' | 'precise';
type EngineState = 'idle' | 'loading' | 'ready' | 'error';

const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds)) return '0:00.0';
	const m = Math.floor(seconds / 60);
	const s = seconds - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, '0')}`;
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

export default function VideoTrim({ messages }: { messages: Messages }) {
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [duration, setDuration] = useState<number | null>(null);
	const [metadataFailed, setMetadataFailed] = useState(false);
	const [start, setStart] = useState(0);
	const [end, setEnd] = useState(0);
	const [mode, setMode] = useState<Mode>('fast');
	const [isDragOver, setIsDragOver] = useState(false);
	const [engineState, setEngineState] = useState<EngineState>('idle');
	const [processing, setProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [resultSize, setResultSize] = useState<number | null>(null);
	const [resultDuration, setResultDuration] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const ffmpegRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null);

	useEffect(() => {
		return () => {
			if (videoUrl) URL.revokeObjectURL(videoUrl);
			if (resultUrl) URL.revokeObjectURL(resultUrl);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const loadFile = (file: File) => {
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		setError(null);
		setMetadataFailed(false);
		setDuration(null);
		setVideoFile(file);
		setVideoUrl(URL.createObjectURL(file));
	};

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (file) loadFile(file);
	};

	const handleLoadedMetadata = () => {
		const video = videoRef.current;
		if (!video || !Number.isFinite(video.duration)) {
			setMetadataFailed(true);
			return;
		}
		setDuration(video.duration);
		setStart(0);
		setEnd(video.duration);
	};

	const selectionDuration = useMemo(() => Math.max(0, end - start), [start, end]);

	const ensureFfmpeg = async () => {
		if (ffmpegRef.current && engineState === 'ready') return ffmpegRef.current;
		setEngineState('loading');
		try {
			const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
			const ffmpeg = new FFmpeg();
			ffmpeg.on('progress', ({ progress: p }) => setProgress(Math.min(100, Math.max(0, Math.round(p * 100)))));
			// Note: intentionally not using toBlobURL's `progress` option here — it calls
			// downloadWithProgress, which throws when a CDN serves the core .js gzip/br-compressed
			// (declared Content-Length is the compressed size, so it never matches the decompressed
			// byte count read from the stream), then tries to re-read the already-consumed Response
			// body and crashes with "body stream already read". Plain toBlobURL avoids that path.
			const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
			const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
			await ffmpeg.load({ coreURL, wasmURL });
			ffmpegRef.current = ffmpeg;
			setEngineState('ready');
			return ffmpeg;
		} catch {
			setEngineState('error');
			setError(messages.engineLoadError);
			return null;
		}
	};

	const handleTrim = async () => {
		if (!videoFile) return;
		if (end <= start) {
			setError(messages.invalidRangeError);
			return;
		}
		setError(null);
		setProcessing(true);
		setProgress(0);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		try {
			const ffmpeg = await ensureFfmpeg();
			if (!ffmpeg) return;
			const { fetchFile } = await import('@ffmpeg/util');
			const ext = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
			const inputName = `input.${ext}`;
			const outputName = mode === 'fast' ? `output.${ext}` : 'output.mp4';
			await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
			const clipDuration = (end - start).toFixed(3);
			const args =
				mode === 'fast'
					? ['-ss', start.toFixed(3), '-i', inputName, '-t', clipDuration, '-c', 'copy', '-avoid_negative_ts', 'make_zero', outputName]
					: [
							'-ss',
							start.toFixed(3),
							'-i',
							inputName,
							'-t',
							clipDuration,
							'-c:v',
							'libx264',
							'-preset',
							'ultrafast',
							'-c:a',
							'aac',
							outputName,
						];
			const exitCode = await ffmpeg.exec(args);
			if (exitCode !== 0) throw new Error('ffmpeg exec failed');
			const data = await ffmpeg.readFile(outputName);
			const blob = new Blob([data as Uint8Array], { type: mode === 'fast' ? videoFile.type || 'video/mp4' : 'video/mp4' });
			setResultUrl(URL.createObjectURL(blob));
			setResultSize(blob.size);
			setResultDuration(end - start);
			await ffmpeg.deleteFile(inputName).catch(() => {});
			await ffmpeg.deleteFile(outputName).catch(() => {});
		} catch {
			setError(messages.trimError);
		} finally {
			setProcessing(false);
		}
	};

	const handleClear = () => {
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setVideoFile(null);
		setVideoUrl(null);
		setDuration(null);
		setMetadataFailed(false);
		setStart(0);
		setEnd(0);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		setError(null);
	};

	const handleDownload = () => {
		if (!resultUrl || !videoFile) return;
		const ext = mode === 'fast' ? videoFile.name.split('.').pop()?.toLowerCase() || 'mp4' : 'mp4';
		const link = document.createElement('a');
		link.href = resultUrl;
		link.download = `trimmed.${ext}`;
		link.click();
	};

	const effectiveDuration = duration ?? 0;

	return (
		<div className="flex flex-col gap-4">
			{!videoFile && (
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
						htmlFor="video-trim-file-input"
						className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
					>
						{messages.chooseFile}
					</label>
					<input
						id="video-trim-file-input"
						ref={fileInputRef}
						type="file"
						accept="video/*"
						className="hidden"
						onChange={(e) => handleFile(e.target.files)}
					/>
				</div>
			)}

			{videoFile && videoUrl && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<label className="text-sm font-medium text-foreground">{messages.previewLabel}</label>
						<video
							ref={videoRef}
							src={videoUrl}
							controls
							onLoadedMetadata={handleLoadedMetadata}
							onError={() => setMetadataFailed(true)}
							className="w-full max-w-2xl rounded-md border border-border bg-black"
						/>
					</div>

					{metadataFailed && duration === null && (
						<div className="flex flex-col gap-1 rounded-md border border-border p-3">
							<p className="text-xs text-muted-foreground">{messages.metadataError}</p>
							<label htmlFor="video-trim-manual-duration" className="text-xs text-muted-foreground">
								{messages.manualDurationLabel}
							</label>
							<input
								id="video-trim-manual-duration"
								type="number"
								min={0}
								step={0.1}
								className="w-32 rounded-md border border-border bg-background p-2 text-sm text-foreground"
								onChange={(e) => {
									const value = Number(e.target.value);
									if (Number.isFinite(value) && value > 0) {
										setDuration(value);
										setStart(0);
										setEnd(value);
									}
								}}
							/>
						</div>
					)}

					{duration !== null && (
						<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{messages.startLabel}: {formatTime(start)}
									</span>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => videoRef.current && setStart(Math.min(videoRef.current.currentTime, end - 0.1))}
									>
										{messages.markCurrent}
									</Button>
								</div>
								<input
									type="range"
									min={0}
									max={effectiveDuration}
									step={0.1}
									value={start}
									onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.1))}
									className="w-full"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{messages.endLabel}: {formatTime(end)}
									</span>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => videoRef.current && setEnd(Math.max(videoRef.current.currentTime, start + 0.1))}
									>
										{messages.markCurrent}
									</Button>
								</div>
								<input
									type="range"
									min={0}
									max={effectiveDuration}
									step={0.1}
									value={end}
									onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.1))}
									className="w-full"
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								{messages.selectionLabel.replace('{{duration}}', formatTime(selectionDuration))}
							</p>
						</div>
					)}

					<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
						<div className="flex gap-2">
							<Button type="button" size="sm" variant={mode === 'fast' ? 'default' : 'outline'} onClick={() => setMode('fast')}>
								{messages.fastModeLabel}
							</Button>
							<Button type="button" size="sm" variant={mode === 'precise' ? 'default' : 'outline'} onClick={() => setMode('precise')}>
								{messages.preciseModeLabel}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">{messages.modeHint}</p>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Button type="button" size="sm" onClick={handleTrim} disabled={processing || duration === null}>
							{messages.trimButton}
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={handleClear}>
							{messages.clear}
						</Button>
						{engineState === 'loading' && <p className="text-xs text-muted-foreground">{messages.loadingEngineLabel}</p>}
						{processing && engineState === 'ready' && (
							<p className="text-xs text-muted-foreground">{messages.processingLabel.replace('{{percent}}', String(progress))}</p>
						)}
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					{resultUrl && (
						<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
							<label className="text-sm font-medium text-foreground">{messages.resultLabel}</label>
							<video src={resultUrl} controls className="w-full max-w-2xl rounded-md border border-border bg-black" />
							<div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
								<span>
									{messages.originalLabel}:{' '}
									{messages.sizeAndDuration
										.replace('{{size}}', formatBytes(videoFile.size))
										.replace('{{duration}}', formatTime(duration ?? 0))}
								</span>
								<span>
									{messages.trimmedLabel}:{' '}
									{messages.sizeAndDuration
										.replace('{{size}}', formatBytes(resultSize ?? 0))
										.replace('{{duration}}', formatTime(resultDuration ?? 0))}
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
