// Hand-rolled nginx.conf parser + linter — no dependency added, same "hand-roll
// it in pure JS" precedent as this repo's BMP/ICO encoders and Regex Tester's
// own match engine. nginx's real config grammar has no formal public spec
// (it's whatever nginx's own C tokenizer accepts), so this covers the common,
// well-documented subset: `{ }` blocks, `;`-terminated directives, `#`
// comments (only where a token starts, like nginx), single/double-quoted strings,
// `${var}` variables and backslash escapes. It is NOT a full reimplementation
// of nginx's parser or of Gixy's full rule set — see the rule list below for
// exactly what is (and isn't) checked.

import { EXTENDED_ISSUE_KEYS, runExtendedChecks } from './nginx-checks';

export type Severity = 'error' | 'warning';

export interface NginxIssue {
	line: number;
	severity: Severity;
	ruleId: string;
	/** English fallback text (also what the unit tests assert on). */
	message: string;
	/** i18n key suffix for this exact message variant (see NGINX_ISSUE_KEYS). */
	key: string;
	/** Values for the `{{placeholders}}` of the i18n message. */
	params: Record<string, string | number>;
}

/** Every `key` an issue can carry — the page builds one i18n message per entry. */
const BASE_ISSUE_KEYS = [
	'missing-semicolon',
	'missing-semicolon-eof',
	'unexpected-close',
	'unclosed-block',
	'possible-missing-semicolon',
	'wrong-context',
	'crlf-injection-risk',
	'autoindex-enabled',
	'server-tokens-exposed',
	'unclosed-quote',
	'unknown-directive',
	'unknown-directive-suggest',
	'weak-ssl-protocol',
] as const;

export const NGINX_ISSUE_KEYS = [...BASE_ISSUE_KEYS, ...EXTENDED_ISSUE_KEYS] as const;

export interface NginxNode {
	type: 'directive' | 'block';
	name: string;
	args: string[];
	line: number;
	children?: NginxNode[];
}

export interface NginxParseResult {
	issues: NginxIssue[];
	root: NginxNode;
	/** Offset (in the original input) just after the last real token — where a missing ";" belongs. */
	lastTokenEnd: number;
	/** True when the input was treated as an included fragment (top-level server/location/... allowed). */
	isFragment: boolean;
}

export interface NginxParseOptions {
	/** `true` = always treat as fragment, `false` = never, `'auto'` (default) = fragment when no http/events/stream/mail block. */
	fragment?: boolean | 'auto';
}

interface Token {
	kind: 'word' | 'open' | 'close' | 'semi';
	value?: string;
	line: number;
	start: number;
	end: number;
}

function makeIssue(
	line: number,
	severity: Severity,
	ruleId: string,
	key: string,
	params: Record<string, string | number>,
	message: string,
): NginxIssue {
	return { line, severity, ruleId, key, params, message };
}

