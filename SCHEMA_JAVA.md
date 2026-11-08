# SQL ↔ Java converter

The tool runs entirely in a browser worker. No SQL or input Java is executed, compiled,
uploaded or logged. `javac` tests use only fixed synthetic fixtures checked into the test suite.

## Implemented paths

- PostgreSQL/MySQL/MariaDB/SQL Server/SQLite CREATE TABLE → Entity, DTO, Java record, Spring Data interface projection.
- Scalar, field-based Java class / record → the same intermediate model → Java output or SQL draft.
- Simple SELECT → DTO/record/projection, optionally resolving column types against supplied DDL.
- SQL drafts across these five dialects, with warnings for nonportable expressions and timezone semantics.
- Multi-table output, editable metadata, package ZIP, sidecar JSON import/export, option presets,
  plain Java DTO mapper with explicit null policy for UpdateRequest.

## Architecture

`src/lib/schema-java/model.ts` defines the versioned model and metadata origins (`input`, `user`,
`inferred`). `sql-parser.ts` adapts the installed node-sql-parser AST. PostgreSQL ALWAYS IDENTITY
is normalized using lexical token boundaries for the parser and its mode restored in metadata.
`java-parser.ts` is a bounded token lexer and balanced-delimiter declaration parser, not a regex
parser. `types.ts`, `generate.ts`, `validate.ts` and `metadata.ts` handle mappings, output and
validation. A dedicated worker bounds parse time to 12 seconds; input is limited to 200,000
characters. No database credentials are needed.

## Supported subset and limitations

- MariaDB uses the MySQL AST adapter for common DDL, not MariaDB-specific sequences or extensions.
- SQL Server uses a native T-SQL AST adapter: IDENTITY seed/increment, bracket identifiers,
  NVARCHAR, DATETIME2, DATETIMEOFFSET, BIT and UNIQUEIDENTIFIER. TIMESTAMP/ROWVERSION map to
  binary values. Vendor-specific storage, temporal tables and computed-column syntax remain limited.
- SQLite uses its native AST adapter and INTEGER PRIMARY KEY AUTOINCREMENT output. SQLite type
  affinity does not enforce decimal precision or Java date/boolean semantics; diagnostics flag these.
- SQL Server/SQLite SQL comments remain in metadata with an explicit warning. Cross-dialect defaults
  and check/generated expressions are never assumed portable. Oracle remains unsupported.

- DDL: scalar columns, nullability, length, decimal precision/scale, defaults, identity/serial,
  primary/composite keys, explicit foreign keys, unique/check constraints, simple indexes and
  comments. Generated expressions stay in metadata and SQL; JPA fields are read-only.
- No ALTER TABLE migration parser, partitioning, routines, triggers, functional/partial indexes,
  CTE/UNION/subquery type inference or SELECT wildcard expansion. Unsupported statements block output.
- Java: package/import, common scalar fields, record components, @Table/@Column/@Id and IDENTITY
  @GeneratedValue. Method bodies are skipped. Inheritance, generic fields, EmbeddedId and input
  relationships are rejected. Generated nested IdClass keys can be read back via their @Id fields.
  This is not a general Java compiler frontend.
- Entity output uses IdClass for composite keys. Explicit-FK relationships are opt-in, read-only
  ManyToOne fields and require the referenced table in the same input. No relationship is inferred
  from `_id`; no Lombok Data, toString, equals or hashCode is generated for entities.
- Foreign-key actions, vendor options and provider-specific JSON/enum/unsigned/array details are
  retained or warned about, not claimed to be losslessly translated. JSON needs a provider mapping.
- Java → SQL is a draft: nullable can be unknown, String without length maps to TEXT, and `id`
  does not imply identity. Bean Validation is not database metadata. Cross-dialect defaults and
  generated/check expressions are omitted with explicit diagnostics, preserved in the sidecar.
- Mapper requires a corresponding Entity and compatible getters/setters in the same package.
  MapStruct, Oracle, migration diff and database connections are not implemented.
- UI and explanatory copy are en/vi; other registered locale routes use the repository's English
  fallback convention. Native-language editorial review remains outstanding.

## Benchmark / feature parity review

Compared against official documentation, reviewed 2026-11-08:

| Capability | JPA Buddy | jOOQ codegen | This tool |
| --- | --- | --- | --- |
| Schema → Java | Entity reverse engineering | Tables, POJOs, records and more | Scalar JPA/DTO/record/projection subset |
| DTO / mapper | DTO designer, MapStruct | POJOs/interfaces, configurable generation | DTO variants, plain Java mapper |
| Dialect/provider breadth | IDE and project-aware integrations | Broad dialect-aware code generation | PostgreSQL/MySQL/MariaDB/SQL Server/SQLite subsets |
| Migration / database introspection | Database connections and migrations | Database metadata/codegen integrations | Deliberately excluded: paste/file data stays local |
| Metadata review | IDE tooling | Generator configuration | Editable mapping + loss diagnostics + JSON sidecar |

Sources: https://jpa-buddy.com/documentation/ and
https://www.jooq.org/doc/latest/manual/code-generation/

This browser tool is not a replacement for either product's complete feature set. The narrower
scope keeps it client-side and avoids implying full fidelity for arbitrary Java or database DDL.

## Verification

`npm test` includes conversion, malformed input, metadata, round-trip and security regression tests.
Set `SCHEMA_JAVA_COMPILE=1` to also run `schema-java-compile.test.ts` against JDK 17 and real
Jakarta Persistence 3.1, Validation 3.0.2 and Lombok 1.18.36 in the local Maven cache.
`scripts/verify-schema-java.cjs` exercises the built site at localhost:4329 using Puppeteer
(set PUPPETEER_PATH when the existing installation differs). It checks worker output, mobile
overflow, ZIP contents and en/vi routes. No new runtime dependency was added.
