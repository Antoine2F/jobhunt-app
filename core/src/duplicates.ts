import { normTitle, sameOffer } from "./offers.js";
import { categoryOf, stateOf, STEP_LABEL, EXIT_LABEL, type PipelineState } from "./pipeline.js";
import type { Company, Offer, Process } from "./schema.js";
import type { Store } from "./store.js";
import { normalizeCompanyName, offerKey } from "./urls.js";

// Page « Doublons » : les paires d'offres qui se ressemblent assez pour être
// la même, comparées champ par champ, avec la raison pour laquelle la veille
// ne les a pas fusionnées toute seule.

export interface DuplicateSide {
  offer: Offer;
  company: Company | null;
  state: PipelineState;
  /** Libellé lisible de l'étape, ex. « Postulé », « Pas intéressante ». */
  step_label: string;
}

export interface FieldComparison {
  field: string;
  label: string;
  a: string;
  b: string;
  same: boolean;
}

export interface DuplicateCandidate {
  key: string;
  a: DuplicateSide;
  b: DuplicateSide;
  /** 0 à 1 : part des mots de l'intitulé en commun. */
  similarity: number;
  fields: FieldComparison[];
  /** Pourquoi elles n'ont pas été considérées comme la même offre à l'arrivée. */
  why_not_merged: string[];
  /** Offre qu'il vaut mieux garder (la plus avancée, sinon la plus complète). */
  suggested_keep: "a" | "b";
}

const STOP = new Set(["de", "du", "des", "la", "le", "les", "en", "et", "of", "the", "and", "for", "pour", "a", "au", "aux", "d", "l"]);

function words(title: string) {
  return new Set(normTitle(title).split(" ").filter((w) => w && !STOP.has(w)));
}

/** Part des mots en commun (Jaccard), ou 1 si les mots de l'un sont tous dans l'autre. */
export function titleSimilarity(a: string, b: string) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  const common = [...wa].filter((w) => wb.has(w)).length;
  if (common === Math.min(wa.size, wb.size)) return 1;
  return common / (wa.size + wb.size - common);
}

function sameCompany(a: Company | null, b: Company | null) {
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  const na = normalizeCompanyName(a.name);
  const nb = normalizeCompanyName(b.name);
  return na === nb || (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na)));
}

