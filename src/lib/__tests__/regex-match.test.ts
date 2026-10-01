import { describe, expect, it } from 'vitest';
import { runRegex } from '../regex-match';

describe('runRegex', () => {
	it('caps returned matches but reports the real total', () => {
		const r = runRegex('a', 'g', 'a'.repeat(1000), '', 10);
		expect(r.matches).toHaveLength(10);
		expect(r.totalCount).toBe(1000);
		expect(r.countCapped).toBe(false);
	});

	it('stops counting at the hard cap', () => {
		const r = runRegex('a', 'g', 'a'.repeat(50), '', 5, 20);
		expect(r.totalCount).toBe(20);
		expect(r.countCapped).toBe(true);
	});

	it('without the g flag lists only the first match, consistent with Replace', () => {
		const r = runRegex('a', '', 'aaa', 'X');
		expect(r.matches).toHaveLength(1);
		expect(r.replaceResult).toBe('Xaa');
	});

	it('terminates on zero-length matches (including astral characters in unicode mode)', () => {
		const r = runRegex('', 'gu', 'a\u{1F600}b', '-');
		expect(r.totalCount).toBe(4);
		expect(r.replaceResult).toBe('-a-\u{1F600}-b-');
	});

	it('exposes groups and named groups', () => {
		const r = runRegex('(?<y>\\d{4})-(\\d{2})', 'g', '2024-05 2025-06', '');
		expect(r.matches[1].groups).toEqual(['2025', '06']);
		expect(r.matches[1].namedGroups).toEqual({ y: '2025' });
	});

	it('throws for an invalid pattern', () => {
		expect(() => runRegex('(', 'g', 'x', '')).toThrow();
	});
});
