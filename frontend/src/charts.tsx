// Small hand-made charts (no chart library). Colours are the validated categorical order from the
// dataviz palette (blue, orange, aqua, yellow, magenta) plus a neutral grey for "no data";
// three of them sit below 3:1 contrast, so every segment also has a visible label row with its number.
import { useState } from "react";

export interface Part { key: string; label: string; value: number }

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const NEUTRAL = "#cfd4cf";

/** A 100% stacked bar for part-to-whole, with a legend that doubles as the table (count and share). */
export function StackedShare({ parts, neutralKey, total }: { parts: Part[]; neutralKey?: string; total?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const sum = total ?? parts.reduce((n, p) => n + p.value, 0);
  let slot = 0;
  const colored = parts.map((p) => ({ ...p, color: p.key === neutralKey ? NEUTRAL : COLORS[slot++ % COLORS.length] }));
  const pct = (v: number) => (sum ? Math.round((100 * v) / sum) : 0);
  const shown = colored.filter((p) => p.value > 0);

  return (
    <div className="share-chart">
      <div className="share-bar" role="img" aria-label={colored.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {sum === 0 && <span className="share-empty" />}
        {shown.map((p) => (
          <span key={p.key} className={`share-seg ${hover && hover !== p.key ? "dim" : ""}`}
                style={{ flexGrow: p.value, background: p.color }}
                onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
            {hover === p.key && <span className="share-tip">{p.label}: {p.value} ({pct(p.value)}%)</span>}
          </span>
        ))}
      </div>
      <table className="share-legend">
        <tbody>
          {colored.map((p) => (
            <tr key={p.key} className={hover === p.key ? "on" : ""} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
              <td><span className="swatch" style={{ background: p.color }} />{p.label}</td>
              <td className="num">{p.value}</td>
              <td className="num hint">{pct(p.value)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled single-hue bar list (counts per name), largest first. */
export function BarList({ rows }: { rows: { name: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.name} className="bar-list-row">
          <span className="ellipsis">{r.name}</span>
          <span className="bar-list-track"><span style={{ width: `${Math.round((100 * r.count) / max)}%` }} /></span>
          <span className="num">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
