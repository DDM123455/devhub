import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildK8sJsonReport, clearSchemaCache, crdSchemaUrl, validateK8sManifests } from '../k8s-yaml-validator';

const originalFetch = global.fetch;
const failFetch = () => {
	global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
};
beforeEach(() => clearSchemaCache());
afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('crdSchemaUrl', () => {
	it('builds a catalog URL from group/kind/version only', () => {
		const url = crdSchemaUrl('Certificate', 'cert-manager.io/v1');
		expect(url).toMatch(/datreeio\/CRDs-catalog@[0-9a-f]{40}\/cert-manager\.io\/certificate_v1\.json$/);
	});
	it('rejects core, built-in groups and odd input', () => {
		expect(crdSchemaUrl('Foo', 'v1')).toBeNull();
		expect(crdSchemaUrl('Foo', 'apps/v1')).toBeNull();
		expect(crdSchemaUrl('Foo', 'networking.k8s.io/v1')).toBeNull();
		expect(crdSchemaUrl('../x', 'a.io/v1')).toBeNull();
	});
});

describe('validateK8sManifests v2', () => {
	const crd = 'apiVersion: example.io/v1\nkind: Widget\nmetadata:\n  name: w\nspec:\n  size: big\n';

	it('validates a CRD against the catalog and sends no manifest content', async () => {
		const schema = { type: 'object', properties: { spec: { type: 'object', properties: { size: { type: 'integer' } } } } };
		const fetchMock = vi.fn(async () => ({ ok: true, json: async () => schema }) as unknown as Response);
		global.fetch = fetchMock as unknown as typeof fetch;
		const r = await validateK8sManifests(crd, 'v1.31.0');
		expect(r.documents[0].schemaSource).toBe('crd');
		expect(r.documents[0].issues.some((i) => i.key === 'schema-type')).toBe(true);
		const calls = fetchMock.mock.calls as unknown as [string][];
		expect(calls).toHaveLength(1);
		expect(calls[0][0]).toContain('example.io/widget_v1.json');
		expect(calls[0][0]).not.toContain('big');
	});

	it('keeps the unsupported-kind warning when the CRD is not found, and skipUnknownKinds hides it', async () => {
		failFetch();
		const r = await validateK8sManifests(crd, 'v1.31.0');
		expect(r.documents[0].issues.some((i) => i.ruleId === 'unsupported-kind')).toBe(true);
		const r2 = await validateK8sManifests(crd, 'v1.31.0', { skipUnknownKinds: true });
		expect(r2.documents[0].issues.some((i) => i.ruleId === 'unsupported-kind')).toBe(false);
	});

	it('does not look up the catalog when disabled', async () => {
		const fetchMock = vi.fn();
		global.fetch = fetchMock as unknown as typeof fetch;
		await validateK8sManifests(crd, 'v1.31.0', { crdCatalog: false });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('reports duplicate YAML keys with their own rule', async () => {
		failFetch();
		const r = await validateK8sManifests('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: a\n  name: b\n', 'v1.31.0');
		const dup = r.documents[0].issues.find((i) => i.ruleId === 'duplicate-key');
		expect(dup).toBeDefined();
		expect(dup?.line).toBe(5);
	});

	it('scores a Pod without a schema and runs cross checks', async () => {
		failFetch();
		const yaml = [
			'apiVersion: v1',
			'kind: Pod',
			'metadata:',
			'  name: p',
			'  labels: {app: p}',
			'spec:',
			'  containers:',
			'    - name: c',
			'      image: nginx:latest',
			'      securityContext:',
			'        privileged: true',
			'---',
			'apiVersion: v1',
			'kind: Service',
			'metadata:',
			'  name: s',
			'spec:',
			'  selector: {app: other}',
			'  ports:',
			'    - port: 80',
			'',
		].join('\n');
		const r = await validateK8sManifests(yaml, 'v1.31.0');
		const sec = r.documents[0].security;
		const priv = sec?.findings.find((f) => f.id === 'privileged');
		expect(priv?.line).toBe(11);
		expect(r.documents[1].security).toBeNull();
		expect(r.documents[1].issues.some((i) => i.key === 'xref-service-no-match')).toBe(true);
		const off = await validateK8sManifests(yaml, 'v1.31.0', { security: false, crossCheck: false });
		expect(off.documents[0].security).toBeNull();
		expect(off.documents[1].issues.some((i) => i.key === 'xref-service-no-match')).toBe(false);
	});

	it('builds a JSON report without the manifest text', async () => {
		failFetch();
		const r = await validateK8sManifests('apiVersion: v1\nkind: Pod\nmetadata:\n  name: secretname\nspec:\n  containers:\n    - name: c\n      image: x\n', 'v1.31.0');
		const report = buildK8sJsonReport(r, 'v1.31.0') as { summary: { documents: number }; documents: { security: { score: number } }[] };
		expect(report.summary.documents).toBe(1);
		expect(typeof report.documents[0].security.score).toBe('number');
		expect(JSON.stringify(report)).not.toContain('secretname');
	});
});
