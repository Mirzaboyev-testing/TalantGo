import { useCallback, useEffect, useState } from "react";
import { api, type Challenge, type ChallengeEntry, type CompanyTaskInput, type StudentRow, type Track, type University } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate, useSearch } from "../../router";
import { ask, haptic, openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { daysLeft, EmptyState, initials, PageHead, Tabs } from "./kit";

const STATE_BADGE = { upcoming: "todo", active: "peer_verified", finished: "pending" } as const;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);

type TaskFilter = "all" | "active" | "upcoming" | "finished" | "archived";
const stateOf = (c: Challenge): TaskFilter => (c.is_archived ? "archived" : c.state);

/** How far the task has run, 0–100, from its start to its deadline. */
function elapsedShare(c: Challenge): number {
  const a = new Date(c.starts_at).getTime(), b = new Date(c.ends_at).getTime();
  return b > a ? Math.max(0, Math.min(100, (100 * (Date.now() - a)) / (b - a))) : 100;
}

/** Company tasks: give students a real-world assignment, score the entries, name the winners. */
export default function CompanyTasks() {
  useLang();
  const search = useSearch();
  const preselected = search.talaba ? [Number(search.talaba)].filter(Boolean) : [];
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [mode, setMode] = useState<"list" | "new" | number>(preselected.length || search.yangi ? "new" : "list");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.tasks().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (mode === "new") {
    return <TaskForm preselected={preselected} onDone={(created) => {
      setMode("list"); if (created) void load();
      if (search.talaba || search.yangi) navigate("/korxona/vazifalar", { replace: true });
    }} />;
  }
  if (typeof mode === "number") {
    const task = rows?.find((c) => c.id === mode);
    if (task) return <Entries task={task} onBack={() => { setMode("list"); void load(); }} />;
  }

  const count = (f: TaskFilter) => (rows ?? []).filter((c) => f === "all" || stateOf(c) === f).length;
  const shown = (rows ?? []).filter((c) => filter === "all" || stateOf(c) === filter);
  const toReview = (rows ?? []).reduce((n, c) => n + (c.to_review ?? 0), 0);
  const entries = (rows ?? []).reduce((n, c) => n + c.entries, 0);

  return (
    <div className="co-page">
      <PageHead title={t("nav.company.tasks")} sub={t("co.tasks.sub")}
                actions={<button className="btn" onClick={() => setMode("new")}><Icon name="plus" size={18} />{t("task.new")}</button>} />
      <div className="co-how">
        {(["give", "do", "score"] as const).map((k, i) => (
          <div key={k} className="co-how-step">
            <span className="co-how-n">{i + 1}</span>
            <div><b>{t(`co.tasks.how.${k}`)}</b><p>{t(`co.tasks.how.${k}_hint`)}</p></div>
          </div>
        ))}
        <div className="co-podium" aria-label={t("co.tasks.podium")}>
          <div className="p2"><span>2</span><b>+20</b></div>
          <div className="p1"><span>1</span><b>+30</b></div>
          <div className="p3"><span>3</span><b>+10</b></div>
        </div>
      </div>
      {rows && rows.length > 0 && (
        <div className="co-mini-stats">
          <div><b>{count("active")}</b><span>{t("task.state.active")}</span></div>
          <div><b>{entries}</b><span>{t("co.tasks.entries")}</span></div>
          <div className={toReview ? "warn" : ""}><b>{toReview}</b><span>{t("co.tasks.to_review")}</span></div>
          <div><b>{count("finished")}</b><span>{t("task.state.finished")}</span></div>
        </div>
      )}
      {rows && rows.length > 0 && (
        <Tabs items={(["all", "active", "upcoming", "finished", "archived"] as TaskFilter[]).map((f) =>
          [f, f === "all" ? t("co.all") : f === "archived" ? t("task.archived") : t(`task.state.${f}`), count(f)] as [TaskFilter, string, number])}
              value={filter} onChange={setFilter} />
      )}
      <ErrorText error={error} />
      {!rows && !error && <div className="co-grid">{[0, 1, 2].map((i) => <div key={i} className="co-sk-block" style={{ height: 210 }} />)}</div>}
      {rows?.length === 0 && (
        <EmptyState icon="flag" title={t("co.tasks.empty_title")} text={t("co.tasks.empty_text")}
                    action={<button className="btn" style={{ width: "auto" }} onClick={() => setMode("new")}><Icon name="plus" size={18} />{t("task.new")}</button>} />
      )}
      {rows && rows.length > 0 && shown.length === 0 && <div className="co-card hint">{t("co.nothing_here")}</div>}
      <div className="co-grid">
        {shown.map((c) => {
          const left = daysLeft(c.ends_at);
          return (
            <button key={c.id} className={`co-task st-${stateOf(c)}`} onClick={() => setMode(c.id)}>
              <div className="co-job-top">
                <span className="co-tag"><Icon name="users" size={13} />{audienceLabel(c)}</span>
                <span className={`badge ${c.is_archived ? "todo" : STATE_BADGE[c.state]}`}>{c.is_archived ? t("task.archived") : t(`task.state.${c.state}`)}</span>
              </div>
              <h3>{c.title}</h3>
              <p className="co-clamp">{c.description}</p>
              <div className="co-job-metrics">
                <div><b>{c.entries}</b><span>{t("co.tasks.entries")}</span></div>
                <div className={c.to_review ? "warn" : ""}><b>{c.to_review ?? 0}</b><span>{t("co.tasks.to_review")}</span></div>
                <div><b>{c.points}</b><span>{t("home.points")}</span></div>
              </div>
              <div className="co-time">
                <div className="co-progress small"><span style={{ width: `${elapsedShare(c)}%` }} /></div>
                <span className="hint">{c.state === "finished" || (left != null && left < 0) ? t("co.tasks.ended", { date: formatDateTime(c.ends_at, false) })
                  : t("co.tasks.left", { n: Math.max(0, left ?? 0), date: formatDateTime(c.ends_at, false) })}</span>
              </div>
              {c.prize && <div className="co-prize"><Icon name="flame" size={14} />{c.prize}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function audienceLabel(c: Challenge): string {
  if (c.audience === "track") return c.track?.split(":")[0] ?? t("task.audience.track");
  if (c.audience === "selected") return `${t("task.audience.selected")} (${c.invited ?? 0})`;
  return t(`task.audience.${c.audience ?? "all"}`);
}

function TaskForm({ preselected, onDone }: { preselected: number[]; onDone: (created: boolean) => void }) {
  useLang();
  const [f, setF] = useState({ title: "", description: "", prize: "", points: "20", ends_on: inDays(14),
                               audience: (preselected.length ? "selected" : "all") as CompanyTaskInput["audience"],
                               track_id: "", university_id: "" });
  const [picked, setPicked] = useState<number[]>(preselected);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [unis, setUnis] = useState<University[]>([]);
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    api.tracks().then(setTracks, () => {});
    api.universities().then(setUnis, () => {});
  }, []);
  useEffect(() => {
    if (f.audience === "selected" && !students) api.employer.students({}).then(setStudents, (e) => setError(message(e)));
  }, [f.audience, students]);

  async function send() {
    const ready = f.title.trim().length >= 3 && f.description.trim().length >= 20
      && (f.audience !== "track" || f.track_id) && (f.audience !== "university" || f.university_id)
      && (f.audience !== "selected" || picked.length > 0);
    if (!ready) return setError(t("task.f.need"));
    setBusy(true); setError("");
    try {
      await api.employer.createTask({
        title: f.title.trim(), description: f.description.trim(), prize: f.prize.trim(),
        points: Math.min(50, Math.max(0, Number(f.points) || 0)), ends_on: f.ends_on, audience: f.audience,
        track_id: f.audience === "track" ? Number(f.track_id) : null,
        university_id: f.audience === "university" ? Number(f.university_id) : null,
        student_ids: f.audience === "selected" ? picked : [],
      });
      haptic("success");
      toast(t("task.f.sent"));
      onDone(true);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  const shown = (students ?? []).filter((s) => !q.trim() || s.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="co-page">
      <button className="btn small ghost co-back" onClick={() => onDone(false)}><Icon name="back" size={16} />{t("task.e.back")}</button>
      <PageHead title={t("task.new")} sub={t("co.tasks.form_sub")} />
      <div className="co-form-layout">
      <div className="co-card">
        <label>{t("task.f.title")}</label>
        <input value={f.title} maxLength={160} onChange={set("title")} />
        <label>{t("task.f.description")}</label>
        <textarea value={f.description} maxLength={5000} rows={6} onChange={set("description")} />
        <label>{t("task.f.audience")}</label>
        <select value={f.audience} onChange={set("audience")}>
          {(["all", "track", "university", "selected"] as const).map((a) => <option key={a} value={a}>{t(`task.audience.${a}`)}</option>)}
        </select>
        {f.audience === "track" && (
          <>
            <label>{t("task.f.track")}</label>
            <select value={f.track_id} onChange={set("track_id")}>
              <option value="">{t("task.f.choose")}</option>
              {tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
            </select>
          </>
        )}
        {f.audience === "university" && (
          <>
            <label>{t("task.f.university")}</label>
            <select value={f.university_id} onChange={set("university_id")}>
              <option value="">{t("task.f.choose")}</option>
              {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} · {u.name}</option>)}
            </select>
          </>
        )}
        {f.audience === "selected" && (
          <>
            <label>{t("task.f.students", { n: picked.length })}</label>
            <input value={q} placeholder={t("task.f.search")} onChange={(e) => setQ(e.target.value)} />
            <div className="pick-list">
              {!students && <div className="hint">{t("common.loading")}</div>}
              {shown.slice(0, 100).map((s) => (
                <label key={s.id} className="pick-row">
                  <input type="checkbox" checked={picked.includes(s.id)}
                         onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
                  <span className="grow">{s.full_name}<span className="hint"> · {[s.university, s.track?.split(":")[0]].filter(Boolean).join(" · ")}</span></span>
                  <span className="hint">{s.points}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <div className="grow"><label>{t("task.f.points")}</label>
            <input value={f.points} inputMode="numeric" onChange={(e) => setF({ ...f, points: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
          </div>
          <div className="grow"><label>{t("task.f.ends")}</label><input type="date" value={f.ends_on} onChange={set("ends_on")} /></div>
        </div>
        <label>{t("task.f.prize")}</label>
        <input value={f.prize} maxLength={300} placeholder={t("task.f.prize_hint")} onChange={set("prize")} />
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={send}><Icon name="send" size={16} />{t("task.f.send")}</button>
      </div>
      <aside className="co-col co-sticky">
        <div className="co-card co-tips">
          <b><Icon name="spark" size={16} />{t("co.tasks.tips_title")}</b>
          <ul>{([1, 2, 3, 4] as const).map((n) => <li key={n}>{t(`co.tasks.tip.${n}`)}</li>)}</ul>
        </div>
        <div className="co-card">
          <b>{t("co.tasks.podium")}</b>
          <div className="co-podium big">
            <div className="p2"><span>2</span><b>+20</b></div>
            <div className="p1"><span>1</span><b>+30</b></div>
            <div className="p3"><span>3</span><b>+10</b></div>
          </div>
          <p className="hint" style={{ margin: 0 }}>{t("co.tasks.podium_hint")}</p>
        </div>
      </aside>
      </div>
    </div>
  );
}

function Entries({ task, onBack }: { task: Challenge; onBack: () => void }) {
  useLang();
  const [rows, setRows] = useState<ChallengeEntry[] | null>(null);
  const [filter, setFilter] = useState<"all" | "submitted" | "accepted" | "rejected">("all");
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.taskEntries(task.id).then(setRows, (e) => setError(message(e))), [task.id]);
  useEffect(() => { void load(); }, [load]);

  async function archive() {
    if (!(await ask(t("task.e.archive_confirm")))) return;
    try { await api.employer.editTask(task.id, { is_archived: true }); onBack(); } catch (e) { setError(message(e)); }
  }

  const count = (k: string) => (rows ?? []).filter((e) => k === "all" || e.status === k).length;
  const shown = (rows ?? []).filter((e) => filter === "all" || e.status === filter);
  return (
    <div className="co-page">
      <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("task.e.back")}</button>
      <PageHead title={task.title}
                sub={`${audienceLabel(task)} · ${t("task.until", { date: formatDateTime(task.ends_at, false) })} · ${t("task.e.points_each", { n: task.points })}`}
                actions={!task.is_archived ? <button className="btn ghost small" onClick={archive}>{t("task.e.archive")}</button> : undefined} />
      <div className="co-card co-task-brief">
        <p style={{ whiteSpace: "pre-line", margin: 0 }}>{task.description}</p>
        {task.prize && <div className="co-prize" style={{ marginTop: 12 }}><Icon name="flame" size={14} />{t("task.prize", { prize: task.prize })}</div>}
      </div>
      <ErrorText error={error} />
      {rows && rows.length > 0 && (
        <Tabs items={(["all", "submitted", "accepted", "rejected"] as const).map((k) =>
          [k, k === "all" ? t("co.all") : k === "submitted" ? t("task.e.pending") : k === "accepted" ? t("task.e.accepted") : t("task.e.rejected"), count(k)] as [typeof k, string, number])}
              value={filter} onChange={setFilter} />
      )}
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && <EmptyState icon="inbox" title={t("task.e.empty")} text={t("co.tasks.entries_empty")} />}
      <div className="co-grid wide-cards">
        {shown.map((e) => <EntryCard key={e.id} taskId={task.id} entry={e} onDone={load} />)}
      </div>
    </div>
  );
}

function EntryCard({ taskId, entry, onDone }: { taskId: number; entry: ChallengeEntry; onDone: () => void }) {
  const [score, setScore] = useState(entry.score != null ? String(entry.score) : "");
  const [place, setPlace] = useState(entry.place ? String(entry.place) : "");
  const [comment, setComment] = useState(entry.comment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(accept: boolean) {
    setBusy(true); setError("");
    try {
      await api.employer.reviewTaskEntry(taskId, entry.id, {
        accept, comment: comment.trim(), score: score ? Number(score) : null,
        place: accept && place ? (Number(place) as 1 | 2 | 3) : null,
      });
      haptic("success");
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const [label, badge] = entry.status === "accepted" ? [t("task.e.accepted"), "peer_verified"]
    : entry.status === "rejected" ? [t("task.e.rejected"), "rejected"] : [t("task.e.pending"), "pending"];
  return (
    <div className="co-card co-entry">
      <div className="row between">
        <span className="row" style={{ gap: 10, minWidth: 0 }}><span className="co-avatar">{initials(entry.student)}</span><b className="ellipsis">{entry.student}</b></span>
        <span className={`badge ${badge}`}>{entry.place ? t("task.e.place_n", { n: entry.place, bonus: [0, 30, 20, 10][entry.place] }) : label}</span>
      </div>
      <div className="hint">{[entry.university, entry.username && `@${entry.username}`].filter(Boolean).join(" · ")}</div>
      {entry.note && <p style={{ margin: "8px 0 0", whiteSpace: "pre-line" }}>{entry.note}</p>}
      <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => openLink(entry.proof_url)}>{t("task.e.open")}</button>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="grow"><label>{t("task.e.score")}</label>
          <input value={score} inputMode="numeric" onChange={(e) => setScore(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </div>
        <div className="grow"><label>{t("task.e.place")}</label>
          <select value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{t("task.e.place_n", { n, bonus: [0, 30, 20, 10][n] })}</option>)}
          </select>
        </div>
      </div>
      <label>{t("task.e.comment")}</label>
      <textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
      <ErrorText error={error} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn ghost" disabled={busy} onClick={() => decide(false)}>{t("task.e.reject")}</button>
        <button className="btn ok" disabled={busy} onClick={() => decide(true)}>{t("task.e.accept")}</button>
      </div>
    </div>
  );
}
