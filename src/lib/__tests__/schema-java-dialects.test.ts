import { it, expect } from "vitest";
import { parseSql } from "../schema-java/sql-parser";
import { generate } from "../schema-java/generate";
import { defaults } from "../schema-java/model";
it('SQL Server quoted identifiers and identity seed survive SQL output',()=>{const m=parseSql('CREATE TABLE [order] ([id] BIGINT IDENTITY(10,2) PRIMARY KEY, [full name] NVARCHAR(60));','sqlserver');expect(m.tables[0].columns[1].javaName).toBe('fullName');expect(generate(m,'sql',{...defaults,dialect:'sqlserver'}).files[0].content).toContain('IDENTITY(10,2)');});
it('SQLite supports composite keys but rejects autoincrement on a composite key',()=>{const m=parseSql('CREATE TABLE t (a INTEGER, b INTEGER, PRIMARY KEY(a,b));','sqlite');expect(generate(m,'entity',defaults).files[0].content).toContain('@IdClass');m.tables[0].columns[0].identity=true;expect(generate(m,'sql',{...defaults,dialect:'sqlite'}).files).toEqual([]);});
const cases = [
  [
    "mariadb",
    "CREATE TABLE users (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, amount DECIMAL(12,2));",
  ],
  [
    "sqlserver",
    "CREATE TABLE users (id BIGINT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(100) NOT NULL, amount DECIMAL(12,2), created_at DATETIME2, token UNIQUEIDENTIFIER, enabled BIT);",
  ],
  [
    "sqlite",
    "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount NUMERIC(12,2));",
  ],
] as const;
for (const [dialect, input] of cases) {
  it(dialect + " parses native DDL and generates all Java outputs", () => {
    const m = parseSql(input, dialect);
    expect(m.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(m.tables[0].columns[0].identity).toBe(true);
    for (const output of ["entity", "dto", "record", "projection"] as const) {
      const r = generate(m, output, { ...defaults, dialect });
      expect(r.files.length, JSON.stringify(r.diagnostics)).toBe(1);
    }
  });
  it(dialect + " generated SQL parses back with its native adapter", () => {
    const m = parseSql(input, dialect);
    const r = generate(m, "sql", { ...defaults, dialect });
    expect(r.files.length, JSON.stringify(r.diagnostics)).toBe(1);
    const back = parseSql(r.files[0].content, dialect);
    expect(
      back.diagnostics.filter((x) => x.severity === "error"),
      r.files[0].content,
    ).toEqual([]);
    expect(back.tables[0].columns[0].identity).toBe(true);
  });
}
it("SQL Server timestamp is binary, datetimeoffset retains timezone", () => {
  const m = parseSql(
    "CREATE TABLE t (id INT PRIMARY KEY, rv TIMESTAMP, event_at DATETIMEOFFSET);",
    "sqlserver",
  );
  expect(m.tables[0].columns.map((x) => x.javaType)).toEqual([
    "Integer",
    "byte[]",
    "OffsetDateTime",
  ]);
});
it("cross-dialect output uses native identity syntax", () => {
  const m = parseSql(
    "CREATE TABLE t (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, value VARCHAR(80));",
    "postgresql",
  );
  for (const dialect of ["sqlserver", "sqlite", "mariadb"] as const) {
    const r = generate(m, "sql", { ...defaults, dialect });
    expect(r.files.length).toBe(1);
    expect(
      parseSql(r.files[0].content, dialect).diagnostics.filter(
        (x) => x.severity === "error",
      ),
      r.files[0].content,
    ).toEqual([]);
  }
});
