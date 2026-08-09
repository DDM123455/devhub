// Shared by any tool that reports "line N" errors against a plain <textarea>
// and needs to jump the cursor/selection there on click — same approach
// already used in JsonFormatter.tsx, extracted here so the nginx and
// Kubernetes YAML validators don't each reimplement it.

export function lineToCharRange(text: string, oneIndexedLine: number): { start: number; end: number } | null {
	const lines = text.split('\n');
	const index = oneIndexedLine - 1;
	if (index < 0 || index >= lines.length) return null;
	let start = 0;
	for (let i = 0; i < index; i++) start += lines[i].length + 1;
	return { start, end: start + lines[index].length };
}

export function jumpTextareaToLine(textarea: HTMLTextAreaElement, oneIndexedLine: number) {
	const range = lineToCharRange(textarea.value, oneIndexedLine);
	if (!range) return;
	textarea.focus();
	textarea.setSelectionRange(range.start, range.end);
	const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 18;
	textarea.scrollTop = Math.max(0, (oneIndexedLine - 1) * lineHeight - textarea.clientHeight / 2);
}
