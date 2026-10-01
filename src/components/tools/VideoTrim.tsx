import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { baseNameOf } from '@/lib/file-utils';
import { isVideoFile, safeVideoExt } from '@/lib/media-ext';
import {
	DEFAULT_CRF,
	GIF_FPS_OPTIONS,
	GIF_WIDTH_OPTIONS,
	HEIGHT_OPTIONS,
	MAX_SEGMENTS,
	MIN_SEGMENT_GAP,
	MP3_BITRATE_OPTIONS,
	SPEED_OPTIONS,
	buildConcatArgs,
	buildConcatList,
	buildGifArgs,
	buildMp3Args,
	buildSegmentArgs,
	effectiveMode,
	frameStepSeconds,
	needsReencode,
	nextSegment,
	outputExtension,
	segmentsValid,
	thumbnailTimes,
	totalSegmentsDuration,
	type OutputKind,
	type Segment,
	type VideoOptions,
} from '@/lib/video-ffmpeg';

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
	notVideoError: string;
	largeFileWarning: string;
	outputFormatLabel: string;
	outputVideo: string;
	outputGif: string;
	outputMp3: string;
	gifFpsLabel: string;
	gifWidthLabel: string;
	mp3BitrateLabel: string;
	mp3Note: string;
	advancedLabel: string;
	muteLabel: string;
	speedLabel: string;
	resolutionLabel: string;
	resolutionOriginal: string;
	crfLabel: string;
	crfHint: string;
	forcePreciseNote: string;
	segmentsLabel: string;
	addSegment: string;
	removeSegment: string;
	segmentButton: string;
	segmentsTotal: string;
	segmentsMax: string;
	stepBackFrame: string;
	stepForwardFrame: string;
	frameStepHint: string;
	makeGifButton: string;
	extractMp3Button: string;
	processingStepLabel: string;
	resultGifAlt: string;
}

type Mode = 'fast' | 'precise';
type EngineState = 'idle' | 'loading' | 'ready' | 'error';
type SegmentTarget = Segment & { id: number };

const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds)) return '0:00.0';
	const m = Math.floor(seconds / 60);
	const s = seconds - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

const MIN_SELECTION_GAP = MIN_SEGMENT_GAP;
const THUMB_COUNT = 12;
// ffmpeg.wasm nạp toàn bộ file vào bộ nhớ WASM (giới hạn ~2GB, tab dễ crash sớm hơn): cảnh báo từ 1GB.
const LARGE_FILE_WARNING_BYTES = 1024 * 1024 * 1024;

