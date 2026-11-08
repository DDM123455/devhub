import { MAX_INPUT, type Model } from "./model";
import { validateModel } from "./validate";
import { isDialect } from "./dialects";
/** Import only our bounded data format, never executable code or ZIP paths. */
export function readMetadata(text: string): Model {
  if (text.length > MAX_INPUT * 10) throw new Error("tooLarge");
  const m = JSON.parse(text) as Model;
  if (
    m.version !== 1 ||
    !isDialect(m.dialect) ||
    !Array.isArray(m.tables) ||
    m.tables.length > 200
  )
    throw new Error("invalidMetadata");
  const str = (x: unknown) => typeof x === "string" && x.length <= MAX_INPUT;
  for (const t of m.tables) {
    if (
      !str(t.name) ||
      !str(t.className) ||
      !Array.isArray(t.columns) ||
      t.columns.length > 1000 ||
      !Array.isArray(t.constraints) ||
      t.constraints.length > 1000
    )
      throw new Error("invalidMetadata");
    if (t.schema !== undefined && !str(t.schema))
      throw new Error("invalidMetadata");
    if (t.comment !== undefined && !str(t.comment))
      throw new Error("invalidMetadata");
    for (const c of t.columns) {
      if (
        !str(c.name) ||
        !str(c.javaName) ||
        !str(c.javaType) ||
        !str(c.sqlType) ||
        ![null, true, false].includes(c.nullable) ||
        typeof c.primaryKey !== "boolean" ||
        typeof c.selected !== "boolean" ||
        !c.origin ||
        typeof c.origin !== "object" ||
        !c.unknown ||
        typeof c.unknown !== "object"
      )
        throw new Error("invalidMetadata");
      for (const k of ["default", "generated", "comment"] as const)
        if (c[k] !== undefined && !str(c[k]))
          throw new Error("invalidMetadata");
    }
    for (const c of t.constraints) {
      if (
        !["primary", "foreign", "check", "unique", "index"].includes(c.kind) ||
        !Array.isArray(c.columns) ||
        !c.columns.every(str)
      )
        throw new Error("invalidMetadata");
      if (c.name !== undefined && !str(c.name))
        throw new Error("invalidMetadata");
      if (c.expression !== undefined && !str(c.expression))
        throw new Error("invalidMetadata");
      if (
        c.reference &&
        (!str(c.reference.table) ||
          !Array.isArray(c.reference.columns) ||
          !c.reference.columns.every(str))
      )
        throw new Error("invalidMetadata");
    }
  }
  m.diagnostics = [{ severity: "warning", code: "metadataImported" }];
  const errors = validateModel(m);
  if (errors.length) throw new Error("invalidMetadata");
  return m;
}
