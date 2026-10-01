// Security / best-practice scorer for Kubernetes workloads (Kubesec-style).
// Pure logic over an already-parsed JS value — no YAML, no DOM, no network.
//
// Every finding carries the absolute `path` inside the document so the validator can map it back
// to a real source line, plus an i18n `key`/`params` pair (never hardcoded UI text).

export type SecuritySeverity = 'critical' | 'advisory';

export interface SecurityFinding {
	/** Stable id, also the suffix of the i18n keys `security.checks.<id>` / `security.fixes.<id>`. */
	id: string;
	severity: SecuritySeverity;
	/** Score points removed by this finding. */
	penalty: number;
	/** Absolute path inside the document the finding points at. */
	path: (string | number)[];
	params: Record<string, string | number>;
	/** Resolved by the caller from `path`. */
	line?: number | null;
}

export interface SecurityReport {
	/** 0-100, higher is better. */
	score: number;
	findings: SecurityFinding[];
	/** Number of individual checks evaluated (passed + failed). */
	checked: number;
	passed: number;
}

export const SECURITY_CHECK_IDS = [
	'privileged',
	'allow-privilege-escalation-true',
	'allow-privilege-escalation-unset',
	'run-as-root',
	'run-as-user-low',
	'run-as-non-root',
	'read-only-root-fs',
	'cap-sys-admin',
	'cap-add-all',
	'cap-add',
	'cap-drop-all',
	'requests-cpu',
	'requests-memory',
	'limits-cpu',
	'limits-memory',
	'host-network',
	'host-pid',
	'host-ipc',
	'host-path-socket',
	'host-path',
	'default-service-account',
	'image-latest',
	'image-pull-policy',
	'liveness-probe',
	'readiness-probe',
	'seccomp-profile',
] as const;

export const CRITICAL_PENALTY = 20;
export const ADVISORY_PENALTY = 4;

export const WORKLOAD_KINDS = ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob'] as const;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Path (inside the document) of the PodSpec for a workload kind, or null if the kind has none. */
export function podSpecPath(kind: string): string[] | null {
	switch (kind) {
		case 'Pod':
			return ['spec'];
		case 'Deployment':
		case 'StatefulSet':
		case 'DaemonSet':
		case 'ReplicaSet':
		case 'Job':
			return ['spec', 'template', 'spec'];
		case 'CronJob':
			return ['spec', 'jobTemplate', 'spec', 'template', 'spec'];
		default:
			return null;
	}
}

export function getPodSpec(kind: string, doc: unknown): Obj | null {
	const path = podSpecPath(kind);
	if (!path) return null;
	let cur: unknown = doc;
	for (const seg of path) {
		if (!isObj(cur)) return null;
		cur = cur[seg];
	}
	return isObj(cur) ? cur : null;
}

const SOCKET_RE = /(docker|containerd|crio|cri-dockerd)\.sock$/;

/** Splits "registry:5000/app:1.2@sha256:..." into tag/digest info. */
export function parseImage(image: string): { tag: string | null; hasDigest: boolean } {
	const hasDigest = image.includes('@sha256:') || /@[a-z0-9]+:[0-9a-f]{16,}/i.test(image);
	const withoutDigest = image.split('@')[0];
	const lastSlash = withoutDigest.lastIndexOf('/');
	const lastColon = withoutDigest.lastIndexOf(':');
	const tag = lastColon > lastSlash ? withoutDigest.slice(lastColon + 1) : null;
	return { tag, hasDigest };
}

