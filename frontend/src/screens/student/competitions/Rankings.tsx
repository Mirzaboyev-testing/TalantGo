// «Reyting» in Topshiriqlar: students by points (university, track, everyone) and persistent teams by season
// points with a university filter. My row and my teams are highlighted; a team row opens the team.
import { useEffect, useState } from "react";
import { api, type Leaderboard as StudentBoard, type Me, type University } from "../../../api";
import { competitionsApi, type TeamRankRow } from "../../../competitionsApi";
import { t, useLang, type MsgKey } from "../../../i18n";
import { Icon } from "../../../icons";
import { courseText } from "../../../labels";
import { navigate } from "../../../router";
import { Avatar, ErrorText, message } from "../../../ui";
import { FilterChips, Rank, TeamMark, teamLink } from "./kit";
import "./competitions.css";

type Kind = "students" | "teams";
type Scope = "university" | "track" | "all";
let lastKind: Kind = "students";

export default function Rankings({ me }: { me: Me }) {
  useLang();
  const [kind, setKindState] = useState<Kind>(lastKind);
  const setKind = (k: Kind) => { lastKind = k; setKindState(k); };
  return (
    <div className="co-page cm-page">
      <FilterChips label={t("cm.rank.kind")} value={kind} onChange={setKind}
                   items={[["students", <><Icon name="user" size={15} />{t("cm.rank.students")}</>], ["teams", <><Icon name="users" size={15} />{t("cm.rank.teams")}</>]]} />
      {kind === "students" ? <StudentRanking me={me} /> : <TeamRanking />}
    </div>
  );
}

function StudentRanking({ me }: { me: Me }) {
  useLang();
  const scopes: Scope[] = [...(me.university_ref ? ["university" as const] : []), ...(me.track ? ["track" as const] : []), "all"];
  const [scope, setScope] = useState<Scope>(scopes[0]);
  const [data, setData] = useState<StudentBoard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null); setError("");
    api.leaderboard(scope).then(setData, (e) => setError(message(e)));
  }, [scope]);
  const label: Record<Scope, MsgKey> = { university: "s.lb.university", track: "s.lb.track", all: "s.lb.all" };
  return (
    <div className="co-card cm-rank-card">
      <div className="co-card-head wrap">
        <div><b>{t("cm.rank.students_title")}</b><p className="hint" style={{ margin: "2px 0 0" }}>{t("cm.rank.students_hint")}</p></div>
      </div>
      {scopes.length > 1 && (
        <div className="segmented cm-seg">
          {scopes.map((s) => <button key={s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>{t(label[s])}</button>)}
        </div>
      )}
      <ErrorText error={error} />
      {!data && !error && <div className="hint">{t("common.loading")}</div>}
      {data && data.my_rank > 0 && <div className="cm-myrank plain"><Icon name="trend" size={18} /><span>{t("cm.rank.my_place", { rank: data.my_rank })}</span></div>}
      {data && data.rows.length === 0 && <p className="hint">{t("cm.rank.empty")}</p>}
      <div className="cm-rank-list">
        {data?.rows.map((r) => (
          <div key={r.id} className={`cm-rank-row ${r.is_me ? "me" : ""}`}>
            <Rank n={r.rank} />
            <Avatar name={r.full_name} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="ellipsis">{r.full_name}{r.is_me && <span className="cm-you">{t("cm.lb.you")}</span>}</b>
              <small className="ellipsis">{[r.university, courseText(r.course)].filter(Boolean).join(" · ")}</small>
            </div>
            <span className="cm-rank-pts"><b>{r.points}</b><small>{t("home.points")}</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamRanking() {
  useLang();
  const [universities, setUniversities] = useState<University[]>([]);
  const [uni, setUni] = useState<number | null>(null);
  const [rows, setRows] = useState<TeamRankRow[] | null>(null);
  const [mine, setMine] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  useEffect(() => {
    api.universities().then(setUniversities, () => {});
    competitionsApi.myTeams().then((list) => setMine(new Set(list.map((x) => x.id))), () => {});
  }, []);
  useEffect(() => {
    setRows(null); setError("");
    competitionsApi.teamRanking(uni).then(setRows, (e) => setError(message(e)));
  }, [uni]);

  return (
    <div className="co-card cm-rank-card">
      <div className="co-card-head cm-rank-head">
        <div><b>{t("cm.rank.teams_title")}</b><p className="hint" style={{ margin: "2px 0 0" }}>{t("cm.rank.teams_hint")}</p></div>
        <select aria-label={t("cm.rank.university")} value={uni ?? ""} onChange={(e) => setUni(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t("cm.rank.all_universities")}</option>
          {universities.map((u) => <option key={u.id} value={u.id}>{u.short_name || u.name}</option>)}
        </select>
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows && rows.length === 0 && (
        <div className="st-empty compact"><Icon name="users" size={24} /><b>{t("cm.rank.teams_empty")}</b><span className="hint">{t("cm.rank.teams_empty_hint")}</span></div>
      )}
      {rows && rows.length > 0 && (
        <div className="cm-rank-list">
          <div className="cm-rank-row team cm-rank-th" aria-hidden="true">
            <span>#</span><span /><span>{t("cm.lb.col.team")}</span>
            <span>{t("cm.rank.col.points")}</span><span>{t("cm.rank.col.wins")}</span><span>{t("cm.rank.col.competitions")}</span>
          </div>
          {rows.map((r) => (
            <button key={r.team_id} type="button" className={`cm-rank-row team ${mine.has(r.team_id) ? "me" : ""}`} onClick={() => navigate(teamLink(r.team_id))}>
              <Rank n={r.rank} />
              <TeamMark name={r.name} />
              <span className="grow cm-rank-name" style={{ minWidth: 0 }}>
                <b className="ellipsis">{r.name}{mine.has(r.team_id) && <span className="cm-you">{t("cm.rank.my_team")}</span>}</b>
                <small className="ellipsis">{t("cm.rank.members_n", { n: r.members_n })}{r.universities.length > 0 ? ` · ${r.universities.join(", ")}` : ""}</small>
              </span>
              <span className="cm-rank-pts"><b>{r.points}</b><small>{t("cm.rank.col.points")}</small></span>
              <span className="cm-rank-num"><b>{r.wins}</b><small>{t("cm.rank.col.wins")}</small></span>
              <span className="cm-rank-num"><b>{r.competitions_n}</b><small>{t("cm.rank.col.competitions")}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
