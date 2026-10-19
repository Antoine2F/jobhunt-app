// Description des tables. Sert à la fois au stockage (mémoire ou SQL),
// à la validation des écritures de l'API et aux types TypeScript.

// Le parcours complet (étapes et sorties) est décrit dans pipeline.ts.
export const OFFER_STATUSES = [
  "proposed", // nouvelle : remontée par la veille, pas encore regardée
  "interesting", // intéressante, décision de postuler pas encore prise
  "validated", // à postuler
  "rejected", // pas intéressante
  "not_applying", // intéressante, mais je ne postule pas
  "applied", // candidature envoyée → un processus existe
  "closed", // terminée (issue dans processes.outcome)
] as const;

export const PROCESS_STAGES = [
  "to_apply", // retenue, candidature pas encore envoyée
  "applied", // postulé, en attente de retour
  "lead", // piste : retour positif, les étapes sont dans interviews
  "won", // offre acceptée
  // Anciennes valeurs, lues comme « piste » (screening… offer) ou comme un arrêt (lost, withdrawn).
  "screening",
  "interviews",
  "case_study",
  "final",
  "offer",
  "lost",
  "withdrawn",
] as const;

/** Comment un processus s'est arrêté : refus (CV refusé, ou piste en échec) ou retrait. */
export const PROCESS_OUTCOMES = ["lost", "withdrawn", "no_answer"] as const;

/** État d'une étape de piste (entretien RH, manager…). */
export const STEP_RESULTS = ["to_plan", "waiting", "positive", "negative"] as const;

export const INTERVIEW_STATUSES = ["to_prepare", "done", "cancelled"] as const;
export const MEETING_STATUSES = ["to_see", "planned", "seen", "cancelled"] as const;
export const INTRO_STATUSES = ["to_ask", "asked", "done", "declined"] as const;
export const OFFER_SOURCES = ["linkedin", "wttj", "cabinet", "manual", "network", "other"] as const;
/** « network » : démarche réseau activée pour cette offre, en parallèle de la candidature. */
export const OFFER_APPROACHES = ["direct", "network"] as const;

/**
 * Secteurs de référence. La colonne reste en texte libre (fiches déjà saisies),
 * mais l'interface et les skills proposent cette liste pour pouvoir filtrer.
 */
export const COMPANY_SECTORS = [
  "Software / SaaS",
  "Data / IA",
  "Cybersécurité",
  "ESN / Conseil IT",
  "Conseil",
  "Fintech / Banque / Assurance",
  "Santé",
  "RH",
  "E-commerce / Retail",
  "Industrie",
  "Énergie / Climat",
  "Mobilité / Transport",
  "Médias / Divertissement",
  "Marketing / Publicité",
  "Éducation",
  "Immobilier",
  "Secteur public",
  "Autre",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];
export type ProcessStage = (typeof PROCESS_STAGES)[number];
export type ProcessOutcome = (typeof PROCESS_OUTCOMES)[number];
export type StepResult = (typeof STEP_RESULTS)[number];
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export type IntroStatus = (typeof INTRO_STATUSES)[number];
export type OfferSource = (typeof OFFER_SOURCES)[number];
export type OfferApproach = (typeof OFFER_APPROACHES)[number];

type ColType = "string" | "text" | "int" | "datetime" | "date";

export interface Column {
  type: ColType;
  required?: boolean;
  enum?: readonly string[];
  /** Taille max pour les colonnes string (NVARCHAR). */
  max?: number;
}

