// Extended nginx checks that run on the AST built by nginx-parser.ts: Gixy-style security rules,
// directive parameter validation, duplicate listen/server_name/default_server detection and
// upstream reference checks. Pure logic, no DOM. Every issue is a {key, params} pair (the page
// maps keys to i18n); `message` is only the English fallback.
import type { NginxIssue, NginxNode } from './nginx-parser';

export const EXTENDED_ISSUE_KEYS = [
	'alias-traversal',
	'add-header-redefine',
	'proxy-set-header-redefine',
	'if-in-location',
	'missing-hsts',
	'allow-without-deny',
	'proxy-pass-uri-regex',
	'status-page-exposed',
	'root-in-location',
	'valid-referers-none',
	'duplicate-default-server',
	'duplicate-server-name',
	'upstream-undeclared',
	'param-invalid-number',
	'param-out-of-range',
	'param-invalid-size',
	'param-invalid-time',
	'param-invalid-flag',
	'param-invalid-enum',
	'param-arity',
	'listen-invalid-port',
	'listen-invalid-option',
	'return-invalid-code',
	'return-needs-url',
	'weak-ssl-cipher',
	'error-page-invalid',
] as const;

type Params = Record<string, string | number>;

function issue(line: number, severity: 'error' | 'warning', ruleId: string, key: string, params: Params, message: string): NginxIssue {
	return { line, severity, ruleId, key, params, message };
}

// Blocks whose body is data (never validated as directives).
const DATA_BLOCKS = new Set(['map', 'geo', 'types', 'split_clients', 'charset_map']);

const LOCATION_MODIFIERS = new Set(['=', '~', '~*', '^~']);

interface LocationInfo {
	modifier: string; // '' for plain prefix
	path: string;
	isRegex: boolean;
	isNamed: boolean;
}

function parseLocation(node: NginxNode): LocationInfo {
	const [first, second] = node.args;
	if (first !== undefined && LOCATION_MODIFIERS.has(first)) {
		return { modifier: first, path: second ?? '', isRegex: first === '~' || first === '~*', isNamed: false };
	}
	const path = first ?? '';
	return { modifier: '', path, isRegex: false, isNamed: path.startsWith('@') };
}

function children(node: NginxNode, name: string): NginxNode[] {
	return (node.children ?? []).filter((c) => c.name === name);
}

function hasChild(node: NginxNode, name: string): boolean {
	return (node.children ?? []).some((c) => c.name === name);
}

function descendants(node: NginxNode): NginxNode[] {
	const out: NginxNode[] = [];
	const walk = (n: NginxNode) => {
		for (const c of n.children ?? []) {
			out.push(c);
			if (!DATA_BLOCKS.has(c.name)) walk(c);
		}
	};
	walk(node);
	return out;
}

// ---------------------------------------------------------------------------
// listen parsing
// ---------------------------------------------------------------------------
const LISTEN_FLAGS = new Set(['ssl', 'http2', 'quic', 'proxy_protocol', 'default_server', 'default', 'bind', 'deferred', 'reuseport', 'udp', 'spdy']);
const LISTEN_KV = new Set(['backlog', 'rcvbuf', 'sndbuf', 'accept_filter', 'setfib', 'fastopen', 'ipv6only', 'so_keepalive']);

export interface ListenInfo {
	key: string;
	port: number | null;
	portValid: boolean;
	isDefault: boolean;
	options: string[];
}

