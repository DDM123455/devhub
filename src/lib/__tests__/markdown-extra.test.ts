import { describe, expect, it } from 'vitest';
import { canAddDoc, deriveDocTitle, extractMath, extractOutline, mathPlaceholder, parseDocsState, restoreMath } from '../markdown-extra';

describe('extractMath', () => {
	it('extracts inline and display formulas', () => {
		const { text, segments } = extractMath('Energy $E=mc^2$ and\n\n$$\\int_0^1 x\\,dx$$\n\nend');
		expect(segments).toEqual([
			{ id: 0, tex: 'E=mc^2', display: false },
			{ id: 1, tex: '\\int_0^1 x\\,dx', display: true },
		]);
		expect(text).toContain(mathPlaceholder(0));
		expect(text).toContain(mathPlaceholder(1));
		expect(text).not.toContain('$');
	});
	it('ignores currency, escaped dollars and unbalanced signs', () => {
		expect(extractMath('It costs $5 and $10 today').segments).toEqual([]);
		expect(extractMath('Price \\$3.50 and \\$4').segments).toEqual([]);
		expect(extractMath('a lone $ sign').segments).toEqual([]);
		expect(extractMath('$ spaced $').segments).toEqual([]);
	});
	it('leaves code fences and inline code alone', () => {
		const md = 'Use `$x$` here.\n\n```js\nconst a = "$y$";\n```\n\n$z$';
		const { text, segments } = extractMath(md);
		expect(segments.map((s) => s.tex)).toEqual(['z']);
		expect(text).toContain('`$x$`');
		expect(text).toContain('"$y$"');
	});
	it('restoreMath substitutes placeholders', () => {
		const { text } = extractMath('a $x$ b $y$');
		expect(restoreMath(`<p>${text}</p>`, ['<X>', '<Y>'])).toBe('<p>a <X> b <Y></p>');
	});
});

describe('extractOutline', () => {
	it('reads headings with ids and strips inline markup', () => {
		const html = '<h1 id="intro">Intro</h1><p>x</p><h2 id="a-b">A <code>code</code> &amp; B</h2><h3>no id</h3>';
		expect(extractOutline(html)).toEqual([
			{ level: 1, id: 'intro', text: 'Intro', index: 0 },
			{ level: 2, id: 'a-b', text: 'A code & B', index: 1 },
			{ level: 3, id: '', text: 'no id', index: 2 },
		]);
	});
});

describe('docs state', () => {
	it('derives titles', () => {
		expect(deriveDocTitle('\n\n## My *great* doc\nbody', 'Untitled')).toBe('My great doc');
		expect(deriveDocTitle('', 'Untitled')).toBe('Untitled');
		expect(deriveDocTitle('x'.repeat(40), 'U')).toBe('x'.repeat(24) + '…');
	});
	it('parses and validates stored state', () => {
		expect(parseDocsState(null)).toBeNull();
		expect(parseDocsState('nope')).toBeNull();
		expect(parseDocsState('{"docs":[]}')).toBeNull();
		const ok = parseDocsState('{"docs":[{"id":"a","content":"x"},{"id":1,"content":"bad"}],"activeId":"zzz"}');
		expect(ok).toEqual({ docs: [{ id: 'a', content: 'x' }], activeId: 'a' });
	});
	it('limits the number and size of documents', () => {
		const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i), content: '' }));
		expect(canAddDoc(many)).toBe(false);
		expect(canAddDoc([{ id: 'a', content: 'x'.repeat(2_000_001) }])).toBe(false);
		expect(canAddDoc([{ id: 'a', content: 'x' }])).toBe(true);
	});
});
