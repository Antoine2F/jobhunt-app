import { fillCompanyInfo, keyOf, findOrCreateCompany, type CompanyInfo } from "./ingest.js";
import {
  TABLE_NAMES,
  TABLES,
  ValidationError,
  type Company,
  type InterviewStatus,
  type MeetingStatus,
  type NewRow,
  type Offer,
  type OfferSource,
  type OfferStatus,
  type ProcessStage,
  type StepResult,
  type Row,
  type TableName,
} from "./schema.js";
import { MemoryStore, type Store } from "./store.js";
import { normalizeCompanyName } from "./urls.js";

// Reprise de l'historique (processus déjà lancés, entretiens passés, réseau)
// et revue des offres remontées par la veille. Utilisé par les skills Claude
// Desktop via les routes /api/ingest/*, protégées par la clé d'ingestion.

// --- Revue des offres -------------------------------------------------------

export interface OfferForReview {
  id: string;
  title: string;
  company: string | null;
  company_id: string | null;
  location: string | null;
  remote: string | null;
  contract: string | null;
  salary: string | null;
  url: string | null;
  description: string | null;
  source: string | null;
  status: OfferStatus;
  score: number | null;
  score_reason: string | null;
  received_at: string | null;
  cover_letter_url: string | null;
  cv_url: string | null;
}

export async function listOffersForReview(store: Store, status?: string | null): Promise<OfferForReview[]> {
  const [offers, companies] = await Promise.all([store.list("offers"), store.list("companies")]);
  const name = new Map(companies.map((c) => [c.id, c.name]));
  return offers
    .filter((o) => !status || o.status === status)
    .map((o) => ({
      id: o.id,
      title: o.title,
      company: (o.company_id && name.get(o.company_id)) || null,
      company_id: o.company_id ?? null,
      location: o.location ?? null,
      remote: o.remote ?? null,
      contract: o.contract ?? null,
      salary: o.salary ?? null,
      url: o.url ?? null,
      description: o.description ?? null,
      source: o.source ?? null,
      status: o.status,
      score: o.score ?? null,
      score_reason: o.score_reason ?? null,
      received_at: o.received_at ?? null,
      cover_letter_url: o.cover_letter_url ?? null,
      cv_url: o.cv_url ?? null,
    }));
}

export interface OfferReview {
  score?: number | null;
  /** Précisions trouvées sur la page de l'offre. */
  location?: string | null;
  remote?: string | null;
  salary?: string | null;
  score_reason?: string | null;
  /** Liens Google Drive du dossier de candidature (skill dossier-candidature). */
  cover_letter_url?: string | null;
  cv_url?: string | null;
  /** Seulement pour une offre encore « à valider » : la veille ne revient jamais sur une décision d'Antoine. */
  status?: "proposed" | "validated" | "rejected";
  decision_note?: string | null;
}

export class ConflictError extends Error {}

/** Met à jour la notation d'une offre ; renvoie null si elle n'existe pas. */
export async function reviewOffer(store: Store, id: string, review: OfferReview): Promise<Offer | null> {
  const offer = await store.get("offers", id);
  if (!offer) return null;
  const patch: Record<string, unknown> = {};
  if (review.score !== undefined) patch.score = review.score;
  if (review.score_reason !== undefined) patch.score_reason = review.score_reason;
  if (review.decision_note !== undefined) patch.decision_note = review.decision_note;
  for (const k of ["location", "remote", "salary", "cover_letter_url", "cv_url"] as const) if (review[k] !== undefined) patch[k] = review[k];
  if (review.status !== undefined && review.status !== offer.status) {
    if (!["proposed", "validated", "rejected"].includes(review.status)) {
      throw new ValidationError("status : proposed | validated | rejected");
    }
    if (offer.status !== "proposed") {
      throw new ConflictError(`Offre déjà traitée (statut « ${offer.status} ») : statut inchangé`);
    }
    patch.status = review.status;
  }
  if (!Object.keys(patch).length) return offer;
  return store.update("offers", id, patch as Partial<NewRow<"offers">>);
}

// --- Fiches entreprise ------------------------------------------------------

