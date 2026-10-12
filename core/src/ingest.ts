import type { Company, Offer, OfferSource } from "./schema.js";
import type { Store } from "./store.js";
import { fallbackKey, normalizeCompanyName, offerKey } from "./urls.js";

/** Une offre telle qu'extraite d'un e-mail d'alerte, d'une page ou saisie à la main. */
export interface IncomingOffer {
  title: string;
  company?: string | null;
  location?: string | null;
  contract?: string | null;
  salary?: string | null;
  url?: string | null;
  description?: string | null;
  score?: number | null;
  score_reason?: string | null;
}

export interface IngestPayload {
  source: OfferSource;
  source_detail?: string | null;
  /** Identifiant du message e-mail d'origine, pour ne jamais le retraiter. */
  message_id?: string | null;
  received_at?: string | null;
  /** "proposed" par défaut ; "validated" quand c'est toi qui ajoutes l'offre. */
  status?: "proposed" | "validated";
  offers: IncomingOffer[];
}

export interface IngestResult {
  created: Offer[];
  duplicates: number;
}

export function keyOf(o: { url?: string | null; company?: string | null; title: string }) {
  return offerKey(o.url) ?? fallbackKey(o.company, o.title);
}

export async function findOrCreateCompany(store: Store, name: string, cache?: Company[]): Promise<Company> {
  const companies = cache ?? (await store.list("companies"));
  const norm = normalizeCompanyName(name);
  const found = companies.find((c) => normalizeCompanyName(c.name) === norm);
  if (found) return found;
  const created = await store.insert("companies", { name: name.trim() });
  companies.push(created);
  return created;
}

export async function applyIngest(store: Store, payload: IngestPayload): Promise<IngestResult> {
  const existing = await store.list("offers");
  const keys = new Set(existing.map((o) => o.url_key).filter(Boolean));
  const companies = await store.list("companies");
  const created: Offer[] = [];
  let duplicates = 0;

  for (const o of payload.offers) {
    if (!o.title?.trim()) continue;
    const key = keyOf(o);
    if (keys.has(key)) {
      duplicates++;
      continue;
    }
    keys.add(key);
    const company = o.company?.trim() ? await findOrCreateCompany(store, o.company, companies) : null;
    created.push(
      await store.insert("offers", {
        title: o.title.trim(),
        company_id: company?.id ?? null,
        location: o.location ?? null,
        contract: o.contract ?? null,
        salary: o.salary ?? null,
        url: o.url ?? null,
        url_key: key,
        description: o.description ?? null,
        score: o.score ?? null,
        score_reason: o.score_reason ?? null,
        source: payload.source,
        source_detail: payload.source_detail ?? null,
        status: payload.status ?? "proposed",
        received_at: payload.received_at ?? new Date().toISOString(),
      }),
    );
  }

  if (payload.message_id) {
    await store.insert("ingested_messages", {
      message_id: payload.message_id,
      source: payload.source,
      offers_found: payload.offers.length,
    });
  }
  return { created, duplicates };
}

/** Renvoie, parmi `ids`, les messages jamais traités. */
export async function unseenMessages(store: Store, ids: string[]): Promise<string[]> {
  const seen = new Set((await store.list("ingested_messages")).map((m) => m.message_id));
  return ids.filter((id) => !seen.has(id));
}
