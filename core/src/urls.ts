// Normalisation des URL d'offres pour dédupliquer : les e-mails d'alerte
// ajoutent des paramètres de suivi différents à chaque envoi.

const TRACKING_PARAMS = /^(utm_|trk|refId|trackingId|lipi|midToken|midSig|eid|otpToken|ref|src|source|from|origin|mc_|gclid|fbclid)/i;

export function offerKey(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  // www.linkedin.com, fr.linkedin.com… → linkedin.com
  const host = url.hostname.toLowerCase().replace(/^(www|[a-z]{2})\./, "");

  // LinkedIn : /jobs/view/<id>, /comm/jobs/view/<id>, ou ?currentJobId=<id>
  if (host.endsWith("linkedin.com")) {
    const m = url.pathname.match(/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
    const id = m?.[1] ?? url.searchParams.get("currentJobId");
    if (id) return `linkedin:${id}`;
  }

  // Welcome to the Jungle : /<lang>/companies/<company>/jobs/<slug>
  if (host.endsWith("welcometothejungle.com")) {
    const m = url.pathname.match(/companies\/([^/]+)\/jobs\/([^/?#]+)/);
    if (m) return `wttj:${m[1]}/${m[2]}`;
  }

  const kept = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k));
  kept.sort(([a], [b]) => a.localeCompare(b));
  const qs = kept.length ? "?" + new URLSearchParams(kept).toString() : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `${host}${path}${qs}`.toLowerCase();
}

/** Clé de secours quand l'offre n'a pas d'URL exploitable. */
export function fallbackKey(company: string | null | undefined, title: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `title:${norm(company ?? "")}|${norm(title)}`;
}

export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(sas|sa|sarl|group|groupe|france|inc|ltd|gmbh)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
