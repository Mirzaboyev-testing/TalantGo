import { useEffect, useState } from "react";
import { api, type Leaderboard } from "../api";
import { t, useLang } from "../i18n";
import { courseText } from "../labels";
import { ErrorText, message } from "../ui";

const SCOPES = [
  { id: "university", label: "s.lb.university" },
  { id: "track", label: "s.lb.track" },
  { id: "all", label: "s.lb.all" },
] as const;
type Scope = (typeof SCOPES)[number]["id"];

export default function LeaderboardScreen() {
  useLang();
  const [scope, setScope] = useState<Scope>("university");
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api.leaderboard(scope).then(setData, (e) => setError(message(e)));
  }, [scope]);

  return (
    <div>
      <h1>{t("s.community.top")}</h1>
      <div className="segmented">
        {SCOPES.map((s) => <button key={s.id} className={scope === s.id ? "on" : ""} onClick={() => setScope(s.id)}>{t(s.label)}</button>)}
      </div>
      <ErrorText error={error} />
      {!data && !error && <div className="hint">{t("common.loading")}</div>}
      {data && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0 }}>{t("s.lb.my_rank", { rank: data.my_rank })}</p>
          {data.rows.map((r) => (
            <div key={r.id} className={`lb-row ${r.is_me ? "me" : ""}`}>
              <div className={`lb-rank ${r.rank <= 3 ? "top" : ""}`}>{r.rank}</div>
              <div className="grow">{r.full_name}{r.is_me ? t("s.lb.you") : ""}<div className="hint">{[r.university, courseText(r.course)].filter(Boolean).join(" · ")}</div></div>
              <b>{r.points}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
