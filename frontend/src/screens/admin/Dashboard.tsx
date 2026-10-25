import { useCallback, useEffect, useState } from "react";
import { api, APPLICATION_STATUS, STATUS_LABEL, type Dashboard as Data } from "../../api";
import { ErrorText, StatusBadge, message } from "../../ui";
import LineChart from "./LineChart";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const when = (s: string) => new Date(s).toLocaleString("uz", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const APP_TILES: [keyof Data["applications"], string, string][] = [
  ["new", "Yangi", "accent-new"],
  ["viewed", "Ko'rib chiqilmoqda", "accent-progress"],
  ["shortlisted", "Saralandi", "accent-progress"],
  ["interview", "Suhbat", "accent-progress"],
  ["offer", "Taklif", "accent-progress"],
  ["hired", "Ishga olindi", "accent-good"],
  ["rejected", "Rad etildi", "accent-bad"],
  ["withdrawn", "Qaytarib olindi", "accent-bad"],
];

export default function Dashboard({ go }: { go: (page: string) => void }) {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api.admin.dashboard(from, to).then(setD, (e) => setError(message(e)));
  }, [from, to]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preset = (days: number) => { setFrom(daysAgo(days - 1)); setTo(iso(new Date())); };

  return (
    <div>
      <div className="panel">
        <div className="filters">
          <div><label>Dan</label><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label>Gacha</label><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn small" onClick={load}>Yangilash</button>
          <button className="btn small ghost" onClick={() => preset(7)}>7 kun</button>
          <button className="btn small ghost" onClick={() => preset(30)}>30 kun</button>
          <button className="btn small ghost" onClick={() => preset(90)}>90 kun</button>
        </div>
        <ErrorText error={error} />
      </div>

      {!d && !error && <div className="hint">Yuklanmoqda…</div>}
      {d && (
        <>
          <div className="kpis">
            <Kpi label="Talabalar" value={d.kpis.students} sub={`+${d.kpis.new_students} shu davrda`} />
            <Kpi label="7 kunda faol" value={d.kpis.active_7d} sub={pct(d.kpis.active_7d, d.kpis.students)} />
            <Kpi label="Talabaligi tasdiqlangan" value={d.kpis.verified_students} sub={pct(d.kpis.verified_students, d.kpis.students)} />
            <Kpi label="Topshirilgan ishlar" value={d.kpis.submissions} sub={`${d.kpis.awaiting_review} ta tekshiruvda`} />
            <Kpi label="Kompaniyalar" value={d.kpis.companies} sub={`${d.kpis.live_jobs} ta faol vakansiya`} />
            <Kpi label="Moderatsiya navbati" value={d.kpis.queue} sub={d.kpis.queue ? "ko'rib chiqing" : "bo'sh"}
                 onClick={d.kpis.queue ? () => go("queue") : undefined} />
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Arizalar holati</h3><button className="btn small ghost" onClick={() => go("applications")}>Barchasi</button></div>
            <div className="kpis" style={{ marginBottom: 0 }}>
              {APP_TILES.map(([key, label, accent]) => (
                <div key={key} className={`kpi ${accent}`}><div className="label">{label}</div><div className="value">{d.applications[key]}</div></div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Faollik, kunlar bo'yicha</h3></div>
            <LineChart dates={d.series.dates} series={[
              { name: "Ro'yxatdan o'tganlar", color: "var(--series-1)", values: d.series.registrations },
              { name: "Topshirilgan ishlar", color: "var(--series-2)", values: d.series.submissions },
              { name: "Arizalar", color: "var(--series-3)", values: d.series.applications },
            ]} />
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head"><h3>Oxirgi arizalar</h3></div>
              {d.recent_applications.length === 0 ? <div className="hint">Shu davrda ariza yo'q</div> : (
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>Nomzod</th><th>Vakansiya</th><th>Kompaniya</th><th>Holat</th><th>Sana</th></tr></thead>
                  <tbody>{d.recent_applications.map((a) => (
                    <tr key={a.id}><td>{a.candidate}</td><td>{a.job}</td><td>{a.company}</td><td>{APPLICATION_STATUS[a.status]}</td><td>{when(a.created_at)}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Oxirgi topshirilgan ishlar</h3><button className="btn small ghost" onClick={() => go("submissions")}>Barchasi</button></div>
              {d.recent_submissions.length === 0 ? <div className="hint">Shu davrda ish topshirilmagan</div> : (
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>Talaba</th><th>Topshiriq</th><th>Holat</th><th>Sana</th></tr></thead>
                  <tbody>{d.recent_submissions.map((s) => (
                    <tr key={s.id}><td>{s.student}</td><td>{s.task}</td><td><StatusBadge status={s.status} /></td><td>{when(s.created_at)}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
              <div className="hint" style={{ marginTop: 8 }}>
                {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => `${STATUS_LABEL[k]}: ${d.submissions_by_status[k] ?? 0}`).join(" · ")}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <Bars title="Yo'nalishlar bo'yicha talabalar" rows={d.per_track.map((t) => [t.title.split(":")[0], t.students])} />
            <Bars title="Universitetlar bo'yicha talabalar" rows={d.per_university.map((u) => [u.name, u.students])} empty="Hali universitet tanlanmagan" />
          </div>
        </>
      )}
    </div>
  );
}

const pct = (n: number, total: number) => (total ? `${Math.round((100 * n) / total)}% talabalardan` : "—");

function Kpi({ label, value, sub, onClick }: { label: string; value: number; sub: string; onClick?: () => void }) {
  return (
    <div className="kpi" style={onClick ? { cursor: "pointer" } : undefined} onClick={onClick}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function Bars({ title, rows, empty = "Ma'lumot yo'q" }: { title: string; rows: [string, number][]; empty?: string }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div className="panel">
      <div className="panel-head"><h3>{title}</h3></div>
      {rows.length === 0 && <div className="hint">{empty}</div>}
      {rows.map(([label, n]) => (
        <div key={label} className="hbar" title={`${label}: ${n}`}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <div className="track"><div className="fill" style={{ width: `${(100 * n) / max}%` }} /></div>
          <span className="n">{n}</span>
        </div>
      ))}
    </div>
  );
}
