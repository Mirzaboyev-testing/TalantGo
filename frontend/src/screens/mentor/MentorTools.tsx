import { useCallback, useEffect, useState } from "react";
import { api, daysLeft, type Challenge, type ChallengeEntry, type MentorTask, type TaskQuestion, type Track } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { haptic, openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";

const STATE_BADGE = { upcoming: "todo", active: "peer_verified", finished: "todo" } as const;
const stateLabel = (s: Challenge["state"]) => t(`p.mentor.state.${s}`);
const day = (iso: string) => formatDateTime(iso, false);
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => { api.tracks().then(setTracks, () => {}); }, []);
  return tracks;
}

// --------------------------------------------------------------------------- tasks

export function MentorTasks() {
  useLang();
  const tracks = useTracks();
  const [rows, setRows] = useState<MentorTask[] | null>(null);
  const [editing, setEditing] = useState<MentorTask | "new" | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.mentor.tasks().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (editing) return <TaskForm tracks={tracks} task={editing === "new" ? undefined : editing} onDone={() => { setEditing(null); void load(); }} />;

  return (
    <div>
      <div className="page-head">
        <p className="hint" style={{ margin: 0 }}>{t("p.mentor.tasks_hint")}</p>
        <button className="btn small" onClick={() => setEditing("new")}><Icon name="plus" size={16} />{t("p.mentor.task")}</button>
      </div>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">{t("p.mentor.tasks_empty")}</div>}
      {rows?.map((task) => (
        <div key={task.id} className="card" style={task.is_active ? undefined : { opacity: 0.55 }}>
          <div className="row between">
            <span className="hint">{task.track.split(":")[0]} · {t("p.mentor.week_n", { n: task.week })} · {t("p.common.points_n", { n: task.points })}</span>
            {!task.is_active && <span className="badge todo">{t("p.mentor.hidden")}</span>}
          </div>
          <b>{task.title}</b>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn small ghost" onClick={() => setEditing(task)}>{t("p.common.edit")}</button>
            <button className="btn small ghost" onClick={() => api.mentor.editTask(task.id, { is_active: !task.is_active }).then(load, (e) => setError(message(e)))}>
              {task.is_active ? t("p.mentor.hide") : t("p.mentor.show")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskForm({ tracks, task, onDone }: { tracks: Track[]; task?: MentorTask; onDone: () => void }) {
  useLang();
  const [f, setF] = useState({
    track_id: task ? String(task.track_id) : "", week: String(task?.week ?? 1), title: task?.title ?? "",
    description: task?.description ?? "", proof_hint: task?.proof_hint ?? "", criteria: task?.criteria ?? "",
    points: String(task?.points ?? 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const body = { track_id: Number(f.track_id), week: Number(f.week), title: f.title.trim(), description: f.description.trim(),
                   proof_hint: f.proof_hint.trim(), criteria: f.criteria.trim(), points: Number(f.points) };
    setBusy(true); setError("");
    try {
      if (task) await api.mentor.editTask(task.id, body);
      else await api.mentor.createTask(body);
      haptic("success");
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />{t("common.back")}</button>
      <h2>{task ? t("p.mentor.task_edit") : t("p.mentor.task_new")}</h2>
      <div className="card">
        <label>{t("p.mentor.f.track")}</label>
        <select value={f.track_id} disabled={!!task} onChange={set("track_id")}>
          <option value="">{t("task.f.choose")}</option>
          {tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
        </select>
        <div className="row">
          <div className="grow"><label>{t("p.mentor.f.week")}</label><input value={f.week} inputMode="numeric" onChange={set("week")} /></div>
          <div className="grow"><label>{t("p.mentor.f.points")}</label><input value={f.points} inputMode="numeric" onChange={set("points")} /></div>
        </div>
        <label>{t("p.common.title")}</label>
        <input value={f.title} maxLength={160} placeholder={t("p.mentor.f.title_ph")} onChange={set("title")} />
        <label>{t("p.mentor.f.desc")}</label>
        <textarea value={f.description} maxLength={4000} placeholder={t("p.mentor.f.desc_ph")} onChange={set("description")} />
        <label>{t("p.mentor.f.proof")}</label>
        <input value={f.proof_hint} maxLength={500} placeholder={t("p.mentor.f.proof_ph")} onChange={set("proof_hint")} />
        <div className="hint">{t("p.mentor.f.proof_hint")}</div>
        <label>{t("p.mentor.f.criteria")}</label>
        <textarea value={f.criteria} maxLength={2000} onChange={set("criteria")}
                  placeholder={t("p.mentor.f.criteria_ph")} />
        <div className="hint">{t("p.mentor.f.criteria_hint")}</div>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 14 }} disabled={busy || !f.track_id || f.title.trim().length < 3 || f.description.trim().length < 10} onClick={save}>
          {busy ? t("p.common.saving") : task ? t("common.save") : t("p.mentor.add")}
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- questions

export function MentorQuestions({ onCount }: { onCount: (n: number) => void }) {
  useLang();
  const [openOnly, setOpenOnly] = useState(true);
  const [rows, setRows] = useState<TaskQuestion[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.mentor.questions(openOnly).then((q) => {
    setRows(q);
    if (openOnly) onCount(q.length);
  }, (e) => setError(message(e))), [openOnly, onCount]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="page-head">
        <p className="hint" style={{ margin: 0 }}>{t("p.mentor.questions_hint")}</p>
      </div>
      <div className="segmented">
        <button className={openOnly ? "on" : ""} onClick={() => setOpenOnly(true)}>{t("p.mentor.q_open")}</button>
        <button className={!openOnly ? "on" : ""} onClick={() => setOpenOnly(false)}>{t("p.mentor.q_all")}</button>
      </div>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">{openOnly ? t("p.mentor.q_open_empty") : t("p.mentor.q_empty")}</div>}
      {rows?.map((q) => <QuestionCard key={q.id} q={q} onAnswered={load} />)}
    </div>
  );
}

function QuestionCard({ q, onAnswered }: { q: TaskQuestion; onAnswered: () => void }) {
  useLang();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true); setError("");
    try {
      await api.mentor.answer(q.id, answer.trim());
      haptic("success");
      toast(t("p.mentor.answer_sent"));
      onAnswered();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="hint">{q.track.split(":")[0]} · {q.task_title}</div>
      <div style={{ marginTop: 4 }}><b>{q.author}:</b> {q.text}</div>
      <div className="hint">{day(q.created_at)}</div>
      {q.answer ? (
        <div className="qa-answer"><div className="hint" style={{ color: "inherit" }}>{q.answered_by ?? t("p.mentor.mentor")}</div>{q.answer}</div>
      ) : (
        <>
          <textarea value={answer} maxLength={2000} placeholder={t("p.mentor.answer_ph")} onChange={(e) => setAnswer(e.target.value)} />
          <ErrorText error={error} />
          <button className="btn small" style={{ marginTop: 8 }} disabled={busy || answer.trim().length < 2} onClick={send}>
            {busy ? t("p.common.sending") : t("p.mentor.answer")}
          </button>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- challenges

export function MentorChallenges() {
  useLang();
  const tracks = useTracks();
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [mode, setMode] = useState<"list" | "new" | number>("list");
  const [error, setError] = useState("");
  const load = useCallback(() => api.mentor.challenges().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (mode === "new") return <ChallengeForm tracks={tracks} onDone={() => { setMode("list"); void load(); }} />;
  if (typeof mode === "number") {
    const ch = rows?.find((c) => c.id === mode);
    if (ch) return <Entries challenge={ch} onBack={() => { setMode("list"); void load(); }} />;
  }

  return (
    <div>
      <div className="page-head">
        <p className="hint" style={{ margin: 0 }}>{t("p.mentor.challenges_hint")}</p>
        <button className="btn small" onClick={() => setMode("new")}><Icon name="plus" size={16} />{t("p.mentor.challenge")}</button>
      </div>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">{t("p.mentor.challenges_empty")}</div>}
      {rows?.map((c) => (
        <div key={c.id} className="card tap" onClick={() => setMode(c.id)}>
          <div className="row between">
            <span className="hint">{c.track?.split(":")[0] ?? t("p.common.all_tracks")} · {t("task.until", { date: day(c.ends_at) })}</span>
            <span className={`badge ${STATE_BADGE[c.state]}`}>{stateLabel(c.state)}</span>
          </div>
          <b>{c.title}</b>
          <div className="hint" style={{ marginTop: 4 }}>
            {t("p.mentor.entries_n", { n: c.entries })}{c.to_review ? ` · ${t("task.to_review", { n: c.to_review })}` : ""}{c.prize ? ` · ${t("p.mentor.prize", { prize: c.prize })}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChallengeForm({ tracks, onDone }: { tracks: Track[]; onDone: () => void }) {
  useLang();
  const [f, setF] = useState({ title: "", description: "", track_id: "", prize: "", points: "20", starts_on: today(), ends_on: inDays(7) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setError("");
    try {
      await api.mentor.createChallenge({
        title: f.title.trim(), description: f.description.trim(), track_id: f.track_id ? Number(f.track_id) : null,
        prize: f.prize.trim(), points: Number(f.points), starts_on: f.starts_on, ends_on: f.ends_on,
      });
      haptic("success");
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />{t("common.back")}</button>
      <h2>{t("p.mentor.challenge_new")}</h2>
      <div className="card">
        <label>{t("p.common.title")}</label>
        <input value={f.title} maxLength={160} placeholder={t("p.mentor.c.title_ph")} onChange={set("title")} />
        <label>{t("p.mentor.c.desc")}</label>
        <textarea value={f.description} maxLength={5000} rows={5}
                  placeholder={t("p.mentor.c.desc_ph")} onChange={set("description")} />
        <label>{t("p.mentor.c.for")}</label>
        <select value={f.track_id} onChange={set("track_id")}>
          <option value="">{t("p.common.all_tracks")}</option>
          {tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
        </select>
        <div className="row">
          <div className="grow"><label>{t("p.mentor.c.starts")}</label><input type="date" value={f.starts_on} min={today()} onChange={set("starts_on")} /></div>
          <div className="grow"><label>{t("p.mentor.c.ends")}</label><input type="date" value={f.ends_on} min={f.starts_on} onChange={set("ends_on")} /></div>
        </div>
        <div className="row">
          <div className="grow"><label>{t("p.mentor.c.points")}</label><input value={f.points} inputMode="numeric" onChange={set("points")} /></div>
        </div>
        <label>{t("p.mentor.c.prize")}</label>
        <input value={f.prize} maxLength={300} placeholder={t("p.mentor.c.prize_ph")} onChange={set("prize")} />
        <p className="hint">{t("p.mentor.c.notify")}</p>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 10 }} disabled={busy || f.title.trim().length < 3 || f.description.trim().length < 20} onClick={save}>
          {busy ? t("p.mentor.c.publishing") : t("p.mentor.c.publish")}
        </button>
      </div>
    </div>
  );
}

function Entries({ challenge, onBack }: { challenge: Challenge; onBack: () => void }) {
  useLang();
  const [rows, setRows] = useState<ChallengeEntry[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.mentor.entries(challenge.id).then(setRows, (e) => setError(message(e))), [challenge.id]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />{t("p.mentor.challenges")}</button>
      <h2>{challenge.title}</h2>
      <p className="hint">
        {stateLabel(challenge.state)} · {t("task.until", { date: day(challenge.ends_at) })}
        {challenge.state === "active" ? ` (${t("p.mentor.days_left", { n: daysLeft(challenge.ends_at) })})` : ""} · {t("task.e.points_each", { n: challenge.points })}
      </p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">{t("task.e.empty")}</div>}
      {rows?.map((e) => <EntryCard key={e.id} challengeId={challenge.id} entry={e} onDone={load} />)}
    </div>
  );
}

function EntryCard({ challengeId, entry, onDone }: { challengeId: number; entry: ChallengeEntry; onDone: () => void }) {
  useLang();
  const [score, setScore] = useState(entry.score != null ? String(entry.score) : "");
  const [place, setPlace] = useState<string>(entry.place ? String(entry.place) : "");
  const [comment, setComment] = useState(entry.comment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(accept: boolean) {
    setBusy(true); setError("");
    try {
      await api.mentor.review(challengeId, entry.id, {
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

  const badge = entry.status === "accepted" ? [t("task.e.accepted"), "peer_verified"] : entry.status === "rejected" ? [t("task.e.rejected"), "rejected"]
    : [t("task.e.pending"), "pending"];
  return (
    <div className="card">
      <div className="row between">
        <b>{entry.student}</b>
        <span className={`badge ${badge[1]}`}>{entry.place ? t("p.mentor.place_n", { n: entry.place }) : badge[0]}</span>
      </div>
      <div className="hint">{[entry.university, entry.username && `@${entry.username}`].filter(Boolean).join(" · ")}</div>
      {entry.note && <p style={{ margin: "8px 0 0", whiteSpace: "pre-line" }}>{entry.note}</p>}
      <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => openLink(entry.proof_url)}>{t("task.e.open")}</button>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="grow"><label>{t("task.e.score")}</label><input value={score} inputMode="numeric" onChange={(e) => setScore(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
        <div className="grow"><label>{t("task.e.place")}</label>
          <select value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">—</option><option value="1">{t("task.e.place_n", { n: 1, bonus: 30 })}</option>
            <option value="2">{t("task.e.place_n", { n: 2, bonus: 20 })}</option><option value="3">{t("task.e.place_n", { n: 3, bonus: 10 })}</option>
          </select>
        </div>
      </div>
      <label>{t("p.mentor.e.comment")}</label>
      <input value={comment} maxLength={1000} placeholder={t("p.mentor.e.comment_ph")} onChange={(e) => setComment(e.target.value)} />
      <ErrorText error={error} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn bad" disabled={busy} onClick={() => decide(false)}>{t("task.e.reject")}</button>
        <button className="btn ok" disabled={busy} onClick={() => decide(true)}>{t("task.e.accept")}</button>
      </div>
    </div>
  );
}
