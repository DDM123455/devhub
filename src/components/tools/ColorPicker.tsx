import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Unlock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	bestTextColor,
	clamp,
	contrastRatio,
	hexToRgb,
	hslToRgb,
	isHex3,
	isHex6,
	isPartialHex,
	medianCutQuantize,
	rgbToHex,
	rgbToHsl,
	samePalette,
	sanitizeSavedPalettes,
	type Hsl,
	type Rgb,
	type SavedPalette,
} from '@/lib/color-utils';
import { copyTextSafe } from '@/lib/safe-clipboard';

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
	copyPaletteScss: string;
	copyPaletteTailwind: string;
	exportPaletteAse: string;
	contrastHeading: string;
	contrastVsWhite: string;
	contrastVsBlack: string;
	contrastPassAAA: string;
	contrastPassAA: string;
	contrastFail: string;
	invalidHexError: string;
	savePalette: string;
	savedPalettesHeading: string;
	loadPaletteAria: string;
	deletePaletteAria: string;
	extractFromImageLabel: string;
	copyFailed: string;
	savedFeedback: string;
	alreadySaved: string;
	paletteDeleted: string;
	undo: string;
	extractError: string;
	extractEmpty: string;
	colorInputAria: string;
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

function floatToBEBytes(value: number): number[] {
	const buffer = new ArrayBuffer(4);
	new DataView(buffer).setFloat32(0, value, false);
	return Array.from(new Uint8Array(buffer));
}

function stringToUtf16BENullTerminated(str: string): number[] {
	const bytes: number[] = [];
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);
		bytes.push((code >> 8) & 0xff, code & 0xff);
	}
	bytes.push(0, 0);
	return bytes;
}

// Adobe Swatch Exchange (.ase) — a documented-but-unofficial binary format
// (no public spec from Adobe, reverse-engineered by the design tool
// community years ago) that Illustrator, Photoshop, and Coolors' own "Export
// ASE" all read: 12-byte header ("ASEF" signature + version + block count),
// then one variable-length color-entry block per swatch (name, color model,
// 3 big-endian floats 0–1 for RGB, color type).
function buildAseBlob(hexColors: string[]): Blob {
	const bytes: number[] = [];
	for (const [i, hex] of hexColors.entries()) {
		const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
		const nameBytes = stringToUtf16BENullTerminated(`Color ${i + 1}`);
		const nameLength = nameBytes.length / 2;
		const blockData = [
			(nameLength >> 8) & 0xff,
			nameLength & 0xff,
			...nameBytes,
			0x52, 0x47, 0x42, 0x20, // "RGB " color model, space-padded to 4 bytes
			...floatToBEBytes(rgb.r / 255),
			...floatToBEBytes(rgb.g / 255),
			...floatToBEBytes(rgb.b / 255),
			0x00, 0x02, // color type: process
		];
		const blockLength = blockData.length;
		bytes.push(
			0x00, 0x01, // block type: color entry
			(blockLength >> 24) & 0xff,
			(blockLength >> 16) & 0xff,
			(blockLength >> 8) & 0xff,
			blockLength & 0xff,
			...blockData,
		);
	}
	const header = [
		0x41, 0x53, 0x45, 0x46, // "ASEF" signature
		0x00, 0x01, 0x00, 0x00, // version 1.0
		(hexColors.length >> 24) & 0xff,
		(hexColors.length >> 16) & 0xff,
		(hexColors.length >> 8) & 0xff,
		hexColors.length & 0xff,
	];
	return new Blob([new Uint8Array([...header, ...bytes])], { type: 'application/octet-stream' });
}


const SAVED_PALETTES_STORAGE_KEY = 'color-picker-saved-palettes';
const SAVED_PALETTES_LIMIT = 20;

function readSavedPalettes(): SavedPalette[] {
	try {
		const raw = localStorage.getItem(SAVED_PALETTES_STORAGE_KEY);
		if (!raw) return [];
		return sanitizeSavedPalettes(JSON.parse(raw));
	} catch {
		return [];
	}
}

