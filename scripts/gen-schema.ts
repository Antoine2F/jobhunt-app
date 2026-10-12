// Génère db/schema.sql à partir de core/src/schema.ts (source unique de vérité).
import { writeFileSync } from "node:fs";
import { TABLES, type Column } from "../core/src/schema.js";

const typeOf = (c: Column) =>
  c.type === "int" ? "INT" : c.type === "datetime" ? "DATETIMEOFFSET" : c.type === "date" ? "DATE"
  : c.type === "text" ? "NVARCHAR(MAX)" : `NVARCHAR(${c.max ?? 400})`;

const INDEXES: Record<string, string[]> = {
  offers: ["status", "company_id", "url_key"],
  processes: ["offer_id"],
  interviews: ["process_id"],
  people: ["company_id"],
  meetings: ["person_id"],
  introductions: ["introducer_id", "introduced_id"],
  ingested_messages: ["message_id"],
};

let out = "-- Généré par scripts/gen-schema.ts : ne pas modifier à la main.\n-- Idempotent : crée les tables et colonnes manquantes.\n\n";
for (const [table, cols] of Object.entries(TABLES)) {
  out += `IF OBJECT_ID(N'dbo.[${table}]', N'U') IS NULL\nCREATE TABLE dbo.[${table}] (\n  id NVARCHAR(36) NOT NULL PRIMARY KEY,\n  created_at DATETIMEOFFSET NOT NULL,\n  updated_at DATETIMEOFFSET NOT NULL\n);\n`;
  for (const [name, col] of Object.entries(cols as Record<string, Column>)) {
    out += `IF COL_LENGTH(N'dbo.[${table}]', N'${name}') IS NULL ALTER TABLE dbo.[${table}] ADD [${name}] ${typeOf(col)} NULL;\n`;
  }
  for (const ix of INDEXES[table] ?? []) {
    out += `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_${table}_${ix}') CREATE INDEX ix_${table}_${ix} ON dbo.[${table}] ([${ix}]);\n`;
  }
  out += "GO\n\n";
}
writeFileSync(new URL("../db/schema.sql", import.meta.url), out);
console.log("db/schema.sql écrit");
