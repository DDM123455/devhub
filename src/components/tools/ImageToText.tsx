import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, RotateCcw, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { baseNameOf, dedupeName } from '@/lib/file-utils';
import { copyTextSafe } from '@/lib/safe-clipboard';
import { compressToUrlSafeBase64 } from '@/lib/hash-share';
import {
	buildLangParam,
	defaultOcrLanguages,
	DEFAULT_OCR_PSM,
	MAX_OCR_LANGUAGES,
	normalizeOcrLanguages,
	OCR_LANGUAGES,
	OCR_PSM_MODES,
	totalLanguageBytes,
	type OcrLanguage,
	type OcrPsm,
} from '@/lib/ocr-languages';
import {
	DEFAULT_PREPROCESS,
	rotateBy,
	type BinarizeMode,
	type PreprocessOptions,
} from '@/lib/ocr-preprocess';
import {
	collapseBlankLines,
	combineConfidence,
	countOcrStats,
	joinBrokenLines,
	mergedTxtName,
	mergeResultTexts,
	parsePageRange,
	unitTxtName,
	type MergeMode,
} from '@/lib/ocr-text';
import {
	canvasToBlob,
	decodeImageFile,
	isImageFile,
	isPdfFile,
	makePreviewBlob,
	MAX_IMAGE_BYTES,
	MAX_PDF_BYTES,
	OcrImageError,
	openPdfForOcr,
	renderForOcr,
	type OcrPdfHandle,
	type OcrSource,
} from '@/lib/ocr-image';
import type { OcrEngine, OcrProgress } from '@/lib/ocr-engine';
import ImageToTextResult, { type OcrResultItem, type ResultMessages } from './ImageToTextResult';

export interface ImageToTextMessages extends ResultMessages {
	selectFiles: string;
	dropHint: string;
	acceptedHint: string;
	filesHeading: string;
	removeFile: string;
	clearAll: string;
	skippedFiles: string;
	limitFiles: string;
	tooLargeFile: string;
	pdfPages: string;
	pdfRangeLabel: string;
	pdfRangePlaceholder: string;
	pdfRangeInvalid: string;
	pdfRangeOutOfRange: string;
	pdfLoading: string;
	pdfError: string;
	languagesLabel: string;
	languagesHint: string;
	addLanguage: string;
	removeLanguage: string;
	languageLimit: string;
	downloadSize: string;
	advancedTitle: string;
	psmLabel: string;
	psmHint: string;
	psm3: string;
	psm4: string;
	psm6: string;
	psm11: string;
	psm7: string;
	psm8: string;
	preserveSpaces: string;
	preprocessTitle: string;
	preprocessHint: string;
	grayscale: string;
	contrastLabel: string;
	binarizeLabel: string;
	binarizeOff: string;
	binarizeOtsu: string;
	binarizeAdaptive: string;
	binarizeFixed: string;
	thresholdLabel: string;
	invert: string;
	upscaleSmall: string;
	rotateLabel: string;
	rotateLeft: string;
	rotateRight: string;
	resetPreprocess: string;
	previewTitle: string;
	previewHint: string;
	previewLoading: string;
	previewUnavailable: string;
	extract: string;
	extracting: string;
	cancel: string;
	cancelling: string;
	cancelled: string;
	statusPreparing: string;
	statusLoadingEngine: string;
	statusLoadingLang: string;
	statusLoadingLangCached: string;
	statusInitializing: string;
	statusRecognizing: string;
	statusDone: string;
	resultsHeading: string;
	resultsSummary: string;
	copyAll: string;
	copyFailed: string;
	downloadAllTxt: string;
	downloadZip: string;
	zipping: string;
	separatorLabel: string;
	separatorBlank: string;
	separatorName: string;
	highlightLow: string;
	compareDiffOne: string;
	compareDiffTwo: string;
	compareTooLarge: string;
	errorDecode: string;
	errorTooLarge: string;
	errorMemory: string;
	errorRecognize: string;
	errorItem: string;
	errorEngineLoad: string;
	errorEngineDetail: string;
	modelNotice: string;
}

interface Props {
	messages: ImageToTextMessages;
	languageNames: Record<string, string>;
	locale: string;
	textDiffHref: string;
}

interface SourceItem {
	id: string;
	file: File;
	kind: 'image' | 'pdf';
	thumbUrl: string | null;
	pageCount: number | null;
	range: string;
	state: 'ready' | 'loading' | 'error';
	error: 'tooLarge' | 'pdf' | null;
}

interface OcrUnit {
	sourceId: string;
	file: File;
	kind: 'image' | 'pdf';
	pageNumber: number | null;
	label: string;
}

interface Session {
	cancelled: boolean;
	cancel: () => void;
	whenCancelled: Promise<never>;
}

type Status =
	| { kind: 'idle' }
	| { kind: 'preparing' }
	| { kind: 'running'; current: number; total: number; name: string }
	| { kind: 'cancelling' }
	| { kind: 'cancelled'; count: number }
	| { kind: 'done'; count: number };

const MAX_FILES = 30;
const MAX_UNITS = 200;
const ENGINE_IDLE_MS = 3 * 60 * 1000;
const MAX_DIFF_CHARS = 200_000;
const BTN = 'sm:h-9';
const FIELD = 'min-h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9';

