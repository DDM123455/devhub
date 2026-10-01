import { describe, expect, it } from 'vitest';
import { evaluateWorkloadSecurity, parseImage } from '../k8s-security';
import { crossCheckManifests } from '../k8s-crosscheck';

const container = (extra: Record<string, unknown> = {}) => ({ name: 'app', image: 'nginx:1.27', ...extra });
const deployment = (c: Record<string, unknown>, podExtra: Record<string, unknown> = {}) => ({
	kind: 'Deployment',
	spec: { template: { metadata: { labels: { app: 'a' } }, spec: { containers: [c], ...podExtra } } },
});
const ids = (r: ReturnType<typeof evaluateWorkloadSecurity>) => r?.findings.map((f) => f.id) ?? [];

describe('parseImage', () => {
	it('detects tags and digests', () => {
		expect(parseImage('nginx').tag).toBeNull();
		expect(parseImage('nginx:1.2').tag).toBe('1.2');
		expect(parseImage('localhost:5000/app').tag).toBeNull();
		expect(parseImage('localhost:5000/app:v1').tag).toBe('v1');
		expect(parseImage('app@sha256:' + 'a'.repeat(64)).hasDigest).toBe(true);
	});
});

describe('evaluateWorkloadSecurity', () => {
	it('returns null for non-workload kinds', () => {
		expect(evaluateWorkloadSecurity('Service', { spec: {} })).toBeNull();
	});

	it('flags critical settings', () => {
		const r = evaluateWorkloadSecurity(
			'Deployment',
			deployment(
				container({ securityContext: { privileged: true, allowPrivilegeEscalation: true, runAsUser: 0, capabilities: { add: ['SYS_ADMIN', 'NET_RAW'] } } }),
				{
					hostNetwork: true,
					hostPID: true,
					hostIPC: true,
					volumes: [
						{ name: 'd', hostPath: { path: '/var/run/docker.sock' } },
						{ name: 'x', hostPath: { path: '/data' } },
					],
				},
			),
		);
		const crit = r!.findings.filter((f) => f.severity === 'critical').map((f) => f.id);
		expect(crit).toEqual(
			expect.arrayContaining(['privileged', 'allow-privilege-escalation-true', 'run-as-root', 'cap-sys-admin', 'host-network', 'host-pid', 'host-ipc', 'host-path-socket']),
		);
		expect(ids(r)).toContain('host-path');
		expect(ids(r)).toContain('cap-add');
		expect(r!.score).toBeLessThan(40);
	});

	it('scores a hardened pod 100', () => {
		const r = evaluateWorkloadSecurity(
			'Deployment',
			deployment(
				container({
					securityContext: {
						allowPrivilegeEscalation: false,
						runAsNonRoot: true,
						runAsUser: 10001,
						readOnlyRootFilesystem: true,
						capabilities: { drop: ['ALL'] },
						seccompProfile: { type: 'RuntimeDefault' },
					},
					resources: { requests: { cpu: '1', memory: '1Gi' }, limits: { cpu: '1', memory: '1Gi' } },
					livenessProbe: {},
					readinessProbe: {},
				}),
				{ serviceAccountName: 'app-sa' },
			),
		);
		expect(r!.findings).toEqual([]);
		expect(r!.score).toBe(100);
	});

	it('uses pod-level securityContext as a fallback and flags latest/no tag', () => {
		const r = evaluateWorkloadSecurity(
			'Deployment',
			deployment(container({ image: 'nginx', imagePullPolicy: 'IfNotPresent' }), {
				securityContext: { runAsNonRoot: true, runAsUser: 20000, seccompProfile: { type: 'RuntimeDefault' } },
			}),
		);
		expect(ids(r)).toContain('image-latest');
		expect(ids(r)).toContain('image-pull-policy');
		expect(ids(r)).not.toContain('run-as-non-root');
		expect(ids(r)).not.toContain('seccomp-profile');
	});

	it('skips probes for batch workloads and handles CronJob nesting', () => {
		const cj = { kind: 'CronJob', spec: { jobTemplate: { spec: { template: { spec: { containers: [container()] } } } } } };
		const r = evaluateWorkloadSecurity('CronJob', cj);
		expect(ids(r)).not.toContain('liveness-probe');
		expect(r!.findings.find((f) => f.id === 'read-only-root-fs')!.path.slice(0, 6)).toEqual(['spec', 'jobTemplate', 'spec', 'template', 'spec', 'containers']);
	});
});

describe('crossCheckManifests', () => {
	const dep = (name: string, labels: Record<string, string>, match: Record<string, string>, ports: unknown[] = [{ containerPort: 80 }]) => ({
		documentIndex: 0,
		kind: 'Deployment',
		value: {
			metadata: { name },
			spec: { selector: { matchLabels: match }, template: { metadata: { labels }, spec: { containers: [{ name: 'c', ports }] } } },
		},
	});
	const svc = (selector: Record<string, string>, ports: unknown[], idx = 1) => ({
		documentIndex: idx,
		kind: 'Service',
		value: { metadata: { name: 's' }, spec: { selector, ports } },
	});

	it('accepts a matching Service and Deployment', () => {
		expect(crossCheckManifests([dep('a', { app: 'a' }, { app: 'a' }), svc({ app: 'a' }, [{ port: 80, targetPort: 80 }])])).toEqual([]);
	});
	it('flags selector that matches nothing and a missing target port', () => {
		const a = crossCheckManifests([dep('a', { app: 'a' }, { app: 'a' }), svc({ app: 'zzz' }, [{ port: 80 }])]);
		expect(a.map((i) => i.key)).toEqual(['xref-service-no-match']);
		const b = crossCheckManifests([dep('a', { app: 'a' }, { app: 'a' }), svc({ app: 'a' }, [{ port: 80, targetPort: 8080 }])]);
		expect(b.map((i) => i.key)).toEqual(['xref-service-port-missing']);
		const c = crossCheckManifests([
			dep('a', { app: 'a' }, { app: 'a' }, [{ name: 'http', containerPort: 80 }]),
			svc({ app: 'a' }, [{ port: 80, targetPort: 'http' }]),
		]);
		expect(c).toEqual([]);
	});
	it('ignores services when the file has no workloads', () => {
		expect(crossCheckManifests([svc({ app: 'a' }, [{ port: 80 }])])).toEqual([]);
	});
	it('flags matchLabels not present in template labels', () => {
		const r = crossCheckManifests([dep('a', { app: 'a' }, { app: 'b' })]);
		expect(r[0].key).toBe('xref-selector-template-mismatch');
	});
	it('flags duplicate names per kind and namespace only', () => {
		const a = dep('x', { app: 'x' }, { app: 'x' });
		const b = { ...dep('x', { app: 'x' }, { app: 'x' }), documentIndex: 1 };
		const r = crossCheckManifests([a, b]);
		expect(r.filter((i) => i.key === 'xref-duplicate-name')).toHaveLength(1);
		expect(r[0].documentIndex).toBe(1);
		const c = { ...b, value: { ...b.value, metadata: { name: 'x', namespace: 'other' } } };
		expect(crossCheckManifests([a, c]).filter((i) => i.key === 'xref-duplicate-name')).toHaveLength(0);
	});
});
