import type { Company, Offer, OfferSource } from "./schema.js";
import { sameOffer } from "./offers.js";
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
  /** Politique de télétravail, ex. « 2 j/sem. ». */
  remote?: string | null;
  score?: number | null;
  score_reason?: string | null;
  /** Détail de la note, critère par critère (fiche de l'offre). */
  score_details?: string | null;
  /** Ce que la veille a appris de l'entreprise ; ne complète que les champs encore vides. */
  company_info?: CompanyInfo | null;
}

/** Infos d'entreprise utiles pour décider : activité, effectif, secteur, financement, siège. */
export interface CompanyInfo {
  description?: string | null;
  size?: string | null;
  sector?: string | null;
  website?: string | null;
  funding?: string | null;
  headquarters?: string | null;
  /** B2B, B2C ou B2B2C. */
  market?: string | null;
  dev_offices?: string | null;
  founders_nationality?: string | null;
  capital_origin?: string | null;
}

const COMPANY_INFO_FIELDS = [
  "description",
  "size",
  "sector",
  "website",
  "funding",
  "headquarters",
  "market",
  "dev_offices",
  "founders_nationality",
  "capital_origin",
] as const;

/** Complète les champs vides d'une entreprise sans écraser ce qui a été saisi. */
export async function fillCompanyInfo(store: Store, company: Company, info: CompanyInfo | null | undefined): Promise<Company> {
  if (!info) return company;
  const patch: Record<string, string> = {};
  for (const k of COMPANY_INFO_FIELDS) {
    const v = info[k]?.trim();
    if (v && !company[k]) patch[k] = v;
  }
  if (!Object.keys(patch).length) return company;
  return (await store.update("companies", company.id, patch)) ?? company;
}

export interface IngestPayload {
  source: OfferSource;
  source_detail?: string | null;
  /** Identifiant du message e-mail d'origine, pour ne jamais le retraiter. */
  message_id?: string | null;
  received_at?: string | null;
  /** "proposed" (nouvelle) par défaut ; "interesting" quand c'est toi qui ajoutes l'offre. */
  status?: "proposed" | "interesting" | "validated";
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
    // Doublon : même lien, ou même intitulé dans la même entreprise (offre republiée, autre alerte, autre site).
    const companyName = o.company?.trim() ? normalizeCompanyName(o.company) : null;
    const companyId = companyName ? companies.find((c) => normalizeCompanyName(c.name) === companyName)?.id : undefined;
    const sameTitle = companyId && existing.some((e) => sameOffer(e, { company_id: companyId, title: o.title }, companies));
    if (keys.has(key) || sameTitle) {
      duplicates++;
      // Même en doublon, l'entreprise peut gagner des informations.
      if (o.company?.trim() && o.company_info) {
        await fillCompanyInfo(store, await findOrCreateCompany(store, o.company, companies), o.company_info);
      }
      continue;
    }
    keys.add(key);
    let company = o.company?.trim() ? await findOrCreateCompany(store, o.company, companies) : null;
    if (company) {
      company = await fillCompanyInfo(store, company, o.company_info);
      companies[companies.findIndex((c) => c.id === company!.id)] = company;
    }
    const row = await store.insert("offers", {
      title: o.title.trim(),
      company_id: company?.id ?? null,
      location: o.location ?? null,
      remote: o.remote ?? null,
      contract: o.contract ?? null,
      salary: o.salary ?? null,
      url: o.url ?? null,
      url_key: key,
      description: o.description ?? null,
      score: o.score ?? null,
      score_reason: o.score_reason ?? null,
      score_details: o.score_details ?? null,
      source: payload.source,
      source_detail: payload.source_detail ?? null,
      status: payload.status ?? "proposed",
      received_at: payload.received_at ?? new Date().toISOString(),
    });
    created.push(row);
    existing.push(row);
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
