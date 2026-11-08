import { javaType } from "./types";
import type { Model, Diagnostic } from "./model";
import { safePackage } from './model';
/** Validate user-edited metadata at the worker boundary before code generation. */
export function validateModel(m: Model): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const fail = (detail: string) =>
    errors.push({ severity: "error", code: "invalidMetadata", detail });
  const seen = new Set<string>();
  for (const t of m.tables) {
    const key = (t.schema ?? "") + "." + t.name;
    if (seen.has(key) || !t.name) fail(key);
    seen.add(key);
    const names = new Set<string>();
    const javaNames = new Set<string>();
    for (const c of t.columns) {
      if (!c.name || names.has(c.name)) fail(t.name + "." + c.name);
      names.add(c.name);
      if(!/^[A-Za-z_$][\w$]*$/.test(c.javaName)||!safePackage(c.javaName)||javaNames.has(c.javaName))fail(c.name+': Java name');
      javaNames.add(c.javaName);
      for (const k of ["length", "precision", "scale"] as const) {
        const n = c[k];
        if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 1_000_000))
          fail(c.name + ": " + k);
      }
      if (
        c.precision !== undefined &&
        (c.precision < 1 || (c.scale ?? 0) > c.precision)
      )
        fail(c.name + ": precision/scale");
      if (c.length === 0) fail(c.name + ": length");
      if (c.origin.sqlType === "user" && c.origin.javaType !== 'user') c.javaType = javaType(c.sqlType);
    }
    for (const constraint of t.constraints)
      for (const col of constraint.columns)
        if (!names.has(col)) fail(t.name + ": " + col);
  }
  return errors;
}