// ---------------------------------------------------------------------------
// Known directives (core + the standard modules shipped with nginx). Used for
// "unknown directive" detection and for the missing-semicolon heuristic.
// ---------------------------------------------------------------------------
const KNOWN_DIRECTIVES = new Set(
	`
accept_mutex accept_mutex_delay daemon debug_connection debug_points env error_log events include lock_file load_module master_process multi_accept
pcre_jit pid ssl_engine thread_pool timer_resolution use user worker_aio_requests worker_connections worker_cpu_affinity worker_priority
worker_processes worker_rlimit_core worker_rlimit_nofile worker_shutdown_timeout working_directory
http server location upstream map geo split_clients limit_except types if set break return rewrite rewrite_log uninitialized_variable_warn
absolute_redirect aio aio_write alias auth_delay chunked_transfer_encoding client_body_buffer_size client_body_in_file_only client_body_in_single_buffer
client_body_temp_path client_body_timeout client_header_buffer_size client_header_timeout client_max_body_size connection_pool_size default_type directio
directio_alignment disable_symlinks error_page etag http2 http2_body_preread_size http2_chunk_size http2_idle_timeout http2_max_concurrent_pushes
http2_max_concurrent_streams http2_max_field_size http2_max_header_size http2_max_requests http2_push http2_push_preload http2_recv_buffer_size
http2_recv_timeout http3 http3_hq http3_max_concurrent_streams http3_stream_buffer_size if_modified_since ignore_invalid_headers internal keepalive_disable
keepalive_requests keepalive_time keepalive_timeout large_client_header_buffers limit_rate limit_rate_after lingering_close lingering_time lingering_timeout
listen log_not_found log_subrequest max_ranges merge_slashes min_delete_depth msie_padding msie_refresh open_file_cache open_file_cache_errors
open_file_cache_min_uses open_file_cache_valid output_buffers port_in_redirect postpone_output read_ahead recursive_error_pages request_pool_size
reset_timedout_connection resolver resolver_timeout root satisfy send_lowat send_timeout sendfile sendfile_max_chunk server_name
server_name_in_redirect server_names_hash_bucket_size server_names_hash_max_size server_tokens subrequest_output_buffer_size tcp_nodelay tcp_nopush
try_files types_hash_bucket_size types_hash_max_size underscores_in_headers variables_hash_bucket_size variables_hash_max_size
access_log log_format open_log_file_cache
add_header add_trailer expires
gzip gzip_buffers gzip_comp_level gzip_disable gzip_http_version gzip_min_length gzip_proxied gzip_types gzip_vary gzip_static gunzip gunzip_buffers
ssl ssl_buffer_size ssl_certificate ssl_certificate_key ssl_ciphers ssl_client_certificate ssl_conf_command ssl_crl ssl_dhparam ssl_early_data
ssl_ecdh_curve ssl_ocsp ssl_ocsp_cache ssl_ocsp_responder ssl_password_file ssl_prefer_server_ciphers ssl_protocols ssl_reject_handshake
ssl_session_cache ssl_session_ticket_key ssl_session_tickets ssl_session_timeout ssl_stapling ssl_stapling_file ssl_stapling_responder ssl_stapling_verify
ssl_trusted_certificate ssl_verify_client ssl_verify_depth ssl_handshake_timeout ssl_preread
proxy_bind proxy_buffer_size proxy_buffering proxy_buffers proxy_busy_buffers_size proxy_cache proxy_cache_background_update proxy_cache_bypass
proxy_cache_convert_head proxy_cache_key proxy_cache_lock proxy_cache_lock_age proxy_cache_lock_timeout proxy_cache_max_range_offset
proxy_cache_methods proxy_cache_min_uses proxy_cache_path proxy_cache_purge proxy_cache_revalidate proxy_cache_use_stale proxy_cache_valid
proxy_connect_timeout proxy_cookie_domain proxy_cookie_flags proxy_cookie_path proxy_force_ranges proxy_headers_hash_bucket_size
proxy_headers_hash_max_size proxy_hide_header proxy_http_version proxy_ignore_client_abort proxy_ignore_headers proxy_intercept_errors
proxy_limit_rate proxy_max_temp_file_size proxy_method proxy_next_upstream proxy_next_upstream_timeout proxy_next_upstream_tries proxy_no_cache
proxy_pass proxy_pass_header proxy_pass_request_body proxy_pass_request_headers proxy_protocol proxy_protocol_timeout proxy_read_timeout proxy_redirect
proxy_request_buffering proxy_requests proxy_responses proxy_send_lowat proxy_send_timeout proxy_set_body proxy_set_header proxy_socket_keepalive
proxy_ssl_certificate proxy_ssl_certificate_key proxy_ssl_ciphers proxy_ssl_conf_command proxy_ssl_crl proxy_ssl_name proxy_ssl_password_file
proxy_ssl_protocols proxy_ssl_server_name proxy_ssl_session_reuse proxy_ssl_trusted_certificate proxy_ssl_verify proxy_ssl_verify_depth
proxy_store proxy_store_access proxy_temp_file_write_size proxy_temp_path proxy_timeout proxy_upload_rate proxy_download_rate
fastcgi_bind fastcgi_buffer_size fastcgi_buffering fastcgi_buffers fastcgi_busy_buffers_size fastcgi_cache fastcgi_cache_background_update
fastcgi_cache_bypass fastcgi_cache_key fastcgi_cache_lock fastcgi_cache_methods fastcgi_cache_min_uses fastcgi_cache_path fastcgi_cache_purge
fastcgi_cache_revalidate fastcgi_cache_use_stale fastcgi_cache_valid fastcgi_catch_stderr fastcgi_connect_timeout fastcgi_hide_header
fastcgi_ignore_client_abort fastcgi_ignore_headers fastcgi_index fastcgi_intercept_errors fastcgi_keep_conn fastcgi_limit_rate fastcgi_max_temp_file_size
fastcgi_next_upstream fastcgi_next_upstream_timeout fastcgi_next_upstream_tries fastcgi_no_cache fastcgi_param fastcgi_pass fastcgi_pass_header
fastcgi_pass_request_body fastcgi_pass_request_headers fastcgi_read_timeout fastcgi_request_buffering fastcgi_send_lowat fastcgi_send_timeout
fastcgi_split_path_info fastcgi_store fastcgi_store_access fastcgi_temp_file_write_size fastcgi_temp_path
uwsgi_bind uwsgi_buffer_size uwsgi_buffering uwsgi_buffers uwsgi_busy_buffers_size uwsgi_cache uwsgi_cache_bypass uwsgi_cache_key uwsgi_cache_path
uwsgi_cache_valid uwsgi_connect_timeout uwsgi_hide_header uwsgi_ignore_headers uwsgi_intercept_errors uwsgi_modifier1 uwsgi_modifier2 uwsgi_next_upstream
uwsgi_no_cache uwsgi_param uwsgi_pass uwsgi_pass_header uwsgi_read_timeout uwsgi_send_timeout uwsgi_ssl_server_name uwsgi_temp_path uwsgi_cache_use_stale
scgi_bind scgi_buffer_size scgi_buffering scgi_buffers scgi_cache scgi_cache_key scgi_cache_path scgi_cache_valid scgi_connect_timeout scgi_param
scgi_pass scgi_read_timeout scgi_send_timeout scgi_temp_path
grpc_bind grpc_buffer_size grpc_connect_timeout grpc_hide_header grpc_intercept_errors grpc_next_upstream grpc_pass grpc_pass_header grpc_read_timeout
grpc_send_timeout grpc_set_header grpc_ssl_certificate grpc_ssl_certificate_key grpc_ssl_name grpc_ssl_server_name grpc_ssl_trusted_certificate grpc_ssl_verify
memcached_bind memcached_buffer_size memcached_connect_timeout memcached_gzip_flag memcached_next_upstream memcached_pass memcached_read_timeout memcached_send_timeout
hash ip_hash keepalive least_conn least_time random zone state queue ntlm sticky
allow deny auth_basic auth_basic_user_file auth_request auth_request_set auth_http auth_http_header auth_http_pass_client_cert auth_http_timeout
limit_conn limit_conn_dry_run limit_conn_log_level limit_conn_status limit_conn_zone limit_req limit_req_dry_run limit_req_log_level limit_req_status limit_req_zone
real_ip_header real_ip_recursive set_real_ip_from
index autoindex autoindex_exact_size autoindex_format autoindex_localtime random_index
charset charset_map charset_types override_charset source_charset
referer_hash_bucket_size referer_hash_max_size valid_referers
secure_link secure_link_md5 secure_link_secret
sub_filter sub_filter_last_modified sub_filter_once sub_filter_types
addition_types add_before_body add_after_body
ssi ssi_last_modified ssi_min_file_chunk ssi_silent_errors ssi_types ssi_value_length
image_filter image_filter_buffer image_filter_interlace image_filter_jpeg_quality image_filter_sharpen image_filter_transparency image_filter_webp_quality
mp4 mp4_buffer_size mp4_max_buffer_size mp4_limit_rate mp4_limit_rate_after flv
geoip_country geoip_city geoip_org geoip_proxy geoip_proxy_recursive
userid userid_domain userid_expires userid_flags userid_mark userid_name userid_p3p userid_path userid_service
slice stub_status empty_gif browser ancient_browser ancient_browser_value modern_browser modern_browser_value
mirror mirror_request_body split_clients status_zone api
xslt_last_modified xslt_param xslt_string_param xslt_stylesheet xslt_types
dav_access dav_methods create_full_put_path min_delete_depth
perl perl_modules perl_require perl_set
js_import js_path js_set js_content js_var js_preload_object js_body_filter js_header_filter js_fetch_trusted_certificate js_shared_dict_zone
stream mail server_name_in_redirect pop3_auth pop3_capabilities protocol imap_auth imap_capabilities imap_client_buffer smtp_auth smtp_capabilities smtp_client_buffer
smtp_greeting_delay xclient so_keepalive tcp_nodelay preread_buffer_size preread_timeout proxy_pass_error_message ssl_ciphers
upstream_conf health_check match status header body require
map_hash_bucket_size map_hash_max_size quic_retry quic_gso quic_bpf quic_host_key max_errors session_log proxy_ssl_server_name
ssl_certificate_cache
log_by_lua_block
quic_active_connection_id_limit http3_push http3_push_preload ssl_alpn proxy_half_close proxy_ssl_alpn proxy_ssl_certificate_cache
proxy_cache_max_range_offset fastcgi_cache_max_range_offset keepalive_time ssl_session_ticket_key
`
		.split(/\s+/)
		.filter(Boolean),
);