function host(url?: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function stepLabel(s: PipelineState, o: Offer) {
  if (s.exit === "rejected" || s.exit === "not_applying") return o.decision_note ? `${EXIT_LABEL[s.exit]} · ${o.decision_note}` : EXIT_LABEL[s.exit];
  return s.exit ? `${STEP_LABEL[s.step]} · ${EXIT_LABEL[s.exit]}` : STEP_LABEL[s.step];
}

/** Seuil de ressemblance des intitulés pour proposer une paire. */
const MIN_SIMILARITY = 0.5;

export async function findDuplicateCandidates(store: Store): Promise<DuplicateCandidate[]> {
  const [offers, companies, processes, dismissals] = await Promise.all([
    store.list("offers"),
    store.list("companies"),
    store.list("processes"),
    store.list("duplicate_dismissals"),
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const processByOffer = new Map<string, Process>(processes.map((p) => [p.offer_id, p]));
  const dismissed = new Set(dismissals.map((d) => pairKey(d.offer_a, d.offer_b)));
  const side = (o: Offer): DuplicateSide => {
    const state = stateOf(o, processByOffer.get(o.id));
    return { offer: o, company: o.company_id ? (companyById.get(o.company_id) ?? null) : null, state, step_label: stepLabel(state, o) };
  };

  const out: DuplicateCandidate[] = [];
  for (let i = 0; i < offers.length; i++) {
    for (let j = i + 1; j < offers.length; j++) {
      // La plus ancienne à gauche.
      const [x, y] = arrived(offers[i]) <= arrived(offers[j]) ? [offers[i], offers[j]] : [offers[j], offers[i]];
      if (dismissed.has(pairKey(x.id, y.id))) continue;
      const a = side(x);
      const b = side(y);
      if (!sameCompany(a.company, b.company)) continue;
      const similarity = titleSimilarity(x.title, y.title);
      if (similarity < MIN_SIMILARITY) continue;
      out.push({
        key: pairKey(x.id, y.id),
        a,
        b,
        similarity: Math.round(similarity * 100) / 100,
        fields: compare(a, b),
        why_not_merged: whyNotMerged(a, b, companies),
        suggested_keep: suggestKeep(a, b),
      });
    }
  }
  return out.sort((p, q) => q.similarity - p.similarity);
}

/** « Ce ne sont pas des doublons » : la paire n'est plus proposée. */
export async function dismissDuplicate(store: Store, a: string, b: string) {
  const [x, y] = [a, b].sort();
  const exists = (await store.list("duplicate_dismissals")).some((d) => d.offer_a === x && d.offer_b === y);
  if (!exists) await store.insert("duplicate_dismissals", { offer_a: x, offer_b: y });
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function arrived(o: Offer) {
  return o.received_at ?? o.created_at;
}

function compare(a: DuplicateSide, b: DuplicateSide): FieldComparison[] {
  const row = (field: string, label: string, va: string | null | undefined, vb: string | null | undefined, eq?: (x: string, y: string) => boolean) => {
    const x = (va ?? "").trim();
    const y = (vb ?? "").trim();
    const same = eq ? eq(x, y) : x.toLowerCase() === y.toLowerCase();
    return { field, label, a: x || "—", b: y || "—", same };
  };
  const date = (o: Offer) => arrived(o).slice(0, 10);
  return [
    row("title", "Intitulé", a.offer.title, b.offer.title, (x, y) => normTitle(x) === normTitle(y)),
    row("company", "Entreprise", a.company?.name, b.company?.name, (x, y) => normalizeCompanyName(x) === normalizeCompanyName(y)),
    row("location", "Lieu", a.offer.location, b.offer.location),
    row("remote", "Télétravail", a.offer.remote, b.offer.remote),
    row("contract", "Contrat", a.offer.contract, b.offer.contract),
    row("salary", "Salaire", a.offer.salary, b.offer.salary),
    row("source", "Source", [a.offer.source, a.offer.source_detail].filter(Boolean).join(" · "), [b.offer.source, b.offer.source_detail].filter(Boolean).join(" · ")),
    row("url", "Lien", host(a.offer.url), host(b.offer.url), () => !!a.offer.url && offerKey(a.offer.url) === offerKey(b.offer.url)),
    row("received", "Reçue le", date(a.offer), date(b.offer)),
    row("score", "Note", a.offer.score?.toString(), b.offer.score?.toString()),
    row("step", "Étape", a.step_label, b.step_label),
  ].filter((r) => r.a !== "—" || r.b !== "—"); // rien à comparer quand les deux sont vides
}

/** Ce qui a empêché la veille de les reconnaître (elle fusionne même lien, ou même entreprise + même intitulé). */
function whyNotMerged(a: DuplicateSide, b: DuplicateSide, companies: Company[]): string[] {
  const why: string[] = [];
  const sameTitle = normTitle(a.offer.title) === normTitle(b.offer.title);
  const ka = offerKey(a.offer.url);
  const kb = offerKey(b.offer.url);
  if (sameOffer(a.offer, b.offer, companies)) {
    why.push(
      "Même entreprise et même intitulé : la veille l'aurait écartée aujourd'hui. Elle est arrivée avant cette règle, ou par une autre voie (ajout à la main, import de l'historique, nouvelle offre), qui ne la vérifie pas.",
    );
  } else {
    if (!sameTitle) why.push(`Intitulés différents (« ${a.offer.title} » / « ${b.offer.title} ») : la veille ne fusionne que des intitulés identiques, pour ne pas confondre deux postes proches de la même entreprise.`);
    if (a.company && b.company && a.company.id !== b.company.id) {
      why.push(`Entreprise enregistrée deux fois (« ${a.company.name} » / « ${b.company.name} ») : pas reconnue comme la même.`);
    }
  }
  if (ka && kb && ka !== kb) why.push(`Liens différents (${host(a.offer.url)} / ${host(b.offer.url)}) : l'annonce a été vue à deux endroits, ou republiée.`);
  else if (!ka || !kb) why.push("Une des deux offres n'a pas de lien d'annonce : pas de comparaison possible par le lien.");
  return why;
}

function suggestKeep(a: DuplicateSide, b: DuplicateSide): "a" | "b" {
  const rank = (s: DuplicateSide) => {
    const c = categoryOf(s.state);
    const progress = { lead: 6, won: 6, waiting: 5, lead_failed: 4, cv_refused: 4, to_apply: 3, new: 1, not_considered: 0 }[c] ?? 0;
    const filled = ["url", "location", "salary", "description", "score", "score_reason"].filter((k) => s.offer[k as keyof Offer] != null).length;
    return progress * 10 + filled;
  };
  return rank(b) > rank(a) ? "b" : "a";
}
