export const OFFER_STATUS: Record<string, string> = {
  proposed: "À valider",
  validated: "Validée",
  rejected: "Rejetée",
  applied: "Candidature",
  closed: "Close",
};

export const APPROACH: Record<string, string> = {
  network: "Réseau d'abord",
  direct: "Candidature directe",
};

export const STAGE: Record<string, string> = {
  applied: "Candidature envoyée",
  screening: "Préqualification",
  interviews: "Entretiens",
  case_study: "Cas pratique",
  final: "Dernier tour",
  offer: "Offre reçue",
  won: "Acceptée",
  lost: "Refus",
  withdrawn: "Désistement",
};

export const INTERVIEW_STATUS: Record<string, string> = {
  to_prepare: "À préparer",
  done: "Fait",
  cancelled: "Annulé",
};

export const MEETING_STATUS: Record<string, string> = {
  to_see: "À voir",
  planned: "Planifiée",
  seen: "Vue",
  cancelled: "Annulée",
};

export const INTRO_STATUS: Record<string, string> = {
  to_ask: "À demander",
  asked: "Demandée",
  done: "Faite",
  declined: "Refusée",
};

export const SOURCE: Record<string, string> = {
  linkedin: "LinkedIn",
  wttj: "Welcome to the Jungle",
  cabinet: "Cabinet",
  manual: "Ajout manuel",
  network: "Réseau",
  other: "Autre",
};

/** « Logiciel · 450 salariés · Série C » : ce qu'il faut savoir d'une entreprise en un coup d'œil. */
export function companyFacts(c?: { sector?: string | null; size?: string | null; funding?: string | null } | null) {
  return [c?.sector, c?.size, c?.funding].filter(Boolean).join(" · ");
}

export const STRENGTH: Record<string, string> = { "1": "Lien faible", "2": "Lien moyen", "3": "Proche" };

const dtf = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const dtfTime = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function fmtDate(iso?: string | null, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Une date seule (AAAA-MM-JJ) n'a pas d'heure significative.
  return (withTime && iso.length > 10 ? dtfTime : dtf).format(d);
}

export function relDays(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  if (n === -1) return "hier";
  return n > 0 ? `dans ${n} j` : `il y a ${-n} j`;
}

/** Valeur pour <input type="datetime-local"> à partir d'un ISO. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}
