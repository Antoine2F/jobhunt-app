import { useState } from "react";
import { Link } from "react-router-dom";
import type { DuplicateCandidate, FieldComparison } from "@jobhunt/core";
import { api, useApi } from "../api";
import { Loading, Score, useToast } from "../ui";

/** Champs montrés sur chaque carte ; l'étape et la note sont en tête. */
const HEAD = ["title", "company"]; // pleine largeur
const SHORT = ["location", "salary", "received", "url"]; // infos courtes sur deux colonnes, le lien en pleine largeur

/** Doublons possibles : deux cartes côte à côte, vert = pareil, orange = différent. */
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
  // Supprimer une offre = la fusionner dans l'autre (étape, entretiens et rencontres sont gardés).
  const remove = (p: DuplicateCandidate, side: "a" | "b") => {
    const drop = p[side].offer;
    const keep = p[side === "a" ? "b" : "a"].offer;
    if (!confirm(`Supprimer « ${drop.title} » ?`)) return;
    run(p.key, () => api(`/offers/${keep.id}/merge`, { method: "POST", body: { from: drop.id } }), "Doublon supprimé");
  };
  const dismiss = (p: DuplicateCandidate) =>
    run(p.key, () => api("/duplicates/dismiss", { method: "POST", body: { a: p.a.offer.id, b: p.b.offer.id } }), "Gardées toutes les deux");

  return (
    <>
      <p className="small">
        <Link to="/offres">← Offres</Link>
      </p>
      <h1>Doublons possibles</h1>
      {data.length === 0 && <p className="empty">Aucun doublon possible.</p>}
      <div className="stack">
        {data.map((p) => (
          <section key={p.key} className="dup" aria-label={`Doublon possible : ${p.a.offer.title}`}>
            <p className="small dup-why">Pas fusionnées : {p.why_not_merged.join(" · ")}.</p>
            <div className="dup-pair">
              {(["a", "b"] as const).map((s) => {
                const side = p[s];
                const pick = (names: string[]) => names.flatMap((n) => p.fields.filter((f) => f.field === n));
                return (
                  <div key={s} className={`card dup-card${p.suggested_keep === s ? " keep" : ""}`}>
                    <div className="spread" style={{ alignItems: "center" }}>
                      <span className="row small" style={{ gap: 4 }}>
                        <Score value={side.offer.score} />
                        <span className="chip">{side.step_label}</span>
                      </span>
                      <button
                        className="icon-btn"
                        title="Supprimer cette offre"
                        aria-label={`Supprimer « ${side.offer.title} »`}
                        disabled={busy === p.key}
                        onClick={() => remove(p, s)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                    </div>
                    {pick(HEAD).map((f) => (
                      <Field key={f.field} f={f} value={s === "a" ? f.a : f.b} id={side.offer.id} />
                    ))}
                    <div className="dup-grid">
                      {pick(SHORT).map((f) => (
                        <Field key={f.field} f={f} value={s === "a" ? f.a : f.b} id={side.offer.id} />
                      ))}
                    </div>
                    {p.suggested_keep === s && <div className="small ok-text">À garder (plus avancée)</div>}
                  </div>
                );
              })}
            </div>
            <button className="link small" disabled={busy === p.key} onClick={() => dismiss(p)}>
              Ce ne sont pas des doublons
            </button>
          </section>
        ))}
      </div>
    </>
  );
}

/** Ce qu'on affiche quand le champ est vide d'un côté. */
const EMPTY: Record<string, string> = { salary: "no €", url: "pas de lien", location: "lieu ?", company: "entreprise ?" };

/** 2026-10-07 → 07/10 : tient dans une demi-carte. */
const shortDate = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

function Field({ f, value: raw, id }: { f: FieldComparison; value: string; id: string }) {
  const cls = `dup-f dup-f-${f.field} ${f.same ? "match" : "nomatch"}`;
  const value = raw === "—" ? (EMPTY[f.field] ?? "—") : raw;
  if (f.field === "title") {
    return (
      <Link to={`/offres/${id}`} className={cls} style={{ fontWeight: 600 }}>
        {value}
      </Link>
    );
  }
  return (
    <div className={cls} title={f.label}>
      {f.field === "received" && raw !== "—" ? `reçue ${shortDate(value)}` : value}
    </div>
  );
}
