import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type QRCodeStyling from 'qr-code-styling';
import type { CornerDotType, CornerSquareType, DotType, GradientType, Options } from 'qr-code-styling';
import {
	BATCH_MAX_LINES,
	DEFAULT_QR_DESIGN,
	batchBaseName,
	buildBitcoinPayload,
	buildEmailPayload,
	buildEventPayload,
	buildGeoPayload,
	buildMeCardPayload,
	buildPhonePayload,
	buildSmsPayload,
	buildVCardPayload,
	buildWhatsAppPayload,
	buildWifiPayload,
	isValidBitcoinAmount,
	normalizeUrlInput,
	parseBatchLines,
	parseQrDesignJson,
	pdfPlacement,
	qrAriaLabel,
	qrContrastWarning,
	quietZoneMargin,
	sanitizeQrDesign,
	uniqueName,
	utf8ToBinaryString,
	type BitcoinFields,
	type EmailFields,
	type EventFields,
	type GeoFields,
	type MeCardFields,
	type PhoneFields,
	type QrDesign,
	type SmsFields,
	type VCardFields,
	type WhatsAppFields,
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
	typePhone: string;
	typeMecard: string;
	typeGeo: string;
	typeEvent: string;
	typeBitcoin: string;
	typeWhatsapp: string;
	phoneLabel: string;
	mecardAddressLabel: string;
	mecardNoteLabel: string;
	geoLatLabel: string;
	geoLngLabel: string;
	geoInvalid: string;
	eventTitleLabel: string;
	eventStartLabel: string;
	eventEndLabel: string;
	eventAllDayLabel: string;
	eventLocationLabel: string;
	eventDescriptionLabel: string;
	bitcoinAddressLabel: string;
	bitcoinAmountLabel: string;
	bitcoinLabelLabel: string;
	bitcoinMessageLabel: string;
	bitcoinAmountInvalid: string;
	whatsappPhoneLabel: string;
	whatsappMessageLabel: string;
	advancedHeading: string;
	eyesHeading: string;
	eyeSquareStyleLabel: string;
	eyeDotStyleLabel: string;
	eyeSameAsBody: string;
	eyeSquareStyleSquare: string;
	eyeSquareStyleDot: string;
	eyeSquareStyleExtraRounded: string;
	eyeDotStyleSquare: string;
	eyeDotStyleDot: string;
	eyeColorOverrideLabel: string;
	eyeSquareColorLabel: string;
	eyeDotColorLabel: string;
	downloadJpeg: string;
	downloadPdf: string;
	pdfLayoutLabel: string;
	pdfLayoutA4: string;
	pdfLayoutFit: string;
	designHeading: string;
	designSave: string;
	designLoad: string;
	designExport: string;
	designImport: string;
	designSaved: string;
	designLoaded: string;
	designNoneSaved: string;
	designImportError: string;
	designLogoNote: string;
}

type ContentType =
	| 'url'
	| 'text'
	| 'wifi'
	| 'vcard'
	| 'email'
	| 'sms'
	| 'phone'
	| 'mecard'
	| 'geo'
	| 'event'
	| 'bitcoin'
	| 'whatsapp';
type ExportFormat = 'png' | 'jpeg' | 'pdf';

const DESIGN_STORAGE_KEY = 'webtoolhub.qr.design.v1';
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

const FIELD_CLASS = 'min-h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground';

function TextField({
	id,
	label,
	value,
	onChange,
	type = 'text',
	multiline = false,
	inputMode,
	describedBy,
	invalid = false,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: string;
	multiline?: boolean;
	inputMode?: 'text' | 'decimal' | 'tel' | 'numeric';
	describedBy?: string;
	invalid?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-sm font-medium text-foreground">
				{label}
			</label>
			{multiline ? (
				<textarea
					id={id}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					rows={3}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					className={FIELD_CLASS}
				/>
			) : (
				<input
					id={id}
					type={type}
					inputMode={inputMode}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					className={FIELD_CLASS}
				/>
			)}
		</div>
	);
}

