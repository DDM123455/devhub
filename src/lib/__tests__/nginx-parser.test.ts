import { describe, expect, it } from 'vitest';
import {
	autoFixTrivialIssues,
	parseNginxConfig,
	simulateRewrite,
	testNginxLocationRegex,
} from '../nginx-parser';

function issueIds(config: string) {
	return parseNginxConfig(config).issues.map((issue) => issue.ruleId);
}

describe('parseNginxConfig — valid input', () => {
	it('reports no structural/context errors for a well-formed config', () => {
		const config = `
			events { worker_connections 1024; }
			http {
				server_tokens off;
				server {
					listen 80;
					server_name example.com;
					location / {
						proxy_pass http://backend;
					}
				}
			}
		`;
		const ids = issueIds(config);
		expect(ids).not.toContain('unmatched-brace');
		expect(ids).not.toContain('missing-semicolon');
		expect(ids).not.toContain('wrong-context');
		expect(ids).not.toContain('server-tokens-exposed');
	});
});

describe('parseNginxConfig — structural errors', () => {
	it('flags a directive missing its terminating ";" before "}"', () => {
		const config = `server { listen 80 }`;
		const result = parseNginxConfig(config);
		expect(result.issues.some((i) => i.ruleId === 'missing-semicolon')).toBe(true);
	});

	it('flags a directive missing its terminating ";" at end of file', () => {
		const config = `http {\n  server {\n    listen 80`;
		const result = parseNginxConfig(config);
		const eofIssue = result.issues.find(
			(i) => i.ruleId === 'missing-semicolon' && i.message.includes('end of file'),
		);
		expect(eofIssue).toBeDefined();
	});

	it('flags every still-open block when braces are never closed, with correct line numbers', () => {
		const config = `http {\n  server {\n    listen 80;`;
		const result = parseNginxConfig(config);
		const unclosed = result.issues.filter((i) => i.ruleId === 'unmatched-brace');
		expect(unclosed).toHaveLength(2);
		expect(unclosed.map((i) => i.line).sort()).toEqual([1, 2]);
	});

	it('flags an unexpected closing brace with no matching open', () => {
		const config = `http {\n  server {\n    listen 80;\n  }\n}\n}`;
		const result = parseNginxConfig(config);
		const extra = result.issues.find((i) => i.ruleId === 'unmatched-brace' && i.line === 6);
		expect(extra).toBeDefined();
		expect(extra?.message).toContain('Unexpected "}"');
	});

	it('detects a missing ";" between two directives via the line-break heuristic', () => {
		const config = `http {\n  server {\n    listen 80\n    server_name example.com;\n  }\n}`;
		const result = parseNginxConfig(config);
		const heuristic = result.issues.find((i) => i.ruleId === 'possible-missing-semicolon');
		expect(heuristic).toBeDefined();
		expect(heuristic?.line).toBe(4);
	});
});

describe('parseNginxConfig — context validity', () => {
	it('flags a directive used outside its valid block context', () => {
		const config = `http {\n  proxy_pass http://backend;\n}`;
		const result = parseNginxConfig(config);
		const wrongContext = result.issues.find((i) => i.ruleId === 'wrong-context');
		expect(wrongContext).toBeDefined();
		expect(wrongContext?.message).toContain('proxy_pass');
	});

	it('does not flag a directive used in one of its valid contexts', () => {
		const config = `http {\n  server {\n    location / {\n      proxy_pass http://backend;\n    }\n  }\n}`;
		const ids = issueIds(config);
		expect(ids).not.toContain('wrong-context');
	});
});

describe('parseNginxConfig — security checks', () => {
	it('warns about $uri (decoded) used in a redirect, suggesting $request_uri', () => {
		const config = `server {\n  location /old {\n    return 301 https://example.com$uri;\n  }\n}`;
		const result = parseNginxConfig(config);
		const crlf = result.issues.find((i) => i.ruleId === 'crlf-injection-risk');
		expect(crlf).toBeDefined();
		expect(crlf?.message).toContain('$request_uri');
	});

	it('does not warn when $request_uri (not bare $uri) is used', () => {
		const config = `server {\n  location /old {\n    return 301 https://example.com$request_uri;\n  }\n}`;
		const ids = issueIds(config);
		expect(ids).not.toContain('crlf-injection-risk');
	});

	it('warns when server_tokens off is missing anywhere in the config', () => {
		const config = `http {\n  server {\n    listen 80;\n  }\n}`;
		const ids = issueIds(config);
		expect(ids).toContain('server-tokens-exposed');
	});

	it('does not warn when server_tokens off is present', () => {
		const config = `http {\n  server_tokens off;\n  server {\n    listen 80;\n  }\n}`;
		const ids = issueIds(config);
		expect(ids).not.toContain('server-tokens-exposed');
	});

	it('warns about autoindex on', () => {
		const config = `server {\n  location /files {\n    autoindex on;\n  }\n}`;
		const ids = issueIds(config);
		expect(ids).toContain('autoindex-enabled');
	});
});

describe('testNginxLocationRegex', () => {
	it('matches and returns capture groups', () => {
		const result = testNginxLocationRegex('\\.(jpg|png)$', false, '/images/cat.png');
		expect(result.matched).toBe(true);
		expect(result.error).toBeNull();
		expect(result.groups).toEqual(['.png', 'png']);
	});

	it('reports no match without throwing', () => {
		const result = testNginxLocationRegex('\\.(jpg|png)$', false, '/images/cat.gif');
		expect(result.matched).toBe(false);
		expect(result.error).toBeNull();
	});

	it('surfaces a regex syntax error instead of throwing', () => {
		const result = testNginxLocationRegex('(unclosed', false, '/x');
		expect(result.matched).toBe(false);
		expect(result.error).not.toBeNull();
	});

	it('is case-insensitive only when requested', () => {
		expect(testNginxLocationRegex('CAT', false, '/cat.png').matched).toBe(false);
		expect(testNginxLocationRegex('CAT', true, '/cat.png').matched).toBe(true);
	});
});

describe('simulateRewrite', () => {
	it('applies a capture-group substitution', () => {
		const result = simulateRewrite('^/old/(.*)$', '/new/$1', '/old/page.html');
		expect(result.error).toBeNull();
		expect(result.outputUrl).toBe('/new/page.html');
	});

	it('reports no match instead of a false rewrite', () => {
		const result = simulateRewrite('^/old/(.*)$', '/new/$1', '/other/page.html');
		expect(result.outputUrl).toBeNull();
		expect(result.error).toContain('does not match');
	});
});

describe('autoFixTrivialIssues', () => {
	it('appends a missing ";" and closes every unclosed block', () => {
		const broken = 'http {\n  server {\n    listen 80';
		const result = parseNginxConfig(broken);
		const fixed = autoFixTrivialIssues(broken, result);
		expect(fixed).toBe('http {\n  server {\n    listen 80;\n}\n}');
		// The fixed output should itself parse clean.
		const reparsed = parseNginxConfig(fixed);
		expect(reparsed.issues.some((i) => i.ruleId === 'unmatched-brace')).toBe(false);
		expect(reparsed.issues.some((i) => i.ruleId === 'missing-semicolon')).toBe(false);
	});
});
