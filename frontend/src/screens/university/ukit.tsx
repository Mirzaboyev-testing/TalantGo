// Building blocks of the university panel: page header, tabs, KPI tiles, panels, empty states, a drawer,
// a file drop box, pills and a few extra line icons. Styles: uni.css ("u-" classes).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, fileSize, type SubmittedFile } from "../../api";
import { formatDateTime, getLang, t, useLang } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { message, toast } from "../../ui";
import "./uni.css";

// extra icons in the same style as icons.tsx (24px grid, 1.8 stroke)
const EXTRA: Record<string, string> = {
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  megaphone: "M3 10v4h3l7 4V6L6 10H3Z M16 9a3 3 0 0 1 0 6 M18.5 6.5a7 7 0 0 1 0 11",
  download: "M12 4v12 M7 11l5 5 5-5 M4 20h16",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5Z",
  mail: "M4 6h16v12H4z M4 7l8 6 8-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  printer: "M7 9V4h10v5 M5 9h14v8h-3 M8 17H5v-8 M8 14h8v6H8z",
  eye: "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  file: "M6 3h8l4 4v14H6z M14 3v4h4 M9 13h6 M9 17h6",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z",
  shield: "M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3Z M9 12l2 2 4-4",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  refresh: "M20 11a8 8 0 0 0-14.3-4.9L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.3 4.9L20 16 M20 20v-4h-4",
  rocket: "M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2 M9 15l-3-3c1.5-5 6-9 12-9 0 6-4 10.5-9 12Z M14.5 9.5a1.5 1.5 0 1 0 0-.01",
  hourglass: "M7 3h10 M7 21h10 M8 3c0 5 8 5 8 9s-8 4-8 9 M16 3c0 5-8 5-8 9s8 4 8 9",
  key: "M15 9a4 4 0 1 0-3.5 4L4 20.5V22h3v-2h2v-2h2l1.5-1.5A4 4 0 0 0 15 9Z M16 8h.01",
  edit: "M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4",
};
export type UIconName = IconName | keyof typeof EXTRA;

export function UIcon({ name, size = 20, className }: { name: UIconName; size?: number; className?: string }) {
  if (!(name in EXTRA)) return <Icon name={name as IconName} size={size} className={className} />;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={EXTRA[name]} />
    </svg>
  );
}

export type Tone = "green" | "blue" | "amber" | "violet" | "red";

