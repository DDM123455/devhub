import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	autoFixDeprecatedApiVersions,
	parseK8sManifests,
	validateK8sManifests,
} from '../k8s-yaml-validator';

// A deliberately tiny stand-in schema, NOT the real Kubernetes Deployment
// schema — real network access is neither necessary nor desirable for a fast,
// deterministic test suite. This only needs to be realistic enough to
// exercise the ajv + line-mapping code path (required apiVersion/kind,
// integer spec.replicas).
const FAKE_DEPLOYMENT_SCHEMA = {
	type: 'object',
	required: ['apiVersion', 'kind'],
	properties: {
		apiVersion: { type: 'string' },
		kind: { type: 'string' },
		metadata: { type: 'object' },
		spec: {
			type: 'object',
			properties: {
				replicas: { type: 'integer' },
			},
		},
	},
};

function mockFetchOk(schema: unknown) {
	return vi.fn(async () => ({ ok: true, json: async () => schema }) as unknown as Response);
}

// `validateK8sManifests` always attempts a schema fetch for any recognized
// kind, even in tests that only care about syntax or deprecated-apiVersion
// checks — and the module caches fetched schemas for the whole process
// lifetime (deliberately, see the comment on `schemaCache`). Real bug caught
// here while writing this suite: leaving even ONE test in this file hit the
// real network before the "mocked fetch" describe block's own `beforeEach`
// ran, that real schema got cached under the same key, and every later test
// silently validated against the REAL Kubernetes schema instead of the
// intentionally-tiny fake one — assertions failed on required fields (like
// `spec.selector`) that only the real schema demands. Mocking `fetch` at the
// top of the whole file (not scoped to one describe block) avoids that.
const originalFetch = global.fetch;
beforeEach(() => {
	global.fetch = mockFetchOk(FAKE_DEPLOYMENT_SCHEMA);
});
afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('parseK8sManifests', () => {
	it('parses a single valid document', () => {
		const { documents } = parseK8sManifests(`apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm1\n`);
		expect(documents).toHaveLength(1);
		expect(documents[0].doc.get('kind')).toBe('ConfigMap');
	});

	it('splits multiple documents separated by ---', () => {
		const { documents } = parseK8sManifests(
			`apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm1\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: dep1\n`,
		);
		expect(documents).toHaveLength(2);
		expect(documents[0].doc.get('kind')).toBe('ConfigMap');
		expect(documents[1].doc.get('kind')).toBe('Deployment');
	});

	it('returns no documents for empty input', () => {
		expect(parseK8sManifests('').documents).toHaveLength(0);
		expect(parseK8sManifests('   \n  ').documents).toHaveLength(0);
	});
});

describe('validateK8sManifests — YAML syntax errors', () => {
	it('reports a syntax error with a real line number', async () => {
		const badYaml = 'apiVersion: v1\nkind: ConfigMap\ndata:\n  key: value\n   bad: indent\n';
		const result = await validateK8sManifests(badYaml, 'v1.31.0');
		const syntaxIssue = result.documents[0].issues.find((i) => i.ruleId === 'yaml-syntax');
		expect(syntaxIssue).toBeDefined();
		expect(syntaxIssue?.line).toBeGreaterThan(0);
	});
});

describe('validateK8sManifests — deprecated apiVersion', () => {
	it('flags a known deprecated apiVersion and suggests the replacement', async () => {
		const yaml = 'apiVersion: extensions/v1beta1\nkind: Deployment\nmetadata:\n  name: d\n';
		const result = await validateK8sManifests(yaml, 'v1.31.0');
		const doc = result.documents[0];
		expect(doc.suggestedApiVersion).toBe('apps/v1');
		const issue = doc.issues.find((i) => i.ruleId === 'deprecated-api-version');
		expect(issue).toBeDefined();
		expect(issue?.message).toContain('apps/v1');
		expect(issue?.line).toBe(1);
	});

	it('does not flag an already-current apiVersion', async () => {
		const yaml = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d\n';
		const result = await validateK8sManifests(yaml, 'v1.31.0');
		expect(result.documents[0].suggestedApiVersion).toBeNull();
		expect(result.documents[0].issues.some((i) => i.ruleId === 'deprecated-api-version')).toBe(false);
	});
});

describe('validateK8sManifests — schema validation (mocked fetch)', () => {
	it('passes a valid document with no schema errors', async () => {
		const yaml = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d\nspec:\n  replicas: 3\n';
		const result = await validateK8sManifests(yaml, 'v1.31.0');
		expect(result.documents[0].issues.filter((i) => i.ruleId === 'schema-validation')).toHaveLength(0);
	});

	it('flags a wrong-type field with the exact line of that field', async () => {
		const yaml = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d\nspec:\n  replicas: "three"\n';
		const result = await validateK8sManifests(yaml, 'v1.31.0');
		const issue = result.documents[0].issues.find((i) => i.ruleId === 'schema-validation');
		expect(issue).toBeDefined();
		expect(issue?.message).toContain('/spec/replicas');
		expect(issue?.line).toBe(6);
	});

	it('warns instead of erroring for a kind with no bundled schema', async () => {
		const yaml = 'apiVersion: v1\nkind: SomeCustomResource\nmetadata:\n  name: x\n';
		const result = await validateK8sManifests(yaml, 'v1.31.0');
		expect(result.documents[0].issues.some((i) => i.ruleId === 'unsupported-kind')).toBe(true);
	});

	it('reports schema-unavailable when the fetch fails, instead of throwing', async () => {
		global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response);
		const yaml = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d\n';
		const result = await validateK8sManifests(yaml, 'v1.99.0');
		expect(result.documents[0].issues.some((i) => i.ruleId === 'schema-unavailable')).toBe(true);
	});
});

describe('autoFixDeprecatedApiVersions', () => {
	it('rewrites a deprecated apiVersion in place without touching the rest of the document', () => {
		const yaml = 'apiVersion: extensions/v1beta1\nkind: Deployment\nmetadata:\n  name: d\n';
		const fixed = autoFixDeprecatedApiVersions(yaml);
		expect(fixed).toBe('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d\n');
	});

	it('fixes every document in a multi-document file independently', () => {
		const yaml =
			'apiVersion: extensions/v1beta1\nkind: Deployment\nmetadata:\n  name: d1\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d2\n';
		const fixed = autoFixDeprecatedApiVersions(yaml);
		expect(fixed).toContain('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d1');
		expect(fixed).toContain('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: d2');
	});

	it('is a no-op when nothing is deprecated', () => {
		const yaml = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm\n';
		expect(autoFixDeprecatedApiVersions(yaml)).toBe(yaml);
	});
});
