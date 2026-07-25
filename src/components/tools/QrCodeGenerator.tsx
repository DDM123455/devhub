import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';

interface Messages {
	textLabel: string;
	textPlaceholder: string;
	fgColorLabel: string;
	bgColorLabel: string;
	sizeLabel: string;
	logoLabel: string;
	removeLogo: string;
	download: string;
}

const MIN_SIZE = 128;
const MAX_SIZE = 512;

export default function QrCodeGenerator({ messages }: { messages: Messages }) {
	const [text, setText] = useState('https://web-tool-hub.example');
	const [fgColor, setFgColor] = useState('#000000');
	const [bgColor, setBgColor] = useState('#ffffff');
	const [size, setSize] = useState(256);
	const [logoUrl, setLogoUrl] = useState<string | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const handleLogoChange = (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setLogoUrl(typeof reader.result === 'string' ? reader.result : null);
		reader.readAsDataURL(file);
	};

	const handleDownload = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const url = canvas.toDataURL('image/png');
		const link = document.createElement('a');
		link.href = url;
		link.download = 'qrcode.png';
		link.click();
	};

	const logoSize = Math.round(size * 0.2);

	return (
		<div className="flex flex-col gap-6 rounded-lg border border-border p-4 md:flex-row">
			<div className="flex flex-col gap-4 md:w-72">
				<div className="flex flex-col gap-1">
					<label htmlFor="qr-text" className="text-sm font-medium text-foreground">
						{messages.textLabel}
					</label>
					<input
						id="qr-text"
						type="text"
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder={messages.textPlaceholder}
						className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
					/>
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
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="mt-1 w-fit"
							onClick={() => setLogoUrl(null)}
						>
							{messages.removeLogo}
						</Button>
					)}
				</div>

				<Button type="button" onClick={handleDownload} disabled={text.trim() === ''}>
					{messages.download}
				</Button>
			</div>

			<div className="flex flex-1 items-center justify-center rounded-md border border-border p-6">
				<QRCodeCanvas
					ref={canvasRef}
					value={text.trim() === '' ? ' ' : text}
					size={size}
					fgColor={fgColor}
					bgColor={bgColor}
					level="H"
					marginSize={2}
					imageSettings={
						logoUrl
							? { src: logoUrl, height: logoSize, width: logoSize, excavate: true }
							: undefined
					}
				/>
			</div>
		</div>
	);
}
