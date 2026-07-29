import { Component, useMemo, useRef, useState, type ReactNode } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';

// qrcode.react throws a plain RangeError ("Data too long") when the payload
// doesn't fit the QR code's capacity at the chosen error-correction level —
// with no error boundary that uncaught render error unmounts this entire
// component (React's default behavior), leaving a blank tool with no way to
// recover except a full page reload. This boundary catches it so a too-long
// vCard/WiFi/URL/etc. degrades to an inline message instead of a blank page.
class QrErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { hasError: boolean }> {
	state = { hasError: false };
	static getDerivedStateFromError() {
		return { hasError: true };
	}
	componentDidCatch() {
		this.props.onError();
	}
	render() {
		return this.state.hasError ? null : this.props.children;
	}
}

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
}

type ContentType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'sms';
type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
type WifiEncryption = 'WPA' | 'WEP' | 'nopass';

interface WifiFields {
	ssid: string;
	password: string;
	encryption: WifiEncryption;
	hidden: boolean;
}

interface VCardFields {
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	org: string;
	url: string;
}

interface EmailFields {
	to: string;
	subject: string;
	body: string;
}

interface SmsFields {
	phone: string;
	message: string;
}

const MIN_SIZE = 128;
const MAX_SIZE = 512;
const PNG_RESOLUTIONS = [256, 512, 1024, 2048];
const SVG_EXPORT_SIZE = 1024;

