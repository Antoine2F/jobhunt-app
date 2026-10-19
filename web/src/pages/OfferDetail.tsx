import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Company, Interview, Meeting, Offer, Person, Process, SuggestionResult } from "@jobhunt/core";
import type { PipelineState } from "@jobhunt/core/pipeline";
// Seul le schéma est importé en valeur : le reste du noyau dépend de Node.
import { COMPANY_SECTORS } from "@jobhunt/core/schema";
import { api, useApi } from "../api";
import { companyFacts, fmtDate, fromLocalInput, INTERVIEW_STATUS, MEETING_STATUS, SOURCE, toLocalInput } from "../labels";
import { Pipeline, stateLabel, type Move } from "../Pipeline";
import { formData, Loading, Score, Select, useToast } from "../ui";

interface Detail {
  offer: Offer;
  company: Company | null;
  process: Process | null;
  state: PipelineState;
  duplicates: Offer[];
  interviews: Interview[];
  meetings: (Meeting & { person: Person | null })[];
}

export function OfferDetailPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<Detail>(`/offers/${id}/detail`);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  if (!data) return <Loading error={error} loading={loading} />;
  const { offer, company, process, state, duplicates, interviews, meetings } = data;

  async function move(m: Move) {
    setBusy(true);
    try {
      const res = await api<{ state: PipelineState }>(`/offers/${offer.id}/move`, { method: "POST", body: m });
      toast(stateLabel(res.state));
      reload();
    } finally {
      setBusy(false);
    }
  }
  async function setNetwork(on: boolean) {
    await api(`/offers/${offer.id}`, { method: "PATCH", body: { approach: on ? "network" : null } });
    toast(on ? "Démarche réseau activée" : "Démarche réseau désactivée");
    reload();
  }
  async function merge(other: Offer) {
    if (!confirm(`Fusionner « ${other.title} » dans cette offre ? Le doublon sera supprimé, ses entretiens et rencontres rattachés ici.`)) return;
    await api(`/offers/${offer.id}/merge`, { method: "POST", body: { from: other.id } });
    toast("Doublon fusionné");
    reload();
  }
  async function remove() {
    if (!confirm("Supprimer cette offre, son processus et ses entretiens ?")) return;
    await api(`/offers/${offer.id}`, { method: "DELETE" });
    navigate("/offres");
  }
  const network = offer.approach === "network";
  const applying = ["to_apply", "applied"].includes(state.step) || !!offer.cover_letter_url || !!offer.cv_url;

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
            {offer.remote && ` · ${offer.remote}`}
            {offer.contract && ` · ${offer.contract}`}
            {offer.salary && ` · ${offer.salary}`}
          </div>
        </div>
        <Score value={offer.score} />
      </div>

      <div className="row small" style={{ margin: "12px 0" }}>
        {offer.source && <span className="muted">{SOURCE[offer.source]}{offer.source_detail && ` (${offer.source_detail})`}</span>}
        <span className="muted">reçue {fmtDate(offer.received_at ?? offer.created_at)}</span>
        {offer.url && (
          <a href={offer.url} target="_blank" rel="noreferrer noopener">
            Voir l'annonce ↗
          </a>
        )}
      </div>

      {duplicates.length > 0 && (
        <div className="card banner small" style={{ marginBottom: 12 }}>
          <b>Doublon probable</b> : même intitulé dans la même entreprise.
          {duplicates.map((d) => (
            <div key={d.id} className="row" style={{ marginTop: 6 }}>
              <Link to={`/offres/${d.id}`}>{d.title}</Link>
              <span className="muted">reçue {fmtDate(d.received_at ?? d.created_at)}</span>
              <button onClick={() => merge(d)}>Fusionner ici</button>
            </div>
          ))}
        </div>
      )}

      <Pipeline state={state} onMove={move} busy={busy} />

      <div className="card row" style={{ marginTop: 10 }}>
        <b>Réseau</b>
        <span className="small muted">en parallèle de la candidature : trouver quelqu'un qui peut recommander ou présenter</span>
        <span className="row" style={{ marginLeft: "auto" }}>
          <button className={network ? "primary" : ""} onClick={() => !network && setNetwork(true)}>
            Activé
          </button>
          <button className={!network ? "primary" : ""} onClick={() => network && setNetwork(false)}>
            Non
          </button>
        </span>
      </div>

      {applying && <ApplyKit offer={offer} company={company} onSaved={reload} />}

      {offer.score_reason && <p className="card small">{offer.score_reason}</p>}
      {offer.description && <p>{offer.description}</p>}

      {company && <CompanyCard company={company} onSaved={reload} />}
      {process && <ProcessCard process={process} onSaved={reload} />}
      {process && <Interviews processId={process.id} interviews={interviews} onChange={reload} />}

      {(network || meetings.length > 0) && (
        <>
          <h2>Contacts pour cette offre</h2>
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
          {network && <Suggestions offerId={offer.id} existing={new Set(meetings.map((m) => m.person_id))} onAdded={reload} />}
        </>
      )}

      <div className="row" style={{ marginTop: 24 }}>
        <button className="danger" onClick={remove} style={{ marginLeft: "auto" }}>
          Supprimer l'offre
        </button>
      </div>
    </>
  );
}

/**
 * Aide à la candidature. L'appli n'appelle pas Claude elle-même (pas de clé API) :
 * les boutons ouvrent Claude avec la demande prête, le skill dossier-candidature
 * crée les documents dans Google Drive et range leurs liens ici.
 */
