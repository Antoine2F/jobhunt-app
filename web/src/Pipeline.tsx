// Le fil d'étapes d'une offre et, pour une piste, ses étapes (Step 1 (HR)…).
import { useState } from "react";
import type { Interview } from "@jobhunt/core";
import {
  EXIT_LABEL,
  exitsFor,
  resultOf,
  sortSteps,
  STEP_LABEL,
  STEP_RESULT_LABEL,
  STEPS,
  stepIndex,
  type Exit,
  type PipelineState,
  type Step,
} from "@jobhunt/core/pipeline";
import type { StepResult } from "@jobhunt/core/schema";
import { api } from "./api";
import { useToast } from "./ui";

export type Move = { step: Step } | { exit: Exit };

/** Libellé court de l'état : « Postulé · Retour négatif ». */
export function stateLabel(s: PipelineState, step?: Pick<Interview, "kind" | "result" | "status"> | null) {
  if (s.exit === "lost" && s.step === "applied") return "CV refusé";
  if (s.exit && s.step === "lead") return s.exit === "withdrawn" ? "Piste abandonnée" : "Piste en échec";
  if (s.exit) return `${STEP_LABEL[s.step]} · ${EXIT_LABEL[s.exit]}`;
  if (s.step === "applied") return "Postulé · en attente retour";
  if (s.step === "lead" && step) return `${step.kind ?? "Étape"} · ${STEP_RESULT_LABEL[resultOf(step)].toLowerCase()}`;
  return STEP_LABEL[s.step];
}

export function StateChip({ state, step }: { state: PipelineState; step?: Pick<Interview, "kind" | "result" | "status"> | null }) {
  const cls = state.exit ? "danger" : state.step === "lead" || state.step === "won" ? "ok" : "";
  return <span className={`chip ${cls}`}>{stateLabel(state, step)}</span>;
}

/** Bouton principal pour passer à l'étape suivante, avant la candidature. */
export function nextMove(step: Step): { step: Step; label: string } | null {
  if (step === "new") return { step: "interesting", label: "Intéressante" };
  if (step === "interesting") return { step: "to_apply", label: "Je postule" };
  if (step === "to_apply") return { step: "applied", label: "J'ai postulé" };
  return null;
}

/** Postulé : les trois états du retour sur la candidature. */
const APPLIED_FEEDBACK: { key: "waiting" | "positive" | "negative"; label: string; move: Move }[] = [
  { key: "waiting", label: "En attente retour", move: { step: "applied" } },
  { key: "positive", label: "Retour positif", move: { step: "lead" } },
  { key: "negative", label: "Retour négatif", move: { exit: "lost" } },
];

