// Cross-resource checks inside one multi-document manifest: Service selectors vs workload labels,
// Service ports vs container ports, duplicate names, and selector.matchLabels vs template labels.
// Pure logic over parsed JS values.
import { podSpecPath } from './k8s-security';

type Obj = Record<string, unknown>;

export interface CrossCheckInput {
	documentIndex: number;
	kind: string | null;
	value: unknown;
}

export interface CrossIssue {
	documentIndex: number;
	severity: 'error' | 'warning';
	key: string;
	params: Record<string, string | number>;
	/** Absolute path inside the document for the line lookup. */
	path: (string | number)[];
}

function isObj(v: unknown): v is Obj {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function stringMap(v: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (!isObj(v)) return out;
	for (const [k, val] of Object.entries(v)) out[k] = String(val);
	return out;
}

function nsOf(value: Obj): string {
	const meta = isObj(value.metadata) ? value.metadata : {};
	return str(meta.namespace) || 'default';
}

function nameOf(value: Obj): string {
	const meta = isObj(value.metadata) ? value.metadata : {};
	return str(meta.name);
}

function templateLabelsPath(kind: string): string[] | null {
	const p = podSpecPath(kind);
	if (!p || kind === 'Pod') return null;
	return [...p.slice(0, -1), 'metadata', 'labels'];
}

function labelsOfWorkload(kind: string, value: Obj): Record<string, string> | null {
	if (kind === 'Pod') return stringMap(isObj(value.metadata) ? value.metadata.labels : undefined);
	const p = templateLabelsPath(kind);
	if (!p) return null;
	let cur: unknown = value;
	for (const seg of p) {
		if (!isObj(cur)) return {};
		cur = cur[seg];
	}
	return stringMap(cur);
}

function containerPorts(kind: string, value: Obj): { numbers: Set<number>; names: Set<string> } {
	const numbers = new Set<number>();
	const names = new Set<string>();
	const p = podSpecPath(kind);
	let cur: unknown = value;
	for (const seg of p ?? []) {
		if (!isObj(cur)) return { numbers, names };
		cur = cur[seg];
	}
	if (isObj(cur) && Array.isArray(cur.containers)) {
		for (const c of cur.containers) {
			if (!isObj(c) || !Array.isArray(c.ports)) continue;
			for (const port of c.ports) {
				if (!isObj(port)) continue;
				if (typeof port.containerPort === 'number') numbers.add(port.containerPort);
				if (typeof port.name === 'string') names.add(port.name);
			}
		}
	}
	return { numbers, names };
}

const SELECTOR_KINDS = ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'];

export function crossCheckManifests(inputs: CrossCheckInput[]): CrossIssue[] {
	const issues: CrossIssue[] = [];
	const docs = inputs.filter((d) => d.kind && isObj(d.value)) as (CrossCheckInput & { kind: string; value: Obj })[];

	// 1. duplicate name per kind + namespace
	const seen = new Map<string, number>();
	for (const d of docs) {
		const name = nameOf(d.value);
		if (!name) continue;
		const id = `${d.kind}/${nsOf(d.value)}/${name}`;
		if (seen.has(id)) {
			issues.push({
				documentIndex: d.documentIndex,
				severity: 'error',
				key: 'xref-duplicate-name',
				params: { kind: d.kind, name, namespace: nsOf(d.value), first: (seen.get(id) as number) + 1 },
				path: ['metadata', 'name'],
			});
		} else seen.set(id, d.documentIndex);
	}

	// 2. selector.matchLabels must be a subset of the template labels
	for (const d of docs) {
		if (!SELECTOR_KINDS.includes(d.kind)) continue;
		const spec = isObj(d.value.spec) ? d.value.spec : null;
		const selector = spec && isObj(spec.selector) ? spec.selector : null;
		if (!selector || !isObj(selector.matchLabels)) continue;
		const match = stringMap(selector.matchLabels);
		const tpl = labelsOfWorkload(d.kind, d.value) ?? {};
		const missing = Object.entries(match).filter(([k, v]) => tpl[k] !== v);
		if (missing.length > 0) {
			issues.push({
				documentIndex: d.documentIndex,
				severity: 'error',
				key: 'xref-selector-template-mismatch',
				params: { kind: d.kind, labels: missing.map(([k, v]) => `${k}=${v}`).join(', ') },
				path: ['spec', 'selector', 'matchLabels'],
			});
		}
	}

	// 3. Service -> workloads (only when the file actually contains workloads)
	const workloads = docs.filter((d) => podSpecPath(d.kind) !== null && d.kind !== 'CronJob');
	for (const svc of docs.filter((d) => d.kind === 'Service')) {
		const spec = isObj(svc.value.spec) ? svc.value.spec : null;
		if (!spec || spec.type === 'ExternalName') continue;
		const selector = stringMap(spec.selector);
		const entries = Object.entries(selector);
		if (entries.length === 0 || workloads.length === 0) continue;
		const ns = nsOf(svc.value);
		const matched = workloads.filter((w) => {
			if (nsOf(w.value) !== ns) return false;
			const labels = labelsOfWorkload(w.kind, w.value) ?? {};
			return entries.every(([k, v]) => labels[k] === v);
		});
		const svcName = nameOf(svc.value) || '?';
		if (matched.length === 0) {
			issues.push({
				documentIndex: svc.documentIndex,
				severity: 'warning',
				key: 'xref-service-no-match',
				params: { service: svcName, selector: entries.map(([k, v]) => `${k}=${v}`).join(', ') },
				path: ['spec', 'selector'],
			});
			continue;
		}
		const ports = Array.isArray(spec.ports) ? spec.ports : [];
		ports.forEach((p, i) => {
			if (!isObj(p)) return;
			const target = p.targetPort !== undefined ? p.targetPort : p.port;
			if (typeof target !== 'number' && typeof target !== 'string') return;
			const numeric = typeof target === 'number' ? target : /^\d+$/.test(target) ? Number(target) : null;
			const found = matched.some((w) => {
				const cp = containerPorts(w.kind, w.value);
				return numeric !== null ? cp.numbers.has(numeric) : cp.names.has(String(target));
			});
			if (!found) {
				issues.push({
					documentIndex: svc.documentIndex,
					severity: 'warning',
					key: 'xref-service-port-missing',
					params: { service: svcName, port: String(target), workloads: matched.map((w) => `${w.kind}/${nameOf(w.value)}`).join(', ') },
					path: ['spec', 'ports', i, p.targetPort !== undefined ? 'targetPort' : 'port'],
				});
			}
		});
	}

	return issues;
}
