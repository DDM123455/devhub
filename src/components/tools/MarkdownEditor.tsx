import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
	Search,
	Printer,
	Maximize2,
	Minimize2,
	Plus,
	X,
} from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap, placeholder } from '@codemirror/view';
import { EditorState, Prec, type StateCommand } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { openSearchPanel } from '@codemirror/search';
import { Button } from '@/components/ui/button';
import { buildExportHtml, createSlugger, escapeHtml, MAX_MARKDOWN_RENDER_CHARS } from '@/lib/markdown-utils';
import {
	canAddDoc,
	deriveDocTitle,
	extractMath,
	extractOutline,
	newDocId,
	parseDocsState,
	restoreMath,
	type MarkdownDoc,
	type OutlineItem,
} from '@/lib/markdown-extra';
import { useCopyToClipboard } from './useCopyToClipboard';

function CopyButton({
	value,
	label,
	copiedLabel,
	failedLabel,
}: {
	value: string;
	label: string;
	copiedLabel: string;
	failedLabel: string;
}) {
	const { copied, failed, copy } = useCopyToClipboard();
	return (
		<Button aria-live="polite" type="button" size="sm" variant="ghost" disabled={value === ''} onClick={() => void copy(value)}>
			{copied ? copiedLabel : failed ? failedLabel : label}
		</Button>
	);
}

const RENDER_DEBOUNCE_MS = 150;
const UNDO_TIMEOUT_MS = 8000;
// Remote content a Markdown document can pull in is not something the preview should load or style.
const FORBIDDEN_TAGS = ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'];

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
	exportTitle: string;
	previewAria: string;
	largeInputWarning: string;
	remoteImagesNote: string;
	replacedNotice: string;
	undo: string;
	draftSaved: string;
	draftSaveFailed: string;
	copyFailed: string;
	fileReadError: string;
	x: {
		tabsLabel: string;
		newDoc: string;
		closeDoc: string;
		closeConfirm: string;
		untitled: string;
		docLimit: string;
		outlineHeading: string;
		outlineEmpty: string;
		exportPdf: string;
		exportPdfHint: string;
		findReplace: string;
		zen: string;
		exitZen: string;
		fontSize: string;
		phrases: Record<string, string>;
	};
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

// `@codemirror/lang-markdown`'s own Enter-key list-continuation command
// (`insertNewlineContinueMarkup`, bound via `markdown()`'s `markdownKeymap`)
// has a real dead-end for a plain top-level tight list: pasting a line that
// starts with "- " and pressing Enter auto-continues it with a fresh empty
// "- " marker (expected), but pressing Enter *again* on that empty marker —
// the normal way to stop a list in GitHub, Notion, or Typora — does nothing
// at all. Confirmed by calling the library's command directly against that
// exact document/selection: it reports the keystroke as handled but produces
// a byte-for-byte identical document every time, so the user is stuck typing
// Enter with no visible result. This binds our own fallback at the highest
// precedence: an empty marker line at the cursor gets its marker cleared
// (exiting the list) here; every other case returns `false` so the
// library's own Enter binding still runs exactly as before.
const exitEmptyListItem: StateCommand = ({ state, dispatch }) => {
	const sel = state.selection.main;
	if (!sel.empty) return false;
	const line = state.doc.lineAt(sel.head);
	if (sel.head !== line.to) return false;
	if (!/^\s*(?:[-*+]|\d+[.)])\s+$/.test(line.text)) return false;
	dispatch(
		state.update({
			changes: { from: line.from, to: line.to, insert: '' },
			selection: { anchor: line.from },
			scrollIntoView: true,
			userEvent: 'delete',
		}),
	);
	return true;
};

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
const DOCS_STORAGE_KEY = 'markdown-editor-docs';
const FONT_SIZES = [12, 14, 16, 18, 20];
const AUTOSAVE_DEBOUNCE_MS = 500;