function formatMb(bytes: number): string {
	return (bytes / (1024 * 1024)).toFixed(1);
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildUnits(sources: readonly SourceItem[]): OcrUnit[] | null {
	const units: OcrUnit[] = [];
	for (const source of sources) {
		if (source.state !== 'ready') continue;
		if (source.kind === 'image') {
			units.push({ sourceId: source.id, file: source.file, kind: 'image', pageNumber: null, label: source.file.name });
		} else {
			const range = parsePageRange(source.range, source.pageCount ?? 0);
			if (!range.ok) return null;
			for (const page of range.pages) {
				units.push({ sourceId: source.id, file: source.file, kind: 'pdf', pageNumber: page, label: `${source.file.name} · ${page}` });
			}
		}
	}
	return units;
}

export default function ImageToText({ messages, languageNames, locale, textDiffHref }: Props) {
	const [sources, setSources] = useState<SourceItem[]>([]);
	const [languages, setLanguages] = useState<OcrLanguage[]>(() => defaultOcrLanguages(locale));
	const [psm, setPsm] = useState<OcrPsm>(DEFAULT_OCR_PSM);
	const [preserveSpaces, setPreserveSpaces] = useState(false);
	const [pre, setPre] = useState<PreprocessOptions>(DEFAULT_PREPROCESS);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [results, setResults] = useState<OcrResultItem[]>([]);
	const [status, setStatus] = useState<Status>({ kind: 'idle' });
	const [live, setLive] = useState<OcrProgress | null>(null);
	const [running, setRunning] = useState(false);
	const [globalError, setGlobalError] = useState<{ detail: string } | null>(null);
	const [notices, setNotices] = useState<string[]>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const [mergeMode, setMergeMode] = useState<MergeMode>('blank');
	const [showLowConfidence, setShowLowConfidence] = useState(false);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [isZipping, setIsZipping] = useState(false);
	const [diffHash, setDiffHash] = useState<string | null>(null);
	const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

	const idRef = useRef(0);
	const sourcesRef = useRef<SourceItem[]>([]);
	const resultsRef = useRef<OcrResultItem[]>([]);
	const pdfHandles = useRef(new Map<string, OcrPdfHandle>());
	const urlsRef = useRef(new Set<string>());
	const engineRef = useRef<OcrEngine | null>(null);
	const sessionRef = useRef<Session | null>(null);
	const runningRef = useRef(false);
	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const previewBaseRef = useRef<{ sourceId: string; src: OcrSource } | null>(null);
	const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	sourcesRef.current = sources;
	resultsRef.current = results;

	const newId = () => `${(idRef.current += 1)}`;
	const trackUrl = (url: string) => {
		urlsRef.current.add(url);
		return url;
	};
	const revokeUrl = (url: string | null) => {
		if (!url) return;
		if (urlsRef.current.delete(url)) URL.revokeObjectURL(url);
	};

	// ---- dọn dẹp khi rời trang ----
	useEffect(() => {
		const handles = pdfHandles.current;
		const urls = urlsRef.current;
		const dispose = () => {
			if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
			if (sessionRef.current && !sessionRef.current.cancelled) sessionRef.current.cancel();
			void engineRef.current?.terminate();
			engineRef.current = null;
			for (const handle of handles.values()) handle.destroy();
			handles.clear();
			previewBaseRef.current?.src.release();
			previewBaseRef.current = null;
			for (const url of urls) URL.revokeObjectURL(url);
			urls.clear();
		};
		window.addEventListener('pagehide', dispose);
		return () => {
			window.removeEventListener('pagehide', dispose);
			dispose();
		};
	}, []);

	// ---- thêm file ----
	const addFiles = useCallback(
		(list: FileList | File[] | null) => {
			if (!list) return;
			const incoming = Array.from(list);
			const added: SourceItem[] = [];
			let skipped = 0;
			let overLimit = 0;
			const room = MAX_FILES - sourcesRef.current.length;
			for (const file of incoming) {
				const pdf = isPdfFile(file);
				if (!pdf && !isImageFile(file)) {
					skipped++;
					continue;
				}
				if (added.length >= room) {
					overLimit++;
					continue;
				}
				const tooLarge = file.size > (pdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES);
				added.push({
					id: newId(),
					file,
					kind: pdf ? 'pdf' : 'image',
					thumbUrl: !pdf && !tooLarge ? trackUrl(URL.createObjectURL(file)) : null,
					pageCount: null,
					range: '',
					state: tooLarge ? 'error' : pdf ? 'loading' : 'ready',
					error: tooLarge ? 'tooLarge' : null,
				});
			}
			const nextNotices: string[] = [];
			if (skipped > 0) nextNotices.push(messages.skippedFiles.replace('{{count}}', String(skipped)));
			if (overLimit > 0) nextNotices.push(messages.limitFiles.replace('{{max}}', String(MAX_FILES)));
			setNotices(nextNotices);
			if (added.length === 0) return;
			setSources((prev) => [...prev, ...added]);
			for (const source of added) {
				if (source.kind !== 'pdf' || source.state !== 'loading') continue;
				openPdfForOcr(source.file)
					.then((handle) => {
						if (!sourcesRef.current.some((item) => item.id === source.id)) {
							handle.destroy();
							return;
						}
						pdfHandles.current.set(source.id, handle);
						setSources((prev) =>
							prev.map((item) => (item.id === source.id ? { ...item, state: 'ready', pageCount: handle.pageCount } : item)),
						);
					})
					.catch(() => {
						setSources((prev) => prev.map((item) => (item.id === source.id ? { ...item, state: 'error', error: 'pdf' } : item)));
					});
			}
		},
		[messages],
	);

	// Dán ảnh bằng Ctrl+V (chỉ khi clipboard thực sự có file ảnh; dán chữ vào ô nhập vẫn bình thường).
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const files = Array.from(event.clipboardData?.files ?? []).filter((file) => isImageFile(file) || isPdfFile(file));
			if (files.length === 0) return;
			event.preventDefault();
			addFiles(files);
		};
		window.addEventListener('paste', onPaste);
		return () => window.removeEventListener('paste', onPaste);
	}, [addFiles]);

	const removeSource = useCallback((id: string) => {
		const source = sourcesRef.current.find((item) => item.id === id);
		if (source) revokeUrl(source.thumbUrl);
		pdfHandles.current.get(id)?.destroy();
		pdfHandles.current.delete(id);
		setSources((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const clearResults = useCallback(() => {
		for (const result of resultsRef.current) revokeUrl(result.previewUrl);
		setResults([]);
	}, []);

	const clearAll = useCallback(() => {
		for (const source of sourcesRef.current) revokeUrl(source.thumbUrl);
		for (const handle of pdfHandles.current.values()) handle.destroy();
		pdfHandles.current.clear();
		previewBaseRef.current?.src.release();
		previewBaseRef.current = null;
		setSources([]);
		clearResults();
		setStatus({ kind: 'idle' });
		setNotices([]);
		setGlobalError(null);
	}, [clearResults]);

	// ---- danh sách đơn vị OCR (mỗi ảnh / mỗi trang PDF) ----
	const units = useMemo(() => buildUnits(sources), [sources]);
	const pdfLoading = sources.some((source) => source.state === 'loading');
	const hasRangeError = units === null;
	const unitCount = units?.length ?? 0;
	const canRun = !running && unitCount > 0 && unitCount <= MAX_UNITS && !pdfLoading;

	// ---- ngôn ngữ ----
	const availableLanguages = OCR_LANGUAGES.filter((code) => !languages.includes(code));
	const languageBytes = totalLanguageBytes(languages);

	// ---- chạy OCR ----
	const errorTextFor = useCallback(
		(error: unknown, name: string): string => {
			if (error instanceof OcrImageError) {
				const reason =
					error.code === 'tooLarge' ? messages.errorTooLarge : error.code === 'memory' ? messages.errorMemory : messages.errorDecode;
				return messages.errorItem.replace('{{name}}', name).replace('{{reason}}', reason);
			}
			const detail = error instanceof Error ? error.message : String(error);
			const reason = /memory|abort|oom/i.test(detail) ? messages.errorMemory : messages.errorRecognize;
			return messages.errorItem.replace('{{name}}', name).replace('{{reason}}', reason);
		},
		[messages],
	);

	const run = useCallback(async () => {
		if (runningRef.current) return;
		const unitsNow = buildUnits(sourcesRef.current);
		if (!unitsNow || unitsNow.length === 0) return;
		runningRef.current = true;
		// `whenCancelled` giúp thoát khỏi các await không bao giờ kết thúc sau khi worker bị terminate.
		const session: Session = { cancelled: false, cancel: () => {}, whenCancelled: Promise.resolve() as Promise<never> };
		session.whenCancelled = new Promise<never>((_, reject) => {
			session.cancel = () => {
				session.cancelled = true;
				reject(new Error('cancelled'));
			};
		});
		session.whenCancelled.catch(() => {});
		sessionRef.current = session;
		if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
		setRunning(true);
		setGlobalError(null);
		setLive(null);
		clearResults();
		setStatus({ kind: 'preparing' });

		const langKey = buildLangParam(languages);
		const onProgress = (progress: OcrProgress) => setLive(progress);
		const collected: OcrResultItem[] = [];

		try {
			const { createOcrEngine, OcrEngineError } = await import('@/lib/ocr-engine');

			const ensureEngine = async (): Promise<OcrEngine | null> => {
				let engine = engineRef.current;
				if (engine && engine.langKey !== langKey) {
					await engine.terminate();
					engine = engineRef.current = null;
				}
				if (engine) {
					engine.setProgressHandler(onProgress);
					return engine;
				}
				const creating = createOcrEngine(langKey, onProgress);
				try {
					engine = await Promise.race([creating, session.whenCancelled]);
				} catch (error) {
					if (session.cancelled) {
						// Engine có thể vẫn khởi tạo xong sau khi người dùng huỷ: dọn nó đi.
						void creating.then((late) => late.terminate()).catch(() => {});
					} else {
						setGlobalError({ detail: error instanceof Error ? error.message : String(error) });
					}
					return null;
				}
				engineRef.current = engine;
				return engine;
			};

			for (let index = 0; index < unitsNow.length; index++) {
				if (session.cancelled) break;
				const unit = unitsNow[index];
				setStatus({ kind: 'running', current: index + 1, total: unitsNow.length, name: unit.label });

				const engine = await ensureEngine();
				if (!engine) break;

				const base: Omit<OcrResultItem, 'status' | 'rawText' | 'text' | 'confidence' | 'lines' | 'previewUrl' | 'canvasWidth' | 'canvasHeight' | 'errorText'> = {
					id: newId(),
					sourceId: unit.sourceId,
					sourceName: unit.file.name,
					pageNumber: unit.pageNumber,
					label: unit.label,
				};
				let src: OcrSource | null = null;
				try {
					src =
						unit.kind === 'pdf'
							? await pdfHandles.current.get(unit.sourceId)!.renderPage(unit.pageNumber!)
							: await decodeImageFile(unit.file);
					const rendered = renderForOcr(src, pre);
					src.release();
					src = null;
					const preview = await makePreviewBlob(rendered.colorCanvas);
					const previewUrl = trackUrl(URL.createObjectURL(preview.blob));
					const blob = await canvasToBlob(rendered.ocrCanvas);
					const canvasWidth = rendered.ocrCanvas.width;
					const canvasHeight = rendered.ocrCanvas.height;
					// Giải phóng canvas lớn càng sớm càng tốt.
					rendered.ocrCanvas.width = rendered.ocrCanvas.height = 0;
					rendered.colorCanvas.width = rendered.colorCanvas.height = 0;
					let page;
					try {
						page = await Promise.race([engine.recognize(blob, { psm, preserveSpaces }), session.whenCancelled]);
					} catch (error) {
						revokeUrl(previewUrl);
						throw error;
					}
					const empty = page.text.trim() === '';
					collected.push({
						...base,
						status: empty ? 'empty' : 'done',
						rawText: page.text,
						text: page.text,
						confidence: page.confidence,
						lines: page.lines,
						previewUrl,
						canvasWidth,
						canvasHeight,
						errorText: null,
					});
				} catch (error) {
					src?.release();
					if (session.cancelled) break;
					if (error instanceof OcrEngineError) {
						// Worker có thể đã hỏng (hết bộ nhớ…): bỏ để lần sau tạo lại.
						await engineRef.current?.terminate();
						engineRef.current = null;
					}
					collected.push({
						...base,
						status: 'error',
						rawText: '',
						text: '',
						confidence: null,
						lines: [],
						previewUrl: null,
						canvasWidth: 1,
						canvasHeight: 1,
						errorText: errorTextFor(error, unit.label),
					});
				}
				setResults([...collected]);
				setLive(null);
			}
		} finally {
			const finished = collected.filter((item) => item.status !== 'error').length;
			setResults([...collected]);
			setStatus(session.cancelled ? { kind: 'cancelled', count: collected.length } : { kind: 'done', count: finished });
			setLive(null);
			setRunning(false);
			runningRef.current = false;
			if (engineRef.current) {
				engineRef.current.setProgressHandler(null);
				idleTimerRef.current = setTimeout(() => {
					void engineRef.current?.terminate();
					engineRef.current = null;
				}, ENGINE_IDLE_MS);
			}
		}
	}, [clearResults, errorTextFor, languages, pre, preserveSpaces, psm]);

	const cancel = useCallback(async () => {
		const session = sessionRef.current;
		if (!session || session.cancelled) return;
		session.cancel();
		setStatus({ kind: 'cancelling' });
		const engine = engineRef.current;
		engineRef.current = null;
		await engine?.terminate();
	}, []);

	// ---- xem trước tiền xử lý ----
	const previewTargetId = sources.find((source) => source.state === 'ready')?.id ?? null;
	useEffect(() => {
		if (!advancedOpen) return;
		if (!previewTargetId) {
			setPreviewState('idle');
			return;
		}
		let cancelled = false;
		const timer = setTimeout(async () => {
			const target = sourcesRef.current.find((item) => item.id === previewTargetId);
			if (!target) return;
			setPreviewState('loading');
			try {
				let base = previewBaseRef.current;
				if (!base || base.sourceId !== previewTargetId) {
					base?.src.release();
					previewBaseRef.current = null;
					const src =
						target.kind === 'pdf'
							? await pdfHandles.current.get(previewTargetId)!.renderPage(1, 1400)
							: await decodeImageFile(target.file);
					if (cancelled) {
						src.release();
						return;
					}
					base = { sourceId: previewTargetId, src };
					previewBaseRef.current = base;
				}
				const rendered = renderForOcr(base.src, pre, 900);
				const canvas = previewCanvasRef.current;
				if (!canvas || cancelled) return;
				canvas.width = rendered.ocrCanvas.width;
				canvas.height = rendered.ocrCanvas.height;
				canvas.getContext('2d')?.drawImage(rendered.ocrCanvas, 0, 0);
				setPreviewState('ready');
			} catch {
				if (!cancelled) setPreviewState('error');
			}
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [advancedOpen, previewTargetId, pre]);

	// ---- thao tác trên kết quả ----
	const updateResult = useCallback((id: string, patch: Partial<OcrResultItem>) => {
		setResults((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
	}, []);

	const markCopied = useCallback((id: string) => {
		setCopiedId(id);
		if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
	}, []);

	const copyText = useCallback(
		async (id: string, text: string) => {
			const ok = await copyTextSafe(text);
			if (ok) markCopied(id);
			else setNotices([messages.copyFailed]);
		},
		[markCopied, messages.copyFailed],
	);

	const doneResults = results.filter((item) => item.status === 'done');
	const mergedText = useMemo(
		() => mergeResultTexts(doneResults.map((item) => ({ label: item.label, text: item.text })), mergeMode),
		[doneResults, mergeMode],
	);

	const downloadMerged = () => {
		downloadBlob(new Blob([mergedText], { type: 'text/plain;charset=utf-8' }), mergedTxtName(doneResults.map((item) => item.sourceName)));
	};

	const downloadZip = async () => {
		setIsZipping(true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			const used = new Set<string>();
			for (const item of doneResults) {
				zip.file(dedupeName(unitTxtName(item.sourceName, item.pageNumber), used), item.text);
			}
			downloadBlob(await zip.generateAsync({ type: 'blob' }), `${baseNameOf(doneResults[0]?.sourceName ?? 'ocr', 'ocr')}-text.zip`);
		} finally {
			setIsZipping(false);
		}
	};

	// Liên kết "So sánh trong Text Diff": truyền văn bản qua URL hash (không bao giờ gửi lên server).
	const diffFirst = doneResults[0]?.text ?? '';
	const diffSecond = doneResults[1]?.text ?? '';
	const diffTooLarge = diffFirst.length + diffSecond.length > MAX_DIFF_CHARS;
	useEffect(() => {
		if (diffFirst.trim() === '' || diffTooLarge) {
			setDiffHash(null);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const [original, changed] = await Promise.all([compressToUrlSafeBase64(diffFirst), compressToUrlSafeBase64(diffSecond)]);
				if (!cancelled) setDiffHash(new URLSearchParams({ original, changed }).toString());
			} catch {
				if (!cancelled) setDiffHash(null);
			}
		}, 400);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [diffFirst, diffSecond, diffTooLarge]);

	// ---- hiển thị trạng thái ----
	const sizeMb = formatMb(languageBytes);
	let statusText = '';
	let percent: number | null = null;
	if (status.kind === 'preparing') {
		statusText = messages.statusPreparing;
	} else if (status.kind === 'cancelling') {
		statusText = messages.cancelling;
	} else if (status.kind === 'running') {
		const fraction = live?.progress ?? 0;
		const phase = live?.phase;
		if (phase === 'core') {
			statusText = messages.statusLoadingEngine;
			percent = Math.round(fraction * 100);
		} else if (phase === 'lang') {
			statusText = (live?.fromCache ? messages.statusLoadingLangCached : messages.statusLoadingLang).replace('{{size}}', sizeMb);
			percent = Math.round(fraction * 100);
		} else if (phase === 'init') {
			statusText = messages.statusInitializing;
		} else {
			statusText = messages.statusRecognizing
				.replace('{{current}}', String(status.current))
				.replace('{{total}}', String(status.total))
				.replace('{{name}}', status.name);
			const unitFraction = phase === 'recognize' ? fraction : 0;
			percent = Math.round(((status.current - 1 + unitFraction) / status.total) * 100);
		}
	} else if (status.kind === 'cancelled') {
		statusText = messages.cancelled.replace('{{count}}', String(status.count));
	} else if (status.kind === 'done') {
		statusText = messages.statusDone.replace('{{count}}', String(status.count));
	}
	const busyStatus = status.kind === 'preparing' || status.kind === 'running' || status.kind === 'cancelling';
	// Chỉ đọc lại cho trình đọc màn hình khi pha/ảnh đổi, không đọc từng % thay đổi.
	const liveKey = status.kind === 'running' ? `${status.current}-${live?.phase ?? 'start'}` : status.kind;

	const resultMessages: ResultMessages = messages;
	const overallConfidence = combineConfidence(doneResults.map((item) => ({ confidence: item.confidence, wordCount: countOcrStats(item.text).words })));

	const setPreField = <K extends keyof PreprocessOptions>(key: K, value: PreprocessOptions[K]) => setPre((prev) => ({ ...prev, [key]: value }));
	const psmLabels: Record<OcrPsm, string> = {
		3: messages.psm3,
		4: messages.psm4,
		6: messages.psm6,
		11: messages.psm11,
		7: messages.psm7,
		8: messages.psm8,
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-3 sm:p-4">
			{/* Vùng thả file */}
			<div
				className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed p-4 transition-colors ${
					isDragOver ? 'border-primary bg-primary/5' : 'border-border'
				}`}
				onDragOver={(event) => {
					event.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(event) => {
					event.preventDefault();
					setIsDragOver(false);
					addFiles(event.dataTransfer.files);
				}}
			>
				<label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-within:ring-3 focus-within:ring-ring/50 sm:min-h-9">
					{messages.selectFiles}
					<input
						id="image-to-text-input"
						type="file"
						accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.heic,.heif,application/pdf,.pdf"
						multiple
						className="sr-only"
						onChange={(event) => {
							addFiles(event.target.files);
							event.target.value = '';
						}}
					/>
				</label>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
				<p className="text-xs text-muted-foreground">{messages.acceptedHint}</p>
			</div>

			{notices.map((notice, index) => (
				<p key={index} role="status" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{notice}
				</p>
			))}

			{/* Danh sách file */}
			{sources.length > 0 && (
				<section aria-label={messages.filesHeading} className="flex flex-col gap-2">
					<div className="flex items-center justify-between gap-2">
						<h2 className="text-sm font-semibold text-foreground">
							{messages.filesHeading} ({sources.length})
						</h2>
						<Button type="button" variant="ghost" className={BTN} onClick={clearAll} disabled={running}>
							{messages.clearAll}
						</Button>
					</div>
					<ul className="flex flex-col gap-2">
						{sources.map((source) => {
							const range = source.kind === 'pdf' && source.state === 'ready' ? parsePageRange(source.range, source.pageCount ?? 0) : null;
							const rangeErrorText =
								range && !range.ok
									? range.error === 'invalid'
										? messages.pdfRangeInvalid
										: messages.pdfRangeOutOfRange.replace('{{count}}', String(source.pageCount ?? 0))
									: null;
							return (
								<li key={source.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2">
									{source.thumbUrl ? (
										<img
											src={source.thumbUrl}
											alt=""
											className="size-12 shrink-0 rounded border border-border object-cover"
											onError={(event) => {
												event.currentTarget.style.visibility = 'hidden';
											}}
										/>
									) : (
										<span className="flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
											<FileText aria-hidden="true" className="size-5" />
										</span>
									)}
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-foreground" title={source.file.name}>
											{source.file.name}
										</p>
										<p className="text-xs text-muted-foreground">
											{(source.file.size / 1024).toFixed(0)} KB
											{source.kind === 'pdf' && source.state === 'loading' && ` · ${messages.pdfLoading}`}
											{source.kind === 'pdf' && source.state === 'ready' && ` · ${messages.pdfPages.replace('{{count}}', String(source.pageCount))}`}
										</p>
										{source.state === 'error' && (
											<p role="alert" className="text-xs text-destructive">
												{source.error === 'tooLarge' ? messages.tooLargeFile : messages.pdfError}
											</p>
										)}
									</div>
									{source.kind === 'pdf' && source.state === 'ready' && (
										<div className="flex flex-col gap-0.5">
											<label htmlFor={`range-${source.id}`} className="text-xs text-muted-foreground">
												{messages.pdfRangeLabel}
											</label>
											<input
												id={`range-${source.id}`}
												type="text"
												inputMode="text"
												value={source.range}
												placeholder={messages.pdfRangePlaceholder}
												aria-invalid={rangeErrorText ? true : undefined}
												aria-describedby={rangeErrorText ? `range-err-${source.id}` : undefined}
												onChange={(event) =>
													setSources((prev) => prev.map((item) => (item.id === source.id ? { ...item, range: event.target.value } : item)))
												}
												className={`${FIELD} w-44 max-w-full`}
											/>
											{rangeErrorText && (
												<span id={`range-err-${source.id}`} role="alert" className="text-xs text-destructive">
													{rangeErrorText}
												</span>
											)}
										</div>
									)}
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => removeSource(source.id)}
										disabled={running}
										aria-label={messages.removeFile.replace('{{name}}', source.file.name)}
									>
										<X aria-hidden="true" />
									</Button>
								</li>
							);
						})}
					</ul>
				</section>
			)}

			{/* Ngôn ngữ */}
			<section aria-labelledby="ocr-lang-label" className="flex flex-col gap-2 rounded-md border border-border p-3">
				<h2 id="ocr-lang-label" className="text-sm font-semibold text-foreground">
					{messages.languagesLabel}
				</h2>
				<p className="text-xs text-muted-foreground">{messages.languagesHint.replace('{{max}}', String(MAX_OCR_LANGUAGES))}</p>
				<ul className="flex flex-wrap items-center gap-2" aria-label={messages.languagesLabel}>
					{languages.map((code) => (
						<li key={code}>
							<span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-primary bg-primary/10 pr-1 pl-3 text-sm text-foreground">
								{languageNames[code] ?? code}
								<button
									type="button"
									disabled={running || languages.length === 1}
									onClick={() => setLanguages((prev) => normalizeOcrLanguages(prev.filter((item) => item !== code)))}
									aria-label={messages.removeLanguage.replace('{{name}}', languageNames[code] ?? code)}
									className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
								>
									<X aria-hidden="true" className="size-3.5" />
								</button>
							</span>
						</li>
					))}
					<li>
						<select
							aria-label={messages.addLanguage}
							value=""
							disabled={running || languages.length >= MAX_OCR_LANGUAGES}
							onChange={(event) => {
								const code = event.target.value;
								if (code) setLanguages((prev) => normalizeOcrLanguages([...prev, code]));
							}}
							className={FIELD}
						>
							<option value="">{languages.length >= MAX_OCR_LANGUAGES ? messages.languageLimit.replace('{{max}}', String(MAX_OCR_LANGUAGES)) : messages.addLanguage}</option>
							{availableLanguages.map((code) => (
								<option key={code} value={code}>
									{languageNames[code] ?? code}
								</option>
							))}
						</select>
					</li>
				</ul>
				<p className="text-xs text-muted-foreground">{messages.downloadSize.replace('{{size}}', sizeMb)}</p>
			</section>

			{/* Nâng cao: bố cục + tiền xử lý */}
			<details
				className="rounded-md border border-border"
				onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
			>
				<summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9">
					{messages.advancedTitle}
				</summary>
				<div className="flex flex-col gap-4 border-t border-border p-3">
					<div className="flex flex-col gap-1">
						<label htmlFor="ocr-psm" className="text-sm font-medium text-foreground">
							{messages.psmLabel}
						</label>
						<select id="ocr-psm" value={psm} onChange={(event) => setPsm(Number(event.target.value) as OcrPsm)} className={`${FIELD} max-w-sm`} disabled={running}>
							{OCR_PSM_MODES.map((mode) => (
								<option key={mode} value={mode}>
									{psmLabels[mode]}
								</option>
							))}
						</select>
						<p className="text-xs text-muted-foreground">{messages.psmHint}</p>
						<label className="mt-1 flex min-h-9 items-center gap-2 text-sm text-foreground">
							<input type="checkbox" checked={preserveSpaces} onChange={(event) => setPreserveSpaces(event.target.checked)} className="size-4" />
							{messages.preserveSpaces}
						</label>
					</div>

					<fieldset className="flex flex-col gap-3" disabled={running}>
						<legend className="text-sm font-medium text-foreground">{messages.preprocessTitle}</legend>
						<p className="text-xs text-muted-foreground">{messages.preprocessHint}</p>
						<div className="flex flex-wrap gap-x-5 gap-y-1">
							<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
								<input type="checkbox" checked={pre.grayscale} onChange={(event) => setPreField('grayscale', event.target.checked)} className="size-4" />
								{messages.grayscale}
							</label>
							<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
								<input type="checkbox" checked={pre.invert} onChange={(event) => setPreField('invert', event.target.checked)} className="size-4" />
								{messages.invert}
							</label>
							<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
								<input type="checkbox" checked={pre.upscaleSmall} onChange={(event) => setPreField('upscaleSmall', event.target.checked)} className="size-4" />
								{messages.upscaleSmall}
							</label>
						</div>
						<div className="flex flex-wrap items-end gap-4">
							<div className="flex min-w-0 flex-col gap-1">
								<label htmlFor="ocr-contrast" className="text-sm text-foreground">
									{messages.contrastLabel}: {pre.contrast}
								</label>
								<input
									id="ocr-contrast"
									type="range"
									min={-100}
									max={100}
									step={5}
									value={pre.contrast}
									onChange={(event) => setPreField('contrast', Number(event.target.value))}
									className="h-9 w-48 max-w-full"
								/>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="ocr-binarize" className="text-sm text-foreground">
									{messages.binarizeLabel}
								</label>
								<select id="ocr-binarize" value={pre.binarize} onChange={(event) => setPreField('binarize', event.target.value as BinarizeMode)} className={FIELD}>
									<option value="off">{messages.binarizeOff}</option>
									<option value="otsu">{messages.binarizeOtsu}</option>
									<option value="adaptive">{messages.binarizeAdaptive}</option>
									<option value="fixed">{messages.binarizeFixed}</option>
								</select>
							</div>
							{pre.binarize === 'fixed' && (
								<div className="flex min-w-0 flex-col gap-1">
									<label htmlFor="ocr-threshold" className="text-sm text-foreground">
										{messages.thresholdLabel}: {pre.threshold}
									</label>
									<input
										id="ocr-threshold"
										type="range"
										min={0}
										max={255}
										value={pre.threshold}
										onChange={(event) => setPreField('threshold', Number(event.target.value))}
										className="h-9 w-48 max-w-full"
									/>
								</div>
							)}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm text-foreground">
								{messages.rotateLabel}: {pre.rotation}°
							</span>
							<Button type="button" variant="outline" className={BTN} onClick={() => setPreField('rotation', rotateBy(pre.rotation, -90))}>
								<RotateCcw aria-hidden="true" />
								{messages.rotateLeft}
							</Button>
							<Button type="button" variant="outline" className={BTN} onClick={() => setPreField('rotation', rotateBy(pre.rotation, 90))}>
								<RotateCw aria-hidden="true" />
								{messages.rotateRight}
							</Button>
							<Button type="button" variant="ghost" className={BTN} onClick={() => setPre(DEFAULT_PREPROCESS)}>
								{messages.resetPreprocess}
							</Button>
						</div>
					</fieldset>

					<div className="flex flex-col gap-1">
						<p className="text-sm font-medium text-foreground">{messages.previewTitle}</p>
						<p className="text-xs text-muted-foreground">{messages.previewHint}</p>
						<div className="overflow-hidden rounded-md border border-border bg-muted/30">
							<canvas
								ref={previewCanvasRef}
								role="img"
								aria-label={messages.previewTitle}
								className={`mx-auto h-auto max-h-80 max-w-full ${previewState === 'ready' ? '' : 'hidden'}`}
							/>
							{previewState !== 'ready' && (
								<p role="status" className="p-3 text-xs text-muted-foreground">
									{previewState === 'loading' ? messages.previewLoading : messages.previewUnavailable}
								</p>
							)}
						</div>
					</div>
				</div>
			</details>

			{/* Nút chạy */}
			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" className={`${BTN} px-4`} onClick={() => void run()} disabled={!canRun}>
					{running ? messages.extracting : messages.extract}
					{unitCount > 0 && !running && ` (${unitCount})`}
				</Button>
				{running && (
					<Button type="button" variant="outline" className={BTN} onClick={() => void cancel()} disabled={status.kind === 'cancelling'}>
						{messages.cancel}
					</Button>
				)}
				{hasRangeError && <span className="text-xs text-destructive">{messages.pdfRangeInvalid}</span>}
				{unitCount > MAX_UNITS && <span className="text-xs text-destructive">{messages.limitFiles.replace('{{max}}', String(MAX_UNITS))}</span>}
			</div>

			{/* Trạng thái / tiến trình */}
			<div className="flex flex-col gap-1.5">
				<p key={liveKey} role="status" aria-live="polite" className="text-sm text-muted-foreground">
					{statusText}
					{busyStatus && percent !== null && (
						<span aria-hidden="true" className="ml-2 tabular-nums">
							{percent}%
						</span>
					)}
				</p>
				{busyStatus && <Progress value={percent} aria-label={messages.extracting} />}
			</div>

			{globalError && (
				<div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<p className="font-medium">{messages.errorEngineLoad}</p>
					<p className="mt-1 text-xs break-words">{messages.errorEngineDetail.replace('{{detail}}', globalError.detail)}</p>
				</div>
			)}

			{/* Kết quả */}
			{results.length > 0 && (
				<section aria-labelledby="ocr-results-heading" className="flex flex-col gap-3">
					<h2 id="ocr-results-heading" className="text-heading-2 text-foreground">
						{messages.resultsHeading}
					</h2>
					{doneResults.length > 0 && (
						<div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
							<p className="text-sm text-muted-foreground">
								{messages.resultsSummary
									.replace('{{count}}', String(doneResults.length))
									.replace('{{confidence}}', overallConfidence === null ? '—' : `${overallConfidence}%`)}
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									variant="outline"
									className={BTN}
									onClick={() => void copyText('all', mergedText)}
								>
									{copiedId === 'all' ? messages.copied : messages.copyAll}
								</Button>
								<Button type="button" variant="outline" className={BTN} onClick={downloadMerged}>
									{messages.downloadAllTxt}
								</Button>
								{doneResults.length > 1 && (
									<>
										<Button type="button" variant="outline" className={BTN} onClick={() => void downloadZip()} disabled={isZipping}>
											{isZipping ? messages.zipping : messages.downloadZip}
										</Button>
										<label className="flex items-center gap-1.5 text-sm text-foreground">
											{messages.separatorLabel}
											<select value={mergeMode} onChange={(event) => setMergeMode(event.target.value as MergeMode)} className={FIELD}>
												<option value="blank">{messages.separatorBlank}</option>
												<option value="label">{messages.separatorName}</option>
											</select>
										</label>
									</>
								)}
								<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
									<input
										type="checkbox"
										checked={showLowConfidence}
										onChange={(event) => setShowLowConfidence(event.target.checked)}
										className="size-4"
									/>
									{messages.highlightLow}
								</label>
								{diffHash && (
									<a
										href={`${textDiffHref}#${diffHash}`}
										target="_blank"
										rel="noopener"
										className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium text-primary hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9"
									>
										{doneResults.length > 1 ? messages.compareDiffTwo : messages.compareDiffOne}
									</a>
								)}
								{diffTooLarge && <span className="text-xs text-muted-foreground">{messages.compareTooLarge}</span>}
							</div>
						</div>
					)}
					<div className="flex flex-col gap-4">
						{results.map((item) => (
							<ImageToTextResult
								key={item.id}
								item={item}
								messages={resultMessages}
								showLowConfidence={showLowConfidence}
								copied={copiedId === item.id}
								onChangeText={(id, text) => updateResult(id, { text })}
								onCopy={(result) => void copyText(result.id, result.text)}
								onDownload={(result) =>
									downloadBlob(new Blob([result.text], { type: 'text/plain;charset=utf-8' }), unitTxtName(result.sourceName, result.pageNumber))
								}
								onRemove={(id) => {
									const target = resultsRef.current.find((result) => result.id === id);
									revokeUrl(target?.previewUrl ?? null);
									setResults((prev) => prev.filter((result) => result.id !== id));
								}}
								onJoinLines={(id) => {
									const target = resultsRef.current.find((result) => result.id === id);
									if (target) updateResult(id, { text: joinBrokenLines(target.text) });
								}}
								onCollapseBlank={(id) => {
									const target = resultsRef.current.find((result) => result.id === id);
									if (target) updateResult(id, { text: collapseBlankLines(target.text) });
								}}
								onRestore={(id) => {
									const target = resultsRef.current.find((result) => result.id === id);
									if (target) updateResult(id, { text: target.rawText });
								}}
							/>
						))}
					</div>
				</section>
			)}

			<p className="text-xs text-muted-foreground">{messages.modelNotice}</p>
		</div>
	);
}
