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