function ApplyKit({ offer, company, onSaved }: { offer: Offer; company: Company | null; onSaved: () => void }) {
  const toast = useToast();
  const ask = (what: string) =>
    `https://claude.ai/new?q=${encodeURIComponent(
      `/dossier-candidature ${what} ${offer.id}\n${offer.title} — ${company?.name ?? ""}${offer.url ? `\n${offer.url}` : ""}`,
    )}`;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    await api(`/offers/${offer.id}`, { method: "PATCH", body: formData(e) });
    toast("Liens enregistrés");
    onSaved();
  }
  return (
    <>
      <h2>Candidater</h2>
      <div className="card">
        <div className="row">
          {offer.url && (
            <a className="btn primary" href={offer.url} target="_blank" rel="noreferrer noopener">
              Ouvrir l'annonce ↗
            </a>
          )}
          {offer.cover_letter_url ? (
            <a className="btn" href={offer.cover_letter_url} target="_blank" rel="noreferrer noopener">
              Lettre de motivation ↗
            </a>
          ) : (
            <a className="btn" href={ask("lettre")} target="_blank" rel="noreferrer noopener">
              Générer la lettre (Claude) ↗
            </a>
          )}
          {offer.cv_url ? (
            <a className="btn" href={offer.cv_url} target="_blank" rel="noreferrer noopener">
              CV adapté ↗
            </a>
          ) : (
            <a className="btn" href={ask("cv")} target="_blank" rel="noreferrer noopener">
              Préparer le CV (Claude) ↗
            </a>
          )}
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          Claude crée les documents dans Google Drive (dossier « Recherche d'emploi / Candidatures ») et les relie à l'offre : recharge la page
          ensuite.
        </p>
        <details style={{ marginTop: 6 }}>
          <summary className="small" style={{ cursor: "pointer" }}>Liens des documents</summary>
          <form className="form" onSubmit={save} key={offer.updated_at} style={{ marginTop: 8 }}>
            <label className="full">
              Lettre de motivation
              <input name="cover_letter_url" type="url" defaultValue={offer.cover_letter_url ?? ""} placeholder="https://docs.google.com/…" />
            </label>
            <label className="full">
              CV
              <input name="cv_url" type="url" defaultValue={offer.cv_url ?? ""} placeholder="https://docs.google.com/…" />
            </label>
            <div className="full">
              <button className="primary">Enregistrer</button>
            </div>
          </form>
        </details>
      </div>
    </>
  );
}

function CompanyCard({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const toast = useToast();
  const facts = companyFacts(company);
  const empty = !company.description && !facts && !company.headquarters && !company.dev_offices && !company.capital_origin;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    await api(`/companies/${company.id}`, { method: "PATCH", body: formData(e) });
    toast("Entreprise enregistrée");
    onSaved();
  }
  return (
    <>
      <h2>L'entreprise</h2>
      <div className="card">
        <div className="spread">
          <b>{company.name}</b>
          {company.website && (
            <a className="small" href={company.website} target="_blank" rel="noreferrer noopener">
              Site ↗
            </a>
          )}
        </div>
        {facts && <div className="small muted">{facts}</div>}
        {company.headquarters && <div className="small muted">Siège : {company.headquarters}</div>}
        {company.dev_offices && <div className="small muted">Équipes produit / tech : {company.dev_offices}</div>}
        {company.founders_nationality && <div className="small muted">Fondateurs : {company.founders_nationality}</div>}
        {company.capital_origin && <div className="small muted">Capital : {company.capital_origin}</div>}
        {company.description && <p className="small" style={{ margin: "6px 0 0" }}>{company.description}</p>}
        {empty && <p className="small muted">Pas encore d'informations : la veille les ajoute pour les offres bien notées, ou complète-les ici.</p>}
        <details style={{ marginTop: 8 }}>
          <summary className="small" style={{ cursor: "pointer" }}>Compléter</summary>
          <form className="form" onSubmit={save} key={company.updated_at} style={{ marginTop: 8 }}>
            <label className="full">
              Ce que fait l'entreprise
              <textarea name="description" defaultValue={company.description ?? ""} />
            </label>
            <label>
              Secteur
              <input name="sector" list="sectors" defaultValue={company.sector ?? ""} />
              <datalist id="sectors">
                {COMPANY_SECTORS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              Effectif
              <input name="size" defaultValue={company.size ?? ""} placeholder="450 salariés" />
            </label>
            <label>
              Financement / stade
              <input name="funding" defaultValue={company.funding ?? ""} placeholder="Série C, 2025" />
            </label>
            <label>
              Siège (ville, pays)
              <input name="headquarters" defaultValue={company.headquarters ?? ""} placeholder="Paris, France" />
            </label>
            <label>
              Équipes produit / tech
              <input name="dev_offices" defaultValue={company.dev_offices ?? ""} placeholder="Paris, Lisbonne" />
            </label>
            <label>
              Nationalité des fondateurs
              <input name="founders_nationality" defaultValue={company.founders_nationality ?? ""} placeholder="Française" />
            </label>
            <label className="full">
              Origine des capitaux
              <input name="capital_origin" defaultValue={company.capital_origin ?? ""} placeholder="VC US (Sequoia), fondateurs majoritaires" />
            </label>
            <label className="full">
              Site
              <input name="website" type="url" defaultValue={company.website ?? ""} />
            </label>
            <div className="full">
              <button className="primary">Enregistrer</button>
            </div>
          </form>
        </details>
      </div>
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
      <h2>Suivi de la candidature</h2>
      <form className="card form" onSubmit={save} key={process.updated_at}>
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
      {data.linkedin_searches.length > 0 && (
        <div className="row">
          {data.linkedin_searches.map((l) => (
            <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer noopener">
              {l.label} sur LinkedIn ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
