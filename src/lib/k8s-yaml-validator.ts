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
//  - `ajv`: the standard JSON Schema validator; Kubernetes's own schemas are
//    OpenAPI-derived JSON Schema, so this is the natural fit.
// Both run as devDependency-free runtime deps (bundled into the client, same
// as every other per-tool library already in this repo — svgo, pdf-lib, etc).
import Ajv, { type ErrorObject } from 'ajv';
import { LineCounter, parseAllDocuments, type Document } from 'yaml';

export type Severity = 'error' | 'warning';

export interface K8sIssue {
	severity: Severity;
	ruleId: string;
	message: string;
	line: number | null;
}

export interface K8sDocumentResult {
	documentIndex: number;
	kind: string | null;
	apiVersion: string | null;
	issues: K8sIssue[];
	// Present only when this document's `kind`+`apiVersion` has a known
	// deprecated -> replacement mapping (see `DEPRECATED_API_VERSIONS`).
	suggestedApiVersion: string | null;
}

export interface K8sValidationResult {
	documents: K8sDocumentResult[];
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

function formatAjvError(error: ErrorObject): string {
	const path = error.instancePath || '(root)';
	return `${path}: ${error.message ?? 'is invalid'}`;
}

// Session-lifetime cache — the same Kubernetes version's schema for a given
// kind never changes while the tab is open, so there's no reason to refetch
// it every time the user tweaks their YAML. Cleared on page reload only.
const schemaCache = new Map<string, Promise<Record<string, unknown> | null>>();

function schemaUrl(kind: string, version: string): string | null {
	const filename = SCHEMA_FILENAME_BY_KIND[kind];
	if (!filename) return null;
	return `https://cdn.jsdelivr.net/gh/yannh/kubernetes-json-schema@master/${version}-standalone/${filename}`;
}

async function fetchSchema(kind: string, version: string): Promise<Record<string, unknown> | null> {
	const cacheKey = `${version}:${kind}`;
	const cached = schemaCache.get(cacheKey);
	if (cached) return cached;
	const url = schemaUrl(kind, version);
	if (!url) return null;
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
	return promise;
}

// `strict: false` + `logger: false`: Kubernetes's OpenAPI-derived schemas use
// vendor extension keywords ajv doesn't know (`x-kubernetes-*`) and formats
// ajv doesn't ship (`int-or-string`, `int32`, `int64`, `date-time` is known
// but the int/int32/int64 family isn't) — strict mode would throw on the
// former, and without `logger: false` ajv prints a console warning for every
// single unknown format field in every schema (checked against the real
// Deployment schema: dozens of fields). Neither indicates an actual problem
// with the user's YAML.
const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
const compiledValidators = new Map<string, ReturnType<Ajv['compile']>>();

function getValidator(kind: string, schema: Record<string, unknown>) {
	const cacheKey = `${kind}:${schema.$id ?? ''}:${JSON.stringify(schema).length}`;
	let validator = compiledValidators.get(cacheKey);
	if (!validator) {
		validator = ajv.compile(schema);
		compiledValidators.set(cacheKey, validator);
	}
	return validator;
}

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

export async function validateK8sManifests(input: string, k8sVersion: string): Promise<K8sValidationResult> {
	const { documents } = parseK8sManifests(input);
	const results: K8sDocumentResult[] = [];

	for (let i = 0; i < documents.length; i++) {
		const { doc, lineCounter } = documents[i];
		const issues: K8sIssue[] = [];

		for (const err of doc.errors) {
			issues.push({
				severity: 'error',
				ruleId: 'yaml-syntax',
				message: err.message.split('\n')[0],
				line: err.linePos ? err.linePos[0].line : null,
			});
		}
		for (const warn of doc.warnings) {
			issues.push({
				severity: 'warning',
				ruleId: 'yaml-warning',
				message: warn.message.split('\n')[0],
				line: warn.linePos ? warn.linePos[0].line : null,
			});
		}

		const kind = typeof doc.get('kind') === 'string' ? (doc.get('kind') as string) : null;
		const apiVersion = typeof doc.get('apiVersion') === 'string' ? (doc.get('apiVersion') as string) : null;
		const suggestedApiVersion = checkDeprecatedApiVersion(kind, apiVersion);

		if (suggestedApiVersion) {
			issues.push({
				severity: 'warning',
				ruleId: 'deprecated-api-version',
				message: `"${apiVersion}" is deprecated for kind "${kind}" — use "${suggestedApiVersion}" instead.`,
				line: lineForInstancePath(doc, lineCounter, '/apiVersion'),
			});
		}

		if (doc.errors.length === 0 && kind) {
			if (!SUPPORTED_KINDS.includes(kind)) {
				issues.push({
					severity: 'warning',
					ruleId: 'unsupported-kind',
					message: `"${kind}" is not one of the resource kinds this tool validates against a schema yet (${SUPPORTED_KINDS.join(', ')}). Syntax and deprecated-apiVersion checks above still apply.`,
					line: lineForInstancePath(doc, lineCounter, '/kind'),
				});
			} else {
				const schema = await fetchSchema(kind, k8sVersion);
				if (!schema) {
					issues.push({
						severity: 'warning',
						ruleId: 'schema-unavailable',
						message: `Could not load the ${kind} schema for Kubernetes ${k8sVersion} (network error or unavailable version) — schema validation skipped for this document.`,
						line: null,
					});
				} else {
					const validate = getValidator(kind, schema);
					const value = doc.toJS();
					const valid = validate(value);
					if (!valid) {
						for (const err of validate.errors ?? []) {
							issues.push({
								severity: 'error',
								ruleId: 'schema-validation',
								message: formatAjvError(err),
								line: lineForInstancePath(doc, lineCounter, err.instancePath),
							});
						}
					}
				}
			}
		}

		issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
		results.push({ documentIndex: i, kind, apiVersion, issues, suggestedApiVersion });
	}

	return { documents: results };
}

// Auto-fix: rewrite every document's apiVersion in place to the suggested
// replacement, using each node's exact character range so nothing else in
// the document is touched. Applied back-to-front so earlier offsets stay
// valid as later ones are replaced.
export function autoFixDeprecatedApiVersions(input: string): string {
	const { documents } = parseK8sManifests(input);
	const replacements: { start: number; end: number; value: string }[] = [];

	for (const { doc } of documents) {
		const kind = typeof doc.get('kind') === 'string' ? (doc.get('kind') as string) : null;
		const apiVersion = typeof doc.get('apiVersion') === 'string' ? (doc.get('apiVersion') as string) : null;
		const suggested = checkDeprecatedApiVersion(kind, apiVersion);
		if (!suggested) continue;
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
