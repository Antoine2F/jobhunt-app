import { useState } from "react";
import { Link } from "react-router-dom";
import type { Company, Interview, Offer, Process } from "@jobhunt/core";
import { useApi } from "../api";
import { fmtDate, INTERVIEW_STATUS, relDays } from "../labels";
import { Loading } from "../ui";

export function InterviewsPage() {
  const [tab, setTab] = useState<"to_prepare" | "done">("to_prepare");
  const interviews = useApi<Interview[]>("/interviews");
  const processes = useApi<Process[]>("/processes");
  const offers = useApi<Offer[]>("/offers");
  const companies = useApi<Company[]>("/companies");
  if (!interviews.data || !processes.data || !offers.data || !companies.data) {
    return <Loading error={interviews.error ?? offers.error} loading />;
  }

  const proc = new Map(processes.data.map((p) => [p.id, p]));
  const offer = new Map(offers.data.map((o) => [o.id, o]));
  const company = new Map(companies.data.map((c) => [c.id, c]));
  const list = interviews.data
    .filter((i) => (tab === "done" ? i.status !== "to_prepare" : i.status === "to_prepare"))
    .sort((a, b) => {
      const cmp = (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999");
      return tab === "done" ? -cmp : cmp;
    });

  return (
    <>
      <h1>Entretiens</h1>
      <div className="tabs">
        <button className={tab === "to_prepare" ? "active" : ""} onClick={() => setTab("to_prepare")}>
          À préparer
        </button>
        <button className={tab === "done" ? "active" : ""} onClick={() => setTab("done")}>
          Faits
        </button>
      </div>
      {list.length === 0 && <p className="empty">Aucun entretien.</p>}
      <div className="stack">
        {list.map((i) => {
          const o = offer.get(proc.get(i.process_id)?.offer_id ?? "");
          const c = o?.company_id ? company.get(o.company_id) : undefined;
          return (
            <Link key={i.id} to={o ? `/offres/${o.id}` : "/offres"} className="card deadline">
              <div className="when">
                {i.scheduled_at ? (
                  <>
                    <b>{relDays(i.scheduled_at)}</b>
                    {fmtDate(i.scheduled_at, true)}
                  </>
                ) : (
                  <b>Date à fixer</b>
                )}
              </div>
              <div>
                <h3>
                  {i.kind || "Entretien"} · {c?.name ?? "?"}
                </h3>
                <div className="muted small">
                  {o?.title}
                  {i.interviewers && ` · avec ${i.interviewers}`}
                </div>
                {tab === "done" && i.outcome && <div className="small">{i.outcome}</div>}
                {tab === "done" && <span className="chip small">{INTERVIEW_STATUS[i.status]}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
