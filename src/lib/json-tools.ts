// Pure helpers for the JSON Formatter's advanced panel: repair report, type inference,
// code generation (TS / Go / Java / C# / Python), JSON Schema inference and a small JSONPath subset.
// No DOM access so everything here is unit-testable.

/* ------------------------------------------------------------------ repair report */

export type RepairIssue =
	| 'codeFence'
	| 'comments'
	| 'singleQuotes'
	| 'trailingCommas'
	| 'unquotedKeys'
	| 'constants'
	| 'ndjson'
	| 'unbalanced';

// Removes the content of double-quoted strings so heuristics don't fire on text inside them.
function stripDoubleQuotedStrings(text: string): string {
	return text.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

// Best-effort, heuristic description of what `jsonrepair` is likely to have changed. The
// repair itself is done by the library; this only explains it to the user.
export function detectRepairIssues(original: string): RepairIssue[] {
	const issues: RepairIssue[] = [];
	const trimmed = original.trim();
	if (/^```/.test(trimmed)) issues.push('codeFence');
	const bare = stripDoubleQuotedStrings(original);
	if (/\/\/|\/\*|^\s*#/m.test(bare)) issues.push('comments');
	if (/'(?:[^'\\\n]|\\.)*'\s*[:,\]}]|[:,[]\s*'(?:[^'\\\n]|\\.)*'/.test(bare)) issues.push('singleQuotes');
	if (/,\s*[}\]]/.test(bare)) issues.push('trailingCommas');
	if (/[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(bare)) issues.push('unquotedKeys');
	if (/\b(None|True|False|undefined|NaN|Infinity)\b/.test(bare)) issues.push('constants');
	const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== '');
	if (lines.length > 1 && lines.every((l) => /^\s*[{[]/.test(l)) && !/^\s*[[{]\s*$/.test(lines[0])) {
		issues.push('ndjson');
	}
	const open = (bare.match(/[{[]/g) ?? []).length;
	const close = (bare.match(/[}\]]/g) ?? []).length;
	if (open !== close) issues.push('unbalanced');
	return issues;
}

// Parses newline-delimited JSON; returns the array of values or null if any non-empty line fails.
export function parseNdjson(text: string): unknown[] | null {
	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
	if (lines.length < 2) return null;
	const out: unknown[] = [];
	for (const line of lines) {
		try {
			out.push(JSON.parse(line));
		} catch {
			return null;
		}
	}
	return out;
}

/* ------------------------------------------------------------------ type inference */

export type JType =
	| { kind: 'null' | 'string' | 'int' | 'float' | 'bool' | 'any' }
	| { kind: 'array'; item: JType }
	| { kind: 'object'; name: string; fields: Map<string, { type: JType; optional: boolean }> }
	| { kind: 'union'; members: JType[] };

export function pascalCase(input: string): string {
	const words = input
		.normalize('NFC')
		.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	let out = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
	if (out === '') out = 'Item';
	if (/^\d/.test(out)) out = '_' + out;
	return out;
}

function singular(name: string): string {
	if (/ies$/i.test(name) && name.length > 3) return name.slice(0, -3) + 'y';
	if (/(ss|us)$/i.test(name)) return name;
	if (/s$/i.test(name) && name.length > 1) return name.slice(0, -1);
	return name;
}

class NameRegistry {
	private used = new Set<string>();
	unique(base: string): string {
		let name = base;
		let i = 2;
		while (this.used.has(name)) name = base + i++;
		this.used.add(name);
		return name;
	}
}

function typeKey(t: JType): string {
	return t.kind === 'object' ? 'object' : t.kind === 'array' ? 'array' : t.kind;
}

export function mergeTypes(a: JType, b: JType): JType {
	if (a.kind === 'any') return b;
	if (b.kind === 'any') return a;
	if (a.kind === 'union' || b.kind === 'union') {
		const members = [...(a.kind === 'union' ? a.members : [a])];
		for (const m of b.kind === 'union' ? b.members : [b]) addToUnion(members, m);
		return members.length === 1 ? members[0] : { kind: 'union', members };
	}
	if (a.kind === b.kind) {
		if (a.kind === 'array' && b.kind === 'array') return { kind: 'array', item: mergeTypes(a.item, b.item) };
		if (a.kind === 'object' && b.kind === 'object') {
			const fields = new Map(a.fields);
			for (const [key, field] of b.fields) {
				const existing = fields.get(key);
				fields.set(key, existing ? { type: mergeTypes(existing.type, field.type), optional: existing.optional || field.optional } : { type: field.type, optional: true });
			}
			for (const key of a.fields.keys()) if (!b.fields.has(key)) fields.set(key, { ...fields.get(key)!, optional: true });
			return { kind: 'object', name: a.name, fields };
		}
		return a;
	}
	// int + float => float
	if ((a.kind === 'int' && b.kind === 'float') || (a.kind === 'float' && b.kind === 'int')) return { kind: 'float' };
	return { kind: 'union', members: [a, b] };
}

function addToUnion(members: JType[], t: JType) {
	const index = members.findIndex((m) => typeKey(m) === typeKey(t) || (isNumeric(m) && isNumeric(t)));
	if (index === -1) members.push(t);
	else members[index] = mergeTypes(members[index], t);
}

function isNumeric(t: JType): boolean {
	return t.kind === 'int' || t.kind === 'float';
}

export function inferType(value: unknown, nameHint: string, registry = new NameRegistry()): JType {
	if (value === null) return { kind: 'null' };
	if (typeof value === 'string') return { kind: 'string' };
	if (typeof value === 'boolean') return { kind: 'bool' };
	if (typeof value === 'number') return { kind: Number.isInteger(value) ? 'int' : 'float' };
	if (Array.isArray(value)) {
		if (value.length === 0) return { kind: 'array', item: { kind: 'any' } };
		const itemName = singular(nameHint);
		let item: JType | null = null;
		for (const element of value) {
			const t = inferType(element, itemName, registry);
			item = item ? mergeTypes(item, t) : t;
		}
		return { kind: 'array', item: item! };
	}
	if (typeof value === 'object') {
		const fields = new Map<string, { type: JType; optional: boolean }>();
		const name = registry.unique(pascalCase(nameHint));
		for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
			fields.set(key, { type: inferType(v, key, registry), optional: false });
		}
		return { kind: 'object', name, fields };
	}
	return { kind: 'any' };
}

// Objects in post-order (children first); duplicates by identity removed.
function collectObjects(t: JType, out: Extract<JType, { kind: 'object' }>[] = []): Extract<JType, { kind: 'object' }>[] {
	if (t.kind === 'object') {
		for (const f of t.fields.values()) collectObjects(f.type, out);
		if (!out.includes(t)) out.push(t);
	} else if (t.kind === 'array') collectObjects(t.item, out);
	else if (t.kind === 'union') t.members.forEach((m) => collectObjects(m, out));
	return out;
}

// A merged union of several object types keeps distinct names; unions with null become nullable.
function splitNullable(t: JType): { base: JType | null; nullable: boolean } {
	if (t.kind === 'null') return { base: null, nullable: true };
	if (t.kind !== 'union') return { base: t, nullable: false };
	const rest = t.members.filter((m) => m.kind !== 'null');
	const nullable = rest.length !== t.members.length;
	if (rest.length === 0) return { base: null, nullable: true };
	return { base: rest.length === 1 ? rest[0] : { kind: 'union', members: rest }, nullable };
}

/* ------------------------------------------------------------------ code generation */

export type CodeLanguage = 'typescript' | 'go' | 'java' | 'csharp' | 'python-dataclass' | 'python-typeddict';

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

function camelCase(input: string): string {
	const p = pascalCase(input);
	return p.charAt(0).toLowerCase() + p.slice(1);
}

function snakeCase(input: string): string {
	const s = input
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase();
	const out = s === '' ? 'field' : s;
	return /^\d/.test(out) ? '_' + out : out;
}

const PY_KEYWORDS = new Set(['class', 'def', 'from', 'import', 'global', 'in', 'is', 'lambda', 'pass', 'return', 'with', 'yield', 'None', 'True', 'False', 'and', 'or', 'not', 'if', 'else', 'for', 'while', 'try', 'except', 'raise', 'del', 'as', 'assert', 'async', 'await', 'break', 'continue', 'elif', 'finally', 'nonlocal']);
const JAVA_KEYWORDS = new Set(['class', 'int', 'long', 'new', 'package', 'public', 'private', 'static', 'void', 'default', 'switch', 'case', 'this', 'final', 'abstract', 'boolean', 'double', 'float', 'char', 'byte', 'short', 'interface', 'enum', 'return', 'if', 'else', 'for', 'while', 'do', 'try', 'catch', 'throw', 'throws', 'import', 'extends', 'implements', 'super', 'null', 'true', 'false']);

function typeToTs(t: JType): string {
	const { base, nullable } = splitNullable(t);
	let out: string;
	if (!base) out = 'null';
	else if (base.kind === 'union') out = base.members.map(typeToTs).join(' | ');
	else if (base.kind === 'string') out = 'string';
	else if (base.kind === 'int' || base.kind === 'float') out = 'number';
	else if (base.kind === 'bool') out = 'boolean';
	else if (base.kind === 'any' || base.kind === 'null') out = 'unknown';
	else if (base.kind === 'array') {
		const inner = typeToTs(base.item);
		out = /[|]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
	} else out = base.name;
	return nullable && base ? `${out} | null` : out;
}

function genTs(objs: Extract<JType, { kind: 'object' }>[]): string {
	return objs
		.slice()
		.reverse()
		.map((o) => {
			const lines = [...o.fields].map(([key, f]) => {
				const k = IDENT_RE.test(key) ? key : JSON.stringify(key);
				return `  ${k}${f.optional ? '?' : ''}: ${typeToTs(f.type)};`;
			});
			return `export interface ${o.name} {\n${lines.join('\n')}\n}`;
		})
		.join('\n\n');
}

function typeToGo(t: JType): string {
	const { base, nullable } = splitNullable(t);
	let out: string;
	if (!base) return 'interface{}';
	if (base.kind === 'union') out = 'interface{}';
	else if (base.kind === 'string') out = 'string';
	else if (base.kind === 'int') out = 'int64';
	else if (base.kind === 'float') out = 'float64';
	else if (base.kind === 'bool') out = 'bool';
	else if (base.kind === 'any' || base.kind === 'null') out = 'interface{}';
	else if (base.kind === 'array') out = `[]${typeToGo(base.item)}`;
	else out = base.name;
	const pointerable = base.kind === 'string' || base.kind === 'int' || base.kind === 'float' || base.kind === 'bool' || base.kind === 'object';
	return nullable && pointerable ? `*${out}` : out;
}

function genGo(objs: Extract<JType, { kind: 'object' }>[]): string {
	return objs
		.slice()
		.reverse()
		.map((o) => {
			const lines = [...o.fields].map(([key, f]) => {
				const tag = `json:"${key}${f.optional ? ',omitempty' : ''}"`;
				return `\t${pascalCase(key)} ${typeToGo(f.type)} \`${tag}\``;
			});
			return `type ${o.name} struct {\n${lines.join('\n')}\n}`;
		})
		.join('\n\n');
}

