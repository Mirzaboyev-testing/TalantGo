// One competition as its organizer sees it: phase and actions on top, a tab per stage with the entries to score
// (a scored entry folds into its result, like the company task entries), closing a stage with who goes on,
// announcing the results after the last one, and the live leaderboard beside it.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Me } from "../../api";
import { competitionsApi, type Competition, type Leaderboard, type OrganizerApi, type OrganizerEntry, type StageOut } from "../../competitionsApi";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { ask, haptic, openLink } from "../../tg";
import { Avatar, ErrorText, message, Sheet, toast } from "../../ui";
import { EmptyState, PageHead, Tabs } from "../employer/kit";
import {
  audienceText, currentStage, modeLabel, phaseLabel, readyForResults, sortedStages, stageDates, stagePhaseLabel, stagesClosed,
  STATUS_BADGE, statusLabel, TeamMark, type OrgKind,
} from "./orgKit";

type EntryFilter = "todo" | "done" | "all";
const STAGE_BADGE = { upcoming: "todo", open: "peer_verified", reviewing: "pending", closed: "mentor_verified" } as const;
const isTodo = (e: OrganizerEntry) => e.submission != null && e.submission.score == null;
const isDone = (e: OrganizerEntry) => e.submission != null && e.submission.score != null;
const isOut = (e: { status: string }) => e.status === "eliminated" || e.status === "withdrawn";

/** A leaderboard line: from the live leaderboard, or (when it cannot be read here) from the entries' totals. */
interface BoardRow { key: number; rank: number; name: string; sub: string; score: number | null; stage: number | null; out: boolean }
const fromBoard = (b: Leaderboard): BoardRow[] => b.rows.map((r) => ({
  key: r.entry_id, rank: r.place ?? r.rank, name: r.name, sub: r.team_id ? r.members.join(", ") : r.subtitle,
  score: r.score, stage: r.stage_reached, out: isOut(r),
}));
const fromEntries = (rows: OrganizerEntry[]): BoardRow[] => [...rows]
  .sort((a, b) => Number(isOut(a)) - Number(isOut(b)) || (b.total_score ?? -1) - (a.total_score ?? -1))
  .map((e, i) => ({
    key: e.entry_id, rank: i + 1, name: e.name, sub: e.team ? e.members.map((m) => m.name).join(", ") : e.members[0]?.subtitle ?? "",
    score: e.total_score, stage: null, out: isOut(e),
  }));

