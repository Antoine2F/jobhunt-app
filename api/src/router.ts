import { timingSafeEqual } from "node:crypto";
import {
  applyIngest,
  buildHome,
  knowledgeFromEnv,
  parseConcept,
  suggestForOffer,
  TABLE_NAMES,
  unseenMessages,
  ValidationError,
  type IngestPayload,
  type Store,
  type TableName,
} from "@jobhunt/core";

export interface ApiRequest {
  method: string;
  /** Chemin sans le préfixe /api, ex. "/offers/123". */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: unknown;
  /** Identité fournie par Azure Static Web Apps (null en local si l'auth est désactivée). */
  user: { id: string; name: string; provider: string } | null;
}

export interface ApiResponse {
  status: number;
  body?: unknown;
}

const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const err = (status: number, message: string): ApiResponse => ({ status, body: { error: message } });

const WRITABLE = new Set<TableName>(TABLE_NAMES.filter((t) => t !== "ingested_messages"));

function isAllowed(req: ApiRequest, env: NodeJS.ProcessEnv): boolean {
  if (env.DEV_NO_AUTH === "1") return true;
  if (!req.user) return false;
  const allowed = (env.ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Liste vide = personne : on préfère échouer fermé.
  return allowed.includes(req.user.name.toLowerCase());
}

function hasIngestKey(req: ApiRequest, env: NodeJS.ProcessEnv): boolean {
  const expected = env.INGEST_KEY;
  const given = req.headers["x-ingest-key"];
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function cascadeDelete(store: Store, table: TableName, id: string) {
  if (table === "offers") {
    for (const p of (await store.list("processes")).filter((p) => p.offer_id === id)) {
      await cascadeDelete(store, "processes", p.id);
    }
  }
  if (table === "processes") {
    for (const i of (await store.list("interviews")).filter((i) => i.process_id === id)) {
      await store.remove("interviews", i.id);
    }
  }
  if (table === "people") {
    for (const m of (await store.list("meetings")).filter((m) => m.person_id === id)) await store.remove("meetings", m.id);
    for (const i of (await store.list("introductions")).filter((i) => i.introducer_id === id || i.introduced_id === id)) {
      await store.remove("introductions", i.id);
    }
  }
  return store.remove(table, id);
}

export async function handle(req: ApiRequest, store: Store, env = process.env): Promise<ApiResponse> {
  const parts = req.path.split("/").filter(Boolean);
  const [first, second, third] = parts;
  const m = req.method.toUpperCase();

  try {
    // --- Ingestion (GitHub Actions, skill Claude) : protégée par clé, pas par login.
    if (first === "ingest") {
      if (!hasIngestKey(req, env)) return err(401, "Clé d'ingestion invalide");
      if (m === "POST" && second === "unseen") {
        const ids = (req.body as { ids?: unknown })?.ids;
        if (!Array.isArray(ids)) return err(400, "ids attendu");
        return ok({ ids: await unseenMessages(store, ids.map(String)) });
      }
      if (m === "GET" && second === "last") {
        const msgs = await store.list("ingested_messages");
        const last = msgs.map((x) => x.created_at).sort().pop() ?? null;
        return ok({ last_run_at: last, messages_processed: msgs.length });
      }
      if (m === "POST" && !second) {
        const payload = req.body as IngestPayload;
        if (!payload || !Array.isArray(payload.offers)) return err(400, "offers attendu");
        const res = await applyIngest(store, { ...payload, status: "proposed" });
        return ok({ created: res.created.length, duplicates: res.duplicates });
      }
      return err(404, "Route inconnue");
    }

    if (!isAllowed(req, env)) return err(403, "Accès réservé");

    if (first === "me") return ok({ user: req.user });

    if (first === "home" && m === "GET") return ok(await buildHome(store));

    if (first === "knowledge" && m === "GET") {
      const src = knowledgeFromEnv(env);
      if (!src) return err(503, "Base de connaissance non configurée (KNOWLEDGE_REPO / KNOWLEDGE_TOKEN)");
      const path = req.query.get("path") ?? "";
      if (path.endsWith(".md")) {
        const md = await src.read(path);
        if (md === null) return err(404, "Fiche introuvable");
        return ok({ ...parseConcept(path, md), edit_url: src.editUrl(path) });
      }
      return ok({ entries: await src.list(path) });
    }

    // --- Offres : actions métier
    if (first === "offers" && second === "manual" && m === "POST") {
      // Offre ajoutée à la main : validée d'office, sans notation automatique.
      const o = (req.body ?? {}) as IngestPayload["offers"][number];
      if (!o.title?.trim()) return err(400, "Intitulé obligatoire");
      const res = await applyIngest(store, { source: "manual", status: "validated", offers: [o] });
      return ok({ created: res.created, duplicates: res.duplicates });
    }

    if (first === "offers" && second && third === "decision" && m === "POST") {
      const { decision, note } = (req.body ?? {}) as { decision?: string; note?: string };
      const offer = await store.get("offers", second);
      if (!offer) return err(404, "Offre introuvable");
      const status = ({ validate: "validated", reject: "rejected", apply: "applied", close: "closed" } as const)[
        decision as "validate" | "reject" | "apply" | "close"
      ];
      if (!status) return err(400, "decision : validate | reject | apply | close");
      const updated = await store.update("offers", offer.id, { status, decision_note: note ?? offer.decision_note ?? null });
      let process = null;
      if (status === "applied") {
        process = (await store.list("processes")).find((p) => p.offer_id === offer.id) ?? null;
        if (!process) process = await store.insert("processes", { offer_id: offer.id, stage: "applied" });
      }
      return ok({ offer: updated, process });
    }

    if (first === "offers" && second && third === "suggestions" && m === "GET") {
      const res = await suggestForOffer(store, second);
      return res ? ok(res) : err(404, "Offre introuvable");
    }

    if (first === "offers" && second && third === "detail" && m === "GET") {
      const offer = await store.get("offers", second);
      if (!offer) return err(404, "Offre introuvable");
      const [company, processes, interviews, meetings, people] = await Promise.all([
        offer.company_id ? store.get("companies", offer.company_id) : null,
        store.list("processes"),
        store.list("interviews"),
        store.list("meetings"),
        store.list("people"),
      ]);
      const process = processes.find((p) => p.offer_id === offer.id) ?? null;
      const linked = meetings.filter((x) => x.offer_id === offer.id);
      return ok({
        offer,
        company,
        process,
        interviews: process ? interviews.filter((i) => i.process_id === process.id) : [],
        meetings: linked.map((x) => ({ ...x, person: people.find((p) => p.id === x.person_id) ?? null })),
      });
    }

    // --- CRUD générique
    if (first && (TABLE_NAMES as string[]).includes(first)) {
      const table = first as TableName;
      if (!second) {
        if (m === "GET") return ok(await store.list(table));
        if (m === "POST" && WRITABLE.has(table)) return { status: 201, body: await store.insert(table, req.body as never) };
      } else {
        if (m === "GET") {
          const row = await store.get(table, second);
          return row ? ok(row) : err(404, "Introuvable");
        }
        if (m === "PATCH" && WRITABLE.has(table)) {
          const row = await store.update(table, second, req.body as never);
          return row ? ok(row) : err(404, "Introuvable");
        }
        if (m === "DELETE" && WRITABLE.has(table)) {
          return (await cascadeDelete(store, table, second)) ? { status: 204 } : err(404, "Introuvable");
        }
      }
      return err(405, "Méthode non autorisée");
    }

    return err(404, "Route inconnue");
  } catch (e) {
    if (e instanceof ValidationError) return err(400, e.message);
    console.error(e);
    return err(500, e instanceof Error ? e.message : "Erreur interne");
  }
}
