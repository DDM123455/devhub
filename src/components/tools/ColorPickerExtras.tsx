import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { bestTextColor, contrastRatio, hexToRgb, rgbToHex, rgbToHsl, type Rgb } from '@/lib/color-utils';
import {
	VISION_TYPES,
	apcaContrast,
	encodePaletteHash,
	formatCmyk,
	formatHsv,
	formatHwb,
	formatOklab,
	formatOklch,
	generateShadeScale,
	shadeScaleToCss,
	shadeScaleToJson,
	shadeScaleToTailwind,
	simulateVision,
	wcagLevels,
	type VisionType,
} from '@/lib/color-extra';
import { copyTextSafe } from '@/lib/safe-clipboard';

export interface ExtraMessages {
	formatsHeading: string;
	formatsHint: string;
	eyeDropperButton: string;
	shadesHeading: string;
	shadesHint: string;
	shadesCopyCss: string;
	shadesCopyJson: string;
	shadesCopyTailwind: string;
	customContrastHeading: string;
	customFgLabel: string;
	customBgLabel: string;
	useSelectedFg: string;
	useSelectedBg: string;
	swapColors: string;
	contrastRatioLabel: string;
	wcagNormalAA: string;
	wcagLargeAA: string;
	wcagNormalAAA: string;
	wcagLargeAAA: string;
	passLabel: string;
	failLabel: string;
	apcaLabel: string;
	apcaHint: string;
	sampleText: string;
	invalidColor: string;
	visionHeading: string;
	visionHint: string;
	visionNormal: string;
	visionProtanopia: string;
	visionDeuteranopia: string;
	visionTritanopia: string;
	visionAchromatopsia: string;
	shareCopyLink: string;
	shareNote: string;
	extraCopy: string;
	extraCopied: string;
	extraCopyFailed: string;
}

interface EyeDropperLike {
	open: () => Promise<{ sRGBHex: string }>;
}

function useCopyState() {
	const [key, setKey] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	const copy = (id: string, text: string) => {
		void copyTextSafe(text).then((ok) => {
			setKey(id);
			setFailed(!ok);
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => setKey(null), 1400);
		});
	};
	return { key, failed, copy };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="rounded-lg border border-border p-4">
			<h2 className="text-sm font-medium text-foreground">{title}</h2>
			{children}
		</section>
	);
}