function typeToJava(t: JType): string {
	const { base } = splitNullable(t);
	if (!base) return 'Object';
	if (base.kind === 'union') return 'Object';
	if (base.kind === 'string') return 'String';
	if (base.kind === 'int') return 'Long';
	if (base.kind === 'float') return 'Double';
	if (base.kind === 'bool') return 'Boolean';
	if (base.kind === 'array') return `List<${typeToJava(base.item)}>`;
	if (base.kind === 'object') return base.name;
	return 'Object';
}

function genJava(objs: Extract<JType, { kind: 'object' }>[]): string {
	const body = objs
		.slice()
		.reverse()
		.map((o) => {
			const lines = [...o.fields].map(([key, f]) => {
				let id = camelCase(key);
				if (JAVA_KEYWORDS.has(id)) id += '_';
				const annotation = id !== key ? `    @JsonProperty(${JSON.stringify(key)})\n` : '';
				return `${annotation}    public ${typeToJava(f.type)} ${id};`;
			});
			return `public class ${o.name} {\n${lines.join('\n')}\n}`;
		})
		.join('\n\n');
	const imports = ['import java.util.List;'];
	if (body.includes('@JsonProperty')) imports.push('import com.fasterxml.jackson.annotation.JsonProperty;');
	return `${imports.join('\n')}\n\n${body}`;
}