// A Clideo-style dual-handle scrubber: drag either handle to set the trim start/end
// directly on a visual timeline instead of two separate, disconnected range inputs.
// Pointer capture (not document-level listeners) keeps dragging reliable even when the
// cursor moves outside the track, and works identically for mouse and touch input.
function TrimTimeline({
	duration,
	start,
	end,
	others,
	thumbs,
	onStartChange,
	onEndChange,
	startAriaLabel,
	endAriaLabel,
}: {
	duration: number;
	start: number;
	end: number;
	others: Segment[];
	thumbs: string[];
	onStartChange: (value: number) => void;
	onEndChange: (value: number) => void;
	startAriaLabel: string;
	endAriaLabel: string;
}) {
	const trackRef = useRef<HTMLDivElement>(null);

	const timeFromClientX = (clientX: number): number => {
		const track = trackRef.current;
		if (!track || duration <= 0) return 0;
		const rect = track.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return ratio * duration;
	};

	const beginDrag = (which: 'start' | 'end') => (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		const handle = event.currentTarget;
		handle.setPointerCapture(event.pointerId);

		const onMove = (moveEvent: PointerEvent) => {
			const time = timeFromClientX(moveEvent.clientX);
			if (which === 'start') onStartChange(Math.min(time, end - MIN_SELECTION_GAP));
			else onEndChange(Math.max(time, start + MIN_SELECTION_GAP));
		};
		// Kết thúc kéo cả khi pointer bị huỷ (cuộc gọi đến, cử chỉ hệ thống) hoặc mất capture,
		// nếu không listener mồ côi sẽ tiếp tục đổi start/end.
		const onUp = () => {
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
			handle.removeEventListener('lostpointercapture', onUp);
		};
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
		handle.addEventListener('lostpointercapture', onUp);
	};

	const handleKeyDown = (which: 'start' | 'end') => (event: React.KeyboardEvent) => {
		const step = event.shiftKey ? 5 : 0.5;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const delta = event.key === 'ArrowLeft' ? -step : step;
			if (which === 'start') onStartChange(Math.min(Math.max(0, start + delta), end - MIN_SELECTION_GAP));
			else onEndChange(Math.max(Math.min(duration, end + delta), start + MIN_SELECTION_GAP));
		} else if (event.key === 'Home') {
			event.preventDefault();
			if (which === 'start') onStartChange(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			if (which === 'end') onEndChange(duration);
		}
	};

	const startPct = duration > 0 ? (start / duration) * 100 : 0;
	const endPct = duration > 0 ? (end / duration) * 100 : 100;

	return (
		<div ref={trackRef} className="relative h-12 w-full touch-none select-none overflow-visible rounded-md bg-muted">
			{thumbs.length > 0 && (
				<div className="absolute inset-0 flex overflow-hidden rounded-md opacity-70" aria-hidden="true">
					{thumbs.map((src, i) => (
						<img key={i} src={src} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />
					))}
				</div>
			)}
			{others.map((seg, i) => (
				<div
					key={i}
					aria-hidden="true"
					className="absolute inset-y-0 rounded-md border border-primary/40 bg-primary/10"
					style={{ left: `${(seg.start / Math.max(duration, 0.001)) * 100}%`, width: `${((seg.end - seg.start) / Math.max(duration, 0.001)) * 100}%` }}
				/>
			))}
			<div
				className="absolute inset-y-0 rounded-md bg-primary/30"
				style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
			/>
			<div
				role="slider"
				aria-label={startAriaLabel}
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={start}
				tabIndex={0}
				onPointerDown={beginDrag('start')}
				onKeyDown={handleKeyDown('start')}
				className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize rounded-sm bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
				style={{ left: `${startPct}%` }}
			/>
			<div
				role="slider"
				aria-label={endAriaLabel}
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={end}
				tabIndex={0}
				onPointerDown={beginDrag('end')}
				onKeyDown={handleKeyDown('end')}
				className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize rounded-sm bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
				style={{ left: `${endPct}%` }}
			/>
		</div>
	);
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

const selectClass = 'min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground';

export default function VideoTrim({ messages }: { messages: Messages }) {
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [duration, setDuration] = useState<number | null>(null);
	const [metadataFailed, setMetadataFailed] = useState(false);
	// One or more clips to keep; the timeline edits the active one.
	const [segments, setSegments] = useState<SegmentTarget[]>([{ id: 1, start: 0, end: 0 }]);
	const [activeId, setActiveId] = useState(1);
	const [mode, setMode] = useState<Mode>('fast');
	const [outputKind, setOutputKind] = useState<OutputKind>('video');
	const [mute, setMute] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [height, setHeight] = useState(0);
	const [crf, setCrf] = useState(DEFAULT_CRF);
	const [gifFps, setGifFps] = useState(10);
	const [gifWidth, setGifWidth] = useState(480);
	const [mp3Bitrate, setMp3Bitrate] = useState(192);
	const [thumbs, setThumbs] = useState<string[]>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const [engineState, setEngineState] = useState<EngineState>('idle');
	const [processing, setProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [stepInfo, setStepInfo] = useState<{ current: number; total: number } | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [resultSize, setResultSize] = useState<number | null>(null);
	const [resultDuration, setResultDuration] = useState<number | null>(null);
	const [resultKind, setResultKind] = useState<OutputKind>('video');
	// Đuôi + tên tải về chốt lúc tạo kết quả (mode có thể đổi sau đó mà kết quả cũ không đổi).
	const [resultFileName, setResultFileName] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const videoRef = useRef<HTMLVideoElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const ffmpegRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null);
	// Tăng mỗi lần Clear / đổi file / unmount: tác vụ trim đang chạy so sánh token để biết kết quả đã cũ.
	const runTokenRef = useRef(0);
	const videoUrlRef = useRef<string | null>(null);
	const resultUrlRef = useRef<string | null>(null);
	const stepRef = useRef({ index: 0, total: 1 });
	const nextIdRef = useRef(2);
	videoUrlRef.current = videoUrl;
	resultUrlRef.current = resultUrl;

	const activeIndex = Math.max(
		0,
		segments.findIndex((s) => s.id === activeId),
	);
	const active = segments[activeIndex] ?? segments[0];
	const start = active.start;
	const end = active.end;

	const updateActive = (patch: Partial<Segment>) =>
		setSegments((prev) => prev.map((s, i) => (i === activeIndex ? { ...s, ...patch } : s)));
	const setStart = (value: number) => updateActive({ start: value });
	const setEnd = (value: number) => updateActive({ end: value });

	const options: VideoOptions = { mode, mute, speed, height, crf };
	const forcedPrecise = mode === 'fast' && needsReencode(options);

	const terminateFfmpeg = () => {
		try {
			ffmpegRef.current?.terminate();
		} catch {
			/* đã dừng */
		}
		ffmpegRef.current = null;
		setEngineState('idle');
	};

	useEffect(() => {
		return () => {
			runTokenRef.current++;
			try {
				ffmpegRef.current?.terminate();
			} catch {
				/* đã dừng */
			}
			ffmpegRef.current = null;
			if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
			if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
		};
	}, []);

	// Thumbnail strip for the timeline: seek a hidden <video> to evenly spaced times and snapshot each frame.
	useEffect(() => {
		if (!videoUrl || !duration) {
			setThumbs([]);
			return;
		}
		let cancelled = false;
		const video = document.createElement('video');
		video.muted = true;
		video.preload = 'auto';
		video.playsInline = true;
		video.src = videoUrl;
		const canvas = document.createElement('canvas');
		const frames: string[] = [];
		const waitFor = (target: EventTarget, name: string) =>
			new Promise<boolean>((resolve) => {
				const timer = setTimeout(() => resolve(false), 2500);
				target.addEventListener(
					name,
					() => {
						clearTimeout(timer);
						resolve(true);
					},
					{ once: true },
				);
			});
		void (async () => {
			try {
				if (video.readyState < 1 && !(await waitFor(video, 'loadedmetadata'))) return;
				const aspect = video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
				canvas.height = 48;
				canvas.width = Math.max(16, Math.round(48 * aspect));
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				for (const t of thumbnailTimes(duration, THUMB_COUNT)) {
					if (cancelled) return;
					const seeked = waitFor(video, 'seeked');
					video.currentTime = t;
					if (!(await seeked)) return;
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					frames.push(canvas.toDataURL('image/jpeg', 0.55));
				}
				if (!cancelled) setThumbs(frames);
			} catch {
				/* thumbnails are decorative; ignore decode/seek failures */
			}
		})();
		return () => {
			cancelled = true;
			video.removeAttribute('src');
			video.load();
		};
	}, [videoUrl, duration]);

	const loadFile = (file: File) => {
		// File mới: huỷ tác vụ cũ (nếu có) để kết quả cũ không hiện cạnh file mới.
		if (processing) terminateFfmpeg();
		runTokenRef.current++;
		setProcessing(false);
		setResultFileName(null);
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		setError(null);
		setMetadataFailed(false);
		setDuration(null);
		setThumbs([]);
		setSegments([{ id: 1, start: 0, end: 0 }]);
		setActiveId(1);
		setVideoFile(file);
		setVideoUrl(URL.createObjectURL(file));
	};

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		if (!isVideoFile(file)) {
			setError(messages.notVideoError);
			return;
		}
		loadFile(file);
	};

	const resetSegments = (total: number) => {
		setSegments([{ id: 1, start: 0, end: total }]);
		setActiveId(1);
	};

	const handleLoadedMetadata = () => {
		const video = videoRef.current;
		if (!video || !Number.isFinite(video.duration)) {
			setMetadataFailed(true);
			return;
		}
		setDuration(video.duration);
		resetSegments(video.duration);
	};

	const selectionDuration = useMemo(() => Math.max(0, end - start), [start, end]);
	const totalKept = useMemo(() => totalSegmentsDuration(segments), [segments]);

	const handleAddSegment = () => {
		if (!duration) return;
		const next = nextSegment(segments, duration);
		if (!next) return;
		const id = nextIdRef.current++;
		setSegments((prev) => [...prev, { id, ...next }]);
		setActiveId(id);
	};

	const handleRemoveSegment = (id: number) => {
		if (segments.length <= 1) return;
		const remaining = segments.filter((s) => s.id !== id);
		setSegments(remaining);
		if (id === activeId) setActiveId(remaining[0].id);
	};

	const stepFrame = (direction: 1 | -1) => {
		const video = videoRef.current;
		if (!video) return;
		video.pause();
		video.currentTime = Math.min(Math.max(0, video.currentTime + direction * frameStepSeconds()), duration ?? video.duration);
	};

	const ensureFfmpeg = async () => {
		if (ffmpegRef.current && engineState === 'ready') return ffmpegRef.current;
		setEngineState('loading');
		try {
			const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
			const ffmpeg = new FFmpeg();
			ffmpeg.on('progress', ({ progress: p }) => {
				const { index, total } = stepRef.current;
				const within = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
				setProgress(Math.min(100, Math.round(((index + within) / total) * 100)));
			});
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

	const handleProcess = async () => {
		if (!videoFile || duration === null) return;
		const segs: Segment[] = segments.map(({ start: s, end: e }) => ({ start: s, end: e }));
		if (!segmentsValid(segs, duration)) {
			setError(messages.invalidRangeError);
			return;
		}
		const token = ++runTokenRef.current;
		const isStale = () => token !== runTokenRef.current;
		const kind = outputKind;
		setError(null);
		setProcessing(true);
		setProgress(0);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		setResultFileName(null);
		let ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg | null = null;
		const created: string[] = [];
		try {
			ffmpeg = await ensureFfmpeg();
			if (!ffmpeg || isStale()) return;
			const { fetchFile } = await import('@ffmpeg/util');
			if (isStale()) return;
			// Đuôi qua whitelist/mime: tên không có đuôi hoặc đuôi lạ không làm hỏng tên file ảo của ffmpeg.
			const ext = safeVideoExt(videoFile);
			const inputName = `input.${ext}`;
			created.push(inputName);
			await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
			if (isStale()) return;

			const multi = segs.length > 1;
			const outExt = outputExtension(kind, ext, options);
			const outputName = `output.${outExt}`;
			created.push(outputName);

			// Steps: [N segment cuts] + [concat if N>1] + [final GIF/MP3 conversion]. A single-segment GIF/MP3 is one step.
			const needsFinal = kind !== 'video';
			const segExt = kind === 'video' ? (effectiveMode(options) === 'fast' ? ext : 'mp4') : 'mp4';
			const cutSteps = kind === 'video' || multi ? segs.length : 0;
			const total = cutSteps + (multi ? 1 : 0) + (needsFinal ? 1 : 0) || 1;
			stepRef.current = { index: 0, total };
			let stepCounter = 0;
			const run = async (args: string[]) => {
				stepRef.current = { index: stepCounter, total };
				setStepInfo({ current: stepCounter + 1, total });
				const code = await ffmpeg!.exec(args);
				if (isStale()) throw new Error('stale');
				if (code !== 0) throw new Error('ffmpeg exec failed');
				stepCounter++;
			};

			// Intermediate cuts. For GIF/MP3 these are always re-encoded so the final filter sees one clean clip.
			const cutOptions: VideoOptions =
				kind === 'video' ? options : { mode: 'precise', mute: false, speed: 1, height: 0, crf: 18 };
			let mergedName: string | null = null;
			if (cutSteps > 0) {
				const names: string[] = [];
				for (let i = 0; i < segs.length; i++) {
					const name = `seg${i}.${segExt}`;
					created.push(name);
					names.push(name);
					await run(buildSegmentArgs(inputName, name, segs[i], cutOptions));
				}
				if (multi) {
					await ffmpeg.writeFile('list.txt', new TextEncoder().encode(buildConcatList(names)));
					created.push('list.txt');
					mergedName = kind === 'video' ? outputName : `merged.${segExt}`;
					if (kind !== 'video') created.push(mergedName);
					await run(buildConcatArgs('list.txt', mergedName));
				} else {
					mergedName = names[0];
				}
			}

			if (kind === 'video') {
				// mergedName is the final file; single segment keeps its own name, so read it directly.
			} else {
				const src = mergedName ? { input: mergedName } : { input: inputName, cut: segs[0] };
				await run(
					kind === 'gif'
						? buildGifArgs(src, { fps: gifFps, width: gifWidth, speed }, outputName)
						: buildMp3Args(src, { bitrate: mp3Bitrate, speed }, outputName),
				);
			}

			const finalName = kind === 'video' ? (mergedName as string) : outputName;
			const data = await ffmpeg.readFile(finalName);
			if (isStale()) return;
			const mime =
				kind === 'gif'
					? 'image/gif'
					: kind === 'mp3'
						? 'audio/mpeg'
						: effectiveMode(options) === 'fast'
							? videoFile.type || 'video/mp4'
							: 'video/mp4';
			const blob = new Blob([data as Uint8Array], { type: mime });
			setResultUrl(URL.createObjectURL(blob));
			setResultSize(blob.size);
			setResultDuration(totalSegmentsDuration(segs) / speed);
			setResultKind(kind);
			setResultFileName(`${baseNameOf(videoFile.name, 'video')}-${kind === 'video' ? 'trimmed' : kind}.${outExt}`);
		} catch {
			// Clear/đổi file đã terminate ffmpeg nên exec bị reject: không hiện lỗi cho tác vụ đã bị huỷ.
			if (!isStale()) {
				setError(messages.trimError);
				// A failed/crashed wasm instance can stay corrupted: drop it so the next attempt loads a fresh engine.
				terminateFfmpeg();
			}
		} finally {
			// Dọn file ảo trong FS của ffmpeg dù thành công, lỗi hay bị huỷ (tránh rò rỉ bộ nhớ WASM).
			if (ffmpeg && ffmpegRef.current === ffmpeg) {
				for (const name of created) await ffmpeg.deleteFile(name).catch(() => {});
			}
			if (!isStale()) {
				setProcessing(false);
				setStepInfo(null);
			}
		}
	};

	const handleClear = () => {
		// Huỷ tác vụ đang chạy + dừng worker ffmpeg thật sự (không chỉ ẩn kết quả).
		runTokenRef.current++;
		if (processing) terminateFfmpeg();
		setProcessing(false);
		setStepInfo(null);
		setResultFileName(null);
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setVideoFile(null);
		setVideoUrl(null);
		setDuration(null);
		setMetadataFailed(false);
		setThumbs([]);
		setSegments([{ id: 1, start: 0, end: 0 }]);
		setActiveId(1);
		setResultUrl(null);
		setResultSize(null);
		setResultDuration(null);
		setError(null);
	};

	const handleDownload = () => {
		if (!resultUrl || !videoFile) return;
		const link = document.createElement('a');
		link.href = resultUrl;
		link.download = resultFileName ?? 'trimmed.mp4';
		link.click();
	};

	const effectiveDuration = duration ?? 0;
	const actionLabel = outputKind === 'gif' ? messages.makeGifButton : outputKind === 'mp3' ? messages.extractMp3Button : messages.trimButton;

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
					<label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-0">
						{messages.chooseFile}
						<input
							id="video-trim-file-input"
							ref={fileInputRef}
							type="file"
							accept="video/*"
							className="sr-only"
							onChange={(e) => {
								handleFile(e.target.files);
								e.target.value = '';
							}}
						/>
					</label>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
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
						{duration !== null && (
							<div className="flex flex-wrap items-center gap-2">
								<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => stepFrame(-1)}>
									{messages.stepBackFrame}
								</Button>
								<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => stepFrame(1)}>
									{messages.stepForwardFrame}
								</Button>
								<span className="text-xs text-muted-foreground">{messages.frameStepHint}</span>
							</div>
						)}
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
										resetSegments(value);
									}
								}}
							/>
						</div>
					)}

					{duration !== null && (
						<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
							<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
								<span>
									{messages.startLabel}: {formatTime(start)} · {messages.endLabel}: {formatTime(end)}
								</span>
								<div className="flex gap-2">
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => videoRef.current && setStart(Math.min(videoRef.current.currentTime, end - MIN_SELECTION_GAP))}
									>
										{messages.startLabel}: {messages.markCurrent}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => videoRef.current && setEnd(Math.max(videoRef.current.currentTime, start + MIN_SELECTION_GAP))}
									>
										{messages.endLabel}: {messages.markCurrent}
									</Button>
								</div>
							</div>
							<TrimTimeline
								duration={effectiveDuration}
								start={start}
								end={end}
								others={segments.filter((s) => s.id !== active.id)}
								thumbs={thumbs}
								onStartChange={setStart}
								onEndChange={setEnd}
								startAriaLabel={messages.startLabel}
								endAriaLabel={messages.endLabel}
							/>
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span>0:00.0</span>
								<span>{formatTime(effectiveDuration)}</span>
							</div>
							<p className="text-xs text-muted-foreground">
								{messages.selectionLabel.replace('{{duration}}', formatTime(selectionDuration))}
							</p>

							<div className="flex flex-col gap-2 border-t border-border pt-3">
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-sm font-medium text-foreground">{messages.segmentsLabel}</span>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="min-h-9"
										onClick={handleAddSegment}
										disabled={segments.length >= MAX_SEGMENTS}
									>
										{messages.addSegment}
									</Button>
									{segments.length >= MAX_SEGMENTS && (
										<span className="text-xs text-muted-foreground">{messages.segmentsMax.replace('{{max}}', String(MAX_SEGMENTS))}</span>
									)}
								</div>
								<ul className="flex flex-col gap-1.5">
									{segments.map((seg, i) => (
										<li key={seg.id} className="flex items-center gap-2">
											<Button
												type="button"
												size="sm"
												variant={seg.id === active.id ? 'default' : 'outline'}
												aria-pressed={seg.id === active.id}
												className="min-h-9 flex-1 justify-start"
												onClick={() => setActiveId(seg.id)}
											>
												{messages.segmentButton
													.replace('{{index}}', String(i + 1))
													.replace('{{start}}', formatTime(seg.start))
													.replace('{{end}}', formatTime(seg.end))}
											</Button>
											{segments.length > 1 && (
												<Button
													type="button"
													size="sm"
													variant="ghost"
													className="min-h-9"
													aria-label={`${messages.removeSegment} ${i + 1}`}
													onClick={() => handleRemoveSegment(seg.id)}
												>
													{messages.removeSegment}
												</Button>
											)}
										</li>
									))}
								</ul>
								{segments.length > 1 && (
									<p className="text-xs text-muted-foreground">{messages.segmentsTotal.replace('{{duration}}', formatTime(totalKept))}</p>
								)}
							</div>
						</div>
					)}

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-sm font-medium text-foreground">{messages.outputFormatLabel}</span>
							<div className="flex flex-wrap gap-2">
								{(
									[
										['video', messages.outputVideo],
										['gif', messages.outputGif],
										['mp3', messages.outputMp3],
									] as const
								).map(([kind, label]) => (
									<Button
										key={kind}
										type="button"
										size="sm"
										className="min-h-9"
										variant={outputKind === kind ? 'default' : 'outline'}
										aria-pressed={outputKind === kind}
										onClick={() => setOutputKind(kind)}
									>
										{label}
									</Button>
								))}
							</div>
						</div>

						{outputKind === 'video' && (
							<div className="flex flex-col gap-2">
								<div className="flex gap-2">
									<Button type="button" size="sm" className="min-h-9" variant={mode === 'fast' ? 'default' : 'outline'} aria-pressed={mode === 'fast'} onClick={() => setMode('fast')}>
										{messages.fastModeLabel}
									</Button>
									<Button type="button" size="sm" className="min-h-9" variant={mode === 'precise' ? 'default' : 'outline'} aria-pressed={mode === 'precise'} onClick={() => setMode('precise')}>
										{messages.preciseModeLabel}
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">{messages.modeHint}</p>
								{forcedPrecise && <p className="text-xs text-amber-700 dark:text-amber-400">{messages.forcePreciseNote}</p>}
							</div>
						)}

						{outputKind === 'gif' && (
							<div className="flex flex-wrap items-end gap-4">
								<label className="flex flex-col gap-1 text-xs text-muted-foreground">
									{messages.gifFpsLabel}
									<select className={selectClass} value={gifFps} onChange={(e) => setGifFps(Number(e.target.value))}>
										{GIF_FPS_OPTIONS.map((f) => (
											<option key={f} value={f}>
												{f} fps
											</option>
										))}
									</select>
								</label>
								<label className="flex flex-col gap-1 text-xs text-muted-foreground">
									{messages.gifWidthLabel}
									<select className={selectClass} value={gifWidth} onChange={(e) => setGifWidth(Number(e.target.value))}>
										{GIF_WIDTH_OPTIONS.map((w) => (
											<option key={w} value={w}>
												{w}px
											</option>
										))}
									</select>
								</label>
							</div>
						)}

						{outputKind === 'mp3' && (
							<div className="flex flex-col gap-1.5">
								<label className="flex flex-col gap-1 text-xs text-muted-foreground">
									{messages.mp3BitrateLabel}
									<select className={`${selectClass} w-fit`} value={mp3Bitrate} onChange={(e) => setMp3Bitrate(Number(e.target.value))}>
										{MP3_BITRATE_OPTIONS.map((b) => (
											<option key={b} value={b}>
												{b} kbps
											</option>
										))}
									</select>
								</label>
								<p className="text-xs text-muted-foreground">{messages.mp3Note}</p>
							</div>
						)}

						<details className="rounded-md border border-border p-3">
							<summary className="min-h-9 cursor-pointer text-sm font-medium text-foreground">{messages.advancedLabel}</summary>
							<div className="mt-3 flex flex-wrap items-end gap-4">
								{outputKind === 'video' && (
									<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
										<input type="checkbox" className="size-4" checked={mute} onChange={(e) => setMute(e.target.checked)} />
										{messages.muteLabel}
									</label>
								)}
								<label className="flex flex-col gap-1 text-xs text-muted-foreground">
									{messages.speedLabel}
									<select className={selectClass} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
										{SPEED_OPTIONS.map((s) => (
											<option key={s} value={s}>
												{s}x
											</option>
										))}
									</select>
								</label>
								{outputKind === 'video' && (
									<>
										<label className="flex flex-col gap-1 text-xs text-muted-foreground">
											{messages.resolutionLabel}
											<select className={selectClass} value={height} onChange={(e) => setHeight(Number(e.target.value))}>
												{HEIGHT_OPTIONS.map((h) => (
													<option key={h} value={h}>
														{h === 0 ? messages.resolutionOriginal : `${h}p`}
													</option>
												))}
											</select>
										</label>
										<label className="flex flex-col gap-1 text-xs text-muted-foreground">
											{messages.crfLabel.replace('{{value}}', String(crf))}
											<input
												type="range"
												min={18}
												max={35}
												step={1}
												value={crf}
												disabled={effectiveMode(options) === 'fast'}
												onChange={(e) => setCrf(Number(e.target.value))}
												className="h-9 w-40"
											/>
										</label>
									</>
								)}
							</div>
							{outputKind === 'video' && <p className="mt-2 text-xs text-muted-foreground">{messages.crfHint}</p>}
						</details>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Button type="button" size="sm" className="min-h-9" onClick={handleProcess} disabled={processing || duration === null}>
							{actionLabel}
						</Button>
						<Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={handleClear}>
							{messages.clear}
						</Button>
						{engineState === 'loading' && (
							<p role="status" className="text-xs text-muted-foreground">{messages.loadingEngineLabel}</p>
						)}
						{processing && engineState === 'ready' && (
							<p role="status" className="text-xs text-muted-foreground">
								{stepInfo && stepInfo.total > 1
									? messages.processingStepLabel
											.replace('{{current}}', String(stepInfo.current))
											.replace('{{total}}', String(stepInfo.total))
											.replace('{{percent}}', String(progress))
									: messages.processingLabel.replace('{{percent}}', String(progress))}
							</p>
						)}
					</div>

					{videoFile.size > LARGE_FILE_WARNING_BYTES && (
						<p
							role="alert"
							className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
						>
							{messages.largeFileWarning.replace('{{size}}', formatBytes(videoFile.size))}
						</p>
					)}

					{error && <p role="alert" className="text-sm text-destructive">{error}</p>}

					{resultUrl && (
						<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
							<label className="text-sm font-medium text-foreground">{messages.resultLabel}</label>
							{resultKind === 'video' && (
								<video src={resultUrl} controls className="w-full max-w-2xl rounded-md border border-border bg-black" />
							)}
							{resultKind === 'gif' && (
								<img src={resultUrl} alt={messages.resultGifAlt} className="max-h-96 w-auto max-w-full rounded-md border border-border" />
							)}
							{resultKind === 'mp3' && <audio src={resultUrl} controls className="w-full max-w-2xl" />}
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
								<Button type="button" size="sm" className="min-h-9" onClick={handleDownload}>
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
