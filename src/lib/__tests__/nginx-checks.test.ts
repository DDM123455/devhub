import { describe, expect, it } from 'vitest';
import { parseNginxConfig } from '../nginx-parser';
import { buildNginxJsonReport, parseListen } from '../nginx-checks';

const keys = (conf: string) => parseNginxConfig(conf, { fragment: true }).issues.map((i) => i.key);
const find = (conf: string, key: string) => parseNginxConfig(conf, { fragment: true }).issues.find((i) => i.key === key);

describe('Gixy-style checks', () => {
	it('flags alias traversal only for prefix locations without trailing slash', () => {
		expect(keys('server { location /img { alias /data/img/; } }')).toContain('alias-traversal');
		expect(keys('server { location /img/ { alias /data/img/; } }')).not.toContain('alias-traversal');
		expect(keys('server { location = /f { alias /data/f; } }')).not.toContain('alias-traversal');
		expect(keys('server { location ~ ^/x/(.*)$ { alias /data/$1; } }')).not.toContain('alias-traversal');
	});

	it('flags add_header redefinition in child blocks', () => {
		const conf = `http { add_header X-Frame-Options DENY; server { location / { add_header X-Other 1; } } }`;
		const i = find(conf, 'add-header-redefine');
		expect(i?.params.names).toBe('x-frame-options');
		const ok = `http { add_header X-A 1; server { location / { add_header X-A 2; add_header X-B 3; } } }`;
		expect(keys(ok)).not.toContain('add-header-redefine');
	});

	it('flags unsafe if in location but not return/rewrite/set', () => {
		expect(keys('server { location / { if ($a) { proxy_pass http://x; } } }')).toContain('if-in-location');
		expect(keys('server { location / { if ($a) { return 301 /x; } } }')).not.toContain('if-in-location');
	});

	it('flags missing HSTS on TLS servers', () => {
		expect(keys('server { listen 443 ssl; }')).toContain('missing-hsts');
		expect(keys('server { listen 443 ssl; add_header Strict-Transport-Security "max-age=1" always; }')).not.toContain('missing-hsts');
		expect(keys('server { listen 80; }')).not.toContain('missing-hsts');
	});

	it('flags allow without deny all', () => {
		expect(keys('location /a { allow 10.0.0.0/8; }')).toContain('allow-without-deny');
		expect(keys('location /a { allow 10.0.0.0/8; deny all; }')).not.toContain('allow-without-deny');
	});

	it('flags proxy_pass with URI in a regex location', () => {
		expect(keys('server { location ~ ^/a { proxy_pass http://b/x; } }')).toContain('proxy-pass-uri-regex');
		expect(keys('server { location ~ ^/a { proxy_pass http://b; } }')).not.toContain('proxy-pass-uri-regex');
		expect(keys('server { location /a { proxy_pass http://b/x; } }')).not.toContain('proxy-pass-uri-regex');
	});

	it('flags exposed stub_status unless protected', () => {
		expect(keys('server { location /s { stub_status; } }')).toContain('status-page-exposed');
		expect(keys('server { location /s { stub_status; allow 127.0.0.1; deny all; } }')).not.toContain('status-page-exposed');
	});

	it('flags root in location and valid_referers none', () => {
		expect(keys('server { location / { root /srv; } }')).toContain('root-in-location');
		expect(keys('server { valid_referers none blocked example.com; }')).toContain('valid-referers-none');
	});

	it('detects duplicate default_server and duplicate server_name', () => {
		const dup = 'http { server { listen 80 default_server; server_name a; } server { listen 80 default_server; server_name b; } }';
		expect(keys(dup)).toContain('duplicate-default-server');
		const names = 'http { server { listen 80; server_name a.com; } server { listen 80; server_name a.com; } }';
		expect(keys(names)).toContain('duplicate-server-name');
		const diffPort = 'http { server { listen 80; server_name a.com; } server { listen 8080; server_name a.com; } }';
		expect(keys(diffPort)).not.toContain('duplicate-server-name');
	});

	it('flags undeclared upstream in a full config only', () => {
		const full = 'events {} http { server { location / { proxy_pass http://backend; } } }';
		expect(parseNginxConfig(full).issues.some((i) => i.key === 'upstream-undeclared')).toBe(true);
		const declared = 'events {} http { upstream backend { server 127.0.0.1:1; } server { location / { proxy_pass http://backend; } } }';
		expect(parseNginxConfig(declared).issues.some((i) => i.key === 'upstream-undeclared')).toBe(false);
		const host = 'events {} http { server { location / { proxy_pass http://api.example.com; } } }';
		expect(parseNginxConfig(host).issues.some((i) => i.key === 'upstream-undeclared')).toBe(false);
	});
});

