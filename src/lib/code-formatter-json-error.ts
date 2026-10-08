// Locates the first syntax error of a JSON text. Engines disagree on error messages (current
// V8 no longer reports a position at all), so the Code Formatter computes line/column itself
// with a small strict (RFC 8259) validator. Pure, no eval, linear time, iterative-safe depth cap.

import { positionToLineColumn, type FormatErrorInfo } from './format-languages';

const MAX_DEPTH = 5000;

class Stop extends Error {
	constructor(
		readonly offset: number,
		readonly msg: string,
	) {
		super(msg);
	}
}

function describe(text: string, i: number): string {
	if (i >= text.length) return 'Unexpected end of JSON';
	const ch = text[i];
	if (ch === '"') return 'Unexpected string';
	return `Unexpected token ${JSON.stringify(ch)}`;
}

/** Returns the first error as `{line, column, message}` or null when `text` is valid JSON. */
export function locateJsonError(text: string): FormatErrorInfo | null {
	let i = 0;
	const n = text.length;
	const ws = () => {
		while (i < n) {
			const c = text.charCodeAt(i);
			if (c === 32 || c === 9 || c === 10 || c === 13) i++;
			else break;
		}
	};
	const fail = (offset: number, msg?: string): never => {
		throw new Stop(offset, msg ?? describe(text, offset));
	};

	const string = () => {
		const start = i;
		i++; // opening quote
		while (i < n) {
			const c = text.charCodeAt(i);
			if (c === 34) {
				i++;
				return;
			}
			if (c < 32) fail(i, 'Bad control character in string');
			if (c === 92) {
				i++;
				const e = text[i];
				if (e === 'u') {
					if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail(i, 'Bad Unicode escape');
					i += 5;
				} else if (e !== undefined && '"\\/bfnrt'.includes(e)) i++;
				else fail(i, 'Bad escaped character');
			} else i++;
		}
		fail(start, 'Unterminated string');
	};

	const number = () => {
		const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
		if (!m) {
			if (text[i] === '-' && !/\d/.test(text[i + 1] ?? '')) fail(i + 1, 'No number after minus sign');
			fail(i);
		}
		i += (m as RegExpExecArray)[0].length;
		if (text[i] === '.' ) fail(i, 'Unterminated fractional number');
		if ((text[i] === 'e' || text[i] === 'E')) fail(i, 'Exponent part is missing a number');
		if (/\d/.test(text[i] ?? '')) fail(i, 'Unexpected number (leading zeros are not allowed)');
	};

	const value = (depth: number): void => {
		if (depth > MAX_DEPTH) fail(i, 'Nesting is too deep');
		ws();
		const c = text[i];
		if (c === '{') {
			i++;
			ws();
			if (text[i] === '}') {
				i++;
				return;
			}
			for (;;) {
				ws();
				if (text[i] !== '"') fail(i, i >= n ? 'Unexpected end of JSON' : text[i] === '}' ? 'Trailing comma is not allowed' : `Expected a property name in double quotes, found ${JSON.stringify(text[i])}`);
				string();
				ws();
				if (text[i] !== ':') fail(i, i >= n ? 'Unexpected end of JSON' : "Expected ':' after the property name");
				i++;
				value(depth + 1);
				ws();
				if (text[i] === ',') {
					i++;
					continue;
				}
				if (text[i] === '}') {
					i++;
					return;
				}
				fail(i, i >= n ? 'Unexpected end of JSON' : "Expected ',' or '}' after the property value");
			}
		} else if (c === '[') {
			i++;
			ws();
			if (text[i] === ']') {
				i++;
				return;
			}
			for (;;) {
				ws();
				if (text[i] === ']') fail(i, 'Trailing comma is not allowed');
				value(depth + 1);
				ws();
				if (text[i] === ',') {
					i++;
					continue;
				}
				if (text[i] === ']') {
					i++;
					return;
				}
				fail(i, i >= n ? 'Unexpected end of JSON' : "Expected ',' or ']' after the array element");
			}
		} else if (c === '"') string();
		else if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) number();
		else if (text.startsWith('true', i)) i += 4;
		else if (text.startsWith('false', i)) i += 5;
		else if (text.startsWith('null', i)) i += 4;
		else fail(i);
	};

	try {
		ws();
		if (i >= n) return { line: 1, column: 1, message: 'Unexpected end of JSON' };
		value(0);
		ws();
		if (i < n) fail(i, `Unexpected data after the JSON value (${JSON.stringify(text[i])})`);
		return null;
	} catch (error) {
		if (error instanceof Stop) {
			const { line, column } = positionToLineColumn(text, error.offset);
			return { line, column, message: error.msg };
		}
		return { message: 'Invalid JSON' };
	}
}
