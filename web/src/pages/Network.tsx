import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Introduction, Meeting, Person } from "@jobhunt/core";
import { api, useApi } from "../api";
import { fmtDate, INTRO_STATUS, MEETING_STATUS, STRENGTH } from "../labels";
import { formData, Loading, Select, useToast } from "../ui";

type Tab = "todo" | "people" | "intros";

export function NetworkPage() {
  const [tab, setTab] = useState<Tab>("todo");
  const [query, setQuery] = useState("");
  const people = useApi<Person[]>("/people");
  const meetings = useApi<Meeting[]>("/meetings");
  const intros = useApi<Introduction[]>("/introductions");
  if (!people.data || !meetings.data || !intros.data) return <Loading error={people.error} loading />;

  const byId = new Map(people.data.map((p) => [p.id, p]));
  const todo = meetings.data
    .filter((m) => m.status === "to_see" || m.status === "planned")
    .sort((a, b) => (a.planned_at ?? "9999").localeCompare(b.planned_at ?? "9999"));
  const recent = meetings.data
    .filter((m) => m.status === "seen")
    .sort((a, b) => (b.planned_at ?? b.updated_at).localeCompare(a.planned_at ?? a.updated_at))
    .slice(0, 10);
  const filtered = people.data
    .filter((p) => `${p.name} ${p.company_name ?? ""} ${p.role ?? ""} ${p.tags ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <h1>Réseau</h1>
      <div className="tabs">
        <button className={tab === "todo" ? "active" : ""} onClick={() => setTab("todo")}>
          Rencontres ({todo.length})
        </button>
        <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>
          Personnes ({people.data.length})
        </button>
        <button className={tab === "intros" ? "active" : ""} onClick={() => setTab("intros")}>
          Qui présente qui
        </button>
      </div>

      {tab === "todo" && (
        <>
          <h2>À voir / planifiées</h2>
          {todo.length === 0 && <p className="empty">Personne à voir. Ajoute des rencontres depuis une fiche personne ou une offre.</p>}
          <div className="stack">
            {todo.map((m) => (
              <MeetingRow key={m.id} m={m} person={byId.get(m.person_id)} />
            ))}
          </div>
          <h2>Vues récemment</h2>
          <div className="stack">
            {recent.map((m) => (
              <MeetingRow key={m.id} m={m} person={byId.get(m.person_id)} />
            ))}
          </div>
        </>
      )}

      {tab === "people" && (
        <>
          <AddPerson onAdded={people.reload} />
          <input type="search" placeholder="Nom, entreprise, rôle, tag…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ margin: "12px 0" }} />
          <div className="grid">
            {filtered.map((p) => (
              <Link key={p.id} to={`/reseau/${p.id}`} className="card">
                <h3>{p.name}</h3>
                <div className="muted small">
                  {[p.role, p.company_name].filter(Boolean).join(" · ")}
                </div>
                {p.strength && <span className="chip small">{STRENGTH[String(p.strength)]}</span>}
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === "intros" && <Intros people={people.data} intros={intros.data} onChange={intros.reload} />}
    </>
  );
}

function MeetingRow({ m, person }: { m: Meeting; person?: Person }) {
  return (
    <Link to={`/reseau/${m.person_id}`} className="card">
      <div className="spread">
        <div>
          <b>{person?.name ?? "?"}</b>
          <span className="muted small"> {person?.company_name && `· ${person.company_name}`}</span>
          <div className="small">{m.topic}</div>
          {m.status === "seen" && m.outcome && <div className="small muted">{m.outcome}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="chip">{MEETING_STATUS[m.status]}</span>
          {m.planned_at && <div className="small muted">{fmtDate(m.planned_at, true)}</div>}
        </div>
      </div>
    </Link>
  );
}

function AddPerson({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!open) return <button className="primary" onClick={() => setOpen(true)}>+ Personne</button>;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    const p = await api<Person>("/people", { method: "POST", body: formData(e) });
    onAdded();
    navigate(`/reseau/${p.id}`);
  }
  return (
    <form className="card form" onSubmit={submit}>
      <PersonFields />
      <div className="row full">
        <button className="primary">Ajouter</button>
        <button type="button" onClick={() => setOpen(false)}>Annuler</button>
      </div>
    </form>
  );
}

export function PersonFields({ p }: { p?: Person }) {
  return (
    <>
      <label>
        Nom
        <input name="name" required defaultValue={p?.name} />
      </label>
      <label>
        Entreprise actuelle
        <input name="company_name" defaultValue={p?.company_name ?? ""} />
      </label>
      <label>
        Rôle
        <input name="role" defaultValue={p?.role ?? ""} />
      </label>
      <Select name="strength" label="Force du lien" options={STRENGTH} defaultValue={String(p?.strength ?? 1)} />
      <label>
        Anciennes entreprises (séparées par des virgules)
        <input name="past_companies" defaultValue={p?.past_companies ?? ""} />
      </label>
      <label>
        Tags (secteur, sujet…)
        <input name="tags" defaultValue={p?.tags ?? ""} />
      </label>
      <label>
        LinkedIn
        <input name="linkedin_url" type="url" defaultValue={p?.linkedin_url ?? ""} />
      </label>
      <label>
        E-mail
        <input name="email" type="email" defaultValue={p?.email ?? ""} />
      </label>
      <label className="full">
        Notes
        <textarea name="notes" defaultValue={p?.notes ?? ""} />
      </label>
    </>
  );
}

function Intros({ people, intros, onChange }: { people: Person[]; intros: Introduction[]; onChange: () => void }) {
  const toast = useToast();
  const byId = new Map(people.map((p) => [p.id, p]));
  const options = Object.fromEntries([["", "—"], ...people.map((p) => [p.id, p.name])]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    const f = formData(e);
    await api("/introductions", { method: "POST", body: f });
    toast("Introduction enregistrée");
    (e.target as HTMLFormElement).reset();
    onChange();
  }
  async function setStatus(i: Introduction, status: string) {
    await api(`/introductions/${i.id}`, { method: "PATCH", body: { status } });
    onChange();
  }

  return (
    <>
      <form className="card form" onSubmit={add}>
        <Select name="introducer_id" label="Qui présente" options={options} />
        <Select name="introduced_id" label="À qui" options={options} />
        <Select name="status" label="Statut" options={INTRO_STATUS} defaultValue="to_ask" />
        <label>
          Notes
          <input name="notes" />
        </label>
        <div className="full">
          <button className="primary">Ajouter</button>
        </div>
      </form>
      <div className="stack" style={{ marginTop: 12 }}>
        {intros.map((i) => (
          <div key={i.id} className="card spread">
            <div>
              <Link to={`/reseau/${i.introducer_id}`}>{byId.get(i.introducer_id)?.name ?? "?"}</Link>
              {" → "}
              <Link to={`/reseau/${i.introduced_id}`}>{byId.get(i.introduced_id)?.name ?? "?"}</Link>
              <span className="muted small"> {byId.get(i.introduced_id)?.company_name && `(${byId.get(i.introduced_id)?.company_name})`}</span>
              {i.notes && <div className="small muted">{i.notes}</div>}
            </div>
            <select value={i.status} onChange={(e) => setStatus(i, e.target.value)} style={{ width: "auto" }}>
              {Object.entries(INTRO_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}
