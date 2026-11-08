import { describe, it, expect } from "vitest";
import { parseSql } from "../schema-java/sql-parser";
import { parseJava } from "../schema-java/java-parser";
import { generate } from "../schema-java/generate";
import { defaults, MAX_INPUT } from "../schema-java/model";
import {readMetadata} from '../schema-java/metadata';
describe("schema Java conversion", () => {
 it('sidecar round trip preserves complete supported metadata',()=>{const m=parseSql("CREATE TABLE t (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, value NUMERIC(8,2) NOT NULL DEFAULT 4); COMMENT ON TABLE t IS 'User data';",'postgresql');const restored=readMetadata(JSON.stringify(m));expect(restored.tables).toEqual(m.tables);expect(generate(restored,'sql',defaults).files[0].content).toContain("COMMENT ON TABLE");});
 it('invalid sidecar names cannot inject Java statements or paths',()=>{const m=parseSql('CREATE TABLE t (id INT PRIMARY KEY);','mysql');m.tables[0].columns[0].javaName='id; evil()';expect(()=>readMetadata(JSON.stringify(m))).toThrow();});
 it('UpdateRequest mapper requires explicit null semantics',()=>{const m=parseSql('CREATE TABLE t (id BIGINT PRIMARY KEY, value TEXT);','mysql');expect(generate(m,'dto',{...defaults,mapper:true,dtoKind:'UpdateRequest'}).files).toHaveLength(0);const r=generate(m,'dto',{...defaults,mapper:true,dtoKind:'UpdateRequest',nullPolicy:'ignore'});expect(r.files).toHaveLength(2);expect(r.files[1].content).toContain('!= null');});
 it('relationships are generated only for actual FK metadata',()=>{const m=parseSql('CREATE TABLE parent (id BIGINT PRIMARY KEY); CREATE TABLE child (id BIGINT PRIMARY KEY, parent_id BIGINT, other_id BIGINT, FOREIGN KEY(parent_id) REFERENCES parent(id));','mysql');const r=generate(m,'entity',{...defaults,relationships:true});expect(r.files[1].content.match(/@ManyToOne/g)).toHaveLength(1);expect(r.files[1].content).toContain('insertable = false');});
 it('XSS-like identifiers and comment terminators remain data',()=>{const m=parseSql('CREATE TABLE "<script>" (id INT PRIMARY KEY, "x</textarea>" TEXT);','postgresql');m.tables[0].comment='*/ public class Evil {} /*';const r=generate(m,'dto',defaults);expect(r.files[0].path).not.toContain('<');expect(r.files[0].content).toContain('* / public');});
 it('cross dialect warns about nonportable defaults and timezone',()=>{const m=parseSql('CREATE TABLE t (id BIGINT PRIMARY KEY, time_stamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);','postgresql');const r=generate(m,'sql',{...defaults,dialect:'mysql'});expect(r.diagnostics.map(d=>d.code)).toContain('timezoneLoss');expect(r.diagnostics.map(d=>d.code)).toContain('expressionLoss');});
  it("PostgreSQL identity and timezone retain meaning", () => {
    const m = parseSql(
      "CREATE TABLE t (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, created_at TIMESTAMP WITH TIME ZONE);",
      "postgresql",
    );
    expect(m.tables.length, JSON.stringify(m.diagnostics)).toBe(1);
    expect(m.tables[0].columns[0].identity).toBe(true);
    expect(m.tables[0].columns[1].javaType).toBe("OffsetDateTime");
    expect(generate(m, "sql", defaults).files[0].content).toContain(
      "GENERATED ALWAYS AS IDENTITY",
    );
  });
  it("comments, check, index and generated expression survive supported round-trip", () => {
    const m = parseSql(
      "CREATE TABLE t (id BIGINT PRIMARY KEY, n INT GENERATED ALWAYS AS (id + 1) STORED, label VARCHAR(50) COMMENT 'Hello, world', CHECK(id > 0), KEY ix(label));",
      "mysql",
    );
    expect(m.tables[0].columns[2].comment).toBe("Hello, world");
    expect(m.tables[0].columns[1].generated).toBeTruthy();
    expect(m.tables[0].constraints.map((x) => x.kind)).toContain("check");
    const r = generate(m, "sql", { ...defaults, dialect: "mysql" });
    expect(r.files.length, JSON.stringify(r.diagnostics)).toBe(1);
    expect(parseSql(r.files[0].content, "mysql").diagnostics).toEqual([]);
  });
  it("PostgreSQL COMMENT and INDEX statements attach to the correct object", () => {
    const m = parseSql(
      "CREATE TABLE t (id INT PRIMARY KEY, name TEXT); COMMENT ON COLUMN t.name IS 'A name'; CREATE INDEX ix ON t(name);",
      "postgresql",
    );
    expect(m.diagnostics).toEqual([]);
    expect(m.tables[0].columns[1].comment).toBe("A name");
    expect(m.tables[0].constraints[0].kind).toBe("index");
  });
  for (const dialect of ["postgresql", "mysql"] as const) {
    it(
      dialect + " DDL retains decimal, nullable, keys, commas and defaults",
      () => {
        const m = parseSql(
          "CREATE TABLE users (id BIGINT PRIMARY KEY, total DECIMAL(12,2) NOT NULL DEFAULT 0, name VARCHAR(80) DEFAULT 'a,b', UNIQUE (name));",
          dialect,
        );
        expect(m.diagnostics).toEqual([]);
        expect(m.tables[0].columns[1]).toMatchObject({
          javaType: "BigDecimal",
          precision: 12,
          scale: 2,
          nullable: false,
        });
        expect(m.tables[0].columns[2].default).toContain("a,b");
        for (const kind of [
          "entity",
          "dto",
          "record",
          "projection",
          "sql",
        ] as const) {
          const r = generate(m, kind, { ...defaults, dialect });
          expect(r.files.length, JSON.stringify(r.diagnostics)).toBe(1);
        }
      },
    );
    it(dialect + " composite key and foreign key", () => {
      const m = parseSql(
        "CREATE TABLE item (tenant_id BIGINT, item_id BIGINT, PRIMARY KEY(tenant_id,item_id), FOREIGN KEY(tenant_id) REFERENCES tenant(id));",
        dialect,
      );
      expect(m.tables[0].columns.every((c) => c.primaryKey)).toBe(true);
      expect(generate(m, "entity", defaults).files[0].content).toContain(
        "@IdClass",
      );
      expect(m.tables[0].constraints.some((c) => c.kind === "foreign")).toBe(
        true,
      );
    });
    it(dialect + " schema round-trip", () => {
      const m = parseSql(
        "CREATE TABLE item (id BIGINT PRIMARY KEY, name VARCHAR(42), amount DECIMAL(10,3));",
        dialect,
      );
      const sql = generate(m, "sql", { ...defaults, dialect });
      const again = parseSql(sql.files[0].content, dialect);
      expect(again.diagnostics).toEqual([]);
      expect(
        again.tables[0].columns.map((c) => [
          c.name,
          c.javaType,
          c.nullable,
          c.primaryKey,
          c.length,
          c.precision,
          c.scale,
        ]),
      ).toEqual(
        m.tables[0].columns.map((c) => [
          c.name,
          c.javaType,
          c.nullable,
          c.primaryKey,
          c.length,
          c.precision,
          c.scale,
        ]),
      );
    });
  }
  it("Java record parses qualified types and flags missing metadata", () => {
    const m = parseJava(
      "package demo; public record Customer(Long id, String name, java.math.BigDecimal total) {}",
      "postgresql",
    );
    expect(m.tables.length, JSON.stringify(m.diagnostics)).toBe(1);
    expect(m.tables[0].columns.map((c) => c.javaType)).toEqual([
      "Long",
      "String",
      "BigDecimal",
    ]);
    expect(generate(m, "entity", defaults).files).toEqual([]);
    expect(generate(m, "sql", defaults).files[0].content).toContain("TEXT");
  });
  it("generated entity can be read back including columns", () => {
    const original = parseSql(
      "CREATE TABLE customers (id BIGINT PRIMARY KEY, name VARCHAR(40) NOT NULL);",
      "postgresql",
    );
    const java = generate(original, "entity", defaults).files[0].content;
    const m = parseJava(java, "postgresql");
    expect(m.tables.length, java + JSON.stringify(m.diagnostics)).toBe(1);
    expect(m.tables[0].columns).toHaveLength(2);
    expect(m.tables[0].columns[1]).toMatchObject({
      length: 40,
      nullable: false,
    });
  });
  it("select aliases resolve schema and unknown types are visible", () => {
    const schema = parseSql(
      "CREATE TABLE users (id BIGINT PRIMARY KEY);",
      "postgresql",
    );
    const m = parseSql(
      "SELECT u.id AS user_id, count(*) AS total FROM users u GROUP BY u.id",
      "postgresql",
      schema,
    );
    expect(m.tables[0].columns.map((c) => c.javaType)).toEqual([
      "Long",
      "Long",
    ]);
    expect(m.diagnostics.some((d) => d.code === "alias")).toBe(true);
  });
  it("blocks bad SQL, unsupported statements, oversized input", () => {
    expect(parseSql("CREATE TABLE", "postgresql").diagnostics[0].severity).toBe(
      "error",
    );
    expect(parseSql("DROP TABLE users", "mysql").diagnostics[0].severity).toBe(
      "error",
    );
    expect(() => parseSql("x".repeat(MAX_INPUT + 1), "mysql")).toThrow(
      "tooLarge",
    );
  });
  it("sanitizes reserved names/collisions and blocks unsafe package", () => {
    const m = parseSql(
      'CREATE TABLE "order" ("class" INT PRIMARY KEY, "user-id" TEXT, "user_id" TEXT);',
      "postgresql",
    );
    expect(m.tables[0].columns.map((c) => c.javaName)).toEqual([
      "class_",
      "userId",
      "userId2",
    ]);
    expect(
      generate(m, "dto", { ...defaults, packageName: "../../bad" }).files,
    ).toEqual([]);
  });
  it("enforces Java version and avoids Lombok on records", () => {
    const m = parseSql("CREATE TABLE x (id BIGINT PRIMARY KEY);", "mysql");
    expect(
      generate(m, "record", { ...defaults, javaVersion: 11 }).files,
    ).toEqual([]);
    expect(
      generate(m, "record", { ...defaults, lombok: true }).files[0].content,
    ).not.toContain("lombok");
    expect(
      generate(m, "entity", { ...defaults, lombok: true }).files[0].content,
    ).not.toContain("@Data");
  });
  it("does not treat NotNull as database metadata", () => {
    const m = parseJava(
      "public class A { @NotNull private String value; }",
      "mysql",
    );
    expect(m.tables[0].columns[0].nullable).toBeNull();
    expect(m.diagnostics.some((d) => d.code === "validationNotSchema")).toBe(
      true,
    );
  });
  it("partial update has no required validation and sensitive data excluded", () => {
    const m = parseSql(
      "CREATE TABLE users (id BIGINT PRIMARY KEY, password TEXT NOT NULL);",
      "postgresql",
    );
    const r = generate(m, "dto", {
      ...defaults,
      dtoKind: "UpdateRequest",
      validation: true,
    });
    expect(r.files[0].content).not.toContain("@NotNull");
    expect(r.files[0].content).not.toContain("password");
  });
});
