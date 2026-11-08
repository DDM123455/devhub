export const dialects = [
  { id: "postgresql", label: "PostgreSQL", database: "Postgresql" },
  { id: "mysql", label: "MySQL", database: "MySQL" },
  { id: "mariadb", label: "MariaDB", database: "MySQL" },
  { id: "sqlserver", label: "SQL Server", database: "TransactSQL" },
  { id: "sqlite", label: "SQLite", database: "SQLite" },
] as const;
export type Dialect = (typeof dialects)[number]["id"];
export const isMysql = (d: Dialect) => d === "mysql" || d === "mariadb";
export const isDialect = (value: unknown): value is Dialect =>
  dialects.some((d) => d.id === value);
export const parserDatabase = (d: Dialect) =>
  dialects.find((x) => x.id === d)!.database;
