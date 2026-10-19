import { CATEGORIES, categoryOf, currentStep, stateOf, type Category, type PipelineState } from "./pipeline.js";
import type { Company, Interview, Meeting, Offer, Person, Process } from "./schema.js";
import type { Store } from "./store.js";

export interface Deadline {
  kind: "meeting";
  date: string;
  title: string;
  subtitle?: string;
  /** Route de l'appli web vers l'élément concerné. */
  link: string;
  overdue: boolean;
}

export interface OfferCard {
  offer: Offer;
  company: Company | null;
  process: Process | null;
  state: PipelineState;
  /** Piste : l'étape en cours (la première sans retour positif). */
  current_step: Interview | null;
}

export interface HomeView {
  today: string;
  /** Nombre d'offres par famille (nouvelles, intéressantes, à postuler, en attente, pistes, issues). */
  counts: Record<Category, number>;
  /** Pistes : l'entreprise a manifesté son intérêt. */
  leads: OfferCard[];
  /** Dernières offres arrivées, les plus récentes d'abord. */
  latest: OfferCard[];
  network: {
    people_to_see: number;
    deadlines: Deadline[];
  };
}

/** Date d'arrivée d'une offre : celle de l'alerte, sinon son enregistrement. */
export function arrivedAt(o: Offer) {
  return o.received_at ?? o.created_at;
}

/** Vue d'accueil : où en sont les offres, et les rencontres réseau à venir. */
export async function buildHome(store: Store, now = new Date(), horizonDays = 14): Promise<HomeView> {
  const [offers, companies, processes, interviews, people, meetings] = await Promise.all([
    store.list("offers"),
    store.list("companies"),
    store.list("processes"),
    store.list("interviews"),
    store.list("people"),
    store.list("meetings"),
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const processByOffer = new Map(processes.map((p) => [p.offer_id, p]));
  const personById = new Map<string, Person>(people.map((p) => [p.id, p]));

  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const cards: OfferCard[] = offers.map((offer) => {
    const process = processByOffer.get(offer.id) ?? null;
    return {
      offer,
      company: offer.company_id ? (companyById.get(offer.company_id) ?? null) : null,
      process,
      state: stateOf(offer, process),
      current_step: process ? currentStep(interviews.filter((i) => i.process_id === process.id)) : null,
    };
  });
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<Category, number>;
  for (const c of cards) counts[categoryOf(c.state)]++;

  // Les seules dates connues d'avance sont celles des rencontres réseau planifiées.
  const networkDeadlines: Deadline[] = meetings
    .filter((m: Meeting) => m.status === "planned" && m.planned_at && new Date(m.planned_at) <= horizon)
    .map((m) => {
      const person = personById.get(m.person_id);
      return {
        kind: "meeting" as const,
        date: m.planned_at!,
        title: `Rencontre : ${person?.name ?? "contact"}`,
        subtitle: m.topic ?? person?.company_name ?? undefined,
        link: `/reseau/${m.person_id}`,
        overdue: new Date(m.planned_at!) < startOfToday,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    today: now.toISOString(),
    counts,
    leads: cards.filter((c) => categoryOf(c.state) === "lead").sort((a, b) => b.offer.updated_at.localeCompare(a.offer.updated_at)),
    latest: cards
      .filter((c) => categoryOf(c.state) === "new")
      .sort((a, b) => arrivedAt(b.offer).localeCompare(arrivedAt(a.offer)))
      .slice(0, 5),
    network: {
      people_to_see: meetings.filter((m) => m.status === "to_see" || m.status === "planned").length,
      deadlines: networkDeadlines,
    },
  };
}
