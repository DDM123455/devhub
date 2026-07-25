import { useEffect, useRef } from 'react';
import type JSONEditor from 'jsoneditor/dist/jsoneditor-minimalist.js';
import 'jsoneditor/dist/jsoneditor.min.css';

interface Messages {
	themeNotice: string;
}

const SAMPLE_JSON = {
	name: 'Web Tool Hub',
	tools: ['compress', 'convert', 'merge-pdf'],
	privacyFirst: true,
};

// jsoneditor's UMD bundle touches `self` at module load time, which only
// exists in the browser. Astro still server-renders `client:load` islands
// once during the build to produce the initial HTML, so the library must be
// loaded with a dynamic import() inside an effect (which never runs during
// that server pass) instead of a static top-level import — otherwise the
// build itself crashes in Node with "self is not defined".
export default function JsonFormatter({ messages }: { messages: Messages }) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;
		let editor: JSONEditor | null = null;
		let cancelled = false;

		void import('jsoneditor/dist/jsoneditor-minimalist.js').then(({ default: JSONEditorCtor }) => {
			if (cancelled || !containerRef.current) return;
			editor = new JSONEditorCtor(containerRef.current, {
				modes: ['text', 'tree'],
				mode: 'text',
				mainMenuBar: true,
				navigationBar: true,
				statusBar: true,
				indentation: 2,
			});
			editor.set(SAMPLE_JSON);
		});

		return () => {
			cancelled = true;
			editor?.destroy();
		};
	}, []);

	return (
		<div className="flex flex-col gap-2">
			<div ref={containerRef} className="h-[550px] w-full overflow-hidden rounded-md border border-border" />
			<p className="text-xs text-muted-foreground">{messages.themeNotice}</p>
		</div>
	);
}