export function evaluateWorkloadSecurity(kind: string, doc: unknown): SecurityReport | null {
	const base = podSpecPath(kind);
	const pod = getPodSpec(kind, doc);
	if (!base || !pod) return null;

	const findings: SecurityFinding[] = [];
	let checked = 0;
	const check = (
		failed: boolean,
		id: string,
		severity: SecuritySeverity,
		path: (string | number)[],
		params: Record<string, string | number> = {},
	) => {
		checked++;
		if (!failed) return;
		findings.push({ id, severity, penalty: severity === 'critical' ? CRITICAL_PENALTY : ADVISORY_PENALTY, path, params });
	};

	const podSc = isObj(pod.securityContext) ? pod.securityContext : {};

	// --- pod-level checks ---
	check(pod.hostNetwork === true, 'host-network', 'critical', [...base, 'hostNetwork']);
	check(pod.hostPID === true, 'host-pid', 'critical', [...base, 'hostPID']);
	check(pod.hostIPC === true, 'host-ipc', 'critical', [...base, 'hostIPC']);

	const saName = typeof pod.serviceAccountName === 'string' ? pod.serviceAccountName : typeof pod.serviceAccount === 'string' ? pod.serviceAccount : '';
	check(saName === '' || saName === 'default', 'default-service-account', 'advisory', pod.serviceAccountName !== undefined ? [...base, 'serviceAccountName'] : base);

	if (Array.isArray(pod.volumes)) {
		pod.volumes.forEach((vol, i) => {
			if (!isObj(vol) || !isObj(vol.hostPath)) return;
			const hp = typeof vol.hostPath.path === 'string' ? vol.hostPath.path : '';
			const name = typeof vol.name === 'string' ? vol.name : String(i);
			const p = [...base, 'volumes', i, 'hostPath'];
			if (SOCKET_RE.test(hp)) check(true, 'host-path-socket', 'critical', p, { name, path: hp });
			else check(true, 'host-path', 'advisory', p, { name, path: hp });
		});
	}

	const isBatch = kind === 'Job' || kind === 'CronJob';
	const groups: ['containers' | 'initContainers', boolean][] = [
		['containers', true],
		['initContainers', false],
	];
	for (const [listName, wantProbes] of groups) {
		const list = pod[listName];
		if (!Array.isArray(list)) continue;
		list.forEach((c, i) => {
			if (!isObj(c)) return;
			const cp = [...base, listName, i];
			const container = typeof c.name === 'string' && c.name !== '' ? c.name : `#${i + 1}`;
			const sc = isObj(c.securityContext) ? c.securityContext : {};
			const P = { container };

			check(sc.privileged === true, 'privileged', 'critical', [...cp, 'securityContext', 'privileged'], P);

			if (sc.allowPrivilegeEscalation === true) check(true, 'allow-privilege-escalation-true', 'critical', [...cp, 'securityContext', 'allowPrivilegeEscalation'], P);
			else check(sc.allowPrivilegeEscalation !== false, 'allow-privilege-escalation-unset', 'advisory', sc.allowPrivilegeEscalation === undefined ? cp : [...cp, 'securityContext', 'allowPrivilegeEscalation'], P);

			const runAsUser = sc.runAsUser !== undefined ? sc.runAsUser : podSc.runAsUser;
			const runAsNonRoot = sc.runAsNonRoot !== undefined ? sc.runAsNonRoot : podSc.runAsNonRoot;
			const userPath = sc.runAsUser !== undefined ? [...cp, 'securityContext', 'runAsUser'] : podSc.runAsUser !== undefined ? [...base, 'securityContext', 'runAsUser'] : cp;
			if (runAsUser === 0) check(true, 'run-as-root', 'critical', userPath, P);
			else if (typeof runAsUser === 'number') check(runAsUser < 10000, 'run-as-user-low', 'advisory', userPath, { ...P, uid: runAsUser });
			check(runAsNonRoot !== true && !(typeof runAsUser === 'number' && runAsUser > 0), 'run-as-non-root', 'advisory', cp, P);

			check(sc.readOnlyRootFilesystem !== true, 'read-only-root-fs', 'advisory', cp, P);

			const caps = isObj(sc.capabilities) ? sc.capabilities : {};
			const add = Array.isArray(caps.add) ? caps.add.map((x) => String(x).toUpperCase()) : [];
			const drop = Array.isArray(caps.drop) ? caps.drop.map((x) => String(x).toUpperCase()) : [];
			const capPath = [...cp, 'securityContext', 'capabilities'];
			check(add.includes('SYS_ADMIN'), 'cap-sys-admin', 'critical', capPath, P);
			check(add.includes('ALL'), 'cap-add-all', 'critical', capPath, P);
			const otherAdd = add.filter((x) => x !== 'SYS_ADMIN' && x !== 'ALL');
			check(otherAdd.length > 0, 'cap-add', 'advisory', capPath, { ...P, caps: otherAdd.join(', ') });
			check(!drop.includes('ALL'), 'cap-drop-all', 'advisory', drop.length > 0 ? capPath : cp, P);

			const res = isObj(c.resources) ? c.resources : {};
			const req = isObj(res.requests) ? res.requests : {};
			const lim = isObj(res.limits) ? res.limits : {};
			const resPath = c.resources !== undefined ? [...cp, 'resources'] : cp;
			check(req.cpu === undefined, 'requests-cpu', 'advisory', resPath, P);
			check(req.memory === undefined, 'requests-memory', 'advisory', resPath, P);
			check(lim.cpu === undefined, 'limits-cpu', 'advisory', resPath, P);
			check(lim.memory === undefined, 'limits-memory', 'advisory', resPath, P);

			if (typeof c.image === 'string') {
				const { tag, hasDigest } = parseImage(c.image);
				const mutable = !hasDigest && (tag === null || tag === 'latest');
				check(mutable, 'image-latest', 'advisory', [...cp, 'image'], { ...P, image: c.image });
				const policy = typeof c.imagePullPolicy === 'string' ? c.imagePullPolicy : '';
				check(mutable && policy !== '' && policy !== 'Always', 'image-pull-policy', 'advisory', [...cp, 'imagePullPolicy'], { ...P, policy });
			}

			const seccomp = isObj(sc.seccompProfile) ? sc.seccompProfile : isObj(podSc.seccompProfile) ? podSc.seccompProfile : null;
			check(!(seccomp && (seccomp.type === 'RuntimeDefault' || seccomp.type === 'Localhost')), 'seccomp-profile', 'advisory', cp, P);

			if (wantProbes && !isBatch) {
				check(c.livenessProbe === undefined, 'liveness-probe', 'advisory', cp, P);
				check(c.readinessProbe === undefined, 'readiness-probe', 'advisory', cp, P);
			}
		});
	}

	const total = findings.reduce((n, f) => n + f.penalty, 0);
	return {
		score: Math.max(0, 100 - total),
		findings,
		checked,
		passed: checked - findings.length,
	};
}