export async function listCompaniesForReview(store: Store) {
  const [companies, offers] = await Promise.all([store.list("companies"), store.list("offers")]);
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    size: c.size ?? null,
    sector: c.sector ?? null,
    website: c.website ?? null,
    funding: c.funding ?? null,
    headquarters: c.headquarters ?? null,
    dev_offices: c.dev_offices ?? null,
    founders_nationality: c.founders_nationality ?? null,
    capital_origin: c.capital_origin ?? null,
    offers: offers.filter((o) => o.company_id === c.id).length,
  }));
}

/**
 * Complète une fiche entreprise. Par défaut seuls les champs vides sont remplis ;
 * `overwrite: true` remplace aussi les valeurs existantes (correction).
 */
export async function reviewCompany(store: Store, id: string, info: CompanyInfo & { overwrite?: boolean }): Promise<Company | null> {
  const company = await store.get("companies", id);
  if (!company) return null;
  if (!info.overwrite) return fillCompanyInfo(store, company, info);
  const { overwrite: _, ...fields } = info;
  return store.update("companies", id, defined(fields) as Partial<NewRow<"companies">>);
}

// --- Reprise de l'historique -----------------------------------------------

/** Une étape de piste (entretien) ; `kind` est son nom, ex. « Step 1 (HR) ». */
export interface ImportInterview {
  scheduled_at?: string | null;
  kind?: string | null;
  position?: number | null;
  result?: StepResult | null;
  interviewers?: string | null;
  /** Déduit de `result` s'il est absent. */
  status?: InterviewStatus;
  prep_path?: string | null;
  notes?: string | null;
  outcome?: string | null;
}

export interface ImportProcess {
  company: string;
  title: string;
  url?: string | null;
  location?: string | null;
  contract?: string | null;
  salary?: string | null;
  description?: string | null;
  source?: OfferSource | null;
  source_detail?: string | null;
  /** Note de fit (0-100) et son résumé, un point par ligne préfixé « + », « ~ » ou « - ». */
  score?: number | null;
  score_reason?: string | null;
  /** Date de candidature (devient la date de réception de l'offre). */
  applied_at?: string | null;
  company_info?: CompanyInfo | null;
  stage: ProcessStage;
  next_step?: string | null;
  next_step_date?: string | null;
  contact_name?: string | null;
  notes?: string | null;
  interviews?: ImportInterview[];
}

export interface ImportMeeting {
  status: MeetingStatus;
  planned_at?: string | null;
  topic?: string | null;
  outcome?: string | null;
  next_actions?: string | null;
  /** Offre liée, retrouvée comme à l'import (URL, sinon entreprise + intitulé). */
  offer?: { company?: string | null; title: string; url?: string | null } | null;
}

export interface ImportPerson {
  name: string;
  company?: string | null;
  role?: string | null;
  past_companies?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  phone?: string | null;
  strength?: number | null;
  tags?: string | null;
  notes?: string | null;
  meetings?: ImportMeeting[];
}

export interface ImportBundle {
  processes?: ImportProcess[];
  people?: ImportPerson[];
}

export type ImportAction = "created" | "updated" | "unchanged";
export interface ImportItem {
  kind: "offer" | "process" | "interview" | "person" | "meeting";
  action: ImportAction;
  label: string;
}

export interface ImportReport {
  dry_run: boolean;
  counts: Record<ImportItem["kind"], Record<ImportAction, number>>;
  items: ImportItem[];
}

const FINISHED: ProcessStage[] = ["won", "lost", "withdrawn"];

/**
 * Importe l'historique. Idempotent : relancer le même lot ne crée rien de plus
 * (offres par URL ou entreprise + intitulé, entretiens par date, personnes par
 * e-mail, LinkedIn ou nom). Les champs fournis remplacent les valeurs en base ;
 * les champs absents ne sont pas touchés.
 *
 * Le lot est toujours d'abord joué sur une copie en mémoire : s'il contient
 * une erreur, rien n'est écrit.
 */
export async function importHistory(store: Store, bundle: ImportBundle, { dryRun = false } = {}): Promise<ImportReport> {
  const rehearsal = await runImport(await copyOf(store), bundle);
  if (dryRun) return { ...rehearsal, dry_run: true };
  return { ...(await runImport(store, bundle)), dry_run: false };
}

async function copyOf(store: Store): Promise<MemoryStore> {
  const mem = new MemoryStore();
  for (const t of TABLE_NAMES) mem.load(t, (await store.list(t)) as unknown as Record<string, unknown>[]);
  return mem;
}

