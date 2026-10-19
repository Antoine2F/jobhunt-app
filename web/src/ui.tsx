import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  briefcase: "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h18",
  calendar: "M8 3v4M16 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.87M16 4.13a3.5 3.5 0 0 1 0 6.75",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Score({ value }: { value?: number | null }) {
  if (value === null || value === undefined) return null;
  const cls = value >= 75 ? "ok" : value >= 50 ? "warn" : "danger";
  return (
    <span className={`chip score ${cls}`} title="Adéquation avec ton profil">
      {value}
    </span>
  );
}

export function Loading({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <p className="error">{error}</p>;
  if (loading) return <p className="muted">Chargement…</p>;
  return null;
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/** Lit un <form> en objet ; les champs vides deviennent null. */
export function formData(e: React.FormEvent<HTMLFormElement>): Record<string, string | null> {
  e.preventDefault();
  const out: Record<string, string | null> = {};
  new FormData(e.currentTarget).forEach((v, k) => {
    out[k] = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  });
  return out;
}

export function Select({
  name,
  options,
  defaultValue,
  label,
  onChange,
}: {
  name: string;
  options: Record<string, string>;
  defaultValue?: string | null;
  label: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={defaultValue ?? undefined} onChange={(e) => onChange?.(e.target.value)}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Ton d'un point de fit : « + » positif, « ~ » moyen, « - » négatif, « • » simple information. */
function tone(line: string): { cls: string; text: string } {
  const m = line.match(/^\s*([+~\-–−•=])\s*(.*)$/);
  if (!m) return { cls: "", text: line.trim() };
  const cls = m[1] === "+" ? "fit-plus" : m[1] === "~" ? "fit-mid" : m[1] === "•" || m[1] === "=" ? "fit-info" : "fit-minus";
  return { cls, text: m[2] };
}

/** Un point par ligne ; les anciens résumés sur une ligne se coupent aussi aux « ; ». */
function lines(text?: string | null, oneLine = /\n|(?:\s+[;|]\s+)/) {
  return (text ?? "")
    .split(oneLine)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(tone);
}

/** « Critère : explication » : le critère en gras. */
function Point({ text }: { text: string }) {
  const i = text.indexOf(" : ");
  if (i < 1 || i > 40) return <>{text}</>;
  return (
    <>
      <b>{text.slice(0, i)}</b>
      {text.slice(i)}
    </>
  );
}

/** Détail de la note, critère par critère (fiche de l'offre). */
export function FitDetails({ details }: { details?: string | null }) {
  const items = lines(details, /\n/);
  if (!items.length) return null;
  return (
    <ul className="fit-details">
      {items.map((l, i) => (
        <li key={i} className={l.cls}>
          <Point text={l.text} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Note et résumé du fit côte à côte. Le résumé est écrit par la veille, un point
 * par ligne : « + Head of Product en scale-up », « ~ Télétravail non précisé »,
 * « - 70 k€ fixe, sous le minimum ». Un ancien résumé sans signe reste neutre.
 */
export function Fit({ score, reason }: { score?: number | null; reason?: string | null }) {
  if ((score === null || score === undefined) && !reason) return null;
  const items = lines(reason);
  return (
    <div className="fit">
      <Score value={score} />
      {items.length > 0 && (
        <ul>
          {items.map((l, i) => (
            <li key={i} className={l.cls}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
