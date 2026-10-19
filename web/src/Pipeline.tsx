// Le fil d'étapes d'une offre : où elle en est, et en un clic où elle va.
import { EXIT_LABEL, exitsFor, STEP_LABEL, STEPS, stepIndex, type Exit, type PipelineState, type Step } from "@jobhunt/core/pipeline";

export type Move = { step: Step } | { exit: Exit };

/** Libellé court de l'état : « Entretien RH », « Entretien RH · Refusé ». */
export function stateLabel(s: PipelineState) {
  return s.exit ? `${STEP_LABEL[s.step]} · ${EXIT_LABEL[s.exit]}` : STEP_LABEL[s.step];
}

export function StateChip({ state }: { state: PipelineState }) {
  const cls = state.exit ? "danger" : state.step === "won" ? "ok" : stepIndex(state.step) >= stepIndex("screening") ? "ok" : "";
  return <span className={`chip ${cls}`}>{stateLabel(state)}</span>;
}

/** Bouton principal pour passer à l'étape suivante. */
const NEXT_LABEL: Partial<Record<Step, string>> = {
  new: "Intéressante",
  interesting: "Je postule",
  to_apply: "J'ai candidaté",
  applied: "L'entreprise a répondu",
  offer: "J'accepte",
};

export function nextMove(step: Step): { step: Step; label: string } | null {
  const i = stepIndex(step);
  if (i < 0 || i >= STEPS.length - 1) return null;
  const next = STEPS[i + 1].key;
  return { step: next, label: NEXT_LABEL[step] ?? STEP_LABEL[next] };
}

export function Pipeline({ state, onMove, busy }: { state: PipelineState; onMove: (m: Move) => void; busy?: boolean }) {
  const current = stepIndex(state.step);
  const next = state.exit ? null : nextMove(state.step);
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
      {state.exit ? (
        <p className="small" style={{ margin: "10px 0 0" }}>
          <b className="error">{EXIT_LABEL[state.exit]}</b> à l'étape « {STEP_LABEL[state.step]} ». Un clic sur une étape rouvre l'offre.
        </p>
      ) : (
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
          <span className="small muted">ou clique directement sur une étape plus loin</span>
        </div>
      )}
    </div>
  );
}