export function Pipeline({ state, onMove, busy }: { state: PipelineState; onMove: (m: Move) => void; busy?: boolean }) {
  const current = stepIndex(state.step);
  const next = state.exit ? null : nextMove(state.step);
  const appliedNow = state.step === "applied" ? (state.exit ? "negative" : "waiting") : null;
  return (
    <div className="card">
      <ol className="pipeline" aria-label="Étapes de l'offre">
        {STEPS.map((s, i) => {
          const status = i < current ? "done" : i === current ? (state.exit ? "stopped" : "current") : "todo";
          return (
            <li key={s.key} className={status}>
              <button
                type="button"
                disabled={busy || (i === current && !state.exit)}
                onClick={() => onMove({ step: s.key })}
                title={i === current && state.exit ? "Rouvrir à cette étape" : i < current ? "Revenir à cette étape" : `Aller à : ${s.label}`}
                aria-current={i === current ? "step" : undefined}
              >
                {status === "done" ? "✓ " : status === "stopped" ? "✕ " : ""}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {appliedNow && (
        <div className="segmented" role="group" aria-label="Retour sur la candidature" style={{ marginTop: 10 }}>
          {APPLIED_FEEDBACK.map((f) => (
            <button key={f.key} type="button" className={`${f.key}${appliedNow === f.key ? " on" : ""}`} disabled={busy || appliedNow === f.key} onClick={() => onMove(f.move)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {state.exit && state.step !== "applied" && (
        <p className="small" style={{ margin: "10px 0 0" }}>
          <b className="error">{state.step === "lead" ? (state.exit === "withdrawn" ? "Je me suis retiré de la piste" : "Piste en échec") : EXIT_LABEL[state.exit]}</b>
          {state.step !== "lead" && ` à l'étape « ${STEP_LABEL[state.step]} »`}. {state.step === "lead" ? "Corriger le retour d'une étape rouvre la piste." : "Un clic sur une étape rouvre l'offre."}
        </p>
      )}
      {!state.exit && (next || exitsFor(state.step).length > 0) && (
        <div className="row" style={{ marginTop: 10 }}>
          {next && (
            <button className="primary" disabled={busy} onClick={() => onMove({ step: next.step })}>
              {next.label} →
            </button>
          )}
          {exitsFor(state.step).map((e) => (
            <button key={e.exit} disabled={busy} onClick={() => onMove({ exit: e.exit })}>
              ✕ {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const RESULTS = Object.keys(STEP_RESULT_LABEL) as StepResult[];

/**
 * Étapes d'une piste : chacune à planifier, en attente retour, retour positif
 * ou retour négatif (ce qui met la piste en échec). Renommables, et on peut en ajouter.
 */
export function LeadSteps({
  offerId,
  steps,
  onChange,
  details,
}: {
  offerId: string;
  steps: Interview[];
  onChange: () => void;
  /** Détails d'une étape (date, interlocuteurs, notes), repliés sous ses boutons. */
  details?: (s: Interview) => React.ReactNode;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const sorted = sortSteps(steps);
  const currentId = sorted.find((s) => resultOf(s) !== "positive")?.id;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      onChange();
    } finally {
      setBusy(false);
    }
  }
  const setResult = (s: Interview, result: StepResult) =>
    run(() => api(`/steps/${s.id}/result`, { method: "POST", body: { result } }), `${s.kind} : ${STEP_RESULT_LABEL[result].toLowerCase()}`);
  const rename = (s: Interview) => {
    const name = prompt("Nom de l'étape", s.kind ?? "")?.trim();
    if (name && name !== s.kind) run(() => api(`/interviews/${s.id}`, { method: "PATCH", body: { kind: name } }), "Étape renommée");
  };
  const remove = (s: Interview) => {
    if (confirm(`Supprimer l'étape « ${s.kind} » ?`)) run(() => api(`/interviews/${s.id}`, { method: "DELETE" }), "Étape supprimée");
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adding.trim()) return;
    run(() => api(`/offers/${offerId}/steps`, { method: "POST", body: { name: adding.trim() } }), "Étape ajoutée").then(() => setAdding(""));
  };

  return (
    <>
      <h2>Étapes de la piste</h2>
      <div className="stack">
        {sorted.map((s) => {
          const r = resultOf(s);
          return (
            <div key={s.id} className={`card step-card${s.id === currentId ? " current" : ""}`}>
              <div className="spread" style={{ alignItems: "center" }}>
                <b>{s.kind || "Étape"}</b>
                <span className="row small">
                  <button className="link" onClick={() => rename(s)} disabled={busy}>
                    Renommer
                  </button>
                  <button className="link danger" onClick={() => remove(s)} disabled={busy}>
                    Supprimer
                  </button>
                </span>
              </div>
              <div className="segmented" role="group" aria-label={`État de ${s.kind}`} style={{ marginTop: 8 }}>
                {RESULTS.map((k) => (
                  <button key={k} type="button" className={`${k}${r === k ? " on" : ""}`} disabled={busy || r === k} onClick={() => setResult(s, k)}>
                    {STEP_RESULT_LABEL[k]}
                  </button>
                ))}
              </div>
              {details?.(s)}
            </div>
          );
        })}
      </div>
      <form className="row" onSubmit={add} style={{ marginTop: 10 }}>
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`Step ${sorted.length + 1} (…)`} style={{ flex: 1, minWidth: 160 }} />
        <button disabled={busy || !adding.trim()}>+ Ajouter une étape</button>
      </form>
    </>
  );
}
