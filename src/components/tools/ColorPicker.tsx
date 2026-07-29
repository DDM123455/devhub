import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Unlock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Messages {
	pickerHeading: string;
	hexLabel: string;
	rLabel: string;
	gLabel: string;
	bLabel: string;
	hLabel: string;
	sLabel: string;
	lLabel: string;
	copy: string;
	copied: string;
	harmonyHeading: string;
	harmonyComplementary: string;
	harmonyAnalogous: string;
	harmonyTriadic: string;
	harmonyTetradic: string;
	harmonySplit: string;
	harmonyMonochromatic: string;
	randomHeading: string;
	generate: string;
	generateHint: string;
	lockAria: string;
	unlockAria: string;
	copyPaletteCss: string;
	copyPaletteJson: string;
	contrastHeading: string;
	contrastVsWhite: string;
	contrastVsBlack: string;
	contrastPassAAA: string;
	contrastPassAA: string;
	contrastFail: string;
	invalidHexError: string;
}

interface Rgb {
	r: number;
	g: number;
	b: number;
}

interface Hsl {
	h: number;
	s: number;
	l: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): Rgb | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const int = parseInt(match[1], 16);
	return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
	const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
	else if (max === gn) h = ((bn - rn) / d + 2) * 60;
	else h = ((rn - gn) / d + 4) * 60;
	return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
	const hn = ((h % 360) + 360) % 360;
	const sn = clamp(s, 0, 100) / 100;
	const ln = clamp(l, 0, 100) / 100;
	if (sn === 0) {
		const v = Math.round(ln * 255);
		return { r: v, g: v, b: v };
	}
	const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
	const p = 2 * ln - q;
	const hueToRgb = (t: number) => {
		let tt = t;
		if (tt < 0) tt += 1;
		if (tt > 1) tt -= 1;
		if (tt < 1 / 6) return p + (q - p) * 6 * tt;
		if (tt < 1 / 2) return q;
		if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
		return p;
	};
	const hk = hn / 360;
	return {
		r: Math.round(hueToRgb(hk + 1 / 3) * 255),
		g: Math.round(hueToRgb(hk) * 255),
		b: Math.round(hueToRgb(hk - 1 / 3) * 255),
	};
}

function relativeLuminance({ r, g, b }: Rgb): number {
	const channel = (c: number) => {
		const cs = c / 255;
		return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const lighter = Math.max(la, lb);
	const darker = Math.min(la, lb);
	return (lighter + 0.05) / (darker + 0.05);
}

type HarmonyType = 'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'split' | 'monochromatic';

function generateHarmony(base: Hsl, type: HarmonyType): Hsl[] {
	const { h, s, l } = base;
	switch (type) {
		case 'complementary':
			return [base, { h: h + 180, s, l }];
		case 'analogous':
			return [{ h: h - 30, s, l }, base, { h: h + 30, s, l }];
		case 'triadic':
			return [base, { h: h + 120, s, l }, { h: h + 240, s, l }];
		case 'tetradic':
			return [base, { h: h + 90, s, l }, { h: h + 180, s, l }, { h: h + 270, s, l }];
		case 'split':
			return [base, { h: h + 150, s, l }, { h: h + 210, s, l }];
		case 'monochromatic':
			return [20, 35, 50, 65, 80].map((lightness) => ({ h, s, l: lightness }));
	}
}

function randomHsl(): Hsl {
	return {
		h: Math.round(Math.random() * 360),
		s: Math.round(55 + Math.random() * 25),
		l: Math.round(42 + Math.random() * 20),
	};
}

function Swatch({
	hex,
	label,
	copyLabel,
	copiedLabel,
	locked,
	onToggleLock,
	lockAria,
	unlockAria,
}: {
	hex: string;
	label?: string;
	copyLabel: string;
	copiedLabel: string;
	locked?: boolean;
	onToggleLock?: () => void;
	lockAria?: string;
	unlockAria?: string;
}) {
	const [copied, setCopied] = useState(false);
	const rgb = hexToRgb(hex);
	const textColor = rgb && relativeLuminance(rgb) > 0.4 ? '#111827' : '#ffffff';

	return (
		<div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border">
			<button
				type="button"
				className="flex h-24 w-full flex-col items-center justify-center gap-1 text-xs font-medium"
				style={{ backgroundColor: hex, color: textColor }}
				title={copyLabel}
				onClick={() => {
					void navigator.clipboard.writeText(hex).then(() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1200);
					});
				}}
			>
				<span>{copied ? copiedLabel : hex.toUpperCase()}</span>
			</button>
			<div className="flex items-center justify-between gap-1 bg-muted px-2 py-1">
				<span className="truncate text-xs text-muted-foreground">{label ?? ''}</span>
				{onToggleLock && (
					<button
						type="button"
						aria-label={locked ? unlockAria : lockAria}
						onClick={onToggleLock}
						className="text-muted-foreground hover:text-foreground"
					>
						{locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
					</button>
				)}
			</div>
		</div>
	);
}

