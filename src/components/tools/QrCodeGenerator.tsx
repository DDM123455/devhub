import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type QRCodeStyling from 'qr-code-styling';
import type { DotType, GradientType, Options } from 'qr-code-styling';
import {
	BATCH_MAX_LINES,
	batchBaseName,
	buildEmailPayload,
	buildSmsPayload,
	buildVCardPayload,
	buildWifiPayload,
	normalizeUrlInput,
	parseBatchLines,
	qrAriaLabel,
	qrContrastWarning,
	quietZoneMargin,
	uniqueName,
	utf8ToBinaryString,
	type EmailFields,
	type SmsFields,
	type VCardFields,
	type WifiEncryption,
	type WifiFields,
} from '@/lib/qr-encode';

interface Messages {
	contentTypeLabel: string;
	typeUrl: string;
	typeText: string;
	typeWifi: string;
	typeVcard: string;
	typeEmail: string;
	typeSms: string;
	urlLabel: string;
	urlPlaceholder: string;
	textLabel: string;
	textPlaceholder: string;
	wifiSsidLabel: string;
	wifiPasswordLabel: string;
	wifiEncryptionLabel: string;
	wifiEncryptionWpa: string;
	wifiEncryptionWep: string;
	wifiEncryptionNone: string;
	wifiHiddenLabel: string;
	vcardFirstNameLabel: string;
	vcardLastNameLabel: string;
	vcardPhoneLabel: string;
	vcardEmailLabel: string;
	vcardOrgLabel: string;
	vcardUrlLabel: string;
	emailToLabel: string;
	emailSubjectLabel: string;
	emailBodyLabel: string;
	smsPhoneLabel: string;
	smsMessageLabel: string;
	fgColorLabel: string;
	bgColorLabel: string;
	sizeLabel: string;
	levelLabel: string;
	levelL: string;
	levelM: string;
	levelQ: string;
	levelH: string;
	logoLabel: string;
	removeLogo: string;
	pngResolutionLabel: string;
	downloadPng: string;
	downloadSvg: string;
	errorTooLong: string;
	dotStyleLabel: string;
	dotStyleSquare: string;
	dotStyleDots: string;
	dotStyleRounded: string;
	dotStyleClassy: string;
	dotStyleClassyRounded: string;
	dotStyleExtraRounded: string;
	gradientToggleLabel: string;
	gradientTypeLabel: string;
	gradientTypeLinear: string;
	gradientTypeRadial: string;
	gradientStartColorLabel: string;
	gradientEndColorLabel: string;
	batchModeToggle: string;
	batchInputLabel: string;
	batchInputPlaceholder: string;
	batchLineCount: string;
	batchGenerateButton: string;
	batchGenerating: string;
	processingQueue: string;
	batchPreviewNotice: string;
	frameToggleLabel: string;
	frameTextLabel: string;
	frameTextPlaceholder: string;
	frameNotice: string;
	emptyState: string;
	downloadDisabledEmpty: string;
	urlAutoHttps: string;
	contrastInverted: string;
	contrastLow: string;
	logoRaisedLevel: string;
	logoRestoredLevel: string;
	logoLoadError: string;
	logoSelected: string;
	logoPreviewAlt: string;
	errorRender: string;
	errorCanvasSmall: string;
	downloadError: string;
	batchSummary: string;
	batchFailedHeading: string;
	batchFailedLine: string;
	batchNoneSucceeded: string;
	batchTruncated: string;
	batchCancel: string;
	batchCancelled: string;
	qrAriaLabel: string;
}

type ContentType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'sms';
type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

const MIN_SIZE = 128;
const MAX_SIZE = 512;
const PNG_RESOLUTIONS = [256, 512, 1024, 2048];
const SVG_EXPORT_SIZE = 1024;

const DOT_TYPES: DotType[] = ['square', 'dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded'];

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
	});
}