function typeToCs(t: JType): string {
	const { base, nullable } = splitNullable(t);
	if (!base) return 'object?';
	let out: string;
	if (base.kind === 'union') out = 'object';
	else if (base.kind === 'string') out = 'string';
	else if (base.kind === 'int') out = 'long';
	else if (base.kind === 'float') out = 'double';
	else if (base.kind === 'bool') out = 'bool';
	else if (base.kind === 'array') out = `List<${typeToCs(base.item)}>`;
	else if (base.kind === 'object') out = base.name;
	else out = 'object';
	return nullable ? `${out}?` : out;
}

function genCs(objs: Extract<JType, { kind: 'object' }>[]): string {
	const body = objs
		.slice()
		.reverse()
		.map((o) => {
			const lines = [...o.fields].map(
				([key, f]) => `    [JsonPropertyName(${JSON.stringify(key)})]\n    public ${typeToCs(f.type)} ${pascalCase(key)} { get; set; }`,
			);
			return `public class ${o.name}\n{\n${lines.join('\n\n')}\n}`;
		})
		.join('\n\n');
	return `using System.Collections.Generic;\nusing System.Text.Json.Serialization;\n\n${body}`;
}

function typeToPy(t: JType): string {
	const { base, nullable } = splitNullable(t);
	let out: string;
	if (!base) return 'None';
	if (base.kind === 'union') out = `Union[${base.members.map(typeToPy).join(', ')}]`;
	else if (base.kind === 'string') out = 'str';
	else if (base.kind === 'int') out = 'int';
	else if (base.kind === 'float') out = 'float';
	else if (base.kind === 'bool') out = 'bool';
	else if (base.kind === 'array') out = `List[${typeToPy(base.item)}]`;
	else if (base.kind === 'object') out = base.name;
	else out = 'Any';
	return nullable ? `Optional[${out}]` : out;
}

