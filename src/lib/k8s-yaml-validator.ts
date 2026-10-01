// Kubernetes manifest validation: parse YAML (keeping source positions so
// every error can point at a real line), detect deprecated apiVersions, and
// validate against the real Kubernetes OpenAPI-derived JSON Schemas.
//
// Unlike the nginx parser, this one leans on two small, well-established
// libraries rather than hand-rolling everything:
//  - `yaml` (not `js-yaml`): its `parseAllDocuments` + `LineCounter` give a
//    real AST with a `.range` per node, which is what makes "point at the
//    exact line for `spec.replicas`" possible for SCHEMA errors too, not just
//    syntax errors. js-yaml only gives good positions for syntax errors.
//  - `json-schema-validate`: our CSP-safe interpretive JSON Schema validator (no ajv); Kubernetes's own schemas are
//    OpenAPI-derived JSON Schema, so this is the natural fit.
// Both run as devDependency-free runtime deps (bundled into the client, same
// as every other per-tool library already in this repo — svgo, pdf-lib, etc).
import { validateJsonSchema, type SchemaError } from './json-schema-validate';
import { LineCounter, isMap, isScalar, parseAllDocuments, type Document } from 'yaml';
import { crossCheckManifests, type CrossCheckInput } from './k8s-crosscheck';
import { evaluateWorkloadSecurity, type SecurityFinding, type SecurityReport } from './k8s-security';

export type { SecurityFinding, SecurityReport } from './k8s-security';

export type Severity = 'error' | 'warning';

export interface K8sIssue {
	severity: Severity;
	ruleId: string;
	/** English fallback text. */
	message: string;
	/** i18n key suffix for this message variant (see K8S_ISSUE_KEYS). */
	key: string;
	/** Values for the `{{placeholders}}` of the i18n message. */
	params: Record<string, string | number>;
	line: number | null;
}

/** Every `key` an issue can carry — the page builds one i18n message per entry. */
export const K8S_ISSUE_KEYS = [
	'yaml-syntax',
	'yaml-warning',
	'yaml-alias-limit',
	'duplicate-key',
	'empty-document',
	'empty-document-trailing',
	'not-a-mapping',
	'missing-kind',
	'missing-api-version',
	'deprecated-api-version',
	'deprecated-ingress-backend',
	'unsupported-kind',
	'crd-validated',
	'xref-duplicate-name',
	'xref-selector-template-mismatch',
	'xref-service-no-match',
	'xref-service-port-missing',
	'schema-unavailable',
	'schema-engine-error',
	'schema-type',
	'schema-required',
	'schema-additional',
	'schema-enum',
	'schema-generic',
] as const;

function makeIssue(
	severity: Severity,
	ruleId: string,
	key: string,
	params: Record<string, string | number>,
	message: string,
	line: number | null,
): K8sIssue {
	return { severity, ruleId, key, params, message, line };
}

export interface K8sDocumentResult {
	documentIndex: number;
	kind: string | null;
	apiVersion: string | null;
	issues: K8sIssue[];
	// Present only when this document's `kind`+`apiVersion` has a known
	// deprecated -> replacement mapping (see `DEPRECATED_API_VERSIONS`).
	suggestedApiVersion: string | null;
	/** Kubesec-style score for workloads (Pod/Deployment/...); null for other kinds or when disabled. */
	security: SecurityReport | null;
	/** How the schema was resolved: bundled Kubernetes schema, CRD catalog, or none. */
	schemaSource: 'kubernetes' | 'crd' | 'none';
}

export interface K8sValidationResult {
	documents: K8sDocumentResult[];
}

export interface ValidateOptions {
	/** Look up kinds without a built-in schema in the Datree CRD catalog (default true). */
	crdCatalog?: boolean;
	/** Do not warn about kinds that have no schema at all (default false). */
	skipUnknownKinds?: boolean;
	/** Run the security / best-practice scorer on workloads (default true). */
	security?: boolean;
	/** Run cross-resource checks (Service selector, duplicate names...) (default true). */
	crossCheck?: boolean;
}

