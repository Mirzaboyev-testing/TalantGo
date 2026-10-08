import { useEffect, useState } from "react";
import { api, courseLabel, type Leaderboard } from "../api";
import { ErrorText, message } from "../ui";

const SCOPES = [
  { id: "university", label: "Universitetim" },
  { id: "track", label: "Yo'nalishim" },
  { id: "all", label: "Hammasi" },
] as const;
type Scope = (typeof SCOPES)[number]["id"];

export default function LeaderboardScreen() {
  const [scope, setScope] = useState<Scope>("university");
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api.leaderboard(scope).then(setData, (e) => setError(message(e)));
  }, [scope]);

  return (
    <div>
      <h1>Reyting</h1>
      <div className="segmented">
        {SCOPES.map((s) => <button key={s.id} className={scope === s.id ? "on" : ""} onClick={() => setScope(s.id)}>{s.label}</button>)}
      </div>
      <ErrorText error={error} />
      {!data && !error && <div className="hint">Yuklanmoqda…</div>}
      {data && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0 }}>Sizning o'rningiz: #{data.my_rank}. Ball faqat tasdiqlangan ishlar va yozilgan baholar uchun beriladi.</p>
          {data.rows.map((r) => (
            <div key={r.id} className={`lb-row ${r.is_me ? "me" : ""}`}>
              <div className={`lb-rank ${r.rank <= 3 ? "top" : ""}`}>{r.rank}</div>
              <div className="grow">{r.full_name}{r.is_me ? " (siz)" : ""}<div className="hint">{[r.university, courseLabel(r.course)].filter(Boolean).join(" · ")}</div></div>
              <b>{r.points}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