// Directives from well-known third-party / commercial modules (Lua, njs, ModSecurity, Brotli,
// headers-more, NGINX Plus, ...): never reported as "unknown" because the real server may
// have those modules compiled in.
const THIRD_PARTY_PREFIX =
	/^(lua_|js_|njs_|perl_|set_by_lua|content_by_lua|access_by_lua|rewrite_by_lua|header_filter_by_lua|body_filter_by_lua|log_by_lua|init_by_lua|init_worker_by_lua|ssl_certificate_by_lua|balancer_by_lua|more_|brotli|modsecurity|vhost_traffic|zone_sync|health_check|sticky_|keyval|f4f|hls|geoip2_|pagespeed|ndk_|echo_|srcache_|redis|memc_|rds_|drizzle_|postgres_|array_|encrypted_session|set_misc|opentracing|otel_|auth_jwt|mqtt|rtmp|vod_|fancyindex|substitutions|upload_|cache_purge|testcookie|ngx_|ssl_certificate_cache|waf|naxsi|cookie_flag|vts_|geoip_|zstd)/;

// Directive -> contexts it may appear in. A directive that is not listed has no context
// restriction (a false "wrong context" report is worse than staying silent).
const DIRECTIVE_CONTEXTS: Record<string, string[]> = {};
function defineContexts(contexts: string, names: string) {
	const list = contexts.split(/\s+/);
	for (const name of names.split(/\s+/).filter(Boolean)) DIRECTIVE_CONTEXTS[name] = list;
}
defineContexts(
	'main',
	'worker_processes worker_rlimit_core worker_rlimit_nofile worker_priority worker_cpu_affinity worker_shutdown_timeout daemon master_process pid user pcre_jit thread_pool timer_resolution lock_file working_directory env load_module debug_points ssl_engine',
);
defineContexts('events', 'worker_connections multi_accept accept_mutex accept_mutex_delay worker_aio_requests debug_connection');
defineContexts('main', 'events http stream mail');
defineContexts('main http server location stream mail upstream', 'error_log');
defineContexts('http', 'upstream map_hash_bucket_size limit_req_zone limit_conn_zone proxy_cache_path fastcgi_cache_path uwsgi_cache_path scgi_cache_path log_format server_names_hash_bucket_size server_names_hash_max_size types_hash_max_size types_hash_bucket_size variables_hash_bucket_size variables_hash_max_size');
defineContexts('http stream', 'map geo split_clients');
defineContexts('http stream mail upstream', 'server');
defineContexts('server', 'listen server_name');
defineContexts('server location', 'location');
defineContexts('server location', 'if');
defineContexts('location', 'limit_except internal alias');
defineContexts('http server location if', 'root gzip expires add_header add_trailer error_page');
defineContexts('http server', 'http3 http3_hq http3_max_concurrent_streams http3_stream_buffer_size quic_retry quic_gso quic_bpf quic_host_key quic_active_connection_id_limit');
defineContexts('http server location', 'index proxy_set_header proxy_redirect proxy_http_version proxy_connect_timeout proxy_read_timeout proxy_send_timeout proxy_buffering proxy_buffers proxy_buffer_size proxy_cache proxy_cache_valid proxy_hide_header proxy_pass_header proxy_ignore_headers proxy_intercept_errors proxy_next_upstream gzip_types gzip_vary gzip_min_length gzip_comp_level gzip_proxied client_max_body_size client_body_timeout autoindex server_tokens charset error_page keepalive_timeout sendfile tcp_nopush tcp_nodelay limit_req limit_conn fastcgi_param fastcgi_index');
defineContexts('http server', 'ssl_certificate ssl_certificate_key ssl_protocols ssl_ciphers ssl_session_cache ssl_session_timeout ssl_prefer_server_ciphers ssl_dhparam ssl_stapling ssl_stapling_verify ssl_trusted_certificate ssl_session_tickets ssl_client_certificate ssl_verify_client');
defineContexts('upstream', 'ip_hash least_conn hash random zone queue ntlm keepalive');
defineContexts('http server location upstream', 'keepalive_requests keepalive_time');
DIRECTIVE_CONTEXTS.keepalive_timeout.push('upstream');
defineContexts('http server location limit_except', 'deny allow');
defineContexts('http server location if limit_except', 'access_log');
defineContexts('location if limit_except', 'proxy_pass');
defineContexts('location if', 'fastcgi_pass uwsgi_pass scgi_pass grpc_pass');
defineContexts('server location if', 'rewrite return set break');
defineContexts('server location', 'try_files');
defineContexts('http server location stream mail upstream', 'resolver');

