import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Meeting, Person } from "@jobhunt/core";
import { api, useApi } from "../api";
import { fmtDate, fromLocalInput, MEETING_STATUS, STRENGTH, toLocalInput } from "../labels";
import { formData, Loading, Select, useToast } from "../ui";
import { PersonFields } from "./Network";

export function PersonPage() {
  const { id } = useParams();
  const person = useApi<Person>(`/people/${id}`);
  const meetings = useApi<Meeting[]>("/meetings");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const p = person.data;
  if (!p || !meetings.data) return <Loading error={person.error} loading />;
  const mine = meetings.data
    .filter((m) => m.person_id === p.id)
    .sort((a, b) => (b.planned_at ?? b.created_at).localeCompare(a.planned_at ?? a.created_at));

  async function saveMeeting(e: React.FormEvent<HTMLFormElement>, mId?: string) {
    const f = formData(e);
    const body = { ...f, person_id: p!.id, planned_at: fromLocalInput(f.planned_at ?? "") };
    if (mId) await api(`/meetings/${mId}`, { method: "PATCH", body });
    else await api("/meetings", { method: "POST", body });
    toast("Rencontre enregistrée");
    setAdding(false);
    meetings.reload();
  }

  return (
    <>
      <p className="small">
        <Link to="/reseau">← Réseau</Link>
      </p>
      {editing ? (
        <form
          className="card form"
          onSubmit={async (e) => {
            await api(`/people/${p.id}`, { method: "PATCH", body: formData(e) });
            setEditing(false);
            person.reload();
          }}
        >
          <PersonFields p={p} />
          <div className="row full">
            <button className="primary">Enregistrer</button>
            <button type="button" onClick={() => setEditing(false)}>Annuler</button>
            <button
              type="button"
              className="danger"
              style={{ marginLeft: "auto" }}
              onClick={async () => {
                if (!confirm(`Supprimer ${p.name} et ses rencontres ?`)) return;
                await api(`/people/${p.id}`, { method: "DELETE" });
                navigate("/reseau");
              }}
            >
              Supprimer
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="spread">
            <div>
              <h1 style={{ marginBottom: 4 }}>{p.name}</h1>
              <div className="muted">{[p.role, p.company_name].filter(Boolean).join(" · ")}</div>
            </div>
            <button onClick={() => setEditing(true)}>Modifier</button>
          </div>
          <dl className="props card" style={{ marginTop: 12 }}>
            {p.strength && (<><dt>Lien</dt><dd>{STRENGTH[String(p.strength)]}</dd></>)}
            {p.past_companies && (<><dt>Parcours</dt><dd>{p.past_companies}</dd></>)}
            {p.tags && (<><dt>Tags</dt><dd>{p.tags}</dd></>)}
            {p.email && (<><dt>E-mail</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd></>)}
            {p.linkedin_url && (<><dt>LinkedIn</dt><dd><a href={p.linkedin_url} target="_blank" rel="noreferrer noopener">Profil ↗</a></dd></>)}
            {p.notes && (<><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{p.notes}</dd></>)}
          </dl>
        </>
      )}

      <div className="spread" style={{ alignItems: "center" }}>
        <h2>Rencontres</h2>
        {!adding && <button onClick={() => setAdding(true)}>+ Rencontre</button>}
      </div>
      {adding && <MeetingForm onSubmit={(e) => saveMeeting(e)} onCancel={() => setAdding(false)} />}
      {mine.length === 0 && !adding && <p className="empty">Aucune rencontre.</p>}
      <div className="stack">
        {mine.map((m) => (
          <details key={m.id} className="card" open={m.status !== "seen" && m.status !== "cancelled"}>
            <summary className="row" style={{ cursor: "pointer" }}>
              <span className="chip">{MEETING_STATUS[m.status]}</span>
              <b>{m.topic || "Échange"}</b>
              <span className="muted small">{fmtDate(m.planned_at, true)}</span>
              {m.offer_id && <Link to={`/offres/${m.offer_id}`} className="small">offre liée</Link>}
            </summary>
            <div style={{ marginTop: 10 }}>
              <MeetingForm m={m} onSubmit={(e) => saveMeeting(e, m.id)} />
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

function MeetingForm({ m, onSubmit, onCancel }: { m?: Meeting; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel?: () => void }) {
  return (
    <form className="form" onSubmit={onSubmit} style={{ marginBottom: 10 }}>
      <Select name="status" label="Statut" options={MEETING_STATUS} defaultValue={m?.status ?? "to_see"} />
      <label>
        Date
        <input name="planned_at" type="datetime-local" defaultValue={toLocalInput(m?.planned_at)} />
      </label>
      <label className="full">
        Sujet
        <input name="topic" defaultValue={m?.topic ?? ""} />
      </label>
      <label className="full">
        Ce qui en est sorti
        <textarea name="outcome" defaultValue={m?.outcome ?? ""} />
      </label>
      <label className="full">
        Actions suivantes (qui me présente à qui, à relancer…)
        <textarea name="next_actions" defaultValue={m?.next_actions ?? ""} />
      </label>
      {m?.offer_id && <input type="hidden" name="offer_id" value={m.offer_id} />}
      <div className="row full">
        <button className="primary">Enregistrer</button>
        {onCancel && <button type="button" onClick={onCancel}>Annuler</button>}
      </div>
    </form>
  );
}
