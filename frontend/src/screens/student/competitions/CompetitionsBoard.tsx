// «Musobaqalar» in Topshiriqlar (docs/13-musobaqalar.md): open, my and finished competitions as cards; ?id=<id>
// opens one (the notifications and the home card link there), so the browser's Back returns to the list.
import { useCallback, useEffect, useState } from "react";
import { competitionsApi, type Competition } from "../../../competitionsApi";
import { t, useLang, type MsgKey } from "../../../i18n";
import { Icon } from "../../../icons";
import { navigate, useSearch } from "../../../router";
import { ErrorText, message } from "../../../ui";
import CompetitionDetail from "./CompetitionDetail";
import { COMP_PATH, EntryBadge, FilterChips, ModeBadge, NextDeadline, OrganizerLine, PhaseChip, StageProgress, compLink } from "./kit";
import "./competitions.css";

type Scope = "open" | "mine" | "finished";
const SCOPES: Scope[] = ["open", "mine", "finished"];
// the chosen filter survives opening a competition and coming back
let lastScope: Scope = "open";

export default function CompetitionsBoard() {
  useLang();
  const search = useSearch();
  const id = search.id ? Number(search.id) || null : null;
  if (id) return <CompetitionDetail key={id} id={id} onBack={() => navigate(COMP_PATH)} />;
  return <CompetitionList />;
}

function CompetitionList() {
  useLang();
  const [scope, setScopeState] = useState<Scope>(lastScope);
  const [rows, setRows] = useState<Partial<Record<Scope, Competition[]>>>({});
  const [error, setError] = useState("");
  const setScope = (s: Scope) => { lastScope = s; setScopeState(s); };
  const load = useCallback((s: Scope) => {
    setError("");
    competitionsApi.list(s).then((list) => setRows((cur) => ({ ...cur, [s]: list })), (e) => setError(message(e)));
  }, []);
  useEffect(() => { load(scope); }, [scope, load]);

  const list = rows[scope];
  return (
    <div className="co-page cm-page">
      <p className="hint cm-intro">{t("cm.list.intro")}</p>
      <FilterChips label={t("cm.list.filter")} value={scope} onChange={setScope}
                   items={SCOPES.map((s) => [s, t(`cm.scope.${s}` as MsgKey), rows[s]?.length])} />
      <ErrorText error={error} />
      {!list && !error && <div className="st-skeleton-grid"><span /><span /><span /></div>}
      {list && list.length === 0 && (
        <div className="st-empty">
          <Icon name="trophy" size={28} />
          <b>{t(`cm.empty.${scope}` as MsgKey)}</b>
          <span className="hint">{t(`cm.empty.${scope}_hint` as MsgKey)}</span>
          {scope !== "open" && <button className="btn small ghost" onClick={() => setScope("open")}>{t("cm.scope.open")}</button>}
        </div>
      )}
      {list && list.length > 0 && (
        <div className="st-card-grid">
          {list.map((c) => <CompetitionCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}

function CompetitionCard({ c }: { c: Competition }) {
  useLang();
  const e = c.my_entry;
  return (
    <button type="button" className={`st-task-card cm-card ${e && e.status !== "withdrawn" ? "mine" : ""}`} onClick={() => navigate(compLink(c.id))}>
      <div className="row between" style={{ gap: 8 }}>
        <OrganizerLine o={c.organizer} size={26} />
        <PhaseChip phase={c.phase} />
      </div>
      <b>{c.title}</b>
      {c.description && <p className="co-clamp cm-clamp2">{c.description}</p>}
      <div className="st-task-meta">
        <ModeBadge c={c} />
        <StageProgress c={c} />
        {c.prize && <span className="co-pill warn"><Icon name="trophy" size={13} />{c.prize}</span>}
      </div>
      <div className="cm-card-foot">
        <NextDeadline c={c} />
        <span className="hint cm-card-n"><Icon name="users" size={13} />{t("cm.entries_n", { n: c.entries_n })}</span>
      </div>
      {e ? (
        <div className="cm-card-mine">
          <EntryBadge e={e} />
          {e.team && <span className="hint ellipsis"><Icon name="users" size={13} /> {e.team.name}</span>}
          {e.rank != null && e.status !== "withdrawn" && <span className="hint">{t("cm.my.rank", { n: e.rank })}</span>}
        </div>
      ) : c.can_register ? (
        <div className="cm-card-mine"><span className="cm-entry open">{t("cm.my.can_join")}</span></div>
      ) : null}
    </button>
  );
}