// The missing-semicolon heuristic only trusts names that are essentially never legitimate
// continuation arguments (a short list on purpose: e.g. "http2" is a directive but also a
// normal second line of `listen 443 ssl\n http2;`).
const HEURISTIC_DIRECTIVE_NAMES = new Set([...Object.keys(DIRECTIVE_CONTEXTS), 'include']);

// Blocks that open a nested context named after themselves (`server { ... }`
// pushes context "server").
const BLOCK_CONTEXT_NAMES = new Set([
	'http',
	'events',
	'server',
	'location',
	'upstream',
	'if',
	'map',
	'types',
	'geo',
	'limit_except',
	'stream',
	'mail',
	'split_clients',
	'charset_map',
	'match',
]);

// Blocks whose body is DATA (key/value lines), not directives — never name- or context-checked.
const DATA_BLOCKS = new Set(['map', 'geo', 'types', 'split_clients', 'charset_map']);

function tokenize(input: string): { tokens: Token[]; issues: NginxIssue[] } {
	const tokens: Token[] = [];
	const issues: NginxIssue[] = [];
	let line = 1;
	let i = 0;
	let word = '';
	let wordStartLine = line;
	let wordStart = 0;

	const pushWord = () => {
		if (word !== '') {
			tokens.push({ kind: 'word', value: word, line: wordStartLine, start: wordStart, end: i });
			word = '';
		}
	};

	while (i < input.length) {
		const ch = input[i];
		const atTokenStart = word === '';

		if (atTokenStart) {
			// `#` starts a comment ONLY at the beginning of a token (like nginx) — `rewrite ^/a#b /x;`
			// must keep "#b" as part of the regex.
			if (ch === '#') {
				while (i < input.length && input[i] !== '\n') i++;
				continue;
			}
			if (ch === '{' || ch === '}' || ch === ';') {
				tokens.push({ kind: ch === '{' ? 'open' : ch === '}' ? 'close' : 'semi', line, start: i, end: i + 1 });
				i++;
				continue;
			}
			if (ch === '\n') {
				line++;
				i++;
				continue;
			}
			if (/\s/.test(ch)) {
				i++;
				continue;
			}
			if (ch === '"' || ch === "'") {
				const quote = ch;
				const startLine = line;
				const start = i;
				let raw = ch;
				i++;
				let closed = false;
				while (i < input.length) {
					const c = input[i];
					if (c === '\\') {
						const next = input[i + 1] ?? '';
						raw += c + next;
						if (next === '\n') line++;
						i += 2;
						continue;
					}
					if (c === quote) {
						raw += c;
						i++;
						closed = true;
						break;
					}
					if (c === '\n') line++;
					raw += c;
					i++;
				}
				if (!closed) {
					issues.push(
						makeIssue(startLine, 'error', 'unclosed-quote', 'unclosed-quote', { quote }, `Unclosed ${quote} quote — the string started here never ends.`),
					);
				}
				tokens.push({ kind: 'word', value: raw, line: startLine, start, end: i });
				continue;
			}
			wordStartLine = line;
			wordStart = i;
		}

		// Inside an unquoted word.
		if (ch === '\\') {
			const next = input[i + 1] ?? '';
			word += ch + next;
			if (next === '\n') line++;
			i += 2;
			continue;
		}
		if (ch === '$' && input[i + 1] === '{') {
			// ${var} — the braces belong to the variable, not to block syntax.
			let j = i + 2;
			while (j < input.length && input[j] !== '}' && input[j] !== '\n') j++;
			if (input[j] === '}') j++;
			word += input.slice(i, j);
			i = j;
			continue;
		}
		if (ch === ';' || ch === '{') {
			pushWord();
			tokens.push({ kind: ch === '{' ? 'open' : 'semi', line, start: i, end: i + 1 });
			i++;
			continue;
		}
		if (ch === '\n') {
			pushWord();
			line++;
			i++;
			continue;
		}
		if (/\s/.test(ch)) {
			pushWord();
			i++;
			continue;
		}
		word += ch;
		i++;
	}
	pushWord();
	return { tokens, issues };
}