// Schema filename suffix (after the lowercased kind) in yannh/kubernetes-json-schema's
// "-standalone" directories, e.g. kind "Deployment" -> "deployment-apps-v1.json".
// Verified against the live CDN mirror for v1.28.0 and v1.31.0 before writing
// this — see PROGRESS.md 2026-08-09 for the exact URLs checked. Core-group
// kinds (Service/ConfigMap/Secret/PersistentVolumeClaim) have no group
// segment, just "-v1".
const SCHEMA_FILENAME_BY_KIND: Record<string, string> = {
	Deployment: 'deployment-apps-v1.json',
	Service: 'service-v1.json',
	Ingress: 'ingress-networking-v1.json',
	ConfigMap: 'configmap-v1.json',
	Secret: 'secret-v1.json',
	StatefulSet: 'statefulset-apps-v1.json',
	DaemonSet: 'daemonset-apps-v1.json',
	Job: 'job-batch-v1.json',
	CronJob: 'cronjob-batch-v1.json',
	PersistentVolumeClaim: 'persistentvolumeclaim-v1.json',
};

export const SUPPORTED_KINDS = Object.keys(SCHEMA_FILENAME_BY_KIND);

// Common released Kubernetes minor versions with schemas available in the
// yannh/kubernetes-json-schema CDN mirror, newest first. "master" tracks the
// repo's rolling latest (whatever the current dev branch's OpenAPI spec is).
export const K8S_VERSION_OPTIONS = [
	'master',
	'v1.31.0',
	'v1.30.0',
	'v1.29.0',
	'v1.28.0',
	'v1.27.0',
	'v1.26.0',
];
export const DEFAULT_K8S_VERSION = 'v1.31.0';

// Well-known apiVersion deprecations for the resource kinds this tool
// supports — not exhaustive of every Kubernetes deprecation ever, just the
// ones relevant to `SUPPORTED_KINDS`.
const DEPRECATED_API_VERSIONS: Record<string, Record<string, string>> = {
	Deployment: {
		'extensions/v1beta1': 'apps/v1',
		'apps/v1beta1': 'apps/v1',
		'apps/v1beta2': 'apps/v1',
	},
	DaemonSet: {
		'extensions/v1beta1': 'apps/v1',
		'apps/v1beta2': 'apps/v1',
	},
	StatefulSet: {
		'apps/v1beta1': 'apps/v1',
		'apps/v1beta2': 'apps/v1',
	},
	Ingress: {
		'extensions/v1beta1': 'networking.k8s.io/v1',
		'networking.k8s.io/v1beta1': 'networking.k8s.io/v1',
	},
	CronJob: {
		'batch/v1beta1': 'batch/v1',
		'batch/v2alpha1': 'batch/v1',
	},
};

function checkDeprecatedApiVersion(kind: string | null, apiVersion: string | null): string | null {
	if (!kind || !apiVersion) return null;
	return DEPRECATED_API_VERSIONS[kind]?.[apiVersion] ?? null;
}

// One JSON-pointer-shaped path segment per `instancePath` component ("/spec/replicas"
// -> ["spec", "replicas"]), converting numeric segments to numbers so `Document#getIn`
// can walk into array indices too.
function instancePathToSegments(instancePath: string): (string | number)[] {
	if (!instancePath) return [];
	return instancePath
		.split('/')
		.filter((s) => s !== '')
		.map((s) => (/^\d+$/.test(s) ? Number(s) : s.replace(/~1/g, '/').replace(/~0/g, '~')));
}

function lineForInstancePath(doc: Document, lineCounter: LineCounter, instancePath: string): number | null {
	const segments = instancePathToSegments(instancePath);
	try {
		const node = segments.length === 0 ? doc.contents : doc.getIn(segments, true);
		const range = (node as { range?: [number, number, number] } | null)?.range;
		if (!range) return doc.contents && 'range' in doc.contents ? lineCounter.linePos((doc.contents as { range: [number, number, number] }).range[0]).line : null;
		return lineCounter.linePos(range[0]).line;
	} catch {
		return null;
	}
}

