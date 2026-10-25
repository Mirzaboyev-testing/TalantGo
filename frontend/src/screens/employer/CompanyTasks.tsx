import { useCallback, useEffect, useState } from "react";
import { api, type Challenge, type ChallengeEntry, type CompanyTaskInput, type StudentRow, type Track, type University } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate, useSearch } from "../../router";
import { ask, haptic, openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";

const STATE_BADGE = { upcoming: "todo", active: "peer_verified", finished: "pending" } as const;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);

/** Company tasks: give students a real-world assignment, score the entries, name the winners. */
export default function CompanyTasks() {
  useLang();
  const search = useSearch();
  const preselected = search.talaba ? [Number(search.talaba)].filter(Boolean) : [];
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [mode, setMode] = useState<"list" | "new" | number>(preselected.length ? "new" : "list");
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.tasks().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (mode === "new") {
    return <TaskForm preselected={preselected} onDone={(created) => {
      setMode("list"); if (created) void load();
      if (search.talaba) navigate("/korxona/vazifalar", { replace: true });
    }} />;
  }
  if (typeof mode === "number") {
    const task = rows?.find((c) => c.id === mode);
    if (task) return <Entries task={task} onBack={() => { setMode("list"); void load(); }} />;
  }

  return (
    <div>
      <div className="row between wrap">
        <h1 style={{ margin: 0 }}>{t("nav.company.tasks")}</h1>
        <button className="btn small" onClick={() => setMode("new")}><Icon name="plus" size={16} />{t("task.new")}</button>
      </div>
      <p className="hint">{t("task.intro")}</p>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="card hint">{t("task.empty")}</div>}
      {rows?.map((c) => (
        <div key={c.id} className="card tap" onClick={() => setMode(c.id)}>
          <div className="row between">
            <span className="hint">{audienceLabel(c)} · {t("task.until", { date: formatDateTime(c.ends_at, false) })}</span>
            <span className={`badge ${c.is_archived ? "todo" : STATE_BADGE[c.state]}`}>
              {c.is_archived ? t("task.archived") : t(`task.state.${c.state}`)}
            </span>
          </div>
          <b>{c.title}</b>
          <div className="hint" style={{ marginTop: 4 }}>
            {t("task.entries", { n: c.entries })}{c.to_review ? ` · ${t("task.to_review", { n: c.to_review })}` : ""}
            {c.prize ? ` · ${t("task.prize", { prize: c.prize })}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function audienceLabel(c: Challenge): string {
  if (c.audience === "track") return c.track?.split(":")[0] ?? t("task.audience.track");
  if (c.audience === "selected") return `${t("task.audience.selected")} (${c.invited ?? 0})`;
  return t(`task.audience.${c.audience ?? "all"}`);
}

function TaskForm({ preselected, onDone }: { preselected: number[]; onDone: (created: boolean) => void }) {
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
    <div>
      <button className="btn small ghost" onClick={() => onDone(false)}><Icon name="back" size={16} />{t("task.e.back")}</button>
      <h1>{t("task.new")}</h1>
      <div className="card">
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
        <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={send}>{t("task.f.send")}</button>
      </div>
    </div>
  );
}

function Entries({ task, onBack }: { task: Challenge; onBack: () => void }) {
  const [rows, setRows] = useState<ChallengeEntry[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.taskEntries(task.id).then(setRows, (e) => setError(message(e))), [task.id]);
  useEffect(() => { void load(); }, [load]);

  async function archive() {
    if (!(await ask(t("task.e.archive_confirm")))) return;
    try { await api.employer.editTask(task.id, { is_archived: true }); onBack(); } catch (e) { setError(message(e)); }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />{t("task.e.back")}</button>
      <h1>{task.title}</h1>
      <p className="hint">
        {audienceLabel(task)} · {t("task.until", { date: formatDateTime(task.ends_at, false) })} · {t("task.e.points_each", { n: task.points })}
      </p>
      <p style={{ whiteSpace: "pre-line" }}>{task.description}</p>
      {!task.is_archived && <button className="btn small ghost" onClick={archive}>{t("task.e.archive")}</button>}
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="card hint">{t("task.e.empty")}</div>}
      {rows?.map((e) => <EntryCard key={e.id} taskId={task.id} entry={e} onDone={load} />)}
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
    <div className="card">
      <div className="row between">
        <b>{entry.student}</b>
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
