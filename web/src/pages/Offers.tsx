import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Company, Offer, Process } from "@jobhunt/core";
import { api, useApi } from "../api";
import { companyFacts, fmtDate, OFFER_STATUS, SOURCE, STAGE } from "../labels";
import { formData, Loading, Score, useToast } from "../ui";

// Le parcours d'une offre : à valider → validée (réseau d'abord, ou à postuler) → candidature.
const TABS = {
  proposed: "À valider",
  network: "Réseau d'abord",
  direct: "À postuler",
  active: "Candidatures",
  all: "Toutes",
} as const;
type Tab = keyof typeof TABS;

export function OffersPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "proposed";
  const [query, setQuery] = useState("");
  const offers = useApi<Offer[]>("/offers");
  const companies = useApi<Company[]>("/companies");
  const processes = useApi<Process[]>("/processes");
  const toast = useToast();

  const companyOf = useMemo(() => {
    const m = new Map((companies.data ?? []).map((c) => [c.id, c]));
    return (id?: string | null) => (id ? m.get(id) : undefined);
  }, [companies.data]);
  const companyName = (id?: string | null) => companyOf(id)?.name ?? "";
  const processOf = useMemo(() => {
    const m = new Map((processes.data ?? []).map((p) => [p.offer_id, p]));
    return (id: string) => m.get(id);
  }, [processes.data]);

  const list = (offers.data ?? [])
    .filter((o) => {
      if (tab === "proposed") return o.status === "proposed";
      if (tab === "network") return o.status === "validated" && o.approach === "network";
      if (tab === "direct") return o.status === "validated" && o.approach !== "network";
      if (tab === "active") return o.status === "applied";
      return true;
    })
    .filter((o) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return `${o.title} ${companyName(o.company_id)} ${o.location ?? ""}`.toLowerCase().includes(q);
    })
    .sort((a, b) =>
      tab === "proposed" ? (b.score ?? -1) - (a.score ?? -1) : (b.received_at ?? b.created_at).localeCompare(a.received_at ?? a.created_at),
    );

  async function decide(o: Offer, decision: "validate" | "reject", approach?: "direct" | "network") {
    await api(`/offers/${o.id}/decision`, { method: "POST", body: { decision, approach } });
    toast(decision === "reject" ? "Offre rejetée" : approach === "network" ? "Validée : réseau d'abord" : "Validée : à postuler");
    offers.reload();
  }

  return (
    <>
      <div className="spread">
        <h1>Offres</h1>
      </div>
      <AddOffer onAdded={() => offers.reload()} />

      <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setParams({ tab: t })} role="tab" aria-selected={t === tab}>
            {TABS[t]}
          </button>
        ))}
      </div>
      <input type="search" placeholder="Filtrer par intitulé, entreprise, lieu…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="stack" style={{ marginTop: 12 }}>
        <Loading error={offers.error} loading={offers.loading && !offers.data} />
        {offers.data && list.length === 0 && <p className="empty">Aucune offre ici.</p>}
        {list.map((o) => {
          const proc = processOf(o.id);
          const company = companyOf(o.company_id);
          const facts = companyFacts(company);
          return (
            <div key={o.id} className="card">
              <div className="spread">
                <div>
                  <Link to={`/offres/${o.id}`}>
                    <h3>{o.title}</h3>
                  </Link>
                  <div className="muted">
                    {company?.name || "Entreprise inconnue"}
                    {o.location && ` · ${o.location}`}
                    {o.remote && ` · ${o.remote}`}
                  </div>
                  {facts && <div className="small muted">{facts}</div>}
                </div>
                <Score value={o.score} />
              </div>
              {company?.description && <p className="small clamp" style={{ margin: "6px 0 0" }}>{company.description}</p>}
              {o.score_reason && <p className="small muted" style={{ margin: "6px 0 0" }}>{o.score_reason}</p>}
              <div className="row small" style={{ marginTop: 8 }}>
                <span className="chip">{proc ? STAGE[proc.stage] : OFFER_STATUS[o.status]}</span>
                {o.source && <span className="muted">{SOURCE[o.source] ?? o.source}</span>}
                <span className="muted">{fmtDate(o.received_at ?? o.created_at)}</span>
                {o.status === "proposed" && (
                  <span className="row" style={{ marginLeft: "auto" }}>
                    <button onClick={() => decide(o, "reject")}>Rejeter</button>
                    <button onClick={() => decide(o, "validate", "network")} title="Chercher d'abord quelqu'un qui peut me recommander">
                      Réseau d'abord
                    </button>
                    <button className="primary" onClick={() => decide(o, "validate", "direct")}>
                      Postuler
                    </button>
                  </span>
                )}
                {o.status === "validated" && (
                  <Link to={`/offres/${o.id}`} style={{ marginLeft: "auto" }}>
                    {o.approach === "network" ? "Voir les contacts →" : "Postuler →"}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AddOffer({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  if (!open) {
    return (
      <button className="primary" onClick={() => setOpen(true)}>
        + Ajouter une offre
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    const f = formData(e);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ created: Offer[]; duplicates: number }>("/offers/manual", { method: "POST", body: f });
      if (res.created[0]) {
        toast("Offre ajoutée");
        onAdded();
        navigate(`/offres/${res.created[0].id}`);
      } else setError("Cette offre est déjà enregistrée.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <form className="form" onSubmit={submit}>
        <label>
          Intitulé du poste
          <input name="title" required />
        </label>
        <label>
          Entreprise
          <input name="company" />
        </label>
        <label>
          Lieu
          <input name="location" />
        </label>
        <label>
          Lien de l'offre
          <input name="url" type="url" placeholder="https://…" />
        </label>
        <label>
          Contrat
          <input name="contract" placeholder="CDI, freelance…" />
        </label>
        <label>
          Rémunération
          <input name="salary" />
        </label>
        <label className="full">
          Description (facultatif)
          <textarea name="description" />
        </label>
        <div className="row full">
          <button className="primary" disabled={busy}>
            {busy ? "Ajout…" : "Ajouter"}
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Annuler
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </form>
    </div>
  );
}