// qr-code-styling has no built-in frame/CTA-text option (a "premium" feature
// on paid QR generator sites), so this composites one by hand: draw the plain
// QR PNG onto a larger white canvas with a border stroke and, if given, a
// caption below it — PNG only, since compositing readable text into an SVG
// export would need real font-metrics handling this doesn't attempt.
async function composeFramedPng(qrPngBlob: Blob, frameText: string): Promise<Blob> {
	const bitmap = await createImageBitmap(qrPngBlob);
	// Read dimensions BEFORE bitmap.close() — a closed bitmap reports 0x0, which used to push the caption to the wrong place.
	const bmpWidth = bitmap.width;
	const bmpHeight = bitmap.height;
	const padding = Math.round(bmpWidth * 0.08);
	const textAreaHeight = frameText.trim() ? Math.round(bmpWidth * 0.16) : 0;
	const canvas = document.createElement('canvas');
	canvas.width = bmpWidth + padding * 2;
	canvas.height = bmpHeight + padding * 2 + textAreaHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const borderWidth = Math.max(2, Math.round(bmpWidth * 0.008));
	ctx.strokeStyle = '#000000';
	ctx.lineWidth = borderWidth;
	ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);
	ctx.drawImage(bitmap, padding, padding);
	bitmap.close();
	if (frameText.trim()) {
		ctx.fillStyle = '#000000';
		ctx.font = `bold ${Math.round(textAreaHeight * 0.45)}px sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(frameText.trim(), canvas.width / 2, bmpHeight + padding * 2 + textAreaHeight / 2);
	}
	return canvasToPngBlob(canvas);
}

export default function QrCodeGenerator({ messages }: { messages: Messages }) {
	const [contentType, setContentType] = useState<ContentType>('url');
	const [urlValue, setUrlValue] = useState('https://web-tool-hub.example');
	const [textValue, setTextValue] = useState('');
	const [wifi, setWifi] = useState<WifiFields>({ ssid: '', password: '', encryption: 'WPA', hidden: false });
	const [vcard, setVcard] = useState<VCardFields>({ firstName: '', lastName: '', phone: '', email: '', org: '', url: '' });
	const [email, setEmail] = useState<EmailFields>({ to: '', subject: '', body: '' });
	const [sms, setSms] = useState<SmsFields>({ phone: '', message: '' });

	const [fgColor, setFgColor] = useState('#000000');
	const [bgColor, setBgColor] = useState('#ffffff');
	const [size, setSize] = useState(256);
	const [level, setLevel] = useState<ErrorCorrectionLevel>('M');
	const [logoUrl, setLogoUrl] = useState<string | null>(null);
	const [logoName, setLogoName] = useState<string | null>(null);
	const [logoNotice, setLogoNotice] = useState<string | null>(null);
	const [logoError, setLogoError] = useState<string | null>(null);
	// Level in effect before a logo auto-raised it to H, so removing the logo can put it back.
	const levelBeforeLogoRef = useRef<ErrorCorrectionLevel | null>(null);
	const [pngResolution, setPngResolution] = useState(1024);
	const [renderError, setRenderError] = useState<{ key: string; kind: 'capacity' | 'canvas' | 'other' } | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const [dotsType, setDotsType] = useState<DotType>('square');
	const [gradientEnabled, setGradientEnabled] = useState(false);
	const [gradientType, setGradientType] = useState<GradientType>('linear');
	const [gradientColorStart, setGradientColorStart] = useState('#047857');
	const [gradientColorEnd, setGradientColorEnd] = useState('#22d3ee');

	const [batchMode, setBatchMode] = useState(false);
	const [batchInput, setBatchInput] = useState('');
	const [isBatchGenerating, setIsBatchGenerating] = useState(false);
	const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
	const [batchResult, setBatchResult] = useState<{
		ok: number;
		total: number;
		failed: Array<{ line: number; text: string }>;
		cancelled: boolean;
	} | null>(null);
	const batchAbortRef = useRef<AbortController | null>(null);
	const canBatch = contentType === 'url' || contentType === 'text';
	const effectiveBatchMode = canBatch && batchMode;

	const [frameEnabled, setFrameEnabled] = useState(false);
	const [frameText, setFrameText] = useState(messages.frameTextPlaceholder);

	const containerRef = useRef<HTMLDivElement>(null);
	const qrRef = useRef<QRCodeStyling | null>(null);

	const urlNormalized = useMemo(() => normalizeUrlInput(urlValue), [urlValue]);

	const { qrValue, isEmpty, summary } = useMemo(() => {
		switch (contentType) {
			case 'url':
				return { qrValue: urlNormalized.value, isEmpty: urlNormalized.value === '', summary: urlNormalized.value };
			case 'text':
				return { qrValue: textValue.trim(), isEmpty: textValue.trim() === '', summary: textValue.trim() };
			case 'wifi':
				return { qrValue: buildWifiPayload(wifi), isEmpty: wifi.ssid.trim() === '', summary: wifi.ssid.trim() };
			case 'vcard':
				return {
					qrValue: buildVCardPayload(vcard),
					isEmpty: !vcard.firstName.trim() && !vcard.lastName.trim() && !vcard.phone.trim() && !vcard.email.trim(),
					summary: [vcard.firstName, vcard.lastName].filter(Boolean).join(' ') || vcard.phone || vcard.email,
				};
			case 'email':
				return { qrValue: buildEmailPayload(email), isEmpty: email.to.trim() === '', summary: email.to.trim() };
			case 'sms':
				return { qrValue: buildSmsPayload(sms), isEmpty: sms.phone.trim() === '', summary: sms.phone.trim() };
		}
	}, [contentType, urlNormalized, textValue, wifi, vcard, email, sms]);

	const renderKey = `${qrValue}-${level}-${size}`;
	// Derived (not stored via a separate reset effect) so there's no race between
	// "a new value should optimistically retry" and "onError just marked this
	// value as failing" — whichever runs, this always reflects the current attempt.
	const activeError = renderError && renderError.key === renderKey ? renderError.kind : null;
	const hasRenderError = activeError !== null;
	const downloadDisabled = isEmpty || hasRenderError;
	const contrastWarning = useMemo(
		() =>
			gradientEnabled
				? (qrContrastWarning(gradientColorStart, bgColor) ?? qrContrastWarning(gradientColorEnd, bgColor))
				: qrContrastWarning(fgColor, bgColor),
		[gradientEnabled, gradientColorStart, gradientColorEnd, fgColor, bgColor],
	);

	const effectiveFrameText = frameText.trim() || messages.frameTextPlaceholder;

	// Shared style/content options used for the live preview, the two single
	// export paths, and batch generation — only width/height/type (canvas vs
	// svg) and, for batch mode, `data` differ per caller.
	const buildQrOptions = (
		overrides: Pick<Options, 'width' | 'height' | 'type'> & { data?: string },
	): Partial<Options> => {
		const dotsStyle = gradientEnabled
			? {
					gradient: {
						type: gradientType,
						rotation: 0,
						colorStops: [
							{ offset: 0, color: gradientColorStart },
							{ offset: 1, color: gradientColorEnd },
						],
					},
				}
			: { color: fgColor };
		return {
			...overrides,
			// UTF-8 bytes, not ISO-8859-1 (see utf8ToBinaryString) — otherwise
			// accented/CJK text scans back as garbage.
			data: utf8ToBinaryString(overrides.data ?? qrValue),
			// Quiet zone scales with the export size (preview, PNG and SVG alike).
			margin: quietZoneMargin(overrides.width ?? size),
			qrOptions: { errorCorrectionLevel: level },
			dotsOptions: { type: dotsType, ...dotsStyle },
			cornersSquareOptions: { type: dotsType, ...dotsStyle },
			cornersDotOptions: { type: dotsType, ...dotsStyle },
			backgroundOptions: { color: bgColor },
			image: logoUrl ?? undefined,
			// qr-code-styling reads `imageOptions.hideBackgroundDots` unconditionally
			// while laying out dots, even when there's no `image` — always supplying
			// the object (inert without an `image`) avoids a throw on every render.
			imageOptions: { imageSize: 0.2, hideBackgroundDots: true, margin: 2 },
		};
	};

	// qr-code-styling touches `document` inside its constructor, so it's loaded
	// dynamically inside this client-only effect rather than imported statically
	// at the top of the file — a static import would run during Astro's
	// build-time SSR pass (no `document` there).
	useEffect(() => {
		if (effectiveBatchMode || isEmpty) return;
		let cancelled = false;
		void import('qr-code-styling').then(({ default: QRCodeStylingCtor }) => {
			if (cancelled) return;
			const container = containerRef.current;
			if (!container) return;
			const options = buildQrOptions({ width: size, height: size, type: 'canvas' });
			try {
				if (!qrRef.current) {
					// Clear first so a second instance (e.g. after a failed one) never stacks two canvases.
					container.replaceChildren();
					qrRef.current = new QRCodeStylingCtor(options);
					qrRef.current.append(container);
				} else {
					qrRef.current.update(options);
				}
				setRenderError(null);
			} catch (err) {
				// qr-code-styling throws plain strings ("code length overflow...",
				// "Canvas is too small."). Every failure is surfaced to the user; the
				// instance is dropped so the next attempt starts from a clean container.
				const text = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
				const kind = text.includes('code length overflow') ? 'capacity' : /too small/i.test(text) ? 'canvas' : 'other';
				if (kind === 'other') console.error('QR code render failed unexpectedly:', err);
				qrRef.current = null;
				container.replaceChildren();
				setRenderError({ key: renderKey, kind });
			}
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveBatchMode, isEmpty, renderKey, level, fgColor, bgColor, size, logoUrl, dotsType, gradientEnabled, gradientType, gradientColorStart, gradientColorEnd]);

	const handleLogoChange = (input: HTMLInputElement) => {
		const file = input.files?.[0];
		input.value = ''; // allow picking the same file again after removing it
		if (!file) return;
		setLogoError(null);
		const reader = new FileReader();
		reader.onerror = () => setLogoError(messages.logoLoadError);
		reader.onload = () => {
			const dataUrl = typeof reader.result === 'string' ? reader.result : null;
			if (!dataUrl) {
				setLogoError(messages.logoLoadError);
				return;
			}
			// Make sure it really decodes as an image before handing it to the QR renderer.
			const probe = new Image();
			probe.onerror = () => setLogoError(messages.logoLoadError);
			probe.onload = () => {
				setLogoUrl(dataUrl);
				setLogoName(file.name);
				// A logo covers part of the pattern, so give it more redundancy to stay
				// scannable — but don't fight a level the user already raised themselves.
				if (level === 'L' || level === 'M') {
					levelBeforeLogoRef.current = level;
					setLevel('H');
					setLogoNotice(messages.logoRaisedLevel);
				} else {
					setLogoNotice(null);
				}
			};
			probe.src = dataUrl;
		};
		reader.readAsDataURL(file);
	};

	const handleRemoveLogo = () => {
		setLogoUrl(null);
		setLogoName(null);
		setLogoError(null);
		if (levelBeforeLogoRef.current && level === 'H') {
			setLevel(levelBeforeLogoRef.current);
			setLogoNotice(messages.logoRestoredLevel);
		} else {
			setLogoNotice(null);
		}
		levelBeforeLogoRef.current = null;
	};

	const saveBlob = (blob: Blob, filename: string) => {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		// Revoking synchronously can cancel the download in some browsers.
		setTimeout(() => URL.revokeObjectURL(url), 10000);
	};

	const handleDownloadPng = async () => {
		if (downloadDisabled) return;
		setActionError(null);
		try {
			const { default: QRCodeStylingCtor } = await import('qr-code-styling');
			const exportQr = new QRCodeStylingCtor(buildQrOptions({ width: pngResolution, height: pngResolution, type: 'canvas' }));
			if (frameEnabled) {
				const raw = await exportQr.getRawData('png');
				if (!raw) throw new Error('empty png');
				saveBlob(await composeFramedPng(raw as Blob, effectiveFrameText), 'qrcode.png');
			} else {
				await exportQr.download({ name: 'qrcode', extension: 'png' });
			}
		} catch (err) {
			console.error('QR PNG export failed:', err);
			setActionError(typeof err === 'string' && /too small/i.test(err) ? messages.errorCanvasSmall : messages.downloadError);
		}
	};

	const handleDownloadSvg = async () => {
		if (downloadDisabled) return;
		setActionError(null);
		try {
			const { default: QRCodeStylingCtor } = await import('qr-code-styling');
			const exportQr = new QRCodeStylingCtor(buildQrOptions({ width: SVG_EXPORT_SIZE, height: SVG_EXPORT_SIZE, type: 'svg' }));
			await exportQr.download({ name: 'qrcode', extension: 'svg' });
		} catch (err) {
			console.error('QR SVG export failed:', err);
			setActionError(messages.downloadError);
		}
	};

	const batchParsed = useMemo(() => parseBatchLines(batchInput), [batchInput]);

	const handleGenerateBatch = async () => {
		const { lines } = batchParsed;
		if (lines.length === 0) return;
		const controller = new AbortController();
		batchAbortRef.current = controller;
		setIsBatchGenerating(true);
		setBatchResult(null);
		setBatchProgress({ current: 0, total: lines.length });
		const failed: Array<{ line: number; text: string }> = [];
		let ok = 0;
		try {
			const [{ default: QRCodeStylingCtor }, { default: JSZip }] = await Promise.all([
				import('qr-code-styling'),
				import('jszip'),
			]);
			const zip = new JSZip();
			const usedNames = new Set<string>();
			for (let i = 0; i < lines.length; i++) {
				if (controller.signal.aborted) break;
				// Yield to the event loop every few items so the progress bar paints and the page stays responsive.
				if (i % 3 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
				if (controller.signal.aborted) break;
				const entry = lines[i];
				setBatchProgress({ current: i + 1, total: lines.length });
				const data = contentType === 'url' ? normalizeUrlInput(entry.text).value : entry.text;
				let blob: Blob | null = null;
				try {
					const qr = new QRCodeStylingCtor(
						buildQrOptions({ width: pngResolution, height: pngResolution, type: 'canvas', data }),
					);
					const raw = (await qr.getRawData('png')) as Blob | null;
					blob = raw && frameEnabled ? await composeFramedPng(raw, effectiveFrameText) : raw;
				} catch {
					blob = null;
				}
				if (!blob) {
					failed.push({ line: entry.line, text: entry.text });
					continue;
				}
				const name = uniqueName(batchBaseName(data, i), usedNames, i);
				zip.file(`${name}.png`, blob);
				ok += 1;
			}
			const cancelled = controller.signal.aborted;
			if (ok > 0 && !cancelled) {
				const zipBlob = await zip.generateAsync({ type: 'blob' });
				saveBlob(zipBlob, 'qrcodes.zip');
			}
			setBatchResult({ ok, total: lines.length, failed, cancelled });
		} catch (err) {
			console.error('QR batch failed:', err);
			setBatchResult({ ok, total: lines.length, failed, cancelled: false });
			setActionError(messages.downloadError);
		} finally {
			batchAbortRef.current = null;
			setIsBatchGenerating(false);
			setBatchProgress(null);
		}
	};

	const ariaLabel = qrAriaLabel(messages.qrAriaLabel, summary);

	const contentTypeOptions: Array<{ value: ContentType; label: string }> = [
		{ value: 'url', label: messages.typeUrl },
		{ value: 'text', label: messages.typeText },
		{ value: 'wifi', label: messages.typeWifi },
		{ value: 'vcard', label: messages.typeVcard },
		{ value: 'email', label: messages.typeEmail },
		{ value: 'sms', label: messages.typeSms },
	];

	const dotStyleLabels: Record<DotType, string> = {
		square: messages.dotStyleSquare,
		dots: messages.dotStyleDots,
		rounded: messages.dotStyleRounded,
		classy: messages.dotStyleClassy,
		'classy-rounded': messages.dotStyleClassyRounded,
		'extra-rounded': messages.dotStyleExtraRounded,
	};

	const inputClass =
		'min-h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground';

	return (
		<div className="flex flex-col gap-6 rounded-lg border border-border p-4 md:flex-row">
			<div className="flex flex-col gap-4 md:w-80">
				<div className="flex flex-col gap-1">
					<label htmlFor="qr-content-type" className="text-sm font-medium text-foreground">
						{messages.contentTypeLabel}
					</label>
					<select
						id="qr-content-type"
						value={contentType}
						onChange={(event) => setContentType(event.target.value as ContentType)}
						className={inputClass}
					>
						{contentTypeOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>

				{canBatch && (
					<label className="flex min-h-9 items-center gap-2 text-sm text-muted-foreground">
						<input type="checkbox" className="size-4" checked={batchMode} onChange={(event) => setBatchMode(event.target.checked)} />
						{messages.batchModeToggle}
					</label>
				)}

				{contentType === 'url' && !effectiveBatchMode && (
					<div className="flex flex-col gap-1">
						<label htmlFor="qr-url" className="text-sm font-medium text-foreground">
							{messages.urlLabel}
						</label>
						<input
							id="qr-url"
							type="text"
							value={urlValue}
							onChange={(event) => setUrlValue(event.target.value)}
							placeholder={messages.urlPlaceholder}
							className={inputClass}
						/>
						{urlNormalized.added && (
							<p className="text-xs text-muted-foreground">{messages.urlAutoHttps.replace('{{url}}', urlNormalized.value)}</p>
						)}
					</div>
				)}

				{contentType === 'text' && !effectiveBatchMode && (
					<div className="flex flex-col gap-1">
						<label htmlFor="qr-text" className="text-sm font-medium text-foreground">
							{messages.textLabel}
						</label>
						<textarea
							id="qr-text"
							value={textValue}
							onChange={(event) => setTextValue(event.target.value)}
							placeholder={messages.textPlaceholder}
							rows={3}
							className={inputClass}
						/>
					</div>
				)}

				{effectiveBatchMode && (
					<div className="flex flex-col gap-1">
						<label htmlFor="qr-batch-input" className="text-sm font-medium text-foreground">
							{messages.batchInputLabel}
						</label>
						<textarea
							id="qr-batch-input"
							value={batchInput}
							onChange={(event) => setBatchInput(event.target.value)}
							placeholder={messages.batchInputPlaceholder}
							rows={6}
							spellCheck={false}
							className={inputClass}
						/>
						<p className="text-xs text-muted-foreground">
							{messages.batchLineCount.replace('{{count}}', String(batchParsed.lines.length))}
						</p>
						{batchParsed.truncated && (
							<p role="alert" className="text-xs text-destructive">
								{messages.batchTruncated
									.replace('{{max}}', String(BATCH_MAX_LINES))
									.replace('{{total}}', String(batchParsed.total))}
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								size="sm"
								className="min-h-9 w-fit"
								onClick={() => void handleGenerateBatch()}
								disabled={isBatchGenerating || batchParsed.lines.length === 0}
							>
								{isBatchGenerating ? messages.batchGenerating : messages.batchGenerateButton}
							</Button>
							{isBatchGenerating && (
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="min-h-9 w-fit"
									onClick={() => batchAbortRef.current?.abort()}
								>
									{messages.batchCancel}
								</Button>
							)}
						</div>
						{batchProgress && batchProgress.total > 1 && (
							<div role="status" className="flex flex-col gap-1.5">
								<p className="text-xs text-muted-foreground">
									{messages.processingQueue
										.replace('{{current}}', String(batchProgress.current))
										.replace('{{total}}', String(batchProgress.total))}
								</p>
								<Progress value={Math.round((batchProgress.current / batchProgress.total) * 100)} />
							</div>
						)}
						{batchResult && (
							<div role="status" className="flex flex-col gap-1 text-xs">
								<p className={batchResult.ok === 0 || batchResult.failed.length > 0 ? 'text-destructive' : 'text-foreground'}>
									{batchResult.cancelled
										? messages.batchCancelled
										: batchResult.ok === 0
											? messages.batchNoneSucceeded
											: messages.batchSummary
													.replace('{{ok}}', String(batchResult.ok))
													.replace('{{total}}', String(batchResult.total))}
								</p>
								{batchResult.failed.length > 0 && (
									<>
										<p className="font-medium text-foreground">{messages.batchFailedHeading}</p>
										<ul className="max-h-28 list-disc overflow-auto pl-4 text-muted-foreground">
											{batchResult.failed.map((item) => (
												<li key={item.line} className="break-all">
													{messages.batchFailedLine
														.replace('{{line}}', String(item.line))
														.replace('{{text}}', item.text.length > 60 ? item.text.slice(0, 57) + '...' : item.text)}
												</li>
											))}
										</ul>
									</>
								)}
							</div>
						)}
					</div>
				)}

				{contentType === 'wifi' && (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-wifi-ssid" className="text-sm font-medium text-foreground">
								{messages.wifiSsidLabel}
							</label>
							<input
								id="qr-wifi-ssid"
								type="text"
								value={wifi.ssid}
								onChange={(event) => setWifi((prev) => ({ ...prev, ssid: event.target.value }))}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-wifi-encryption" className="text-sm font-medium text-foreground">
								{messages.wifiEncryptionLabel}
							</label>
							<select
								id="qr-wifi-encryption"
								value={wifi.encryption}
								onChange={(event) =>
									setWifi((prev) => ({ ...prev, encryption: event.target.value as WifiEncryption }))
								}
								className={inputClass}
							>
								<option value="WPA">{messages.wifiEncryptionWpa}</option>
								<option value="WEP">{messages.wifiEncryptionWep}</option>
								<option value="nopass">{messages.wifiEncryptionNone}</option>
							</select>
						</div>
						{wifi.encryption !== 'nopass' && (
							<div className="flex flex-col gap-1">
								<label htmlFor="qr-wifi-password" className="text-sm font-medium text-foreground">
									{messages.wifiPasswordLabel}
								</label>
								<input
									id="qr-wifi-password"
									type="text"
									value={wifi.password}
									onChange={(event) => setWifi((prev) => ({ ...prev, password: event.target.value }))}
									className={inputClass}
								/>
							</div>
						)}
						<label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
							<input
								type="checkbox"
								className="size-4"
								checked={wifi.hidden}
								onChange={(event) => setWifi((prev) => ({ ...prev, hidden: event.target.checked }))}
							/>
							{messages.wifiHiddenLabel}
						</label>
					</div>
				)}

				{contentType === 'vcard' && (
					<div className="flex flex-col gap-3">
						<div className="grid grid-cols-2 gap-2">
							<div className="flex flex-col gap-1">
								<label htmlFor="qr-vcard-first" className="text-sm font-medium text-foreground">
									{messages.vcardFirstNameLabel}
								</label>
								<input
									id="qr-vcard-first"
									type="text"
									value={vcard.firstName}
									onChange={(event) => setVcard((prev) => ({ ...prev, firstName: event.target.value }))}
									className={inputClass}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="qr-vcard-last" className="text-sm font-medium text-foreground">
									{messages.vcardLastNameLabel}
								</label>
								<input
									id="qr-vcard-last"
									type="text"
									value={vcard.lastName}
									onChange={(event) => setVcard((prev) => ({ ...prev, lastName: event.target.value }))}
									className={inputClass}
								/>
							</div>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-vcard-phone" className="text-sm font-medium text-foreground">
								{messages.vcardPhoneLabel}
							</label>
							<input
								id="qr-vcard-phone"
								type="text"
								value={vcard.phone}
								onChange={(event) => setVcard((prev) => ({ ...prev, phone: event.target.value }))}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-vcard-email" className="text-sm font-medium text-foreground">
								{messages.vcardEmailLabel}
							</label>
							<input
								id="qr-vcard-email"
								type="text"
								value={vcard.email}
								onChange={(event) => setVcard((prev) => ({ ...prev, email: event.target.value }))}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-vcard-org" className="text-sm font-medium text-foreground">
								{messages.vcardOrgLabel}
							</label>
							<input
								id="qr-vcard-org"
								type="text"
								value={vcard.org}
								onChange={(event) => setVcard((prev) => ({ ...prev, org: event.target.value }))}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-vcard-url" className="text-sm font-medium text-foreground">
								{messages.vcardUrlLabel}
							</label>
							<input
								id="qr-vcard-url"
								type="text"
								value={vcard.url}
								onChange={(event) => setVcard((prev) => ({ ...prev, url: event.target.value }))}
								className={inputClass}
							/>
						</div>
					</div>
				)}

				{contentType === 'email' && (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-email-to" className="text-sm font-medium text-foreground">
								{messages.emailToLabel}
							</label>
							<input
								id="qr-email-to"
								type="email"
								value={email.to}
								onChange={(event) => setEmail((prev) => ({ ...prev, to: event.target.value }))}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-email-subject" className="text-sm font-medium text-foreground">
								{messages.emailSubjectLabel}
							</label>
							<input
								id="qr-email-subject"
								type="text"
								value={email.subject}
								onChange={(event) => setEmail((prev) => ({ ...prev, subject: event.target.value }))}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-email-body" className="text-sm font-medium text-foreground">
								{messages.emailBodyLabel}
							</label>
							<textarea
								id="qr-email-body"
								value={email.body}
								onChange={(event) => setEmail((prev) => ({ ...prev, body: event.target.value }))}
								rows={3}
								className={inputClass}
							/>
						</div>
					</div>
				)}

				{contentType === 'sms' && (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-sms-phone" className="text-sm font-medium text-foreground">
								{messages.smsPhoneLabel}
							</label>
							<input
								id="qr-sms-phone"
								type="text"
								value={sms.phone}
								onChange={(event) => setSms((prev) => ({ ...prev, phone: event.target.value }))}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="qr-sms-message" className="text-sm font-medium text-foreground">
								{messages.smsMessageLabel}
							</label>
							<textarea
								id="qr-sms-message"
								value={sms.message}
								onChange={(event) => setSms((prev) => ({ ...prev, message: event.target.value }))}
								rows={3}
								className={inputClass}
							/>
						</div>
					</div>
				)}

				<div className="flex flex-col gap-1">
					<label htmlFor="qr-dot-style" className="text-sm font-medium text-foreground">
						{messages.dotStyleLabel}
					</label>
					<select
						id="qr-dot-style"
						value={dotsType}
						onChange={(event) => setDotsType(event.target.value as DotType)}
						className={inputClass}
					>
						{DOT_TYPES.map((type) => (
							<option key={type} value={type}>
								{dotStyleLabels[type]}
							</option>
						))}
					</select>
				</div>

				<div className="flex flex-col gap-2">
					<label className="flex min-h-9 items-center gap-2 text-sm font-medium text-foreground">
						<input
							type="checkbox"
							className="size-4"
							checked={gradientEnabled}
							onChange={(event) => setGradientEnabled(event.target.checked)}
						/>
						{messages.gradientToggleLabel}
					</label>
					{gradientEnabled && (
						<div className="flex flex-col gap-2 pl-1">
							<div className="flex flex-col gap-1">
								<label htmlFor="qr-gradient-type" className="text-xs text-muted-foreground">
									{messages.gradientTypeLabel}
								</label>
								<select
									id="qr-gradient-type"
									value={gradientType}
									onChange={(event) => setGradientType(event.target.value as GradientType)}
									className={inputClass}
								>
									<option value="linear">{messages.gradientTypeLinear}</option>
									<option value="radial">{messages.gradientTypeRadial}</option>
								</select>
							</div>
							<div className="flex gap-4">
								<div className="flex flex-col gap-1">
									<label htmlFor="qr-gradient-start" className="text-xs text-muted-foreground">
										{messages.gradientStartColorLabel}
									</label>
									<input
										id="qr-gradient-start"
										type="color"
										value={gradientColorStart}
										onChange={(event) => setGradientColorStart(event.target.value)}
										className="h-11 w-16 cursor-pointer rounded-md border border-border bg-background"
									/>
								</div>
								<div className="flex flex-col gap-1">
									<label htmlFor="qr-gradient-end" className="text-xs text-muted-foreground">
										{messages.gradientEndColorLabel}
									</label>
									<input
										id="qr-gradient-end"
										type="color"
										value={gradientColorEnd}
										onChange={(event) => setGradientColorEnd(event.target.value)}
										className="h-11 w-16 cursor-pointer rounded-md border border-border bg-background"
									/>
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="flex flex-col gap-2">
					<label className="flex min-h-9 items-center gap-2 text-sm font-medium text-foreground">
						<input
							type="checkbox"
							className="size-4"
							checked={frameEnabled}
							onChange={(event) => setFrameEnabled(event.target.checked)}
						/>
						{messages.frameToggleLabel}
					</label>
					{frameEnabled && (
						<div className="flex flex-col gap-1 pl-1">
							<label htmlFor="qr-frame-text" className="text-xs text-muted-foreground">
								{messages.frameTextLabel}
							</label>
							<input
								id="qr-frame-text"
								type="text"
								value={frameText}
								onChange={(event) => setFrameText(event.target.value)}
								placeholder={messages.frameTextPlaceholder}
								className={inputClass}
							/>
							<p id="qr-frame-notice" className="text-xs text-muted-foreground">{messages.frameNotice}</p>
						</div>
					)}
				</div>

				<div className="flex gap-4">
					<div className="flex flex-col gap-1">
						<label htmlFor="qr-fg-color" className="text-sm font-medium text-foreground">
							{messages.fgColorLabel}
						</label>
						<input
							id="qr-fg-color"
							type="color"
							value={fgColor}
							onChange={(event) => setFgColor(event.target.value)}
							disabled={gradientEnabled}
							className="h-11 w-16 cursor-pointer rounded-md border border-border bg-background disabled:cursor-not-allowed disabled:opacity-50"
						/>
					</div>
					<div className="flex flex-col gap-1">
						<label htmlFor="qr-bg-color" className="text-sm font-medium text-foreground">
							{messages.bgColorLabel}
						</label>
						<input
							id="qr-bg-color"
							type="color"
							value={bgColor}
							onChange={(event) => setBgColor(event.target.value)}
							className="h-11 w-16 cursor-pointer rounded-md border border-border bg-background"
						/>
					</div>
				</div>
				{contrastWarning && (
					<p role="status" className="w-fit rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
						{contrastWarning === 'inverted' ? messages.contrastInverted : messages.contrastLow}
					</p>
				)}

				<div className="flex flex-col gap-1">
					<label htmlFor="qr-level" className="text-sm font-medium text-foreground">
						{messages.levelLabel}
					</label>
					<select
						id="qr-level"
						value={level}
						onChange={(event) => setLevel(event.target.value as ErrorCorrectionLevel)}
						className={inputClass}
					>
						<option value="L">{messages.levelL}</option>
						<option value="M">{messages.levelM}</option>
						<option value="Q">{messages.levelQ}</option>
						<option value="H">{messages.levelH}</option>
					</select>
				</div>

				<div className="flex flex-col gap-1">
					<label htmlFor="qr-size" className="text-sm font-medium text-foreground">
						{messages.sizeLabel.replace('{{size}}', String(size))}
					</label>
					<input
						id="qr-size"
						type="range"
						min={MIN_SIZE}
						max={MAX_SIZE}
						step={8}
						value={size}
						onChange={(event) => setSize(Number(event.target.value))}
						className="h-9 w-full cursor-pointer"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label htmlFor="qr-logo" className="text-sm font-medium text-foreground">
						{messages.logoLabel}
					</label>
					<input
						id="qr-logo"
						type="file"
						accept="image/*"
						onChange={(event) => handleLogoChange(event.currentTarget)}
						className="text-sm text-foreground"
					/>
					{logoUrl && (
						<div className="mt-1 flex items-center gap-2">
							<img src={logoUrl} alt={messages.logoPreviewAlt} className="size-10 rounded border border-border object-contain" />
							<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
								{messages.logoSelected.replace('{{name}}', logoName ?? '')}
							</span>
							<Button type="button" size="sm" variant="outline" className="min-h-9 w-fit" onClick={handleRemoveLogo}>
								{messages.removeLogo}
							</Button>
						</div>
					)}
					{logoError && (
						<p role="alert" className="text-xs text-destructive">
							{logoError}
						</p>
					)}
					{logoNotice && (
						<p role="status" className="text-xs text-muted-foreground">
							{logoNotice}
						</p>
					)}
				</div>

				<div className="flex flex-col gap-1">
					<label htmlFor="qr-png-resolution" className="text-sm font-medium text-foreground">
						{messages.pngResolutionLabel}
					</label>
					<select
						id="qr-png-resolution"
						value={pngResolution}
						onChange={(event) => setPngResolution(Number(event.target.value))}
						className={inputClass}
					>
						{PNG_RESOLUTIONS.map((res) => (
							<option key={res} value={res}>
								{res}×{res}px
							</option>
						))}
					</select>
				</div>

				{!effectiveBatchMode && (
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								className="min-h-10"
								onClick={handleDownloadPng}
								disabled={downloadDisabled}
								aria-describedby={isEmpty ? 'qr-download-reason' : undefined}
							>
								{messages.downloadPng}
							</Button>
							<Button
								type="button"
								variant="secondary"
								className="min-h-10"
								onClick={handleDownloadSvg}
								disabled={downloadDisabled || frameEnabled}
								aria-describedby={isEmpty ? 'qr-download-reason' : frameEnabled ? 'qr-frame-notice' : undefined}
							>
								{messages.downloadSvg}
							</Button>
						</div>
						{isEmpty && (
							<p id="qr-download-reason" className="text-xs text-muted-foreground">
								{messages.downloadDisabledEmpty}
							</p>
						)}
						{actionError && (
							<p role="alert" className="text-xs text-destructive">
								{actionError}
							</p>
						)}
					</div>
				)}
			</div>

			<div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-md border border-border p-6">
				{!effectiveBatchMode && isEmpty && (
					<p className="max-w-xs text-center text-sm text-muted-foreground">{messages.emptyState}</p>
				)}
				{!effectiveBatchMode && !isEmpty && hasRenderError && (
					<p role="alert" className="max-w-xs text-center text-sm text-destructive">
						{activeError === 'capacity'
							? messages.errorTooLong
							: activeError === 'canvas'
								? messages.errorCanvasSmall
								: messages.errorRender}
					</p>
				)}
				{effectiveBatchMode && (
					<p className="max-w-xs text-center text-sm text-muted-foreground">{messages.batchPreviewNotice}</p>
				)}
				{/* Kept mounted (never removed from the JSX tree), just visually hidden:
				    qr-code-styling's instance holds a reference to this exact DOM node via
				    .append(), and removing it from the tree would leave .update() writing
				    into a detached element. */}
				<div
					ref={containerRef}
					role="img"
					aria-label={ariaLabel}
					style={{ width: size, height: size, maxWidth: '100%' }}
					className={hasRenderError || effectiveBatchMode || isEmpty ? 'hidden' : '[&>canvas]:h-auto [&>canvas]:max-w-full'}
				/>
			</div>
		</div>
	);
}
