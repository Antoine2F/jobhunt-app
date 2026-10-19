import { categoryOf, DEFAULT_LEAD_STEPS, resultOf, sortSteps, stateOf, STEPS, type Exit, type PipelineState, type Step } from "./pipeline.js";
import { ValidationError, type Company, type Interview, type NewRow, type Offer, type OfferStatus, type Process, type StepResult } from "./schema.js";
import type { Store } from "./store.js";
import { normalizeCompanyName } from "./urls.js";

// Faire avancer une offre dans son parcours, et regrouper les doublons.

export type Move = { step: Step } | { exit: Exit };

const STATUS_BEFORE_APPLYING: Partial<Record<Step, OfferStatus>> = {
  new: "proposed",
  interesting: "interesting",
  to_apply: "validated",
};

export interface MoveResult {
  offer: Offer;
  process: Process | null;
  state: PipelineState;
}

/**
 * Amène l'offre à une étape (même plusieurs plus loin, en un clic) ou l'arrête.
 * Revenir en arrière est permis, pour corriger un clic. Passer en piste crée
 * les étapes par défaut (« Step 1 (HR) »…) si la piste n'en a pas encore.
 */
export async function moveOffer(store: Store, offerId: string, move: Move): Promise<MoveResult | null> {
  const offer = await store.get("offers", offerId);
  if (!offer) return null;
  let process = (await store.list("processes")).find((p) => p.offer_id === offerId) ?? null;

  const ensureProcess = async (stage: Process["stage"]) =>
    process
      ? (process = await store.update("processes", process.id, { stage, outcome: null }))!
      : (process = await store.insert("processes", { offer_id: offerId, stage }));

  let status: OfferStatus;
  if ("step" in move) {
    if (!STEPS.some((s) => s.key === move.step)) throw new ValidationError(`étape « ${move.step} » inconnue`);
    if (move.step === "applied" || move.step === "lead" || move.step === "won") {
      await ensureProcess(move.step);
      if (move.step === "lead") await ensureLeadSteps(store, process!.id);
      status = move.step === "won" ? "closed" : "applied";
    } else {
      // Avant la candidature : le processus éventuel (notes, contact) est gardé, remis « à postuler ».
      if (process) await ensureProcess("to_apply");
      status = STATUS_BEFORE_APPLYING[move.step]!;
    }
  } else {
    const current = stateOf(offer, process);
    switch (move.exit) {
      case "rejected":
      case "not_applying":
        status = move.exit;
        break;
      case "lost":
      case "withdrawn":
        // Un refus suppose une candidature : CV refusé (postulé) ou piste en échec.
        await ensureProcess(current.step === "lead" ? "lead" : "applied");
        process = (await store.update("processes", process!.id, { outcome: move.exit }))!;
        status = "closed";
        break;
      default:
        throw new ValidationError(`sortie « ${(move as { exit: string }).exit} » inconnue`);
    }
  }
  const updated = (await store.update("offers", offerId, { status }))!;
  return { offer: updated, process, state: stateOf(updated, process) };
}

async function ensureLeadSteps(store: Store, processId: string) {
  const existing = (await store.list("interviews")).filter((i) => i.process_id === processId);
  if (existing.length) return;
  for (const [i, name] of DEFAULT_LEAD_STEPS.entries()) {
    await store.insert("interviews", { process_id: processId, kind: name, position: i + 1, result: "to_plan", status: "to_prepare" });
  }
}

/** Ancien statut d'entretien tenu à jour pour les pages qui le lisent encore. */
const STATUS_OF_RESULT: Record<StepResult, Interview["status"]> = {
  to_plan: "to_prepare",
  waiting: "done",
  positive: "done",
  negative: "done",
};

/**
 * Enregistre le retour d'une étape de piste. Un retour négatif met la piste en
 * échec ; le corriger la rouvre (sauf si je me suis retiré).
 */
export async function setStepResult(store: Store, stepId: string, result: StepResult): Promise<MoveResult | null> {
  const step = await store.get("interviews", stepId);
  if (!step) return null;
  if (!(result in STATUS_OF_RESULT)) throw new ValidationError(`résultat « ${result} » inconnu`);
  await store.update("interviews", stepId, { result, status: STATUS_OF_RESULT[result] });
  let process = (await store.get("processes", step.process_id))!;
  const offer = (await store.get("offers", process.offer_id))!;
  const steps = (await store.list("interviews")).filter((i) => i.process_id === process.id);
  const failed = steps.some((i) => i.result === "negative");
  let status = offer.status;
  if (failed && !process.outcome) {
    process = (await store.update("processes", process.id, { stage: "lead", outcome: "lost" }))!;
    status = "closed";
  } else if (!failed && process.outcome === "lost") {
    process = (await store.update("processes", process.id, { outcome: null }))!;
    status = "applied";
  }
  const updated = status === offer.status ? offer : (await store.update("offers", offer.id, { status }))!;
  return { offer: updated, process, state: stateOf(updated, process) };
}

// --- Doublons ---------------------------------------------------------------

