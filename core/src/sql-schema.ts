import { TABLES, type Column } from "./schema.js";

// Schéma Azure SQL dérivé de TABLES (source unique de vérité). Idempotent :
// crée les tables, colonnes et index manquants, ne supprime jamais rien.
// Utilisé par scripts/gen-schema.ts (db/schema.sql) et par l'API, qui
// l'applique à la première connexion : une nouvelle colonne arrive donc en
// production avec le déploiement, sans migration manuelle.

const typeOf = (c: Column) =>
  c.type === "int"
    ? "INT"
    : c.type === "datetime"
      ? "DATETIMEOFFSET"
      : c.type === "date"
        ? "DATE"
        : c.type === "text"
          ? "NVARCHAR(MAX)"
          : `NVARCHAR(${c.max ?? 400})`;

const INDEXES: Record<string, string[]> = {
  offers: ["status", "company_id", "url_key"],
  processes: ["offer_id"],
  interviews: ["process_id"],
  people: ["company_id"],
  meetings: ["person_id"],
  introductions: ["introducer_id", "introduced_id"],
  ingested_messages: ["message_id"],
};

/** Un lot SQL par table (l'équivalent des blocs séparés par GO). */
export function schemaBatches(): string[] {
  return Object.entries(TABLES).map(([table, cols]) => {
    let out = `IF OBJECT_ID(N'dbo.[${table}]', N'U') IS NULL\nCREATE TABLE dbo.[${table}] (\n  id NVARCHAR(36) NOT NULL PRIMARY KEY,\n  created_at DATETIMEOFFSET NOT NULL,\n  updated_at DATETIMEOFFSET NOT NULL\n);\n`;
    for (const [name, col] of Object.entries(cols as Record<string, Column>)) {
      out += `IF COL_LENGTH(N'dbo.[${table}]', N'${name}') IS NULL ALTER TABLE dbo.[${table}] ADD [${name}] ${typeOf(col)} NULL;\n`;
    }
    for (const ix of INDEXES[table] ?? []) {
      out += `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_${table}_${ix}') CREATE INDEX ix_${table}_${ix} ON dbo.[${table}] ([${ix}]);\n`;
    }
    return out;
  });
}

export function schemaSql(): string {
  const head = "-- Généré par scripts/gen-schema.ts : ne pas modifier à la main.\n-- Idempotent : crée les tables et colonnes manquantes.\n\n";
  return head + schemaBatches().map((b) => `${b}GO\n\n`).join("");
}
