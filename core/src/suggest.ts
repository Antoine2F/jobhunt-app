import type { Company, Introduction, Offer, Person } from "./schema.js";
import type { Store } from "./store.js";
import { normalizeCompanyName } from "./urls.js";

export interface ContactSuggestion {
  person: Person;
  score: number;
  reasons: string[];
  /** Personne de ton réseau qui peut te présenter, quand le lien n'est pas direct. */
  via?: Person;
}

export interface SuggestionResult {
  company: Company | null;
  suggestions: ContactSuggestion[];
  /** Recherche LinkedIn préremplie (personnes de l'entreprise, 1er et 2e degré). */
  linkedin_search_url: string | null;
  /** Autres recherches LinkedIn : anciens de mes écoles et employeurs dans l'entreprise. */
  linkedin_searches: { label: string; url: string }[];
}

const splitList = (s?: string | null) =>
  (s ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function linkedinPeopleSearch(companyName: string, affinity?: string): string {
  const params = new URLSearchParams({
    keywords: affinity ? `${companyName} ${affinity}` : companyName,
    // Relations directes et de 2e degré ; pour une affinité (même école,
    // même ancien employeur), on élargit au 3e degré : le point commun suffit
    // souvent pour un premier message.
    network: affinity ? '["F","S","O"]' : '["F","S"]',
    origin: "FACETED_SEARCH",
  });
  return `https://www.linkedin.com/search/results/people/?${params}`;
}

/** Affinités (écoles, anciens employeurs) lues dans NETWORK_AFFINITIES, séparées par des virgules. */
export function affinitiesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return splitList(env.NETWORK_AFFINITIES);
}

/**
 * Propose des contacts pour une offre :
 *  - personnes qui travaillent dans l'entreprise (lien direct) ;
 *  - personnes qui y sont passées ;
 *  - personnes qui t'ont déjà présenté quelqu'un de l'entreprise, ou qui
 *    connaissent un contact de l'entreprise (chemin d'introduction) ;
 *  - personnes dont les tags recoupent le secteur.
 */
export function suggestContacts(
  offer: Offer,
  companies: Company[],
  people: Person[],
  intros: Introduction[],
  affinities: string[] = [],
): SuggestionResult {
  const company = companies.find((c) => c.id === offer.company_id) ?? null;
  if (!company) return { company: null, suggestions: [], linkedin_search_url: null, linkedin_searches: [] };

  const target = normalizeCompanyName(company.name);
  const sameCompany = (name?: string | null) => !!name && normalizeCompanyName(name) === target;
  const worksThere = (p: Person) => p.company_id === company.id || sameCompany(p.company_name);
  const personById = new Map(people.map((p) => [p.id, p]));
  const out = new Map<string, ContactSuggestion>();
  const add = (person: Person, score: number, reason: string, via?: Person) => {
    const cur = out.get(person.id) ?? { person, score: 0, reasons: [] };
    cur.score += score;
    cur.reasons.push(reason);
    if (via && !cur.via) cur.via = via;
    out.set(person.id, cur);
  };

  const insiders = people.filter(worksThere);
  for (const p of insiders) {
    add(p, 60 + 10 * (p.strength ?? 1), `Travaille chez ${company.name}${p.role ? ` (${p.role})` : ""}`);
  }
  for (const p of people) {
    if (worksThere(p)) continue;
    if (splitList(p.past_companies).some(sameCompany)) {
      add(p, 40 + 5 * (p.strength ?? 1), `A travaillé chez ${company.name}`);
    }
  }

  // Chemins d'introduction : qui connaît un insider ?
  for (const i of intros) {
    const introduced = personById.get(i.introduced_id);
    const introducer = personById.get(i.introducer_id);
    if (!introduced || !introducer) continue;
    const aboutCompany = i.target_company_id === company.id || worksThere(introduced);
    if (!aboutCompany) continue;
    if (!worksThere(introducer)) {
      add(introducer, 30, `Connaît ${introduced.name}${worksThere(introduced) ? ` (chez ${company.name})` : ""}`);
    }
    if (worksThere(introduced) && i.status !== "done") {
      const s = out.get(introduced.id);
      if (s && !s.via) s.via = introducer;
    }
  }

  if (company.sector) {
    const sector = company.sector.toLowerCase();
    for (const p of people) {
      if (splitList(p.tags).some((t) => t.toLowerCase() === sector)) {
        add(p, 10, `Réseau du secteur ${company.sector}`);
      }
    }
  }

  return {
    company,
    suggestions: [...out.values()].sort((a, b) => b.score - a.score).slice(0, 10),
    linkedin_search_url: linkedinPeopleSearch(company.name),
    linkedin_searches: [
      { label: `Mes relations chez ${company.name}`, url: linkedinPeopleSearch(company.name) },
      ...affinities
        .filter((a) => normalizeCompanyName(a) !== normalizeCompanyName(company.name))
        .map((a) => ({ label: `${a} chez ${company.name}`, url: linkedinPeopleSearch(company.name, a) })),
    ],
  };
}

export async function suggestForOffer(store: Store, offerId: string, affinities: string[] = []): Promise<SuggestionResult | null> {
  const offer = await store.get("offers", offerId);
  if (!offer) return null;
  const [companies, people, intros] = await Promise.all([
    store.list("companies"),
    store.list("people"),
    store.list("introductions"),
  ]);
  return suggestContacts(offer, companies, people, intros, affinities);
}
