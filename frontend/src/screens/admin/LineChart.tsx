import { useEffect, useRef, useState } from "react";

export interface Series { name: string; color: string; values: number[] }

const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= v)! * pow;
  return step * 4;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
};

/** Day-by-day lines with a crosshair tooltip listing every series, plus a table view. */
export default function LineChart({ dates, series }: { dates: string[]; series: Series[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (dates.length <= 1 ? innerW / 2 : (i * innerW) / (dates.length - 1));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 1, 2, 3, 4].map((k) => (max / 4) * k);
  const labelEvery = Math.max(1, Math.ceil(dates.length / Math.max(2, Math.floor(innerW / 70))));
  const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - PAD.left;
    const i = Math.round((px / innerW) * (dates.length - 1));
    setHover(Math.min(dates.length - 1, Math.max(0, i)));
  }

  return (
    <div>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="chart-legend">
          {series.map((s, i) => (
            <span key={s.name}><span className="chart-key" style={{ background: s.color }} />{s.name}: <b>{totals[i]}</b></span>
          ))}
        </div>
        <button className="btn small ghost" onClick={() => setAsTable(!asTable)}>{asTable ? "Grafik" : "Jadval"}</button>
      </div>
      {asTable ? (
        <div className="table-scroll" style={{ maxHeight: 280 }}>
          <table className="data-table">
            <thead><tr><th>Sana</th>{series.map((s) => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
            <tbody>
              {dates.map((d, i) => (
                <tr key={d}><td>{d}</td>{series.map((s) => <td key={s.name} className="num">{s.values[i]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap" ref={box}>
          <svg width={width} height={H} role="img" aria-label={`${series.map((s) => s.name).join(", ")} kunlar bo'yicha`}
               onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: "block", touchAction: "pan-y" }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--hint)">{Math.round(t)}</text>
              </g>
            ))}
            {dates.map((d, i) => (i % labelEvery === 0 || i === dates.length - 1) && (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--hint)">{shortDate(d)}</text>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--hint)" strokeWidth={1} strokeDasharray="3 3" />}
            {series.map((s) => (
              <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                        points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            ))}
            {hover !== null && series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
            ))}
          </svg>
          {hover !== null && (
            <div className="chart-tip" style={{ left: Math.min(x(hover) + 12, width - 170), top: 8 }}>
              <div className="hint" style={{ marginBottom: 4 }}>{dates[hover]}</div>
              {series.map((s) => (
                <div key={s.name} className="row"><span className="chart-key" style={{ background: s.color }} /><strong>{s.values[hover]}</strong><span className="hint">{s.name}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
