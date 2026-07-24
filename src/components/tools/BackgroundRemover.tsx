import { useCallback, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';
import { Button } from '@/components/ui/button';

interface Messages {
	selectFiles: string;
	dropHint: string;
	remove: string;
	removing: string;
	download: string;
	original: string;
	result: string;
	noFiles: string;
	errorGeneric: string;
	modelNotice: string;
}

interface ImageItem {
	id: string;
	file: File;
	previewUrl: string;
	status: 'pending' | 'processing' | 'done' | 'error';
	resultBlob?: Blob;
	resultUrl?: string;
	progress?: number;
}

export default function BackgroundRemover({ messages }: { messages: Messages }) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);

	const handleFiles = useCallback((fileList: FileList | null) => {
		if (!fileList) return;
		const newItems: ImageItem[] = Array.from(fileList)
			.filter((file) => file.type.startsWith('image/'))
			.map((file) => ({
				id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
				file,
				previewUrl: URL.createObjectURL(file),
				status: 'pending' as const,
			}));
		setItems((prev) => [...prev, ...newItems]);
	}, []);

	const handleRemove = useCallback(async () => {
		setIsProcessing(true);
		for (const item of items) {
			if (item.status === 'done') continue;
			setItems((prev) =>
				prev.map((it) => (it.id === item.id ? { ...it, status: 'processing', progress: 0 } : it)),
			);
			try {
				const resultBlob = await removeBackground(item.file, {
					output: { format: 'image/png' },
					progress: (_key, current, total) => {
						const percent = total > 0 ? Math.round((current / total) * 100) : 0;
						setItems((prev) =>
							prev.map((it) => (it.id === item.id ? { ...it, progress: percent } : it)),
						);
					},
				});
				const resultUrl = URL.createObjectURL(resultBlob);
				setItems((prev) =>
					prev.map((it) =>
						it.id === item.id ? { ...it, status: 'done', resultBlob, resultUrl } : it,
					),
				);
			} catch {
				setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
			}
		}
		setIsProcessing(false);
	}, [items]);

	const handleDownload = useCallback((item: ImageItem) => {
		if (!item.resultBlob) return;
		const url = URL.createObjectURL(item.resultBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${item.file.name.replace(/\.[^./\\]+$/, '')}-no-bg.png`;
		link.click();
		URL.revokeObjectURL(url);
	}, []);

	const canRemove =
		!isProcessing && items.length > 0 && items.some((item) => item.status !== 'done');

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
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
					handleFiles(event.dataTransfer.files);
				}}
			>
				<label
					htmlFor="background-remover-input"
					className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
				>
					{messages.selectFiles}
				</label>
				<input
					id="background-remover-input"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					multiple
					className="hidden"
					onChange={(event) => handleFiles(event.target.files)}
				/>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
			</div>

			<p className="text-xs text-muted-foreground">{messages.modelNotice}</p>

			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">{messages.noFiles}</p>
			) : (
				<ul className="flex flex-col gap-3">
					{items.map((item) => (
						<li
							key={item.id}
							className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2 text-sm"
						>
							<img
								src={item.previewUrl}
								alt={`${messages.original}: ${item.file.name}`}
								className="h-16 w-16 shrink-0 rounded object-cover"
							/>
							{item.resultUrl && (
								<img
									src={item.resultUrl}
									alt={`${messages.result}: ${item.file.name}`}
									className="h-16 w-16 shrink-0 rounded bg-[repeating-conic-gradient(#e5e5e5_0%_25%,transparent_0%_50%)] bg-[length:12px_12px] object-cover"
								/>
							)}
							<div className="flex flex-1 flex-col gap-1">
								<span className="truncate text-foreground">{item.file.name}</span>
								{item.status === 'processing' && (
									<span className="text-muted-foreground">
										{messages.removing.replace('{{percent}}', String(item.progress ?? 0))}
									</span>
								)}
								{item.status === 'error' && (
									<span className="text-destructive">{messages.errorGeneric}</span>
								)}
							</div>
							{item.status === 'done' && item.resultBlob && (
								<Button type="button" size="sm" onClick={() => handleDownload(item)}>
									{messages.download}
								</Button>
							)}
						</li>
					))}
				</ul>
			)}

			<div>
				<Button type="button" onClick={handleRemove} disabled={!canRemove}>
					{isProcessing
						? messages.removing.replace(
								'{{percent}}',
								String(items.find((item) => item.status === 'processing')?.progress ?? 0),
							)
						: messages.remove}
				</Button>
			</div>
		</div>
	);
}
