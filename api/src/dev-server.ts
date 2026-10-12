import { createServer } from "node:http";
import { handle } from "./router.js";
import { getStore } from "./store-from-env.js";

// Serveur de développement : même routeur que sur Azure, sans Functions Core Tools.
// Authentification désactivée (DEV_NO_AUTH=1 par défaut ici).

process.env.DEV_NO_AUTH ??= "1";
const port = Number(process.env.API_PORT ?? 7071);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (!url.pathname.startsWith("/api")) {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    res.writeHead(400, { "content-type": "application/json" }).end('{"error":"JSON invalide"}');
    return;
  }
  const out = await handle(
    {
      method: req.method ?? "GET",
      path: url.pathname.slice(4) || "/",
      query: url.searchParams,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
      body,
      user: { id: "dev", name: "dev", provider: "dev" },
    },
    getStore(),
  );
  res.writeHead(out.status, { "content-type": "application/json" });
  res.end(out.body === undefined ? "" : JSON.stringify(out.body));
}).listen(port, () => console.log(`API de dev sur http://localhost:${port}/api`));
