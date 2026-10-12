import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import type { IncomingOffer } from "./ingest.js";

// Extraction + notation en un seul appel. Haiku suffit pour ce travail
// (quelques centimes par mois) ; modifiable via CLAUDE_MODEL.
export const DEFAULT_MODEL = "claude-haiku-5-5";

const OfferSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  contract: z.string().nullable(),
  salary: z.string().nullable(),
  url: z.string().nullable(),
  description: z.string().nullable(),
  score: z.number().int().nullable(),
  score_reason: z.string().nullable(),
});

const ExtractionSchema = z.object({ offers: z.array(OfferSchema) });

const SYSTEM = `Tu aides une personne en recherche d'emploi à trier des offres.

On te donne un contenu brut (e-mail d'alerte LinkedIn, Welcome to the Jungle, cabinet de recrutement, ou page d'offre) et, si disponible, le profil de la personne (préférences, compétences, CV).

1. Extrais chaque offre d'emploi distincte présente dans le contenu. Ignore les publicités, les articles et les liens de navigation. Ne fabrique aucune offre : si le contenu n'en contient pas, renvoie une liste vide.
2. Pour l'URL, garde le lien direct vers l'offre tel qu'il apparaît (tu peux retirer les paramètres de suivi). null si absent.
3. description : 2 à 3 phrases factuelles en français sur le poste, d'après le contenu uniquement.
4. score : adéquation de 0 à 100 avec le profil. Pénalise fortement ce qui figure dans « ce que je ne cherche pas » ou « je n'aime pas ». null si aucun profil n'est fourni.
5. score_reason : une ligne en français qui justifie le score (points forts, points bloquants).

Les champs inconnus valent null.`;

export interface LlmOptions {
  apiKey?: string;
  model?: string;
}

export function claudeClient(opts: LlmOptions = {}) {
  return new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
}

export class RefusalError extends Error {}

export async function extractAndScore(
  content: string,
  profile: string,
  opts: LlmOptions & { hint?: string } = {},
): Promise<IncomingOffer[]> {
  const client = claudeClient(opts);
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: SYSTEM }];
  if (profile.trim()) {
    // Le profil change rarement : on le met en cache entre les e-mails d'une même exécution.
    system.push({
      type: "text",
      text: `Profil de la personne :\n\n${profile}`,
      cache_control: { type: "ephemeral" },
    });
  }
  const response = await client.messages.parse({
    model: opts.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
    max_tokens: 16000,
    system,
    output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
    messages: [
      {
        role: "user",
        content: `${opts.hint ? `Contexte : ${opts.hint}\n\n` : ""}<contenu>\n${content}\n</contenu>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new RefusalError("Claude a refusé d'analyser ce contenu");
  if (response.stop_reason === "max_tokens") throw new Error("Réponse tronquée (max_tokens)");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Réponse de Claude illisible");
  return parsed.offers.map((o) => ({
    ...o,
    score: o.score === null ? null : Math.max(0, Math.min(100, o.score)),
  }));
}

/** Transforme un e-mail HTML en texte lisible en gardant les URL des liens. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => ` ${label} [${href}] `)
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