function writeSavedPalettes(next: SavedPalette[]): void {
	try {
		localStorage.setItem(SAVED_PALETTES_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Ignore quota/private-mode errors — saved palettes are a convenience, not core functionality.
	}
}

function Swatch({
	hex,
	label,
	copyLabel,
	copiedLabel,
	failedLabel,
	locked,
	onToggleLock,
	lockAria,
	unlockAria,
}: {
	hex: string;
	label?: string;
	copyLabel: string;
	copiedLabel: string;
	failedLabel: string;
	locked?: boolean;
	onToggleLock?: () => void;
	lockAria?: string;
	unlockAria?: string;
}) {
	const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const rgb = hexToRgb(hex);
	const textColor = rgb ? bestTextColor(rgb) : '#ffffff';

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	return (
		<div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
			<button
				type="button"
				aria-label={`${copyLabel} ${hex.toUpperCase()}`}
				className="flex h-24 w-full flex-col items-center justify-center gap-1 text-xs font-medium"
				style={{ backgroundColor: hex, color: textColor }}
				title={`${copyLabel} ${hex.toUpperCase()}`}
				onClick={() => {
					void copyTextSafe(hex).then((ok) => {
						setStatus(ok ? 'copied' : 'failed');
						if (timer.current) clearTimeout(timer.current);
						timer.current = setTimeout(() => setStatus('idle'), 1200);
					});
				}}
			>
				<span aria-hidden="true">{status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : hex.toUpperCase()}</span>
			</button>
			<span role="status" className="sr-only">
				{status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : ''}
			</span>
			<div className="flex items-center justify-between gap-1 bg-muted px-2 py-1">
				<span className="truncate text-xs text-muted-foreground">{label ?? ''}</span>
				{onToggleLock && (
					<button
						type="button"
						aria-label={lockAria}
						aria-pressed={!!locked}
						onClick={onToggleLock}
						className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
					>
						{locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
					</button>
				)}
			</div>
		</div>
	);
}

type Channel = 'r' | 'g' | 'b' | 'h' | 's' | 'l';

interface ColorState {
	rgb: Rgb;
	hsl: Hsl;
}

const INITIAL_RGB: Rgb = { r: 59, g: 130, b: 246 };

function isInteractiveTarget(target: HTMLElement | null): boolean {
	if (!target || !(target instanceof Element)) return false;
	if ((target as HTMLElement).isContentEditable) return true;
	return !!target.closest('input, textarea, select, button, a, summary, [role="button"], [role="link"], [contenteditable="true"]');
}

export default function ColorPicker({ messages }: { messages: Messages }) {
	// HSL and RGB are both kept in state: editing one side derives the other, but
	// the side being edited is never re-derived from its lossy counterpart — so
	// hue/saturation survive passing through black, white and gray.
	const [color, setColor] = useState<ColorState>(() => ({ rgb: INITIAL_RGB, hsl: rgbToHsl(INITIAL_RGB) }));
	const [hexInput, setHexInput] = useState(() => rgbToHex(INITIAL_RGB));
	const [hexError, setHexError] = useState(false);
	const [drafts, setDrafts] = useState<Partial<Record<Channel, string>>>({});
	const [harmonyType, setHarmonyType] = useState<HarmonyType>('complementary');
	// Deterministic placeholder so server-rendered and hydrated markup match; randomized on mount below.
	const [palette, setPalette] = useState<Hsl[]>(() => Array(5).fill({ h: 217, s: 91, l: 60 }));
	const [locked, setLocked] = useState<boolean[]>(() => Array(5).fill(false));
	const [copiedKind, setCopiedKind] = useState<string | null>(null);
	const [copyFailed, setCopyFailed] = useState(false);
	// Read from localStorage in an effect (not the useState initializer) so the
	// server-rendered markup and first client render are identical — no hydration mismatch.
	const [savedPalettes, setSavedPalettes] = useState<SavedPalette[]>([]);
	const [notice, setNotice] = useState<string | null>(null);
	const [extractMessage, setExtractMessage] = useState<string | null>(null);
	const [undoDelete, setUndoDelete] = useState<{ palette: SavedPalette; index: number } | null>(null);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const paletteCardRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setPalette(Array.from({ length: 5 }, randomHsl));
		setSavedPalettes(readSavedPalettes());
		const onStorage = (e: StorageEvent) => {
			if (e.key === SAVED_PALETTES_STORAGE_KEY || e.key === null) setSavedPalettes(readSavedPalettes());
		};
		window.addEventListener('storage', onStorage);
		return () => {
			window.removeEventListener('storage', onStorage);
			if (copyTimer.current) clearTimeout(copyTimer.current);
		};
	}, []);

	const { rgb, hsl } = color;
	const hex = useMemo(() => rgbToHex(rgb), [rgb]);

	const applyRgb = useCallback((next: Rgb) => {
		setColor((prev) => ({ rgb: next, hsl: rgbToHsl(next, prev.hsl) }));
		setHexInput(rgbToHex(next));
		setHexError(false);
	}, []);

	const applyHsl = useCallback((next: Hsl) => {
		const nextRgb = hslToRgb(next);
		setColor({ rgb: nextRgb, hsl: next });
		setHexInput(rgbToHex(nextRgb));
		setHexError(false);
	}, []);

	const handleHexInputChange = (value: string) => {
		setHexInput(value);
		if (isHex6(value)) {
			const parsed = hexToRgb(value)!;
			setColor((prev) => ({ rgb: parsed, hsl: rgbToHsl(parsed, prev.hsl) }));
			setHexError(false);
		} else if (isPartialHex(value)) {
			// Still being typed (including a 3-digit prefix of a longer hex) — don't
			// apply or flag anything yet; blur/Enter commits the 3-digit shorthand.
			setHexError(false);
		} else {
			setHexError(true);
		}
	};

	const commitHexInput = () => {
		if (isHex3(hexInput)) {
			applyRgb(hexToRgb(hexInput)!);
		} else if (isHex6(hexInput)) {
			setHexInput(hex);
		} else if (hexInput.trim() === '') {
			setHexInput(hex);
			setHexError(false);
		} else {
			setHexError(true);
		}
	};

	const channelValue = (channel: Channel): number =>
		channel === 'h' || channel === 's' || channel === 'l' ? hsl[channel] : rgb[channel];

	const handleChannelChange = (channel: Channel, raw: string) => {
		setDrafts((prev) => ({ ...prev, [channel]: raw }));
		if (raw.trim() === '' || Number.isNaN(Number(raw))) return; // allow clearing while typing
		const num = Number(raw);
		if (channel === 'r' || channel === 'g' || channel === 'b') {
			applyRgb({ ...rgb, [channel]: clamp(Math.round(num), 0, 255) });
		} else {
			applyHsl({ ...hsl, [channel]: clamp(Math.round(num), 0, channel === 'h' ? 360 : 100) });
		}
	};

	const clearDraft = (channel: Channel) =>
		setDrafts((prev) => {
			const next = { ...prev };
			delete next[channel];
			return next;
		});

	const showCopied = (kind: string, ok: boolean) => {
		setCopiedKind(kind);
		setCopyFailed(!ok);
		if (copyTimer.current) clearTimeout(copyTimer.current);
		copyTimer.current = setTimeout(() => {
			setCopiedKind(null);
			setCopyFailed(false);
		}, 1400);
	};

	const paletteHexes = palette.map((c) => rgbToHex(hslToRgb(c)));

	const copyPalette = (kind: 'css' | 'json' | 'scss' | 'tailwind') => {
		let text: string;
		if (kind === 'css') {
			text = [':root {', ...paletteHexes.map((h, i) => `  --color-${i + 1}: ${h};`), '}'].join('\n');
		} else if (kind === 'json') {
			text = JSON.stringify(paletteHexes, null, 2);
		} else if (kind === 'scss') {
			text = paletteHexes.map((h, i) => `$color-${i + 1}: ${h};`).join('\n');
		} else {
			text = ['colors: {', ...paletteHexes.map((h, i) => `  'palette-${i + 1}': '${h}',`), '}'].join('\n');
		}
		void copyTextSafe(text).then((ok) => showCopied(kind, ok));
	};

	const handleExtractPaletteFromImage = (input: HTMLInputElement) => {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		setExtractMessage(null);
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			// Downscaled before sampling — palette extraction only cares about the
			// overall color distribution, not per-pixel precision.
			const maxDim = 150;
			const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(img.width * scale));
			canvas.height = Math.max(1, Math.round(img.height * scale));
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) {
				setExtractMessage(messages.extractError);
				return;
			}
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			let data: Uint8ClampedArray;
			try {
				data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			} catch {
				setExtractMessage(messages.extractError);
				return;
			}
			const pixels: Rgb[] = [];
			for (let i = 0; i < data.length; i += 4) {
				if (data[i + 3] < 128) continue; // skip mostly-transparent pixels
				pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
			}
			if (pixels.length === 0) {
				setExtractMessage(messages.extractEmpty);
				return;
			}
			const extracted = medianCutQuantize(pixels, 5).map((c) => rgbToHsl(c));
			setPalette(extracted);
			setLocked(Array(extracted.length).fill(false));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			setExtractMessage(messages.extractError);
		};
		img.src = url;
	};

	const regenerate = useCallback(() => {
		setPalette((prev) => prev.map((c, i) => (locked[i] ? c : randomHsl())));
	}, [locked]);

	const flashNotice = (text: string) => {
		setNotice(text);
		setTimeout(() => setNotice((cur) => (cur === text ? null : cur)), 2500);
	};

	const handleSavePalette = () => {
		if (paletteHexes.length === 0) return;
		// Re-read storage first so a save made in another tab is merged, not overwritten.
		const current = readSavedPalettes();
		if (current.some((p) => samePalette(p.colors, paletteHexes))) {
			setSavedPalettes(current);
			flashNotice(messages.alreadySaved);
			return;
		}
		const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, colors: paletteHexes }, ...current].slice(
			0,
			SAVED_PALETTES_LIMIT,
		);
		writeSavedPalettes(next);
		setSavedPalettes(next);
		flashNotice(messages.savedFeedback);
	};

	const handleLoadSavedPalette = (saved: SavedPalette) => {
		setPalette(saved.colors.map((h) => rgbToHsl(hexToRgb(h) ?? { r: 0, g: 0, b: 0 })));
		setLocked(Array(saved.colors.length).fill(false));
	};

	const handleDeleteSavedPalette = (id: string) => {
		const current = readSavedPalettes();
		const index = current.findIndex((entry) => entry.id === id);
		if (index === -1) {
			setSavedPalettes(current);
			return;
		}
		const next = current.filter((entry) => entry.id !== id);
		writeSavedPalettes(next);
		setSavedPalettes(next);
		setUndoDelete({ palette: current[index], index });
	};

	const handleUndoDelete = () => {
		if (!undoDelete) return;
		const current = readSavedPalettes();
		if (!current.some((p) => p.id === undoDelete.palette.id)) {
			current.splice(Math.min(undoDelete.index, current.length), 0, undoDelete.palette);
		}
		const next = current.slice(0, SAVED_PALETTES_LIMIT);
		writeSavedPalettes(next);
		setSavedPalettes(next);
		setUndoDelete(null);
	};

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
			const target = e.target as HTMLElement | null;
			if (isInteractiveTarget(target)) return;
			if (e.code === 'KeyG') {
				regenerate();
				return;
			}
			if (e.code === 'Space' && (target === document.body || target === document.documentElement)) {
				// Only hijack Space while the palette is actually on screen; elsewhere
				// it keeps its normal job of scrolling the page.
				const rect = paletteCardRef.current?.getBoundingClientRect();
				const visible = !!rect && rect.top < window.innerHeight * 0.8 && rect.bottom > window.innerHeight * 0.2;
				if (!visible) return;
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

	const copyButtons: { kind: 'css' | 'json' | 'scss' | 'tailwind'; label: string }[] = [
		{ kind: 'css', label: messages.copyPaletteCss },
		{ kind: 'json', label: messages.copyPaletteJson },
		{ kind: 'scss', label: messages.copyPaletteScss },
		{ kind: 'tailwind', label: messages.copyPaletteTailwind },
	];

	const numberInputClass = 'w-full min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground';
	const channelLabel: Record<Channel, string> = {
		r: messages.rLabel,
		g: messages.gLabel,
		b: messages.bLabel,
		h: messages.hLabel,
		s: messages.sLabel,
		l: messages.lLabel,
	};
	const renderChannel = (channel: Channel) => (
		<label key={channel} className="flex flex-col gap-1 text-xs text-muted-foreground">
			{channelLabel[channel]}
			<input
				type="number"
				inputMode="numeric"
				min={0}
				max={channel === 'h' ? 360 : channel === 's' || channel === 'l' ? 100 : 255}
				value={drafts[channel] ?? String(channelValue(channel))}
				onChange={(e) => handleChannelChange(channel, e.target.value)}
				onBlur={() => clearDraft(channel)}
				className={numberInputClass}
			/>
		</label>
	);

	return (
		<div className="flex flex-col gap-6">
			<div className="rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.pickerHeading}</span>
				<div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
					<div className="flex flex-col items-center gap-2">
						<input
							type="color"
							value={hex}
							aria-label={messages.colorInputAria}
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
								onBlur={commitHexInput}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitHexInput();
								}}
								spellCheck={false}
								aria-invalid={hexError}
								className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground"
							/>
						</label>
						<div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1">{(['r', 'g', 'b'] as const).map(renderChannel)}</div>
						<div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-3">{(['h', 's', 'l'] as const).map(renderChannel)}</div>
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
								aria-pressed={harmonyType === opt.value}
								onClick={() => setHarmonyType(opt.value)}
							>
								{opt.label}
							</Button>
						))}
					</div>
				</div>
				<div className="mt-3 flex gap-2">
					{harmonyColors.map((c, i) => (
						<Swatch
							key={i}
							hex={rgbToHex(hslToRgb(c))}
							copyLabel={messages.copy}
							copiedLabel={messages.copied}
							failedLabel={messages.copyFailed}
						/>
					))}
				</div>
			</div>

			<div ref={paletteCardRef} className="rounded-lg border border-border p-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-sm font-medium text-foreground">{messages.randomHeading}</span>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" size="sm" variant="outline" onClick={regenerate}>
							<RefreshCw />
							{messages.generate}
						</Button>
						<Button type="button" size="sm" variant="outline" onClick={handleSavePalette}>
							{messages.savePalette}
						</Button>
						<label
							htmlFor="color-picker-extract-image"
							className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
						>
							{messages.extractFromImageLabel}
						</label>
						<input
							id="color-picker-extract-image"
							type="file"
							accept="image/*"
							className="sr-only"
							onChange={(event) => handleExtractPaletteFromImage(event.currentTarget)}
						/>
					</div>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">{messages.generateHint}</p>
				<p role="status" className="mt-1 min-h-4 text-xs text-emerald-700 dark:text-emerald-400">
					{notice}
				</p>
				{extractMessage && (
					<p role="alert" className="mt-1 text-sm text-destructive">
						{extractMessage}
					</p>
				)}
				<div className="mt-3 flex gap-2">
					{palette.map((c, i) => (
						<Swatch
							key={i}
							hex={rgbToHex(hslToRgb(c))}
							copyLabel={messages.copy}
							copiedLabel={messages.copied}
							failedLabel={messages.copyFailed}
							locked={locked[i] ?? false}
							lockAria={messages.lockAria}
							unlockAria={messages.unlockAria}
							onToggleLock={() => setLocked((prev) => palette.map((_, idx) => (idx === i ? !prev[idx] : !!prev[idx])))}
						/>
					))}
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					{copyButtons.map((btn) => (
						<Button key={btn.kind} type="button" size="sm" variant="ghost" onClick={() => copyPalette(btn.kind)}>
							{copiedKind === btn.kind ? (copyFailed ? messages.copyFailed : messages.copied) : btn.label}
						</Button>
					))}
					<span role="status" className="sr-only">
						{copiedKind ? (copyFailed ? messages.copyFailed : messages.copied) : ''}
					</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => {
							const blob = buildAseBlob(paletteHexes);
							const url = URL.createObjectURL(blob);
							const link = document.createElement('a');
							link.href = url;
							link.download = 'palette.ase';
							link.click();
							setTimeout(() => URL.revokeObjectURL(url), 10000);
						}}
					>
						{messages.exportPaletteAse}
					</Button>
				</div>
			</div>

			{(savedPalettes.length > 0 || undoDelete) && (
				<div className="rounded-lg border border-border p-4">
					<span className="text-sm font-medium text-foreground">{messages.savedPalettesHeading}</span>
					{undoDelete && (
						<p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
							{messages.paletteDeleted}
							<Button type="button" size="sm" variant="outline" onClick={handleUndoDelete}>
								{messages.undo}
							</Button>
						</p>
					)}
					<ul className="mt-3 flex flex-col gap-2">
						{savedPalettes.map((saved, idx) => (
							<li key={saved.id} className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => handleLoadSavedPalette(saved)}
									aria-label={`${messages.loadPaletteAria} (${idx + 1}): ${saved.colors.join(', ')}`}
									className="flex min-h-10 flex-1 overflow-hidden rounded-md border border-border"
								>
									{saved.colors.map((h, i) => (
										<span key={i} className="h-10 flex-1" style={{ backgroundColor: h }} />
									))}
								</button>
								<Button
									type="button"
									size="icon-sm"
									variant="ghost"
									aria-label={`${messages.deletePaletteAria} (${idx + 1})`}
									onClick={() => handleDeleteSavedPalette(saved.id)}
								>
									✕
								</Button>
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.contrastHeading}</span>
				<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
					{(
						[
							{ label: messages.contrastVsWhite, ratio: contrastWhite, sample: '#ffffff' },
							{ label: messages.contrastVsBlack, ratio: contrastBlack, sample: '#000000' },
						] as const
					).map((row) => (
						<div key={row.sample} className="flex flex-col gap-2 rounded-md border border-border p-3">
							<div className="flex items-center justify-between gap-2">
								<span className="text-sm font-medium text-foreground">
									{row.label} — {row.ratio.toFixed(2)}:1
								</span>
								<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${contrastBadge(row.ratio).className}`}>
									{contrastBadge(row.ratio).label}
								</span>
							</div>
							<div
								aria-hidden="true"
								className="rounded-md px-3 py-2 text-lg font-semibold"
								style={{ backgroundColor: hex, color: row.sample }}
							>
								Aa {hex.toUpperCase()}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
