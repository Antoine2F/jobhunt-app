import { readdir, readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Accès au dépôt de connaissance (format OKF : Markdown + frontmatter YAML).
 * Deux sources : un dossier local (dev, GitHub Actions après checkout) ou
 * l'API GitHub (appli déployée).
 */
export interface KnowledgeSource {
  read(path: string): Promise<string | null>;
  list(dir: string): Promise<{ path: string; type: "file" | "dir" }[]>;
  /** URL d'édition dans GitHub, pour le bouton « Modifier ». */
  editUrl(path: string): string | null;
}

export interface Concept {
  path: string;
  meta: Record<string, unknown> & { type?: string; title?: string; description?: string; tags?: string[] };
  body: string;
}

export function parseConcept(path: string, md: string): Concept {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { path, meta: {}, body: md };
  let meta: Concept["meta"] = {};
  try {
    meta = (parseYaml(m[1]) as Concept["meta"]) ?? {};
  } catch {
    meta = {};
  }
  return { path, meta, body: m[2] };
}

function safePath(p: string) {
  const n = normalize(p).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
  if (n.startsWith("..")) throw new Error("Chemin invalide");
  return n;
}

export class LocalKnowledge implements KnowledgeSource {
  constructor(private root: string) {}
  async read(path: string) {
    try {
      return await readFile(join(this.root, safePath(path)), "utf8");
    } catch {
      return null;
    }
  }
  async list(dir: string) {
    try {
      const entries = await readdir(join(this.root, safePath(dir)), { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({ path: join(safePath(dir), e.name), type: e.isDirectory() ? ("dir" as const) : ("file" as const) }));
    } catch {
      return [];
    }
  }
  editUrl() {
    return null;
  }
}

export class GitHubKnowledge implements KnowledgeSource {
  constructor(
    private repo: string, // "owner/name"
    private token: string,
    private branch = "main",
  ) {}

  private async call(path: string, accept: string) {
    const res = await fetch(
      `https://api.github.com/repos/${this.repo}/contents/${encodeURI(safePath(path))}?ref=${this.branch}`,
      { headers: { Authorization: `Bearer ${this.token}`, Accept: accept, "User-Agent": "jobhunt-app" } },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${res.status} sur ${path}`);
    return res;
  }

  async read(path: string) {
    const res = await this.call(path, "application/vnd.github.raw+json");
    return res ? await res.text() : null;
  }

  async list(dir: string) {
    const res = await this.call(dir, "application/vnd.github+json");
    if (!res) return [];
    const items = (await res.json()) as { path: string; type: string; name: string }[];
    if (!Array.isArray(items)) return [];
    return items
      .filter((i) => !i.name.startsWith(".") && (i.type === "file" || i.type === "dir"))
      .map((i) => ({ path: i.path, type: i.type as "file" | "dir" }));
  }

  editUrl(path: string) {
    return `https://github.com/${this.repo}/edit/${this.branch}/${safePath(path)}`;
  }
}

export function knowledgeFromEnv(env: NodeJS.ProcessEnv = process.env): KnowledgeSource | null {
  if (env.KNOWLEDGE_DIR) return new LocalKnowledge(env.KNOWLEDGE_DIR);
  if (env.KNOWLEDGE_REPO && env.KNOWLEDGE_TOKEN) {
    return new GitHubKnowledge(env.KNOWLEDGE_REPO, env.KNOWLEDGE_TOKEN, env.KNOWLEDGE_BRANCH || "main");
  }
  return null;
}

/** Fiches qui décrivent ce que tu cherches : elles servent à noter les offres. */
export const PROFILE_FILES = ["profil/preferences.md", "profil/skills.md", "profil/cv.md"];

export async function loadProfileText(src: KnowledgeSource): Promise<string> {
  const parts: string[] = [];
  for (const p of PROFILE_FILES) {
    const md = await src.read(p);
    if (md) parts.push(`<document path="${p}">\n${md.trim()}\n</document>`);
  }
  return parts.join("\n\n");
}