function stripQuotes(raw: string): string {
	if (raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))) {
		return raw.slice(1, -1);
	}
	return raw;
}

function levenshtein(a: string, b: string): number {
	const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let diagonal = prev[0];
		prev[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const temp = prev[j];
			prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
			diagonal = temp;
		}
	}
	return prev[b.length];
}

export function suggestDirective(name: string): string | null {
	if (name.length < 4) return null;
	let best: string | null = null;
	let bestDistance = 3;
	for (const known of KNOWN_DIRECTIVES) {
		if (Math.abs(known.length - name.length) > 2) continue;
		const d = levenshtein(name, known);
		if (d < bestDistance) {
			bestDistance = d;
			best = known;
		}
	}
	return best;
}

// Heuristic for the single most common real-world typo: forgetting the `;`
// at the end of a directive, so the next directive's name and args silently
// become extra args of the previous one instead of a parse error (nginx's
// grammar genuinely doesn't require newlines between directives, only `;`/
// `{`/`}` — so this can't be detected as a hard grammar violation the way a
// brace mismatch can). Within one un-terminated word run, if a later word both
// (a) starts a new source line AND (b) exactly matches a known directive name,
// that's very likely "directive A" + "directive B" fused by a missing `;`.
// Flagged as a warning, not an error, since it's a heuristic.
function checkMissingSemicolonHeuristic(words: Token[], issues: NginxIssue[]) {
	if (words.length < 2) return;
	const firstLine = words[0].line;
	for (let i = 1; i < words.length; i++) {
		const w = words[i];
		if (w.line === firstLine) continue;
		const bare = stripQuotes(w.value ?? '');
		if (HEURISTIC_DIRECTIVE_NAMES.has(bare)) {
			issues.push(
				makeIssue(
					w.line,
					'warning',
					'possible-missing-semicolon',
					'possible-missing-semicolon',
					{ directive: bare, previous: words[0].value ?? '' },
					`"${bare}" looks like it starts a new directive, but the previous line has no ";" — did you forget one after "${words[0].value}"?`,
				),
			);
			return;
		}
	}
}

