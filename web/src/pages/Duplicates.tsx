import { useState } from "react";
import { Link } from "react-router-dom";
import type { DuplicateCandidate, DuplicateSide } from "@jobhunt/core";
import { api, useApi } from "../api";
import { Loading, Score, useToast } from "../ui";

/** Paires d'offres qui se ressemblent : comparaison sur deux colonnes, et décision. */
export function DuplicatesPage() {
  const { data, error, loading, reload } = useApi<DuplicateCandidate[]>("/duplicates");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  if (!data) return <Loading error={error} loading={loading} />;

  async function run(key: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(key);
    try {
      await fn();
      toast(msg);
      reload();
    } finally {
      setBusy(null);
    }
  }
  const keep = (p: DuplicateCandidate, side: "a" | "b") => {
    const kept = p[side];
    const dropped = p[side === "a" ? "b" : "a"];
    if (!confirm(`Garder « ${kept.offer.title} » et supprimer l'autre ? Son étape, ses entretiens et ses rencontres sont rattachés à celle gardée.`)) return;
    run(p.key, () => api(`/offers/${kept.offer.id}/merge`, { method: "POST", body: { from: dropped.offer.id } }), "Doublon supprimé");
  };
  const dismiss = (p: DuplicateCandidate) =>
    run(p.key, () => api("/duplicates/dismiss", { method: "POST", body: { a: p.a.offer.id, b: p.b.offer.id } }), "Gardées toutes les deux");

  return (
    <>
      <p className="small">
        <Link to="/offres">← Offres</Link>
      </p>
      <h1>Doublons possibles</h1>
      <p className="small muted">
        Offres de la même entreprise dont les intitulés se ressemblent. La veille ne fusionne d'elle-même que le même lien, ou le même intitulé dans la même
        entreprise : voici celles qu'elle n'a pas osé fusionner.
      </p>
      {data.length === 0 && <p className="empty">Aucun doublon possible.</p>}
      <div className="stack">
        {data.map((p) => (
          <div key={p.key} className="card dup">
            <div className="small muted">Intitulés semblables à {Math.round(p.similarity * 100)} %</div>
            <div className="dup-grid">
              <Head side={p.a} suggested={p.suggested_keep === "a"} />
              <Head side={p.b} suggested={p.suggested_keep === "b"} />
              {p.fields.map((f) => (
                <div key={f.field} className={`dup-row ${f.same ? "same" : "diff"}`}>
                  <div className="dup-label">
                    {f.label} <span>{f.same ? "= semblable" : "≠ différent"}</span>
                  </div>
                  <div>{f.a}</div>
                  <div>{f.b}</div>
                </div>
              ))}
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              <b>Pourquoi elles n'ont pas été fusionnées</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {p.why_not_merged.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>

            <div className="dup-grid" style={{ marginTop: 10 }}>
              {(["a", "b"] as const).map((s) => (
                <button key={s} className={p.suggested_keep === s ? "primary" : ""} disabled={busy === p.key} onClick={() => keep(p, s)}>
                  Garder celle-ci, supprimer l'autre
                </button>
              ))}
            </div>
            <button style={{ marginTop: 8, width: "100%" }} disabled={busy === p.key} onClick={() => dismiss(p)}>
              Ce ne sont pas des doublons
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function Head({ side, suggested }: { side: DuplicateSide; suggested: boolean }) {
  return (
    <div className="dup-head">
      <Link to={`/offres/${side.offer.id}`}>
        <b>{side.offer.title}</b>
      </Link>
      <div className="row small" style={{ marginTop: 4, gap: 6 }}>
        <Score value={side.offer.score} />
        <span className="chip">{side.step_label}</span>
      </div>
      {suggested && <div className="small ok-text">Conseillée : plus avancée ou plus complète</div>}
    </div>
  );
}
