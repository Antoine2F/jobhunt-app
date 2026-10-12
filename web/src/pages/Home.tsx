import { Link } from "react-router-dom";
import type { HomeView } from "@jobhunt/core";
import { useApi } from "../api";
import { fmtDate, relDays, STAGE } from "../labels";
import { Loading, Score } from "../ui";

const KIND: Record<string, string> = { interview: "Entretien", process_step: "Processus", meeting: "Réseau" };

export function HomePage() {
  const { data, error, loading } = useApi<HomeView>("/home");
  if (!data) return <Loading error={error} loading={loading} />;
  const { counts, deadlines, active, to_review } = data;

  return (
    <>
      <h1>Où j'en suis</h1>
      <p className="muted small">{fmtDate(data.today)}</p>

      <div className="stats">
        <Link className="stat" to="/offres?tab=proposed">
          <b>{counts.proposed}</b>
          <span>offres à valider</span>
        </Link>
        <Link className="stat" to="/offres?tab=active">
          <b>{counts.active_processes}</b>
          <span>processus en cours</span>
        </Link>
        <Link className="stat" to="/entretiens">
          <b>{counts.interviews_to_prepare}</b>
          <span>entretiens à préparer</span>
        </Link>
        <Link className="stat" to="/reseau">
          <b>{counts.people_to_see}</b>
          <span>rencontres réseau à faire</span>
        </Link>
      </div>

      <h2>Prochaines échéances (14 jours)</h2>
      {deadlines.length === 0 ? (
        <p className="empty">Rien de prévu. C'est le moment de relancer le réseau.</p>
      ) : (
        <div className="stack">
          {deadlines.map((d, i) => (
            <Link key={i} to={d.link} className={`card deadline${d.overdue ? " overdue" : ""}`}>
              <div className="when">
                <b>{relDays(d.date)}</b>
                {fmtDate(d.date, d.kind !== "process_step")}
              </div>
              <div>
                <h3>{d.title}</h3>
                <div className="muted small">
                  <span className="chip">{KIND[d.kind]}</span> {d.subtitle}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2>Processus en cours</h2>
      {active.length === 0 ? (
        <p className="empty">Aucun processus actif.</p>
      ) : (
        <div className="grid">
          {active.map(({ process, offer, company, next_interview }) => (
            <Link key={process.id} to={`/offres/${offer.id}`} className="card">
              <div className="spread">
                <h3>{offer.title}</h3>
                <Score value={offer.score} />
              </div>
              <div className="muted">{company?.name ?? "Entreprise inconnue"}</div>
              <div className="row small" style={{ marginTop: 8 }}>
                <span className="chip">{STAGE[process.stage]}</span>
                {next_interview?.scheduled_at && <span>Entretien {fmtDate(next_interview.scheduled_at, true)}</span>}
              </div>
              {process.next_step && (
                <div className="small" style={{ marginTop: 6 }}>
                  → {process.next_step}
                  {process.next_step_date && <span className="muted"> ({fmtDate(process.next_step_date)})</span>}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {to_review.length > 0 && (
        <>
          <h2>À valider en priorité</h2>
          <div className="stack">
            {to_review.map((o) => (
              <Link key={o.id} to={`/offres/${o.id}`} className="card">
                <div className="spread">
                  <h3>{o.title}</h3>
                  <Score value={o.score} />
                </div>
                {o.score_reason && <div className="muted small">{o.score_reason}</div>}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