export default function ColorPicker({ messages }: { messages: Messages }) {
	const [hex, setHex] = useState('#3b82f6');
	const [hexInput, setHexInput] = useState('#3b82f6');
	const [hexError, setHexError] = useState(false);
	const [harmonyType, setHarmonyType] = useState<HarmonyType>('complementary');
	// Deterministic placeholder so server-rendered and hydrated markup match; randomized on mount below.
	const [palette, setPalette] = useState<Hsl[]>(() => Array(5).fill({ h: 217, s: 91, l: 60 }));
	const [locked, setLocked] = useState<boolean[]>(() => Array(5).fill(false));

	useEffect(() => {
		setPalette(Array.from({ length: 5 }, randomHsl));
	}, []);

	const rgb = useMemo(() => hexToRgb(hex) ?? { r: 0, g: 0, b: 0 }, [hex]);
	const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);

	const applyRgb = useCallback((next: Rgb) => {
		const nextHex = rgbToHex(next);
		setHex(nextHex);
		setHexInput(nextHex);
		setHexError(false);
	}, []);

	const applyHsl = useCallback(
		(next: Hsl) => {
			applyRgb(hslToRgb(next));
		},
		[applyRgb],
	);

	const handleHexInputChange = (value: string) => {
		setHexInput(value);
		const parsed = hexToRgb(value);
		if (parsed) {
			setHex(rgbToHex(parsed));
			setHexError(false);
		} else {
			setHexError(true);
		}
	};

	const regenerate = useCallback(() => {
		setPalette((prev) => prev.map((color, i) => (locked[i] ? color : randomHsl())));
	}, [locked]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const isFormField = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
			if (e.code === 'Space' && !isFormField) {
				e.preventDefault();
				regenerate();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [regenerate]);

	const harmonyColors = useMemo(() => generateHarmony(hsl, harmonyType), [hsl, harmonyType]);

	const contrastWhite = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
	const contrastBlack = contrastRatio(rgb, { r: 0, g: 0, b: 0 });

	const contrastBadge = (ratio: number) => {
		if (ratio >= 7) return { label: messages.contrastPassAAA, className: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' };
		if (ratio >= 4.5) return { label: messages.contrastPassAA, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
		return { label: messages.contrastFail, className: 'bg-destructive/15 text-destructive' };
	};

	const harmonyOptions: { value: HarmonyType; label: string }[] = [
		{ value: 'complementary', label: messages.harmonyComplementary },
		{ value: 'analogous', label: messages.harmonyAnalogous },
		{ value: 'triadic', label: messages.harmonyTriadic },
		{ value: 'tetradic', label: messages.harmonyTetradic },
		{ value: 'split', label: messages.harmonySplit },
		{ value: 'monochromatic', label: messages.harmonyMonochromatic },
	];

	return (
		<div className="flex flex-col gap-6">
			<div className="rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.pickerHeading}</span>
				<div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
					<div className="flex flex-col items-center gap-2">
						<input
							type="color"
							value={hex}
							onChange={(e) => applyRgb(hexToRgb(e.target.value)!)}
							className="h-24 w-24 cursor-pointer rounded-lg border border-border bg-transparent p-1"
						/>
					</div>
					<div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
						<label className="flex flex-col gap-1 text-xs text-muted-foreground">
							{messages.hexLabel}
							<input
								value={hexInput}
								onChange={(e) => handleHexInputChange(e.target.value)}
								spellCheck={false}
								className="rounded-md border border-border bg-background px-2 py-1 font-mono text-sm text-foreground"
							/>
						</label>
						<div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1">
							{(['r', 'g', 'b'] as const).map((channel) => (
								<label key={channel} className="flex flex-col gap-1 text-xs text-muted-foreground">
									{channel === 'r' ? messages.rLabel : channel === 'g' ? messages.gLabel : messages.bLabel}
									<input
										type="number"
										min={0}
										max={255}
										value={rgb[channel]}
										onChange={(e) => applyRgb({ ...rgb, [channel]: clamp(Number(e.target.value), 0, 255) })}
										className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
									/>
								</label>
							))}
						</div>
						<div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-3">
							{(['h', 's', 'l'] as const).map((channel) => (
								<label key={channel} className="flex flex-col gap-1 text-xs text-muted-foreground">
									{channel === 'h' ? messages.hLabel : channel === 's' ? messages.sLabel : messages.lLabel}
									<input
										type="number"
										min={0}
										max={channel === 'h' ? 360 : 100}
										value={hsl[channel]}
										onChange={(e) =>
											applyHsl({ ...hsl, [channel]: clamp(Number(e.target.value), 0, channel === 'h' ? 360 : 100) })
										}
										className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
									/>
								</label>
							))}
						</div>
					</div>
				</div>
				{hexError && <p role="alert" className="mt-2 text-sm text-destructive">{messages.invalidHexError}</p>}
			</div>

			<div className="rounded-lg border border-border p-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-sm font-medium text-foreground">{messages.harmonyHeading}</span>
					<div className="flex flex-wrap gap-1.5">
						{harmonyOptions.map((opt) => (
							<Button
								key={opt.value}
								type="button"
								size="sm"
								variant={harmonyType === opt.value ? 'default' : 'outline'}
								onClick={() => setHarmonyType(opt.value)}
							>
								{opt.label}
							</Button>
						))}
					</div>
				</div>
				<div className="mt-3 flex gap-2">
					{harmonyColors.map((color, i) => (
						<Swatch key={i} hex={rgbToHex(hslToRgb(color))} copyLabel={messages.copy} copiedLabel={messages.copied} />
					))}
				</div>
			</div>

			<div className="rounded-lg border border-border p-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-sm font-medium text-foreground">{messages.randomHeading}</span>
					<div className="flex items-center gap-2">
						<Button type="button" size="sm" variant="outline" onClick={regenerate}>
							<RefreshCw />
							{messages.generate}
						</Button>
					</div>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">{messages.generateHint}</p>
				<div className="mt-3 flex gap-2">
					{palette.map((color, i) => (
						<Swatch
							key={i}
							hex={rgbToHex(hslToRgb(color))}
							copyLabel={messages.copy}
							copiedLabel={messages.copied}
							locked={locked[i]}
							lockAria={messages.lockAria}
							unlockAria={messages.unlockAria}
							onToggleLock={() => setLocked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
						/>
					))}
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => {
							const css = [
								':root {',
								...palette.map((c, i) => `  --color-${i + 1}: ${rgbToHex(hslToRgb(c))};`),
								'}',
							].join('\n');
							void navigator.clipboard.writeText(css);
						}}
					>
						{messages.copyPaletteCss}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => {
							const json = JSON.stringify(palette.map((c) => rgbToHex(hslToRgb(c))), null, 2);
							void navigator.clipboard.writeText(json);
						}}
					>
						{messages.copyPaletteJson}
					</Button>
				</div>
			</div>

			<div className="rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.contrastHeading}</span>
				<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div className="flex items-center justify-between rounded-md border border-border p-3" style={{ backgroundColor: hex }}>
						<span style={{ color: '#ffffff' }} className="text-sm font-medium">
							{messages.contrastVsWhite} — {contrastWhite.toFixed(2)}:1
						</span>
						<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${contrastBadge(contrastWhite).className}`}>
							{contrastBadge(contrastWhite).label}
						</span>
					</div>
					<div className="flex items-center justify-between rounded-md border border-border p-3" style={{ backgroundColor: hex }}>
						<span style={{ color: '#000000' }} className="text-sm font-medium">
							{messages.contrastVsBlack} — {contrastBlack.toFixed(2)}:1
						</span>
						<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${contrastBadge(contrastBlack).className}`}>
							{contrastBadge(contrastBlack).label}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