function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// SVG counterpart of composeFramedPng: wraps the generated <svg> in a larger
// one with a border and an optional <text> caption. The caption uses the
// generic sans-serif family, so its exact glyphs depend on the viewer's fonts.
async function composeFramedSvg(qrSvgBlob: Blob, frameText: string, size: number): Promise<Blob> {
	const raw = await qrSvgBlob.text();
	const inner = new DOMParser().parseFromString(raw, 'image/svg+xml').documentElement;
	if (!inner || inner.nodeName.toLowerCase() !== 'svg') throw new Error('invalid svg');
	const padding = Math.round(size * 0.08);
	const textArea = frameText.trim() ? Math.round(size * 0.16) : 0;
	const border = Math.max(2, Math.round(size * 0.008));
	const width = size + padding * 2;
	const height = size + padding * 2 + textArea;
	inner.setAttribute('x', String(padding));
	inner.setAttribute('y', String(padding));
	inner.setAttribute('width', String(size));
	inner.setAttribute('height', String(size));
	const innerMarkup = new XMLSerializer().serializeToString(inner);
	const caption = frameText.trim()
		? `<text x="${width / 2}" y="${size + padding * 2 + textArea / 2}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="bold" font-size="${Math.round(textArea * 0.45)}" fill="#000000">${escapeXml(frameText.trim())}</text>`
		: '';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/><rect x="${border / 2}" y="${border / 2}" width="${width - border}" height="${height - border}" fill="none" stroke="#000000" stroke-width="${border}"/>${innerMarkup}${caption}</svg>`;
	return new Blob([svg], { type: 'image/svg+xml' });
}

async function pngBlobToJpegBlob(png: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(png);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return new Promise((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg toBlob null'))), 'image/jpeg', 0.95);
	});
}

async function pngBlobToPdfBlob(png: Blob, layout: 'a4' | 'fit'): Promise<Blob> {
	const { PDFDocument } = await import('pdf-lib');
	const bitmap = await createImageBitmap(png);
	const px = Math.max(bitmap.width, bitmap.height);
	const aspect = bitmap.height / bitmap.width;
	bitmap.close();
	const place = pdfPlacement(px, layout);
	const doc = await PDFDocument.create();
	const page = doc.addPage([place.pageW, place.pageH]);
	const image = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
	const w = place.size;
	const h = place.size * aspect;
	page.drawImage(image, { x: (place.pageW - w) / 2, y: (place.pageH - h) / 2, width: w, height: h });
	const bytes = await doc.save();
	return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export default function QrCodeGenerator({ messages }: { messages: Messages }) {
	const [contentType, setContentType] = useState<ContentType>('url');
	const [urlValue, setUrlValue] = useState('https://web-tool-hub.example');
	const [textValue, setTextValue] = useState('');
	const [wifi, setWifi] = useState<WifiFields>({ ssid: '', password: '', encryption: 'WPA', hidden: false });
	const [vcard, setVcard] = useState<VCardFields>({ firstName: '', lastName: '', phone: '', email: '', org: '', url: '' });
	const [email, setEmail] = useState<EmailFields>({ to: '', subject: '', body: '' });
	const [sms, setSms] = useState<SmsFields>({ phone: '', message: '' });
	const [phone, setPhone] = useState<PhoneFields>({ phone: '' });
	const [mecard, setMecard] = useState<MeCardFields>({ firstName: '', lastName: '', phone: '', email: '', url: '', address: '', note: '' });
	const [geo, setGeo] = useState<GeoFields>({ lat: '', lng: '' });
	const [eventFields, setEventFields] = useState<EventFields>({ title: '', start: '', end: '', allDay: false, location: '', description: '' });
	const [bitcoin, setBitcoin] = useState<BitcoinFields>({ address: '', amount: '', label: '', message: '' });
	const [whatsapp, setWhatsapp] = useState<WhatsAppFields>({ phone: '', message: '' });

	// Finder-pattern ("eye") overrides; '' = follow the body dot style / colour.
	const [cornerSquareType, setCornerSquareType] = useState<CornerSquareType | ''>('');
	const [cornerDotType, setCornerDotType] = useState<CornerDotType | ''>('');
	const [eyeColorEnabled, setEyeColorEnabled] = useState(false);
	const [cornerSquareColor, setCornerSquareColor] = useState('#000000');
	const [cornerDotColor, setCornerDotColor] = useState('#000000');
	const [pdfLayout, setPdfLayout] = useState<'a4' | 'fit'>('a4');
	const [designNotice, setDesignNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

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
			case 'phone': {
				const v = buildPhonePayload(phone);
				return { qrValue: v, isEmpty: v === '', summary: v };
			}
			case 'mecard': {
				const v = buildMeCardPayload(mecard);
				return {
					qrValue: v,
					isEmpty: v === '',
					summary: [mecard.firstName, mecard.lastName].filter(Boolean).join(' ') || mecard.phone || mecard.email,
				};
			}
			case 'geo': {
				const v = buildGeoPayload(geo);
				return { qrValue: v, isEmpty: v === '', summary: v };
			}
			case 'event': {
				const v = buildEventPayload(eventFields);
				return { qrValue: v, isEmpty: v === '', summary: eventFields.title.trim() };
			}
			case 'bitcoin': {
				const v = buildBitcoinPayload(bitcoin);
				return { qrValue: v, isEmpty: v === '', summary: bitcoin.address.trim() };
			}
			case 'whatsapp': {
				const v = buildWhatsAppPayload(whatsapp);
				return { qrValue: v, isEmpty: v === '', summary: whatsapp.phone.trim() };
			}
		}
	}, [contentType, urlNormalized, textValue, wifi, vcard, email, sms, phone, mecard, geo, eventFields, bitcoin, whatsapp]);

	const geoInvalid = contentType === 'geo' && (geo.lat.trim() !== '' || geo.lng.trim() !== '') && isEmpty;
	const bitcoinAmountInvalid =
		contentType === 'bitcoin' && bitcoin.amount.trim() !== '' && !isValidBitcoinAmount(bitcoin.amount.trim().replace(',', '.'));

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
			cornersSquareOptions: {
				type: cornerSquareType || dotsType,
				...(eyeColorEnabled ? { color: cornerSquareColor } : dotsStyle),
			},
			cornersDotOptions: {
				type: cornerDotType || dotsType,
				...(eyeColorEnabled ? { color: cornerDotColor } : dotsStyle),
			},
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
	}, [effectiveBatchMode, isEmpty, renderKey, level, fgColor, bgColor, size, logoUrl, dotsType, gradientEnabled, gradientType, gradientColorStart, gradientColorEnd, cornerSquareType, cornerDotType, eyeColorEnabled, cornerSquareColor, cornerDotColor]);

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

	const handleExport = async (format: ExportFormat) => {
		if (downloadDisabled) return;
		setActionError(null);
		try {
			const { default: QRCodeStylingCtor } = await import('qr-code-styling');
			const exportQr = new QRCodeStylingCtor(buildQrOptions({ width: pngResolution, height: pngResolution, type: 'canvas' }));
			let png: Blob;
			if (frameEnabled) {
				const raw = await exportQr.getRawData('png');
				if (!raw) throw new Error('empty png');
				png = await composeFramedPng(raw as Blob, effectiveFrameText);
			} else if (format === 'png') {
				await exportQr.download({ name: 'qrcode', extension: 'png' });
				return;
			} else {
				const raw = await exportQr.getRawData('png');
				if (!raw) throw new Error('empty png');
				png = raw as Blob;
			}
			if (format === 'png') saveBlob(png, 'qrcode.png');
			else if (format === 'jpeg') saveBlob(await pngBlobToJpegBlob(png), 'qrcode.jpg');
			else saveBlob(await pngBlobToPdfBlob(png, pdfLayout), 'qrcode.pdf');
		} catch (err) {
			console.error('QR export failed:', err);
			setActionError(typeof err === 'string' && /too small/i.test(err) ? messages.errorCanvasSmall : messages.downloadError);
		}
	};

	const handleDownloadPng = () => handleExport('png');

	const handleDownloadSvg = async () => {
		if (downloadDisabled) return;
		setActionError(null);
		try {
			const { default: QRCodeStylingCtor } = await import('qr-code-styling');
			const exportQr = new QRCodeStylingCtor(buildQrOptions({ width: SVG_EXPORT_SIZE, height: SVG_EXPORT_SIZE, type: 'svg' }));
			if (frameEnabled) {
				const raw = await exportQr.getRawData('svg');
				if (!raw) throw new Error('empty svg');
				saveBlob(await composeFramedSvg(raw as Blob, effectiveFrameText, SVG_EXPORT_SIZE), 'qrcode.svg');
			} else {
				await exportQr.download({ name: 'qrcode', extension: 'svg' });
			}
		} catch (err) {
			console.error('QR SVG export failed:', err);
			setActionError(messages.downloadError);
		}
	};

	// ---- Design templates (colours/styles only; the logo and content are not stored) ----
	const currentDesign = (): QrDesign => ({
		...DEFAULT_QR_DESIGN,
		fgColor,
		bgColor,
		dotsType,
		level,
		size,
		gradientEnabled,
		gradientType: gradientType === 'radial' ? 'radial' : 'linear',
		gradientColorStart,
		gradientColorEnd,
		cornerSquareType,
		cornerDotType,
		cornerSquareColor: eyeColorEnabled ? cornerSquareColor : '',
		cornerDotColor: eyeColorEnabled ? cornerDotColor : '',
	});

	const applyDesign = (d: QrDesign) => {
		setFgColor(d.fgColor);
		setBgColor(d.bgColor);
		setDotsType(d.dotsType as DotType);
		setLevel(d.level as ErrorCorrectionLevel);
		setSize(d.size);
		setGradientEnabled(d.gradientEnabled);
		setGradientType(d.gradientType);
		setGradientColorStart(d.gradientColorStart);
		setGradientColorEnd(d.gradientColorEnd);
		setCornerSquareType(d.cornerSquareType as CornerSquareType | '');
		setCornerDotType(d.cornerDotType as CornerDotType | '');
		const hasEyeColor = d.cornerSquareColor !== '' || d.cornerDotColor !== '';
		setEyeColorEnabled(hasEyeColor);
		setCornerSquareColor(d.cornerSquareColor || d.fgColor);
		setCornerDotColor(d.cornerDotColor || d.fgColor);
		levelBeforeLogoRef.current = null;
	};

	const handleSaveDesign = () => {
		try {
			localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(currentDesign()));
			setDesignNotice({ kind: 'ok', text: messages.designSaved });
		} catch {
			setDesignNotice({ kind: 'error', text: messages.downloadError });
		}
	};

	const handleLoadDesign = () => {
		let design: QrDesign | null = null;
		try {
			const raw = localStorage.getItem(DESIGN_STORAGE_KEY);
			design = raw ? parseQrDesignJson(raw) : null;
		} catch {
			design = null;
		}
		if (!design) {
			setDesignNotice({ kind: 'error', text: messages.designNoneSaved });
			return;
		}
		applyDesign(design);
		setDesignNotice({ kind: 'ok', text: messages.designLoaded });
	};

	const handleExportDesign = () => {
		saveBlob(new Blob([JSON.stringify(currentDesign(), null, 2)], { type: 'application/json' }), 'qr-design.json');
	};

	const handleImportDesign = (input: HTMLInputElement) => {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > 100_000) {
			setDesignNotice({ kind: 'error', text: messages.designImportError });
			return;
		}
		void file.text().then((text) => {
			const design = parseQrDesignJson(text);
			if (!design) {
				setDesignNotice({ kind: 'error', text: messages.designImportError });
				return;
			}
			applyDesign(sanitizeQrDesign(design) ?? design);
			setDesignNotice({ kind: 'ok', text: messages.designLoaded });
		});
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
		{ value: 'phone', label: messages.typePhone },
		{ value: 'mecard', label: messages.typeMecard },
		{ value: 'geo', label: messages.typeGeo },
		{ value: 'event', label: messages.typeEvent },
		{ value: 'bitcoin', label: messages.typeBitcoin },
		{ value: 'whatsapp', label: messages.typeWhatsapp },
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

				{contentType === 'phone' && (
					<TextField
						id="qr-phone"
						label={messages.phoneLabel}
						type="tel"
						inputMode="tel"
						value={phone.phone}
						onChange={(v) => setPhone({ phone: v })}
					/>
				)}

				{contentType === 'mecard' && (
					<div className="flex flex-col gap-3">
						<div className="grid grid-cols-2 gap-2">
							<TextField id="qr-mecard-first" label={messages.vcardFirstNameLabel} value={mecard.firstName} onChange={(v) => setMecard((p) => ({ ...p, firstName: v }))} />
							<TextField id="qr-mecard-last" label={messages.vcardLastNameLabel} value={mecard.lastName} onChange={(v) => setMecard((p) => ({ ...p, lastName: v }))} />
						</div>
						<TextField id="qr-mecard-phone" label={messages.vcardPhoneLabel} type="tel" inputMode="tel" value={mecard.phone} onChange={(v) => setMecard((p) => ({ ...p, phone: v }))} />
						<TextField id="qr-mecard-email" label={messages.vcardEmailLabel} value={mecard.email} onChange={(v) => setMecard((p) => ({ ...p, email: v }))} />
						<TextField id="qr-mecard-url" label={messages.vcardUrlLabel} value={mecard.url} onChange={(v) => setMecard((p) => ({ ...p, url: v }))} />
						<TextField id="qr-mecard-address" label={messages.mecardAddressLabel} value={mecard.address} onChange={(v) => setMecard((p) => ({ ...p, address: v }))} />
						<TextField id="qr-mecard-note" label={messages.mecardNoteLabel} value={mecard.note} onChange={(v) => setMecard((p) => ({ ...p, note: v }))} />
					</div>
				)}

				{contentType === 'geo' && (
					<div className="flex flex-col gap-2">
						<div className="grid grid-cols-2 gap-2">
							<TextField id="qr-geo-lat" label={messages.geoLatLabel} inputMode="decimal" value={geo.lat} invalid={geoInvalid} describedBy={geoInvalid ? 'qr-geo-error' : undefined} onChange={(v) => setGeo((p) => ({ ...p, lat: v }))} />
							<TextField id="qr-geo-lng" label={messages.geoLngLabel} inputMode="decimal" value={geo.lng} invalid={geoInvalid} describedBy={geoInvalid ? 'qr-geo-error' : undefined} onChange={(v) => setGeo((p) => ({ ...p, lng: v }))} />
						</div>
						{geoInvalid && (
							<p id="qr-geo-error" role="alert" className="text-xs text-destructive">
								{messages.geoInvalid}
							</p>
						)}
					</div>
				)}

				{contentType === 'event' && (
					<div className="flex flex-col gap-3">
						<TextField id="qr-event-title" label={messages.eventTitleLabel} value={eventFields.title} onChange={(v) => setEventFields((p) => ({ ...p, title: v }))} />
						<label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
							<input
								type="checkbox"
								className="size-4"
								checked={eventFields.allDay}
								onChange={(event) => setEventFields((p) => ({ ...p, allDay: event.target.checked, start: '', end: '' }))}
							/>
							{messages.eventAllDayLabel}
						</label>
						<TextField id="qr-event-start" label={messages.eventStartLabel} type={eventFields.allDay ? 'date' : 'datetime-local'} value={eventFields.start} onChange={(v) => setEventFields((p) => ({ ...p, start: v }))} />
						<TextField id="qr-event-end" label={messages.eventEndLabel} type={eventFields.allDay ? 'date' : 'datetime-local'} value={eventFields.end} onChange={(v) => setEventFields((p) => ({ ...p, end: v }))} />
						<TextField id="qr-event-location" label={messages.eventLocationLabel} value={eventFields.location} onChange={(v) => setEventFields((p) => ({ ...p, location: v }))} />
						<TextField id="qr-event-description" label={messages.eventDescriptionLabel} multiline value={eventFields.description} onChange={(v) => setEventFields((p) => ({ ...p, description: v }))} />
					</div>
				)}

				{contentType === 'bitcoin' && (
					<div className="flex flex-col gap-3">
						<TextField id="qr-btc-address" label={messages.bitcoinAddressLabel} value={bitcoin.address} onChange={(v) => setBitcoin((p) => ({ ...p, address: v }))} />
						<TextField id="qr-btc-amount" label={messages.bitcoinAmountLabel} inputMode="decimal" value={bitcoin.amount} invalid={bitcoinAmountInvalid} describedBy={bitcoinAmountInvalid ? 'qr-btc-amount-error' : undefined} onChange={(v) => setBitcoin((p) => ({ ...p, amount: v }))} />
						{bitcoinAmountInvalid && (
							<p id="qr-btc-amount-error" role="alert" className="text-xs text-destructive">
								{messages.bitcoinAmountInvalid}
							</p>
						)}
						<TextField id="qr-btc-label" label={messages.bitcoinLabelLabel} value={bitcoin.label} onChange={(v) => setBitcoin((p) => ({ ...p, label: v }))} />
						<TextField id="qr-btc-message" label={messages.bitcoinMessageLabel} value={bitcoin.message} onChange={(v) => setBitcoin((p) => ({ ...p, message: v }))} />
					</div>
				)}

				{contentType === 'whatsapp' && (
					<div className="flex flex-col gap-3">
						<TextField id="qr-wa-phone" label={messages.whatsappPhoneLabel} type="tel" inputMode="tel" value={whatsapp.phone} onChange={(v) => setWhatsapp((p) => ({ ...p, phone: v }))} />
						<TextField id="qr-wa-message" label={messages.whatsappMessageLabel} multiline value={whatsapp.message} onChange={(v) => setWhatsapp((p) => ({ ...p, message: v }))} />
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
					<p role="status" className="w-fit rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-400">
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

				<details className="rounded-md border border-border p-3">
					<summary className="min-h-9 cursor-pointer text-sm font-medium text-foreground">{messages.advancedHeading}</summary>
					<div className="mt-3 flex flex-col gap-4">
						<fieldset className="flex flex-col gap-2">
							<legend className="text-sm font-medium text-foreground">{messages.eyesHeading}</legend>
							<div className="flex flex-col gap-1">
								<label htmlFor="qr-eye-square-style" className="text-xs text-muted-foreground">
									{messages.eyeSquareStyleLabel}
								</label>
								<select
									id="qr-eye-square-style"
									value={cornerSquareType}
									onChange={(event) => setCornerSquareType(event.target.value as CornerSquareType | '')}
									className={inputClass}
								>
									<option value="">{messages.eyeSameAsBody}</option>
									<option value="square">{messages.eyeSquareStyleSquare}</option>
									<option value="dot">{messages.eyeSquareStyleDot}</option>
									<option value="extra-rounded">{messages.eyeSquareStyleExtraRounded}</option>
								</select>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="qr-eye-dot-style" className="text-xs text-muted-foreground">
									{messages.eyeDotStyleLabel}
								</label>
								<select
									id="qr-eye-dot-style"
									value={cornerDotType}
									onChange={(event) => setCornerDotType(event.target.value as CornerDotType | '')}
									className={inputClass}
								>
									<option value="">{messages.eyeSameAsBody}</option>
									<option value="square">{messages.eyeDotStyleSquare}</option>
									<option value="dot">{messages.eyeDotStyleDot}</option>
								</select>
							</div>
							<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
								<input
									type="checkbox"
									className="size-4"
									checked={eyeColorEnabled}
									onChange={(event) => {
										setEyeColorEnabled(event.target.checked);
										if (event.target.checked) {
											setCornerSquareColor(fgColor);
											setCornerDotColor(fgColor);
										}
									}}
								/>
								{messages.eyeColorOverrideLabel}
							</label>
							{eyeColorEnabled && (
								<div className="flex gap-4">
									<div className="flex flex-col gap-1">
										<label htmlFor="qr-eye-square-color" className="text-xs text-muted-foreground">
											{messages.eyeSquareColorLabel}
										</label>
										<input
											id="qr-eye-square-color"
											type="color"
											value={cornerSquareColor}
											onChange={(event) => setCornerSquareColor(event.target.value)}
											className="h-11 w-16 cursor-pointer rounded-md border border-border bg-background"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label htmlFor="qr-eye-dot-color" className="text-xs text-muted-foreground">
											{messages.eyeDotColorLabel}
										</label>
										<input
											id="qr-eye-dot-color"
											type="color"
											value={cornerDotColor}
											onChange={(event) => setCornerDotColor(event.target.value)}
											className="h-11 w-16 cursor-pointer rounded-md border border-border bg-background"
										/>
									</div>
								</div>
							)}
						</fieldset>

						<div className="flex flex-col gap-1">
							<label htmlFor="qr-pdf-layout" className="text-sm font-medium text-foreground">
								{messages.pdfLayoutLabel}
							</label>
							<select
								id="qr-pdf-layout"
								value={pdfLayout}
								onChange={(event) => setPdfLayout(event.target.value as 'a4' | 'fit')}
								className={inputClass}
							>
								<option value="a4">{messages.pdfLayoutA4}</option>
								<option value="fit">{messages.pdfLayoutFit}</option>
							</select>
						</div>

						<fieldset className="flex flex-col gap-2">
							<legend className="text-sm font-medium text-foreground">{messages.designHeading}</legend>
							<div className="flex flex-wrap gap-2">
								<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={handleSaveDesign}>
									{messages.designSave}
								</Button>
								<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={handleLoadDesign}>
									{messages.designLoad}
								</Button>
								<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={handleExportDesign}>
									{messages.designExport}
								</Button>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="qr-design-import" className="text-xs text-muted-foreground">
									{messages.designImport}
								</label>
								<input
									id="qr-design-import"
									type="file"
									accept="application/json,.json"
									onChange={(event) => handleImportDesign(event.currentTarget)}
									className="text-sm text-foreground"
								/>
							</div>
							<p className="text-xs text-muted-foreground">{messages.designLogoNote}</p>
							{designNotice && (
								<p role={designNotice.kind === 'error' ? 'alert' : 'status'} className={designNotice.kind === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
									{designNotice.text}
								</p>
							)}
						</fieldset>
					</div>
				</details>

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
								disabled={downloadDisabled}
								aria-describedby={isEmpty ? 'qr-download-reason' : undefined}
							>
								{messages.downloadSvg}
							</Button>
							<Button
								type="button"
								variant="secondary"
								className="min-h-10"
								onClick={() => void handleExport('jpeg')}
								disabled={downloadDisabled}
								aria-describedby={isEmpty ? 'qr-download-reason' : undefined}
							>
								{messages.downloadJpeg}
							</Button>
							<Button
								type="button"
								variant="secondary"
								className="min-h-10"
								onClick={() => void handleExport('pdf')}
								disabled={downloadDisabled}
								aria-describedby={isEmpty ? 'qr-download-reason' : undefined}
							>
								{messages.downloadPdf}
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
