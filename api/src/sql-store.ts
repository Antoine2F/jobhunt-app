import sql from "mssql";
import {
  newRowMeta,
  TABLES,
  validate,
  type Column,
  type NewRow,
  type Row,
  type Store,
  type TableName,
} from "@jobhunt/core";

// Stockage Azure SQL. Les noms de tables/colonnes viennent exclusivement de
// TABLES (jamais de la requête), les valeurs passent toutes en paramètres.

function sqlType(col: Column) {
  switch (col.type) {
    case "int":
      return sql.Int;
    case "datetime":
      return sql.DateTimeOffset;
    case "date":
      return sql.Date;
    case "text":
      return sql.NVarChar(sql.MAX);
    default:
      return sql.NVarChar(col.max ?? 400);
  }
}

function fromDb(row: Record<string, unknown>, table: TableName): Record<string, unknown> {
  const cols = TABLES[table] as Record<string, Column>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = cols[k]?.type === "date" ? v.toISOString().slice(0, 10) : v.toISOString();
    } else out[k] = v;
  }
  return out;
}

export class SqlStore implements Store {
  private pool: Promise<sql.ConnectionPool> | null = null;

  constructor(private connectionString: string) {}

  // La base serverless gratuite se met en pause : la première connexion
  // peut échouer pendant la reprise (~1 min). On réessaie.
  private async connect(cs: string, attempt = 1): Promise<sql.ConnectionPool> {
    try {
      return await new sql.ConnectionPool(cs).connect();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      return this.connect(cs, attempt + 1);
    }
  }

  private async request() {
    // Si la reprise a échoué (base encore en pause), on ne garde pas l'échec :
    // la requête suivante retente une connexion au lieu d'échouer pour toujours.
    this.pool ??= this.connect(this.connectionString).catch((e) => {
      this.pool = null;
      throw e;
    });
    return (await this.pool).request();
  }

  async list<T extends TableName>(table: T): Promise<Row<T>[]> {
    const r = await (await this.request()).query(`SELECT * FROM [${table}] ORDER BY created_at DESC`);
    return r.recordset.map((row) => fromDb(row, table)) as Row<T>[];
  }

  async get<T extends TableName>(table: T, id: string): Promise<Row<T> | null> {
    const req = await this.request();
    req.input("id", sql.NVarChar(36), id);
    const r = await req.query(`SELECT * FROM [${table}] WHERE id = @id`);
    return r.recordset[0] ? (fromDb(r.recordset[0], table) as Row<T>) : null;
  }

  async insert<T extends TableName>(table: T, data: NewRow<T>): Promise<Row<T>> {
    const values = { ...newRowMeta(), ...validate(table, data as Record<string, unknown>) } as Record<string, unknown>;
    const cols = TABLES[table] as Record<string, Column>;
    const req = await this.request();
    const names: string[] = [];
    for (const [k, v] of Object.entries(values)) {
      const col = cols[k];
      if (k === "id") req.input(k, sql.NVarChar(36), v);
      else if (k === "created_at" || k === "updated_at") req.input(k, sql.DateTimeOffset, new Date(v as string));
      else if (col) req.input(k, sqlType(col), toDbValue(col, v));
      else continue;
      names.push(k);
    }
    await req.query(
      `INSERT INTO [${table}] (${names.map((n) => `[${n}]`).join(", ")}) VALUES (${names.map((n) => `@${n}`).join(", ")})`,
    );
    return (await this.get(table, values.id as string))!;
  }

  async update<T extends TableName>(table: T, id: string, data: Partial<NewRow<T>>): Promise<Row<T> | null> {
    const values = validate(table, data as Record<string, unknown>, { partial: true }) as Record<string, unknown>;
    const cols = TABLES[table] as Record<string, Column>;
    const req = await this.request();
    req.input("id", sql.NVarChar(36), id);
    req.input("updated_at", sql.DateTimeOffset, new Date());
    const sets = ["[updated_at] = @updated_at"];
    for (const [k, v] of Object.entries(values)) {
      req.input(k, sqlType(cols[k]), toDbValue(cols[k], v));
      sets.push(`[${k}] = @${k}`);
    }
    const r = await req.query(`UPDATE [${table}] SET ${sets.join(", ")} WHERE id = @id`);
    return r.rowsAffected[0] ? this.get(table, id) : null;
  }

  async remove(table: TableName, id: string): Promise<boolean> {
    const req = await this.request();
    req.input("id", sql.NVarChar(36), id);
    const r = await req.query(`DELETE FROM [${table}] WHERE id = @id`);
    return r.rowsAffected[0] > 0;
  }
}

function toDbValue(col: Column, v: unknown) {
  if (v === null || v === undefined) return null;
  if (col.type === "datetime" || col.type === "date") return new Date(v as string);
  return v;
}