function looksLikeFragment(root: NginxNode): boolean {
	return !root.children!.some(
		(child) => ['http', 'events', 'stream', 'mail'].includes(child.name) || ['worker_processes', 'user', 'pid', 'load_module'].includes(child.name),
	);
}

function buildTree(
	tokens: Token[],
	fragmentOption: boolean | 'auto',
): { root: NginxNode; issues: NginxIssue[]; isFragment: boolean } {
	const issues: NginxIssue[] = [];
	const root: NginxNode = { type: 'block', name: 'main', args: [], line: 0, children: [] };
	const stack: NginxNode[] = [root];

	// The fragment decision needs the finished tree, but context errors are raised while
	// building — so context checks are queued and filtered afterwards.
	const pendingContextChecks: Array<{ node: NginxNode; context: string; parentIsData: boolean; skipContext: boolean }> = [];

	let pending: Token[] = [];

	const contextNameForStack = (): string => {
		for (let i = stack.length - 1; i >= 0; i--) {
			const name = stack[i].name;
			if (name === 'main' || BLOCK_CONTEXT_NAMES.has(name)) return name;
		}
		return 'main';
	};
	// stream{} and mail{} reuse names like server/proxy_pass/listen with different valid parents,
	// so they get the unknown-directive check but no context check.
	const insideDataBlock = (): boolean => stack.some((n) => DATA_BLOCKS.has(n.name));
	const insideStreamOrMail = (): boolean => stack.some((n) => n.name === 'stream' || n.name === 'mail');

	const registerNode = (node: NginxNode) => {
		pendingContextChecks.push({
			node,
			context: contextNameForStack(),
			parentIsData: insideDataBlock(),
			skipContext: insideStreamOrMail(),
		});
	};

	for (const token of tokens) {
		if (token.kind === 'word') {
			pending.push(token);
			continue;
		}
		if (token.kind === 'semi') {
			if (pending.length > 0) {
				checkMissingSemicolonHeuristic(pending, issues);
				const [nameTok, ...argToks] = pending;
				const node: NginxNode = {
					type: 'directive',
					name: stripQuotes(nameTok.value ?? ''),
					args: argToks.map((t) => stripQuotes(t.value ?? '')),
					line: nameTok.line,
				};
				stack[stack.length - 1].children!.push(node);
				registerNode(node);
			}
			pending = [];
			continue;
		}
		if (token.kind === 'open') {
			if (pending.length > 0) checkMissingSemicolonHeuristic(pending, issues);
			const [nameTok, ...argToks] =
				pending.length > 0 ? pending : [{ kind: 'word', value: '(anonymous)', line: token.line, start: token.start, end: token.end } as Token];
			const node: NginxNode = {
				type: 'block',
				name: stripQuotes(nameTok.value ?? ''),
				args: argToks.map((t) => stripQuotes(t.value ?? '')),
				line: nameTok.line,
				children: [],
			};
			stack[stack.length - 1].children!.push(node);
			registerNode(node);
			stack.push(node);
			pending = [];
			continue;
		}
		if (token.kind === 'close') {
			if (pending.length > 0) {
				issues.push(
					makeIssue(
						pending[0].line,
						'error',
						'missing-semicolon',
						'missing-semicolon',
						{ directive: pending[0].value ?? '' },
						`Directive "${pending[0].value}" is missing a terminating ";" before "}".`,
					),
				);
				pending = [];
			}
			if (stack.length <= 1) {
				issues.push(makeIssue(token.line, 'error', 'unmatched-brace', 'unexpected-close', {}, 'Unexpected "}" with no matching "{".'));
			} else {
				stack.pop();
			}
			continue;
		}
	}

	if (pending.length > 0) {
		issues.push(
			makeIssue(
				pending[0].line,
				'error',
				'missing-semicolon',
				'missing-semicolon-eof',
				{ directive: pending[0].value ?? '' },
				`Directive "${pending[0].value}" is missing a terminating ";" (reached end of file).`,
			),
		);
	}
	if (stack.length > 1) {
		for (let i = stack.length - 1; i > 0; i--) {
			issues.push(
				makeIssue(
					stack[i].line,
					'error',
					'unmatched-brace',
					'unclosed-block',
					{ name: stack[i].name },
					`Block "${stack[i].name}" opened here is never closed with "}".`,
				),
			);
		}
	}

	const isFragment = fragmentOption === 'auto' ? looksLikeFragment(root) : fragmentOption;

	for (const { node, context, parentIsData, skipContext } of pendingContextChecks) {
		if (parentIsData) continue;
		const allowed = DIRECTIVE_CONTEXTS[node.name];
		if (allowed && !skipContext && !allowed.includes(context)) {
			// Included fragments legitimately start at "http level" (server/location/upstream/map...)
			// or deeper — their real parent only exists in the file that `include`s them.
			if (isFragment && context === 'main') continue;
			issues.push(
				makeIssue(
					node.line,
					'error',
					'wrong-context',
					'wrong-context',
					{ directive: node.name, context, allowed: allowed.join(', ') },
					`"${node.name}" is not valid inside the "${context}" block — valid in: ${allowed.join(', ')}.`,
				),
			);
		}
		if (!KNOWN_DIRECTIVES.has(node.name) && !THIRD_PARTY_PREFIX.test(node.name) && node.name !== '(anonymous)') {
			const suggestion = suggestDirective(node.name);
			issues.push(
				makeIssue(
					node.line,
					'warning',
					'unknown-directive',
					suggestion ? 'unknown-directive-suggest' : 'unknown-directive',
					suggestion ? { directive: node.name, suggestion } : { directive: node.name },
					suggestion
						? `Unknown directive "${node.name}" — did you mean "${suggestion}"? (A third-party module may define it.)`
						: `Unknown directive "${node.name}" — not a standard nginx directive (a third-party module may define it).`,
				),
			);
		}
	}

	return { root, issues, isFragment };
}

