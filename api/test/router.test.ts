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
    expect((res.body as { counts: { lead: number; waiting: number } }).counts).toMatchObject({ lead: 2, waiting: 1 });
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

  it("fait avancer une offre étape par étape, ou s'arrêter", async () => {
    const store = setup();
    const move = (body: unknown) => handle(req("POST", "/offers/o-3/move", body), store, env);
    await move({ step: "to_apply" });
    const res = await move({ step: "applied" });
    const body = res.body as { offer: { status: string }; process: { stage: string; offer_id: string }; state: { step: string } };
    expect(body.offer.status).toBe("applied");
    expect(body.process).toMatchObject({ stage: "applied", offer_id: "o-3" });
    // Idempotent : pas de second processus
    await move({ step: "applied" });
    expect((await store.list("processes")).filter((p) => p.offer_id === "o-3")).toHaveLength(1);
    expect(((await move({ exit: "lost" })).body as { state: unknown }).state).toEqual({ step: "applied", exit: "lost" });
    // Retour positif : piste, et les étapes se renseignent une à une.
    await move({ step: "lead" });
    const proc = (await store.list("processes")).find((p) => p.offer_id === "o-3")!;
    const step = (await store.list("interviews")).find((i) => i.process_id === proc.id && i.position === 1)!;
    const failed = await handle(req("POST", `/steps/${step.id}/result`, { result: "negative" }), store, env);
    expect((failed.body as { state: unknown }).state).toEqual({ step: "lead", exit: "lost" });
    expect((await handle(req("POST", `/steps/${step.id}/result`, { result: "bof" }), store, env)).status).toBe(400);
    expect((await handle(req("POST", "/offers/o-3/steps", { name: "Step 5 (CEO)" }), store, env)).status).toBe(201);
    expect((await move({ step: "nulle-part" })).status).toBe(400);
    expect((await handle(req("POST", "/offers/inconnue/move", { step: "new" }), store, env)).status).toBe(404);
  });

  it("signale et fusionne les doublons", async () => {
    const store = setup();
    await store.update("offers", "o-4", { title: "Head of Data & IA (H/F)" });
    const detail = (await handle(req("GET", "/offers/o-4/detail"), store, env)).body as { duplicates: { id: string }[] };
    expect(detail.duplicates.map((d) => d.id)).toEqual(["o-1"]);
    expect(((await handle(req("GET", "/offers/duplicates"), store, env)).body as unknown[]).length).toBe(1);
    const res = await handle(req("POST", "/offers/o-1/merge", { from: "o-4" }), store, env);
    expect(res.status).toBe(200);
    expect(await store.get("offers", "o-4")).toBeNull();
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
    expect(detail.interviews).toHaveLength(4);
    const sugg = await handle(req("GET", "/offers/o-4/suggestions"), store, env);
    expect(sugg.status).toBe(200);
  });
});

describe("router : ajout manuel et suivi de la veille", () => {
  it("ajoute une offre intéressante sans appel à Claude", async () => {
    const store = setup();
    const res = await handle(req("POST", "/offers/manual", { title: "CDO", company: "Exemple Énergie", url: "https://x.test/1" }), store, env);
    const body = res.body as { created: { status: string; company_id: string; source: string }[] };
    expect(body.created[0]).toMatchObject({ status: "interesting", company_id: "c-1", source: "manual" });
    expect((await handle(req("POST", "/offers/manual", { company: "X" }), store, env)).status).toBe(400);
  });

  it("donne la date du dernier passage de la veille", async () => {
    const store = setup();
    const headers = { "x-ingest-key": "secret-key" };
    const empty = await handle(req("GET", "/ingest/last", null, { user: null, headers }), store, env);
    expect(empty.body).toEqual({ last_run_at: null, messages_processed: 0 });
    await handle(req("POST", "/ingest", { source: "linkedin", message_id: "m-1", offers: [] }, { user: null, headers }), store, env);
    const after = (await handle(req("GET", "/ingest/last", null, { user: null, headers }), store, env)).body as { last_run_at: string };
    expect(after.last_run_at).toBeTruthy();
  });
});

