import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Company, Interview, Meeting, Offer, Person, Process, SuggestionResult } from "@jobhunt/core";
import { api, useApi } from "../api";
import { fmtDate, fromLocalInput, INTERVIEW_STATUS, MEETING_STATUS, OFFER_STATUS, SOURCE, STAGE, toLocalInput } from "../labels";
import { formData, Loading, Score, Select, useToast } from "../ui";

interface Detail {
  offer: Offer;
  company: Company | null;
  process: Process | null;
  interviews: Interview[];
  meetings: (Meeting & { person: Person | null })[];
}

export function OfferDetailPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<Detail>(`/offers/${id}/detail`);
  const toast = useToast();
  const navigate = useNavigate();
  if (!data) return <Loading error={error} loading={loading} />;
  const { offer, company, process, interviews, meetings } = data;

  async function decide(decision: string) {
    await api(`/offers/${offer.id}/decision`, { method: "POST", body: { decision } });
    toast(decision === "apply" ? "Processus créé" : "Statut mis à jour");
    reload();
  }

  async function remove() {
    if (!confirm("Supprimer cette offre, son processus et ses entretiens ?")) return;
    await api(`/offers/${offer.id}`, { method: "DELETE" });
    navigate("/offres");
  }

  return (
    <>
      <p className="small">
        <Link to="/offres">← Offres</Link>
      </p>
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: 4 }}>{offer.title}</h1>
          <div className="muted">
            {company?.name ?? "Entreprise inconnue"}
            {offer.location && ` · ${offer.location}`}
            {offer.contract && ` · ${offer.contract}`}
            {offer.salary && ` · ${offer.salary}`}
          </div>
        </div>
        <Score value={offer.score} />
      </div>

      <div className="row small" style={{ margin: "12px 0" }}>
        <span className="chip">{OFFER_STATUS[offer.status]}</span>
        {offer.source && <span className="muted">{SOURCE[offer.source]}{offer.source_detail && ` (${offer.source_detail})`}</span>}
        <span className="muted">reçue {fmtDate(offer.received_at ?? offer.created_at)}</span>
        {offer.url && (
          <a href={offer.url} target="_blank" rel="noreferrer noopener">
            Voir l'annonce ↗
          </a>
        )}
      </div>

      {offer.score_reason && <p className="card small">{offer.score_reason}</p>}
      {offer.description && <p>{offer.description}</p>}

      <div className="row">
        {offer.status === "proposed" && (
          <>
            <button className="primary" onClick={() => decide("validate")}>Valider</button>
            <button onClick={() => decide("reject")}>Rejeter</button>
          </>
        )}
        {(offer.status === "validated" || offer.status === "proposed") && (
          <button className={offer.status === "validated" ? "primary" : ""} onClick={() => decide("apply")}>
            J'ai candidaté
          </button>
        )}
        {offer.status === "rejected" && <button onClick={() => decide("validate")}>Revalider</button>}
        {offer.status === "applied" && <button onClick={() => decide("close")}>Clore</button>}
        <button className="danger" onClick={remove} style={{ marginLeft: "auto" }}>Supprimer</button>
      </div>

      {process && <ProcessCard process={process} onSaved={reload} />}
      {process && <Interviews processId={process.id} interviews={interviews} onChange={reload} />}

      <h2>Réseau</h2>
      {meetings.length > 0 && (
        <div className="stack" style={{ marginBottom: 12 }}>
          {meetings.map((m) => (
            <Link key={m.id} to={`/reseau/${m.person_id}`} className="card row">
              <b>{m.person?.name}</b>
              <span className="chip">{MEETING_STATUS[m.status]}</span>
              <span className="muted small">{m.topic}</span>
            </Link>
          ))}
        </div>
      )}
      <Suggestions offerId={offer.id} existing={new Set(meetings.map((m) => m.person_id))} onAdded={reload} />
    </>
  );
}

function ProcessCard({ process, onSaved }: { process: Process; onSaved: () => void }) {
  const toast = useToast();
  async function save(e: React.FormEvent<HTMLFormElement>) {
    const f = formData(e);
    await api(`/processes/${process.id}`, { method: "PATCH", body: f });
    toast("Processus enregistré");
    onSaved();
  }
  return (
    <>
      <h2>Processus</h2>
      <form className="card form" onSubmit={save} key={process.updated_at}>
        <Select name="stage" label="Étape" options={STAGE} defaultValue={process.stage} />
        <label>
          Contact RH / recruteur
          <input name="contact_name" defaultValue={process.contact_name ?? ""} />
        </label>
        <label>
          Prochaine action
          <input name="next_step" defaultValue={process.next_step ?? ""} placeholder="Relancer, envoyer le cas…" />
        </label>
        <label>
          Pour le
          <input name="next_step_date" type="date" defaultValue={process.next_step_date ?? ""} />
        </label>
        <label className="full">
          Notes
          <textarea name="notes" defaultValue={process.notes ?? ""} />
        </label>
        <div className="full">
          <button className="primary">Enregistrer</button>
        </div>
      </form>
    </>
  );
}