function pyField(key: string): string {
	let id = snakeCase(key);
	if (PY_KEYWORDS.has(id)) id += '_';
	return id;
}

function genPy(objs: Extract<JType, { kind: 'object' }>[], typed: boolean): string {
	const body = objs
		.map((o) => {
			const entries = [...o.fields];
			if (typed && entries.some(([k]) => pyField(k) !== k)) {
				// Keys that are not valid identifiers need the functional TypedDict syntax.
				const inner = entries
					.map(([key, f]) => `${JSON.stringify(key)}: ${f.optional ? `NotRequired[${typeToPy(f.type)}]` : typeToPy(f.type)}`)
					.join(', ');
				return `${o.name} = TypedDict(${JSON.stringify(o.name)}, {${inner}})`;
			}
			const head = typed ? `class ${o.name}(TypedDict):` : `@dataclass\nclass ${o.name}:`;
			// Required fields first for dataclasses (defaults can't precede non-defaults).
			const ordered = typed ? entries : [...entries.filter(([, f]) => !f.optional), ...entries.filter(([, f]) => f.optional)];
			const lines = ordered.map(([key, f]) => {
				const id = pyField(key);
				const type = typeToPy(f.type);
				if (typed) return `    ${id}: ${f.optional ? `NotRequired[${type}]` : type}`;
				return f.optional ? `    ${id}: Optional[${type.startsWith('Optional[') ? type.slice(9, -1) : type}] = None` : `    ${id}: ${type}`;
			});
			return `${head}\n${lines.length ? lines.join('\n') : '    pass'}`;
		})
		.join('\n\n\n');
	const header = typed
		? 'from typing import Any, List, Optional, TypedDict, Union\nfrom typing_extensions import NotRequired'
		: 'from dataclasses import dataclass\nfrom typing import Any, List, Optional, Union';
	return `${header}\n\n\n${body}`;
}

