/// <reference lib="webworker" />
import { parseSql } from "@/lib/schema-java/sql-parser";
import { parseJava } from "@/lib/schema-java/java-parser";
import { generate } from "@/lib/schema-java/generate";
import {
  checkInput,
  type Model,
  type Options,
  type Output,
} from "@/lib/schema-java/model";
import { readMetadata } from "@/lib/schema-java/metadata";
export interface Request {
  input: string;
  inputKind: "sql" | "java" | "metadata";
  sourceDialect: Options["dialect"];
  schema: string;
  model?: Model;
  options: Options;
  output: Output;
}
self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const r = event.data;
    checkInput(r.input);
    const reference = r.schema
      ? parseSql(r.schema, r.sourceDialect)
      : undefined;
    const model =
      r.model ??
      (r.inputKind === "sql"
        ? parseSql(r.input, r.sourceDialect, reference)
        : r.inputKind === "metadata"
          ? readMetadata(r.input)
          : parseJava(r.input, r.sourceDialect));
    if (reference?.diagnostics.some((d) => d.severity === "error"))
      model.diagnostics.push(...reference.diagnostics);
    postMessage({ model, result: generate(model, r.output, r.options) });
  } catch (e) {
    postMessage({
      result: {
        files: [],
        diagnostics: [
          {
            severity: "error",
            code: e instanceof Error ? e.message : "syntax",
          },
        ],
      },
    });
  }
};
