// Construit api/dist : un seul fichier JS (toutes dépendances incluses)
// + host.json + package.json, déployé tel quel par Static Web Apps.
import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  minify: true,
  // Fourni par le runtime Azure Functions.
  external: ["@azure/functions-core"],
  logLevel: "info",
});
await copyFile("host.json", "dist/host.json");
await writeFile(
  "dist/package.json",
  JSON.stringify({ name: "jobhunt-api", version: "1.0.0", main: "index.js" }, null, 2),
);
