import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Company, Offer, Process } from "@jobhunt/core";
import { api, useApi } from "../api";
import { fmtDate, OFFER_STATUS, SOURCE, STAGE } from "../labels";
import { formData, Loading, Score, useToast } from "../ui";

const TABS = {
  proposed: "À valider",
  active: "En cours",
  validated: "Validées",
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

  const companyName = useMemo(() => {
    const m = new Map((companies.data ?? []).map((c) => [c.id, c.name]));
    return (id?: string | null) => (id ? (m.get(id) ?? "") : "");
  }, [companies.data]);
  const processOf = useMemo(() => {
    const m = new Map((processes.data ?? []).map((p) => [p.offer_id, p]));
    return (id: string) => m.get(id);
  }, [processes.data]);

  const list = (offers.data ?? [])
    .filter((o) => {
      if (tab === "proposed") return o.status === "proposed";
      if (tab === "validated") return o.status === "validated";
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

  async function decide(o: Offer, decision: "validate" | "reject") {
    await api(`/offers/${o.id}/decision`, { method: "POST", body: { decision } });
    toast(decision === "validate" ? "Offre validée" : "Offre rejetée");
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
          return (
            <div key={o.id} className="card">
              <div className="spread">
                <div>
                  <Link to={`/offres/${o.id}`}>
                    <h3>{o.title}</h3>
                  </Link>
                  <div className="muted">
                    {companyName(o.company_id) || "Entreprise inconnue"}
                    {o.location && ` · ${o.location}`}
                  </div>
                </div>
                <Score value={o.score} />
              </div>
              {o.score_reason && <p className="small muted" style={{ margin: "6px 0 0" }}>{o.score_reason}</p>}
              <div className="row small" style={{ marginTop: 8 }}>
                <span className="chip">{proc ? STAGE[proc.stage] : OFFER_STATUS[o.status]}</span>
                {o.source && <span className="muted">{SOURCE[o.source] ?? o.source}</span>}
                <span className="muted">{fmtDate(o.received_at ?? o.created_at)}</span>
                {o.status === "proposed" && (
                  <span className="row" style={{ marginLeft: "auto" }}>
                    <button onClick={() => decide(o, "reject")}>Rejeter</button>
                    <button className="primary" onClick={() => decide(o, "validate")}>
                      Valider
                    </button>
                  </span>
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
      const res = await api<{ created: Offer[]; duplicates: number }>("/offers/import", {
        method: "POST",
        body: { url: f.url, text: f.text },
      });
      if (res.created[0]) {
        toast("Offre ajoutée et notée");
        onAdded();
        navigate(`/offres/${res.created[0].id}`);
      } else if (res.duplicates) setError("Cette offre est déjà enregistrée.");
      else setError("Aucune offre reconnue dans ce contenu.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <form className="form" onSubmit={submit}>
        <label className="full">
          Lien de l'offre
          <input name="url" type="url" placeholder="https://…" />
        </label>
        <label className="full">
          Ou colle le texte de l'offre (nécessaire pour LinkedIn, qui bloque la lecture automatique)
          <textarea name="text" />
        </label>
        <div className="row full">
          <button className="primary" disabled={busy}>
            {busy ? "Analyse en cours…" : "Analyser et ajouter"}
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
