// Refresh the checked-in built-in schemas explicitly. Normal builds use the local snapshot.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ref = '8df8a883b68a24a104b4a9e43c1288090ae60b3b';
const upstream = 'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/' + ref;
const files = {
	Deployment: 'deployment-apps-v1', Service: 'service-v1', Ingress: 'ingress-networking-v1',
	ConfigMap: 'configmap-v1', Secret: 'secret-v1', StatefulSet: 'statefulset-apps-v1',
	DaemonSet: 'daemonset-apps-v1', Job: 'job-batch-v1', CronJob: 'cronjob-batch-v1',
	PersistentVolumeClaim: 'persistentvolumeclaim-v1',
};
const versions = ['master', ...Array.from({ length: 12 }, (_, i) => 'v1.' + (37 - i) + '.0')];
const directory = new URL('../public/schemas/k8s/', import.meta.url);
const manifest = { ref, versions: {} };

// Strip documentation only at schema nodes. A resource property named "description"
// or a literal object inside "enum" must retain its original validation semantics.
function stripAnnotations(schema) {
	if (!schema || typeof schema !== 'object') return;
	delete schema.description;
	for (const key of ['properties', 'patternProperties', 'definitions', '$defs']) {
		Object.values(schema[key] ?? {}).forEach(stripAnnotations);
	}
	for (const key of ['items', 'additionalProperties', 'oneOf', 'allOf', 'anyOf', 'not']) {
		const child = schema[key];
		if (Array.isArray(child)) child.forEach(stripAnnotations);
		else stripAnnotations(child);
	}
}

async function readUpstream(path) {
	const response = await fetch(upstream + '/' + path, { signal: AbortSignal.timeout(30000) });
	if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
	return response;
}

await mkdir(directory, { recursive: true });
for (const version of versions) {
	const entries = await Promise.all(Object.entries(files).map(async ([kind, stem]) => {
		const schema = await (await readUpstream(version + '-standalone/' + stem + '.json')).json();
		if (!schema.properties?.kind || !schema.properties?.apiVersion) throw new Error(version + '/' + kind);
		stripAnnotations(schema);
		const encoded = JSON.stringify(schema) + '\n';
		const hash = createHash('sha256').update(encoded).digest('hex').slice(0, 16);
		const name = stem + '-' + hash + '.json';
		const destination = new URL(name, directory);
		let existing;
		try { existing = await readFile(destination, 'utf8'); }
		catch (error) { if (error.code !== 'ENOENT') throw error; }
		if (existing !== encoded) await writeFile(destination, encoded);
		return [kind, name];
	}));
	manifest.versions[version] = Object.fromEntries(entries);
}
await writeFile(new URL('LICENSE.txt', directory), await (await readUpstream('LICENSE')).text());
await writeFile(new URL('../src/data/k8s-schema-files.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