export default function CompetitionDetail({ api, kind, me, c, onBack, onChanged, onEdit, actions }: {
  api: OrganizerApi; kind: OrgKind; me?: Me | null; c: Competition; onBack: () => void;
  onChanged: (c: Competition) => void; onEdit: () => void; actions?: ReactNode;
}) {
  useLang();
  const stages = sortedStages(c);
  const [stageId, setStageId] = useState<number | null>(() => currentStage(c)?.id ?? null);
  const stage: StageOut | undefined = stages.find((s) => s.id === stageId) ?? stages[0];
  const sid = stage?.id ?? null;
  const isLast = Boolean(stage && stages[stages.length - 1]?.id === stage.id);
  const [entries, setEntries] = useState<OrganizerEntry[] | null>(null);
  const [filter, setFilter] = useState<EntryFilter>("all");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [boardOff, setBoardOff] = useState(false);
  const [sheet, setSheet] = useState<null | "close" | "results">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // a new stage tab opens on the entries still to score
  useEffect(() => {
    let live = true;
    setEntries(null);
    if (sid == null) { setEntries([]); return; }
    api.entries(c.id, sid).then((r) => {
      if (!live) return;
      setEntries(r);
      setFilter(r.some(isTodo) ? "todo" : "all");
    }, (e) => { if (live) setError(message(e)); });
    return () => { live = false; };
  }, [api, c.id, sid]);
  const refreshEntries = useCallback(() => {
    if (sid != null) api.entries(c.id, sid).then(setEntries, (e) => setError(message(e)));
  }, [api, c.id, sid]);

  // the leaderboard is the students' live one; an admin session may not read it, then the entries' totals stand in
  const loadBoard = useCallback(() => {
    competitionsApi.leaderboard(c.id).then((b) => { setBoard(b); setBoardOff(false); }, () => setBoardOff(true));
  }, [c.id]);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  function onSaved(row: OrganizerEntry) {
    const before = entries?.find((e) => e.entry_id === row.entry_id);
    setEntries((cur) => cur?.map((e) => (e.entry_id === row.entry_id ? row : e)) ?? cur);
    if (before && isTodo(before) && !isTodo(row)) onChanged({ ...c, to_score: Math.max(0, (c.to_score ?? 1) - 1) });
    loadBoard();
  }

  async function run(fn: () => Promise<Competition>, done: string, confirm?: string) {
    if (confirm && !(await ask(confirm))) return;
    setBusy(true); setError("");
    try {
      onChanged(await fn());
      haptic("success");
      toast(done);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function closeStage(ids?: number[]) {
    if (!stage) return;
    const updated = await api.closeStage(c.id, stage.id, ids);
    onChanged(updated);
    haptic("success");
    toast(t("corg.close.done"));
    setSheet(null);
    refreshEntries();
    loadBoard();
  }

  async function announce() {
    const updated = await api.results(c.id);
    onChanged(updated);
    haptic("success");
    toast(t("corg.res.done"));
    setSheet(null);
    loadBoard();
  }

  const uniName = kind === "university" ? me?.staff_university?.name ?? null : null;
  const canEdit = c.status === "draft" || c.status === "published";
  const live = c.status === "published";
  const stageActive = Boolean(stage && live && (stage.phase === "open" || stage.phase === "reviewing"));
  // the server closes a stage only after its end, and only once the stages before it are closed
  const canClose = Boolean(stage && stageActive && stage.phase === "reviewing"
    && stages.every((s) => s.order >= stage.order || s.phase === "closed"));
  const rows = boardOff ? (entries ? fromEntries(entries) : null) : board ? fromBoard(board) : null;
  const count = (k: EntryFilter) => (entries ?? []).filter((e) => (k === "todo" ? isTodo(e) : k === "done" ? isDone(e) : true)).length;
  const shown = (entries ?? []).filter((e) => (filter === "todo" ? isTodo(e) : filter === "done" ? isDone(e) : true));
  const sub = [kind === "admin" ? c.organizer.name : null, modeLabel(c), audienceText(c, uniName)].filter(Boolean).join(" · ");

  return (
    <div className="co-page corg">
      <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("corg.back")}</button>
      <PageHead
        eyebrow={<>
          <span className={`badge ${STATUS_BADGE[c.status]}`}>{statusLabel(c.status)}</span>
          {live && <span className="corg-phase"><i className={`ph-${c.phase}`} />{phaseLabel(c.phase)}</span>}
          {c.is_hidden && <span className="badge pending"><Icon name="eye" size={12} />{t("corg.hidden")}</span>}
        </>}
        title={c.title} sub={sub}
        actions={<>
          {c.status === "draft" && (
            <button className="btn small" disabled={busy} onClick={() => run(() => api.publish(c.id), t("corg.f.published"), t("corg.d.publish_confirm"))}>
              <Icon name="send" size={16} />{t("corg.f.publish")}
            </button>
          )}
          {readyForResults(c) && (
            <button className="btn small" disabled={busy} onClick={() => setSheet("results")}><Icon name="trophy" size={16} />{t("corg.res.button")}</button>
          )}
          {canEdit && <button className="btn small ghost" disabled={busy} onClick={onEdit}><Icon name="edit" size={16} />{t("corg.d.edit")}</button>}
          {c.status !== "archived" && (
            <button className="btn small ghost" disabled={busy} onClick={() => run(() => api.archive(c.id), t("corg.d.archived"), t("corg.d.archive_confirm"))}>
              {t("corg.d.archive")}
            </button>
          )}
          {actions}
        </>}
      />
      <ErrorText error={error} />

      {c.status === "draft" && (
        <div className="co-card corg-banner draft">
          <Icon name="file" size={20} />
          <div className="grow"><b>{t("corg.d.draft_title")}</b><p>{t("corg.d.draft_text")}</p></div>
        </div>
      )}
      {readyForResults(c) && (
        <div className="co-card corg-banner ready">
          <Icon name="trophy" size={20} />
          <div className="grow"><b>{t("corg.res.ready_title")}</b><p>{t("corg.res.ready_text")}</p></div>
          <button className="btn small" onClick={() => setSheet("results")}>{t("corg.res.button")}</button>
        </div>
      )}
      {c.status === "results" && (
        <div className="co-card corg-banner done">
          <Icon name="award" size={20} />
          <div className="grow"><b>{t("corg.res.announced_title")}</b><p>{t("corg.res.announced_text")}</p></div>
        </div>
      )}

      <div className="co-mini-stats">
        <div><b>{c.entries_n}</b><span>{c.mode === "team" ? t("corg.card.teams") : t("corg.card.entries")}</span></div>
        <div className={c.to_score ? "warn" : ""}><b>{c.to_score ?? 0}</b><span>{t("corg.card.to_score")}</span></div>
        <div><b>{stagesClosed(c)}/{stages.length}</b><span>{t("corg.card.stages_closed")}</span></div>
        <div><b className="corg-mini-date">{formatDateTime(c.registration_ends_at, false)}</b><span>{t("corg.d.registration")}</span></div>
      </div>

      <div className="corg-detail">
        <div className="co-col">
          {stages.length > 1 && (
            <Tabs items={stages.map((s) => [String(s.id), `${s.order}. ${s.title}`] as [string, string])}
                  value={String(sid ?? "")} onChange={(k) => setStageId(Number(k))} />
          )}
          {stage && (
            <div className="co-card corg-stage-card">
              <div className="corg-stage-card-head">
                <span className="corg-stage-n">{stage.order}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="corg-stage-title">{stage.title}</b>
                  <span className="hint corg-stage-when"><Icon name="clock" size={13} />{stageDates(stage)}</span>
                </div>
                <span className={`badge ${STAGE_BADGE[stage.phase]}`}>{stagePhaseLabel(stage.phase)}</span>
              </div>
              {stage.description && <p className="corg-stage-desc">{stage.description}</p>}
              <div className="corg-stage-foot">
                <span className="corg-stage-rule">
                  <Icon name={isLast ? "trophy" : "arrow"} size={15} />
                  {isLast ? t("corg.d.last_stage") : stage.advance_count ? t("corg.advance_n", { n: stage.advance_count }) : t("corg.d.advance_pick")}
                </span>
                {canClose && (
                  <button className="btn small" disabled={!entries} onClick={() => setSheet("close")}><Icon name="lock" size={15} />{t("corg.close.button")}</button>
                )}
              </div>
              {live && stage.phase === "upcoming" && <div className="co-note">{t("corg.d.stage_upcoming", { date: formatDateTime(stage.starts_at) })}</div>}
              {live && stage.phase === "open" && <div className="hint">{t("corg.d.close_after", { date: formatDateTime(stage.ends_at) })}</div>}
              {stage.phase === "closed" && <div className="co-note good"><Icon name="tick" size={14} />{t("corg.d.stage_closed")}</div>}
            </div>
          )}

          {entries && entries.length > 0 && (
            <Tabs items={(["todo", "done", "all"] as const).map((k) => [k, t(`corg.e.filter.${k}`), count(k)] as [EntryFilter, string, number])}
                  value={filter} onChange={setFilter} />
          )}
          {!entries && !error && <div className="corg-entries">{[0, 1].map((i) => <div key={i} className="co-sk-block" style={{ height: 180 }} />)}</div>}
          {entries?.length === 0 && (
            <EmptyState icon="inbox" title={t("corg.e.empty_title")}
                        text={c.status === "draft" ? t("corg.e.empty_draft") : stage?.phase === "upcoming" ? t("corg.e.empty_upcoming") : t("corg.e.empty_text")} />
          )}
          {entries && entries.length > 0 && shown.length === 0 && (
            <div className="co-card co-entries-empty corg-inline-empty">
              <Icon name={filter === "todo" ? "tick" : "inbox"} size={22} />
              <span>{filter === "todo" ? t("corg.e.all_scored") : t("corg.e.nothing")}</span>
            </div>
          )}
          <div className="corg-entries">
            {shown.map((e) => (
              <EntryCard key={`${sid}-${e.entry_id}`} api={api} cid={c.id} stage={stage!} entry={e} canScore={stageActive} onSaved={onSaved} />
            ))}
          </div>
        </div>

        <aside className="co-col corg-aside">
          <BoardCard rows={rows} board={boardOff ? null : board} fallback={boardOff} />
          <AboutCard c={c} kind={kind} uniName={uniName} />
        </aside>
      </div>

      {sheet === "close" && stage && entries && (
        <CloseStageSheet stage={stage} isLast={isLast} entries={entries} onCancel={() => setSheet(null)} onConfirm={closeStage} />
      )}
      {sheet === "results" && <ResultsSheet c={c} rows={rows} onCancel={() => setSheet(null)} onConfirm={announce} />}
    </div>
  );
}

function EntryCard({ api, cid, stage, entry, canScore, onSaved }: {
  api: OrganizerApi; cid: number; stage: StageOut; entry: OrganizerEntry; canScore: boolean; onSaved: (row: OrganizerEntry) => void;
}) {
  useLang();
  const sub = entry.submission;
  const scored = sub?.score != null;
  const [editing, setEditing] = useState(!scored);
  const [score, setScore] = useState(scored ? String(sub!.score) : "");
  const [comment, setComment] = useState(sub?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const n = Number(score);
    if (score === "" || !Number.isInteger(n) || n < 0 || n > 100) { setError(t("corg.e.score_range")); return; }
    setBusy(true); setError("");
    try {
      const row = await api.score(cid, stage.id, { entry_id: entry.entry_id, score: n, comment: comment.trim() });
      haptic("success");
      toast(scored ? t("corg.e.updated") : t("corg.e.scored"));
      setEditing(false);
      onSaved(row);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const team = entry.team;
  const lead = entry.members[0];
  const [label, badge] = entry.status === "eliminated" ? [t("corg.e.st.eliminated"), "rejected"]
    : entry.status === "withdrawn" ? [t("corg.e.st.withdrawn"), "todo"]
    : scored ? [t("corg.e.st.scored"), "peer_verified"] : sub ? [t("corg.e.st.todo"), "pending"] : [t("corg.e.st.no_work"), "todo"];
  const inputId = `corg-score-${stage.id}-${entry.entry_id}`;
  return (
    <div className={`co-card co-entry corg-entry ${scored ? "accepted" : ""} ${isOut(entry) ? "out" : ""}`}>
      <div className="co-entry-head">
        {team ? <TeamMark name={team.name} className="co-avatar" /> : <Avatar name={entry.name} url={lead?.photo_url} className="co-avatar" />}
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis" style={{ display: "block" }}>{entry.name}</b>
          {team ? <span className="hint">{t("corg.e.team_meta", { n: entry.members.length, kind: t(`corg.team_kind.${team.kind}`) })}</span>
            : lead?.subtitle ? <span className="hint ellipsis" style={{ display: "block" }}>{lead.subtitle}</span> : null}
        </div>
        <span className={`badge ${badge}`}>{label}</span>
      </div>
      {team && entry.members.length > 0 && (
        <div className="corg-members">
          {entry.members.map((m) => (
            <span key={m.user_id} className="corg-member" title={m.subtitle || m.name}>
              <Avatar name={m.name} url={m.photo_url} className="corg-member-av" />
              <span className="ellipsis">{m.name}</span>
            </span>
          ))}
        </div>
      )}

      {sub ? (
        <>
          <div className="hint co-entry-when">
            <Icon name="clock" size={13} />{t("corg.e.sent_at", { date: formatDateTime(sub.submitted_at) })}
            {team && sub.submitted_by ? ` · ${sub.submitted_by}` : ""}
          </div>
          {sub.note && <p className="co-entry-note">{sub.note}</p>}
          {(sub.proof_url || sub.files.length > 0) && (
            <div className="co-entry-files">
              {sub.proof_url && <button className="btn small ghost" onClick={() => openLink(sub.proof_url)}><Icon name="link" size={14} />{t("corg.e.open_link")}</button>}
              {sub.files.map((f, i) => (
                <a key={f.id} className="btn small ghost" href={f.url} target="_blank" rel="noreferrer" title={f.name || undefined}>
                  <Icon name="file" size={14} /><span className="ellipsis">{f.name || t("corg.e.file_n", { n: i + 1 })}</span>
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="co-note">{t("corg.e.no_submission")}</div>
      )}

      {sub && (!editing || !canScore) && (
        <div className={`co-entry-result ${scored ? "accepted" : ""}`}>
          <div className="co-entry-facts">
            {scored ? <span><b>{sub.score}</b>/100</span> : <span className="hint">{t("corg.e.not_scored")}</span>}
            {entry.total_score != null && <span className="hint">{t("corg.e.total", { n: entry.total_score })}</span>}
          </div>
          {scored && <p>{sub.comment ? <><b>{t("corg.e.your_comment")}:</b> {sub.comment}</> : <span className="hint">{t("corg.e.no_comment")}</span>}</p>}
          {canScore && <button className="link-btn" onClick={() => setEditing(true)}>{scored ? t("corg.e.change") : t("corg.e.score_now")}</button>}
        </div>
      )}

      {sub && editing && canScore && (
        <div className="corg-score">
          <label htmlFor={inputId}>{t("corg.e.score")}</label>
          <div className="corg-score-row">
            <input id={inputId} value={score} inputMode="numeric" placeholder="0–100" aria-describedby={`${inputId}-max`}
                   onChange={(e) => { setScore(e.target.value.replace(/\D/g, "").slice(0, 3)); setError(""); }}
                   onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
            <span id={`${inputId}-max`} className="hint">/ 100</span>
            <input type="range" min={0} max={100} step={1} value={score === "" ? 0 : Math.min(100, Number(score))} aria-label={t("corg.e.score")}
                   onChange={(e) => { setScore(e.target.value); setError(""); }} />
          </div>
          <label htmlFor={`${inputId}-c`}>{t("corg.e.comment")}</label>
          <textarea id={`${inputId}-c`} value={comment} maxLength={1000} rows={3} placeholder={t("corg.e.comment_ph")}
                    onChange={(e) => setComment(e.target.value)} />
          <ErrorText error={error} />
          <div className="row" style={{ marginTop: 8 }}>
            {scored && <button className="btn ghost" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>{t("common.cancel")}</button>}
            <button className="btn" disabled={busy} onClick={save}><Icon name="tick" size={16} />{t("corg.e.save")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BoardCard({ rows, board, fallback }: { rows: BoardRow[] | null; board: Leaderboard | null; fallback: boolean }) {
  useLang();
  const [all, setAll] = useState(false);
  const list = rows ? (all ? rows : rows.slice(0, 10)) : [];
  return (
    <div className="co-card corg-board">
      <div className="co-card-head">
        <b className="corg-board-title"><Icon name="trophy" size={17} />{t("corg.board.title")}</b>
        {board && <span className="hint">{t("corg.board.total", { n: board.total })}</span>}
      </div>
      {fallback && <p className="hint corg-board-note">{t("corg.board.fallback")}</p>}
      {!rows && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="hint">{t("corg.board.empty")}</div>}
      {list.length > 0 && (
        <ol className="corg-board-list">
          {list.map((r) => (
            <li key={r.key} className={`corg-board-row ${r.out ? "out" : ""}`}>
              <span className={`corg-rank ${r.rank <= 3 && !r.out ? `m${r.rank}` : ""}`}>{r.rank}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="ellipsis">{r.name}</b>
                {r.sub && <small className="ellipsis">{r.sub}</small>}
              </div>
              <div className="corg-board-score">
                <b>{r.score ?? "—"}</b>
                {r.stage != null && <small>{r.out ? t("corg.board.out_at", { n: r.stage }) : t("corg.board.stage_n", { n: r.stage })}</small>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {rows && rows.length > 10 && (
        <button className="link-btn" onClick={() => setAll(!all)}>{all ? t("corg.board.less") : t("corg.board.all", { n: rows.length })}</button>
      )}
      {board?.average_percent != null && <div className="hint">{t("corg.board.avg", { n: Math.round(board.average_percent) })}</div>}
    </div>
  );
}

function AboutCard({ c, kind, uniName }: { c: Competition; kind: OrgKind; uniName: string | null }) {
  useLang();
  const [more, setMore] = useState(false);
  const long = c.description.length > 280 || c.description.split("\n").length > 5;
  return (
    <div className="co-card corg-about">
      <div className="co-card-head"><b>{t("corg.d.about")}</b></div>
      <p className={`corg-desc ${long && !more ? "clamped" : ""}`}>{c.description}</p>
      {long && <button className="link-btn" onClick={() => setMore(!more)}>{more ? t("corg.d.less") : t("corg.d.more")}</button>}
      {c.prize && <div className="co-prize"><Icon name="flame" size={14} />{t("corg.prize", { prize: c.prize })}</div>}
      <dl className="corg-facts">
        <div><dt>{t("corg.d.format")}</dt><dd>{modeLabel(c)}{c.mode === "team" ? ` · ${t(`corg.f.team_kind.${c.team_kind}`)}` : ""}</dd></div>
        <div><dt>{t("corg.d.audience")}</dt><dd>{audienceText(c, uniName)}</dd></div>
        <div><dt>{t("corg.d.registration")}</dt><dd>{formatDateTime(c.registration_ends_at)}</dd></div>
        <div><dt>{t("corg.d.points")}</dt><dd>{c.place_points.length ? c.place_points.join(" / ") : "—"}</dd></div>
        {kind === "admin" && <div><dt>{t("corg.d.organizer")}</dt><dd>{c.organizer.name}</dd></div>}
      </dl>
      <ol className="corg-timeline">
        {sortedStages(c).map((s) => (
          <li key={s.id} className={`tl-${s.phase}`}>
            <span className="corg-stage-n small">{s.order}</span>
            <div className="grow">
              <b>{s.title}</b>
              <small>{stageDates(s)}</small>
              <small>{stagePhaseLabel(s.phase)}{s.advance_count ? ` · ${t("corg.advance_n", { n: s.advance_count })}` : ""}</small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Closing a stage: who goes on (the best `advance_count` by score, or the organizer's ticks) and who leaves. */
function CloseStageSheet({ stage, isLast, entries, onCancel, onConfirm }: {
  stage: StageOut; isLast: boolean; entries: OrganizerEntry[]; onCancel: () => void; onConfirm: (ids?: number[]) => Promise<void>;
}) {
  useLang();
  const ranked = useMemo(() => entries.filter((e) => !isOut(e)).sort((a, b) =>
    (b.submission?.score ?? -1) - (a.submission?.score ?? -1)
    || (a.submission?.submitted_at ?? "~").localeCompare(b.submission?.submitted_at ?? "~")), [entries]);
  const defaults = useMemo(() => {
    if (isLast) return [];
    const scored = ranked.filter((e) => e.submission?.score != null);
    return (stage.advance_count != null ? scored.slice(0, stage.advance_count) : ranked.filter((e) => e.submission)).map((e) => e.entry_id);
  }, [isLast, ranked, stage.advance_count]);
  const [picked, setPicked] = useState<number[]>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unscored = ranked.filter(isTodo).length;
  const changed = picked.length !== defaults.length || picked.some((id) => !defaults.includes(id));

  async function confirm() {
    if (!isLast && ranked.length > 0 && picked.length === 0) { setError(t("corg.close.pick_one")); return; }
    setBusy(true); setError("");
    try {
      await onConfirm(isLast ? undefined : picked);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onCancel}>
      <div className="corg-sheet">
        <div className="corg-sheet-head">
          <h2>{t("corg.close.title", { stage: `${stage.order}. ${stage.title}` })}</h2>
          <button className="icon-btn" aria-label={t("common.close")} onClick={onCancel}><Icon name="close" size={16} /></button>
        </div>
        <p className="hint">{isLast ? t("corg.close.last_text") : stage.advance_count ? t("corg.close.text_n", { n: stage.advance_count }) : t("corg.close.text_pick")}</p>
        {unscored > 0 && <div className="co-note">{t("corg.close.unscored", { n: unscored })}</div>}
        {!isLast && (
          <div className="corg-close-sum">
            <div className="ok"><b>{picked.length}</b><span>{t("corg.close.advance")}</span></div>
            <div className="bad"><b>{ranked.length - picked.length}</b><span>{t("corg.close.out")}</span></div>
          </div>
        )}
        <div className="corg-close-list">
          {ranked.map((e, i) => {
            const on = picked.includes(e.entry_id);
            const body = (
              <>
                <span className="corg-rank">{i + 1}</span>
                <span className="grow ellipsis">{e.name}</span>
                <span className="corg-close-score">{e.submission?.score ?? "—"}</span>
                {!isLast && <span className={`badge ${on ? "peer_verified" : "rejected"}`}>{on ? t("corg.close.goes") : t("corg.close.leaves")}</span>}
              </>
            );
            return isLast ? <div key={e.entry_id} className="pick-row corg-close-row">{body}</div> : (
              <label key={e.entry_id} className={`pick-row corg-close-row ${on ? "on" : ""}`}>
                <input type="checkbox" checked={on}
                       onChange={(ev) => { setError(""); setPicked(ev.target.checked ? [...picked, e.entry_id] : picked.filter((x) => x !== e.entry_id)); }} />
                {body}
              </label>
            );
          })}
          {ranked.length === 0 && <div className="hint" style={{ padding: 10 }}>{t("corg.close.nobody")}</div>}
        </div>
        {!isLast && changed && <button className="link-btn" onClick={() => setPicked(defaults)}>{t("corg.close.reset")}</button>}
        <p className="hint">{t("corg.close.notify")}</p>
        <ErrorText error={error} />
        <div className="corg-sheet-actions">
          <button className="btn ghost" disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
          <button className="btn" disabled={busy} onClick={confirm}><Icon name="lock" size={16} />{t("corg.close.confirm")}</button>
        </div>
      </div>
    </Sheet>
  );
}

/** Announcing the results: places 1–3 get the place points (each team member gets them), the order is final. */
function ResultsSheet({ c, rows, onCancel, onConfirm }: {
  c: Competition; rows: BoardRow[] | null; onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // the leaderboard is already in place order (stage reached, its score, the total), so a 3rd place may have left a stage earlier
  const top = (rows ?? []).slice(0, 3);
  const places = Math.max(3, c.place_points.length);

  async function confirm() {
    setBusy(true); setError("");
    try {
      await onConfirm();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onCancel}>
      <div className="corg-sheet">
        <div className="corg-sheet-head">
          <h2>{t("corg.res.title")}</h2>
          <button className="icon-btn" aria-label={t("common.close")} onClick={onCancel}><Icon name="close" size={16} /></button>
        </div>
        <p className="hint">{t("corg.res.text")}</p>
        <div className="corg-res-list">
          {Array.from({ length: places }, (_, i) => {
            const r = top[i];
            return (
              <div key={i} className={`corg-res-row m${i + 1}`}>
                <span className={`corg-medal m${i + 1}`}>{i + 1}</span>
                <span className="grow ellipsis">{r ? r.name : <span className="hint">{t("corg.res.nobody")}</span>}</span>
                {r?.score != null && <span className="hint">{r.score}</span>}
                <b>+{c.place_points[i] ?? 0}</b>
              </div>
            );
          })}
        </div>
        <p className="hint">{c.mode === "team" ? t("corg.res.team_note") : t("corg.res.ind_note")}</p>
        <div className="co-note">{t("corg.res.final")}</div>
        <ErrorText error={error} />
        <div className="corg-sheet-actions">
          <button className="btn ghost" disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
          <button className="btn" disabled={busy} onClick={confirm}><Icon name="trophy" size={16} />{t("corg.res.confirm")}</button>
        </div>
      </div>
    </Sheet>
  );
}
