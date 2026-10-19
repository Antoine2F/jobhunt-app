import { categoryOf, stateOf, type Category, type PipelineState } from "./pipeline.js";
import type { Company, Interview, Meeting, Offer, Person, Process } from "./schema.js";
import type { Store } from "./store.js";

export interface Deadline {
  kind: "interview" | "process_step" | "meeting";
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
  next_interview: Interview | null;
}

export interface HomeView {
  today: string;
  /** Nombre d'offres par famille (nouvelles, intéressantes, à postuler, en attente, pistes, terminées). */
  counts: Record<Category, number>;
  /** Entretiens et prochaines actions des candidatures, sur l'horizon. */
  deadlines: Deadline[];
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

/** Une candidature ou une piste est en cours (pas encore d'issue). */
export function isActiveProcess(offer: Offer, p: Process) {
  const c = categoryOf(stateOf(offer, p));
  return c === "waiting" || c === "lead";
}

/** Vue d'accueil : où en sont les offres, et les prochaines échéances. */
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
  const within = (date: string) => new Date(date) <= horizon;
  const deadline = (d: Omit<Deadline, "overdue">): Deadline => ({ ...d, overdue: new Date(d.date) < startOfToday });

  const nextInterview = (processId: string): Interview | null =>
    interviews
      .filter((i) => i.process_id === processId && i.status === "to_prepare")
      .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"))[0] ?? null;

  const cards: OfferCard[] = offers.map((offer) => {
    const process = processByOffer.get(offer.id) ?? null;
    return {
      offer,
      company: offer.company_id ? (companyById.get(offer.company_id) ?? null) : null,
      process,
      state: stateOf(offer, process),
      next_interview: process ? nextInterview(process.id) : null,
    };
  });
  const counts = { new: 0, interesting: 0, to_apply: 0, waiting: 0, lead: 0, closed: 0 } as Record<Category, number>;
  for (const c of cards) counts[categoryOf(c.state)]++;

  const label = (c: OfferCard) => (c.company ? `${c.offer.title} · ${c.company.name}` : c.offer.title);
  const deadlines: Deadline[] = [];
  for (const c of cards) {
    const cat = categoryOf(c.state);
    if (!c.process || (cat !== "waiting" && cat !== "lead" && cat !== "to_apply")) continue;
    for (const i of interviews) {
      if (i.process_id !== c.process.id || i.status !== "to_prepare" || !i.scheduled_at || !within(i.scheduled_at)) continue;
      deadlines.push(
        deadline({ kind: "interview", date: i.scheduled_at, title: `Entretien${i.kind ? ` ${i.kind}` : ""}`, subtitle: label(c), link: `/offres/${c.offer.id}` }),
      );
    }
    if (c.process.next_step_date && within(c.process.next_step_date)) {
      deadlines.push(
        deadline({
          kind: "process_step",
          date: c.process.next_step_date,
          title: c.process.next_step || "Prochaine étape",
          subtitle: label(c),
          link: `/offres/${c.offer.id}`,
        }),
      );
    }
  }
  deadlines.sort((a, b) => a.date.localeCompare(b.date));

  const networkDeadlines = meetings
    .filter((m: Meeting) => m.status === "planned" && m.planned_at && within(m.planned_at))
    .map((m) => {
      const person = personById.get(m.person_id);
      return deadline({
        kind: "meeting",
        date: m.planned_at!,
        title: `Rencontre : ${person?.name ?? "contact"}`,
        subtitle: m.topic ?? person?.company_name ?? undefined,
        link: `/reseau/${m.person_id}`,
      });
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    today: now.toISOString(),
    counts,
    deadlines,
    leads: cards
      .filter((c) => categoryOf(c.state) === "lead")
      .sort((a, b) => (a.next_interview?.scheduled_at ?? a.process?.next_step_date ?? "9999").localeCompare(b.next_interview?.scheduled_at ?? b.process?.next_step_date ?? "9999")),
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
