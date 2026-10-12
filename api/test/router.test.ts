import { MemoryStore, seedDemo } from "@jobhunt/core";
import { describe, expect, it } from "vitest";
import { handle, type ApiRequest } from "../src/router.js";

const env = { ALLOWED_USERS: "antoine2f", INGEST_KEY: "secret-key" } as NodeJS.ProcessEnv;
const me = { id: "1", name: "Antoine2F", provider: "github" };

function req(method: string, path: string, body: unknown = null, extra: Partial<ApiRequest> = {}): ApiRequest {
  return { method, path, body, query: new URLSearchParams(), headers: {}, user: me, ...extra };
}

function setup() {
  const store = new MemoryStore();
  seedDemo(store);
  return store;
}

describe("router", () => {
  it("refuse un utilisateur non autorisé et l'absence de connexion", async () => {
    const store = setup();
    expect((await handle(req("GET", "/home", null, { user: { ...me, name: "intrus" } }), store, env)).status).toBe(403);
    expect((await handle(req("GET", "/home", null, { user: null }), store, env)).status).toBe(403);
    expect((await handle(req("GET", "/home"), store, { INGEST_KEY: "x" } as NodeJS.ProcessEnv)).status).toBe(403);
  });

  it("sert l'accueil", async () => {
    const res = await handle(req("GET", "/home"), setup(), env);
    expect(res.status).toBe(200);
    expect((res.body as { counts: { active_processes: number } }).counts.active_processes).toBe(2);
  });

  it("CRUD générique avec validation", async () => {
    const store = setup();
    const created = await handle(req("POST", "/people", { name: "Nouvelle personne", strength: "2" }), store, env);
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const patched = await handle(req("PATCH", `/people/${id}`, { role: "CTO" }), store, env);
    expect((patched.body as { role: string; strength: number }).role).toBe("CTO");
    expect((patched.body as { strength: number }).strength).toBe(2);
    expect((await handle(req("POST", "/offers", { title: "x", status: "nope" }), store, env)).status).toBe(400);
    expect((await handle(req("DELETE", `/people/${id}`), store, env)).status).toBe(204);
    expect((await handle(req("POST", "/ingested_messages", { message_id: "x" }), store, env)).status).toBe(405);
  });

  it("valider puis candidater crée un processus", async () => {
    const store = setup();
    await handle(req("POST", "/offers/o-3/decision", { decision: "validate" }), store, env);
    const res = await handle(req("POST", "/offers/o-3/decision", { decision: "apply" }), store, env);
    const body = res.body as { offer: { status: string }; process: { stage: string; offer_id: string } };
    expect(body.offer.status).toBe("applied");
    expect(body.process).toMatchObject({ stage: "applied", offer_id: "o-3" });
    // Idempotent : pas de second processus
    await handle(req("POST", "/offers/o-3/decision", { decision: "apply" }), store, env);
    expect((await store.list("processes")).filter((p) => p.offer_id === "o-3")).toHaveLength(1);
  });

  it("supprimer une offre supprime son processus et ses entretiens", async () => {
    const store = setup();
    await handle(req("DELETE", "/offers/o-1"), store, env);
    expect(await store.get("processes", "p-1")).toBeNull();
    expect(await store.get("interviews", "i-2")).toBeNull();
  });

  it("ingestion protégée par clé, avec suivi des messages", async () => {
    const store = setup();
    const payload = { source: "wttj", message_id: "m-42", offers: [{ title: "CDO", company: "Nouvelle Boîte" }] };
    expect((await handle(req("POST", "/ingest", payload, { user: null }), store, env)).status).toBe(401);
    const headers = { "x-ingest-key": "secret-key" };
    const res = await handle(req("POST", "/ingest", payload, { user: null, headers }), store, env);
    expect(res.body).toEqual({ created: 1, duplicates: 0 });
    const unseen = await handle(req("POST", "/ingest/unseen", { ids: ["m-42", "m-43"] }, { user: null, headers }), store, env);
    expect(unseen.body).toEqual({ ids: ["m-43"] });
  });

  it("détail d'offre et suggestions", async () => {
    const store = setup();
    const detail = (await handle(req("GET", "/offers/o-1/detail"), store, env)).body as { interviews: unknown[]; company: { name: string } };
    expect(detail.company.name).toBe("Exemple Énergie");
    expect(detail.interviews).toHaveLength(2);
    const sugg = await handle(req("GET", "/offers/o-4/suggestions"), store, env);
    expect(sugg.status).toBe(200);
  });
});