function Interviews({ processId, interviews, onChange }: { processId: string; interviews: Interview[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const sorted = [...interviews].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));

  async function save(e: React.FormEvent<HTMLFormElement>, id?: string) {
    const f = formData(e);
    const body = { ...f, scheduled_at: fromLocalInput(f.scheduled_at ?? ""), process_id: processId };
    if (id) await api(`/interviews/${id}`, { method: "PATCH", body });
    else await api(`/interviews`, { method: "POST", body });
    toast("Entretien enregistré");
    setAdding(false);
    onChange();
  }

  return (
    <>
      <div className="spread" style={{ alignItems: "center" }}>
        <h2>Entretiens</h2>
        {!adding && <button onClick={() => setAdding(true)}>+ Entretien</button>}
      </div>
      {adding && <InterviewForm onSubmit={(e) => save(e)} onCancel={() => setAdding(false)} />}
      {sorted.length === 0 && !adding && <p className="empty">Aucun entretien pour l'instant.</p>}
      <div className="stack">
        {sorted.map((i) => (
          <details key={i.id} className="card">
            <summary className="row" style={{ cursor: "pointer" }}>
              <b>{i.kind || "Entretien"}</b>
              <span className={`chip ${i.status === "to_prepare" ? "warn" : ""}`}>{INTERVIEW_STATUS[i.status]}</span>
              <span className="muted small">{fmtDate(i.scheduled_at, true)}</span>
              {i.interviewers && <span className="small">avec {i.interviewers}</span>}
            </summary>
            <div style={{ marginTop: 10 }}>
              <InterviewForm interview={i} onSubmit={(e) => save(e, i.id)} />
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

function InterviewForm({
  interview,
  onSubmit,
  onCancel,
}: {
  interview?: Interview;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  return (
    <form className="form" onSubmit={onSubmit} style={{ marginBottom: 10 }}>
      <label>
        Date et heure
        <input name="scheduled_at" type="datetime-local" defaultValue={toLocalInput(interview?.scheduled_at)} />
      </label>
      <label>
        Type
        <input name="kind" defaultValue={interview?.kind ?? ""} placeholder="RH, manager, cas, pairs…" />
      </label>
      <label>
        Avec
        <input name="interviewers" defaultValue={interview?.interviewers ?? ""} />
      </label>
      <Select name="status" label="Statut" options={INTERVIEW_STATUS} defaultValue={interview?.status ?? "to_prepare"} />
      <label className="full">
        Fiche de préparation (chemin dans la base de connaissance)
        <input name="prep_path" defaultValue={interview?.prep_path ?? ""} placeholder="entretiens/entreprise-manager.md" />
      </label>
      <label className="full">
        Notes de préparation
        <textarea name="notes" defaultValue={interview?.notes ?? ""} />
      </label>
      <label className="full">
        Compte rendu / résultat
        <textarea name="outcome" defaultValue={interview?.outcome ?? ""} />
      </label>
      <div className="row full">
        <button className="primary">Enregistrer</button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
        )}
        {interview?.prep_path && <Link to={`/profil/${interview.prep_path}`}>Ouvrir la fiche</Link>}
      </div>
    </form>
  );
}

function Suggestions({ offerId, existing, onAdded }: { offerId: string; existing: Set<string>; onAdded: () => void }) {
  const { data, error, loading } = useApi<SuggestionResult>(`/offers/${offerId}/suggestions`);
  const toast = useToast();
  if (!data) return <Loading error={error} loading={loading} />;

  async function plan(person: Person, via?: Person) {
    await api("/meetings", {
      method: "POST",
      body: {
        person_id: (via ?? person).id,
        status: "to_see",
        offer_id: offerId,
        topic: via ? `Demander une présentation à ${person.name}` : `Échanger sur ${data!.company?.name ?? "l'offre"}`,
      },
    });
    toast("Ajouté aux rencontres à faire");
    onAdded();
  }

  return (
    <div className="stack">
      {data.suggestions.length === 0 && (
        <p className="empty">Personne dans ton réseau enregistré n'est lié à {data.company?.name ?? "cette entreprise"}.</p>
      )}
      {data.suggestions.map((s) => (
        <div key={s.person.id} className="card">
          <div className="spread">
            <div>
              <Link to={`/reseau/${s.person.id}`}>
                <b>{s.person.name}</b>
              </Link>
              <span className="muted small">
                {s.person.role && ` · ${s.person.role}`}
                {s.person.company_name && ` · ${s.person.company_name}`}
              </span>
              <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {s.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
                {s.via && <li>Présentation possible par {s.via.name}</li>}
              </ul>
            </div>
            {!existing.has((s.via ?? s.person).id) && (
              <button onClick={() => plan(s.person, s.via)}>{s.via ? `Voir ${s.via.name}` : "À voir"}</button>
            )}
          </div>
        </div>
      ))}
      {data.linkedin_search_url && (
        <a className="btn" href={data.linkedin_search_url} target="_blank" rel="noreferrer noopener">
          Chercher mes relations chez {data.company?.name} sur LinkedIn ↗
        </a>
      )}
    </div>
  );
}