describe('parameter validation', () => {
	it('validates sizes, times, numbers and flags', () => {
		expect(keys('client_max_body_size 10x;')).toContain('param-invalid-size');
		expect(keys('client_max_body_size 10m;')).not.toContain('param-invalid-size');
		expect(keys('keepalive_timeout 65s 30;')).not.toContain('param-invalid-time');
		expect(keys('keepalive_timeout abc;')).toContain('param-invalid-time');
		expect(keys('worker_processes many;')).toContain('param-invalid-number');
		expect(keys('worker_processes auto;')).not.toContain('param-invalid-number');
		expect(keys('gzip_comp_level 12;')).toContain('param-out-of-range');
		expect(keys('sendfile yes;')).toContain('param-invalid-flag');
		expect(keys('sendfile on;')).not.toContain('param-invalid-flag');
		expect(keys('send_timeout $var;')).not.toContain('param-invalid-time');
	});

	it('validates listen, return, ssl_protocols and ciphers', () => {
		expect(keys('server { listen 70000; }')).toContain('listen-invalid-port');
		expect(keys('server { listen 443 ssl http2 reuseport backlog=511; }')).not.toContain('listen-invalid-option');
		expect(keys('server { listen 443 sll; }')).toContain('listen-invalid-option');
		expect(keys('server { return 999; }')).toContain('return-invalid-code');
		expect(keys('server { return 301; }')).toContain('return-needs-url');
		expect(keys('server { return 301 https://$host$request_uri; }')).not.toContain('return-needs-url');
		expect(keys('ssl_protocols TLSv1.2 TLSv1.4;')).toContain('param-invalid-enum');
		expect(keys('ssl_protocols TLSv1.2 TLSv1.3;')).not.toContain('param-invalid-enum');
		expect(keys('ssl_ciphers RC4-SHA:HIGH:!aNULL;')).toContain('weak-ssl-cipher');
		expect(keys('ssl_ciphers HIGH:!aNULL:!MD5;')).not.toContain('weak-ssl-cipher');
		expect(keys('error_page 404 /404.html;')).not.toContain('error-page-invalid');
		expect(keys('error_page 40 /x.html;')).toContain('error-page-invalid');
	});

	it('does not validate data blocks', () => {
		expect(keys('map $a $b { default sendfile; sendfile yes; }')).not.toContain('param-invalid-flag');
	});

	it('knows http3/quic and upstream keepalive contexts', () => {
		const i = parseNginxConfig('events {} http { upstream u { server a:1; keepalive 8; keepalive_timeout 60s; } server { listen 443 quic reuseport; http3 on; quic_retry on; } }').issues;
		expect(i.filter((x) => x.key === 'wrong-context' || x.key.startsWith('unknown-directive'))).toEqual([]);
	});
});

describe('parseListen and report', () => {
	it('normalises wildcard addresses and default ports', () => {
		expect(parseListen(['80'])!.key).toBe('*:80');
		expect(parseListen(['*:80'])!.key).toBe('*:80');
		expect(parseListen(['0.0.0.0:80'])!.key).toBe('*:80');
		expect(parseListen(['example.com'])!.key).toBe('example.com:80');
		expect(parseListen(['[::]:443', 'ssl'])!.key).toBe('[::]:443');
		expect(parseListen(['unix:/tmp/s.sock'])!.key).toBe('unix:/tmp/s.sock');
	});

	it('builds a JSON report', () => {
		const result = parseNginxConfig('server { return 999; }', { fragment: true });
		const report = buildNginxJsonReport(result.issues, { fragment: result.isFragment }) as { summary: { errors: number }; issues: unknown[] };
		expect(report.summary.errors).toBeGreaterThan(0);
		expect(report.issues.length).toBe(result.issues.length);
	});
});