export default function ColorPickerExtras({
	hex,
	rgb,
	paletteHexes,
	onPickColor,
	messages,
}: {
	hex: string;
	rgb: Rgb;
	paletteHexes: string[];
	onPickColor: (hex: string) => void;
	messages: ExtraMessages;
}) {
	const { key: copiedKey, failed: copyFailed, copy } = useCopyState();
	// Feature detection after mount keeps the server-rendered markup and first client render identical.
	const [hasEyeDropper, setHasEyeDropper] = useState(false);
	useEffect(() => {
		setHasEyeDropper(typeof window !== 'undefined' && 'EyeDropper' in window);
	}, []);

	const copyLabel = (id: string, label: string) => (copiedKey === id ? (copyFailed ? messages.extraCopyFailed : messages.extraCopied) : label);

	const handleEyeDropper = async () => {
		try {
			const Ctor = (window as unknown as { EyeDropper: new () => EyeDropperLike }).EyeDropper;
			const result = await new Ctor().open();
			const parsed = hexToRgb(result.sRGBHex);
			if (parsed) onPickColor(rgbToHex(parsed));
		} catch {
			// User cancelled (Esc) — nothing to do.
		}
	};

	// ---- formats ----
	const hsl = rgbToHsl(rgb);
	const formats = useMemo(
		() => [
			{ name: 'HEX', value: hex.toUpperCase() },
			{ name: 'RGB', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
			{ name: 'HSL', value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
			{ name: 'HSB', value: formatHsv(rgb) },
			{ name: 'HWB', value: formatHwb(rgb) },
			{ name: 'CMYK', value: formatCmyk(rgb) },
			{ name: 'OKLab', value: formatOklab(rgb) },
			{ name: 'OKLCH', value: formatOklch(rgb) },
		],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[hex],
	);

	// ---- shades ----
	const shades = useMemo(() => generateShadeScale(rgb), [rgb]);

	// ---- custom contrast ----
	const [fgText, setFgText] = useState('#000000');
	const [bgText, setBgText] = useState('#ffffff');
	const fgRgb = hexToRgb(fgText);
	const bgRgb = hexToRgb(bgText);
	const pair = fgRgb && bgRgb ? { ratio: contrastRatio(fgRgb, bgRgb), lc: apcaContrast(fgRgb, bgRgb) } : null;
	const levels = pair ? wcagLevels(pair.ratio) : null;
	const normalizeHex = (value: string) => (hexToRgb(value) ? rgbToHex(hexToRgb(value)!) : value);

	const colorField = (id: string, label: string, value: string, setValue: (v: string) => void, useSelected: string) => {
		const valid = hexToRgb(value) !== null;
		return (
			<div className="flex flex-col gap-1">
				<label htmlFor={id} className="text-xs text-muted-foreground">
					{label}
				</label>
				<div className="flex items-center gap-2">
					<input
						type="color"
						aria-label={label}
						value={valid ? rgbToHex(hexToRgb(value)!) : '#000000'}
						onChange={(e) => setValue(e.target.value)}
						className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
					/>
					<input
						id={id}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onBlur={() => setValue(normalizeHex(value))}
						spellCheck={false}
						aria-invalid={!valid}
						className="min-h-10 w-28 rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground"
					/>
					<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => setValue(hex)}>
						{useSelected}
					</Button>
				</div>
				{!valid && (
					<p role="alert" className="text-xs text-destructive">
						{messages.invalidColor}
					</p>
				)}
			</div>
		);
	};

	const badge = (ok: boolean) => (
		<span
			className={`rounded-full px-2 py-0.5 text-xs font-medium ${
				ok ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/15 text-destructive'
			}`}
		>
			{ok ? messages.passLabel : messages.failLabel}
		</span>
	);

	// ---- vision ----
	const visionLabels: Record<VisionType | 'normal', string> = {
		normal: messages.visionNormal,
		protanopia: messages.visionProtanopia,
		deuteranopia: messages.visionDeuteranopia,
		tritanopia: messages.visionTritanopia,
		achromatopsia: messages.visionAchromatopsia,
	};
	const visionRows = useMemo(
		() => [
			{ type: 'normal' as const, colors: paletteHexes },
			...VISION_TYPES.map((type) => ({
				type,
				colors: paletteHexes.map((h) => rgbToHex(simulateVision(hexToRgb(h) ?? { r: 0, g: 0, b: 0 }, type))),
			})),
		],
		[paletteHexes],
	);

	const shareUrl = () => `${window.location.origin}${window.location.pathname}${encodePaletteHash(paletteHexes)}`;

	return (
		<>
			<Section title={messages.formatsHeading}>
				<div className="mt-1 flex flex-wrap items-center justify-between gap-2">
					<p className="text-xs text-muted-foreground">{messages.formatsHint}</p>
					{hasEyeDropper && (
						<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => void handleEyeDropper()}>
							{messages.eyeDropperButton}
						</Button>
					)}
				</div>
				<ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
					{formats.map((f) => (
						<li key={f.name} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
							<div className="min-w-0">
								<span className="block text-xs text-muted-foreground">{f.name}</span>
								<code className="block truncate text-sm text-foreground">{f.value}</code>
							</div>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="min-h-9 shrink-0"
								aria-label={`${messages.extraCopy} ${f.name}`}
								onClick={() => copy(`fmt-${f.name}`, f.value)}
							>
								{copyLabel(`fmt-${f.name}`, messages.extraCopy)}
							</Button>
						</li>
					))}
				</ul>
			</Section>

			<Section title={messages.shadesHeading}>
				<p className="mt-1 text-xs text-muted-foreground">{messages.shadesHint}</p>
				<ul className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-11">
					{shades.map((s) => (
						<li key={s.step}>
							<button
								type="button"
								onClick={() => copy(`shade-${s.step}`, s.hex)}
								aria-label={`${messages.extraCopy} ${s.step} ${s.hex.toUpperCase()}`}
								className="flex h-16 w-full flex-col items-center justify-center rounded-md border border-border text-[0.7rem] font-medium"
								style={{ backgroundColor: s.hex, color: bestTextColor(hexToRgb(s.hex)!) }}
							>
								<span>{copiedKey === `shade-${s.step}` ? messages.extraCopied : s.step}</span>
								<span aria-hidden="true" className="opacity-80">
									{s.hex.slice(1)}
								</span>
							</button>
						</li>
					))}
				</ul>
				<div className="mt-3 flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => copy('shades-css', shadeScaleToCss(shades))}>
						{copyLabel('shades-css', messages.shadesCopyCss)}
					</Button>
					<Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => copy('shades-json', shadeScaleToJson(shades))}>
						{copyLabel('shades-json', messages.shadesCopyJson)}
					</Button>
					<Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => copy('shades-tw', shadeScaleToTailwind(shades))}>
						{copyLabel('shades-tw', messages.shadesCopyTailwind)}
					</Button>
				</div>
			</Section>

			<Section title={messages.customContrastHeading}>
				<div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
					{colorField('cp-contrast-fg', messages.customFgLabel, fgText, setFgText, messages.useSelectedFg)}
					{colorField('cp-contrast-bg', messages.customBgLabel, bgText, setBgText, messages.useSelectedBg)}
				</div>
				<div className="mt-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="min-h-9"
						onClick={() => {
							setFgText(bgText);
							setBgText(fgText);
						}}
					>
						{messages.swapColors}
					</Button>
				</div>
				{pair && levels && fgRgb && bgRgb && (
					<div className="mt-3 flex flex-col gap-3">
						<div
							className="rounded-md border border-border px-4 py-3"
							style={{ backgroundColor: rgbToHex(bgRgb), color: rgbToHex(fgRgb) }}
						>
							<p className="text-2xl font-semibold">{messages.sampleText}</p>
							<p className="text-sm">{messages.sampleText}</p>
						</div>
						<p className="text-sm font-medium text-foreground" role="status">
							{messages.contrastRatioLabel}: {pair.ratio.toFixed(2)}:1
						</p>
						<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{(
								[
									[messages.wcagNormalAA, levels.aaNormal],
									[messages.wcagLargeAA, levels.aaLarge],
									[messages.wcagNormalAAA, levels.aaaNormal],
									[messages.wcagLargeAAA, levels.aaaLarge],
								] as const
							).map(([label, ok]) => (
								<li key={label} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground">
									{label}
									{badge(ok)}
								</li>
							))}
						</ul>
						<p className="text-sm text-foreground">
							{messages.apcaLabel}: <strong>{pair.lc.toFixed(1)}</strong>
						</p>
						<p className="text-xs text-muted-foreground">{messages.apcaHint}</p>
					</div>
				)}
			</Section>

			<Section title={messages.visionHeading}>
				<p className="mt-1 text-xs text-muted-foreground">{messages.visionHint}</p>
				<div className="mt-3 flex flex-col gap-2">
					{visionRows.map((row) => (
						<div key={row.type} className="flex flex-col gap-1">
							<span className="text-xs text-muted-foreground">{visionLabels[row.type]}</span>
							<div className="flex overflow-hidden rounded-md border border-border" role="img" aria-label={`${visionLabels[row.type]}: ${row.colors.join(', ')}`}>
								{row.colors.map((c, i) => (
									<span key={i} className="h-10 flex-1" style={{ backgroundColor: c }} />
								))}
							</div>
						</div>
					))}
				</div>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => copy('share', shareUrl())}>
						{copyLabel('share', messages.shareCopyLink)}
					</Button>
					<span className="text-xs text-muted-foreground">{messages.shareNote}</span>
				</div>
			</Section>
		</>
	);
}
