// The live leaderboard of one competition: my place card, then every entry with its name (or team and members),
// score bar, stage reached and status. A table on a computer, cards on a phone; refreshed every 30 seconds.
import { useCallback, useEffect, useState } from "react";
import { competitionsApi, type Competition, type Leaderboard, type LeaderRow } from "../../../competitionsApi";
import { t, useLang } from "../../../i18n";
import { Icon } from "../../../icons";
import { navigate } from "../../../router";
import { everyVisible } from "../../../poll";
import { Avatar, ErrorText, message } from "../../../ui";
import { FilterChips, Rank, StatusText, TeamMark, num, sortedStages, teamLink, topPercent } from "./kit";

export default function CompetitionLeaderboard({ c }: { c: Competition }) {
  useLang();
  const stages = sortedStages(c);
  const [stageId, setStageId] = useState<number | null>(null);
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => competitionsApi.leaderboard(c.id, stageId)
    .then((d) => { setData(d); setError(""); }, (e) => setError(message(e))), [c.id, stageId]);
  useEffect(() => {
    setData(null);
    void load();
    return everyVisible(() => void load(), 30_000);
  }, [load]);

  const team = c.mode === "team";
  const multi = stages.length > 1;
  return (
    <div className="cm-board">
      {multi && (
        <FilterChips label={t("cm.lb.stage_pick")} value={stageId ?? 0} onChange={(v) => setStageId(v || null)}
                     items={[[0, t("cm.lb.overall")], ...stages.map((s, i) => [s.id, `${i + 1}. ${s.title}`] as [number, string])]} />
      )}
      <ErrorText error={error} />
      {!data && !error && <div className="st-skeleton-grid"><span /></div>}
      {data && <MyPlace data={data} team={team} />}
      {data && data.rows.length === 0 && (
        <div className="st-empty"><Icon name="chart" size={26} /><b>{t("cm.lb.empty")}</b><span className="hint">{t("cm.lb.empty_hint")}</span></div>
      )}
      {data && data.rows.length > 0 && (
        <div className={`cm-lb ${multi ? "with-stage" : ""}`} role="table" aria-label={t("cm.tab.board")}>
          <div className="cm-lb-row cm-lb-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">{team ? t("cm.lb.col.team") : t("cm.lb.col.name")}</span>
            <span role="columnheader">{t("cm.lb.col.score")}</span>
            {multi && <span role="columnheader">{t("cm.lb.col.stage")}</span>}
            <span role="columnheader">{t("cm.lb.col.status")}</span>
          </div>
          {data.rows.map((r) => <Row key={r.entry_id} r={r} multi={multi} />)}
        </div>
      )}
      {data && <p className="hint cm-lb-note">{c.phase === "finished" ? t("cm.lb.final") : t("cm.lb.live")}</p>}
    </div>
  );
}

function MyPlace({ data, team }: { data: Leaderboard; team: boolean }) {
  useLang();
  const avg = data.average_percent != null ? Math.round(data.average_percent) : null;
  if (data.my_rank == null) {
    return (
      <div className="cm-myrank plain">
        <Icon name="users" size={18} />
        <span>{t("cm.lb.total", { n: data.total })}{avg != null ? ` · ${t("cm.lb.average", { p: avg })}` : ""}</span>
      </div>
    );
  }
  return (
    <div className="cm-myrank">
      <span className="cm-myrank-n">{data.my_rank}<small>{t("cm.lb.place_word")}</small></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{t(team ? "cm.lb.my_team_rank" : "cm.lb.my_rank", { n: data.total, rank: data.my_rank })}</b>
        <span>{t("cm.lb.top", { p: data.my_percentile ?? topPercent(data.my_rank, data.total) })}{avg != null ? ` · ${t("cm.lb.average", { p: avg })}` : ""}</span>
      </div>
    </div>
  );
}

function Row({ r, multi }: { r: LeaderRow; multi: boolean }) {
  useLang();
  const pct = r.percent ?? (r.score != null ? Math.min(100, r.score) : 0);
  const open = r.team_id ? () => navigate(teamLink(r.team_id!)) : undefined;
  const who = (
    <>
      {r.team_id ? <TeamMark name={r.name} /> : <Avatar name={r.name} url={r.photo_url} />}
      <span className="grow" style={{ minWidth: 0 }}>
        <b className="ellipsis">{r.name}{r.is_me && <span className="cm-you">{t("cm.lb.you")}</span>}</b>
        <small className="ellipsis">{r.team_id && r.members.length > 0 ? r.members.join(", ") : r.subtitle}</small>
      </span>
    </>
  );
  return (
    <div className={`cm-lb-row ${r.is_me ? "me" : ""} ${r.status}`} role="row">
      <span className="cm-lb-rank" role="cell"><Rank n={r.place ?? r.rank} /></span>
      {open ? <button type="button" className="cm-lb-who" role="cell" onClick={open}>{who}</button>
        : <span className="cm-lb-who" role="cell">{who}</span>}
      <span className="cm-lb-score" role="cell">
        <span className="cm-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>
        <b>{r.score != null ? num(r.score) : "—"}</b>
      </span>
      {multi && <span className="cm-lb-stage" role="cell">{t("cm.lb.stage_n", { n: r.stage_reached })}</span>}
      <span className="cm-lb-status" role="cell">
        {r.place ? <span className="co-pill warn"><Icon name="trophy" size={12} />{t("cm.place", { n: r.place })}</span>
          : r.status !== "registered" ? <StatusText status={r.status} /> : null}
      </span>
    </div>
  );
}
