import { readFileSync } from "node:fs";
import { knowledgeFromEnv, loadProfileText, type IngestPayload } from "@jobhunt/core";
import { extractAndScore, htmlToText } from "@jobhunt/core/llm";
import { fetchAlertMails, type SenderRule } from "./mail.js";

// Veille automatique : lit les alertes e-mail, extrait et note les offres
// avec Claude, puis les envoie à l'appli en statut « à valider ».
// Lancé par GitHub Actions (.github/workflows/ingest.yml).

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

const config = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8")) as {
  lookback_days: number;
  max_messages_per_run: number;
  senders: SenderRule[];
};

const APP_URL = need("APP_URL").replace(/\/$/, "");
const INGEST_KEY = need("INGEST_KEY");
const DRY_RUN = process.env.DRY_RUN === "1";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${APP_URL}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-key": INGEST_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const knowledge = knowledgeFromEnv();
const profile = knowledge ? await loadProfileText(knowledge) : "";
if (!profile) console.warn("Profil introuvable : les offres ne seront pas notées.");

const mails = await fetchAlertMails({
  user: need("GMAIL_USER"),
  password: need("GMAIL_APP_PASSWORD"),
  rules: config.senders,
  sinceDays: config.lookback_days,
  max: config.max_messages_per_run,
  filterUnseen: async (ids) => (await post<{ ids: string[] }>("/ingest/unseen", { ids })).ids,
});
console.log(`${mails.length} nouvel(s) e-mail(s) d'alerte`);

let created = 0;
let duplicates = 0;
let failures = 0;
for (const mail of mails) {
  try {
    const text = htmlToText(mail.text).slice(0, 80_000);
    const offers = await extractAndScore(text, profile, { hint: `${mail.rule.label} — « ${mail.subject} »` });
    console.log(`  ${mail.rule.label} « ${mail.subject} » : ${offers.length} offre(s)`);
    if (DRY_RUN) {
      for (const o of offers) console.log(`    - [${o.score ?? "?"}] ${o.title} · ${o.company ?? "?"} ${o.url ?? ""}`);
      continue;
    }
    const payload: IngestPayload = {
      source: mail.rule.source,
      source_detail: mail.rule.label,
      message_id: mail.messageId,
      received_at: mail.date,
      offers,
    };
    const res = await post<{ created: number; duplicates: number }>("/ingest", payload);
    created += res.created;
    duplicates += res.duplicates;
  } catch (e) {
    // Un e-mail en échec n'est pas marqué comme traité : il sera retenté au prochain passage.
    failures++;
    console.error(`  Échec sur « ${mail.subject} » :`, e instanceof Error ? e.message : e);
  }
}

console.log(`Terminé : ${created} nouvelle(s) offre(s), ${duplicates} doublon(s), ${failures} échec(s).`);
if (failures > 0 && failures === mails.length) process.exit(1);
