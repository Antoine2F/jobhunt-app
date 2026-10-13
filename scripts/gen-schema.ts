// Génère db/schema.sql à partir de core/src/schema.ts (source unique de vérité).
import { writeFileSync } from "node:fs";
import { schemaSql } from "../core/src/sql-schema.js";

writeFileSync(new URL("../db/schema.sql", import.meta.url), schemaSql());
console.log("db/schema.sql écrit");
