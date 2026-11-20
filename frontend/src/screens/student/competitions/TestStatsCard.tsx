// Where a graded test result stands among everyone who took the test (anonymous: no names). Shown under the
// result in StudentTests; draws nothing until the attempt is graded (the server answers 404 until then).
import { useEffect, useState } from "react";
import { competitionsApi, type TestStats } from "../../../competitionsApi";
import { t, useLang } from "../../../i18n";
import { Icon } from "../../../icons";
import { topPercent } from "./kit";
import "./competitions.css";

export default function TestStatsCard({ testId }: { testId: number }) {
  useLang();
  const [s, setS] = useState<TestStats | null>(null);
  useEffect(() => {
    let live = true;
    competitionsApi.testStats(testId).then((r) => { if (live) setS(r); }, () => { if (live) setS(null); });
    return () => { live = false; };
  }, [testId]);
  if (!s || s.of < 1) return null;

  const pct = Math.round(s.percent);
  const dist = s.distribution.length === 10 ? s.distribution : Array.from({ length: 10 }, (_, i) => s.distribution[i] ?? 0);
  const mine = Math.max(0, Math.min(9, Math.floor(s.percent / 10)));
  const peak = Math.max(1, ...dist);
  const bucket = (i: number) => (i === 9 ? "90–100%" : `${i * 10}–${i * 10 + 10}%`);
  return (
    <div className="card cm-stats">
      <div className="cm-stats-head">
        <div className="cm-stats-big">
          <b>{pct}%</b>
          <span>{t("cm.ts.score", { score: s.my_score, max: s.max_score })}</span>
        </div>
        <div className="cm-stats-facts">
          <div><Icon name="trend" size={16} /><b>{t("cm.ts.rank", { rank: s.rank, of: s.of })}</b></div>
          <div><Icon name="award" size={16} /><span>{t("cm.ts.top", { p: s.percentile || topPercent(s.rank, s.of) })}</span></div>
          <div><Icon name="chart" size={16} /><span>{t("cm.ts.average", { p: Math.round(s.average_percent) })}</span></div>
          <div><Icon name="star" size={16} /><span>{t("cm.ts.best", { p: Math.round(s.best_percent) })}</span></div>
        </div>
      </div>
      <div className="cm-dist-title">{t("cm.ts.dist")}</div>
      <div className="cm-dist" role="img" aria-label={t("cm.ts.dist_aria", { list: dist.map((n, i) => `${bucket(i)}: ${n}`).join(", ") })}>
        {dist.map((n, i) => (
          <div key={i} className={`cm-dist-col ${i === mine ? "me" : ""}`} title={t("cm.ts.bar", { range: bucket(i), n })}>
            <span className="cm-dist-n">{n > 0 ? n : ""}</span>
            <span className="cm-dist-track"><span className="cm-dist-bar" style={{ height: `${n > 0 ? Math.max(4, (n / peak) * 100) : 0}%` }} /></span>
            <small>{i * 10}</small>
          </div>
        ))}
      </div>
      <p className="hint cm-stats-note"><span className="cm-dist-key" />{t("cm.ts.you_here")} · {t("cm.ts.anonymous")}</p>
    </div>
  );
}