async function runImport(store: Store, bundle: ImportBundle): Promise<Omit<ImportReport, "dry_run">> {
  const items: ImportItem[] = [];
  const offers = await store.list("offers");
  const companies = await store.list("companies");
  const processes = await store.list("processes");
  const interviews = await store.list("interviews");
  const people = await store.list("people");
  const meetings = await store.list("meetings");

  for (const [i, p] of (bundle.processes ?? []).entries()) {
    const label = `${p.company ?? "?"} — ${p.title ?? "?"}`;
    await located(`processes[${i}] (${label})`, async () => {
      if (!p.company?.trim() || !p.title?.trim()) throw new ValidationError("company et title sont obligatoires");
      const offer = await upsertOffer(store, offers, companies, p, items, label);

      const procFields = defined({
        stage: p.stage,
        next_step: p.next_step,
        next_step_date: p.next_step_date,
        contact_name: p.contact_name,
        notes: p.notes,
      });
      const proc = await upsert(store, "processes", processes, (x) => x.offer_id === offer.id, { offer_id: offer.id, ...procFields }, procFields);
      items.push({ kind: "process", action: proc.action, label: `${label} (${p.stage})` });

      for (const [j, iv] of (p.interviews ?? []).entries()) {
        await located(`interviews[${j}]`, async () => {
          const status = iv.status ?? (!iv.result || iv.result === "to_plan" ? "to_prepare" : "done");
          const fields = defined({ ...iv, status });
          const r = await upsert(
            store,
            "interviews",
            interviews,
            (x) => x.process_id === proc.row.id && sameSlot(x.scheduled_at, iv.scheduled_at, x.kind, iv.kind),
            { process_id: proc.row.id, ...fields },
            fields,
          );
          items.push({ kind: "interview", action: r.action, label: `${label} : ${iv.kind ?? "entretien"} ${iv.scheduled_at?.slice(0, 10) ?? ""}`.trim() });
        });
      }
    });
  }

  for (const [i, person] of (bundle.people ?? []).entries()) {
    await located(`people[${i}] (${person.name ?? "?"})`, async () => {
      if (!person.name?.trim()) throw new ValidationError("name est obligatoire");
      const { meetings: personMeetings, company, ...rest } = person;
      const companyRow = company?.trim() ? await findOrCreateCompany(store, company, companies) : null;
      const fields = defined({ ...rest, name: person.name.trim(), company_name: company, company_id: companyRow?.id });
      const r = await upsert(store, "people", people, (x) => samePerson(x, person), fields, fields);
      items.push({ kind: "person", action: r.action, label: person.name });

      for (const [j, m] of (personMeetings ?? []).entries()) {
        await located(`meetings[${j}]`, async () => {
          const { offer: offerRef, ...meetingRest } = m;
          const linked = offerRef ? findOffer(offers, companies, offerRef) : undefined;
          if (offerRef && !linked) throw new ValidationError(`offre liée introuvable : ${offerRef.company ?? ""} — ${offerRef.title}`);
          const mf = defined({ ...meetingRest, offer_id: linked?.id });
          const mr = await upsert(
            store,
            "meetings",
            meetings,
            (x) => x.person_id === r.row.id && sameSlot(x.planned_at, m.planned_at, x.topic, m.topic),
            { person_id: r.row.id, ...mf },
            mf,
          );
          items.push({ kind: "meeting", action: mr.action, label: `${person.name} : ${m.topic ?? "rencontre"} ${m.planned_at?.slice(0, 10) ?? ""}`.trim() });
        });
      }
    });
  }

  const counts = {} as ImportReport["counts"];
  for (const kind of ["offer", "process", "interview", "person", "meeting"] as const) {
    counts[kind] = { created: 0, updated: 0, unchanged: 0 };
  }
  for (const it of items) counts[it.kind][it.action]++;
  return { counts, items };
}