export function parseListen(args: string[]): ListenInfo | null {
	const first = args[0];
	if (first === undefined) return null;
	const options = args.slice(1);
	const isDefault = options.includes('default_server') || options.includes('default');
	if (first.startsWith('unix:')) return { key: first, port: null, portValid: true, isDefault, options };
	let host = '';
	let portText = '';
	if (/^\d+$/.test(first)) portText = first;
	else if (first.startsWith('[')) {
		const end = first.indexOf(']');
		host = end === -1 ? first : first.slice(0, end + 1);
		portText = end !== -1 && first[end + 1] === ':' ? first.slice(end + 2) : '';
	} else {
		const colon = first.lastIndexOf(':');
		if (colon === -1) host = first;
		else {
			host = first.slice(0, colon);
			portText = first.slice(colon + 1);
		}
	}
	let port: number | null = 80;
	let portValid = true;
	if (portText !== '') {
		if (portText.includes('$')) {
			port = null;
		} else if (/^\d+$/.test(portText)) {
			port = Number(portText);
			portValid = port >= 1 && port <= 65535;
		} else {
			port = null;
			portValid = false;
		}
	}
	const wildcard = host === '' || host === '*' || host === '0.0.0.0';
	return { key: `${wildcard ? '*' : host.toLowerCase()}:${port ?? portText}`, port, portValid, isDefault, options };
}

// ---------------------------------------------------------------------------
// parameter validation tables
// ---------------------------------------------------------------------------
const FLAG_DIRECTIVES: Record<string, string[]> = {};
for (const name of `sendfile tcp_nopush tcp_nodelay gzip gzip_vary autoindex ssl_prefer_server_ciphers ssl_session_tickets ssl_stapling ssl_stapling_verify log_not_found underscores_in_headers ignore_invalid_headers merge_slashes absolute_redirect server_name_in_redirect port_in_redirect reset_timedout_connection multi_accept accept_mutex daemon master_process proxy_buffering proxy_request_buffering proxy_ignore_client_abort proxy_intercept_errors fastcgi_buffering etag chunked_transfer_encoding sub_filter_once http2 http3 http3_hq ssl_early_data ssl_reject_handshake gzip_static_off proxy_ssl_server_name proxy_ssl_verify proxy_ssl_session_reuse proxy_cache_lock proxy_cache_revalidate proxy_cache_background_update rewrite_log proxy_socket_keepalive`.split(/\s+/)) {
	FLAG_DIRECTIVES[name] = ['on', 'off'];
}
FLAG_DIRECTIVES.server_tokens = ['on', 'off', 'build'];
FLAG_DIRECTIVES.gzip_static = ['on', 'off', 'always'];
FLAG_DIRECTIVES.lingering_close = ['on', 'off', 'always'];
FLAG_DIRECTIVES.ssl_verify_client = ['on', 'off', 'optional', 'optional_no_ca'];
FLAG_DIRECTIVES.ssl = ['on', 'off'];
FLAG_DIRECTIVES.ssl_early_data = ['on', 'off'];
delete FLAG_DIRECTIVES.gzip_static_off;

const SIZE_DIRECTIVES = new Set(
	`client_max_body_size client_body_buffer_size client_header_buffer_size proxy_buffer_size proxy_busy_buffers_size gzip_min_length sendfile_max_chunk ssl_buffer_size fastcgi_buffer_size fastcgi_busy_buffers_size subrequest_output_buffer_size proxy_max_temp_file_size proxy_temp_file_write_size directio large_client_header_buffers_size`.split(/\s+/),
);
const TIME_DIRECTIVES = new Set(
	`send_timeout client_body_timeout client_header_timeout proxy_connect_timeout proxy_read_timeout proxy_send_timeout resolver_timeout ssl_session_timeout lingering_timeout fastcgi_connect_timeout fastcgi_read_timeout fastcgi_send_timeout grpc_connect_timeout grpc_read_timeout grpc_send_timeout uwsgi_connect_timeout uwsgi_read_timeout uwsgi_send_timeout scgi_connect_timeout scgi_read_timeout scgi_send_timeout keepalive_time worker_shutdown_timeout proxy_next_upstream_timeout proxy_protocol_timeout`.split(/\s+/),
);
const INT_DIRECTIVES: Record<string, [number, number]> = {
	worker_connections: [1, Number.MAX_SAFE_INTEGER],
	keepalive_requests: [1, Number.MAX_SAFE_INTEGER],
	worker_rlimit_nofile: [1, Number.MAX_SAFE_INTEGER],
	gzip_comp_level: [1, 9],
	ssl_verify_depth: [0, Number.MAX_SAFE_INTEGER],
	proxy_next_upstream_tries: [0, Number.MAX_SAFE_INTEGER],
	limit_rate_after: [0, Number.MAX_SAFE_INTEGER],
	worker_priority: [-20, 20],
};
const ARITY: Record<string, [number, number]> = {
	worker_processes: [1, 1],
	worker_connections: [1, 1],
	client_max_body_size: [1, 1],
	sendfile: [1, 1],
	server_tokens: [1, 1],
	gzip: [1, 1],
	root: [1, 1],
	alias: [1, 1],
	keepalive_timeout: [1, 2],
	proxy_pass: [1, 1],
	include: [1, 1],
	ssl_certificate: [1, 1],
	ssl_certificate_key: [1, 1],
	return: [1, 2],
	error_page: [2, 99],
	listen: [1, 99],
	server_name: [1, 99],
	ssl_protocols: [1, 99],
	ssl_ciphers: [1, 1],
};