// Special characters in a WIFI: payload must be backslash-escaped per the format
// most scanners (Android, iOS, Zebra Crossing) agree on informally — there's no
// official spec, this is the de facto convention every QR generator follows.
function escapeWifiField(value: string): string {
	return value.replace(/([\\;,":])/g, '\\$1');
}

function buildWifiPayload(w: WifiFields): string {
	const parts = [`T:${w.encryption}`, `S:${escapeWifiField(w.ssid)}`];
	if (w.encryption !== 'nopass') parts.push(`P:${escapeWifiField(w.password)}`);
	if (w.hidden) parts.push('H:true');
	return `WIFI:${parts.join(';')};;`;
}

function buildVCardPayload(v: VCardFields): string {
	const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
	if (v.firstName || v.lastName) {
		lines.push(`N:${v.lastName};${v.firstName};;;`);
		lines.push(`FN:${[v.firstName, v.lastName].filter(Boolean).join(' ')}`);
	}
	if (v.org) lines.push(`ORG:${v.org}`);
	if (v.phone) lines.push(`TEL:${v.phone}`);
	if (v.email) lines.push(`EMAIL:${v.email}`);
	if (v.url) lines.push(`URL:${v.url}`);
	lines.push('END:VCARD');
	return lines.join('\n');
}

function buildEmailPayload(e: EmailFields): string {
	const params = new URLSearchParams();
	if (e.subject) params.set('subject', e.subject);
	if (e.body) params.set('body', e.body);
	const query = params.toString();
	return `mailto:${e.to}${query ? `?${query}` : ''}`;
}

// SMSTO:<phone>:<message> is the format nearly every QR scanner recognizes,
// predating (and more broadly supported than) the sms: URI scheme.
function buildSmsPayload(s: SmsFields): string {
	return `SMSTO:${s.phone}:${s.message}`;
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
	const [pngResolution, setPngResolution] = useState(1024);
	const [erroredRenderKey, setErroredRenderKey] = useState<string | null>(null);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const exportCanvasRef = useRef<HTMLCanvasElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);

	const { qrValue, isEmpty } = useMemo(() => {
		switch (contentType) {
			case 'url':
				return { qrValue: urlValue.trim(), isEmpty: urlValue.trim() === '' };
			case 'text':
				return { qrValue: textValue.trim(), isEmpty: textValue.trim() === '' };
			case 'wifi':
				return { qrValue: buildWifiPayload(wifi), isEmpty: wifi.ssid.trim() === '' };
			case 'vcard':
				return {
					qrValue: buildVCardPayload(vcard),
					isEmpty: !vcard.firstName.trim() && !vcard.lastName.trim() && !vcard.phone.trim() && !vcard.email.trim(),
				};
			case 'email':
				return { qrValue: buildEmailPayload(email), isEmpty: email.to.trim() === '' };
			case 'sms':
				return { qrValue: buildSmsPayload(sms), isEmpty: sms.phone.trim() === '' };
		}
	}, [contentType, urlValue, textValue, wifi, vcard, email, sms]);

	const renderValue = isEmpty ? ' ' : qrValue;
	const renderKey = `${renderValue}-${level}`;
	// Derived (not stored via a separate reset effect) so there's no race between
	// "a new value should optimistically retry" and "onError just marked this
	// value as failing" — whichever runs, this always reflects the current attempt.
	const tooLong = erroredRenderKey === renderKey;

	const logoSize = Math.round(size * 0.2);
	const exportLogoSize = Math.round(pngResolution * 0.2);
	const svgLogoSize = Math.round(SVG_EXPORT_SIZE * 0.2);

	const handleLogoChange = (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			setLogoUrl(typeof reader.result === 'string' ? reader.result : null);
			// A logo covers part of the pattern, so give it more redundancy to stay
			// scannable — but don't fight a level the user already raised themselves.
			setLevel((prev) => (prev === 'L' || prev === 'M' ? 'H' : prev));
		};
		reader.readAsDataURL(file);
	};

	const handleDownloadPng = () => {
		const canvas = exportCanvasRef.current;
		if (!canvas) return;
		const url = canvas.toDataURL('image/png');
		const link = document.createElement('a');
		link.href = url;
		link.download = 'qrcode.png';
		link.click();
	};

	const handleDownloadSvg = () => {
		const svg = svgRef.current;
		if (!svg) return;
		const serialized = new XMLSerializer().serializeToString(svg);
		const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'qrcode.svg';
		link.click();
		URL.revokeObjectURL(url);
	};

	const contentTypeOptions: Array<{ value: ContentType; label: string }> = [
		{ value: 'url', label: messages.typeUrl },
		{ value: 'text', label: messages.typeText },
		{ value: 'wifi', label: messages.typeWifi },
		{ value: 'vcard', label: messages.typeVcard },
		{ value: 'email', label: messages.typeEmail },
		{ value: 'sms', label: messages.typeSms },
	];

	const inputClass =
		'w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground';

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

				{contentType === 'url' && (
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
					</div>
				)}

				{contentType === 'text' && (
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
						<label className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground">
							<input
								type="checkbox"
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
							className="h-9 w-16 cursor-pointer rounded-md border border-border bg-background"
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
							className="h-9 w-16 cursor-pointer rounded-md border border-border bg-background"
						/>
					</div>
				</div>

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
						onChange={(event) => handleLogoChange(event.target.files)}
						className="text-sm text-foreground"
					/>
					{logoUrl && (
						<Button type="button" size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setLogoUrl(null)}>
							{messages.removeLogo}
						</Button>
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

				<div className="flex flex-wrap gap-2">
					<Button type="button" onClick={handleDownloadPng} disabled={isEmpty || tooLong}>
						{messages.downloadPng}
					</Button>
					<Button type="button" variant="secondary" onClick={handleDownloadSvg} disabled={isEmpty || tooLong}>
						{messages.downloadSvg}
					</Button>
				</div>
			</div>

			<div className="flex flex-1 items-center justify-center rounded-md border border-border p-6">
				{tooLong ? (
					<p role="alert" className="max-w-xs text-center text-sm text-destructive">{messages.errorTooLong}</p>
				) : (
					<QrErrorBoundary key={renderKey} onError={() => setErroredRenderKey(renderKey)}>
						<QRCodeCanvas
							ref={canvasRef}
							value={renderValue}
							size={size}
							fgColor={fgColor}
							bgColor={bgColor}
							level={level}
							marginSize={2}
							imageSettings={logoUrl ? { src: logoUrl, height: logoSize, width: logoSize, excavate: true } : undefined}
						/>
					</QrErrorBoundary>
				)}
			</div>

			{/* Hidden renders used purely as export sources: a high-resolution canvas for the
			    PNG download (decoupled from the on-screen preview size) and a vector SVG for
			    the SVG download — both kept off-screen rather than reused from the visible
			    preview so the user can pick a PNG resolution independent of what looks good
			    on screen. */}
			<div className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden="true">
				<QrErrorBoundary key={`export-${renderKey}`} onError={() => setErroredRenderKey(renderKey)}>
					<QRCodeCanvas
						ref={exportCanvasRef}
						value={renderValue}
						size={pngResolution}
						fgColor={fgColor}
						bgColor={bgColor}
						level={level}
						marginSize={2}
						imageSettings={
							logoUrl ? { src: logoUrl, height: exportLogoSize, width: exportLogoSize, excavate: true } : undefined
						}
					/>
					<QRCodeSVG
						ref={svgRef}
						value={renderValue}
						size={SVG_EXPORT_SIZE}
						fgColor={fgColor}
						bgColor={bgColor}
						level={level}
						marginSize={2}
						imageSettings={
							logoUrl ? { src: logoUrl, height: svgLogoSize, width: svgLogoSize, excavate: true } : undefined
						}
					/>
				</QrErrorBoundary>
			</div>
		</div>
	);
}
