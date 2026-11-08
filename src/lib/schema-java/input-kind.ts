import { tokenizeSql, syntaxFor } from "../sql-tokenize";
export type InputKind = "sql" | "java" | "metadata";
/** A bounded format hint only, never a substitute for syntax parsing. */
export function inputKindMismatch(
  input: string,
  selected: InputKind,
): "inputSqlSelectedJava" | "inputJavaSelectedSql" | undefined {
  if (selected === "metadata") return;
  const tokens = tokenizeSql(
    input.slice(0, 4096),
    syntaxFor("postgresql"),
  ).filter((t) => !["ws", "lineComment", "blockComment"].includes(t.type));
  const words = tokens
    .filter((t) => t.type === "word")
    .slice(0, 8)
    .map((t) => t.value.toUpperCase());
  if (
    selected === "java" &&
    (words[0] === "SELECT" ||
      (["CREATE", "ALTER", "DROP"].includes(words[0]) &&
        ["TABLE", "INDEX", "SEQUENCE", "VIEW", "UNIQUE"].includes(words[1])) ||
      (words[0] === "COMMENT" && words[1] === "ON"))
  )
    return "inputSqlSelectedJava";
  if (
    selected === "sql" &&
    (["PACKAGE", "IMPORT"].includes(words[0]) ||
      ["CLASS", "RECORD", "INTERFACE"].includes(words[0]) ||
      (["PUBLIC", "PRIVATE", "PROTECTED", "ABSTRACT", "FINAL"].includes(
        words[0],
      ) &&
        words
          .slice(1, 4)
          .some((w) => ["CLASS", "RECORD", "INTERFACE"].includes(w))))
  )
    return "inputJavaSelectedSql";
}
