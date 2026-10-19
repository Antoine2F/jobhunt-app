// Le parcours d'une offre, de la première lecture à l'issue, en une seule liste
// d'étapes. Chaque étape peut être franchie (étape suivante) ou être une sortie
// (pas intéressante, refus…). Utilisé par l'API et par le site : ce fichier ne
// dépend que des types du schéma.
import type { Offer, OfferStatus, Process, ProcessOutcome, ProcessStage } from "./schema.js";

export const STEPS = [
  { key: "new", label: "Nouvelle" },
  { key: "interesting", label: "Intéressante" },
  { key: "to_apply", label: "À postuler" },
  { key: "applied", label: "Candidature envoyée" },
  { key: "screening", label: "Entretien RH" },
  { key: "interviews", label: "Entretiens" },
  { key: "case_study", label: "Cas pratique" },
  { key: "final", label: "Dernier tour" },
  { key: "offer", label: "Offre reçue" },
  { key: "won", label: "Acceptée" },
] as const;

export type Step = (typeof STEPS)[number]["key"];
export type Exit = "rejected" | "not_applying" | ProcessOutcome;

export const STEP_LABEL = Object.fromEntries(STEPS.map((s) => [s.key, s.label])) as Record<Step, string>;

export const EXIT_LABEL: Record<Exit, string> = {
  rejected: "Pas intéressante",
  not_applying: "Je ne postule pas",
  no_answer: "Sans réponse",
  lost: "Refusé",
  withdrawn: "Je me suis retiré",
};

/** Les grandes familles, pour l'accueil et les onglets. */
export const CATEGORIES = [
  { key: "new", label: "Nouvelles offres" },
  { key: "interesting", label: "Offres intéressantes" },
  { key: "to_apply", label: "À postuler" },
  { key: "waiting", label: "Candidatures en attente" },
  { key: "lead", label: "Pistes" },
  { key: "closed", label: "Terminées" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];

export interface PipelineState {
  /** Dernière étape atteinte. */
  step: Step;
  /** Sortie, si le parcours s'est arrêté à cette étape. */
  exit: Exit | null;
}

const PROCESS_STEPS: Step[] = ["applied", "screening", "interviews", "case_study", "final", "offer", "won"];

export function stepIndex(step: Step) {
  return STEPS.findIndex((s) => s.key === step);
}

/** Où en est une offre, d'après son statut et son processus (y compris les données anciennes). */
export function stateOf(offer: Pick<Offer, "status">, process?: Pick<Process, "stage" | "outcome"> | null): PipelineState {
  if (process && process.stage !== "to_apply") {
    const stage = process.stage as ProcessStage;
    // Ancien format : l'arrêt était une étape ; on ne sait plus où il a eu lieu.
    if (stage === "lost" || stage === "withdrawn") return { step: "applied", exit: stage };
    const exit = (process.outcome as ProcessOutcome | null | undefined) ?? (offer.status === "closed" && stage !== "won" ? "lost" : null);
    return { step: stage as Step, exit };
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
  if (state.exit || state.step === "won") return "closed";
  if (state.step === "new" || state.step === "interesting" || state.step === "to_apply") return state.step;
  return state.step === "applied" ? "waiting" : "lead";
}

/** Sorties possibles depuis une étape, avec le libellé du bouton. */
export function exitsFor(step: Step): { exit: Exit; label: string }[] {
  switch (step) {
    case "new":
      return [{ exit: "rejected", label: "Pas intéressante" }];
    case "interesting":
    case "to_apply":
      return [{ exit: "not_applying", label: "Je ne postule pas" }];
    case "applied":
      return [
        { exit: "lost", label: "Refusé" },
        { exit: "no_answer", label: "Sans réponse" },
        { exit: "withdrawn", label: "Je me retire" },
      ];
    case "offer":
      return [{ exit: "withdrawn", label: "Je décline" }];
    case "won":
      return [];
    default:
      return [
        { exit: "lost", label: "Recalé" },
        { exit: "withdrawn", label: "Je me retire" },
      ];
  }
}

export function isProcessStep(step: Step) {
  return PROCESS_STEPS.includes(step);
}
