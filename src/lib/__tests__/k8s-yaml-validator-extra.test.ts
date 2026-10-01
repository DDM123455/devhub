import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { autoFixDeprecatedApiVersions, clearSchemaCache, validateK8sManifests } from '../k8s-yaml-validator';

const SCHEMA = {
	type: 'object',
	required: ['apiVersion', 'kind'],
	properties: {
		apiVersion: { type: 'string' },
		kind: { type: 'string' },
		spec: {
			type: 'object',
			additionalProperties: false,
			properties: { replicas: { type: 'integer' } },
			required: ['selector'],
		},
	},
};

const originalFetch = global.fetch;
beforeEach(() => {
	clearSchemaCache();
	global.fetch = vi.fn(async () => ({ ok: true, json: async () => SCHEMA }) as unknown as Response);
});
afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

async function issuesFor(yaml: string, doc = 0) {
	const result = await validateK8sManifests(yaml, 'v1.31.0');
	return result.documents[doc].issues;
}

describe('structural document checks', () => {
	it('reports a missing kind and apiVersion as errors', async () => {
		const issues = await issuesFor('metadata:\n  name: x\n');
		expect(issues.map((i) => i.ruleId)).toEqual(expect.arrayContaining(['missing-kind', 'missing-api-version']));
		expect(issues.every((i) => i.severity === 'error')).toBe(true);
	});

	it('reports a non-mapping document', async () => {
		const issues = await issuesFor('- a\n- b\n');
		expect(issues.some((i) => i.ruleId === 'not-a-mapping')).toBe(true);
		const scalar = await issuesFor('just text\n');
		expect(scalar.some((i) => i.ruleId === 'not-a-mapping')).toBe(true);
	});

	it('reports an empty (comment-only) document as an error, a trailing empty one as a warning', async () => {
		expect((await issuesFor('# nothing here\n'))[0]).toMatchObject({ ruleId: 'empty-document', severity: 'error' });
		const result = await validateK8sManifests('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: a\n---\n', 'v1.31.0');
		expect(result.documents[1].issues[0]).toMatchObject({ key: 'empty-document-trailing', severity: 'warning' });
	});
});

describe('schema errors', () => {
	it('names the offending field for additionalProperties and required errors', async () => {
		const issues = await issuesFor('apiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: 1\n  bogus: true\n');
		const additional = issues.find((i) => i.key === 'schema-additional');
		expect(additional?.params.field).toBe('bogus');
		expect(additional?.line).toBe(5);
		expect(issues.find((i) => i.key === 'schema-required')?.params.field).toBe('selector');
	});
});

describe('robustness', () => {
	it('survives an alias bomb without throwing', async () => {
		let yaml = 'a0: &a0 [x, x, x, x, x, x, x, x, x, x]\n';
		for (let i = 1; i < 10; i++) yaml += `a${i}: &a${i} [${Array(10).fill(`*a${i - 1}`).join(', ')}]\n`;
		yaml = `apiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: 1\n  selector: {}\nextra: &top\n  <<: {}\n${yaml.replace(/^/gm, '')}`;
		const bomb = `apiVersion: apps/v1\nkind: Deployment\n${yaml.split('\n').slice(7).join('\n')}`;
		const issues = await issuesFor(bomb);
		expect(Array.isArray(issues)).toBe(true);
	});

	it('does not cache a failed schema fetch', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ ok: true, json: async () => SCHEMA } as unknown as Response);
		global.fetch = fetchMock as unknown as typeof fetch;
		const yaml = 'apiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: 1\n  selector: {}\n';
		const first = await issuesFor(yaml);
		expect(first.some((i) => i.ruleId === 'schema-unavailable')).toBe(true);
		const second = await issuesFor(yaml);
		expect(second.some((i) => i.ruleId === 'schema-unavailable')).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('Ingress v1beta1 -> v1 auto-fix', () => {
	const input = `# my ingress
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: web # keep me
spec:
  backend:
    serviceName: fallback
    servicePort: 8080
  rules:
    - host: a.example.com
      http:
        paths:
          - path: /api
            backend:
              serviceName: api
              servicePort: http
          - path: /
            pathType: Prefix
            backend:
              serviceName: web
              servicePort: "80"
---
apiVersion: v1
kind: Service
metadata:
  name: svc
`;

	it('converts backends and adds pathType, leaving other documents untouched', () => {
		const fixed = autoFixDeprecatedApiVersions(input);
		const [ingress, service] = fixed.split('\n---\n').map((d) => parse(d));
		expect(ingress.apiVersion).toBe('networking.k8s.io/v1');
		expect(ingress.spec.backend).toBeUndefined();
		expect(ingress.spec.defaultBackend).toEqual({ service: { name: 'fallback', port: { number: 8080 } } });
		const [p1, p2] = ingress.spec.rules[0].http.paths;
		expect(p1).toMatchObject({ pathType: 'ImplementationSpecific', backend: { service: { name: 'api', port: { name: 'http' } } } });
		expect(p2).toMatchObject({ pathType: 'Prefix', backend: { service: { name: 'web', port: { number: 80 } } } });
		expect(service).toEqual({ apiVersion: 'v1', kind: 'Service', metadata: { name: 'svc' } });
		expect(fixed.startsWith('# my ingress\n')).toBe(true);
		expect(fixed.match(/# my ingress/g)).toHaveLength(1);
		expect(fixed).toContain('# keep me');
	});

	it('warns that apiVersion alone is not enough for Ingress', async () => {
		const issues = await issuesFor(input);
		expect(issues.some((i) => i.key === 'deprecated-ingress-backend')).toBe(true);
	});
});
