// Small interpretive JSON Schema validator (draft-07 core vocabulary). Deliberately NOT ajv:
// ajv compiles schemas with `new Function`, which the site's Content-Security-Policy
// (`script-src` without 'unsafe-eval') blocks in production.

export interface SchemaError {
	path: string; // JSON-pointer-like path of the offending value, e.g. "/items/0/name"
	message: string;
	keyword: string;
	/** ajv-style details (additionalProperty, missingProperty, type, allowedValues) for friendlier messages. */
	params?: Record<string, unknown>;
}

type Schema = boolean | { [key: string]: unknown };

function typeOf(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
	switch (type) {
		case 'integer':
			return typeof value === 'number' && Number.isInteger(value);
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		default:
			return typeOf(value) === type;
	}
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
	const ka = Object.keys(a as object);
	const kb = Object.keys(b as object);
	return ka.length === kb.length && ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
}

const FORMATS: Record<string, RegExp> = {
	email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	uri: /^[a-z][a-z0-9+.-]*:[^\s]+$/i,
	'date-time': /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/,
	date: /^\d{4}-\d{2}-\d{2}$/,
	time: /^\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?$/,
	ipv4: /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/,
	uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
};

function resolveRef(root: Schema, ref: string): Schema | undefined {
	if (ref === '#') return root;
	if (!ref.startsWith('#/')) return undefined;
	let node: any = root;
	for (const part of ref.slice(2).split('/')) {
		node = node?.[decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')];
		if (node === undefined) return undefined;
	}
	return node;
}

export function validateJsonSchema(data: unknown, schema: unknown, maxErrors = 100): SchemaError[] {
	const errors: SchemaError[] = [];
	const root = schema as Schema;

	function add(path: string, keyword: string, message: string, params?: Record<string, unknown>) {
		if (errors.length < maxErrors) errors.push({ path: path || '/', keyword, message, params });
	}

	function check(value: unknown, sch: Schema, path: string, depth: number): boolean {
		if (depth > 64) return true;
		if (sch === true || sch === undefined) return true;
		if (sch === false) {
			add(path, 'false schema', 'no value is allowed here');
			return false;
		}
		if (typeof sch !== 'object' || sch === null) return true;
		const before = errors.length;
		const probe = (v: unknown, s: Schema, p: string) => {
			// Evaluate a sub-schema without recording its errors (used by anyOf/oneOf/not/if).
			const saved = errors.length;
			const ok = check(v, s, p, depth + 1);
			errors.length = saved;
			return ok;
		};

		if (typeof sch.$ref === 'string') {
			const target = resolveRef(root, sch.$ref);
			if (target === undefined) add(path, '$ref', `cannot resolve reference ${sch.$ref}`);
			else check(value, target, path, depth + 1);
		}
		if (sch.type !== undefined) {
			const types = Array.isArray(sch.type) ? (sch.type as string[]) : [sch.type as string];
			if (!types.some((t) => matchesType(value, t))) {
				add(path, 'type', `must be ${types.join(' or ')} (got ${typeOf(value)})`, { type: types.length === 1 ? types[0] : types });
				return false;
			}
		}
		if (Array.isArray(sch.enum) && !sch.enum.some((e) => deepEqual(e, value))) {
			add(path, 'enum', `must be one of ${JSON.stringify(sch.enum)}`, { allowedValues: sch.enum });
		}
		if ('const' in sch && !deepEqual(sch.const, value)) add(path, 'const', `must equal ${JSON.stringify(sch.const)}`);

		if (typeof value === 'number') {
			if (typeof sch.minimum === 'number' && value < sch.minimum) add(path, 'minimum', `must be >= ${sch.minimum}`);
			if (typeof sch.maximum === 'number' && value > sch.maximum) add(path, 'maximum', `must be <= ${sch.maximum}`);
			if (typeof sch.exclusiveMinimum === 'number' && value <= sch.exclusiveMinimum) add(path, 'exclusiveMinimum', `must be > ${sch.exclusiveMinimum}`);
			if (typeof sch.exclusiveMaximum === 'number' && value >= sch.exclusiveMaximum) add(path, 'exclusiveMaximum', `must be < ${sch.exclusiveMaximum}`);
			if (typeof sch.multipleOf === 'number' && sch.multipleOf > 0) {
				const q = value / sch.multipleOf;
				if (Math.abs(q - Math.round(q)) > 1e-9) add(path, 'multipleOf', `must be a multiple of ${sch.multipleOf}`);
			}
		}
		if (typeof value === 'string') {
			const len = Array.from(value).length;
			if (typeof sch.minLength === 'number' && len < sch.minLength) add(path, 'minLength', `must have at least ${sch.minLength} characters`);
			if (typeof sch.maxLength === 'number' && len > sch.maxLength) add(path, 'maxLength', `must have at most ${sch.maxLength} characters`);
			if (typeof sch.pattern === 'string') {
				try {
					if (!new RegExp(sch.pattern, 'u').test(value)) add(path, 'pattern', `must match pattern ${sch.pattern}`);
				} catch {
					add(path, 'pattern', `invalid pattern ${sch.pattern}`);
				}
			}
			if (typeof sch.format === 'string' && FORMATS[sch.format] && !FORMATS[sch.format].test(value)) {
				add(path, 'format', `must be a valid ${sch.format}`);
			}
		}
		if (Array.isArray(value)) {
			if (typeof sch.minItems === 'number' && value.length < sch.minItems) add(path, 'minItems', `must have at least ${sch.minItems} items`);
			if (typeof sch.maxItems === 'number' && value.length > sch.maxItems) add(path, 'maxItems', `must have at most ${sch.maxItems} items`);
			if (sch.uniqueItems === true) {
				for (let i = 0; i < value.length; i++) {
					if (value.findIndex((x) => deepEqual(x, value[i])) !== i) {
						add(path, 'uniqueItems', `items must be unique (item ${i} duplicates an earlier one)`);
						break;
					}
				}
			}
			if (Array.isArray(sch.items)) {
				value.forEach((item, i) => {
					if (i < (sch.items as Schema[]).length) check(item, (sch.items as Schema[])[i], `${path}/${i}`, depth + 1);
					else if (sch.additionalItems !== undefined) check(item, sch.additionalItems as Schema, `${path}/${i}`, depth + 1);
				});
			} else if (sch.items !== undefined) {
				value.forEach((item, i) => check(item, sch.items as Schema, `${path}/${i}`, depth + 1));
			}
			if (sch.contains !== undefined && !value.some((item) => probe(item, sch.contains as Schema, path))) {
				add(path, 'contains', 'must contain at least one matching item');
			}
		}
		if (typeOf(value) === 'object') {
			const obj = value as Record<string, unknown>;
			const keys = Object.keys(obj);
			if (Array.isArray(sch.required)) {
				for (const key of sch.required as string[]) if (!(key in obj)) add(path, 'required', `missing required property "${key}"`, { missingProperty: key });
			}
			if (typeof sch.minProperties === 'number' && keys.length < sch.minProperties) add(path, 'minProperties', `must have at least ${sch.minProperties} properties`);
			if (typeof sch.maxProperties === 'number' && keys.length > sch.maxProperties) add(path, 'maxProperties', `must have at most ${sch.maxProperties} properties`);
			const props = (sch.properties ?? {}) as Record<string, Schema>;
			const patternProps = (sch.patternProperties ?? {}) as Record<string, Schema>;
			for (const key of keys) {
				const childPath = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
				let matched = false;
				if (Object.prototype.hasOwnProperty.call(props, key)) {
					matched = true;
					check(obj[key], props[key], childPath, depth + 1);
				}
				for (const [pattern, sub] of Object.entries(patternProps)) {
					try {
						if (new RegExp(pattern, 'u').test(key)) {
							matched = true;
							check(obj[key], sub, childPath, depth + 1);
						}
					} catch {
						// ignore invalid pattern
					}
				}
				if (!matched && sch.additionalProperties !== undefined) {
					if (sch.additionalProperties === false) add(childPath, 'additionalProperties', `property "${key}" is not allowed`, { additionalProperty: key });
					else check(obj[key], sch.additionalProperties as Schema, childPath, depth + 1);
				}
			}
			if (sch.propertyNames !== undefined) {
				for (const key of keys) check(key, sch.propertyNames as Schema, `${path}/${key}`, depth + 1);
			}
			if (sch.dependencies && typeof sch.dependencies === 'object') {
				for (const [key, dep] of Object.entries(sch.dependencies as Record<string, unknown>)) {
					if (!(key in obj)) continue;
					if (Array.isArray(dep)) {
						for (const need of dep as string[]) if (!(need in obj)) add(path, 'dependencies', `"${key}" requires "${need}"`);
					} else check(value, dep as Schema, path, depth + 1);
				}
			}
		}
		if (Array.isArray(sch.allOf)) for (const sub of sch.allOf as Schema[]) check(value, sub, path, depth + 1);
		if (Array.isArray(sch.anyOf) && !(sch.anyOf as Schema[]).some((sub) => probe(value, sub, path))) {
			add(path, 'anyOf', 'must match at least one of the allowed schemas');
		}
		if (Array.isArray(sch.oneOf)) {
			const n = (sch.oneOf as Schema[]).filter((sub) => probe(value, sub, path)).length;
			if (n !== 1) add(path, 'oneOf', `must match exactly one of the allowed schemas (matched ${n})`);
		}
		if (sch.not !== undefined && probe(value, sch.not as Schema, path)) add(path, 'not', 'must not match the forbidden schema');
		if (sch.if !== undefined) {
			if (probe(value, sch.if as Schema, path)) {
				if (sch.then !== undefined) check(value, sch.then as Schema, path, depth + 1);
			} else if (sch.else !== undefined) check(value, sch.else as Schema, path, depth + 1);
		}
		return errors.length === before;
	}

	check(data, root, '', 0);
	return errors;
}
