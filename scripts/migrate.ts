// Applique db/schema.sql sur Azure SQL. Usage : SQL_CONNECTION_STRING=... npm run migrate
import { readFileSync } from "node:fs";
import sql from "mssql";

const cs = process.env.SQL_CONNECTION_STRING;
if (!cs) throw new Error("SQL_CONNECTION_STRING manquant");
const script = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const pool = await new sql.ConnectionPool(cs).connect();
for (const batch of script.split(/^GO\s*$/m).map((b) => b.trim()).filter(Boolean)) {
  await pool.request().batch(batch);
}
await pool.close();
console.log("Schéma appliqué.");
