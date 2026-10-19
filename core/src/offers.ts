import { isProcessStep, stateOf, STEPS, type Exit, type PipelineState, type Step } from "./pipeline.js";
import { ValidationError, type Company, type NewRow, type Offer, type OfferStatus, type Process } from "./schema.js";
import type { Store } from "./store.js";
import { normalizeCompanyName } from "./urls.js";

// Faire avancer une offre dans son parcours, et regrouper les doublons.

export type Move = { step: Step } | { exit: Exit };

const STATUS_BEFORE_APPLYING: Partial<Record<Step, OfferStatus>> = {
  new: "proposed",
  interesting: "interesting",
  to_apply: "validated",
};

/**
 * Amène l'offre à une étape (en un clic, même plusieurs étapes plus loin :
 * « candidature → entretien RH ») ou l'arrête (« recalé »). Revenir en arrière
 * est permis, pour corriger un clic.
 */
export async function moveOffer(store: Store, offerId: string, move: Move): Promise<{ offer: Offer; process: Process | null; state: PipelineState } | null> {
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
    if (isProcessStep(move.step)) {
      await ensureProcess(move.step as Process["stage"]);
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
        status = "rejected";
        break;
      case "not_applying":
        status = "not_applying";
        break;
      case "lost":
      case "withdrawn":
      case "no_answer": {
        // Un refus suppose une candidature : on garde l'étape atteinte, sinon « candidature envoyée ».
        const stage = isProcessStep(current.step) && current.step !== "won" ? current.step : "applied";
        await ensureProcess(stage as Process["stage"]);
        process = (await store.update("processes", process!.id, { outcome: move.exit }))!;
        status = "closed";
        break;
      }
      default:
        throw new ValidationError(`sortie « ${(move as { exit: string }).exit} » inconnue`);
    }
  }
  const updated = (await store.update("offers", offerId, { status }))!;
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
