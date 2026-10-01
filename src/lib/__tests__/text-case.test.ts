import { describe, expect, it } from 'vitest';
import { convertCase, splitWords } from '../text-case';

describe('sentence case', () => {
	it('capitalizes accented letters', () => {
		expect(convertCase('éLAN vital. ÉCOLE normale', 'sentence')).toBe('Élan vital. École normale');
		expect(convertCase('xin chào. đây là test', 'sentence')).toBe('Xin chào. Đây là test');
	});
});

describe('camel / snake', () => {
	it("does not split on apostrophes", () => {
		expect(convertCase("don't stop", 'camel')).toBe('dontStop');
		expect(convertCase("It's a dog", 'snake')).toBe('its_a_dog');
	});
	it('handles NFD input the same as NFC', () => {
		const nfd = 'café au lait'.normalize('NFD');
		expect(convertCase(nfd, 'snake')).toBe(convertCase('café au lait', 'snake'));
		expect(splitWords(nfd)).toEqual(['café', 'au', 'lait']);
	});
	it('splits existing camelCase boundaries', () => {
		expect(convertCase('helloWorldFoo', 'snake')).toBe('hello_world_foo');
	});
});

describe('sortLines', () => {
	it('normalizes CRLF so no stray \\r stays in lines', () => {
		expect(convertCase('b\r\na\r\nc', 'sortLines')).toBe('a\nb\nc');
	});
	it('natural sort compares numbers by value', () => {
		expect(convertCase('file10\nfile2\nfile1', 'sortLines', { naturalSort: true })).toBe('file1\nfile2\nfile10');
		expect(convertCase('file10\nfile2\nfile1', 'sortLines')).toBe('file1\nfile10\nfile2');
	});
});

describe('alternating / inverse', () => {
	it('keeps astral characters intact', () => {
		expect(convertCase('a\u{1F600}b', 'inverse')).toBe('A\u{1F600}B');
	});
});

describe('more identifier cases', () => {
	it('converts to pascal/kebab/constant/dot/path/train', () => {
		expect(convertCase('hello big world', 'pascal')).toBe('HelloBigWorld');
		expect(convertCase('helloBigWorld', 'kebab')).toBe('hello-big-world');
		expect(convertCase('hello big world', 'constant')).toBe('HELLO_BIG_WORLD');
		expect(convertCase('Hello Big World', 'dot')).toBe('hello.big.world');
		expect(convertCase('Hello Big World', 'path')).toBe('hello/big/world');
		expect(convertCase('hello big world', 'train')).toBe('Hello-Big-World');
	});
	it('capitalized case keeps minor words capitalized', () => {
		expect(convertCase('the lord of the rings', 'capitalized')).toBe('The Lord Of The Rings');
		expect(convertCase("don't STOP", 'capitalized')).toBe("Don't Stop");
	});
});

describe('line utilities', () => {
	it('dedupes, reverses, sorts desc, trims', () => {
		expect(convertCase('a\nb\na\nc', 'dedupeLines')).toBe('a\nb\nc');
		expect(convertCase('a\nb\nc', 'reverseLines')).toBe('c\nb\na');
		expect(convertCase('a\nc\nb', 'sortLinesDesc')).toBe('c\nb\na');
		expect(convertCase('  a \n\tb', 'trimLines')).toBe('a\nb');
	});
	it('numbers and prefixes lines', () => {
		expect(convertCase('x\ny', 'numberLines', { startNumber: 3 })).toBe('3. x\n4. y');
		expect(convertCase('x\ny', 'prefixSuffix', { prefix: '"', suffix: '",' })).toBe('"x",\n"y",');
	});
});

describe('stylized text', () => {
	it('maps ASCII to math alphanumerics', () => {
		expect(convertCase('Ab1', 'stylized', { stylizedStyle: 'bold' })).toBe('\u{1D400}\u{1D41B}\u{1D7CF}');
		expect(convertCase('h', 'stylized', { stylizedStyle: 'italic' })).toBe('ℎ');
		expect(convertCase('B', 'stylized', { stylizedStyle: 'script' })).toBe('ℬ');
		expect(convertCase('a b', 'stylized', { stylizedStyle: 'wide' })).toBe('ａ　ｂ');
		expect(convertCase('a b', 'stylized', { stylizedStyle: 'strikethrough' })).toBe('a̶ b̶');
		expect(convertCase('é', 'stylized', { stylizedStyle: 'monospace' })).toBe('é');
	});
});
