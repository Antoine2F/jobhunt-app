import type { MemoryStore } from "./store.js";

// Données fictives pour le développement local (DATA_BACKEND=memory).
// Jamais chargées quand l'appli est branchée sur Azure SQL.

const iso = (days: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const day = (days: number) => iso(days).slice(0, 10);
const meta = (id: string) => ({ id, created_at: iso(-20), updated_at: iso(-1) });

export function seedDemo(store: MemoryStore) {
  store.load("companies", [
    { ...meta("c-1"), name: "Exemple Énergie", sector: "énergie", size: "5000+", website: "https://exemple-energie.test", description: "Énergéticien européen fictif, programme data et IA groupe lancé en 2025.", funding: "Coté", headquarters: "La Défense" },
    { ...meta("c-2"), name: "Fintech Démo", sector: "finance", size: "200-500" },
    { ...meta("c-3"), name: "Conseil Fictif", sector: "conseil", size: "1000+" },
  ]);
  store.load("offers", [
    {
      ...meta("o-1"), company_id: "c-1", title: "Head of Data & IA", location: "Paris", source: "linkedin",
      url: "https://www.linkedin.com/jobs/view/1000000001", url_key: "linkedin:1000000001", status: "applied",
      score: 86, score_reason: "Rôle de direction data, secteur énergie recherché", received_at: iso(-15),
    },
    {
      ...meta("o-2"), company_id: "c-2", title: "Directeur produit", location: "Paris (hybride)", source: "wttj",
      url_key: "wttj:fintech-demo/directeur-produit", status: "applied", score: 72,
      score_reason: "Bon périmètre produit, taille d'entreprise un peu petite", received_at: iso(-10),
    },
    {
      ...meta("o-3"), company_id: "c-3", title: "Manager transformation IA", location: "Lyon", source: "cabinet",
      source_detail: "Cabinet exemple", url_key: "title:conseil fictif|manager transformation ia", status: "proposed",
      score: 58, score_reason: "Conseil (à éviter selon tes préférences), mais sujet IA pertinent", received_at: iso(-1),
    },
    {
      ...meta("o-4"), company_id: "c-1", title: "Chief Data Officer adjoint", location: "La Défense", source: "linkedin",
      url_key: "linkedin:1000000004", status: "proposed", score: 79,
      score_reason: "Même entreprise qu'un processus en cours ; poste plus transverse", received_at: iso(0, 7),
    },
    {
      ...meta("o-5"), company_id: "c-2", title: "Head of Product Data", location: "Paris", source: "linkedin",
      url_key: "linkedin:1000000005", status: "interesting", score: 75, score_reason: "Produit data, bonne taille", received_at: iso(-3),
    },
    {
      ...meta("o-6"), company_id: "c-3", title: "Directeur data & IA", location: "Paris", source: "manual",
      url: "https://carrieres.conseil-fictif.test/offres/42", url_key: "carrieres.conseil-fictif.test/offres/42", status: "validated", score: 70, received_at: iso(-4),
    },
    {
      ...meta("o-7"), company_id: "c-1", title: "Responsable plateforme data", location: "La Défense", source: "linkedin",
      url_key: "linkedin:1000000007", status: "applied", score: 74, received_at: iso(-20),
    },
    {
      ...meta("o-8"), company_id: "c-2", title: "VP Data", location: "Paris", source: "wttj",
      url_key: "wttj:fintech-demo/vp-data", status: "closed", score: 80, received_at: iso(-40),
    },
  ]);
  store.load("processes", [
    { ...meta("p-1"), offer_id: "o-1", stage: "interviews", next_step: "Relancer la RH après le 2e entretien", next_step_date: day(5) },
    { ...meta("p-2"), offer_id: "o-2", stage: "screening", next_step: "Envoyer le cas pratique", next_step_date: day(2) },
    { ...meta("p-3"), offer_id: "o-7", stage: "applied", next_step: "Relancer si pas de nouvelles", next_step_date: day(6) },
    { ...meta("p-4"), offer_id: "o-8", stage: "screening", outcome: "lost" },
  ]);
  store.load("interviews", [
    { ...meta("i-1"), process_id: "p-1", scheduled_at: iso(-6, 14), kind: "RH", status: "done", outcome: "Bon feeling, process en 3 tours" },
    { ...meta("i-2"), process_id: "p-1", scheduled_at: iso(3, 11), kind: "manager", interviewers: "Directrice data", status: "to_prepare", prep_path: "entretiens/exemple-energie-manager.md" },
  ]);
  store.load("people", [
    { ...meta("pe-1"), name: "Camille Exemple", company_id: "c-1", company_name: "Exemple Énergie", role: "Lead data engineer", strength: 2, tags: "data, énergie" },
    { ...meta("pe-2"), name: "Alex Démo", company_name: "Banque Témoin", past_companies: "Fintech Démo", role: "COO", strength: 3, tags: "finance" },
    { ...meta("pe-3"), name: "Dominique Test", company_name: "Indépendant", role: "Coach carrière", strength: 3 },
  ]);
  store.load("meetings", [
    { ...meta("m-1"), person_id: "pe-2", status: "planned", planned_at: iso(1, 12), topic: "Déjeuner : retour sur Fintech Démo", offer_id: "o-2" },
    { ...meta("m-2"), person_id: "pe-3", status: "seen", planned_at: iso(-8), topic: "Positionnement", outcome: "Cibler les postes de direction data dans l'industrie" },
  ]);
  store.load("introductions", [
    { ...meta("in-1"), introducer_id: "pe-3", introduced_id: "pe-1", target_company_id: "c-1", status: "done", notes: "Présentation par e-mail" },
  ]);
}