function escapePointerSegment(segment: string): string {
	return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

// Maps an ajv error to a translatable issue: the field path, and — crucially — the NAME of the
// offending field for "additional properties" / "required" errors, which ajv only exposes in
// `params`, not in `message`.
function schemaIssueFromError(schemaError: SchemaError, doc: Document, lineCounter: LineCounter): K8sIssue {
	// Our interpretive validator reports '/' for the document root; ajv-style instancePath is ''.
	let instancePath = schemaError.path === '/' ? '' : schemaError.path;
	// For unknown fields our validator reports the offending child; ajv-style paths name the parent.
	if (schemaError.keyword === 'additionalProperties') instancePath = instancePath.slice(0, instancePath.lastIndexOf('/'));
	const error = { ...schemaError, instancePath };
	const path = error.instancePath || '(root)';
	const params = (error.params ?? {}) as Record<string, unknown>;
	switch (error.keyword) {
		case 'additionalProperties': {
			const field = String(params.additionalProperty ?? '');
			return makeIssue(
				'error',
				'schema-validation',
				'schema-additional',
				{ path, field },
				`${path}: unknown field "${field}" (must NOT have additional properties)`,
				lineForInstancePath(doc, lineCounter, `${error.instancePath}/${escapePointerSegment(field)}`) ??
					lineForInstancePath(doc, lineCounter, error.instancePath),
			);
		}
		case 'required': {
			const field = String(params.missingProperty ?? '');
			return makeIssue(
				'error',
				'schema-validation',
				'schema-required',
				{ path, field },
				`${path}: must have required property "${field}"`,
				lineForInstancePath(doc, lineCounter, error.instancePath),
			);
		}
		case 'type': {
			const expected = Array.isArray(params.type) ? params.type.join(' | ') : String(params.type ?? '');
			return makeIssue('error', 'schema-validation', 'schema-type', { path, expected }, `${path}: must be ${expected}`, lineForInstancePath(doc, lineCounter, error.instancePath));
		}
		case 'enum': {
			const allowed = Array.isArray(params.allowedValues) ? params.allowedValues.join(', ') : '';
			return makeIssue('error', 'schema-validation', 'schema-enum', { path, allowed }, `${path}: must be one of: ${allowed}`, lineForInstancePath(doc, lineCounter, error.instancePath));
		}
		default: {
			const detail = error.message || 'is invalid';
			return makeIssue('error', 'schema-validation', 'schema-generic', { path, detail }, `${path}: ${detail}`, lineForInstancePath(doc, lineCounter, error.instancePath));
		}
	}
}

// Session-lifetime cache of schemas that were fetched SUCCESSFULLY. A failed fetch (network
// error, 404, bad JSON) is never cached — the entry is removed so the next validation (or the
// UI's Retry button) tries the network again instead of showing "unavailable" until reload.
const schemaCache = new Map<string, Promise<Record<string, unknown> | null>>();

// The yannh mirror publishes no release tags — only the rolling `master` branch — so the URL is
// pinned to a commit SHA that was verified to serve every file listed in SCHEMA_FILENAME_BY_KIND for
// every entry of K8S_VERSION_OPTIONS through jsDelivr (checked 2026-10-01). Bump deliberately.
export const K8S_SCHEMA_REPO_REF = '8df8a883b68a24a104b4a9e43c1288090ae60b3b';
// Datree CRD catalog (`group/kind_version.json`). Same idea: pinned to a verified commit.
export const CRD_CATALOG_REPO_REF = 'd373c2da9702bc9509a004db83e57263fe3bdfc1';

function schemaUrl(kind: string, version: string): string | null {
	const filename = SCHEMA_FILENAME_BY_KIND[kind];
	if (!filename) return null;
	return `https://cdn.jsdelivr.net/gh/yannh/kubernetes-json-schema@${K8S_SCHEMA_REPO_REF}/${version}-standalone/${filename}`;
}

// Groups served by Kubernetes itself: never looked up in the CRD catalog.
const BUILTIN_GROUPS = new Set([
	'apps',
	'batch',
	'autoscaling',
	'policy',
	'extensions',
	'storage.k8s.io',
	'networking.k8s.io',
	'rbac.authorization.k8s.io',
	'admissionregistration.k8s.io',
	'apiextensions.k8s.io',
	'apiregistration.k8s.io',
	'authentication.k8s.io',
	'authorization.k8s.io',
	'certificates.k8s.io',
	'coordination.k8s.io',
	'discovery.k8s.io',
	'events.k8s.io',
	'flowcontrol.apiserver.k8s.io',
	'node.k8s.io',
	'scheduling.k8s.io',
	'resource.k8s.io',
]);

/** Catalog URL for a custom resource, or null when it cannot be one. Only group/kind/version are used. */
export function crdSchemaUrl(kind: string, apiVersion: string): string | null {
	const slash = apiVersion.indexOf('/');
	if (slash <= 0) return null;
	const group = apiVersion.slice(0, slash);
	const version = apiVersion.slice(slash + 1);
	if (BUILTIN_GROUPS.has(group) || !group.includes('.')) return null;
	if (!/^[a-z0-9.-]+$/.test(group) || !/^[A-Za-z0-9]+$/.test(kind) || !/^[A-Za-z0-9.-]+$/.test(version)) return null;
	return `https://cdn.jsdelivr.net/gh/datreeio/CRDs-catalog@${CRD_CATALOG_REPO_REF}/${group}/${kind.toLowerCase()}_${version}.json`;
}

export function clearSchemaCache() {
	schemaCache.clear();
}

async function fetchJsonCached(cacheKey: string, url: string): Promise<Record<string, unknown> | null> {
	const cached = schemaCache.get(cacheKey);
	if (cached) return cached;
	const promise = (async () => {
		try {
			const res = await fetch(url);
			if (!res.ok) return null;
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return null;
		}
	})();
	schemaCache.set(cacheKey, promise);
	void promise.then((schema) => {
		if (schema === null && schemaCache.get(cacheKey) === promise) schemaCache.delete(cacheKey);
	});
	return promise;
}

async function fetchSchema(kind: string, version: string): Promise<Record<string, unknown> | null> {
	const url = schemaUrl(kind, version);
	if (!url) return null;
	return fetchJsonCached(`${version}:${kind}`, url);
}

async function fetchCrdSchema(kind: string, apiVersion: string): Promise<Record<string, unknown> | null> {
	const url = crdSchemaUrl(kind, apiVersion);
	if (!url) return null;
	const schema = await fetchJsonCached(`crd:${apiVersion}:${kind}`, url);
	if (!schema) return null;
	// Catalog files may declare a $schema draft we do not need; drop it.
	const { $schema: _ignored, ...rest } = schema;
	return rest;
}

// Validation uses our own interpretive JSON Schema validator (draft-07 vocabulary) instead of ajv:
// ajv compiles schemas with `new Function`, which the site's Content-Security-Policy (`script-src`
// without 'unsafe-eval') blocks in production. Kubernetes's vendor keywords (`x-kubernetes-*`) and
// formats it does not know (`int-or-string`, `int32`, `int64`) are simply ignored.

export function parseK8sManifests(input: string): {
	documents: { doc: Document; lineCounter: LineCounter }[];
	globalIssues: K8sIssue[];
} {
	const globalIssues: K8sIssue[] = [];
	if (input.trim() === '') return { documents: [], globalIssues };

	const lineCounter = new LineCounter();
	const rawDocs = parseAllDocuments(input, { lineCounter });
	const documents = rawDocs.map((doc) => ({ doc, lineCounter }));
	return { documents, globalIssues };
}

function stringField(doc: Document, name: string): string | null {
	const value = doc.get(name);
	return typeof value === 'string' && value.trim() !== '' ? value : null;
}

// Line of the deepest EXISTING node along `segments` (a finding about a missing field points at its parent).
function lineForSegments(doc: Document, lineCounter: LineCounter, segments: (string | number)[]): number | null {
	for (let n = segments.length; n >= 0; n--) {
		try {
			const node = n === 0 ? doc.contents : doc.getIn(segments.slice(0, n), true);
			const range = (node as { range?: [number, number, number] } | null)?.range;
			if (range) return lineCounter.linePos(range[0]).line;
		} catch {
			// try the parent
		}
	}
	return null;
}

export async function validateK8sManifests(
	input: string,
	k8sVersion: string,
	options: ValidateOptions = {},
): Promise<K8sValidationResult> {
	const { crdCatalog = true, skipUnknownKinds = false, security: runSecurity = true, crossCheck = true } = options;
	const { documents } = parseK8sManifests(input);
	const results: K8sDocumentResult[] = [];
	const crossInputs: CrossCheckInput[] = [];
	const docRefs: { doc: Document; lineCounter: LineCounter }[] = [];

	// Comment-only input parses to zero documents — still tell the user there is nothing to validate.
	if (documents.length === 0 && input.trim() !== '') {
		return {
			documents: [
				{
					documentIndex: 0,
					kind: null,
					apiVersion: null,
					suggestedApiVersion: null,
						security: null,
						schemaSource: 'none',
						issues: [makeIssue('error', 'empty-document', 'empty-document', {}, 'This document is empty — a manifest needs at least apiVersion and kind.', null)],
				},
			],
		};
	}

	for (let i = 0; i < documents.length; i++) {
		const { doc, lineCounter } = documents[i];
		const issues: K8sIssue[] = [];

		for (const err of doc.errors) {
			const message = err.message.split('\n')[0];
			const line = err.linePos ? err.linePos[0].line : null;
				if (err.code === 'DUPLICATE_KEY') issues.push(makeIssue('error', 'duplicate-key', 'duplicate-key', { message }, message, line));
				else issues.push(makeIssue('error', 'yaml-syntax', 'yaml-syntax', { message }, message, line));
		}
		for (const warn of doc.warnings) {
			const message = warn.message.split('\n')[0];
			issues.push(makeIssue('warning', 'yaml-warning', 'yaml-warning', { message }, message, warn.linePos ? warn.linePos[0].line : null));
		}

		let kind: string | null = null;
		let apiVersion: string | null = null;
		let validShape = false;

		if (doc.errors.length === 0) {
			const contents = doc.contents;
			const isEmpty = contents === null || (isScalar(contents) && (contents.value === null || contents.value === ''));
			if (isEmpty) {
				// A trailing "---" after the last manifest produces one harmless empty document.
				const trailing = i === documents.length - 1 && documents.length > 1;
				issues.push(
					makeIssue(
						trailing ? 'warning' : 'error',
						'empty-document',
						trailing ? 'empty-document-trailing' : 'empty-document',
						{},
						trailing ? 'Empty document after the last "---".' : 'This document is empty — a manifest needs at least apiVersion and kind.',
						null,
					),
				);
			} else if (!isMap(contents)) {
				issues.push(
					makeIssue(
						'error',
						'not-a-mapping',
						'not-a-mapping',
						{},
						'A Kubernetes manifest must be a YAML mapping (key: value pairs) at the top level, not a list or a plain value.',
						lineForInstancePath(doc, lineCounter, ''),
					),
				);
			} else {
				validShape = true;
				kind = stringField(doc, 'kind');
				apiVersion = stringField(doc, 'apiVersion');
				if (!kind) {
					issues.push(makeIssue('error', 'missing-kind', 'missing-kind', {}, 'Missing required field "kind".', lineForInstancePath(doc, lineCounter, '')));
				}
				if (!apiVersion) {
					issues.push(
						makeIssue('error', 'missing-api-version', 'missing-api-version', {}, 'Missing required field "apiVersion".', lineForInstancePath(doc, lineCounter, '')),
					);
				}
			}
		}

		const suggestedApiVersion = checkDeprecatedApiVersion(kind, apiVersion);

		if (suggestedApiVersion) {
			issues.push(
				makeIssue(
					'warning',
					'deprecated-api-version',
					'deprecated-api-version',
					{ apiVersion: apiVersion ?? '', kind: kind ?? '', suggested: suggestedApiVersion },
					`"${apiVersion}" is deprecated for kind "${kind}" — use "${suggestedApiVersion}" instead.`,
					lineForInstancePath(doc, lineCounter, '/apiVersion'),
				),
			);
			if (kind === 'Ingress') {
				issues.push(
					makeIssue(
						'warning',
						'deprecated-api-version',
						'deprecated-ingress-backend',
						{},
						'Changing only apiVersion is not enough for Ingress: networking.k8s.io/v1 also needs spec.rules[].http.paths[].pathType and backend.service.name/port (instead of serviceName/servicePort).',
						lineForInstancePath(doc, lineCounter, '/apiVersion'),
					),
				);
			}
		}

		let schemaSource: K8sDocumentResult['schemaSource'] = 'none';
		let security: SecurityReport | null = null;

		if (validShape && kind && doc.errors.length === 0) {
			// toJS() on an alias bomb ("billion laughs") raises "Excessive alias count"; it may not
			// reject the whole validation run.
			let value: unknown;
			let converted = false;
			try {
				value = doc.toJS();
				converted = true;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				issues.push(makeIssue('error', 'yaml-alias-limit', 'yaml-alias-limit', { message }, `YAML aliases expand too much to validate safely: ${message}`, null));
			}

			let schema: Record<string, unknown> | null = null;
			let schemaCacheKey = kind;
			const isBuiltin = SUPPORTED_KINDS.includes(kind);
			if (isBuiltin) {
				schema = await fetchSchema(kind, k8sVersion);
				schemaSource = schema ? 'kubernetes' : 'none';
			} else if (crdCatalog && apiVersion) {
				schema = await fetchCrdSchema(kind, apiVersion);
				if (schema) {
					schemaSource = 'crd';
					schemaCacheKey = `${apiVersion}/${kind}`;
				}
			}

			if (!schema && !isBuiltin) {
				if (!skipUnknownKinds) {
					issues.push(
						makeIssue(
							'warning',
							'unsupported-kind',
							'unsupported-kind',
							{ kind, supported: SUPPORTED_KINDS.join(', ') },
							`"${kind}" is not one of the resource kinds this tool validates against a schema yet (${SUPPORTED_KINDS.join(', ')}). Syntax and deprecated-apiVersion checks above still apply.`,
							lineForInstancePath(doc, lineCounter, '/kind'),
						),
					);
				}
			} else if (!schema) {
				issues.push(
					makeIssue(
						'warning',
						'schema-unavailable',
						'schema-unavailable',
						{ kind, version: k8sVersion },
						`Could not load the ${kind} schema for Kubernetes ${k8sVersion} (network error or unavailable version) - schema validation skipped for this document.`,
						null,
					),
				);
			} else if (converted) {
				if (schemaSource === 'crd') {
					issues.push(
						makeIssue('warning', 'crd-validated', 'crd-validated', { kind, apiVersion: apiVersion ?? '' }, `Validated "${kind}" against the community CRD catalog schema.`, lineForInstancePath(doc, lineCounter, '/kind')),
					);
				}
				try {
					for (const err of validateJsonSchema(value, schema)) issues.push(schemaIssueFromError(err, doc, lineCounter));
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					issues.push(makeIssue('error', 'schema-engine-error', 'schema-engine-error', { message }, `Schema validation could not run: ${message}`, null));
				}
			}

			if (converted) {
				crossInputs.push({ documentIndex: i, kind, value });
				if (runSecurity) {
					security = evaluateWorkloadSecurity(kind, value);
					if (security) {
						for (const finding of security.findings) finding.line = lineForSegments(doc, lineCounter, finding.path);
					}
				}
			}
		}
		docRefs[i] = { doc, lineCounter };

		issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
		results.push({ documentIndex: i, kind, apiVersion, issues, suggestedApiVersion, security, schemaSource });
	}

	if (crossCheck) {
		for (const x of crossCheckManifests(crossInputs)) {
			const ref = docRefs[x.documentIndex];
			const target = results[x.documentIndex];
			if (!ref || !target) continue;
			const message = `${x.key}: ${Object.values(x.params).join(' / ')}`;
			target.issues.push(makeIssue(x.severity, x.key, x.key, x.params, message, lineForSegments(ref.doc, ref.lineCounter, x.path)));
			target.issues.sort((p, q) => (p.line ?? 0) - (q.line ?? 0));
		}
	}

	return { documents: results };
}

// --- Ingress v1beta1 -> v1 conversion -------------------------------------------------
// networking.k8s.io/v1 renamed the backend fields and made pathType mandatory, so changing the
// apiVersion alone yields a manifest the API server rejects. This rewrites the YAML AST in
// place (comments elsewhere in the document are preserved).
function convertBackend(doc: Document, backend: unknown): unknown | null {
	if (!isMap(backend)) return null;
	const serviceName = backend.get('serviceName');
	const servicePort = backend.get('servicePort');
	if (typeof serviceName !== 'string') return null;
	const port: Record<string, unknown> = {};
	if (typeof servicePort === 'number') port.number = servicePort;
	else if (typeof servicePort === 'string') {
		if (/^\d+$/.test(servicePort)) port.number = Number(servicePort);
		else port.name = servicePort;
	}
	return doc.createNode({ service: { name: serviceName, port } });
}

function convertIngressToV1(doc: Document) {
	const rules = doc.getIn(['spec', 'rules']);
	const ruleItems = (rules as { items?: unknown[] } | null)?.items ?? [];
	ruleItems.forEach((_rule, ruleIndex) => {
		const paths = doc.getIn(['spec', 'rules', ruleIndex, 'http', 'paths']);
		const pathItems = (paths as { items?: unknown[] } | null)?.items ?? [];
		pathItems.forEach((_p, pathIndex) => {
			const base = ['spec', 'rules', ruleIndex, 'http', 'paths', pathIndex];
			const converted = convertBackend(doc, doc.getIn([...base, 'backend'], true));
			if (converted) doc.setIn([...base, 'backend'], converted);
			if (!doc.hasIn([...base, 'pathType'])) doc.setIn([...base, 'pathType'], 'ImplementationSpecific');
		});
	});
	const defaultBackend = convertBackend(doc, doc.getIn(['spec', 'backend'], true));
	if (defaultBackend) {
		doc.deleteIn(['spec', 'backend']);
		doc.setIn(['spec', 'defaultBackend'], defaultBackend);
	}
	doc.setIn(['apiVersion'], 'networking.k8s.io/v1');
}

// Auto-fix: rewrite every document's apiVersion in place to the suggested
// replacement, using each node's exact character range so nothing else in
// the document is touched. Ingress documents additionally get their backend
// format and pathType converted (see convertIngressToV1). Applied back-to-front
// so earlier offsets stay valid as later ones are replaced.
export function autoFixDeprecatedApiVersions(input: string): string {
	const { documents } = parseK8sManifests(input);
	const replacements: { start: number; end: number; value: string }[] = [];

	for (const { doc } of documents) {
		if (doc.errors.length > 0) continue;
		const kind = stringField(doc, 'kind');
		const apiVersion = stringField(doc, 'apiVersion');
		const suggested = checkDeprecatedApiVersion(kind, apiVersion);
		if (!suggested) continue;

		if (kind === 'Ingress') {
			const contentsRange = (doc.contents as { range?: [number, number, number] } | null)?.range;
			if (contentsRange) {
				const original = input.slice(contentsRange[0], contentsRange[1]);
				convertIngressToV1(doc);
				// Leading comments live on the document, outside the replaced range — drop them here
				// or they would be duplicated.
				doc.commentBefore = null;
				(doc.contents as { commentBefore?: string | null }).commentBefore = null;
				// ...and the comment block above the first key is attached to that key, not the map.
				const firstKey = (doc.contents as { items?: Array<{ key?: { commentBefore?: string | null } }> }).items?.[0]?.key;
				if (firstKey && typeof firstKey === 'object') firstKey.commentBefore = null;
				let text = doc.toString({ lineWidth: 0 });
				if (!original.endsWith('\n')) text = text.replace(/\n$/, '');
				replacements.push({ start: contentsRange[0], end: contentsRange[1], value: text });
				continue;
			}
		}

		const node = doc.get('apiVersion', true) as { range?: [number, number, number] } | undefined;
		if (!node?.range) continue;
		replacements.push({ start: node.range[0], end: node.range[1], value: suggested });
	}

	replacements.sort((a, b) => b.start - a.start);
	let output = input;
	for (const { start, end, value } of replacements) {
		output = output.slice(0, start) + value + output.slice(end);
	}
	return output;
}

// --- JSON report export ---------------------------------------------------------------
// Machine-readable report (for CI / sharing). Contains only what the tool computed - never the manifest text.
export function buildK8sJsonReport(result: K8sValidationResult, k8sVersion: string): Record<string, unknown> {
	const issueCount = (severity: Severity) =>
		result.documents.reduce((n, d) => n + d.issues.filter((i) => i.severity === severity).length, 0);
	return {
		tool: 'kubernetes-yaml-validator',
		kubernetesVersion: k8sVersion,
		summary: {
			documents: result.documents.length,
			errors: issueCount('error'),
			warnings: issueCount('warning'),
		},
		documents: result.documents.map((d) => ({
			index: d.documentIndex + 1,
			kind: d.kind,
			apiVersion: d.apiVersion,
			schemaSource: d.schemaSource,
			issues: d.issues.map((i) => ({ severity: i.severity, rule: i.ruleId, line: i.line, message: i.message, params: i.params })),
			security: d.security
				? {
						score: d.security.score,
						passed: d.security.passed,
						checked: d.security.checked,
						findings: d.security.findings.map((f) => ({
							id: f.id,
							severity: f.severity,
							penalty: f.penalty,
							line: f.line ?? null,
							params: f.params,
						})),
					}
				: null,
		})),
	};
}