const WEAK_SSL_PROTOCOLS = new Set(['sslv2', 'sslv3', 'tlsv1', 'tlsv1.1']);

// Security/best-practice checks, inspired by (but a small subset of) Gixy's
// rule set — see https://github.com/yandex/gixy for the full reference this
// only partially mirrors. Walks the already-built tree rather than raw text,
// so each check only fires in the right structural context.
function runSecurityChecks(root: NginxNode, issues: NginxIssue[], isFragment: boolean) {
	let hasServerTokensOff = false;
	let hasHttpBlock = false;

	const walk = (node: NginxNode) => {
		if (node.type === 'block' && node.name === 'http') hasHttpBlock = true;
		if (node.type === 'directive') {
			if (
				(node.name === 'return' || node.name === 'rewrite' || node.name === 'add_header') &&
				node.args.some((arg) => /\$uri\b/.test(arg) && !/\$request_uri\b/.test(arg))
			) {
				issues.push(
					makeIssue(
						node.line,
						'warning',
						'crlf-injection-risk',
						'crlf-injection-risk',
						{ directive: node.name },
						`"${node.name}" uses "$uri" (URL-decoded) — an attacker-controlled decoded value here can inject characters into the response. Prefer "$request_uri" (raw, unaltered) for redirects/headers unless you specifically need the decoded form.`,
					),
				);
			}
			if (node.name === 'server_tokens' && node.args[0] === 'off') hasServerTokensOff = true;
			if (node.name === 'autoindex' && node.args[0] === 'on') {
				issues.push(
					makeIssue(
						node.line,
						'warning',
						'autoindex-enabled',
						'autoindex-enabled',
						{},
						'"autoindex on;" lists directory contents to any visitor when no index file exists — confirm this is intentional.',
					),
				);
			}
			if (node.name === 'ssl_protocols') {
				for (const arg of node.args) {
					if (WEAK_SSL_PROTOCOLS.has(arg.toLowerCase())) {
						issues.push(
							makeIssue(
								node.line,
								'warning',
								'weak-ssl-protocol',
								'weak-ssl-protocol',
								{ protocol: arg },
								`"ssl_protocols" enables the obsolete protocol ${arg} — it has known attacks; allow only TLSv1.2 and TLSv1.3.`,
							),
						);
					}
				}
			}
		}
		for (const child of node.children ?? []) walk(child);
	};
	walk(root);

	// A fragment cannot know whether the including file sets server_tokens off.
	if (!hasServerTokensOff && (!isFragment || hasHttpBlock)) {
		issues.push(
			makeIssue(
				1,
				'warning',
				'server-tokens-exposed',
				'server-tokens-exposed',
				{},
				'No "server_tokens off;" found anywhere — nginx will expose its exact version number in the Server response header and default error pages, which helps an attacker target known CVEs for that version.',
			),
		);
	}
}

export function parseNginxConfig(input: string, options: NginxParseOptions = {}): NginxParseResult {
	const { tokens, issues: tokenIssues } = tokenize(input);
	const { root, issues, isFragment } = buildTree(tokens, options.fragment ?? 'auto');
	issues.push(...tokenIssues);
	if (input.trim() !== '') {
		runSecurityChecks(root, issues, isFragment);
		issues.push(...runExtendedChecks(root, isFragment));
	}
	issues.sort((a, b) => a.line - b.line);
	const lastTokenEnd = tokens.length > 0 ? tokens[tokens.length - 1].end : 0;
	return { issues, root, lastTokenEnd, isFragment };
}

// --- Regex tester (for `location ~ pattern` / `location ~* pattern`) ---
// nginx's regex location matching is PCRE (via the bundled PCRE library),
// not JS RegExp — the two are close but not identical. This tester
// intentionally uses JS RegExp for a same-origin, dependency-free
// implementation and surfaces that caveat in the UI. A catastrophic-backtracking
// pattern would freeze the tab, so the UI runs these functions inside a Web
// Worker with a timeout (see nginxRegexWorker.ts).
export interface RegexTestResult {
	matched: boolean;
	error: string | null;
	groups: string[];
	/** Named capture groups, if any. */
	named: Record<string, string>;
}

