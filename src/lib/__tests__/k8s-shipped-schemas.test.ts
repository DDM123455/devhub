import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../data/k8s-schema-files.json';
import { DEFAULT_K8S_VERSION, K8S_VERSION_OPTIONS, SUPPORTED_KINDS } from '../k8s-yaml-validator';

describe('built-in Kubernetes schemas', () => {
	it('ships a usable schema for every selectable release and kind', () => {
		expect(K8S_VERSION_OPTIONS).toContain(DEFAULT_K8S_VERSION);
		for (const [version, files] of Object.entries(manifest.versions)) {
			expect(Object.keys(files).sort(), version).toEqual([...SUPPORTED_KINDS].sort());
			for (const [kind, name] of Object.entries(files)) {
				const file = new URL('../../../public/schemas/k8s/' + name, import.meta.url);
				const schema = JSON.parse(readFileSync(file, 'utf8'));
				expect(schema.type, version + '/' + kind).toBe('object');
				expect(schema.properties).toHaveProperty('apiVersion');
				expect(schema.properties).toHaveProperty('kind');
			}
		}
	});
});
