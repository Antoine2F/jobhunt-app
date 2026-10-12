import { randomUUID } from "node:crypto";
import { validate, type NewRow, type Row, type TableName } from "./schema.js";

/**
 * Accès aux données. Volontairement minimal : les volumes d'une recherche
 * d'emploi (quelques centaines de lignes) permettent de charger une table
 * entière et de calculer les vues (accueil, suggestions) en TypeScript.
 */
export interface Store {
  list<T extends TableName>(table: T): Promise<Row<T>[]>;
  get<T extends TableName>(table: T, id: string): Promise<Row<T> | null>;
  insert<T extends TableName>(table: T, data: NewRow<T>): Promise<Row<T>>;
  update<T extends TableName>(table: T, id: string, data: Partial<NewRow<T>>): Promise<Row<T> | null>;
  remove(table: TableName, id: string): Promise<boolean>;
}

export function newRowMeta() {
  const now = new Date().toISOString();
  return { id: randomUUID(), created_at: now, updated_at: now };
}

/** Stockage en mémoire : tests et développement local sans base Azure. */
export class MemoryStore implements Store {
  private data = new Map<TableName, Map<string, Record<string, unknown>>>();

  private table(t: TableName) {
    let m = this.data.get(t);
    if (!m) this.data.set(t, (m = new Map()));
    return m;
  }

  async list<T extends TableName>(table: T): Promise<Row<T>[]> {
    return [...this.table(table).values()].map((r) => ({ ...r })) as Row<T>[];
  }

  async get<T extends TableName>(table: T, id: string): Promise<Row<T> | null> {
    const r = this.table(table).get(id);
    return r ? ({ ...r } as Row<T>) : null;
  }

  async insert<T extends TableName>(table: T, data: NewRow<T>): Promise<Row<T>> {
    const row = { ...newRowMeta(), ...validate(table, data as Record<string, unknown>) };
    this.table(table).set(row.id, row);
    return { ...row } as Row<T>;
  }

  async update<T extends TableName>(table: T, id: string, data: Partial<NewRow<T>>): Promise<Row<T> | null> {
    const cur = this.table(table).get(id);
    if (!cur) return null;
    const next = {
      ...cur,
      ...validate(table, data as Record<string, unknown>, { partial: true }),
      updated_at: new Date().toISOString(),
    };
    this.table(table).set(id, next);
    return { ...next } as Row<T>;
  }

  async remove(table: TableName, id: string): Promise<boolean> {
    return this.table(table).delete(id);
  }

  /** Charge des lignes complètes (id compris), pour les données de démo. */
  load(table: TableName, rows: Record<string, unknown>[]) {
    for (const r of rows) this.table(table).set(r.id as string, r);
  }
}
