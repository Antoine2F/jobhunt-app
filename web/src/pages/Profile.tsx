import { marked } from "marked";
import { Link, useParams } from "react-router-dom";
import type { Concept } from "@jobhunt/core";
import { useApi } from "../api";
import { Loading } from "../ui";

// Navigation dans la base de connaissance (dépôt GitHub au format OKF).
// Lecture seule : l'édition se fait dans Obsidian ou sur GitHub.

const LABELS: Record<string, string> = {
  profil: "Profil (CV, compétences, préférences)",
  stories: "Stories (STAR)",
  entreprises: "Entreprises",
  entretiens: "Préparations et comptes rendus",
  reseau: "Notes réseau",
};

export function ProfilePage() {
  const path = useParams()["*"] ?? "";
  if (path.endsWith(".md")) return <ConceptView path={path} />;
  return <DirView path={path} />;
}

function Breadcrumb({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <p className="small">
      <Link to="/profil">Base de connaissance</Link>
      {parts.map((p, i) => (
        <span key={i}>
          {" / "}
          {i < parts.length - 1 ? <Link to={`/profil/${parts.slice(0, i + 1).join("/")}`}>{p}</Link> : p}
        </span>
      ))}
    </p>
  );
}

function DirView({ path }: { path: string }) {
  const { data, error, loading } = useApi<{ entries: { path: string; type: string }[] }>(`/knowledge?path=${encodeURIComponent(path)}`);
  if (!data) return <Loading error={error} loading={loading} />;
  const entries = data.entries
    .filter((e) => e.type === "dir" || e.path.endsWith(".md"))
    .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "dir" ? -1 : 1));
  return (
    <>
      <h1>{path ? path.split("/").pop() : "Mon profil"}</h1>
      {path && <Breadcrumb path={path} />}
      <div className="grid">
        {entries.map((e) => {
          const name = e.path.split("/").pop()!;
          return (
            <Link key={e.path} to={`/profil/${e.path}`} className="card">
              <h3>{e.type === "dir" ? `📁 ${name}` : name.replace(/\.md$/, "")}</h3>
              {e.type === "dir" && LABELS[name] && <div className="muted small">{LABELS[name]}</div>}
            </Link>
          );
        })}
      </div>
    </>
  );
}

function ConceptView({ path }: { path: string }) {
  const { data, error, loading } = useApi<Concept & { edit_url: string | null }>(`/knowledge?path=${encodeURIComponent(path)}`);
  if (!data) return <Loading error={error} loading={loading} />;
  const { meta } = data;
  // Contenu issu de ton propre dépôt privé ; on désactive tout de même le HTML brut.
  const html = marked.parse(data.body.replace(/</g, "&lt;"), { async: false }) as string;
  return (
    <>
      <Breadcrumb path={path} />
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: 4 }}>{meta.title ?? path.split("/").pop()}</h1>
          {meta.description && <p className="muted" style={{ margin: 0 }}>{meta.description}</p>}
        </div>
        {data.edit_url && (
          <a className="btn" href={data.edit_url} target="_blank" rel="noreferrer noopener">
            Modifier ↗
          </a>
        )}
      </div>
      <div className="row small" style={{ margin: "10px 0" }}>
        {meta.type && <span className="chip">{meta.type}</span>}
        {(meta.tags ?? []).map((t) => (
          <span key={t} className="chip">#{t}</span>
        ))}
      </div>
      <div className="card markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