export function generateCode(value: unknown, language: CodeLanguage, rootName = 'Root'): string {
	const root = inferType(value, rootName);
	let target: JType = root;
	// A top-level array: generate types for its element, and say so in a wrapper-free way.
	while (target.kind === 'array') target = target.item;
	const objs = collectObjects(target);
	if (objs.length === 0) {
		// Primitive root — emit a trivial alias.
		if (language === 'typescript') return `export type ${pascalCase(rootName)} = ${typeToTs(root)};`;
		return `// Root value is not an object (${root.kind}); nothing to generate.`;
	}
	// `collectObjects` yields children first; the root object is last.
	switch (language) {
		case 'typescript':
			return genTs(objs);
		case 'go':
			return genGo(objs);
		case 'java':
			return genJava(objs);
		case 'csharp':
			return genCs(objs);
		case 'python-dataclass':
			return genPy(objs, false);
		case 'python-typeddict':
			return genPy(objs, true);
	}
}

/* ------------------------------------------------------------------ JSON Schema inference */

function schemaFromType(t: JType): Record<string, unknown> {
	switch (t.kind) {
		case 'null':
			return { type: 'null' };
		case 'string':
			return { type: 'string' };
		case 'int':
			return { type: 'integer' };
		case 'float':
			return { type: 'number' };
		case 'bool':
			return { type: 'boolean' };
		case 'any':
			return {};
		case 'array':
			return { type: 'array', items: schemaFromType(t.item) };
		case 'object': {
			const properties: Record<string, unknown> = {};
			const required: string[] = [];
			for (const [key, f] of t.fields) {
				properties[key] = schemaFromType(f.type);
				if (!f.optional) required.push(key);
			}
			const schema: Record<string, unknown> = { type: 'object', properties };
			if (required.length) schema.required = required;
			return schema;
		}
		case 'union': {
			const schemas = t.members.map(schemaFromType);
			if (schemas.every((s) => typeof s.type === 'string' && Object.keys(s).length === 1)) {
				return { type: schemas.map((s) => s.type as string) };
			}
			return { anyOf: schemas };
		}
	}
}

export function inferJsonSchema(value: unknown): Record<string, unknown> {
	return { $schema: 'http://json-schema.org/draft-07/schema#', ...schemaFromType(inferType(value, 'Root')) };
}

/* ------------------------------------------------------------------ JSONPath subset */

export interface PathMatch {
	path: string;
	value: unknown;
}

type Segment =
	| { type: 'child'; name: string }
	| { type: 'index'; index: number }
	| { type: 'wildcard' }
	| { type: 'union'; items: Array<string | number> }
	| { type: 'slice'; start?: number; end?: number; step?: number }
	| { type: 'filter'; expr: string }
	| { type: 'descend' };

export class JsonPathError extends Error {}

