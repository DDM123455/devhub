// highlight.js with a hand-picked set of common languages. This module is only ever loaded via a
// dynamic import() (when a Markdown document actually contains a fenced code block), so none
// of it lands in the page's initial bundle.

import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = { bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, markdown, php, python, rust, sql, typescript, xml, yaml };
for (const [name, definition] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, definition);
hljs.registerAliases(['js', 'jsx', 'mjs'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['sh', 'shell', 'zsh', 'console'], { languageName: 'bash' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['html', 'svg', 'xhtml', 'vue'], { languageName: 'xml' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['cs'], { languageName: 'csharp' });
hljs.registerAliases(['rs'], { languageName: 'rust' });
hljs.registerAliases(['md'], { languageName: 'markdown' });
hljs.registerAliases(['toml'], { languageName: 'ini' });
hljs.registerAliases(['docker'], { languageName: 'dockerfile' });
hljs.registerAliases(['golang'], { languageName: 'go' });
hljs.registerAliases(['h', 'cc', 'hpp'], { languageName: 'cpp' });

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Returns highlighted, already-escaped HTML for a known language, or null if the language is
// not registered (the caller then falls back to plain escaped text).
export function highlightCode(code: string, language: string | undefined): string | null {
	if (!language) return null;
	const lang = language.toLowerCase().split(/\s|{/)[0];
	if (!hljs.getLanguage(lang)) return null;
	try {
		return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
	} catch {
		return escapeHtml(code);
	}
}

// Token colours for the preview (light + `.dark`). Kept as a string so the component can inject
// it without a separate stylesheet request.
export const HLJS_CSS = `
.md-preview .hljs-comment,.md-preview .hljs-quote{color:#6a737d;font-style:italic}
.md-preview .hljs-keyword,.md-preview .hljs-selector-tag,.md-preview .hljs-doctag,.md-preview .hljs-type{color:#d73a49}
.md-preview .hljs-string,.md-preview .hljs-regexp,.md-preview .hljs-addition{color:#0a7d3e}
.md-preview .hljs-number,.md-preview .hljs-literal,.md-preview .hljs-symbol,.md-preview .hljs-bullet,.md-preview .hljs-meta{color:#b35900}
.md-preview .hljs-title,.md-preview .hljs-section,.md-preview .hljs-function .hljs-title{color:#6f42c1}
.md-preview .hljs-attr,.md-preview .hljs-attribute,.md-preview .hljs-variable,.md-preview .hljs-template-variable,.md-preview .hljs-name{color:#005cc5}
.md-preview .hljs-deletion{color:#b31d28}
.md-preview .hljs-emphasis{font-style:italic}.md-preview .hljs-strong{font-weight:700}
.dark .md-preview .hljs-comment,.dark .md-preview .hljs-quote{color:#8b949e}
.dark .md-preview .hljs-keyword,.dark .md-preview .hljs-selector-tag,.dark .md-preview .hljs-doctag,.dark .md-preview .hljs-type{color:#ff7b72}
.dark .md-preview .hljs-string,.dark .md-preview .hljs-regexp,.dark .md-preview .hljs-addition{color:#7ee787}
.dark .md-preview .hljs-number,.dark .md-preview .hljs-literal,.dark .md-preview .hljs-symbol,.dark .md-preview .hljs-bullet,.dark .md-preview .hljs-meta{color:#ffa657}
.dark .md-preview .hljs-title,.dark .md-preview .hljs-section,.dark .md-preview .hljs-function .hljs-title{color:#d2a8ff}
.dark .md-preview .hljs-attr,.dark .md-preview .hljs-attribute,.dark .md-preview .hljs-variable,.dark .md-preview .hljs-template-variable,.dark .md-preview .hljs-name{color:#79c0ff}
.dark .md-preview .hljs-deletion{color:#ffa198}
`;
