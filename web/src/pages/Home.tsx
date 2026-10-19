import { Link } from "react-router-dom";
import type { HomeView, OfferCard } from "@jobhunt/core";
import { CATEGORIES, OPEN_CATEGORIES } from "@jobhunt/core/pipeline";
import { useApi } from "../api";
import { fmtDate, relDays } from "../labels";
import { StateChip } from "../Pipeline";
import { Loading, Score } from "../ui";

/** Une offre arrivée il y a moins de 48 h. */
export function isFresh(iso: string) {
  return Date.now() - new Date(iso).getTime() < 48 * 3_600_000;
}

export function HomePage() {
  const { data, error, loading } = useApi<HomeView>("/home");
  if (!data) return <Loading error={error} loading={loading} />;
  const { counts, leads, latest, network } = data;
  const outcomes = CATEGORIES.filter((c) => !OPEN_CATEGORIES.includes(c.key) && (c.key !== "won" || counts.won > 0));

  return (
    <>
      <h1>Où j'en suis</h1>
      <p className="muted small">{fmtDate(data.today)}</p>

      <div className="stats">
        {CATEGORIES.filter((c) => OPEN_CATEGORIES.includes(c.key)).map((c) => (
          <Link key={c.key} className="stat" to={`/offres?tab=${c.key}`}>
            <b>{counts[c.key]}</b>
            <span>{c.label}</span>
          </Link>
        ))}
      </div>
      <div className="row small" style={{ marginTop: 10 }}>
        {outcomes.map((c) => (
          <Link key={c.key} className="btn" to={`/offres?tab=${c.key}`}>
            {c.label} <span className="muted">{counts[c.key]}</span>
          </Link>
        ))}
      </div>

      <h2>Nouvelles offres</h2>
      {latest.length === 0 ? (
        <p className="empty">Aucune nouvelle offre à regarder.</p>
      ) : (
        <div className="stack">
          {latest.map((c) => (
            <OfferLine key={c.offer.id} card={c} />
          ))}
          {counts.new > latest.length && (
            <Link className="btn" to="/offres?tab=new">
              Voir les {counts.new} nouvelles offres
            </Link>
          )}
        </div>
      )}

      <h2>Pistes</h2>
      <p className="small muted" style={{ marginTop: -6 }}>Retour positif sur la candidature : l'entreprise a manifesté son intérêt.</p>
      {leads.length === 0 ? (
        <p className="empty">Pas encore de piste.</p>
      ) : (
        <div className="grid">
          {leads.map(({ offer, company, state, current_step }) => (
            <Link key={offer.id} to={`/offres/${offer.id}`} className="card">
              <div className="spread">
                <h3>{offer.title}</h3>
                <Score value={offer.score} />
              </div>
              <div className="muted">{company?.name ?? "Entreprise inconnue"}</div>
              <div style={{ marginTop: 8 }}>
                <StateChip state={state} step={current_step} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2>Réseau</h2>
      <div className="stats" style={{ marginBottom: 10 }}>
        <Link className="stat" to="/reseau">
          <b>{network.people_to_see}</b>
          <span>rencontres à faire</span>
        </Link>
      </div>
      {network.deadlines.length === 0 ? (
        <p className="empty">Aucune rencontre planifiée dans les 14 jours.</p>
      ) : (
        <div className="stack">
          {network.deadlines.map((d, i) => (
            <Link key={i} to={d.link} className={`card deadline${d.overdue ? " overdue" : ""}`}>
              <div className="when">
                <b>{relDays(d.date)}</b>
                {fmtDate(d.date, true)}
              </div>
              <div>
                <h3>{d.title}</h3>
                {d.subtitle && <div className="muted small">{d.subtitle}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function OfferLine({ card }: { card: OfferCard }) {
  const { offer, company, state, current_step } = card;
  const arrived = offer.received_at ?? offer.created_at;
  return (
    <Link to={`/offres/${offer.id}`} className="card">
      <div className="spread">
        <div>
          <h3>
            {isFresh(offer.created_at) && <span className="new-dot" title="Arrivée il y a moins de 48 h" />}
            {offer.title}
          </h3>
          <div className="muted small">
            {company?.name ?? "Entreprise inconnue"}
            {offer.location && ` · ${offer.location}`} · {relDays(arrived)}
          </div>
        </div>
        <Score value={offer.score} />
      </div>
      {state.step !== "new" && (
        <div style={{ marginTop: 6 }}>
          <StateChip state={state} step={current_step} />
        </div>
      )}
    </Link>
  );
}
