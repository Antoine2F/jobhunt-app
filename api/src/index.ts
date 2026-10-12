import { app, type HttpRequest } from "@azure/functions";
import { handle, type ApiRequest } from "./router.js";
import { getStore } from "./store-from-env.js";

// Point d'entrée Azure Functions (fonctions gérées par Static Web Apps).
// Une seule fonction HTTP qui délègue au routeur.

function principal(req: HttpRequest): ApiRequest["user"] {
  const raw = req.headers.get("x-ms-client-principal");
  if (!raw) return null;
  try {
    const p = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return p?.userId ? { id: p.userId, name: p.userDetails ?? "", provider: p.identityProvider ?? "" } : null;
  } catch {
    return null;
  }
}

app.http("api", {
  route: "{*path}",
  methods: ["GET", "POST", "PATCH", "DELETE"],
  authLevel: "anonymous",
  handler: async (req, ctx) => {
    let body: unknown = null;
    if (req.method !== "GET" && req.method !== "DELETE") {
      const text = await req.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        return { status: 400, jsonBody: { error: "JSON invalide" } };
      }
    }
    const res = await handle(
      {
        method: req.method,
        path: "/" + (req.params.path ?? ""),
        query: new URLSearchParams(req.query),
        headers: Object.fromEntries(req.headers.entries()),
        body,
        user: principal(req),
      },
      getStore(),
    );
    if (res.status >= 500) ctx.error(res.body);
    return res.body === undefined ? { status: res.status } : { status: res.status, jsonBody: res.body };
  },
});
