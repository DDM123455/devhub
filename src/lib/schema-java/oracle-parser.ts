import {
  tokenizeSql,
  syntaxFor,
  findStructuralProblems,
  offsetToLineCol,
  computeLineStarts,
  type SqlToken,
} from "../sql-tokenize";
import {
  assignNames,
  checkInput,
  identifier,
  type Column,
  type Constraint,
  type Model,
  type Table,
} from "./model";
import { javaType } from "./types";

/** Recursive-descent parser for the documented Oracle relational DDL subset.
 * No MySQL/PostgreSQL fallback: unknown Oracle clauses fail explicitly.
 */
class OracleError extends Error {
  constructor(
    public code: string,
    public offset: number,
    detail: string,
  ) {
    super(detail);
  }
}
class Reader {
  at = 0;
  constructor(
    readonly tokens: SqlToken[],
    readonly source: string,
  ) {}
  peek(value?: string) {
    const t = this.tokens[this.at];
    return value === undefined
      ? !!t
      : (t?.type === "word" && t.value.toUpperCase() === value) ||
          t?.value === value;
  }
  take() {
    const t = this.tokens[this.at++];
    if (!t) this.fail("syntax", "Unexpected end of statement");
    return t;
  }
  accept(v: string) {
    if (this.peek(v)) {
      this.at++;
      return true;
    }
    return false;
  }
  expect(v: string) {
    if (!this.accept(v)) this.fail("syntax", "Expected " + v);
  }
  fail(code: string, detail: string): never {
    throw new OracleError(
      code,
      this.tokens[this.at]?.start ?? this.tokens.at(-1)?.end ?? 0,
      detail,
    );
  }
  id() {
    const t = this.take();
    if (t.type === "quoted" && t.value.startsWith('"'))
      return t.value.slice(1, -1).replaceAll('""', '"');
    if (t.type !== "word") this.fail("syntax", "Expected Oracle identifier");
    return t.value.toUpperCase();
  }
  path() {
    const parts = [this.id()];
    while (this.accept(".")) parts.push(this.id());
    if (parts.length > 3) this.fail("unsupported", "Identifier qualification");
    return parts;
  }
  number() {
    let sign = 1;
    if (this.accept("-")) sign = -1;
    else this.accept("+");
    const t = this.take();
    if (t.type !== "number" || !/^\d+$/.test(t.value))
      this.fail("syntax", "Expected integer");
    return sign * Number(t.value);
  }
  group() {
    this.expect("(");
    const start = this.at;
    let depth = 1;
    while (this.at < this.tokens.length) {
      const t = this.take();
      if (t.type === "lparen") depth++;
      if (t.type === "rparen") {
        depth--;
        if (depth === 0) return this.tokens.slice(start, this.at - 1);
      }
    }
    this.fail("syntax", "Unclosed parentheses");
  }
  ids() {
    const r = new Reader(this.group(), this.source);
    const out = [r.id()];
    while (r.accept(",")) out.push(r.id());
    r.end();
    return out;
  }
  raw(ts: SqlToken[]) {
    if (!ts.length) this.fail("syntax", "Expected expression");
    return this.source.slice(ts[0].start, ts.at(-1)!.end);
  }
  end() {
    if (this.peek())
      this.fail(
        "unsupported",
        "Unsupported Oracle clause: " + this.tokens[this.at].value,
      );
  }
}
// Split only at the current grammar depth, never commas inside calls/strings/comments.
function split(ts: SqlToken[], separator: string): SqlToken[][] {
  const result: SqlToken[][] = [];
  let from = 0,
    depth = 0;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i].type === "lparen") depth++;
    if (ts[i].type === "rparen") depth--;
    if (depth === 0 && ts[i].value === separator) {
      result.push(ts.slice(from, i));
      from = i + 1;
    }
  }
  if (from < ts.length) result.push(ts.slice(from));
  else if (separator === "," && ts.length) result.push([]);
  return result;
}
function sqlString(t: SqlToken) {
  if (t.type !== "string")
    throw new OracleError("syntax", t.start, "Expected string literal");
  if (/^n?q'/i.test(t.value)) {
    const i = t.value.indexOf("'");
    return t.value.slice(i + 2, -2);
  }
  return t.value.replace(/^n?'/i, "").slice(0, -1).replaceAll("''", "'");
}
function oracleColumnType(r: Reader, c: Column) {
  const type = r.id();
  c.sqlType = type;
  c.javaType = javaType(type);
  if (type === "FLOAT") {
    c.javaType = "BigDecimal";
    if (r.peek("(")) {
      const a = new Reader(r.group(), r.source);
      const precision = a.number();
      a.end();
      if (precision < 1 || precision > 126)
        r.fail("syntax", "FLOAT binary precision must be 1..126");
      c.unknown.binaryPrecision = precision;
    }
    return;
  }
  if (
    [
      "NUMBER",
      "DECIMAL",
      "DEC",
      "NUMERIC",
      "INTEGER",
      "INT",
      "SMALLINT",
      "FLOAT",
    ].includes(type)
  ) {
    c.javaType = "BigDecimal";
    if (r.peek("(")) {
      const a = new Reader(r.group(), r.source);
      c.precision = a.number();
      if (a.accept(",")) c.scale = a.number();
      else c.scale = 0;
      a.end();
      if (
        c.precision < 1 ||
        c.precision > 38 ||
        c.scale! < 0 ||
        c.scale! > c.precision
      )
        r.fail("unsupported", "NUMBER precision/scale outside supported range");
      if (c.scale === 0)
        c.javaType =
          c.precision <= 9
            ? "Integer"
            : c.precision <= 18
              ? "Long"
              : "BigDecimal";
    }
    return;
  }
  if (
    ["VARCHAR2", "NVARCHAR2", "VARCHAR", "CHAR", "NCHAR", "RAW"].includes(type)
  ) {
    const a = new Reader(r.group(), r.source);
    c.length = a.number();
    if (a.peek("BYTE") || a.peek("CHAR"))
      c.unknown.lengthSemantics = a.take().value.toUpperCase();
    a.end();
    if (c.length < 1) r.fail("syntax", "Invalid length");
    c.javaType = type === "RAW" ? "byte[]" : "String";
    return;
  }
  if (type === "TIMESTAMP") {
    if (r.peek("(")) {
      const a = new Reader(r.group(), r.source);
      c.unknown.temporalPrecision = a.number();
      a.end();
      if (
        Number(c.unknown.temporalPrecision) > 9 ||
        Number(c.unknown.temporalPrecision) < 0
      )
        r.fail("syntax", "Invalid timestamp precision");
    }
    if (r.accept("WITH")) {
      const local = r.accept("LOCAL");
      r.expect("TIME");
      r.expect("ZONE");
      c.sqlType += " WITH " + (local ? "LOCAL " : "") + "TIME ZONE";
      c.javaType = local ? "LocalDateTime" : "OffsetDateTime";
    } else c.javaType = "LocalDateTime";
    return;
  }
  const simple: Record<string, string> = {
    DATE: "LocalDateTime",
    CLOB: "String",
    NCLOB: "String",
    BLOB: "byte[]",
    BINARY_FLOAT: "Float",
    BINARY_DOUBLE: "Double",
  };
  if (!simple[type]) r.fail("unsupported", "Oracle data type " + type);
  c.javaType = simple[type];
}
export function parseOracle(input: string): Model {
  checkInput(input);
  const m: Model = {
    version: 1,
    dialect: "oracle",
    tables: [],
    diagnostics: [],
  };
  const tokens = tokenizeSql(input, syntaxFor("plsql"));
  const significant = tokens.filter(
    (t) => !["ws", "lineComment", "blockComment"].includes(t.type),
  );
  const warn = (code: string, detail: string) =>
    m.diagnostics.push({ severity: "warning", code, detail });
  const expression = (r: Reader, ts: SqlToken[]) => {
    const value = r.raw(ts);
    warn("oracleExpression", value);
    return value;
  };
  const reference = (r: Reader): NonNullable<Constraint["reference"]> => {
    const path = r.path();
    if (path.length > 2) r.fail("unsupported", "Reference qualification");
    return {
      schema: path.length === 2 ? path[0] : undefined,
      table: path.at(-1)!,
      columns: r.ids(),
    };
  };
  const pending: (() => void)[] = [];
  const tableFor = (parts: string[], r: Reader) => {
    const t = m.tables.find(
      (t) =>
        t.name === parts.at(-1) &&
        (t.schema ?? "") === (parts.length > 1 ? parts[0] : ""),
    );
    if (!t) r.fail("unsupported", "Target table not in input");
    return t;
  };
  try {
    const structural = findStructuralProblems(tokens);
    if (structural.length)
      throw new OracleError(
        "syntax",
        structural[0].offset,
        "Unclosed delimiter or literal",
      );
    for (const statement of split(significant, ";")) {
      if (!statement.length) continue;
      const r = new Reader(statement, input);
      if (r.accept("COMMENT")) {
        r.expect("ON");
        const col = r.accept("COLUMN");
        if (!col) r.expect("TABLE");
        const target = r.path();
        r.expect("IS");
        let comment: string | undefined;
        if (r.accept("NULL")) comment = undefined;
        else comment = sqlString(r.take());
        r.end();
        pending.push(() => {
          const t = tableFor(col ? target.slice(0, -1) : target, r);
          if (col) {
            const c = t.columns.find((c) => c.name === target.at(-1));
            if (!c) r.fail("unsupported", "Unknown comment column");
            c.comment = comment;
          } else t.comment = comment;
        });
        continue;
      }
      r.expect("CREATE");
      const unique = r.accept("UNIQUE");
      if (r.accept("INDEX")) {
        const ix = r.path();
        r.expect("ON");
        const table = r.path();
        const cols = r.ids();
        r.end();
        pending.push(() =>
          tableFor(table, r).constraints.push({
            kind: unique ? "unique" : "index",
            name: ix.at(-1),
            columns: cols,
          }),
        );
        continue;
      }
      if (unique) r.fail("unsupported", "UNIQUE TABLE");
      r.expect("TABLE");
      const path = r.path();
      if (path.length > 2) r.fail("unsupported", "Table qualification");
      const t: Table = {
        name: path.at(-1)!,
        schema: path.length === 2 ? path[0] : undefined,
        className: identifier(path.at(-1)!, true),
        columns: [],
        constraints: [],
        source: input,
        unknown: {},
      };
      const defs = split(r.group(), ",");
      r.end();
      for (const def of defs) {
        const d = new Reader(def, input);
        if (!def.length) d.fail("syntax", "Empty column definition");
        let constraintName: string | undefined;
        if (d.accept("CONSTRAINT")) constraintName = d.id();
        if (
          d.peek("PRIMARY") ||
          d.peek("UNIQUE") ||
          d.peek("FOREIGN") ||
          d.peek("CHECK")
        ) {
          if (d.accept("PRIMARY")) {
            d.expect("KEY");
            t.constraints.push({
              kind: "primary",
              name: constraintName,
              columns: d.ids(),
            });
          } else if (d.accept("UNIQUE"))
            t.constraints.push({
              kind: "unique",
              name: constraintName,
              columns: d.ids(),
            });
          else if (d.accept("FOREIGN")) {
            d.expect("KEY");
            const columns = d.ids();
            d.expect("REFERENCES");
            t.constraints.push({
              kind: "foreign",
              name: constraintName,
              columns,
              reference: reference(d),
            });
          } else {
            d.expect("CHECK");
            t.constraints.push({
              kind: "check",
              name: constraintName,
              columns: [],
              expression: expression(d, d.group()),
            });
          }
          d.end();
          continue;
        }
        if (constraintName) d.fail("syntax", "Expected table constraint");
        const colName = d.id();
        const c: Column = {
          name: colName,
          javaName: identifier(colName),
          sqlType: "",
          javaType: "Object",
          nullable: true,
          primaryKey: false,
          selected: true,
          origin: {
            name: "input",
            sqlType: "input",
            javaType: "inferred",
            nullable: "input",
          },
          unknown: {},
        };
        oracleColumnType(d, c);
        while (d.peek()) {
          let cn: string | undefined;
          if (d.accept("CONSTRAINT")) cn = d.id();
          if (d.accept("NOT")) {
            d.expect("NULL");
            c.nullable = false;
          } else if (d.accept("NULL")) c.nullable = true;
          else if (d.accept("PRIMARY")) {
            d.expect("KEY");
            c.primaryKey = true;
            c.nullable = false;
          } else if (d.accept("UNIQUE"))
            t.constraints.push({ kind: "unique", name: cn, columns: [c.name] });
          else if (d.accept("REFERENCES"))
            t.constraints.push({
              kind: "foreign",
              name: cn,
              columns: [c.name],
              reference: reference(d),
            });
          else if (d.accept("CHECK"))
            t.constraints.push({
              kind: "check",
              name: cn,
              columns: [c.name],
              expression: expression(d, d.group()),
            });
          else if (d.accept("DEFAULT")) {
            if (cn) d.fail("unsupported", "Named DEFAULT");
            if (d.accept("ON")) {
              d.expect("NULL");
              c.unknown.defaultOnNull = true;
              c.nullable = false;
            }
            const start = d.at;
            let depth = 0;
            while (d.peek()) {
              const tok = d.tokens[d.at];
              if (
                depth === 0 &&
                tok.type === "word" &&
                [
                  "NOT",
                  "NULL",
                  "CONSTRAINT",
                  "PRIMARY",
                  "UNIQUE",
                  "REFERENCES",
                  "CHECK",
                  "GENERATED",
                ].includes(tok.value.toUpperCase()) &&
                d.at > start
              )
                break;
              if (tok.type === "lparen") depth++;
              if (tok.type === "rparen") depth--;
              d.at++;
            }
            c.default = expression(d, d.tokens.slice(start, d.at));
          } else if (d.accept("GENERATED")) {
            if (cn) d.fail("unsupported", "Named GENERATED");
            let mode = "always";
            if (d.accept("ALWAYS")) {
            } else {
              d.expect("BY");
              d.expect("DEFAULT");
              mode = "default";
              if (d.accept("ON")) {
                d.expect("NULL");
                mode = "defaultOnNull";
              }
            }
            d.expect("AS");
            d.expect("IDENTITY");
            c.identity = true;
            c.nullable = false;
            c.unknown.identityMode = mode;
            if (d.peek("(")) {
              const a = new Reader(d.group(), input);
              while (a.peek()) {
                if (a.accept("START")) {
                  a.expect("WITH");
                  c.unknown.identitySeed = a.number();
                } else if (a.accept("INCREMENT")) {
                  a.expect("BY");
                  c.unknown.identityIncrement = a.number();
                } else
                  a.fail(
                    "unsupported",
                    "Identity options (supported: START WITH, INCREMENT BY)",
                  );
              }
            }
          } else
            d.fail(
              "unsupported",
              "Unsupported column clause " + d.tokens[d.at].value,
            );
        }
        if (
          c.sqlType === "DATE" ||
          c.sqlType.includes("LOCAL TIME ZONE") ||
          c.unknown.lengthSemantics === "BYTE" ||
          c.sqlType === "FLOAT"
        )
          warn("oracleSemantics", c.name + ": " + c.sqlType);
        if (
          c.identity &&
          ![
            "NUMBER",
            "INTEGER",
            "INT",
            "SMALLINT",
            "DECIMAL",
            "NUMERIC",
            "DEC",
          ].includes(c.sqlType)
        )
          d.fail("syntax", "Identity requires numeric type");
        if (
          c.identity &&
          (c.default !== undefined || c.unknown.identityIncrement === 0)
        )
          d.fail("syntax", "Invalid identity default/increment");
        t.columns.push(c);
      }
      for (const pk of t.constraints.filter((c) => c.kind === "primary"))
        for (const c of t.columns)
          if (pk.columns.includes(c.name)) {
            c.primaryKey = true;
            c.nullable = false;
          }
      if (!t.columns.length) r.fail("syntax", "Empty table");
      if (t.columns.filter((c) => c.identity).length > 1)
        r.fail("syntax", "Oracle permits one identity column per table");
      assignNames(t);
      m.tables.push(t);
    }
    for (const f of pending) f();
  } catch (e) {
    const err = e as OracleError;
    const pos = offsetToLineCol(computeLineStarts(input), err.offset ?? 0);
    m.tables = [];
    m.diagnostics.push({
      severity: "error",
      code: err.code ?? "syntax",
      detail: err.message,
      ...pos,
    });
  }
  return m;
}
