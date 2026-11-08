import type { Column, Dialect, Diagnostic } from "./model";
export function javaType(sql: string): string {
  const t = sql.toUpperCase();
  if (/^(BIGINT|BIGSERIAL)/.test(t)) return "Long";
  if (/^(SMALLINT|SMALLSERIAL|TINYINT)/.test(t)) return "Short";
  if (/^(INT|INTEGER|SERIAL|MEDIUMINT)/.test(t)) return "Integer";
  if (/^(DECIMAL|NUMERIC|MONEY)/.test(t)) return "BigDecimal";
  if (/^(DOUBLE)/.test(t)) return "Double";
  if (/^(REAL|FLOAT)/.test(t)) return "Float";
  if (/^(BOOL|BOOLEAN)/.test(t)) return "Boolean";
  if (t === "UUID") return "UUID";
  if (/TIMESTAMP/.test(t) && /WITH TIME ZONE|TIMESTAMPTZ/.test(t))
    return "OffsetDateTime";
  if (/^(TIMESTAMP|DATETIME)/.test(t)) return "LocalDateTime";
  if (t === "DATE") return "LocalDate";
  if (/^TIME/.test(t))
    return /WITH TIME ZONE|TIMETZ/.test(t) ? "OffsetTime" : "LocalTime";
  if (/^(BYTEA|BLOB|BINARY|VARBINARY)/.test(t)) return "byte[]";
  if (/CHAR|TEXT|JSON|ENUM/.test(t)) return "String";
  return "Object";
}
export function sqlType(c: Column, d: Dialect, diags: Diagnostic[]): string {
  const same = c.sqlType.toUpperCase();
  const types: Record<string, string> = {
    Long: "BIGINT",
    long: "BIGINT",
    Integer: "INTEGER",
    int: "INTEGER",
    Short: "SMALLINT",
    short: "SMALLINT",
    Byte: "SMALLINT",
    byte: "SMALLINT",
    Boolean: "BOOLEAN",
    boolean: "BOOLEAN",
    Float: "REAL",
    float: "REAL",
    Double: "DOUBLE PRECISION",
    double: "DOUBLE PRECISION",
    BigDecimal: "DECIMAL",
    String: "TEXT",
    UUID: d === "postgresql" ? "UUID" : "CHAR(36)",
    LocalDate: "DATE",
    LocalDateTime: d === "postgresql" ? "TIMESTAMP" : "DATETIME",
    OffsetDateTime:
      d === "postgresql" ? "TIMESTAMP WITH TIME ZONE" : "DATETIME",
    Instant: d === "postgresql" ? "TIMESTAMP WITH TIME ZONE" : "TIMESTAMP",
    LocalTime: "TIME",
    OffsetTime: d === "postgresql" ? "TIME WITH TIME ZONE" : "TIME",
    "byte[]": d === "postgresql" ? "BYTEA" : "BLOB",
  };
  let type = types[c.javaType];
  if (c.javaType === "String" && c.length !== undefined)
    type = `VARCHAR(${c.length})`;
  if (c.javaType === "BigDecimal" && c.precision !== undefined)
    type = `DECIMAL(${c.precision},${c.scale ?? 0})`;
  if (/JSON/.test(same))
    type = d === "postgresql" ? (same === "JSONB" ? "JSONB" : "JSON") : "JSON";
  if (
    d === "mysql" &&
    ["OffsetDateTime", "OffsetTime", "Instant"].includes(c.javaType)
  )
    diags.push({ severity: "warning", code: "timezoneLoss", detail: c.name });
  if (!type) {
    diags.push({
      severity: "error",
      code: "unknownType",
      detail: c.name + ": " + c.javaType,
    });
    return "TEXT";
  }
  return type;
}
export const imports: Record<string, string> = {
  BigDecimal: "java.math.BigDecimal",
  UUID: "java.util.UUID",
  LocalDate: "java.time.LocalDate",
  LocalDateTime: "java.time.LocalDateTime",
  OffsetDateTime: "java.time.OffsetDateTime",
  Instant: "java.time.Instant",
  LocalTime: "java.time.LocalTime",
  OffsetTime: "java.time.OffsetTime",
};
