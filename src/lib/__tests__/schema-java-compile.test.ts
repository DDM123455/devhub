import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { parseSql } from "../schema-java/sql-parser";
import { generate } from "../schema-java/generate";
import { defaults } from "../schema-java/model";
const repo = join(homedir(), ".m2/repository");
const jars = [
  "jakarta/persistence/jakarta.persistence-api/3.1.0/jakarta.persistence-api-3.1.0.jar",
  "jakarta/validation/jakarta.validation-api/3.0.2/jakarta.validation-api-3.0.2.jar",
  "org/projectlombok/lombok/1.18.36/lombok-1.18.36.jar",
].map((p) => join(repo, p));
const enabled = process.env.SCHEMA_JAVA_COMPILE === "1";
it.skipIf(!enabled)(
  "compiles generated artifacts against actual Jakarta and Lombok dependencies",
  () => {
    for (const j of jars) expect(existsSync(j), j).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), "schema-java-"));
    try {
      const files: string[] = [];
      const m = parseSql(
        "CREATE TABLE account (tenant_id BIGINT, id BIGINT, amount DECIMAL(12,2) NOT NULL, name VARCHAR(60), PRIMARY KEY(tenant_id,id));",
        "postgresql",
      );
      for (const lombok of [false, true])
        for (const kind of ["entity", "dto", "record", "projection"] as const) {
          const r = generate(m, kind, {
            ...defaults,
            lombok,
            allArgs: true,
            builder: true,
            validation: true,
            serializable: true,
            packageName:
              "test." + (lombok ? "lombok" : "plain") + ".output" + kind,
          });
          expect(r.files.length, JSON.stringify(r.diagnostics)).toBe(1);
          for (const f of r.files) {
            const path = join(dir, f.path);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, f.content);
            files.push(path);
          }
        }
      const relationModel = parseSql(
        "CREATE TABLE parent (id BIGINT PRIMARY KEY); CREATE TABLE child (id BIGINT PRIMARY KEY, parent_id BIGINT, FOREIGN KEY(parent_id) REFERENCES parent(id));",
        "mysql",
      );
      for (const kind of ["entity", "dto"] as const) {
        const r = generate(relationModel, kind, {
          ...defaults,
          relationships: true,
          mapper: kind === "dto",
          dtoKind: "UpdateRequest",
          nullPolicy: "ignore",
          packageName: "test.mappers",
        });
        expect(r.files.length, JSON.stringify(r.diagnostics)).toBe(
          kind === "entity" ? 2 : 4,
        );
        for (const f of r.files) {
          const path = join(dir, f.path);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, f.content);
          files.push(path);
        }
      }
      const oracleModel = parseSql(
        "CREATE TABLE customer (id NUMBER(18) GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name VARCHAR2(100 CHAR), balance NUMBER(12,2), created_at DATE, event_at TIMESTAMP WITH TIME ZONE, payload BLOB);",
        "oracle",
      );
      for (const kind of ["entity", "dto", "record", "projection"] as const) {
        const r = generate(oracleModel, kind, {
          ...defaults,
          packageName: "test.oracle.output" + kind,
        });
        expect(r.files.length, JSON.stringify(r.diagnostics)).toBe(1);
        for (const f of r.files) {
          const path = join(dir, f.path);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, f.content);
          files.push(path);
        }
      }
      execFileSync(
        "javac",
        [
          "-encoding",
          "UTF-8",
          "--release",
          "17",
          "-cp",
          jars.join(process.platform === "win32" ? ";" : ":"),
          "-d",
          join(dir, "classes"),
          ...files,
        ],
        { timeout: 30000, stdio: "pipe" },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  40000,
);
