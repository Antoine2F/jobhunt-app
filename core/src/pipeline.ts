// Le parcours d'une offre, de la première lecture à l'issue. Utilisé par l'API
// et par le site : ce fichier ne dépend que des types du schéma.
//
// Nouvelle › Intéressante › À postuler › Postulé › Piste › Offre acceptée
// - Postulé : en attente de retour, retour positif (→ piste), retour négatif (CV refusé).
// - Piste : des étapes renommables (« Step 1 (HR) »…), chacune à planifier,
//   en attente de retour, retour positif ou retour négatif (→ piste en échec).
import type { Interview, Offer, OfferStatus, Process, ProcessStage, StepResult } from "./schema.js";

export const STEPS = [
  { key: "new", label: "Nouvelle" },
  { key: "interesting", label: "Intéressante" },
  { key: "to_apply", label: "À postuler" },
  { key: "applied", label: "Postulé" },
  { key: "lead", label: "Piste" },
  { key: "won", label: "Offre acceptée" },
] as const;

export type Step = (typeof STEPS)[number]["key"];
export type Exit = "rejected" | "not_applying" | "lost" | "withdrawn";

export const STEP_LABEL = Object.fromEntries(STEPS.map((s) => [s.key, s.label])) as Record<Step, string>;

export const EXIT_LABEL: Record<Exit, string> = {
  rejected: "Pas intéressante",
  not_applying: "Je ne postule pas",
  lost: "Retour négatif",
  withdrawn: "Je me suis retiré",
};

/** États d'une étape de piste, dans l'ordre où on les traverse. */
export const STEP_RESULT_LABEL: Record<StepResult, string> = {
  to_plan: "À planifier",
  waiting: "En attente retour",
  positive: "Retour positif",
  negative: "Retour négatif",
};

/** Étapes créées pour chaque nouvelle piste ; renommables, et on peut en ajouter. */
export const DEFAULT_LEAD_STEPS = ["Step 1 (HR)", "Step 2 (Recr. Mgr)", "Step 3 (UC)", "Step 4 (culture)"];

/** Les familles d'offres, pour l'accueil et les onglets. */
export const CATEGORIES = [
  { key: "new", label: "Nouvelles offres" },
  { key: "interesting", label: "Offres intéressantes" },
  { key: "to_apply", label: "À postuler" },
  { key: "waiting", label: "En attente de retour" },
  { key: "lead", label: "Pistes" },
  { key: "won", label: "Offres acceptées" },
  { key: "not_considered", label: "Offres non considérées" },
  { key: "cv_refused", label: "CV refusés" },
  { key: "lead_failed", label: "Pistes en échec" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];

/** Familles en cours (tuiles de l'accueil) ; les autres sont des issues. */
export const OPEN_CATEGORIES: Category[] = ["new", "interesting", "to_apply", "waiting", "lead"];

export interface PipelineState {
  step: Step;
  /** Sortie, si le parcours s'est arrêté à cette étape. */
  exit: Exit | null;
}

export function stepIndex(step: Step) {
  return STEPS.findIndex((s) => s.key === step);
}

const LEAD_STAGES = new Set<string>(["lead", "screening", "interviews", "case_study", "final", "offer"]);

/** Où en est une offre, d'après son statut et son processus (y compris les données anciennes). */
export function stateOf(offer: Pick<Offer, "status">, process?: Pick<Process, "stage" | "outcome"> | null): PipelineState {
  if (process && process.stage !== "to_apply") {
    const stage = process.stage as ProcessStage;
    // Ancien format : l'arrêt était une étape.
    if (stage === "lost" || stage === "withdrawn") return { step: "applied", exit: stage };
    const step: Step = stage === "won" ? "won" : LEAD_STAGES.has(stage) ? "lead" : "applied";
    const outcome = process.outcome === "no_answer" ? "lost" : process.outcome;
    const exit = (outcome as Exit | null | undefined) ?? (offer.status === "closed" && step !== "won" ? "lost" : null);
    return { step, exit };
  }
  const byStatus: Record<OfferStatus, PipelineState> = {
    proposed: { step: "new", exit: null },
    rejected: { step: "new", exit: "rejected" },
    interesting: { step: "interesting", exit: null },
    not_applying: { step: "interesting", exit: "not_applying" },
    validated: { step: "to_apply", exit: null },
    applied: { step: "applied", exit: null },
    closed: { step: "applied", exit: "lost" },
  };
  return byStatus[offer.status as OfferStatus] ?? { step: "new", exit: null };
}

export function categoryOf(state: PipelineState): Category {
  if (state.exit === "rejected" || state.exit === "not_applying") return "not_considered";
  if (state.exit) return state.step === "lead" ? "lead_failed" : "cv_refused";
  if (state.step === "applied") return "waiting";
  return state.step;
}

/** Sorties proposées depuis une étape (Postulé et Piste ont leurs propres boutons de retour). */
export function exitsFor(step: Step): { exit: Exit; label: string }[] {
  switch (step) {
    case "new":
      return [{ exit: "rejected", label: "Pas intéressante" }];
    case "interesting":
    case "to_apply":
      return [{ exit: "not_applying", label: "Je ne postule pas" }];
    case "lead":
      return [{ exit: "withdrawn", label: "Je me retire" }];
    default:
      return [];
  }
}

/** Résultat d'une étape, y compris pour les entretiens saisis avant les étapes de piste. */
export function resultOf(i: Pick<Interview, "result" | "status">): StepResult {
  if (i.result) return i.result as StepResult;
  return i.status === "done" ? "positive" : "to_plan";
}

/** Étapes d'une piste dans l'ordre. */
export function sortSteps<T extends Pick<Interview, "position" | "scheduled_at" | "created_at">>(steps: T[]): T[] {
  return [...steps].sort(
    (a, b) =>
      (a.position ?? 999) - (b.position ?? 999) ||
      (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999") ||
      a.created_at.localeCompare(b.created_at),
  );
}

/** L'étape en cours d'une piste : la première qui n'a pas encore de retour positif. */
export function currentStep<T extends Pick<Interview, "position" | "scheduled_at" | "created_at" | "result" | "status">>(steps: T[]): T | null {
  return sortSteps(steps).find((s) => resultOf(s) !== "positive") ?? null;
}