describe("router : revue des offres et reprise de l'historique", () => {
  const headers = { "x-ingest-key": "secret-key" };
  const ingest = (method: string, path: string, body: unknown = null, query = "") =>
    handle(req(method, path, body, { user: null, headers, query: new URLSearchParams(query) }), setup(), env);

  it("liste et renote les offres, sans revenir sur une décision", async () => {
    const store = setup();
    const call = (method: string, path: string, body: unknown = null, query = "") =>
      handle(req(method, path, body, { user: null, headers, query: new URLSearchParams(query) }), store, env);
    expect((await handle(req("GET", "/ingest/offers", null, { user: null }), store, env)).status).toBe(401);

    const { offers } = (await call("GET", "/ingest/offers", null, "status=proposed")).body as { offers: { id: string; status: string; company: string | null }[] };
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.status === "proposed")).toBe(true);

    const id = offers[0].id;
    const res = await call("PATCH", `/ingest/offers/${id}`, { score: 12, score_reason: "ESN", status: "rejected", decision_note: "ESN" });
    expect((res.body as { offer: { score: number; status: string } }).offer).toMatchObject({ score: 12, status: "rejected" });

    // Déjà rejetée : la note peut changer, pas le statut.
    expect((await call("PATCH", `/ingest/offers/${id}`, { score: 40 })).status).toBe(200);
    expect((await call("PATCH", `/ingest/offers/${id}`, { status: "validated" })).status).toBe(409);
    expect((await call("PATCH", "/ingest/offers/inconnue", { score: 1 })).status).toBe(404);
  });

  const bundle = {
    processes: [
      {
        company: "Datadog",
        title: "Senior PM APM",
        url: "https://careers.datadoghq.com/detail/123/?gh_src=abc",
        stage: "interviews",
        applied_at: "2026-10-07T09:00:00Z",
        next_step: "Entretien HM",
        next_step_date: "2026-10-20",
        interviews: [
          { scheduled_at: "2026-10-10T14:00:00Z", kind: "Recruteur", status: "done", outcome: "Positif" },
          { scheduled_at: "2026-10-20T10:00:00Z", kind: "Hiring manager", status: "to_prepare" },
        ],
      },
      { company: "Fintech Démo", title: "Head of Product", stage: "lost", notes: "Refus après case study" },
    ],
    people: [
      {
        name: "Samuel Savin",
        company: "Datadog",
        email: "samuel@example.test",
        strength: 2,
        meetings: [
          {
            status: "seen",
            planned_at: "2026-10-07T08:00:00Z",
            topic: "Opportunités Datadog",
            offer: { company: "Datadog", title: "Senior PM APM", url: "https://careers.datadoghq.com/detail/123/" },
          },
        ],
      },
    ],
  };

  it("simule l'import sans rien écrire", async () => {
    const store = setup();
    const before = (await store.list("processes")).length;
    const res = await handle(req("POST", "/ingest/import", { ...bundle, dry_run: true }, { user: null, headers }), store, env);

    const body = res.body as { dry_run: boolean; counts: Record<string, Record<string, number>> };
    expect(body.dry_run).toBe(true);
    expect(body.counts.process.created).toBe(2);
    expect(body.counts.interview.created).toBe(2);
    expect(body.counts.meeting.created).toBe(1);
    expect((await store.list("processes")).length).toBe(before);
  });

  it("importe processus, entretiens et réseau, de façon idempotente", async () => {
    const store = setup();
    const call = (body: unknown) => handle(req("POST", "/ingest/import", body, { user: null, headers }), store, env);
    const first = (await call(bundle)).body as { counts: Record<string, Record<string, number>> };
    expect(first.counts.offer.created).toBe(2);
    expect(first.counts.person.created).toBe(1);

    const offers = await store.list("offers");
    const dd = offers.find((o) => o.title === "Senior PM APM")!;
    expect(dd.status).toBe("applied");
    expect(offers.find((o) => o.title === "Head of Product")!.status).toBe("closed");
    const proc = (await store.list("processes")).find((p) => p.offer_id === dd.id)!;
    expect(proc).toMatchObject({ stage: "interviews", next_step_date: "2026-10-20" });
    expect((await store.list("interviews")).filter((i) => i.process_id === proc.id)).toHaveLength(2);
    expect((await store.list("meetings")).find((m) => m.topic === "Opportunités Datadog")!.offer_id).toBe(dd.id);
    // L'entreprise existante est réutilisée.
    expect((await store.list("companies")).filter((c) => c.name.startsWith("Fintech"))).toHaveLength(1);

    const again = (await call(bundle)).body as { counts: Record<string, Record<string, number>> };
    for (const kind of Object.values(again.counts)) expect(kind.created + kind.updated).toBe(0);

    // Mise à jour : le recruteur est passé, l'entretien HM a eu lieu.
    const next = structuredClone(bundle);
    next.processes[0].stage = "final";
    next.processes[0].interviews![1].status = "done";
    const upd = (await call(next)).body as { counts: Record<string, Record<string, number>> };
    expect(upd.counts.process.updated).toBe(1);
    expect(upd.counts.interview).toMatchObject({ updated: 1, unchanged: 1, created: 0 });
  });

  it("reprend une offre déjà remontée par la veille au lieu de la dupliquer", async () => {
    const store = setup();
    const call = (path: string, body: unknown) => handle(req("POST", path, body, { user: null, headers }), store, env);
    await call("/ingest", { source: "linkedin", offers: [{ title: "Senior PM APM", company: "Datadog", url: "https://www.linkedin.com/jobs/view/4300000001" }] });
    const before = (await store.list("offers")).length;
    await call("/ingest/import", { processes: [{ company: "Datadog", title: "Senior PM APM", url: "https://careers.datadoghq.com/detail/123/", stage: "screening" }] });
    const offers = await store.list("offers");
    expect(offers).toHaveLength(before);
    expect(offers.find((o) => o.title === "Senior PM APM")!.status).toBe("applied");
  });

  it("importe une offre « à postuler », puis la candidature la fait avancer", async () => {
    const store = setup();
    const call = (body: unknown) => handle(req("POST", "/ingest/import", body, { user: null, headers }), store, env);
    const offer = { company: "Alma", title: "Lead PM Paiements", url: "https://jobs.lever.co/alma/abc?utm_source=x", stage: "to_apply" };
    const first = (await call({ processes: [offer] })).body as { counts: Record<string, Record<string, number>> };
    expect(first.counts.offer.created).toBe(1);
    const o = (await store.list("offers")).find((x) => x.title === "Lead PM Paiements")!;
    expect(o).toMatchObject({ status: "validated", approach: "direct" });
    expect((await store.list("processes")).find((p) => p.offer_id === o.id)!.stage).toBe("to_apply");

    // Même URL : rien de nouveau.
    const again = (await call({ processes: [{ ...offer, url: "https://jobs.lever.co/alma/abc" }] })).body as { counts: Record<string, Record<string, number>> };
    expect(again.counts.offer.created + again.counts.process.created).toBe(0);

    const res = await handle(req("POST", `/offers/${o.id}/move`, { step: "applied" }), store, env);
    expect((res.body as { process: { stage: string } }).process.stage).toBe("applied");
    expect((await store.list("processes")).filter((p) => p.offer_id === o.id)).toHaveLength(1);
  });

  it("refuse un lot invalide sans rien écrire", async () => {
    const store = setup();
    const before = (await store.list("offers")).length;
    const bad = { processes: [bundle.processes[0], { company: "X", title: "PM", stage: "inconnu" }] };
    const res = await handle(req("POST", "/ingest/import", bad, { user: null, headers }), store, env);
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/processes\[1\] \(X — PM\)/);
    expect((await store.list("offers")).length).toBe(before);
  });

  it("la route d'import exige la clé", async () => {
    expect((await handle(req("POST", "/ingest/import", bundle, { user: null }), setup(), env)).status).toBe(401);
    expect((await ingest("GET", "/ingest/offers")).status).toBe(200);
  });
});