function normTitle(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(h\/f|f\/h|m\/f|f\/m|w\/m|cdi)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Même entreprise et même intitulé (à la casse, aux accents et à « H/F » près). */
export function sameOffer(a: Pick<Offer, "company_id" | "title">, b: Pick<Offer, "company_id" | "title">, companies: Company[]) {
  if (!a.company_id || !b.company_id) return false;
  if (a.company_id !== b.company_id) {
    const name = (id: string) => normalizeCompanyName(companies.find((c) => c.id === id)?.name ?? id);
    if (name(a.company_id) !== name(b.company_id)) return false;
  }
  return normTitle(a.title) === normTitle(b.title);
}

/** Groupes de doublons probables (au moins deux offres). */
export async function findDuplicates(store: Store): Promise<Offer[][]> {
  const [offers, companies] = await Promise.all([store.list("offers"), store.list("companies")]);
  const groups: Offer[][] = [];
  for (const o of offers) {
    const g = groups.find((g) => sameOffer(g[0], o, companies));
    if (g) g.push(o);
    else groups.push([o]);
  }
  return groups.filter((g) => g.length > 1);
}

const OFFER_FIELDS: (keyof NewRow<"offers">)[] = [
  "location",
  "remote",
  "contract",
  "salary",
  "url",
  "description",
  "score",
  "score_reason",
  "decision_note",
  "approach",
  "cover_letter_url",
  "cv_url",
];

/**
 * Fusionne `dropId` dans `keepId` : les champs vides de l'offre gardée sont
 * complétés, processus, entretiens et rencontres sont rattachés, puis le
 * doublon est supprimé. Le parcours gardé est le plus avancé des deux.
 */
export async function mergeOffers(store: Store, keepId: string, dropId: string): Promise<Offer | null> {
  if (keepId === dropId) throw new ValidationError("impossible de fusionner une offre avec elle-même");
  const [keep, drop] = await Promise.all([store.get("offers", keepId), store.get("offers", dropId)]);
  if (!keep || !drop) return null;
  const processes = await store.list("processes");
  const pKeep = processes.find((p) => p.offer_id === keepId) ?? null;
  const pDrop = processes.find((p) => p.offer_id === dropId) ?? null;

  const patch: Record<string, unknown> = {};
  for (const k of OFFER_FIELDS) if (keep[k] == null && drop[k] != null) patch[k] = drop[k];
  const sKeep = stateOf(keep, pKeep);
  const sDrop = stateOf(drop, pDrop);
  const rank = (s: PipelineState) => STEPS.findIndex((x) => x.key === s.step) * 2 + (s.exit ? 0 : 1);
  if (rank(sDrop) > rank(sKeep)) patch.status = drop.status;

  if (pDrop && !pKeep) {
    await store.update("processes", pDrop.id, { offer_id: keepId });
  } else if (pDrop && pKeep) {
    for (const i of (await store.list("interviews")).filter((i) => i.process_id === pDrop.id)) {
      await store.update("interviews", i.id, { process_id: pKeep.id });
    }
    const pPatch: Record<string, unknown> = {};
    if (rank(sDrop) > rank(sKeep)) Object.assign(pPatch, { stage: pDrop.stage, outcome: pDrop.outcome ?? null });
    for (const k of ["next_step", "next_step_date", "contact_name"] as const) if (!pKeep[k] && pDrop[k]) pPatch[k] = pDrop[k];
    if (pDrop.notes) pPatch.notes = [pKeep.notes, pDrop.notes].filter(Boolean).join("\n\n");
    if (Object.keys(pPatch).length) await store.update("processes", pKeep.id, pPatch as Partial<NewRow<"processes">>);
    await store.remove("processes", pDrop.id);
  }
  for (const m of (await store.list("meetings")).filter((m) => m.offer_id === dropId)) {
    await store.update("meetings", m.id, { offer_id: keepId });
  }
  await store.remove("offers", dropId);
  return Object.keys(patch).length ? store.update("offers", keepId, patch as Partial<NewRow<"offers">>) : keep;
}

/** Ajoute une étape en fin de piste (« Step 5 (CEO) »). */
export async function addStep(store: Store, offerId: string, name: string): Promise<Interview | null> {
  if (!name?.trim()) throw new ValidationError("nom de l'étape obligatoire");
  const process = (await store.list("processes")).find((p) => p.offer_id === offerId);
  if (!process) return null;
  const steps = (await store.list("interviews")).filter((i) => i.process_id === process.id);
  const position = Math.max(0, ...steps.map((s) => s.position ?? 0)) + 1;
  return store.insert("interviews", { process_id: process.id, kind: name.trim(), position, result: "to_plan", status: "to_prepare" });
}

/** Ce que le skill « maj » doit suivre : offres à postuler, en attente de retour, pistes, avec leurs étapes. */
export async function listPipeline(store: Store) {
  const [offers, companies, processes, interviews] = await Promise.all([
    store.list("offers"),
    store.list("companies"),
    store.list("processes"),
    store.list("interviews"),
  ]);
  return offers
    .map((o) => {
      const process = processes.find((p) => p.offer_id === o.id) ?? null;
      const state = stateOf(o, process);
      return { o, process, state, category: categoryOf(state) };
    })
    .filter((x) => x.category === "to_apply" || x.category === "waiting" || x.category === "lead")
    .map(({ o, process, state, category }) => ({
      id: o.id,
      title: o.title,
      company: companies.find((c) => c.id === o.company_id)?.name ?? null,
      url: o.url ?? null,
      category,
      state,
      steps: process
        ? sortSteps(interviews.filter((i) => i.process_id === process.id)).map((i) => ({
            id: i.id,
            name: i.kind ?? "Étape",
            result: resultOf(i),
            scheduled_at: i.scheduled_at ?? null,
          }))
        : [],
    }));
}
