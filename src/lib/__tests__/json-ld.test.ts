import { describe, it, expect } from 'vitest';
import { jsonLd } from '../json-ld';

describe('jsonLd', () => {
	it('escape < để không đóng script sớm', () => {
		const out = jsonLd({ a: '</script><script>alert(1)</script>' });
		expect(out).not.toContain('<');
		expect(JSON.parse(out).a).toBe('</script><script>alert(1)</script>');
	});
});