describe("router : choix de l'approche et fiches entreprise", () => {
  const headers = { "x-ingest-key": "secret-key" };

  it("la démarche réseau s'active en parallèle, sans changer l'étape", async () => {
    const store = setup();
    const res = await handle(req("PATCH", "/offers/o-4", { approach: "network" }), store, env);
    expect(res.body).toMatchObject({ status: "proposed", approach: "network" });
    expect(((await handle(req("PATCH", "/offers/o-4", { approach: null }), store, env)).body as { approach: unknown }).approach).toBeNull();
    expect((await handle(req("PATCH", "/offers/o-4", { approach: "piston" }), store, env)).status).toBe(400);
  });

  it("donne l'offre et le profil aux skills, et range les liens du dossier de candidature", async () => {
    const store = setup();
    const call = (method: string, path: string, body: unknown = null) => handle(req(method, path, body, { user: null, headers }), store, env);
    const got = (await call("GET", "/ingest/offers/o-1")).body as { offer: { title: string }; company: { name: string } };
    expect(got).toMatchObject({ offer: { title: "Head of Data & IA" }, company: { name: "Exemple Énergie" } });
    await call("PATCH", "/ingest/offers/o-1", { cover_letter_url: "https://docs.google.com/document/d/abc" });
    expect((await store.get("offers", "o-1"))!.cover_letter_url).toBe("https://docs.google.com/document/d/abc");
    expect((await call("GET", "/ingest/offers/inconnue")).status).toBe(404);
  });

  it("donne au skill maj les candidatures à suivre, et le laisse les faire avancer", async () => {
    const store = setup();
    const call = (method: string, path: string, body: unknown = null) => handle(req(method, path, body, { user: null, headers }), store, env);
    const { offers } = (await call("GET", "/ingest/pipeline")).body as { offers: { id: string; category: string; steps: { id: string; result: string }[] }[] };
    expect(offers.map((o) => o.category).sort()).toEqual(["lead", "lead", "to_apply", "waiting"]);
    const o1 = offers.find((o) => o.id === "o-1")!;
    expect(o1.steps.map((s) => s.result)).toEqual(["positive", "waiting", "to_plan", "to_plan"]);
    expect((await call("POST", `/ingest/steps/${o1.steps[1].id}/result`, { result: "positive" })).status).toBe(200);
    expect((await call("POST", "/ingest/offers/o-7/move", { step: "lead" })).status).toBe(200);
    expect((await call("POST", "/ingest/seen", { ids: ["mail-1"], source: "maj" })).status).toBe(200);
    expect(((await call("POST", "/ingest/unseen", { ids: ["mail-1", "mail-2"] })).body as { ids: string[] }).ids).toEqual(["mail-2"]);
    // Sans clé : refusé.
    expect((await handle(req("POST", "/ingest/offers/o-7/move", { step: "lead" }, { user: null }), store, env)).status).toBe(401);
  });

  it("la veille complète l'entreprise sans écraser ce qui est saisi", async () => {
    const store = setup();
    const call = (method: string, path: string, body: unknown = null) => handle(req(method, path, body, { user: null, headers }), store, env);
    const info = {
      description: "Plateforme d'observabilité",
      size: "6 500 salariés",
      sector: "Software / SaaS",
      funding: "Cotée (Nasdaq)",
      headquarters: "New York, États-Unis",
      dev_offices: "New York, Paris",
      founders_nationality: "Française",
      capital_origin: "Coté au Nasdaq, flottant majoritairement US",
    };
    await call("POST", "/ingest", { source: "linkedin", offers: [{ title: "Senior PM", company: "Datadog", remote: "2 j/sem.", company_info: info }] });
    const dd = (await store.list("companies")).find((c) => c.name === "Datadog")!;
    expect(dd).toMatchObject(info);
    expect((await store.list("offers")).find((o) => o.title === "Senior PM")!.remote).toBe("2 j/sem.");

    // Champ déjà rempli : conservé ; champ vide : complété.
    await call("POST", "/ingest", { source: "linkedin", offers: [{ title: "Senior PM", company: "Datadog", company_info: { size: "1", website: "https://datadoghq.com" } }] });
    expect(await store.get("companies", dd.id)).toMatchObject({ size: "6 500 salariés", website: "https://datadoghq.com" });

    // Routes dédiées : liste, complément, correction explicite.
    const list = (await call("GET", "/ingest/companies")).body as { companies: { id: string; offers: number; dev_offices: string }[] };
    expect(list.companies.find((c) => c.id === dd.id)).toMatchObject({ offers: 1, dev_offices: "New York, Paris" });
    await call("PATCH", `/ingest/companies/${dd.id}`, { size: "7 000 salariés" });
    expect((await store.get("companies", dd.id))!.size).toBe("6 500 salariés");
    await call("PATCH", `/ingest/companies/${dd.id}`, { size: "7 000 salariés", overwrite: true });
    expect((await store.get("companies", dd.id))!.size).toBe("7 000 salariés");
    expect((await call("PATCH", "/ingest/companies/inconnue", { size: "1" })).status).toBe(404);
  });

  it("propose des recherches LinkedIn par affinité", async () => {
    const res = await handle(req("GET", "/offers/o-4/suggestions"), setup(), { ...env, NETWORK_AFFINITIES: "Polytechnique, Microsoft" });
    const labels = (res.body as { linkedin_searches: { label: string }[] }).linkedin_searches.map((l) => l.label);
    expect(labels).toHaveLength(3);
    expect(labels[1]).toMatch(/^Polytechnique chez /);
  });
});