// PCRE's leading inline flag group `(?i)` is not valid JS: translate it to the `i` flag.
function compilePcreLike(pattern: string, caseInsensitive: boolean): RegExp {
	let source = pattern;
	let flags = caseInsensitive ? 'i' : '';
	const inline = /^\(\?([imsx]+)\)/.exec(source);
	if (inline) {
		source = source.slice(inline[0].length);
		for (const f of inline[1]) if ('ims'.includes(f) && !flags.includes(f)) flags += f;
	}
	return new RegExp(source, flags);
}

export function testNginxLocationRegex(pattern: string, caseInsensitive: boolean, testUrl: string): RegexTestResult {
	try {
		const re = compilePcreLike(pattern, caseInsensitive);
		const match = re.exec(testUrl);
		return {
			matched: match !== null,
			error: null,
			groups: match ? Array.from(match, (g) => g ?? '') : [],
			named: match?.groups ? Object.fromEntries(Object.entries(match.groups).map(([k, v]) => [k, v ?? ''])) : {},
		};
	} catch (err) {
		return { matched: false, error: (err as Error).message, groups: [], named: {} };
	}
}

// --- rewrite/return simulator ---
// Supports the common `rewrite <regex> <replacement> [flag];` form. Like nginx, a matching
// rewrite replaces the WHOLE URI with the expanded replacement (not just the matched part),
// `$1..$9` and `$name` expand to captures, `$&` is NOT special (it is just text), unknown
// `$variables` are left as-is, and the original query string is appended unless the
// replacement carries its own `?args`. Multi-pass rewrite loops and flags are out of scope.
export interface RewriteSimulationResult {
	outputUrl: string | null;
	error: string | null;
	/** True when the pattern simply did not match (not a syntax error). */
	noMatch: boolean;
	/** Captured groups: index 0 is the whole match, then $1, $2, ... */
	captures: string[];
}

export function expandRewriteReplacement(replacement: string, match: RegExpExecArray): string {
	return replacement.replace(/\$(?:\{([A-Za-z_]\w*)\}|(\d{1,2})|([A-Za-z_]\w*))/g, (whole, braced, digits, bare) => {
		if (digits !== undefined) {
			const index = Number(digits);
			return index < match.length ? (match[index] ?? '') : '';
		}
		const name = braced ?? bare;
		if (match.groups && Object.prototype.hasOwnProperty.call(match.groups, name)) return match.groups[name] ?? '';
		return whole; // an nginx variable such as $host — not resolvable here
	});
}

export function simulateRewrite(pattern: string, replacement: string, testUrl: string): RewriteSimulationResult {
	try {
		const re = compilePcreLike(pattern, false);
		const queryIndex = testUrl.indexOf('?');
		const path = queryIndex === -1 ? testUrl : testUrl.slice(0, queryIndex);
		const args = queryIndex === -1 ? '' : testUrl.slice(queryIndex + 1);
		const match = re.exec(path);
		if (!match) {
			return {
				outputUrl: null,
				error: 'Pattern does not match the test URL — rewrite would not apply.',
				noMatch: true,
				captures: [],
			};
		}
		let output = expandRewriteReplacement(replacement, match);
		if (args !== '' && !output.includes('?')) output += `?${args}`;
		else if (output.endsWith('?')) output = output.slice(0, -1);
		return { outputUrl: output, error: null, noMatch: false, captures: Array.from(match, (g) => g ?? '') };
	} catch (err) {
		return { outputUrl: null, error: (err as Error).message, noMatch: false, captures: [] };
	}
}

// --- simple auto-fix for the two most common trivial mistakes ---
// Only handles what's safe to guess mechanically: inserting a missing ";" right after the
// last token at end-of-input (BEFORE any trailing comment — a ";" appended after "# note"
// would end up inside the comment), and appending a "}" for each still-open block.
// Anything structurally ambiguous is left for the user to fix by hand.
export function autoFixTrivialIssues(input: string, result: NginxParseResult): string {
	let fixed = input.trimEnd();
	const missingSemicolonAtEof = result.issues.some((issue) => issue.key === 'missing-semicolon-eof');
	if (missingSemicolonAtEof && result.lastTokenEnd > 0 && result.lastTokenEnd <= fixed.length) {
		fixed = `${fixed.slice(0, result.lastTokenEnd)};${fixed.slice(result.lastTokenEnd)}`;
	}
	const unclosedCount = result.issues.filter((issue) => issue.key === 'unclosed-block').length;
	for (let i = 0; i < unclosedCount; i++) fixed += '\n}';
	return fixed;
}