const SIZE_RE = /^\d+[kKmMgG]?$/;
const TIME_RE = /^(\d+(ms|s|m|h|d|w|M|y)?)+$/;
const SSL_PROTOCOLS = ['SSLv2', 'SSLv3', 'TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
const WEAK_CIPHER_RE = /(RC4|DES|MD5|EXPORT|NULL|LOW|EXP|ANON|ADH|AECDH)/i;

function hasVariable(args: string[]): boolean {
	return args.some((a) => a.includes('$'));
}

function validateDirective(node: NginxNode, out: NginxIssue[]) {
	const { name, args, line } = node;
	if (node.type !== 'directive') return;

	const arity = ARITY[name];
	if (arity && (args.length < arity[0] || args.length > arity[1])) {
		const expected = arity[0] === arity[1] ? String(arity[0]) : arity[1] >= 99 ? `${arity[0]}+` : `${arity[0]}-${arity[1]}`;
		out.push(
			issue(line, 'error', 'param-arity', 'param-arity', { directive: name, count: args.length, expected }, `"${name}" takes ${expected} argument(s) but ${args.length} were given.`),
		);
		return;
	}
	if (args.length === 0) return;

	const flag = FLAG_DIRECTIVES[name];
	if (flag && !hasVariable(args)) {
		if (args.length !== 1) {
			out.push(issue(line, 'error', 'param-arity', 'param-arity', { directive: name, count: args.length, expected: '1' }, `"${name}" takes 1 argument but ${args.length} were given.`));
		} else if (!flag.includes(args[0])) {
			out.push(
				issue(line, 'error', 'param-invalid-flag', 'param-invalid-flag', { directive: name, value: args[0], allowed: flag.join(' | ') }, `"${name}" must be one of: ${flag.join(', ')} (got "${args[0]}").`),
			);
		}
		return;
	}

	if (name === 'worker_processes') {
		const v = args[0];
		if (v !== 'auto' && !/^\d+$/.test(v)) {
			out.push(issue(line, 'error', 'param-invalid-number', 'param-invalid-number', { directive: name, value: v }, `"worker_processes" must be "auto" or a positive integer (got "${v}").`));
		} else if (v !== 'auto' && Number(v) < 1) {
			out.push(issue(line, 'error', 'param-out-of-range', 'param-out-of-range', { directive: name, value: v, min: 1, max: 'inf' }, '"worker_processes" must be at least 1.'));
		}
		return;
	}

	const intRange = INT_DIRECTIVES[name];
	if (intRange && !hasVariable(args)) {
		const v = args[0];
		if (!/^-?\d+$/.test(v)) {
			out.push(issue(line, 'error', 'param-invalid-number', 'param-invalid-number', { directive: name, value: v }, `"${name}" must be an integer (got "${v}").`));
		} else if (Number(v) < intRange[0] || Number(v) > intRange[1]) {
			const max = intRange[1] === Number.MAX_SAFE_INTEGER ? 'inf' : intRange[1];
			out.push(
				issue(line, 'error', 'param-out-of-range', 'param-out-of-range', { directive: name, value: v, min: intRange[0], max }, `"${name}" must be between ${intRange[0]} and ${max} (got ${v}).`),
			);
		}
		return;
	}

	if (SIZE_DIRECTIVES.has(name) && !hasVariable(args)) {
		const v = args[0];
		if (!SIZE_RE.test(v)) {
			out.push(issue(line, 'error', 'param-invalid-size', 'param-invalid-size', { directive: name, value: v }, `"${name}" must be a size such as 512, 64k or 10m (got "${v}").`));
		}
		return;
	}

	if ((TIME_DIRECTIVES.has(name) || name === 'keepalive_timeout') && !hasVariable(args)) {
		for (const v of args.slice(0, name === 'keepalive_timeout' ? 2 : 1)) {
			if (!TIME_RE.test(v)) {
				out.push(issue(line, 'error', 'param-invalid-time', 'param-invalid-time', { directive: name, value: v }, `"${name}" must be a time such as 30s, 5m or 1h (got "${v}").`));
				break;
			}
		}
		return;
	}

	if (name === 'ssl_protocols') {
		for (const v of args) {
			if (!SSL_PROTOCOLS.includes(v)) {
				out.push(
					issue(line, 'error', 'param-invalid-enum', 'param-invalid-enum', { directive: name, value: v, allowed: SSL_PROTOCOLS.join(' ') }, `"ssl_protocols" does not accept "${v}" (valid: ${SSL_PROTOCOLS.join(', ')}; names are case-sensitive).`),
				);
			}
		}
		return;
	}

	if (name === 'ssl_ciphers' && !hasVariable(args)) {
		const weak = args[0]
			.split(':')
			.filter((c) => c !== '' && !c.startsWith('!') && !c.startsWith('-') && WEAK_CIPHER_RE.test(c));
		if (weak.length > 0) {
			out.push(issue(line, 'warning', 'weak-ssl-cipher', 'weak-ssl-cipher', { ciphers: weak.join(', ') }, `"ssl_ciphers" enables weak ciphers: ${weak.join(', ')}.`));
		}
		return;
	}

	if (name === 'return') {
		const first = args[0];
		if (/^\d+$/.test(first)) {
			const code = Number(first);
			if (code < 100 || code > 599) {
				out.push(issue(line, 'error', 'return-invalid-code', 'return-invalid-code', { code: first }, `"return ${first}" is not a valid HTTP status code (use 100-599).`));
			} else if ([301, 302, 303, 307, 308].includes(code) && args.length < 2) {
				out.push(issue(line, 'error', 'return-needs-url', 'return-needs-url', { code: first }, `"return ${first}" is a redirect and needs a target URL as the second argument.`));
			}
		} else if (args.length === 1 && !/^(https?:\/\/|\$|\/)/.test(first) && !first.includes('$')) {
			out.push(issue(line, 'error', 'return-invalid-code', 'return-invalid-code', { code: first }, `"return ${first}": the first argument must be a status code or a full URL.`));
		}
		return;
	}

	if (name === 'error_page') {
		const codes = args.slice(0, -1).filter((a) => !a.startsWith('='));
		const bad = codes.find((c) => !/^\d+$/.test(c) || Number(c) < 300 || Number(c) > 599);
		if (bad !== undefined) {
			out.push(issue(line, 'error', 'error-page-invalid', 'error-page-invalid', { value: bad }, `"error_page": "${bad}" is not a valid error code (300-599).`));
		}
		return;
	}

	if (name === 'listen') {
		const info = parseListen(args);
		if (!info) return;
		if (!info.portValid) {
			out.push(issue(line, 'error', 'listen-invalid-port', 'listen-invalid-port', { value: args[0] }, `"listen ${args[0]}": the port must be a number between 1 and 65535.`));
		}
		for (const opt of info.options) {
			const base = opt.split('=')[0];
			if (!(LISTEN_FLAGS.has(opt) || (opt.includes('=') && LISTEN_KV.has(base)))) {
				out.push(issue(line, 'error', 'listen-invalid-option', 'listen-invalid-option', { option: opt }, `"listen": unknown parameter "${opt}".`));
			}
		}
	}
}

// ---------------------------------------------------------------------------
// structural checks
// ---------------------------------------------------------------------------
const HEADER_DIRECTIVES: [string, string][] = [
	['add_header', 'add-header-redefine'],
	['proxy_set_header', 'proxy-set-header-redefine'],
];

interface HeaderSet {
	line: number;
	names: Set<string>;
}

function ownHeaders(node: NginxNode, directive: string): HeaderSet | null {
	const list = children(node, directive);
	if (list.length === 0) return null;
	return { line: list[0].line, names: new Set(list.map((c) => (c.args[0] ?? '').toLowerCase())) };
}

function checkHeaderRedefinition(node: NginxNode, inherited: Record<string, HeaderSet | null>, out: NginxIssue[]) {
	const next: Record<string, HeaderSet | null> = { ...inherited };
	for (const [directive, key] of HEADER_DIRECTIVES) {
		const own = ownHeaders(node, directive);
		const parent = inherited[directive] ?? null;
		if (own && parent && node.type === 'block' && node.name !== 'main') {
			const missing = [...parent.names].filter((h) => h !== '' && !own.names.has(h));
			if (missing.length > 0) {
				out.push(
					issue(
						own.line,
						'warning',
						key,
						key,
						{ directive, parentLine: parent.line, names: missing.join(', ') },
						`"${directive}" in this block replaces ALL "${directive}" values inherited from the parent block (line ${parent.line}); missing here: ${missing.join(', ')}.`,
					),
				);
			}
		}
		next[directive] = own ?? parent;
	}
	return next;
}

const IF_SAFE = new Set(['return', 'rewrite', 'set', 'break']);
const ACCESS_CONTROL = ['allow', 'deny', 'auth_basic', 'auth_request'];

const PASS_DIRECTIVES = ['proxy_pass', 'fastcgi_pass', 'uwsgi_pass', 'scgi_pass', 'grpc_pass'];

function upstreamNameOf(directive: string, arg: string): string | null {
	let host: string;
	if (directive === 'proxy_pass' || directive === 'grpc_pass') {
		const m = /^[a-z0-9+.-]+:\/\/([^/?\s]+)/i.exec(arg);
		if (!m) return null;
		host = m[1];
	} else {
		host = arg.replace(/^[a-z]+:\/\//i, '').split('/')[0];
	}
	if (host === '' || /[$:.[]/.test(host) || host.startsWith('unix') || host.toLowerCase() === 'localhost') return null;
	return host;
}

export function runExtendedChecks(root: NginxNode, isFragment: boolean): NginxIssue[] {
	const out: NginxIssue[] = [];
	const upstreams = new Set<string>();
	let hasInclude = false;

	const all = [root, ...descendants(root)];
	for (const n of all) {
		if (n.type === 'block' && n.name === 'upstream' && n.args[0]) upstreams.add(n.args[0]);
		if (n.type === 'directive' && n.name === 'include') hasInclude = true;
	}

	// Walk with ancestor info.
	const walk = (node: NginxNode, ancestors: NginxNode[], headers: Record<string, HeaderSet | null>) => {
		if (DATA_BLOCKS.has(node.name)) return;
		const parent = ancestors[ancestors.length - 1];
		const insideStreamOrMail = ancestors.some((a) => a.name === 'stream' || a.name === 'mail');

		if (node.type === 'directive') {
			validateDirective(node, out);
			if (node.name === 'valid_referers' && node.args.includes('none')) {
				out.push(issue(node.line, 'warning', 'valid-referers-none', 'valid-referers-none', {}, '"valid_referers none" also accepts requests that send NO Referer header, so the referer check is trivially bypassed.'));
			}
			if (PASS_DIRECTIVES.includes(node.name) && !isFragment && !hasInclude && node.args[0]) {
				const name = upstreamNameOf(node.name, node.args[0]);
				if (name && !upstreams.has(name)) {
					out.push(
						issue(
							node.line,
							'warning',
							'upstream-undeclared',
							'upstream-undeclared',
							{ directive: node.name, name },
							`"${node.name}" points at "${name}", which is not declared as an upstream block in this file (ignore this if it is a real host name).`,
						),
					);
				}
			}
			if (node.name === 'stub_status') {
				const chain = [...ancestors, node];
				const protectedByAcl = chain.some((a) => (a.children ?? []).some((c) => ACCESS_CONTROL.includes(c.name) && !(c.name === 'auth_basic' && c.args[0] === 'off')));
				if (!protectedByAcl) {
					out.push(issue(node.line, 'warning', 'status-page-exposed', 'status-page-exposed', {}, '"stub_status" exposes live connection counters to anyone who can reach this location — restrict it with allow/deny or auth_basic.'));
				}
			}
			return;
		}

		// ---- block-level checks ----
		if (node.name === 'location') {
			const loc = parseLocation(node);
			const alias = children(node, 'alias')[0];
			if (alias && !loc.isRegex && !loc.isNamed && loc.modifier !== '=' && loc.path !== '' && !loc.path.endsWith('/')) {
				out.push(
					issue(alias.line, 'error', 'alias-traversal', 'alias-traversal', { location: loc.path }, `location "${loc.path}" does not end with "/" but uses alias — a request like "${loc.path}../" can read files outside the aliased directory (path traversal). End both with "/".`),
				);
			}
			for (const rootDir of children(node, 'root')) {
				out.push(issue(rootDir.line, 'warning', 'root-in-location', 'root-in-location', { location: loc.path }, `"root" is set inside location "${loc.path}" — prefer one "root" at server level; per-location roots are easy to get wrong (see also alias).`));
			}
		}

		if (node.name === 'if' && parent?.name === 'location') {
			const unsafe = [...new Set((node.children ?? []).filter((c) => !IF_SAFE.has(c.name)).map((c) => c.name))];
			if (unsafe.length > 0) {
				out.push(issue(node.line, 'warning', 'if-in-location', 'if-in-location', { directives: unsafe.join(', ') }, `"if" inside a location is unreliable when it contains ${unsafe.join(', ')}; only return/rewrite/set are safe. Use "map", "try_files" or separate locations instead.`));
			}
		}

		if (['http', 'server', 'location', 'limit_except'].includes(node.name)) {
			const allows = children(node, 'allow');
			if (allows.length > 0) {
				const denies = children(node, 'deny');
				const denyAll = denies.some((d) => d.args[0] === 'all' || d.args[0] === '0.0.0.0/0');
				if (!denyAll) {
					out.push(issue(allows[0].line, 'warning', 'allow-without-deny', 'allow-without-deny', {}, '"allow" without a following "deny all;" in the same block restricts nothing: addresses that match no rule are allowed by default.'));
				}
			}
		}

		if (node.name === 'location' && !insideStreamOrMail) {
			const loc = parseLocation(node);
			const check = (n: NginxNode) => {
				for (const pass of children(n, 'proxy_pass')) {
					const target = pass.args[0] ?? '';
					const m = /^[a-z0-9+.-]+:\/\/[^/?\s]*(\/.*)?$/i.exec(target);
					if (m && m[1] !== undefined && !target.includes('$')) {
						if (loc.isRegex || loc.isNamed || n.name === 'if' || n.name === 'limit_except') {
							out.push(
								issue(pass.line, 'error', 'proxy-pass-uri-regex', 'proxy-pass-uri-regex', { location: loc.path }, 'nginx rejects "proxy_pass" with a URI part ("/…") in a regex location, named location, "if" or "limit_except" — remove the URI or use a variable.'),
							);
						}
					}
				}
			};
			check(node);
			for (const c of node.children ?? []) if (c.name === 'if' || c.name === 'limit_except') check(c);
		}

		if (node.name === 'server' && !insideStreamOrMail) {
			const sslServer =
				children(node, 'listen').some((l) => l.args.slice(1).includes('ssl') || l.args.slice(1).includes('quic')) || hasChild(node, 'ssl_certificate');
			if (sslServer) {
				const scope = [...ancestors, node, ...descendants(node)];
				const hasHsts = scope.some((n) => n.type === 'block' && (n.children ?? []).some((c) => c.name === 'add_header' && (c.args[0] ?? '').toLowerCase() === 'strict-transport-security'));
				if (!hasHsts) {
					out.push(issue(node.line, 'warning', 'missing-hsts', 'missing-hsts', {}, 'This TLS server never sends a "Strict-Transport-Security" header — add: add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'));
				}
			}
		}

		// Duplicate default_server / server_name per listen address, per http/stream scope.
		if (node.name === 'http' || node.name === 'stream' || node.name === 'main') {
			const servers = children(node, 'server');
			const defaults = new Map<string, NginxNode>();
			const names = new Map<string, NginxNode>();
			for (const server of servers) {
				const listens = children(server, 'listen');
				const infos = listens.map((l) => parseListen(l.args)).filter((i): i is ListenInfo => i !== null);
				const keys = infos.length > 0 ? infos : [{ key: '*:80', isDefault: false } as ListenInfo];
				const serverNames = children(server, 'server_name').flatMap((s) => s.args.map((a) => a.toLowerCase()));
				const nameList = serverNames.length > 0 ? serverNames : [''];
				for (const info of keys) {
					if (info.isDefault) {
						const prior = defaults.get(info.key);
						if (prior) {
							out.push(issue(server.line, 'error', 'duplicate-default-server', 'duplicate-default-server', { listen: info.key, line: prior.line }, `A second "default_server" for ${info.key} (first one at line ${prior.line}) — nginx refuses to start.`));
						} else defaults.set(info.key, server);
					}
					for (const name of nameList) {
						const id = `${info.key}|${name}`;
						const prior = names.get(id);
						if (prior && prior !== server) {
							out.push(
								issue(
									server.line,
									'warning',
									'duplicate-server-name',
									'duplicate-server-name',
									{ name: name === '' ? '(empty)' : name, listen: info.key, line: prior.line },
									`server_name "${name}" on ${info.key} is already used by the server at line ${prior.line}; nginx ignores this one ("conflicting server name").`,
								),
							);
						} else if (!prior) names.set(id, server);
					}
				}
			}
		}

		const nextHeaders = checkHeaderRedefinition(node, headers, out);
		for (const child of node.children ?? []) walk(child, [...ancestors, node], nextHeaders);
	};

	walk(root, [], { add_header: null, proxy_set_header: null });
	return out;
}

// ---------------------------------------------------------------------------
// JSON report
// ---------------------------------------------------------------------------
export function buildNginxJsonReport(issues: NginxIssue[], meta: { fragment: boolean }): Record<string, unknown> {
	return {
		tool: 'nginx-config-validator',
		fragment: meta.fragment,
		summary: {
			errors: issues.filter((i) => i.severity === 'error').length,
			warnings: issues.filter((i) => i.severity === 'warning').length,
		},
		issues: issues.map((i) => ({ line: i.line, severity: i.severity, rule: i.ruleId, key: i.key, params: i.params, message: i.message })),
	};
}
