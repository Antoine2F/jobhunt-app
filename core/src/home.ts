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

export interface ActiveProcess {
  process: Process;
  offer: Offer;
  company: Company | null;
  next_interview: Interview | null;
}

export interface HomeView {
  today: string;
  counts: {
    proposed: number;
    validated: number;
    active_processes: number;
    interviews_to_prepare: number;
    people_to_see: number;
  };
  deadlines: Deadline[];
  active: ActiveProcess[];
  to_review: Offer[];
}

const ACTIVE_STAGES = new Set(["applied", "screening", "interviews", "case_study", "final", "offer"]);

export function isActiveProcess(p: Process) {
  return ACTIVE_STAGES.has(p.stage);
}

/** Vue d'accueil : ce qui est en cours à date et les prochaines échéances. */
export async function buildHome(store: Store, now = new Date(), horizonDays = 14): Promise<HomeView> {
  const [offers, companies, processes, interviews, people, meetings] = await Promise.all([
    store.list("offers"),
    store.list("companies"),
    store.list("processes"),
    store.list("interviews"),
    store.list("people"),
    store.list("meetings"),
  ]);
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const offerById = byId(offers);
  const companyById = byId(companies);
  const processById = byId(processes);
  const personById = byId<Person>(people);

  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const deadlines: Deadline[] = [];
  const push = (d: Omit<Deadline, "overdue">) => {
    const t = new Date(d.date);
    if (t > horizon) return;
    deadlines.push({ ...d, overdue: t < startOfToday });
  };

  const offerLabel = (offer: Offer | undefined) => {
    if (!offer) return "Offre supprimée";
    const company = offer.company_id ? companyById.get(offer.company_id)?.name : null;
    return company ? `${offer.title} · ${company}` : offer.title;
  };

  const active = processes.filter(isActiveProcess);
  for (const i of interviews) {
    if (i.status !== "to_prepare" || !i.scheduled_at) continue;
    const proc = processById.get(i.process_id);
    if (!proc || !isActiveProcess(proc)) continue;
    push({
      kind: "interview",
      date: i.scheduled_at,
      title: `Entretien${i.kind ? ` ${i.kind}` : ""}`,
      subtitle: offerLabel(offerById.get(proc.offer_id)),
      link: `/offres/${proc.offer_id}`,
    });
  }
  for (const p of active) {
    if (!p.next_step_date) continue;
    push({
      kind: "process_step",
      date: p.next_step_date,
      title: p.next_step || "Prochaine étape",
      subtitle: offerLabel(offerById.get(p.offer_id)),
      link: `/offres/${p.offer_id}`,
    });
  }
  for (const m of meetings) {
    if (m.status !== "planned" || !m.planned_at) continue;
    const person = personById.get(m.person_id);
    push({
      kind: "meeting",
      date: m.planned_at,
      title: `Rencontre : ${person?.name ?? "contact"}`,
      subtitle: m.topic ?? person?.company_name ?? undefined,
      link: `/reseau/${m.person_id}`,
    });
  }
  deadlines.sort((a, b) => a.date.localeCompare(b.date));

  const nextInterview = (processId: string): Interview | null =>
    interviews
      .filter((i) => i.process_id === processId && i.status === "to_prepare")
      .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"))[0] ?? null;

  return {
    today: now.toISOString(),
    counts: {
      proposed: offers.filter((o) => o.status === "proposed").length,
      validated: offers.filter((o) => o.status === "validated").length,
      active_processes: active.length,
      interviews_to_prepare: interviews.filter((i) => i.status === "to_prepare").length,
      people_to_see: meetings.filter((m: Meeting) => m.status === "to_see" || m.status === "planned").length,
    },
    deadlines,
    active: active
      .map((process) => {
        const offer = offerById.get(process.offer_id);
        return offer
          ? {
              process,
              offer,
              company: offer.company_id ? (companyById.get(offer.company_id) ?? null) : null,
              next_interview: nextInterview(process.id),
            }
          : null;
      })
      .filter((x): x is ActiveProcess => x !== null)
      .sort((a, b) => (a.process.next_step_date ?? "9999").localeCompare(b.process.next_step_date ?? "9999")),
    to_review: offers
      .filter((o) => o.status === "proposed")
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(0, 5),
  };
}