async function upsertOffer(
  store: Store,
  offers: Offer[],
  companies: Company[],
  p: ImportProcess,
  items: ImportItem[],
  label: string,
): Promise<Offer> {
  const key = keyOf(p);
  // « À postuler » : l'offre est retenue en candidature directe, rien n'est encore envoyé.
  const status: OfferStatus = FINISHED.includes(p.stage) ? "closed" : p.stage === "to_apply" ? "validated" : "applied";
  const found = await findOrCreateCompany(store, p.company, companies);
  const company = await fillCompanyInfo(store, found, p.company_info);
  companies[companies.indexOf(found)] = company;
  const fields = defined({
    title: p.title.trim(),
    company_id: company.id,
    location: p.location,
    contract: p.contract,
    salary: p.salary,
    url: p.url,
    description: p.description,
    source_detail: p.source_detail,
    score: p.score,
    score_reason: p.score_reason,
    status,
    approach: p.stage === "to_apply" ? "direct" : undefined,
  });
  const existing = findOffer(offers, companies, p);
  const r = await upsert(
    store,
    "offers",
    offers,
    (o) => o === existing,
    { ...fields, url_key: key, source: p.source ?? "other", received_at: p.applied_at ?? new Date().toISOString() },
    fields,
  );
  items.push({ kind: "offer", action: r.action, label });
  return r.row;
}

/** Retrouve une ligne ou la crée ; met à jour uniquement les champs qui changent. */
async function upsert<T extends TableName>(
  store: Store,
  table: T,
  cache: Row<T>[],
  match: (row: Row<T>) => boolean,
  create: Record<string, unknown>,
  update: Record<string, unknown>,
): Promise<{ row: Row<T>; action: ImportAction }> {
  const found = cache.find(match);
  if (!found) {
    const row = await store.insert(table, create as NewRow<T>);
    cache.push(row);
    return { row, action: "created" };
  }
  const cols = TABLES[table] as Record<string, unknown>;
  const changed = Object.fromEntries(
    Object.entries(update).filter(([k, v]) => k in cols && !sameValue((found as Record<string, unknown>)[k], v)),
  );
  if (!Object.keys(changed).length) return { row: found, action: "unchanged" };
  const row = (await store.update(table, found.id, changed as Partial<NewRow<T>>))!;
  cache[cache.indexOf(found)] = row;
  return { row, action: "updated" };
}

/**
 * Retrouve une offre par son URL, sinon par entreprise + intitulé : la même
 * offre peut être arrivée par la veille (lien LinkedIn) et être reprise ici
 * avec le lien du site carrière.
 */
function findOffer(offers: Offer[], companies: Company[], ref: { company?: string | null; title: string; url?: string | null }) {
  const key = keyOf(ref);
  const byKey = offers.find((o) => o.url_key === key);
  if (byKey || !ref.company) return byKey;
  const company = normalizeCompanyName(ref.company);
  const ids = new Set(companies.filter((c) => normalizeCompanyName(c.name) === company).map((c) => c.id));
  return offers.find((o) => o.company_id && ids.has(o.company_id) && norm(o.title) === norm(ref.title));
}

function defined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function sameValue(a: unknown, b: unknown): boolean {
  if ((a ?? null) === (b ?? null)) return true;
  // Les dates reviennent de la base au format ISO complet.
  if (typeof a === "string" && typeof b === "string" && !Number.isNaN(Date.parse(a)) && !Number.isNaN(Date.parse(b))) {
    return /\d{4}-\d{2}-\d{2}/.test(a) && /\d{4}-\d{2}-\d{2}/.test(b) && Date.parse(a) === Date.parse(b);
  }
  return false;
}

/** Même créneau : même minute si les deux ont une date, sinon même libellé. */
function sameSlot(dateA: string | null | undefined, dateB: string | null | undefined, labelA?: string | null, labelB?: string | null) {
  if (dateA && dateB) return Math.floor(Date.parse(dateA) / 60000) === Math.floor(Date.parse(dateB) / 60000);
  if (dateA || dateB) return false;
  return norm(labelA) === norm(labelB);
}

function samePerson(x: Row<"people">, p: ImportPerson): boolean {
  if (p.email && x.email && p.email.trim().toLowerCase() === x.email.trim().toLowerCase()) return true;
  if (p.linkedin_url && x.linkedin_url && linkedinId(p.linkedin_url) === linkedinId(x.linkedin_url)) return true;
  if (norm(x.name) !== norm(p.name)) return false;
  const a = x.company_name ? normalizeCompanyName(x.company_name) : "";
  const b = p.company ? normalizeCompanyName(p.company) : "";
  return !a || !b || a === b;
}

function linkedinId(url: string) {
  return url.toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/)?.[1] ?? url.toLowerCase();
}

function norm(s: string | null | undefined) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function located(where: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ValidationError) throw new ValidationError(`${where} : ${e.message}`);
    throw e;
  }
}
