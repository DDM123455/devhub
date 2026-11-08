import type { Column, Dialect, Diagnostic } from "./model";
import { isMysql } from "./dialects";
export function javaType(sql: string): string {
  const t = sql.toUpperCase();
  if (["NUMBER", "DEC", "INTEGER"].includes(t) && t !== "INTEGER")
    return "BigDecimal";
  if (t === "RAW") return "byte[]";
  if (["CLOB", "NCLOB"].includes(t)) return "String";
  if (t === "BINARY_FLOAT") return "Float";
  if (t === "BINARY_DOUBLE") return "Double";
  if (t === "UNIQUEIDENTIFIER") return "UUID";
  if (t === "BIT") return "Boolean";
  if (t === "DATETIMEOFFSET") return "OffsetDateTime";
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
  if (d === "oracle") {
    const specific: Record<string, string> = {
      String: "CLOB",
      Long: "NUMBER(19,0)",
      long: "NUMBER(19,0)",
      Integer: "NUMBER(10,0)",
      int: "NUMBER(10,0)",
      Short: "NUMBER(5,0)",
      short: "NUMBER(5,0)",
      Byte: "NUMBER(3,0)",
      byte: "NUMBER(3,0)",
      Boolean: "NUMBER(1,0)",
      boolean: "NUMBER(1,0)",
      BigDecimal: "NUMBER",
      Float: "BINARY_FLOAT",
      float: "BINARY_FLOAT",
      Double: "BINARY_DOUBLE",
      double: "BINARY_DOUBLE",
      UUID: "VARCHAR2(36 CHAR)",
      LocalDate: "DATE",
      LocalDateTime: "TIMESTAMP",
      OffsetDateTime: "TIMESTAMP WITH TIME ZONE",
      Instant: "TIMESTAMP WITH TIME ZONE",
      "byte[]": "BLOB",
    };
    type = specific[c.javaType];
    if (c.javaType === "LocalTime" || c.javaType === "OffsetTime") {
      diags.push({ severity: "error", code: "oracleTime", detail: c.name });
      return "TIMESTAMP";
    }
    if (["Boolean", "boolean", "UUID", "LocalDate"].includes(c.javaType))
      diags.push({
        severity: "warning",
        code: "oracleSemantics",
        detail: c.name + ": " + c.javaType,
      });
    if (c.sqlType === "RAW" && c.length !== undefined)
      type = `RAW(${c.length})`;
    if (c.sqlType === "DATE" && c.javaType === "LocalDateTime") type = "DATE";
    if (c.sqlType === "NCLOB" && c.javaType === "String") type = "NCLOB";
    if (c.sqlType === "FLOAT" && c.javaType === "BigDecimal")
      type =
        c.unknown.binaryPrecision === undefined
          ? "FLOAT"
          : `FLOAT(${Number(c.unknown.binaryPrecision)})`;
    if (
      ["INTEGER", "INT", "SMALLINT"].includes(c.sqlType) &&
      c.javaType === "BigDecimal"
    )
      type = "NUMBER(38,0)";
    if (
      c.sqlType === "TIMESTAMP WITH LOCAL TIME ZONE" &&
      c.javaType === "LocalDateTime"
    )
      type = c.sqlType;
    if (
      ["NUMBER", "DECIMAL", "DEC", "NUMERIC"].includes(c.sqlType) &&
      c.precision !== undefined &&
      ["BigDecimal", "Integer", "Long"].includes(c.javaType)
    )
      type = `NUMBER(${c.precision},${c.scale ?? 0})`;
    if (
      c.sqlType.startsWith("TIMESTAMP") &&
      c.unknown.temporalPrecision !== undefined &&
      /^\d$/.test(String(c.unknown.temporalPrecision))
    )
      type = type.replace(
        "TIMESTAMP",
        `TIMESTAMP(${c.unknown.temporalPrecision})`,
      );
  }
  if (d === "sqlserver") {
    const specific: Record<string, string> = {
      String: "NVARCHAR(MAX)",
      UUID: "UNIQUEIDENTIFIER",
      Boolean: "BIT",
      boolean: "BIT",
      LocalDateTime: "DATETIME2",
      OffsetDateTime: "DATETIMEOFFSET",
      Instant: "DATETIMEOFFSET",
      "byte[]": "VARBINARY(MAX)",
      Double: "FLOAT",
      double: "FLOAT",
    };
    type = specific[c.javaType] ?? type;
  }
  if (d === "sqlite") {
    if (
      [
        "Long",
        "Integer",
        "Short",
        "Byte",
        "long",
        "int",
        "short",
        "byte",
        "Boolean",
        "boolean",
      ].includes(c.javaType)
    )
      type = "INTEGER";
    if (
      [
        "LocalDate",
        "LocalDateTime",
        "OffsetDateTime",
        "Instant",
        "LocalTime",
        "OffsetTime",
        "UUID",
        "String",
      ].includes(c.javaType)
    )
      type = "TEXT";
    if (c.javaType === "byte[]") type = "BLOB";
    if (
      [
        "BigDecimal",
        "LocalDate",
        "LocalDateTime",
        "OffsetDateTime",
        "Instant",
        "Boolean",
        "boolean",
      ].includes(c.javaType)
    )
      diags.push({
        severity: "warning",
        code: "sqliteAffinity",
        detail: c.name,
      });
  }
  if (c.javaType === "String" && c.length !== undefined)
    type =
      d === "oracle"
        ? ["NVARCHAR2", "NCHAR"].includes(c.sqlType)
          ? `${c.sqlType}(${c.length})`
          : `${c.sqlType === "CHAR" ? "CHAR" : "VARCHAR2"}(${c.length} ${c.unknown.lengthSemantics === "BYTE" ? "BYTE" : "CHAR"})`
        : d === "sqlserver"
          ? `NVARCHAR(${c.length})`
          : d === "sqlite"
            ? "TEXT"
            : `VARCHAR(${c.length})`;
  if (c.javaType === "BigDecimal" && c.precision !== undefined)
    type = `${d === "oracle" ? "NUMBER" : "DECIMAL"}(${c.precision},${c.scale ?? 0})`;
  if (/JSON/.test(same))
    type =
      d === "postgresql"
        ? same === "JSONB"
          ? "JSONB"
          : "JSON"
        : isMysql(d)
          ? "JSON"
          : d === "sqlserver"
            ? "NVARCHAR(MAX)"
            : d === "oracle"
              ? "CLOB"
              : "TEXT";
  if (
    isMysql(d) &&
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