// Colors reference the site's own CSS custom properties (defined in
// global.css for both light and `.dark`) instead of a packaged CodeMirror
// theme — the editor then matches whichever mode is active automatically,
// with no JS-side dark-mode detection needed.
const editorTheme = EditorView.theme({
	'&': {
		backgroundColor: 'var(--background)',
		color: 'var(--foreground)',
		fontSize: 'var(--md-font-size, 12px)',
		height: 'var(--md-editor-height, 27.5rem)',
	},
	'.cm-scroller': {
		fontFamily: 'var(--font-mono), ui-monospace, monospace',
		overflow: 'auto',
	},
	'.cm-content': {
		caretColor: 'var(--foreground)',
	},
	'.cm-gutters': {
		backgroundColor: 'var(--muted)',
		color: 'var(--muted-foreground)',
		border: 'none',
	},
	'.cm-activeLine': {
		backgroundColor: 'var(--muted)',
	},
	'.cm-activeLineGutter': {
		backgroundColor: 'var(--muted)',
	},
	'&.cm-focused': {
		outline: 'none',
	},
});

export default function MarkdownEditor({ messages, lang = 'en' }: { messages: Messages; lang?: string }) {
	const [content, setContent] = useState('');
	const [renderedHtml, setRenderedHtml] = useState('');
	const [viewMode, setViewMode] = useState<ViewMode>('split');
	const [isDragOver, setIsDragOver] = useState(false);
	const editorContainerRef = useRef<HTMLDivElement>(null);
	const editorViewRef = useRef<EditorView | null>(null);
	const previewRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const modulesRef = useRef<{ parse: (md: string) => string; sanitize: (html: string) => string } | null>(null);
	const [draftStatus, setDraftStatus] = useState<'saved' | 'failed' | null>(null);
	const [undoSnapshot, setUndoSnapshot] = useState<string | null>(null);
	const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [fileError, setFileError] = useState(false);
	const [docs, setDocs] = useState<MarkdownDoc[]>(() => [{ id: 'doc-initial', content: '' }]);
	const [activeId, setActiveId] = useState('doc-initial');
	const [docsReady, setDocsReady] = useState(false);
	const [outline, setOutline] = useState<OutlineItem[]>([]);
	const [hljsCss, setHljsCss] = useState('');
	const [fontSize, setFontSize] = useState(12);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const hljsRef = useRef<typeof import('@/lib/hljs-lazy') | null>(null);
	const katexRef = useRef<typeof import('katex').default | null>(null);
	const isTooLarge = content.length > MAX_MARKDOWN_RENDER_CHARS;

	// Replacing the whole document (Clear / Load sample / file drop) is destructive, so the
	// previous text is kept for a few seconds and offered back through an Undo button.
	const replaceContent = (next: string) => {
		if (content !== '' && content !== next) {
			setUndoSnapshot(content);
			if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
			undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), UNDO_TIMEOUT_MS);
		}
		setContent(next);
	};
	const handleUndo = () => {
		if (undoSnapshot === null) return;
		setContent(undoSnapshot);
		setUndoSnapshot(null);
		if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
	};
	useEffect(
		() => () => {
			if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
		},
		[],
	);
	const syncingRef = useRef<'editor' | 'preview' | null>(null);

	// Restore the saved documents after mount - localStorage isn't available during Astro's
	// build-time SSR pass, so this must run client-side only. Falls back to the single-draft key
	// used before multi-document support existed.
	useEffect(() => {
		try {
			const stored = parseDocsState(localStorage.getItem(DOCS_STORAGE_KEY));
			if (stored) {
				setDocs(stored.docs);
				setActiveId(stored.activeId);
				setContent(stored.docs.find((d) => d.id === stored.activeId)?.content ?? '');
			} else {
				const legacy = localStorage.getItem(DRAFT_STORAGE_KEY);
				if (legacy) setContent(legacy);
			}
		} catch {
			// localStorage unavailable (private browsing, quota, etc.) - autosave is a convenience.
		}
		setDocsReady(true);
	}, []);

	// The stored copy of the active document is always the live `content`.
	const snapshotDocs = useCallback(
		() => docs.map((d) => (d.id === activeId ? { ...d, content } : d)),
		[docs, activeId, content],
	);

	// Debounced autosave of every document. A single empty document removes the saved state
	// instead of persisting an empty string, so "Clear" doesn't leave a stale draft behind.
	useEffect(() => {
		if (!docsReady) return;
		const timer = setTimeout(() => {
			try {
				const snapshot = snapshotDocs();
				if (snapshot.length === 1 && snapshot[0].content === '') {
					localStorage.removeItem(DOCS_STORAGE_KEY);
					localStorage.removeItem(DRAFT_STORAGE_KEY);
					setDraftStatus(null);
				} else {
					localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify({ docs: snapshot, activeId }));
					localStorage.removeItem(DRAFT_STORAGE_KEY);
					setDraftStatus('saved');
				}
			} catch {
				// Quota exceeded / storage unavailable - tell the user the draft is NOT being kept.
				setDraftStatus('failed');
			}
		}, AUTOSAVE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [docsReady, snapshotDocs, activeId]);

	const switchToDoc = (id: string) => {
		if (id === activeId) return;
		const snapshot = snapshotDocs();
		const target = snapshot.find((d) => d.id === id);
		if (!target) return;
		setDocs(snapshot);
		setActiveId(id);
		setContent(target.content);
		setUndoSnapshot(null);
	};

	const addDoc = () => {
		const snapshot = snapshotDocs();
		if (!canAddDoc(snapshot)) return;
		const doc: MarkdownDoc = { id: newDocId(), content: '' };
		setDocs([...snapshot, doc]);
		setActiveId(doc.id);
		setContent('');
		setUndoSnapshot(null);
	};

	const closeDoc = (id: string) => {
		const snapshot = snapshotDocs();
		if (snapshot.length <= 1) return;
		const doc = snapshot.find((d) => d.id === id);
		if (!doc) return;
		if (doc.content.trim() !== '' && !window.confirm(messages.x.closeConfirm)) return;
		const index = snapshot.findIndex((d) => d.id === id);
		const remaining = snapshot.filter((d) => d.id !== id);
		setDocs(remaining);
		if (id === activeId) {
			const next = remaining[Math.min(index, remaining.length - 1)];
			setActiveId(next.id);
			setContent(next.content);
			setUndoSnapshot(null);
		}
	};

	// Parsing + sanitising run after a short debounce (not on every keystroke) and are skipped
	// entirely for very large documents: marked can take pathological time on some inputs, and
	// it runs on the main thread (DOMPurify needs the DOM, so it cannot move to a worker).
	useEffect(() => {
		let cancelled = false;
		if (content.length > MAX_MARKDOWN_RENDER_CHARS) {
			setRenderedHtml('');
			return;
		}
		const timer = setTimeout(async () => {
			if (!modulesRef.current) {
				const [markedMod, dompurifyMod] = await Promise.all([import('marked'), import('dompurify')]);
				const DOMPurify = dompurifyMod.default;
				// Links open in a new tab without leaking window.opener (pure #anchors stay in-page).
				DOMPurify.addHook('afterSanitizeAttributes', (node) => {
					if (node.tagName === 'A' && node.getAttribute('href') && !node.getAttribute('href')!.startsWith('#')) {
						node.setAttribute('target', '_blank');
						node.setAttribute('rel', 'noopener noreferrer');
					}
				});
				modulesRef.current = {
					parse: (md: string) => {
						const nextSlug = createSlugger();
						return markedMod.marked.parse(md, {
							gfm: true,
							breaks: false,
							async: false,
							renderer: (() => {
								const renderer = new markedMod.Renderer();
								renderer.code = function (token) {
									const lang = (token.lang ?? '').match(/^\S*/)?.[0] ?? '';
									const highlighted = hljsRef.current?.highlightCode(token.text, lang) ?? null;
									const classes = highlighted !== null ? `hljs language-${escapeHtml(lang)}` : lang ? `language-${escapeHtml(lang)}` : '';
									return `<pre><code${classes ? ` class="${classes}"` : ''}>${highlighted ?? escapeHtml(token.text)}</code></pre>\n`;
								};
								const base = renderer.heading.bind(renderer);
								renderer.heading = function (token) {
									const html = base(token);
									const id = nextSlug(token.text);
									return html.replace(/^<h([1-6])/, `<h$1 id="${id}"`);
								};
								return renderer;
							})(),
						}) as string;
					},
					sanitize: (html: string) => DOMPurify.sanitize(html, { FORBID_TAGS: FORBIDDEN_TAGS }),
				};
			}
			if (cancelled || !modulesRef.current) return;
			// Syntax highlighting: load highlight.js (common languages only) the first time a
			// fenced block with a language tag appears.
			if (!hljsRef.current && /^\s*(?:```|~~~)\s*[\w+#.-]+/m.test(content)) {
				try {
					hljsRef.current = await import('@/lib/hljs-lazy');
					setHljsCss(hljsRef.current.HLJS_CSS);
				} catch {
					// highlighting is optional - fall back to plain code blocks
				}
			}
			// Math: formulas are swapped for placeholders before parsing, sanitized with the rest of
			// the document, and replaced with KaTeX output (trust disabled) afterwards. KaTeX itself is
			// only loaded when the text really contains a formula.
			const math = content.includes('$') ? extractMath(content) : { text: content, segments: [] };
			let html = modulesRef.current.sanitize(modulesRef.current.parse(math.text));
			if (math.segments.length > 0) {
				try {
					if (!katexRef.current) {
						const [katexMod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
						katexRef.current = katexMod.default;
					}
					const katex = katexRef.current;
					html = restoreMath(
						html,
						math.segments.map((segment) =>
							katex.renderToString(segment.tex, {
								displayMode: segment.display,
								throwOnError: false,
								trust: false,
								strict: 'ignore',
								maxExpand: 1000,
								maxSize: 50,
							}),
						),
					);
				} catch {
					html = restoreMath(
						html,
						math.segments.map((segment) => escapeHtml(segment.display ? `$$${segment.tex}$$` : `$${segment.tex}$`)),
					);
				}
			}
			if (cancelled) return;
			setRenderedHtml(html);
			setOutline(extractOutline(html));
		}, RENDER_DEBOUNCE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [content]);

	const { words, chars } = useMemo(() => {
		const trimmed = content.trim();
		return { words: trimmed === '' ? 0 : trimmed.split(/\s+/).length, chars: content.length };
	}, [content]);

	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	// Applies one of the pure (value, start, end) => EditResult transforms
	// above by reading the current document/selection straight out of the
	// CodeMirror view and dispatching a transaction — the transforms
	// themselves are untouched from the plain-textarea version, since they
	// only ever operated on strings and offsets to begin with.
	const applyEdit = useCallback((transform: (value: string, start: number, end: number) => EditResult) => {
		const view = editorViewRef.current;
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const value = view.state.doc.toString();
		const result = transform(value, from, to);
		view.dispatch({
			changes: { from: 0, to: value.length, insert: result.value },
			selection: { anchor: result.start, head: result.end },
		});
		view.focus();
	}, []);

	const applyEditRef = useRef(applyEdit);
	applyEditRef.current = applyEdit;

	// Mounted once and kept alive across `viewMode` changes (the container div
	// stays in the tree, just hidden via CSS in preview-only mode — removing
	// it would tear down CodeMirror's own DOM without a matching recreation
	// step). Extensions reference `messagesRef`/`applyEditRef` so the Ctrl+B/
	// Ctrl+I handler and initial doc don't need the view recreated when props
	// change.
	useEffect(() => {
		const container = editorContainerRef.current;
		if (!container || editorViewRef.current) return;
		const view = new EditorView({
			state: EditorState.create({
				doc: content,
				extensions: [
					basicSetup,
					EditorState.phrases.of(messagesRef.current.x.phrases),
					markdown(),
					// Must outrank markdown()'s own `Prec.high` Enter binding, or that
					// binding intercepts Enter first and this fallback never runs.
					Prec.highest(keymap.of([{ key: 'Enter', run: exitEmptyListItem }])),
					EditorView.lineWrapping,
											placeholder(messagesRef.current.inputPlaceholder),
						EditorView.contentAttributes.of({ 'aria-label': messagesRef.current.editorLabel }),
					editorTheme,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) setContent(update.state.doc.toString());
					}),
					EditorView.domEventHandlers({
						keydown: (event) => {
							if (!(event.ctrlKey || event.metaKey)) return false;
							if (event.key === 'b' || event.key === 'B') {
								event.preventDefault();
								applyEditRef.current(wrapInline('**', '**', messagesRef.current.boldTitle));
								return true;
							}
							if (event.key === 'i' || event.key === 'I') {
								event.preventDefault();
								applyEditRef.current(wrapInline('_', '_', messagesRef.current.italicTitle));
								return true;
							}
							return false;
						},
					}),
				],
			}),
			parent: container,
		});
		editorViewRef.current = view;

		const scroller = view.scrollDOM;
		const onScroll = () => handleEditorScrollRef.current();
		scroller.addEventListener('scroll', onScroll);

		return () => {
			scroller.removeEventListener('scroll', onScroll);
			view.destroy();
			editorViewRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Pushes external content changes (load sample, clear, file upload,
	// restored draft) into the view. Typing inside the editor already updates
	// `content` to match the view's own doc via the update listener above, so
	// this is a no-op on every keystroke — it only actually dispatches when
	// `content` changed for some OTHER reason.
	useEffect(() => {
		const view = editorViewRef.current;
		if (!view) return;
		const currentDoc = view.state.doc.toString();
		if (currentDoc !== content) {
			view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: content } });
		}
	}, [content]);

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setFileError(false);
		const reader = new FileReader();
		reader.onload = () => replaceContent(String(reader.result ?? ''));
		reader.onerror = () => setFileError(true);
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

	// CodeMirror's actual scrollable element is `view.scrollDOM`, not the
	// container div React renders — the mount effect attaches a native
	// `scroll` listener to it directly (scroll events don't bubble, so a
	// React `onScroll` prop on the container wouldn't fire for it).
	const handleEditorScroll = useCallback(() => {
		if (syncingRef.current === 'preview') {
			syncingRef.current = null;
			return;
		}
		const scroller = editorViewRef.current?.scrollDOM;
		const pv = previewRef.current;
		if (!scroller || !pv) return;
		const denom = scroller.scrollHeight - scroller.clientHeight;
		const ratio = denom > 0 ? scroller.scrollTop / denom : 0;
		syncingRef.current = 'editor';
		pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
	}, []);

	const handleEditorScrollRef = useRef(handleEditorScroll);
	handleEditorScrollRef.current = handleEditorScroll;

	const handlePreviewScroll = () => {
		if (syncingRef.current === 'editor') {
			syncingRef.current = null;
			return;
		}
		const scroller = editorViewRef.current?.scrollDOM;
		const pv = previewRef.current;
		if (!scroller || !pv) return;
		const denom = pv.scrollHeight - pv.clientHeight;
		const ratio = denom > 0 ? pv.scrollTop / denom : 0;
		syncingRef.current = 'preview';
		scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight);
	};

	useEffect(() => {
		const handler = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
		document.addEventListener('fullscreenchange', handler);
		return () => document.removeEventListener('fullscreenchange', handler);
	}, []);

	// CodeMirror caches its measurements; re-measure after the size or font changed.
	useEffect(() => {
		editorViewRef.current?.requestMeasure();
	}, [isFullscreen, fontSize]);

	const toggleFullscreen = () => {
		if (document.fullscreenElement === rootRef.current) void document.exitFullscreen();
		else void rootRef.current?.requestFullscreen();
	};

	const openFindReplace = () => {
		const view = editorViewRef.current;
		if (!view) return;
		openSearchPanel(view);
		view.focus();
	};

	const scrollToHeading = (item: OutlineItem) => {
		const headings = previewRef.current?.querySelectorAll('h1, h2, h3, h4, h5, h6');
		const target = headings?.[item.index] ?? (item.id ? previewRef.current?.querySelector(`[id="${CSS.escape(item.id)}"]`) : null);
		target?.scrollIntoView({ block: 'start' });
	};

	// PDF export: the browser's own "Save as PDF" print dialog, fed by a hidden iframe that holds
	// only the rendered document (site styles are copied in so code colours and KaTeX look the
	// same). Nothing is uploaded; the iframe is removed afterwards.
	const exportPdf = async () => {
		if (renderedHtml === '') return;
		const iframe = document.createElement('iframe');
		iframe.setAttribute('aria-hidden', 'true');
		iframe.tabIndex = -1;
		iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
		document.body.appendChild(iframe);
		const frameDoc = iframe.contentDocument;
		const frameWin = iframe.contentWindow;
		if (!frameDoc || !frameWin) {
			iframe.remove();
			return;
		}
		const styleNodes = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'));
		frameDoc.open();
		frameDoc.write(
			`<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(messages.exportTitle)}</title></head><body></body></html>`,
		);
		frameDoc.close();
		const waits: Array<Promise<void>> = [];
		for (const node of styleNodes) {
			const copy = node.cloneNode(true) as HTMLElement;
			if (copy.tagName === 'LINK') {
				waits.push(new Promise<void>((resolve) => {
					copy.addEventListener('load', () => resolve());
					copy.addEventListener('error', () => resolve());
				}));
			}
			frameDoc.head.appendChild(copy);
		}
		const printStyle = frameDoc.createElement('style');
		printStyle.textContent =
			'html,body{background:#fff!important;color:#111!important}body{margin:0;padding:0}' +
			'.md-print{max-width:none;padding:0;font-size:12pt;line-height:1.55;color:#111;background:#fff}' +
			'.md-print pre,.md-print blockquote,.md-print table,.md-print img{break-inside:avoid}' +
			'.md-print a{color:#0969da}@page{margin:16mm}' + hljsCss.replace(/\.dark \.md-preview[^}]*\}/g, '');
		frameDoc.head.appendChild(printStyle);
		const article = frameDoc.createElement('article');
		article.className = `md-print md-preview ${PREVIEW_CLASSES}`;
		article.innerHTML = renderedHtml;
		frameDoc.body.appendChild(article);
		await Promise.race([Promise.all(waits), new Promise((resolve) => setTimeout(resolve, 2500))]);
		const cleanup = () => setTimeout(() => iframe.remove(), 500);
		frameWin.addEventListener('afterprint', cleanup);
		frameWin.focus();
		frameWin.print();
		setTimeout(() => iframe.remove(), 120000);
	};

	const toolbarButtons: Array<{ title: string; icon: React.ReactNode; onClick: () => void }> = [
		{ title: `${messages.boldTitle} (Ctrl+B)`, icon: <Bold className="h-4 w-4" />, onClick: () => applyEdit(wrapInline('**', '**', messages.boldTitle)) },
		{ title: `${messages.italicTitle} (Ctrl+I)`, icon: <Italic className="h-4 w-4" />, onClick: () => applyEdit(wrapInline('_', '_', messages.italicTitle)) },
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
		{ title: messages.x.findReplace + ' (Ctrl+F)', icon: <Search className="h-4 w-4" />, onClick: openFindReplace },
	];

	return (
		<div
			ref={rootRef}
			className={`flex flex-col gap-3 ${isFullscreen ? 'overflow-auto bg-background p-4' : ''}`}
			style={
				{
					'--md-font-size': `${fontSize}px`,
					'--md-editor-height': isFullscreen ? 'calc(100vh - 17rem)' : '27.5rem',
				} as React.CSSProperties
			}
		>
			{hljsCss && <style>{hljsCss}</style>}
			<div role="tablist" aria-label={messages.x.tabsLabel} className="flex flex-wrap items-center gap-1">
				{docs.map((doc, index) => {
					const isActive = doc.id === activeId;
					const docContent = isActive ? content : doc.content;
					return (
						<span key={doc.id} className={`inline-flex items-center rounded-md border ${isActive ? 'border-primary bg-primary/10' : 'border-border'}`}>
							<button
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => switchToDoc(doc.id)}
								className="min-h-9 max-w-40 truncate px-2.5 text-xs font-medium text-foreground"
							>
								{deriveDocTitle(docContent, `${messages.x.untitled} ${index + 1}`)}
							</button>
							{docs.length > 1 && (
								<button
									type="button"
									onClick={() => closeDoc(doc.id)}
									aria-label={messages.x.closeDoc.replace('{{name}}', deriveDocTitle(docContent, `${messages.x.untitled} ${index + 1}`))}
									className="inline-flex min-h-9 min-w-9 items-center justify-center text-muted-foreground hover:text-foreground"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</span>
					);
				})}
				<Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={addDoc} disabled={!canAddDoc(snapshotDocs())} aria-label={messages.x.newDoc} title={canAddDoc(snapshotDocs()) ? messages.x.newDoc : messages.x.docLimit}>
					<Plus className="h-4 w-4" />
				</Button>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap gap-2">
					<Button type="button" size="sm" variant={viewMode === 'split' ? 'default' : 'outline'} aria-pressed={viewMode === 'split'} onClick={() => setViewMode('split')}>
						<Columns2 className="mr-1.5 h-4 w-4" />
						{messages.viewSplit}
					</Button>
					<Button type="button" size="sm" variant={viewMode === 'editor' ? 'default' : 'outline'} aria-pressed={viewMode === 'editor'} onClick={() => setViewMode('editor')}>
						<Pencil className="mr-1.5 h-4 w-4" />
						{messages.viewEditor}
					</Button>
					<Button type="button" size="sm" variant={viewMode === 'preview' ? 'default' : 'outline'} aria-pressed={viewMode === 'preview'} onClick={() => setViewMode('preview')}>
						<Eye className="mr-1.5 h-4 w-4" />
						{messages.viewPreview}
					</Button>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
						{messages.x.fontSize}
						<select
							value={fontSize}
							onChange={(e) => setFontSize(Number(e.target.value))}
							className="min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
						>
							{FONT_SIZES.map((size) => (
								<option key={size} value={size}>
									{size}px
								</option>
							))}
						</select>
					</label>
					<Button type="button" size="sm" variant="outline" className="min-h-9" aria-pressed={isFullscreen} onClick={toggleFullscreen}>
						{isFullscreen ? <Minimize2 className="mr-1.5 h-4 w-4" /> : <Maximize2 className="mr-1.5 h-4 w-4" />}
						{isFullscreen ? messages.x.exitZen : messages.x.zen}
					</Button>
					<p className="text-xs text-muted-foreground">
						{messages.wordCount.replace('{{words}}', String(words)).replace('{{chars}}', String(chars))}
					</p>
				</div>
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
						className="has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
					>
						{messages.chooseFile}
					</label>
					<input
						id="markdown-file-input"
						ref={fileInputRef}
						type="file"
						accept=".md,.markdown,.txt"
						className="sr-only"
						onChange={(e) => {
								handleFile(e.target.files);
								e.target.value = '';
							}}
					/>
				</div>
			)}

			<div className={`grid gap-3 ${viewMode === 'split' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
				{/* Always rendered (never removed from the tree), just hidden via CSS
				    in preview-only mode — CodeMirror's `EditorView` owns this div's
				    DOM directly via `parent:`, and removing the div from JSX would
				    tear down that DOM without a matching recreation step, since the
				    mount effect below only runs once. */}
				<div className={`flex flex-col gap-1 ${viewMode === 'preview' ? 'hidden' : ''}`}>
					<label htmlFor="markdown-input" className="text-sm font-medium text-foreground">
						{messages.editorLabel}
					</label>
					<div
						id="markdown-input"
						ref={editorContainerRef}
						className="w-full overflow-hidden rounded-md border border-border font-mono text-xs"
					/>
				</div>

				{viewMode !== 'editor' && (
					<div className="flex flex-col gap-1">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span id="markdown-preview-label" className="text-sm font-medium text-foreground">{messages.previewLabel}</span>
							<Button type="button" size="sm" variant="outline" className="min-h-9" disabled={renderedHtml === ''} title={messages.x.exportPdfHint} onClick={() => void exportPdf()}>
								<Printer className="mr-1.5 h-4 w-4" />
								{messages.x.exportPdf}
							</Button>
						</div>
						<details className="rounded-md border border-border px-3 py-1.5">
							<summary className="min-h-9 cursor-pointer text-xs font-medium text-foreground leading-9">{messages.x.outlineHeading}</summary>
							{outline.length === 0 ? (
								<p className="pb-2 text-xs text-muted-foreground">{messages.x.outlineEmpty}</p>
							) : (
								<nav aria-label={messages.x.outlineHeading} className="max-h-48 overflow-auto pb-2">
									<ul className="flex flex-col">
										{outline.map((item, index) => (
											<li key={`${item.index}-${index}`} style={{ paddingInlineStart: `${(item.level - 1) * 12}px` }}>
												<button
													type="button"
													onClick={() => scrollToHeading(item)}
													className="min-h-9 w-full truncate text-left text-xs text-primary hover:underline"
												>
													{item.text}
												</button>
											</li>
										))}
									</ul>
								</nav>
							)}
						</details>
						<div
															id="markdown-preview"
							role="region"
							aria-labelledby="markdown-preview-label"
							ref={previewRef}
							onClick={(event) => {
								// #anchor links scroll inside the preview instead of navigating the page.
								const anchor = (event.target as HTMLElement).closest('a');
								const href = anchor?.getAttribute('href');
								if (!anchor || !href || !href.startsWith('#')) return;
								event.preventDefault();
								const target = previewRef.current?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`);
								target?.scrollIntoView({ block: 'start' });
							}}
							onScroll={viewMode === 'split' ? handlePreviewScroll : undefined}
							style={{ fontSize: `${(fontSize * 14) / 12}px` }}
							className={`md-preview h-[var(--md-editor-height,27.5rem)] overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground ${PREVIEW_CLASSES}`}
							// eslint-disable-next-line react/no-danger
							dangerouslySetInnerHTML={{ __html: renderedHtml }}
						/>
						<p className="text-xs text-muted-foreground">{messages.remoteImagesNote}</p>
					</div>
				)}
			</div>

							{isTooLarge && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">{messages.largeInputWarning}</p>}
				{fileError && <p role="alert" className="text-xs text-destructive">{messages.fileReadError}</p>}
				<div className="flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
					{undoSnapshot !== null && (
						<>
							{messages.replacedNotice}
							<button type="button" onClick={handleUndo} className="font-medium text-primary underline-offset-2 hover:underline">
								{messages.undo}
							</button>
						</>
					)}
					{undoSnapshot === null && draftStatus === 'saved' && messages.draftSaved}
					{undoSnapshot === null && draftStatus === 'failed' && <span className="text-destructive">{messages.draftSaveFailed}</span>}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="ghost" onClick={() => replaceContent(SAMPLE_MARKDOWN)}>
						{messages.loadSample}
					</Button>
					<Button type="button" size="sm" variant="ghost" onClick={() => replaceContent('')}>
						{messages.clear}
					</Button>
					<CopyButton value={content} label={messages.copyMarkdown} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
					<CopyButton value={renderedHtml} label={messages.copyHtml} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
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
							buildExportHtml(messages.exportTitle, lang, renderedHtml),
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
