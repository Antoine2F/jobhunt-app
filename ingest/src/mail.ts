import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { OfferSource } from "@jobhunt/core";

export interface SenderRule {
  match: string;
  source: OfferSource;
  label: string;
}

export interface AlertMail {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  text: string;
  rule: SenderRule;
}

export function ruleFor(from: string, rules: SenderRule[]): SenderRule | null {
  const f = from.toLowerCase();
  return rules.find((r) => f.includes(r.match.toLowerCase())) ?? null;
}

/**
 * Lit en lecture seule (aucun message marqué lu ni déplacé) les e-mails
 * d'alerte récents dans Gmail via IMAP + mot de passe d'application.
 */
export async function fetchAlertMails(opts: {
  user: string;
  password: string;
  rules: SenderRule[];
  sinceDays: number;
  max: number;
  /** Filtre les messages déjà traités avant de télécharger leur contenu. */
  filterUnseen: (ids: string[]) => Promise<string[]>;
}): Promise<AlertMail[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: opts.user, pass: opts.password },
    logger: false,
  });
  await client.connect();
  const out: AlertMail[] = [];
  try {
    // « Tous les messages » (nom localisé selon la langue du compte) : les alertes
    // archivées ou filtrées par libellé restent visibles.
    const allMail = (await client.list()).find((b) => b.specialUse === "\\All")?.path ?? "INBOX";
    const lock = await client.getMailboxLock(allMail, { readOnly: true });
    try {
      const since = new Date(Date.now() - opts.sinceDays * 86_400_000);
      const uids = new Set<number>();
      for (const rule of opts.rules) {
        const found = await client.search({ since, from: rule.match }, { uid: true });
        for (const uid of found || []) uids.add(uid);
      }
      if (uids.size === 0) return out;

      // 1er passage : enveloppes seulement, pour écarter ce qui est déjà traité.
      const envelopes: { uid: number; messageId: string; from: string }[] = [];
      for await (const msg of client.fetch([...uids], { envelope: true, uid: true }, { uid: true })) {
        const messageId = msg.envelope?.messageId;
        const from = msg.envelope?.from?.[0]?.address ?? "";
        if (messageId) envelopes.push({ uid: msg.uid, messageId, from });
      }
      const unseen = new Set(await opts.filterUnseen(envelopes.map((e) => e.messageId)));
      const todo = envelopes.filter((e) => unseen.has(e.messageId)).slice(-opts.max);

      // 2e passage : contenu complet des nouveaux messages.
      for (const e of todo) {
        const rule = ruleFor(e.from, opts.rules);
        if (!rule) continue;
        const dl = await client.download(String(e.uid), undefined, { uid: true });
        const parsed = await simpleParser(dl.content);
        out.push({
          messageId: e.messageId,
          from: e.from,
          subject: parsed.subject ?? "",
          date: (parsed.date ?? new Date()).toISOString(),
          text: typeof parsed.html === "string" ? parsed.html : (parsed.text ?? ""),
          rule,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
