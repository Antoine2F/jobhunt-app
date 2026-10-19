import { Link } from "react-router-dom";
import type { Deadline, HomeView, OfferCard } from "@jobhunt/core";
import { CATEGORIES } from "@jobhunt/core/pipeline";
import { useApi } from "../api";
import { fmtDate, relDays } from "../labels";
import { StateChip } from "../Pipeline";
import { Loading, Score } from "../ui";

const KIND: Record<string, string> = { interview: "Entretien", process_step: "Candidature", meeting: "Réseau" };

/** Une offre arrivée il y a moins de 48 h. */
export function isFresh(iso: string) {
  return Date.now() - new Date(iso).getTime() < 48 * 3_600_000;
}

export function HomePage() {
  const { data, error, loading } = useApi<HomeView>("/home");
  if (!data) return <Loading error={error} loading={loading} />;
  const { counts, deadlines, leads, latest, network } = data;

  return (
    <>
      <h1>Où j'en suis</h1>
      <p className="muted small">{fmtDate(data.today)}</p>

      <div className="stats">
        {CATEGORIES.filter((c) => c.key !== "closed").map((c) => (
          <Link key={c.key} className="stat" to={`/offres?tab=${c.key}`}>
            <b>{counts[c.key]}</b>
            <span>{c.label}</span>
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
      <p className="small muted" style={{ marginTop: -6 }}>L'entreprise a manifesté son intérêt.</p>
      {leads.length === 0 ? (
        <p className="empty">Pas encore de piste. Les candidatures en attente sont dans « Candidatures en attente ».</p>
      ) : (
        <div className="grid">
          {leads.map(({ offer, company, process, state, next_interview }) => (
            <Link key={offer.id} to={`/offres/${offer.id}`} className="card">
              <div className="spread">
                <h3>{offer.title}</h3>
                <Score value={offer.score} />
              </div>
              <div className="muted">{company?.name ?? "Entreprise inconnue"}</div>
              <div className="row small" style={{ marginTop: 8 }}>
                <StateChip state={state} />
                {next_interview?.scheduled_at && <span>Entretien {fmtDate(next_interview.scheduled_at, true)}</span>}
              </div>
              {process?.next_step && (
                <div className="small" style={{ marginTop: 6 }}>
                  → {process.next_step}
                  {process.next_step_date && <span className="muted"> ({fmtDate(process.next_step_date)})</span>}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <h2>Prochaines échéances (14 jours)</h2>
      <Deadlines items={deadlines} empty="Aucun entretien ni relance prévu." />

      <h2>Réseau</h2>
      <div className="stats" style={{ marginBottom: 10 }}>
        <Link className="stat" to="/reseau">
          <b>{network.people_to_see}</b>
          <span>rencontres à faire</span>
        </Link>
      </div>
      <Deadlines items={network.deadlines} empty="Aucune rencontre planifiée dans les 14 jours." />
    </>
  );
}

export function OfferLine({ card }: { card: OfferCard }) {
  const { offer, company, state } = card;
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
          <StateChip state={state} />
        </div>
      )}
    </Link>
  );
}

function Deadlines({ items, empty }: { items: Deadline[]; empty: string }) {
  if (items.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="stack">
      {items.map((d, i) => (
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
  );
}