function parseSegments(path: string): Segment[] {
	let i = 0;
	const s = path.trim();
	if (s[0] !== '$') throw new JsonPathError('Path must start with $');
	i = 1;
	const segs: Segment[] = [];
	while (i < s.length) {
		if (s[i] === '.') {
			if (s[i + 1] === '.') {
				segs.push({ type: 'descend' });
				i += 2;
				if (s[i] === '[') continue;
			} else i += 1;
			if (s[i] === '*') {
				segs.push({ type: 'wildcard' });
				i++;
				continue;
			}
			const m = /^[^.[\s]+/.exec(s.slice(i));
			if (!m) throw new JsonPathError(`Unexpected character at ${i}`);
			segs.push({ type: 'child', name: m[0] });
			i += m[0].length;
		} else if (s[i] === '[') {
			let depth = 0;
			let j = i;
			let quote = '';
			for (; j < s.length; j++) {
				const c = s[j];
				if (quote) {
					if (c === '\\') j++;
					else if (c === quote) quote = '';
				} else if (c === '"' || c === "'") quote = c;
				else if (c === '[') depth++;
				else if (c === ']' && --depth === 0) break;
			}
			if (j >= s.length) throw new JsonPathError('Unclosed [');
			const inner = s.slice(i + 1, j).trim();
			i = j + 1;
			if (inner === '*') segs.push({ type: 'wildcard' });
			else if (inner.startsWith('?')) segs.push({ type: 'filter', expr: inner.replace(/^\?\s*\(?/, '').replace(/\)\s*$/, '') });
			else if (/^-?\d+$/.test(inner)) segs.push({ type: 'index', index: Number(inner) });
			else if (/^(-?\d*):(-?\d*)(?::(-?\d*))?$/.test(inner)) {
				const [a, b, c] = inner.split(':');
				segs.push({ type: 'slice', start: a ? Number(a) : undefined, end: b ? Number(b) : undefined, step: c ? Number(c) : undefined });
			} else {
				const items = splitTopLevel(inner).map((part) => {
					const p = part.trim();
					if (/^-?\d+$/.test(p)) return Number(p);
					const q = /^(['"])(.*)\1$/.exec(p);
					if (!q) throw new JsonPathError(`Bad subscript: ${p}`);
					return q[2].replace(/\\(['"\\])/g, '$1');
				});
				if (items.length === 1 && typeof items[0] === 'string') segs.push({ type: 'child', name: items[0] });
				else segs.push({ type: 'union', items });
			}
		} else throw new JsonPathError(`Unexpected character "${s[i]}" at ${i}`);
	}
	return segs;
}

function splitTopLevel(inner: string): string[] {
	const out: string[] = [];
	let cur = '';
	let quote = '';
	for (let i = 0; i < inner.length; i++) {
		const c = inner[i];
		if (quote) {
			cur += c;
			if (c === '\\') cur += inner[++i] ?? '';
			else if (c === quote) quote = '';
		} else if (c === '"' || c === "'") {
			quote = c;
			cur += c;
		} else if (c === ',') {
			out.push(cur);
			cur = '';
		} else cur += c;
	}
	out.push(cur);
	return out;
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
	return v !== null && typeof v === 'object';
}

function children(v: unknown): Array<[string | number, unknown]> {
	if (Array.isArray(v)) return v.map((x, i) => [i, x]);
	if (isContainer(v)) return Object.entries(v);
	return [];
}

function descendants(v: unknown, path: string, out: PathMatch[]) {
	out.push({ path, value: v });
	for (const [k, c] of children(v)) descendants(c, appendPath(path, k), out);
}

function appendPath(path: string, key: string | number): string {
	if (typeof key === 'number') return `${path}[${key}]`;
	return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function evalOperand(token: string, current: unknown): { ok: boolean; value: unknown } {
	const t = token.trim();
	if (t.startsWith('@')) {
		const res = queryJsonPath(current, '$' + t.slice(1), true);
		return res.length ? { ok: true, value: res[0].value } : { ok: false, value: undefined };
	}
	if (/^(['"])(.*)\1$/.test(t)) return { ok: true, value: t.slice(1, -1) };
	if (t === 'true') return { ok: true, value: true };
	if (t === 'false') return { ok: true, value: false };
	if (t === 'null') return { ok: true, value: null };
	const n = Number(t);
	if (t !== '' && !Number.isNaN(n)) return { ok: true, value: n };
	throw new JsonPathError(`Bad filter operand: ${t}`);
}

function evalFilter(expr: string, current: unknown): boolean {
	const orParts = expr.split('||');
	return orParts.some((orPart) =>
		orPart.split('&&').every((term) => {
			const m = /^\s*(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+?)\s*$/.exec(term);
			if (!m) return evalOperand(term, current).ok;
			const left = evalOperand(m[1], current);
			const right = evalOperand(m[3], current);
			if (!left.ok || !right.ok) return false;
			switch (m[2]) {
				case '==':
					return left.value === right.value;
				case '!=':
					return left.value !== right.value;
				case '<':
					return (left.value as number) < (right.value as number);
				case '<=':
					return (left.value as number) <= (right.value as number);
				case '>':
					return (left.value as number) > (right.value as number);
				default:
					return (left.value as number) >= (right.value as number);
			}
		}),
	);
}

// Supports: $ . .name ['name'] [0] [-1] [*] .* .. (recursive descent) [0,1] ['a','b'] [1:3] [?(@.x > 1)]
export function queryJsonPath(root: unknown, path: string, _internal = false): PathMatch[] {
	const segs = parseSegments(path);
	let current: PathMatch[] = [{ path: '$', value: root }];
	for (let idx = 0; idx < segs.length; idx++) {
		const seg = segs[idx];
		const next: PathMatch[] = [];
		if (seg.type === 'descend') {
			const all: PathMatch[] = [];
			for (const m of current) descendants(m.value, m.path, all);
			current = all;
			continue;
		}
		for (const m of current) {
			const v = m.value;
			switch (seg.type) {
				case 'child':
					if (isContainer(v) && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, seg.name)) {
						next.push({ path: appendPath(m.path, seg.name), value: (v as Record<string, unknown>)[seg.name] });
					}
					break;
				case 'index':
					if (Array.isArray(v)) {
						const i = seg.index < 0 ? v.length + seg.index : seg.index;
						if (i >= 0 && i < v.length) next.push({ path: appendPath(m.path, i), value: v[i] });
					}
					break;
				case 'wildcard':
					for (const [k, c] of children(v)) next.push({ path: appendPath(m.path, k), value: c });
					break;
				case 'union':
					for (const item of seg.items) {
						if (typeof item === 'number' && Array.isArray(v)) {
							const i = item < 0 ? v.length + item : item;
							if (i >= 0 && i < v.length) next.push({ path: appendPath(m.path, i), value: v[i] });
						} else if (typeof item === 'string' && isContainer(v) && !Array.isArray(v) && item in v) {
							next.push({ path: appendPath(m.path, item), value: (v as Record<string, unknown>)[item] });
						}
					}
					break;
				case 'slice':
					if (Array.isArray(v)) {
						const len = v.length;
						const step = seg.step || 1;
						const norm = (n: number | undefined, d: number) => (n === undefined ? d : n < 0 ? Math.max(len + n, 0) : Math.min(n, len));
						for (let i = norm(seg.start, 0); i < norm(seg.end, len); i += step) next.push({ path: appendPath(m.path, i), value: v[i] });
					}
					break;
				case 'filter':
					for (const [k, c] of children(v)) {
						if (isContainer(c) && evalFilter(seg.expr, c)) next.push({ path: appendPath(m.path, k), value: c });
					}
					break;
			}
		}
		current = next;
	}
	// A recursive descent that was never followed by another selector selects every node itself.
	return current;
}
