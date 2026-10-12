import { MemoryStore, seedDemo, type Store } from "@jobhunt/core";
import { SqlStore } from "./sql-store.js";

let store: Store | null = null;

/** Azure SQL si SQL_CONNECTION_STRING est défini, sinon mémoire + données de démo. */
export function getStore(env = process.env): Store {
  if (store) return store;
  if (env.SQL_CONNECTION_STRING) {
    store = new SqlStore(env.SQL_CONNECTION_STRING);
  } else {
    const mem = new MemoryStore();
    if (env.SEED_DEMO !== "0") seedDemo(mem);
    store = mem;
  }
  return store;
}
