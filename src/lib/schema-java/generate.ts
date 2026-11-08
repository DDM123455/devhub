import { validateModel } from "./validate";
import {
  identifier,
  safePackage,
  type Column,
  type Model,
  type Options,
  type Output,
  type Result,
  type Table,
} from "./model";
import { imports, sqlType } from "./types";
const str = (v: string) => JSON.stringify(v).replace(/\\u2028|\\u2029/g, " ");
const doc = (v?: string) =>
  v
    ? `/** ${v
        .replace(/\*\//g, "* /")
        .replace(/\\/g, "&#92;")
        .replace(/[\r\n]/g, " ")} */\n`
    : "";
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const sensitive = (c: Column) =>
  /password|secret|token|credential|salt/i.test(c.name);
export function generate(model: Model, kind: Output, o: Options): Result {
  const r: Result = {
    files: [],
    diagnostics: [...model.diagnostics, ...validateModel(model)],
  };
  if (r.diagnostics.some((d) => d.severity === "error")) return r;
  if (!safePackage(o.packageName)) {
    r.diagnostics.push({ severity: "error", code: "package" });
    return r;
  }
  if (kind === "record" && o.javaVersion < 16) {
    r.diagnostics.push({ severity: "error", code: "recordVersion" });
    return r;
  }
  if (o.namespace === "jakarta" && o.javaVersion < 17) {
    r.diagnostics.push({ severity: "error", code: "bootVersion" });
    return r;
  }
  if (kind === "sql") return generateSql(model, o, r);
  const names = new Set<string>();
  for (const t of model.tables) {
    const base = identifier(
      o.className && model.tables.length === 1
        ? o.className
        : t.name.startsWith(o.prefix)
          ? t.name.slice(o.prefix.length)
          : t.className,
      true,
    );
    const name =
      base +
      (kind === "dto"
        ? o.dtoKind
        : kind === "record"
          ? "Record"
          : kind === "projection"
            ? "Projection"
            : "");
    if (names.has(name)) {
      r.diagnostics.push({
        severity: "error",
        code: "duplicateName",
        detail: name,
      });
      continue;
    }
    names.add(name);
    const cols = t.columns.filter(
      (c) =>
        kind === "entity" ||
        (c.selected &&
          (o.includeId || !c.primaryKey) &&
          (o.includeAudit ||
            !/^(created|updated|deleted)_?(at|by|date)$/i.test(c.name)) &&
          (o.includeSensitive || !sensitive(c))),
    );
    const keys = cols.filter((c) => c.primaryKey);
    if (kind === "entity" && !keys.length) {
      r.diagnostics.push({
        severity: "error",
        code: "primaryKey",
        detail: t.name,
      });
      continue;
    }
    if (!cols.length) {
      r.diagnostics.push({
        severity: "error",
        code: "noFields",
        detail: t.name,
      });
      continue;
    }
    if (kind !== "entity" && o.includeSensitive && cols.some(sensitive))
      r.diagnostics.push({
        severity: "warning",
        code: "sensitive",
        detail: t.name,
      });
    const im = new Set<string>();
    const types = new Map<Column, string>();
    for (const c of cols) {
      let type =
        o.typeOverrides[t.name + "." + c.name] ??
        o.typeOverrides[c.sqlType] ??
        c.javaType;
      if (
        !/^(?:[A-Za-z_$][\w$]*)(?:\[\])?$/.test(type) ||
        (!imports[type] &&
          ![
            "String",
            "Object",
            "Long",
            "Integer",
            "Short",
            "Byte",
            "Boolean",
            "Float",
            "Double",
            "Character",
            "long",
            "int",
            "short",
            "byte",
            "boolean",
            "float",
            "double",
            "char",
            "byte[]",
          ].includes(type))
      ) {
        r.diagnostics.push({
          severity: "error",
          code: "unknownType",
          detail: type,
        });
        type = "Object";
      }
      if (imports[type]) im.add(imports[type]);
      if (
        o.primitives &&
        c.nullable === false &&
        o.dtoKind !== "UpdateRequest"
      ) {
        type =
          (
            {
              Long: "long",
              Integer: "int",
              Short: "short",
              Byte: "byte",
              Boolean: "boolean",
              Float: "float",
              Double: "double",
            } as Record<string, string>
          )[type] ?? type;
      }
      types.set(c, type);
    }
    const entity = kind === "entity";
    if (entity) im.add(o.namespace + ".persistence.*");
    if (o.serializable) im.add("java.io.Serializable");
    const validation = (c: Column) => {
      const a: string[] = [];
      if (
        o.validation &&
        kind !== "projection" &&
        !(kind === "dto" && o.dtoKind === "UpdateRequest")
      ) {
        if (c.nullable === false && !c.identity) {
          im.add(o.namespace + ".validation.constraints.NotNull");
          a.push("@NotNull");
        }
        if (c.length && types.get(c) === "String") {
          im.add(o.namespace + ".validation.constraints.Size");
          a.push(`@Size(max = ${c.length})`);
        }
        if (c.precision && types.get(c) === "BigDecimal") {
          im.add(o.namespace + ".validation.constraints.Digits");
          a.push(
            `@Digits(integer = ${c.precision - (c.scale ?? 0)}, fraction = ${c.scale ?? 0})`,
          );
        }
      }
      return a;
    };
    const annotations = (c: Column): string[] => {
      const a = validation(c);
      if (entity) {
        if (c.primaryKey) a.push("@Id");
        if (
          c.identity &&
          keys.length === 1 &&
          ["Long", "Integer", "long", "int"].includes(types.get(c)!)
        )
          a.push("@GeneratedValue(strategy = GenerationType.IDENTITY)");
        const attrs = [`name = ${str(c.name)}`];
        if (c.nullable !== null) attrs.push(`nullable = ${c.nullable}`);
        for (const k of ["length", "precision", "scale"] as const)
          if (c[k] !== undefined) attrs.push(`${k} = ${c[k]}`);
        if (c.generated) attrs.push("insertable = false", "updatable = false");
        a.push(`@Column(${attrs.join(", ")})`);
        if (/JSON/.test(c.sqlType))
          r.diagnostics.push({
            severity: "warning",
            code: "providerType",
            detail: c.name,
          });
      }
      return a;
    };
    let body = "";
    if (kind === "record") {
      body = `public record ${name}(\n${cols.map((c) => "    " + [...validation(c), types.get(c), c.javaName].join(" ")).join(",\n")}\n)${o.serializable ? " implements Serializable" : ""} {}\n`;
    } else if (kind === "projection") {
      body = `public interface ${name} {\n${cols.map((c) => `    ${types.get(c)} get${cap(c.javaName)}();`).join("\n")}\n}\n`;
    } else {
      let head = doc(t.comment);
      if (entity) {
        head += `@Entity\n@Table(name = ${str(t.name)}${t.schema ? `, schema = ${str(t.schema)}` : ""})\n`;
        if (keys.length > 1) head += `@IdClass(${name}.Key.class)\n`;
      }
      if (o.lombok) {
        im.add("lombok.*");
        if (o.accessors) head += "@Getter\n@Setter\n";
        if (o.noArgs || entity) head += "@NoArgsConstructor\n";
        if (o.allArgs || o.builder) head += "@AllArgsConstructor\n";
        if (o.builder) head += "@Builder\n";
      }
      body =
        head +
        `public class ${name}${o.serializable ? " implements Serializable" : ""} {\n` +
        (o.serializable
          ? "    private static final long serialVersionUID = 1L;\n"
          : "");
      body += cols
        .map(
          (c) =>
            doc(c.comment)
              .split("\n")
              .filter(Boolean)
              .map((x) => "    " + x + "\n")
              .join("") +
            annotations(c)
              .map((x) => "    " + x + "\n")
              .join("") +
            `    private ${types.get(c)} ${c.javaName};\n`,
        )
        .join("\n");
      if (!o.lombok) {
        if (o.noArgs || entity) body += `\n    public ${name}() {}\n`;
        if (o.allArgs)
          body += `\n    public ${name}(${cols.map((c) => types.get(c) + " " + c.javaName).join(", ")}) {\n${cols.map((c) => `        this.${c.javaName} = ${c.javaName};`).join("\n")}\n    }\n`;
        if (o.accessors)
          body += cols
            .map(
              (c) =>
                `\n    public ${types.get(c)} get${cap(c.javaName)}() { return ${c.javaName}; }\n    public void set${cap(c.javaName)}(${types.get(c)} value) { this.${c.javaName} = value; }\n`,
            )
            .join("");
        if (o.builder) {
          if (!(o.noArgs || entity)) body += `\n    private ${name}() {}\n`;
          body += `\n    public static Builder builder() { return new Builder(); }\n    public static class Builder {\n${cols.map((c) => `        private ${types.get(c)} ${c.javaName};`).join("\n")}\n${cols.map((c) => `        public Builder ${c.javaName}(${types.get(c)} value) { this.${c.javaName} = value; return this; }`).join("\n")}\n        public ${name} build() {\n            ${name} result = new ${name}();\n${cols.map((c) => `            result.${c.javaName} = this.${c.javaName};`).join("\n")}\n            return result;\n        }\n    }\n`;
        }
      }
      if (entity && keys.length > 1) {
        im.add("java.io.Serializable");
        im.add("java.util.Objects");
        body += `\n    public static class Key implements Serializable {\n        private static final long serialVersionUID = 1L;\n${keys.map((c) => `        public ${types.get(c)} ${c.javaName};`).join("\n")}\n        public Key() {}\n        @Override public boolean equals(Object other) {\n            if (this == other) return true;\n            if (other == null || getClass() != other.getClass()) return false;\n            Key key = (Key) other;\n            return ${keys.map((c) => `Objects.equals(${c.javaName}, key.${c.javaName})`).join(" && ")};\n        }\n        @Override public int hashCode() { return Objects.hash(${keys.map((c) => c.javaName).join(", ")}); }\n    }\n`;
      }
      if (entity && o.relationships) {
        for (const [index, fk] of t.constraints
          .filter((c) => c.kind === "foreign" && c.reference)
          .entries()) {
          const target = model.tables.find(
            (x) =>
              x.name === fk.reference!.table &&
              x.schema === fk.reference!.schema,
          );
          if (!target) {
            r.diagnostics.push({
              severity: "warning",
              code: "relationshipIds",
              detail: fk.reference!.table,
            });
            continue;
          }
          const targetName = identifier(
            target.name.startsWith(o.prefix)
              ? target.name.slice(o.prefix.length)
              : target.className,
            true,
          );
          let field = identifier(target.name) + "Reference" + index;
          while (cols.some((c) => c.javaName === field)) field += "_";
          body += `\n    @ManyToOne(fetch = FetchType.LAZY)\n    @JoinColumns({${fk.columns.map((c, i) => `@JoinColumn(name = ${str(c)}, referencedColumnName = ${str(fk.reference!.columns[i])}, insertable = false, updatable = false)`).join(", ")}})\n    private ${targetName} ${field};\n`;
        }
      }
      body += "}\n";
    }
    if (
      entity &&
      (t.constraints.length || cols.some((c) => c.default || c.generated))
    )
      r.diagnostics.push({
        severity: "warning",
        code: "metadataSidecar",
        detail: t.name,
      });
    const content =
      (o.packageName ? `package ${o.packageName};\n\n` : "") +
      [...im]
        .sort()
        .map((x) => `import ${x};`)
        .join("\n") +
      "\n\n" +
      body;
    r.files.push({
      path:
        (o.packageName ? o.packageName.replaceAll(".", "/") + "/" : "") +
        name +
        ".java",
      content,
    });
    if (kind === "dto" && o.mapper) {
      if (
        !o.accessors ||
        (o.dtoKind === "UpdateRequest" && o.nullPolicy === "choose")
      ) {
        r.diagnostics.push({ severity: "error", code: "mapperPolicy" });
        continue;
      }
      const dtoCtor =
        o.allArgs || (o.builder && o.lombok)
          ? `new ${name}(${cols.map((c) => `source.get${cap(c.javaName)}()`).join(", ")})`
          : `new ${name}()`;
      if (!o.noArgs && !o.allArgs && !(o.builder && o.lombok)) {
        r.diagnostics.push({ severity: "error", code: "mapperPolicy" });
        continue;
      }
      const useCtor = dtoCtor !== `new ${name}()`;
      const mapper = `${o.packageName ? "package " + o.packageName + ";\n\n" : ""}public final class ${name}Mapper {\n    private ${name}Mapper() {}\n    public static ${name} toDto(${base} source) {\n        if (source == null) return null;\n        ${name} result = ${dtoCtor};\n${useCtor ? "" : cols.map((c) => `        result.set${cap(c.javaName)}(source.get${cap(c.javaName)}());`).join("\n")}\n        return result;\n    }\n    public static void apply(${name} source, ${base} target) {\n        if (source == null || target == null) return;\n${cols
        .map((c) => {
          const statement = `target.set${cap(c.javaName)}(source.get${cap(c.javaName)}());`;
          const primitive = [
            "long",
            "int",
            "boolean",
            "short",
            "byte",
            "double",
            "float",
            "char",
          ].includes(types.get(c)!);
          return (
            "        " +
            (o.nullPolicy === "ignore" && !primitive
              ? `if (source.get${cap(c.javaName)}() != null) ${statement}`
              : statement)
          );
        })
        .join("\n")}\n    }\n}\n`;
      r.files.push({
        path:
          (o.packageName ? o.packageName.replaceAll(".", "/") + "/" : "") +
          name +
          "Mapper.java",
        content: mapper,
      });
      r.diagnostics.push({
        severity: "warning",
        code: "mapperEntity",
        detail: base,
      });
    }
  }
  if (r.diagnostics.some((d) => d.severity === "error")) r.files = [];
  return r;
}
function generateSql(m: Model, o: Options, r: Result): Result {
  const q = (x: string) =>
    o.dialect === "mysql"
      ? "`" + x.replaceAll("`", "``") + "`"
      : '"' + x.replaceAll('"', '""') + '"';
  const full = (t: Table) =>
    [t.schema, t.name]
      .filter(Boolean)
      .map((x) => q(x!))
      .join(".");
  const chunks: string[] = [];
  for (const t of m.tables) {
    const rows = t.columns.map((c) => {
      let type = sqlType(c, o.dialect, r.diagnostics);
      let row = `  ${q(c.name)} ${type}`;
      if (c.nullable === null)
        r.diagnostics.push({
          severity: "warning",
          code: "metadataMissing",
          detail: t.name + "." + c.name,
        });
      if (c.nullable === false || c.primaryKey) row += " NOT NULL";
      if (c.identity) {
        if (!/^(BIGINT|INTEGER|SMALLINT)$/.test(type) || !c.primaryKey) {
          r.diagnostics.push({
            severity: "error",
            code: "identityReview",
            detail: c.name,
          });
        } else
          row +=
            o.dialect === "mysql"
              ? " AUTO_INCREMENT"
              : c.unknown.identityMode === "always"
                ? " GENERATED ALWAYS AS IDENTITY"
                : " GENERATED BY DEFAULT AS IDENTITY";
      }
      if (c.default !== undefined) {
        if (m.dialect === o.dialect) row += " DEFAULT " + c.default;
        else
          r.diagnostics.push({
            severity: "warning",
            code: "expressionLoss",
            detail: c.name + " DEFAULT " + c.default,
          });
      }
      if (c.generated) {
        if (m.dialect === o.dialect)
          row += ` GENERATED ALWAYS AS (${c.generated}) STORED`;
        else
          r.diagnostics.push({
            severity: "warning",
            code: "expressionLoss",
            detail: c.name,
          });
      }
      if (o.dialect === "mysql" && c.comment)
        row += " COMMENT '" + c.comment.replaceAll("'", "''") + "'";
      return row;
    });
    const pk = t.columns.filter((c) => c.primaryKey);
    if (pk.length)
      rows.push(`  PRIMARY KEY (${pk.map((c) => q(c.name)).join(", ")})`);
    for (const c of t.constraints) {
      const prefix = c.name ? `CONSTRAINT ${q(c.name)} ` : "";
      const cs = c.columns.map(q).join(", ");
      if (c.kind === "unique") rows.push(`  ${prefix}UNIQUE (${cs})`);
      if (c.kind === "foreign" && c.reference) {
        const ref = c.reference;
        rows.push(
          `  ${prefix}FOREIGN KEY (${cs}) REFERENCES ${[ref.schema, ref.table]
            .filter(Boolean)
            .map((x) => q(x!))
            .join(".")} (${ref.columns.map(q).join(", ")})`,
        );
        if (ref.actions)
          r.diagnostics.push({
            severity: "warning",
            code: "unsupportedMetadata",
            detail: ref.actions,
          });
      }
      if (c.kind === "check") {
        if (m.dialect === o.dialect && c.expression)
          rows.push(`  ${prefix}CHECK (${c.expression})`);
        else
          r.diagnostics.push({
            severity: "warning",
            code: "expressionLoss",
            detail: "CHECK",
          });
      }
    }
    chunks.push(`CREATE TABLE ${full(t)} (\n${rows.join(",\n")}\n);`);
    for (const [i, c] of t.constraints
      .filter((c) => c.kind === "index")
      .entries())
      chunks.push(
        `CREATE INDEX ${q(c.name ?? t.name + "_idx_" + i)} ON ${full(t)} (${c.columns.map(q).join(", ")});`,
      );
    if (o.dialect === "postgresql" && t.comment)
      chunks.push(
        `COMMENT ON TABLE ${full(t)} IS '${t.comment.replaceAll("'", "''")}';`,
      );
    if (o.dialect === "postgresql")
      for (const c of t.columns)
        if (c.comment)
          chunks.push(
            `COMMENT ON COLUMN ${full(t)}.${q(c.name)} IS '${c.comment.replaceAll("'", "''")}';`,
          );
  }
  if (!r.diagnostics.some((d) => d.severity === "error"))
    r.files.push({ path: "schema.sql", content: chunks.join("\n\n") + "\n" });
  return r;
}
