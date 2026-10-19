import { useState } from "react";
import { Link } from "react-router-dom";
import type { Company, HomeView, Interview, Offer, Process } from "@jobhunt/core";
import { resultOf, STEP_RESULT_LABEL } from "@jobhunt/core/pipeline";
import { useApi } from "../api";
import { fmtDate } from "../labels";
import { Loading } from "../ui";

/** Les étapes des pistes : celle en cours de chaque piste, et l'historique des retours. */
export function InterviewsPage() {
  const [tab, setTab] = useState<"current" | "history">("current");
  const home = useApi<HomeView>("/home");
  const interviews = useApi<Interview[]>("/interviews");
  const processes = useApi<Process[]>("/processes");
  const offers = useApi<Offer[]>("/offers");
  const companies = useApi<Company[]>("/companies");
  if (!home.data || !interviews.data || !processes.data || !offers.data || !companies.data) {
    return <Loading error={home.error ?? interviews.error} loading />;
  }

  const proc = new Map(processes.data.map((p) => [p.id, p]));
  const offer = new Map(offers.data.map((o) => [o.id, o]));
  const company = new Map(companies.data.map((c) => [c.id, c]));
  const history = interviews.data
    .filter((i) => ["positive", "negative"].includes(resultOf(i)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <>
      <h1>Entretiens</h1>
      <div className="tabs">
        <button className={tab === "current" ? "active" : ""} onClick={() => setTab("current")}>
          Étapes en cours
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          Retours reçus
        </button>
      </div>

      {tab === "current" && (
        <div className="stack">
          {home.data.leads.length === 0 && <p className="empty">Aucune piste en cours.</p>}
          {home.data.leads.map(({ offer: o, company: c, current_step: s }) => (
            <Link key={o.id} to={`/offres/${o.id}`} className="card">
              <div className="spread">
                <h3>
                  {s?.kind ?? "Toutes les étapes franchies"} · {c?.name ?? "?"}
                </h3>
                {s && <span className={`chip ${resultOf(s) === "waiting" ? "warn" : ""}`}>{STEP_RESULT_LABEL[resultOf(s)]}</span>}
              </div>
              <div className="muted small">
                {o.title}
                {s?.scheduled_at && ` · ${fmtDate(s.scheduled_at, true)}`}
                {s?.interviewers && ` · avec ${s.interviewers}`}
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="stack">
          {history.length === 0 && <p className="empty">Aucun retour pour l'instant.</p>}
          {history.map((i) => {
            const o = offer.get(proc.get(i.process_id)?.offer_id ?? "");
            const c = o?.company_id ? company.get(o.company_id) : undefined;
            const r = resultOf(i);
            return (
              <Link key={i.id} to={o ? `/offres/${o.id}` : "/offres"} className="card">
                <div className="spread">
                  <h3>
                    {i.kind || "Étape"} · {c?.name ?? "?"}
                  </h3>
                  <span className={`chip ${r === "positive" ? "ok" : "danger"}`}>{STEP_RESULT_LABEL[r]}</span>
                </div>
                <div className="muted small">{o?.title}</div>
                {i.outcome && <div className="small">{i.outcome}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
