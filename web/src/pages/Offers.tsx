import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Company, Offer, Process } from "@jobhunt/core";
import { CATEGORIES, categoryOf, stateOf, type Category } from "@jobhunt/core/pipeline";
import { api, useApi } from "../api";
import { companyFacts, relDays, SOURCE } from "../labels";
import { nextMove, StateChip, type Move } from "../Pipeline";
import { isFresh } from "./Home";
import { formData, Loading, Score, useToast } from "../ui";

type Tab = Category | "all";
const TABS: { key: Tab; label: string }[] = [
  ...CATEGORIES.map((c) => ({ key: c.key as Tab, label: c.label })),
  { key: "all", label: "Toutes" },
];

/** Décision rapide depuis la liste, pour les premières étapes. */
const QUICK_EXIT: Partial<Record<Category, { exit: "rejected" | "not_applying"; label: string }>> = {
  new: { exit: "rejected", label: "Pas intéressante" },
  interesting: { exit: "not_applying", label: "Je ne postule pas" },
};

export function OffersPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "new";
  const [query, setQuery] = useState("");
  const offers = useApi<Offer[]>("/offers");
  const companies = useApi<Company[]>("/companies");
  const processes = useApi<Process[]>("/processes");
  const duplicates = useApi<Offer[][]>("/offers/duplicates");
  const toast = useToast();

  const companyOf = useMemo(() => {
    const m = new Map((companies.data ?? []).map((c) => [c.id, c]));
    return (id?: string | null) => (id ? m.get(id) : undefined);
  }, [companies.data]);
  const processOf = useMemo(() => {
    const m = new Map((processes.data ?? []).map((p) => [p.offer_id, p]));
    return (id: string) => m.get(id);
  }, [processes.data]);

  const rows = (offers.data ?? []).map((o) => {
    const state = stateOf(o, processOf(o.id));
    return { offer: o, state, category: categoryOf(state), company: companyOf(o.company_id) };
  });
  const count = (t: Tab) => (t === "all" ? rows.length : rows.filter((r) => r.category === t).length);
  const arrived = (o: Offer) => o.received_at ?? o.created_at;
  const list = rows
    .filter((r) => tab === "all" || r.category === tab)
    .filter((r) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return `${r.offer.title} ${r.company?.name ?? ""} ${r.offer.location ?? ""}`.toLowerCase().includes(q);
    })
    // Nouvelles : les dernières arrivées en tête. Ailleurs : les dernières bougées en tête.
    .sort((a, b) =>
      tab === "new" ? arrived(b.offer).localeCompare(arrived(a.offer)) : b.offer.updated_at.localeCompare(a.offer.updated_at),
    );

  async function move(o: Offer, m: Move, msg: string) {
    await api(`/offers/${o.id}/move`, { method: "POST", body: m });
    toast(msg);
    offers.reload();
    processes.reload();
  }

  const dupCount = duplicates.data?.length ?? 0;

  return (
    <>
      <div className="spread">
        <h1>Offres</h1>
      </div>
      <AddOffer onAdded={() => offers.reload()} />

      {dupCount > 0 && (
        <div className="card banner small" style={{ marginTop: 12 }}>
          <b>{dupCount === 1 ? "1 doublon probable" : `${dupCount} doublons probables`}</b> (même intitulé, même entreprise) :{" "}
          {duplicates.data!.map((g, i) => (
            <span key={i}>
              {i > 0 && " · "}
              <Link to={`/offres/${g[0].id}`}>
                {g[0].title} ({g.length})
              </Link>
            </span>
          ))}
          . Ouvre l'offre pour les fusionner.
        </div>
      )}

      <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={t.key === tab ? "active" : ""} onClick={() => setParams({ tab: t.key })} role="tab" aria-selected={t.key === tab}>
            {t.label} <span className="muted">{offers.data ? count(t.key) : ""}</span>
          </button>
        ))}
      </div>
      <input type="search" placeholder="Filtrer par intitulé, entreprise, lieu…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="stack" style={{ marginTop: 12 }}>
        <Loading error={offers.error} loading={offers.loading && !offers.data} />
        {offers.data && list.length === 0 && <p className="empty">Aucune offre ici.</p>}
        {list.map(({ offer: o, state, category, company }) => {
          const facts = companyFacts(company);
          const next = state.exit ? null : nextMove(state.step);
          const quickExit = QUICK_EXIT[category];
          const quick = category === "new" || category === "interesting" || category === "to_apply";
          return (
            <div key={o.id} className="card">
              <div className="spread">
                <div>
                  <Link to={`/offres/${o.id}`}>
                    <h3>
                      {isFresh(o.created_at) && <span className="new-dot" title="Arrivée il y a moins de 48 h" />}
                      {o.title}
                    </h3>
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
                <StateChip state={state} />
                {o.approach === "network" && <span className="chip ok">Réseau activé</span>}
                {o.source && <span className="muted">{SOURCE[o.source] ?? o.source}</span>}
                <span className="muted">reçue {relDays(arrived(o))}</span>
                {quick && next && (
                  <span className="row" style={{ marginLeft: "auto" }}>
                    {quickExit && <button onClick={() => move(o, { exit: quickExit.exit }, quickExit.label)}>✕ {quickExit.label}</button>}
                    <button className="primary" onClick={() => move(o, { step: next.step }, next.label)}>
                      {next.label} →
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
