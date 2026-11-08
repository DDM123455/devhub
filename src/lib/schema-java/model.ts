export type { Dialect } from "./dialects";
import type { Dialect } from "./dialects";
export type Origin = "input" | "user" | "inferred";
export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  detail?: string;
  line?: number;
  column?: number;
}
export interface Column {
  name: string;
  javaName: string;
  sqlType: string;
  javaType: string;
  nullable: boolean | null;
  length?: number;
  precision?: number;
  scale?: number;
  default?: string;
  identity?: boolean;
  generated?: string;
  primaryKey: boolean;
  selected: boolean;
  comment?: string;
  origin: Record<string, Origin>;
  unknown: Record<string, unknown>;
}
export interface Constraint {
  kind: "primary" | "unique" | "foreign" | "check" | "index";
  name?: string;
  columns: string[];
  expression?: string;
  reference?: {
    schema?: string;
    table: string;
    columns: string[];
    actions?: string;
  };
}
export interface Table {
  name: string;
  schema?: string;
  className: string;
  columns: Column[];
  constraints: Constraint[];
  comment?: string;
  source?: string;
  unknown: Record<string, unknown>;
}
export interface Model {
  version: 1;
  dialect: Dialect;
  tables: Table[];
  diagnostics: Diagnostic[];
}
export type Output = "entity" | "dto" | "record" | "projection" | "sql";
export interface Options {
  dialect: Dialect;
  packageName: string;
  javaVersion: number;
  namespace: "jakarta" | "javax";
  prefix: string;
  className: string;
  lombok: boolean;
  noArgs: boolean;
  allArgs: boolean;
  accessors: boolean;
  builder: boolean;
  serializable: boolean;
  validation: boolean;
  primitives: boolean;
  relationships: boolean;
  dtoKind: "DTO" | "CreateRequest" | "UpdateRequest" | "Response";
  includeId: boolean;
  includeAudit: boolean;
  includeSensitive: boolean;
  typeOverrides: Record<string, string>;
  mapper: boolean;
  nullPolicy: "choose" | "ignore" | "overwrite";
}
export const defaults: Options = {
  dialect: "postgresql",
  packageName: "com.example.model",
  javaVersion: 17,
  namespace: "jakarta",
  prefix: "",
  className: "",
  lombok: false,
  noArgs: true,
  allArgs: false,
  accessors: true,
  builder: false,
  serializable: false,
  validation: false,
  primitives: false,
  relationships: false,
  dtoKind: "DTO",
  includeId: true,
  includeAudit: true,
  includeSensitive: false,
  typeOverrides: {},
  mapper: false,
  nullPolicy: "choose",
};
export interface GeneratedFile {
  path: string;
  content: string;
}
export interface Result {
  files: GeneratedFile[];
  diagnostics: Diagnostic[];
}
const reserved = new Set(
  "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null record sealed permits var yield Object String Integer Long Boolean Double Float Short Byte Character BigDecimal UUID LocalDate LocalDateTime OffsetDateTime Instant".split(
    " ",
  ),
);
export function identifier(value: string, upper = false): string {
  const parts = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let result =
    parts
      .map((p, i) =>
        i || upper
          ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
          : p.toLowerCase(),
      )
      .join("") || (upper ? "Model" : "field");
  if (/^\d/.test(result)) result = "_" + result;
  if (reserved.has(result)) result += "_";
  return result;
}
export function assignNames(table: Table): void {
  const used = new Set<string>();
  for (const c of table.columns) {
    let n = c.javaName || identifier(c.name);
    const base = n;
    let i = 2;
    while (used.has(n)) n = base + i++;
    c.javaName = n;
    used.add(n);
  }
}
export function safePackage(value: string): boolean {
  return (
    value === "" ||
    value
      .split(".")
      .every((p) => /^[a-zA-Z_$][\w$]*$/.test(p) && !reserved.has(p))
  );
}
export const MAX_INPUT = 200_000;
export function checkInput(text: string): void {
  if (!text.trim()) throw new Error("empty");
  if (text.length > MAX_INPUT) throw new Error("tooLarge");
}