export function PageHead({ title, sub, actions, eyebrow }: { title: string; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="u-head">
      <div>
        {eyebrow && <div className="u-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="u-head-actions">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number; soft?: boolean }[];
}) {
  return (
    <div className="u-tabs" role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} className={value === it.id ? "on" : ""} onClick={() => onChange(it.id)}>
          {it.label}{it.count ? <span className={`u-count ${it.soft ? "soft" : ""}`}>{it.count > 99 ? "99+" : it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ icon, tone = "green", label, value, sub, delta, spark, onClick }: {
  icon: UIconName; tone?: Tone; label: string; value: ReactNode; sub?: ReactNode; delta?: ReactNode; spark?: number[]; onClick?: () => void;
}) {
  const body = (
    <>
      <div className="u-kpi-top"><span className={`u-ic ${tone === "green" ? "" : tone}`}><UIcon name={icon} size={19} /></span>{delta}</div>
      <div className="u-kpi-value">{value}</div>
      <div className="u-kpi-label">{label}</div>
      {sub && <div className="u-kpi-sub">{sub}</div>}
      {spark && spark.length > 1 && <Spark values={spark} />}
    </>
  );
  return onClick ? <button type="button" className="u-kpi" onClick={onClick}>{body}</button> : <div className="u-kpi">{body}</div>;
}

export function Spark({ values }: { values: number[] }) {
  const w = 120, h = 30, max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className="u-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="f" d={`${line} L${w},${h} L0,${h} Z`} /><path className="l" d={line} />
    </svg>
  );
}

export function Panel({ title, icon, action, children, className = "", sub }: {
  title?: ReactNode; icon?: UIconName; action?: ReactNode; children: ReactNode; className?: string; sub?: ReactNode;
}) {
  return (
    <section className={`u-panel ${className}`}>
      {(title || action) && (
        <div className="u-panel-head">
          <h3>{icon && <UIcon name={icon} size={18} />}{title}</h3>
          {action}
        </div>
      )}
      {sub && <p className="u-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Empty({ icon = "inbox", tone = "green", title, text, action, small }: {
  icon?: UIconName; tone?: Tone; title: string; text?: ReactNode; action?: ReactNode; small?: boolean;
}) {
  return (
    <div className={`u-empty ${small ? "sm" : ""}`}>
      <span className={`u-ic ${tone === "green" ? "" : tone}`}><UIcon name={icon} size={26} /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 96 }: { rows?: number; height?: number }) {
  return <div className="u-grid c3">{Array.from({ length: rows }, (_, i) => <div key={i} className="u-skel" style={{ minHeight: height }} />)}</div>;
}

export function Ring({ pct, label, big, blue }: { pct: number; label?: ReactNode; big?: boolean; blue?: boolean }) {
  return <div className={`u-ring ${big ? "big" : ""} ${blue ? "blue" : ""}`} style={{ ["--p" as string]: Math.max(0, Math.min(100, pct)) }}>{label ?? `${pct}%`}</div>;
}

/** Right-side panel on a computer, a bottom sheet on a phone. Escape closes it. */
export function Drawer({ onClose, head, children, foot }: { onClose: () => void; head: ReactNode; children: ReactNode; foot?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="u-drawer-back" onClick={onClose}>
      <aside className="u-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="u-drawer-head">
          <div className="grow" style={{ minWidth: 0 }}>{head}</div>
          <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="u-drawer-body">{children}</div>
        {foot && <div className="u-drawer-foot">{foot}</div>}
      </aside>
    </div>
  );
}

export function Pill({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={`u-pill ${on ? "on" : ""}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="tk">{on && <Icon name="tick" size={11} />}</span>{children}
    </label>
  );
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={`u-toggle ${on ? "on" : ""}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />{children}
    </label>
  );
}

/** A file picker that uploads at once and keeps the uploaded file (id) for the form. */
export function FileDrop({ id, file, onFile, accept = ".pdf,.jpg,.jpeg,.png,.webp", hint, invalid }: {
  id?: string; file: SubmittedFile | null; onFile: (f: SubmittedFile | null) => void; accept?: string; hint?: string; invalid?: boolean;
}) {
  useLang();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast(t("u.file.too_big"), "error"); return; }
    setBusy(true);
    try { onFile(await api.upload(f)); } catch (e) { toast(message(e), "error"); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <label id={id} tabIndex={-1} className={`u-drop ${file ? "has" : ""} ${invalid ? "bad" : ""}`}>
      <input ref={input} type="file" accept={accept} onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
      <span className="u-ic blue"><UIcon name={file ? "file" : "upload"} size={19} /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <b className="ellipsis">{busy ? t("u.file.uploading") : file ? file.name : t("u.file.choose")}</b>
        <span>{file ? fileSize(file.size) : hint ?? t("u.file.hint")}</span>
      </span>
      {file && !busy && (
        <button type="button" className="icon-btn" style={{ position: "relative", zIndex: 1 }} aria-label={t("u.file.remove")}
                onClick={(e) => { e.preventDefault(); onFile(null); }}><Icon name="close" size={16} /></button>
      )}
    </label>
  );
}

export function CopyField({ value }: { value: string }) {
  useLang();
  return (
    <div className="u-copy">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button className="btn small soft" onClick={() => navigator.clipboard?.writeText(value).then(() => toast(t("u.copied")), () => {})}>
        <Icon name="copy" size={16} />{t("u.copy")}
      </button>
    </div>
  );
}

export function UniLogo({ url, name, small }: { url?: string | null; name: string; small?: boolean }) {
  return <span className={`u-logo ${small ? "sm" : ""}`}>{url ? <img src={url} alt="" /> : initials(name)}</span>;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
export const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);

const MONTHS: Record<string, string[]> = {
  uz: ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"],
  ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
/** Day and short month in Tashkent time, for date blocks. */
export function dayMonth(iso: string): [string, string] {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "numeric" }).formatToParts(new Date(iso));
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  return [day, (MONTHS[getLang()] ?? MONTHS.uz)[month - 1]];
}
export const timeOf = (iso: string) => formatDateTime(iso).split(" ")[1] ?? "";

/** "today", "3 days ago", "2 months ago"; "never" when empty. */
export function ago(iso: string | null): string {
  if (!iso) return t("u.ago.never");
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t("u.ago.today");
  if (days === 1) return t("u.ago.yesterday");
  if (days < 30) return t("u.ago.days", { n: days });
  if (days < 365) return t("u.ago.months", { n: Math.floor(days / 30) });
  return t("u.ago.years", { n: Math.floor(days / 365) });
}
