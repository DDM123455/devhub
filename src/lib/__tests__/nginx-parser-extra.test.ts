import { describe, expect, it } from 'vitest';
import { autoFixTrivialIssues, parseNginxConfig, simulateRewrite, suggestDirective, testNginxLocationRegex } from '../nginx-parser';

const ids = (config: string, options?: Parameters<typeof parseNginxConfig>[1]) =>
	parseNginxConfig(config, options).issues.map((i) => i.ruleId);

describe('tokenizer fixes', () => {
	it('treats # as a comment only at the start of a token', () => {
		const result = parseNginxConfig('server {\n  rewrite ^/a#b /x;\n  listen 80; # real comment\n}');
		const rewrite = result.root.children![0].children!.find((n) => n.name === 'rewrite');
		expect(rewrite?.args).toEqual(['^/a#b', '/x']);
		expect(result.issues.some((i) => i.ruleId === 'unmatched-brace')).toBe(false);
	});

	it('does not read ${var} braces as block syntax', () => {
		const result = parseNginxConfig('server {\n  set $x ${host}_suffix;\n  return 200 "${uri}";\n}');
		expect(result.issues.some((i) => i.ruleId === 'unmatched-brace' || i.ruleId === 'missing-semicolon')).toBe(false);
		const set = result.root.children![0].children![0];
		expect(set.args).toEqual(['$x', '${host}_suffix']);
	});

	it('reports an unclosed quote with its starting line', () => {
		const result = parseNginxConfig('server {\n  add_header X "oops;\n  listen 80;\n}');
		const issue = result.issues.find((i) => i.ruleId === 'unclosed-quote');
		expect(issue?.line).toBe(2);
	});

	it('keeps line numbers right across backslash-newline and multi-line strings', () => {
		const config = 'server {\n  log_format main "a\nb";\n  return 301 /x\\\ny;\n  autoindex on;\n}';
		const result = parseNginxConfig(config);
		const autoindex = result.issues.find((i) => i.ruleId === 'autoindex-enabled');
		expect(autoindex?.line).toBe(6);
	});
});

describe('context table + fragments', () => {
	it('accepts a top-level server block as an included fragment (auto)', () => {
		const result = parseNginxConfig('server {\n  listen 80;\n  location / { return 200; }\n}');
		expect(result.isFragment).toBe(true);
		expect(result.issues.map((i) => i.ruleId)).not.toContain('wrong-context');
		expect(result.issues.map((i) => i.ruleId)).not.toContain('server-tokens-exposed');
	});

	it('flags top-level server when fragment mode is forced off', () => {
		expect(ids('server { listen 80; }', { fragment: false })).toContain('wrong-context');
	});

	it('still reports wrong context inside a fragment', () => {
		expect(ids('server {\n  proxy_pass http://x;\n}')).toContain('wrong-context');
	});

	it('knows upstream servers, if/limit_except contents and data blocks', () => {
		const config = `http {
  upstream app { server 127.0.0.1:3000; keepalive 16; }
  map $host $x { default 0; example.com 1; }
  server {
    listen 80;
    location / {
      if ($x) { add_header X-A 1; return 403; }
      limit_except GET { deny all; }
      resolver 8.8.8.8;
    }
  }
}`;
		const found = ids(config);
		expect(found).not.toContain('wrong-context');
		expect(found).not.toContain('unknown-directive');
	});

	it('does not context-check stream blocks', () => {
		const found = ids('stream {\n  server {\n    listen 53;\n    proxy_pass backend:53;\n  }\n}');
		expect(found).not.toContain('wrong-context');
	});
});

describe('unknown directives and ssl protocols', () => {
	it('warns on an unknown directive and suggests the closest name', () => {
		const result = parseNginxConfig('http {\n  server {\n    listn 80;\n  }\n}');
		const issue = result.issues.find((i) => i.ruleId === 'unknown-directive');
		expect(issue?.key).toBe('unknown-directive-suggest');
		expect(issue?.params.suggestion).toBe('listen');
		expect(suggestDirective('proxy_pas')).toBe('proxy_pass');
	});

	it('does not flag third-party module directives', () => {
		expect(ids('http {\n  server {\n    location / { content_by_lua_block { ngx.say(1) } }\n  }\n}')).not.toContain('unknown-directive');
	});

	it('warns about obsolete ssl_protocols', () => {
		const result = parseNginxConfig('http {\n  server {\n    ssl_protocols SSLv3 TLSv1 TLSv1.2;\n  }\n}');
		const weak = result.issues.filter((i) => i.ruleId === 'weak-ssl-protocol');
		expect(weak).toHaveLength(2);
		expect(weak.map((w) => w.params.protocol)).toEqual(['SSLv3', 'TLSv1']);
	});
});

describe('autoFixTrivialIssues with comments', () => {
	it('inserts the missing ";" before a trailing comment', () => {
		const broken = 'http {\n  server {\n    listen 80 # public port';
		const fixed = autoFixTrivialIssues(broken, parseNginxConfig(broken));
		expect(fixed).toBe('http {\n  server {\n    listen 80; # public port\n}\n}');
		const reparsed = parseNginxConfig(fixed);
		expect(reparsed.issues.some((i) => i.ruleId === 'missing-semicolon' || i.ruleId === 'unmatched-brace')).toBe(false);
	});
});

describe('rewrite simulator', () => {
	it('replaces the whole URI like nginx and does not treat $& specially', () => {
		expect(simulateRewrite('foo', '/bar', '/x/foo/y').outputUrl).toBe('/bar');
		expect(simulateRewrite('^/a/(.*)$', '/b/$1$&', '/a/z').outputUrl).toBe('/b/z$&');
	});

	it('expands named captures, leaves nginx variables, keeps the query string', () => {
		const r = simulateRewrite('^/(?<section>\\w+)/(\\d+)$', '/new/$section/$2/$host', '/blog/42?x=1');
		expect(r.outputUrl).toBe('/new/blog/42/$host?x=1');
		expect(r.captures).toEqual(['/blog/42', 'blog', '42']);
		expect(simulateRewrite('^/a$', '/b?', '/a?q=1').outputUrl).toBe('/b');
	});

	it('flags a non-match without an error', () => {
		const r = simulateRewrite('^/a$', '/b', '/c');
		expect(r.noMatch).toBe(true);
		expect(r.outputUrl).toBeNull();
	});
});

describe('location regex tester', () => {
	it('supports a leading (?i) inline flag and reports named groups', () => {
		expect(testNginxLocationRegex('(?i)CAT', false, '/cat.png').matched).toBe(true);
		const r = testNginxLocationRegex('^/(?<id>\\d+)$', false, '/42');
		expect(r.named).toEqual({ id: '42' });
	});
});
