// Building blocks shared by the company panel screens: page header, stat tiles, a hand-made area chart,
// pill tabs, a file drop box and empty states. Styles are the "co-" classes in styles.css.
import { useRef, useState, type ReactNode } from "react";
import { api, fileSize, type SubmittedFile } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { message } from "../../ui";

export function PageHead({ title, sub, actions, eyebrow }: { title: string; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="co-head">
      <div className="co-head-text">
        {eyebrow && <div className="co-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="co-head-actions">{actions}</div>}
    </div>
  );
}

/** A change against the period before: "+12%" in green, "−5%" in red, nothing when there is no base. */
export function Delta({ now, before }: { now: number; before: number }) {
  useLang();
  if (before === 0 && now === 0) return null;
  if (before === 0) return <span className="co-delta up" title={t("co.dash.vs_prev")}>{t("co.dash.new")}</span>;
  const pct = Math.round((100 * (now - before)) / before);
  if (pct === 0) return <span className="co-delta" title={t("co.dash.vs_prev")}>0%</span>;
  return <span className={`co-delta ${pct > 0 ? "up" : "down"}`} title={t("co.dash.vs_prev")}>{pct > 0 ? "+" : "−"}{Math.abs(pct)}%</span>;
}

export function StatTile({ icon, label, value, sub, delta, spark, onClick, tone }: {
  icon: IconName; label: string; value: ReactNode; sub?: ReactNode; delta?: ReactNode; spark?: number[];
  onClick?: () => void; tone?: "green" | "amber" | "blue" | "violet";
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`co-stat ${tone ?? "green"}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="co-stat-top">
        <span className="co-stat-icon"><Icon name={icon} size={19} /></span>
        {delta}
      </div>
      <div className="co-stat-value">{value}</div>
      <div className="co-stat-label">{label}</div>
      {sub && <div className="co-stat-sub">{sub}</div>}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </Tag>
  );
}

/** A tiny trend line under a stat (no axes: the tile's number is the reading). */
export function Sparkline({ values }: { values: number[] }) {
  const w = 120, h = 28, max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className="co-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} className="co-spark-fill" />
      <path d={line} className="co-spark-line" />
    </svg>
  );
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const n = Math.ceil(v / step);
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
};

/** One series over time: 2px line, a light wash under it, hairline grid, a crosshair with a tooltip. */
export function AreaChart({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<SVGSVGElement>(null);
  const W = 640, H = 220, L = 34, R = 14, T = 14, B = 26;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const x = (i: number) => L + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(points.length / 7));
  const last = points.length - 1;

  function move(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r || points.length === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * last);
    setHover(Math.max(0, Math.min(last, i)));
  }

  return (
    <div className="co-chart">
      <svg ref={box} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
           onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="co-grid-line" />
            <text x={L - 8} y={y(v) + 4} className="co-axis" textAnchor="end">{Math.round(v)}</text>
          </g>
        ))}
        {points.map((p, i) => (i % every === 0 || i === last) && (
          <text key={p.label} x={x(i)} y={H - 6} className="co-axis" textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}>{p.label}</text>
        ))}
        {points.length > 1 && <path d={`${line} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`} className="co-area" />}
        <path d={line} className="co-line" />
        {points.length > 0 && hover === null && (
          <circle cx={x(last)} cy={y(points[last].value)} r={4.5} className="co-dot" />
        )}
        {hover !== null && points[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="co-cross" />
            <circle cx={x(hover)} cy={y(points[hover].value)} r={5} className="co-dot" />
          </g>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div className="co-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{points[hover].value}</b><span>{points[hover].label}</span>
        </div>
      )}
    </div>
  );
}

export function Tabs<K extends string>({ items, value, onChange }: {
  items: [K, string, number?][]; value: K; onChange: (k: K) => void;
}) {
  return (
    <div className="co-tabs" role="tablist">
      {items.map(([k, label, n]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {label}{n !== undefined && <span className="co-tab-n">{n}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="co-empty">
      <div className="co-empty-art"><span><Icon name={icon} size={30} /></span></div>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Uploads one file right away (PDF or image) and keeps its id; the form sends only the id. */
export function FileDrop({ id, label, hint, accept, file, onFile, invalid, required }: {
  id: string; label: string; hint: string; accept: string; file: SubmittedFile | null;
  onFile: (f: SubmittedFile | null) => void; invalid?: boolean; required?: boolean;
}) {
  useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); setError("");
    try { onFile(await api.upload(f)); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return (
    <div id={id} tabIndex={-1} className={`co-file ${invalid ? "invalid" : ""} ${file ? "has" : ""}`}>
      <div className="co-file-label">{label}{required && <span className="req">*</span>}</div>
      {file ? (
        <div className="co-file-row">
          <span className="co-file-ext">{(file.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="ellipsis" style={{ fontWeight: 600 }}>{file.name}</div>
            <div className="hint">{fileSize(file.size)} · {t("co.file.uploaded")}</div>
          </div>
          <button type="button" className="icon-btn" aria-label={t("co.file.remove")} onClick={() => onFile(null)}><Icon name="close" size={16} /></button>
        </div>
      ) : (
        <label className="co-drop">
          <input type="file" accept={accept} disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="co-drop-icon"><Icon name="upload" size={20} /></span>
          <span><b>{busy ? t("co.file.uploading") : t("co.file.choose")}</b><span className="hint">{hint}</span></span>
        </label>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

/** The company's logo, or its first letter on a soft tile. */
export function CompanyMark({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  return url
    ? <img className="co-mark" src={url} alt="" style={{ width: size, height: size }} />
    : <span className="co-mark" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}

/** Days until a date (Tashkent calendar): negative once it has passed. */
export function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso.length <= 10 ? `${iso}T23:59:59+05:00` : iso).getTime();
  return Math.ceil((end - Date.now()) / 86_400_000);
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
