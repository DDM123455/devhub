import {
  assignNames,
  checkInput,
  identifier,
  type Column,
  type Dialect,
  type Model,
} from "./model";
// A bounded lexer + recursive delimiter parser for a documented Java declaration subset.
// Method bodies are skipped as balanced token groups, never evaluated or compiled.
interface Token {
  value: string;
  line: number;
  column: number;
  string?: boolean;
}
function lex(s: string): Token[] {
  const out: Token[] = [];
  let i = 0,
    line = 1,
    col = 1;
  const take = () => {
    const c = s[i++];
    if (c === "\n") {
      line++;
      col = 1;
    } else col++;
    return c;
  };
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      take();
      continue;
    }
    if (s.slice(i, i + 2) === "//") {
      while (i < s.length && take() !== "\n") {}
      continue;
    }
    if (s.slice(i, i + 2) === "/*") {
      take();
      take();
      while (i < s.length && s.slice(i, i + 2) !== "*/") take();
      if (i === s.length) throw new Error("syntax");
      take();
      take();
      continue;
    }
    const t: Token = { value: "", line, column: col };
    if (s[i] === '"' || s[i] === "'") {
      const q = take();
      t.string = true;
      while (i < s.length && s[i] !== q) {
        let c = take();
        if (c === "\\") {
          c = take();
          c = c === "n" ? "\n" : c === "t" ? "\t" : c;
        }
        t.value += c;
      }
      if (i === s.length) throw new Error("syntax");
      take();
    } else if (/[\w$]/.test(s[i])) {
      while (i < s.length && /[\w$]/.test(s[i])) t.value += take();
    } else t.value = take();
    out.push(t);
  }
  return out;
}
export function parseJava(input: string, dialect: Dialect): Model {
  checkInput(input);
  const m: Model = { version: 1, dialect, tables: [], diagnostics: [] };
  try {
    const ts = lex(input);
    let at = 0;
    const peek = () => ts[at]?.value;
    const pop = () => ts[at++]?.value;
    const group = (open: string, close: string): Token[] => {
      if (pop() !== open) throw new Error("syntax");
      const start = at;
      let depth = 1;
      while (at < ts.length) {
        const t = ts[at++];
        if (t.string) continue;
        if (t.value === open) depth++;
        if (t.value === close) {
          depth--;
          if (depth === 0) return ts.slice(start, at - 1);
        }
      }
      throw new Error("syntax");
    };
    const annotations = (): Record<string, Record<string, string>> => {
      const result: Record<string, Record<string, string>> = {};
      while (peek() === "@") {
        pop();
        let n = pop() ?? "";
        while (peek() === ".") {
          pop();
          n = pop() ?? "";
        }
        const values: Record<string, string> = {};
        if (peek() === "(") {
          const args = group("(", ")");
          for (let i = 0; i < args.length; i++) {
            if (args[i + 1]?.value === "=") {
              const k = args[i].value;
              let v = args[i + 2]?.value ?? "";
              i += 2;
              while (args[i + 1]?.value === ".") {
                v += "." + (args[i + 2]?.value ?? "");
                i += 2;
              }
              values[k] = v;
            } else if (i === 0) values.value = args[i].value;
          }
        }
        result[n] = values;
      }
      return result;
    };
    while (at < ts.length) {
      const ann = annotations();
      while (["public", "abstract", "final", "static"].includes(peek())) pop();
      if (peek() === "package" || peek() === "import") {
        while (at < ts.length && pop() !== ";") {}
        continue;
      }
      const kind = pop();
      if (!["class", "record"].includes(kind ?? "")) {
        if (kind) throw new Error("unsupported");
        break;
      }
      const className = pop()!;
      const table = {
        name:
          ann.Table?.name ??
          className.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase(),
        schema: ann.Table?.schema,
        className,
        columns: [] as Column[],
        constraints: [],
        unknown: { annotations: ann },
        source: input,
      };
      let body: Token[];
      if (kind === "record") {
        body = group("(", ")");
        if (peek() !== "{") throw new Error("unsupported");
        group("{", "}");
      } else {
        if (peek() !== "{") throw new Error("unsupported");
        body = group("{", "}");
      }
      const saved = ts.slice(at);
      ts.splice(0, ts.length, ...body);
      at = 0;
      while (at < ts.length) {
        const a = annotations();
        let stat = false;
        while (
          [
            "private",
            "protected",
            "public",
            "final",
            "static",
            "transient",
            "volatile",
          ].includes(peek())
        ) {
          if (pop() === "static") stat = true;
        }
        let type = pop();
        if (!type) break;
        if (type === "class" && ann.IdClass) {
          pop();
          while (at < ts.length && peek() !== "{") pop();
          group("{", "}");
          continue;
        }
        while (peek() === ".") {
          pop();
          type = pop();
        }
        if (peek() === "<") throw new Error("unsupported");
        if (peek() === "[") {
          pop();
          if (pop() !== "]") throw new Error("syntax");
          type += "[]";
        }
        if (peek() === "(") {
          group("(", ")");
          if (peek() === "{") group("{", "}");
          else pop();
          continue;
        }
        const field = pop();
        if (peek() === "(") {
          group("(", ")");
          if (peek() === "{") group("{", "}");
          else if (pop() !== ";") throw new Error("unsupported");
          continue;
        }
        if (peek() === "=") {
          pop();
          while (at < ts.length && ![";", ","].includes(peek())) {
            if (peek() === "(") group("(", ")");
            else pop();
          }
        }
        if (![";", ",", undefined].includes(peek()))
          throw new Error("unsupported");
        pop();
        if (stat || a.Transient) continue;
        if (!field || !type) throw new Error("syntax");
        if (
          a.EmbeddedId ||
          a.OneToMany ||
          a.ManyToOne ||
          a.OneToOne ||
          a.ManyToMany
        )
          throw new Error("unsupported");
        const c: Column = {
          name: a.Column?.name ?? field,
          javaName: field,
          sqlType: a.Column?.columnDefinition ?? "",
          javaType: type,
          nullable:
            a.Column?.nullable !== undefined
              ? a.Column.nullable !== "false"
              : a.Id
                ? false
                : null,
          primaryKey: !!a.Id,
          selected: true,
          origin: {
            name: a.Column?.name ? "input" : "inferred",
            javaType: "input",
            nullable: a.Column?.nullable !== undefined ? "input" : "inferred",
          },
          unknown: { annotations: a },
        };
        for (const key of ["length", "precision", "scale"] as const)
          if (a.Column?.[key] !== undefined) c[key] = Number(a.Column[key]);
        if (a.GeneratedValue) {
          c.identity =
            a.GeneratedValue.strategy?.endsWith(".IDENTITY") ?? false;
          if (!c.identity)
            m.diagnostics.push({
              severity: "warning",
              code: "identityReview",
              detail: field,
            });
        }
        if (a.NotNull && !a.Column?.nullable)
          m.diagnostics.push({
            severity: "warning",
            code: "validationNotSchema",
            detail: field,
          });
        if (c.nullable === null || !c.sqlType)
          m.diagnostics.push({
            severity: "warning",
            code: "metadataMissing",
            detail: field,
          });
        table.columns.push(c);
      }
      assignNames(table);
      m.tables.push(table);
      ts.splice(0, ts.length, ...saved);
      at = 0;
    }
    m.diagnostics.push({ severity: "warning", code: "reverseLoss" });
  } catch (e) {
    m.tables = [];
    m.diagnostics.push({
      severity: "error",
      code: e instanceof Error ? e.message : "syntax",
    });
  }
  return m;
}