export const TABLES = {
  companies: {
    name: { type: "string", required: true, max: 200 },
    sector: { type: "string", max: 120 },
    size: { type: "string", max: 60 }, // effectif, ex. « 450 salariés »
    website: { type: "string", max: 400 },
    description: { type: "text" }, // ce que fait l'entreprise
    funding: { type: "string", max: 200 }, // stade, dernière levée
    headquarters: { type: "string", max: 200 }, // ville et pays du siège
    dev_offices: { type: "string", max: 400 }, // où sont les équipes produit / tech
    founders_nationality: { type: "string", max: 200 },
    capital_origin: { type: "string", max: 400 }, // qui détient le capital (VC US, fonds français, fondateurs, groupe…)
    knowledge_path: { type: "string", max: 400 },
    notes: { type: "text" },
  },
  offers: {
    company_id: { type: "string", max: 36 },
    title: { type: "string", required: true, max: 300 },
    location: { type: "string", max: 200 },
    remote: { type: "string", max: 120 }, // politique de télétravail
    contract: { type: "string", max: 60 },
    salary: { type: "string", max: 120 },
    source: { type: "string", enum: OFFER_SOURCES, max: 20 },
    source_detail: { type: "string", max: 200 },
    url: { type: "string", max: 1000 },
    url_key: { type: "string", max: 400 },
    description: { type: "text" },
    status: { type: "string", enum: OFFER_STATUSES, required: true, max: 20 },
    approach: { type: "string", enum: OFFER_APPROACHES, max: 20 },
    score: { type: "int" },
    score_reason: { type: "text" },
    decision_note: { type: "text" },
    received_at: { type: "datetime" },
    cover_letter_url: { type: "string", max: 1000 }, // lettre de motivation (Google Drive)
    cv_url: { type: "string", max: 1000 }, // CV adapté (Google Drive)
  },
  processes: {
    offer_id: { type: "string", required: true, max: 36 },
    stage: { type: "string", enum: PROCESS_STAGES, required: true, max: 20 }, // dernière étape atteinte
    outcome: { type: "string", enum: PROCESS_OUTCOMES, max: 20 }, // vide tant que le processus continue
    next_step: { type: "string", max: 300 },
    next_step_date: { type: "date" },
    contact_name: { type: "string", max: 200 },
    notes: { type: "text" },
  },
  // Étapes d'une piste (« Step 1 (HR) »…) : une ligne par étape, nom dans `kind`.
  interviews: {
    process_id: { type: "string", required: true, max: 36 },
    position: { type: "int" }, // ordre dans la piste
    result: { type: "string", enum: STEP_RESULTS, max: 20 },
    scheduled_at: { type: "datetime" },
    kind: { type: "string", max: 80 },
    interviewers: { type: "string", max: 400 },
    status: { type: "string", enum: INTERVIEW_STATUSES, required: true, max: 20 },
    prep_path: { type: "string", max: 400 },
    notes: { type: "text" },
    outcome: { type: "text" },
  },
  people: {
    name: { type: "string", required: true, max: 200 },
    company_id: { type: "string", max: 36 },
    company_name: { type: "string", max: 200 },
    role: { type: "string", max: 200 },
    past_companies: { type: "string", max: 600 },
    linkedin_url: { type: "string", max: 400 },
    email: { type: "string", max: 200 },
    phone: { type: "string", max: 40 },
    strength: { type: "int" }, // 1 = faible, 2 = moyen, 3 = proche
    tags: { type: "string", max: 400 },
    notes: { type: "text" },
  },
  meetings: {
    person_id: { type: "string", required: true, max: 36 },
    status: { type: "string", enum: MEETING_STATUSES, required: true, max: 20 },
    planned_at: { type: "datetime" },
    topic: { type: "string", max: 300 },
    offer_id: { type: "string", max: 36 },
    outcome: { type: "text" },
    next_actions: { type: "text" },
  },
  introductions: {
    introducer_id: { type: "string", required: true, max: 36 },
    introduced_id: { type: "string", required: true, max: 36 },
    target_company_id: { type: "string", max: 36 },
    offer_id: { type: "string", max: 36 },
    status: { type: "string", enum: INTRO_STATUSES, required: true, max: 20 },
    notes: { type: "text" },
  },
  ingested_messages: {
    message_id: { type: "string", required: true, max: 400 },
    source: { type: "string", max: 20 },
    offers_found: { type: "int" },
  },
} as const satisfies Record<string, Record<string, Column>>;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

type TsOf<C> = C extends { enum: readonly (infer E)[] }
  ? E
  : C extends { type: "int" }
    ? number
    : string;

type RowOf<T extends Record<string, Column>> = {
  [K in keyof T as T[K] extends { required: true } ? K : never]: TsOf<T[K]>;
} & {
  [K in keyof T as T[K] extends { required: true } ? never : K]?: TsOf<T[K]> | null;
};

export interface BaseRow {
  id: string;
  created_at: string;
  updated_at: string;
}

export type Row<T extends TableName> = BaseRow & RowOf<(typeof TABLES)[T]>;
export type NewRow<T extends TableName> = RowOf<(typeof TABLES)[T]>;

export type Company = Row<"companies">;
export type Offer = Row<"offers">;
export type Process = Row<"processes">;
export type Interview = Row<"interviews">;
export type Person = Row<"people">;
export type Meeting = Row<"meetings">;
export type Introduction = Row<"introductions">;

export class ValidationError extends Error {}

/** Garde uniquement les colonnes connues et vérifie types, enums et obligatoires. */
export function validate<T extends TableName>(
  table: T,
  input: Record<string, unknown>,
  { partial = false } = {},
): Partial<NewRow<T>> {
  const cols = TABLES[table] as Record<string, Column>;
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(cols)) {
    if (!(key in input)) {
      if (col.required && !partial) throw new ValidationError(`${table}.${key} est obligatoire`);
      continue;
    }
    let v = input[key];
    if (v === "" || v === undefined) v = null;
    if (v === null) {
      if (col.required) throw new ValidationError(`${table}.${key} est obligatoire`);
      out[key] = null;
      continue;
    }
    if (col.type === "int") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) throw new ValidationError(`${table}.${key} doit être un nombre`);
      out[key] = Math.round(n);
      continue;
    }
    if (typeof v !== "string") throw new ValidationError(`${table}.${key} doit être une chaîne`);
    if (col.enum && !col.enum.includes(v)) {
      throw new ValidationError(`${table}.${key} : valeur « ${v} » inconnue`);
    }
    if ((col.type === "datetime" || col.type === "date") && Number.isNaN(Date.parse(v))) {
      throw new ValidationError(`${table}.${key} : date invalide`);
    }
    out[key] = col.max && v.length > col.max ? v.slice(0, col.max) : v;
  }
  return out as Partial<NewRow<T>>;
}
