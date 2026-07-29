import { useEffect, useMemo, useRef, useState } from 'react';
import {
	Bold,
	Italic,
	Heading,
	Link,
	Image as ImageIcon,
	List,
	ListOrdered,
	Quote,
	Code,
	Table,
	Minus,
	Columns2,
	Pencil,
	Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Messages {
	viewSplit: string;
	viewEditor: string;
	viewPreview: string;
	boldTitle: string;
	italicTitle: string;
	headingTitle: string;
	linkTitle: string;
	imageTitle: string;
	ulTitle: string;
	olTitle: string;
	quoteTitle: string;
	codeTitle: string;
	tableTitle: string;
	hrTitle: string;
	editorLabel: string;
	previewLabel: string;
	inputPlaceholder: string;
	dropLabel: string;
	chooseFile: string;
	loadSample: string;
	clear: string;
	copyMarkdown: string;
	copyHtml: string;
	copied: string;
	downloadMd: string;
	downloadHtml: string;
	wordCount: string;
}

type ViewMode = 'split' | 'editor' | 'preview';

interface EditResult {
	value: string;
	start: number;
	end: number;
}

const SAMPLE_MARKDOWN = `# Markdown Viewer/Editor

Type on the left, see the **rendered preview** on the right — entirely in your browser.

## Features

- Live GFM preview (tables, task lists, strikethrough)
- Formatting toolbar
- Export as \`.md\` or \`.html\`

## Example table

| Feature | Supported |
| --- | --- |
| Headings | yes |
| ~~Old syntax~~ | dropped |

> Nothing you type here ever leaves your device.

[Learn more about Markdown](https://www.markdownguide.org/)

\`\`\`js
console.log('hello, markdown');
\`\`\`
`;

function wrapInline(before: string, after: string, placeholder: string) {
	return (value: string, start: number, end: number): EditResult => {
		const selected = value.slice(start, end);
		const text = selected || placeholder;
		const newValue = value.slice(0, start) + before + text + after + value.slice(end);
		return { value: newValue, start: start + before.length, end: start + before.length + text.length };
	};
}

function linePrefix(prefixFor: (line: string, index: number) => string) {
	return (value: string, start: number, end: number): EditResult => {
		const lineStart = value.lastIndexOf('\n', start - 1) + 1;
		let lineEnd = value.indexOf('\n', end);
		if (lineEnd === -1) lineEnd = value.length;
		const block = value.slice(lineStart, lineEnd);
		const lines = block.split('\n');
		const newBlock = lines.map((line, i) => prefixFor(line, i)).join('\n');
		const newValue = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
		return { value: newValue, start: lineStart, end: lineStart + newBlock.length };
	};
}

function headingTransform(value: string, start: number): EditResult {
	const lineStart = value.lastIndexOf('\n', start - 1) + 1;
	let lineEnd = value.indexOf('\n', start);
	if (lineEnd === -1) lineEnd = value.length;
	const line = value.slice(lineStart, lineEnd);
	const stripped = line.replace(/^#{1,6}\s*/, '');
	const newLine = `## ${stripped}`;
	const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
	return { value: newValue, start: lineStart, end: lineStart + newLine.length };
}

function codeTransform(value: string, start: number, end: number): EditResult {
	const selected = value.slice(start, end);
	if (selected.includes('\n')) {
		const before = '```\n';
		const after = '\n```';
		const text = selected || 'code';
		const newValue = value.slice(0, start) + before + text + after + value.slice(end);
		return { value: newValue, start: start + before.length, end: start + before.length + text.length };
	}
	return wrapInline('`', '`', 'code')(value, start, end);
}

function tableTransform(value: string, start: number, end: number): EditResult {
	const template = '\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n';
	const newValue = value.slice(0, start) + template + value.slice(end);
	return { value: newValue, start: start + 1, end: start + template.length };
}

function hrTransform(value: string, start: number, end: number): EditResult {
	const insertion = '\n\n---\n\n';
	const newValue = value.slice(0, start) + insertion + value.slice(end);
	return { value: newValue, start: start + insertion.length, end: start + insertion.length };
}

const PREVIEW_CLASSES =
	'[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold ' +
	'[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
	'[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 ' +
	'[&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded ' +
	'[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_pre]:my-2 ' +
	'[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
	'[&_a]:text-primary [&_a]:underline [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-md [&_hr]:my-4 [&_hr]:border-border ' +
	'[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted ' +
	'[&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_strong]:font-semibold [&_em]:italic';

const DRAFT_STORAGE_KEY = 'markdown-editor-draft';
const AUTOSAVE_DEBOUNCE_MS = 500;

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			disabled={value === ''}
			onClick={() => {
				void navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? copiedLabel : label}
		</Button>
	);
}

export default function MarkdownEditor({ messages }: { messages: Messages }) {
	const [content, setContent] = useState('');
	const [renderedHtml, setRenderedHtml] = useState('');
	const [viewMode, setViewMode] = useState<ViewMode>('split');
	const [isDragOver, setIsDragOver] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const previewRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const modulesRef = useRef<{ parse: (md: string) => string; sanitize: (html: string) => string } | null>(null);
	const syncingRef = useRef<'editor' | 'preview' | null>(null);

	// Restore an autosaved draft after mount — localStorage isn't available during Astro's
	// build-time SSR pass, so this must run client-side only, same pattern as the
	// hydration-safe randomization used elsewhere on the site (see ColorPicker).
	useEffect(() => {
		try {
			const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
			if (saved) setContent(saved);
		} catch {
			// localStorage unavailable (private browsing, quota, etc.) — autosave is a
			// convenience, not a requirement, so fail silently.
		}
	}, []);

	// Debounced autosave: an empty editor clears the saved draft instead of persisting an
	// empty string, so clicking "Clear" doesn't leave a stale draft to resurrect later.
	useEffect(() => {
		const timer = setTimeout(() => {
			try {
				if (content) localStorage.setItem(DRAFT_STORAGE_KEY, content);
				else localStorage.removeItem(DRAFT_STORAGE_KEY);
			} catch {
				// See note above — autosave failures are non-fatal.
			}
		}, AUTOSAVE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [content]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!modulesRef.current) {
				const [markedMod, dompurifyMod] = await Promise.all([import('marked'), import('dompurify')]);
				const DOMPurify = dompurifyMod.default;
				modulesRef.current = {
					parse: (md: string) => markedMod.marked.parse(md, { gfm: true, breaks: false, async: false }) as string,
					sanitize: (html: string) => DOMPurify.sanitize(html),
				};
			}
			if (cancelled || !modulesRef.current) return;
			const html = modulesRef.current.sanitize(modulesRef.current.parse(content));
			if (!cancelled) setRenderedHtml(html);
		})();
		return () => {
			cancelled = true;
		};
	}, [content]);

	const { words, chars } = useMemo(() => {
		const trimmed = content.trim();
		return { words: trimmed === '' ? 0 : trimmed.split(/\s+/).length, chars: content.length };
	}, [content]);

	const applyEdit = (transform: (value: string, start: number, end: number) => EditResult) => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const result = transform(textarea.value, textarea.selectionStart, textarea.selectionEnd);
		setContent(result.value);
		requestAnimationFrame(() => {
			textarea.focus();
			textarea.setSelectionRange(result.start, result.end);
		});
	};

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setContent(String(reader.result ?? ''));
		reader.readAsText(file);
	};

	const download = (text: string, filename: string, mime: string) => {
		const blob = new Blob([text], { type: mime });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	};

	const handleEditorScroll = () => {
		if (syncingRef.current === 'preview') {
			syncingRef.current = null;
			return;
		}
		const ta = textareaRef.current;
		const pv = previewRef.current;
		if (!ta || !pv) return;
		const denom = ta.scrollHeight - ta.clientHeight;
		const ratio = denom > 0 ? ta.scrollTop / denom : 0;
		syncingRef.current = 'editor';
		pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
	};

	const handlePreviewScroll = () => {
		if (syncingRef.current === 'editor') {
			syncingRef.current = null;
			return;
		}
		const ta = textareaRef.current;
		const pv = previewRef.current;
		if (!ta || !pv) return;
		const denom = pv.scrollHeight - pv.clientHeight;
		const ratio = denom > 0 ? pv.scrollTop / denom : 0;
		syncingRef.current = 'preview';
		ta.scrollTop = ratio * (ta.scrollHeight - ta.clientHeight);
	};

	const toolbarButtons: Array<{ title: string; icon: React.ReactNode; onClick: () => void }> = [
		{ title: messages.boldTitle, icon: <Bold className="h-4 w-4" />, onClick: () => applyEdit(wrapInline('**', '**', messages.boldTitle)) },
		{ title: messages.italicTitle, icon: <Italic className="h-4 w-4" />, onClick: () => applyEdit(wrapInline('_', '_', messages.italicTitle)) },
		{ title: messages.headingTitle, icon: <Heading className="h-4 w-4" />, onClick: () => applyEdit(headingTransform) },
		{ title: messages.quoteTitle, icon: <Quote className="h-4 w-4" />, onClick: () => applyEdit(linePrefix((line) => `> ${line}`)) },
		{ title: messages.codeTitle, icon: <Code className="h-4 w-4" />, onClick: () => applyEdit(codeTransform) },
		{ title: messages.linkTitle, icon: <Link className="h-4 w-4" />, onClick: () => applyEdit(wrapInline('[', '](https://)', 'link text')) },
		{ title: messages.imageTitle, icon: <ImageIcon className="h-4 w-4" />, onClick: () => applyEdit(wrapInline('![', '](https://)', 'alt text')) },
		{ title: messages.ulTitle, icon: <List className="h-4 w-4" />, onClick: () => applyEdit(linePrefix((line) => `- ${line}`)) },
		{
			title: messages.olTitle,
			icon: <ListOrdered className="h-4 w-4" />,
			onClick: () => applyEdit(linePrefix((line, i) => `${i + 1}. ${line}`)),
		},
		{ title: messages.tableTitle, icon: <Table className="h-4 w-4" />, onClick: () => applyEdit(tableTransform) },
		{ title: messages.hrTitle, icon: <Minus className="h-4 w-4" />, onClick: () => applyEdit(hrTransform) },
	];

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex gap-2">
					<Button type="button" size="sm" variant={viewMode === 'split' ? 'default' : 'outline'} onClick={() => setViewMode('split')}>
						<Columns2 className="mr-1.5 h-4 w-4" />
						{messages.viewSplit}
					</Button>
					<Button type="button" size="sm" variant={viewMode === 'editor' ? 'default' : 'outline'} onClick={() => setViewMode('editor')}>
						<Pencil className="mr-1.5 h-4 w-4" />
						{messages.viewEditor}
					</Button>
					<Button type="button" size="sm" variant={viewMode === 'preview' ? 'default' : 'outline'} onClick={() => setViewMode('preview')}>
						<Eye className="mr-1.5 h-4 w-4" />
						{messages.viewPreview}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					{messages.wordCount.replace('{{words}}', String(words)).replace('{{chars}}', String(chars))}
				</p>
			</div>

			{viewMode !== 'preview' && (
				<div className="flex flex-wrap gap-1 rounded-lg border border-border p-1.5">
					{toolbarButtons.map((btn, i) => (
						<Button key={i} type="button" size="sm" variant="ghost" title={btn.title} aria-label={btn.title} onClick={btn.onClick}>
							{btn.icon}
						</Button>
					))}
				</div>
			)}

			{viewMode !== 'preview' && (
				<div
					className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed p-3 transition-colors ${
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
					<label
						htmlFor="markdown-file-input"
						className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
					>
						{messages.chooseFile}
					</label>
					<input
						id="markdown-file-input"
						ref={fileInputRef}
						type="file"
						accept=".md,.markdown,.txt"
						className="hidden"
						onChange={(e) => handleFile(e.target.files)}
					/>
				</div>
			)}

			<div className={`grid gap-3 ${viewMode === 'split' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
				{viewMode !== 'preview' && (
					<div className="flex flex-col gap-1">
						<label htmlFor="markdown-input" className="text-sm font-medium text-foreground">
							{messages.editorLabel}
						</label>
						<textarea
							id="markdown-input"
							ref={textareaRef}
							value={content}
							onChange={(e) => setContent(e.target.value)}
							onScroll={viewMode === 'split' ? handleEditorScroll : undefined}
							placeholder={messages.inputPlaceholder}
							rows={18}
							spellCheck={false}
							className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
						/>
					</div>
				)}

				{viewMode !== 'editor' && (
					<div className="flex flex-col gap-1">
						<label className="text-sm font-medium text-foreground">{messages.previewLabel}</label>
						<div
							id="markdown-preview"
							ref={previewRef}
							onScroll={viewMode === 'split' ? handlePreviewScroll : undefined}
							className={`h-[27.5rem] overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground ${PREVIEW_CLASSES}`}
							// eslint-disable-next-line react/no-danger
							dangerouslySetInnerHTML={{ __html: renderedHtml }}
						/>
					</div>
				)}
			</div>

			<div className="flex flex-wrap gap-2">
				<Button type="button" size="sm" variant="ghost" onClick={() => setContent(SAMPLE_MARKDOWN)}>
					{messages.loadSample}
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={() => setContent('')}>
					{messages.clear}
				</Button>
				<CopyButton value={content} label={messages.copyMarkdown} copiedLabel={messages.copied} />
				<CopyButton value={renderedHtml} label={messages.copyHtml} copiedLabel={messages.copied} />
				<Button type="button" size="sm" variant="outline" disabled={content === ''} onClick={() => download(content, 'document.md', 'text/markdown')}>
					{messages.downloadMd}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={renderedHtml === ''}
					onClick={() =>
						download(
							`<!doctype html>\n<html><head><meta charset="utf-8"><title>Markdown export</title></head><body>${renderedHtml}</body></html>`,
							'document.html',
							'text/html',
						)
					}
				>
					{messages.downloadHtml}
				</Button>
			</div>
		</div>
	);
}
