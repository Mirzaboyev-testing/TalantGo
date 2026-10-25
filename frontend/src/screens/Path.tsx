import { useCallback, useEffect, useRef, useState } from "react";
import { api, fileSize, type Me, type Task, type TaskQuestion } from "../api";
import { formatDateTime, t, useLang } from "../i18n";
import { haptic, openLink } from "../tg";
import { ErrorText, FileList, ReviewList, Sheet, StatusBadge, message, toast } from "../ui";
import InviteCard from "./InviteCard";
import Challenges from "./Challenges";
import { Icon, TrackMark } from "../icons";
import ProfileTask from "./ProfileTask";

const MAX_FILES = 5;
const MAX_MB = 10;

export default function PathScreen({ me, onChanged, onChangeTrack }: { me: Me; onChanged: () => void; onChangeTrack: () => void }) {
  useLang();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<"tasks" | "challenges">("tasks");
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api.tasks(me.track!.id).then(setTasks, (e) => setError(message(e))), [me.track]);
  useEffect(() => { void load(); }, [load]);

  // while the AI is checking a submission, refresh quietly so its verdict shows up by itself
  const checking = tasks?.some((t) => t.submission?.ai_state === "checking") ?? false;
  const polls = useRef(0);
  useEffect(() => {
    if (!checking) { polls.current = 0; return; }
    if (polls.current > 40) return;
    const timer = setTimeout(() => { polls.current += 1; void load().then(onChanged); }, 4000);
    return () => clearTimeout(timer);
  }, [checking, tasks, load, onChanged]);

  const done = tasks?.filter((t) => t.submission && ["peer_verified", "mentor_verified"].includes(t.submission.status)).length ?? 0;
  const open = tasks?.find((t) => t.id === openId) ?? null;

  return (
    <div>
      <div className="row between">
        <h1 className="row" style={{ gap: 12 }}><TrackMark title={me.track!.title} size={40} />{me.track!.title}</h1>
      </div>
      <div className="stats">
        <div className="stat"><b>{me.points}</b><span>{t("home.points")}</span></div>
        <div className="stat"><b>{me.streak > 0 && <Icon name="flame" size={18} />}{me.streak}</b><span>{t("home.streak")}</span></div>
        <div className="stat"><b>#{me.rank_overall}</b><span>{t("home.rank")}</span></div>
      </div>
      {tasks && (
        <p className="hint">{t("s.path.done", { done, total: tasks.length })} · <a href="#" onClick={(e) => { e.preventDefault(); onChangeTrack(); }}>{t("s.path.change_track")}</a></p>
      )}
      {me.invited_count < 3 && <InviteCard me={me} compact />}
      <div className="segmented">
        <button className={view === "tasks" ? "on" : ""} onClick={() => setView("tasks")}>{t("s.common.tasks")}</button>
        <button className={view === "challenges" ? "on" : ""} onClick={() => setView("challenges")}>{t("s.common.challenges")}</button>
      </div>
      {view === "challenges" && <Challenges />}
      <ErrorText error={error} />
      {view === "tasks" && !tasks && !error && <div className="hint">{t("common.loading")}</div>}
      {view === "tasks" && tasks?.map((task) => (
        <div key={task.id} className="card tap" onClick={() => setOpenId(task.id)}>
          <div className="row between">
            <span className="hint">{task.kind === "profile" ? t("s.path.start") : t("s.path.week", { n: task.week })} · {t("s.common.points", { n: task.points })}</span>
            {task.kind === "profile" && task.submission ? <span className="badge peer_verified">{t("s.path.done_badge")}</span>
              : task.submission?.ai_state === "checking" ? <span className="badge pending">{t("s.path.checking")}</span>
              : <StatusBadge status={task.submission?.status ?? null} />}
          </div>
          <b>{task.title}</b>
          {(task.mentor || task.questions > 0) && (
            <div className="hint" style={{ marginTop: 2 }}>
              {[task.mentor && t("s.path.mentor", { name: task.mentor }), task.questions > 0 && t("s.path.questions_n", { n: task.questions })]
                .filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      ))}
      {open && (
        <TaskSheet task={open} me={me} onClose={() => setOpenId(null)}
                   onSubmitted={async () => { await load(); onChanged(); }} />
      )}
    </div>
  );
}

function TaskSheet({ task, me, onClose, onSubmitted }: { task: Task; me: Me; onClose: () => void; onSubmitted: () => Promise<void> | void }) {
  useLang();
  const sub = task.submission;
  const isProfile = task.kind === "profile";
  const canSubmit = !isProfile && (!sub || sub.status === "rejected");

  return (
    <Sheet onClose={onClose}>
      <div className="row between">
        <span className="hint">{isProfile ? t("s.path.start") : t("s.path.week", { n: task.week })} · {t("s.common.points", { n: task.points })}</span>
        {isProfile && sub ? <span className="badge peer_verified">{t("s.path.done_badge")}</span>
          : sub?.ai_state === "checking" ? <span className="badge pending">{t("s.path.checking")}</span>
          : <StatusBadge status={sub?.status ?? null} />}
      </div>
      <h1>{task.title}</h1>
      <div className="card">
        <p style={{ marginTop: 0, whiteSpace: "pre-line" }}>{task.description}</p>
        {!isProfile && task.proof_hint && <div className="hint"><b>{t("s.common.proof")}</b> {task.proof_hint}</div>}
        {!isProfile && task.criteria && <div className="hint" style={{ marginTop: 6, whiteSpace: "pre-line" }}><b>{t("s.common.criteria")}</b> {task.criteria}</div>}
        {task.mentor && <div className="hint" style={{ marginTop: 6 }}>{t("s.path.mentor", { name: task.mentor })}</div>}
      </div>

      {isProfile && <ProfileTask me={me} task={task} onDone={onSubmitted} />}

      {sub && !isProfile && (
        <div className="card">
          <div className="row between">
            <b>{t("s.path.your_work")}{sub.round > 1 ? ` ${t("s.path.attempt", { n: sub.round })}` : ""}</b>
            {sub.proof_url && <button className="btn small ghost" onClick={() => openLink(sub.proof_url)}>{t("s.common.open_link")}</button>}
          </div>
          {sub.note && <div style={{ marginTop: 6 }}>«{sub.note}»</div>}
          <FileList files={sub.files} />
          {sub.ai_state === "checking" && (
            <div className="notice ai-note" style={{ marginTop: 10 }}>
              <span className="spinner" />
              <span>{t("s.path.ai_checking")}</span>
            </div>
          )}
          {sub.ai_state === "unsure" && (
            <p className="notice" style={{ marginTop: 10 }}>{t("s.path.ai_unsure", { note: sub.ai_note })}</p>
          )}
          {sub.ai_state === "failed" && sub.status === "pending" && (
            <p className="hint" style={{ marginTop: 10 }}>{t("s.path.ai_failed")}</p>
          )}
          {sub.reviews.length === 0 && sub.ai_state !== "checking" && sub.status === "pending" && (
            <p className="hint">{t("s.path.not_reviewed")}</p>
          )}
          <ReviewList reviews={sub.reviews} />
        </div>
      )}

      {canSubmit && <SubmitForm task={task} resubmit={!!sub} onSubmitted={onSubmitted} />}
      {!isProfile && <Questions task={task} />}
      <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
    </Sheet>
  );
}

function SubmitForm({ task, resubmit, onSubmitted }: { task: Task; resubmit: boolean; onSubmitted: () => Promise<void> | void }) {
  useLang();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function pick(list: FileList | null) {
    if (!list) return;
    const chosen = [...picked];
    for (const f of Array.from(list)) {
      if (f.size > MAX_MB * 1024 * 1024) { setError(t("s.path.too_big", { name: f.name, mb: MAX_MB })); continue; }
      if (chosen.length >= MAX_FILES) { setError(t("s.path.max_files", { n: MAX_FILES })); break; }
      chosen.push(f);
    }
    setPicked(chosen);
    if (input.current) input.current.value = "";
  }

  const uploaded = useRef(new Map<File, number>());

  async function send() {
    setError("");
    try {
      const ids: number[] = [];
      for (const [i, f] of picked.entries()) {
        setBusy(t("s.path.uploading", { i: i + 1, n: picked.length }));
        // a retry after a failed submit reuses what was already uploaded instead of uploading it again
        let id = uploaded.current.get(f);
        if (id === undefined) { id = (await api.upload(f)).id; uploaded.current.set(f, id); }
        ids.push(id);
      }
      setBusy(t("s.common.sending"));
      await api.submit(task.id, url.trim(), note.trim(), ids);
      haptic("success");
      toast(t("s.path.submitted"));
      setPicked([]); setUrl(""); setNote("");
      uploaded.current.clear();
      await onSubmitted();
    } catch (e) {
      haptic("error");
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  const ready = picked.length > 0 || url.trim().length >= 4;
  return (
    <div className="card">
      <b>{resubmit ? t("s.path.resubmit") : t("s.common.submit")}</b>
      <label>{t("s.path.files")}</label>
      <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      <div className="dropzone" role="button" onClick={() => input.current?.click()}>
        <Icon name="upload" size={20} />
        {t("s.path.choose_file")}
        <span className="hint">{t("s.path.file_hint", { n: MAX_FILES, mb: MAX_MB })}</span>
      </div>
      {picked.length > 0 && (
        <div className="files">
          {picked.map((f, i) => (
            <div key={`${f.name}-${i}`} className="file-chip">
              <span className="file-ext">{(f.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>
              <span className="file-name">{f.name}</span>
              <span className="hint">{fileSize(f.size)}</span>
              <button className="file-remove" aria-label={t("s.path.remove_file")} onClick={() => setPicked(picked.filter((_, j) => j !== i))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <label>{t("s.path.link_label")}</label>
      <input value={url} placeholder={t("s.path.link_ph")} inputMode="url" onChange={(e) => setUrl(e.target.value)} />
      <label>{t("s.common.note_optional")}</label>
      <textarea value={note} maxLength={1000} placeholder={t("s.path.note_ph")} onChange={(e) => setNote(e.target.value)} />
      <p className="hint">{t("s.path.need_one")}</p>
      <ErrorText error={error} />
      <button className="btn" disabled={!!busy || !ready} onClick={send}>{busy || t("s.common.send")}</button>
    </div>
  );
}

function Questions({ task }: { task: Task }) {
  useLang();
  const [items, setItems] = useState<TaskQuestion[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => api.questions(task.id).then(setItems, (e) => setError(message(e))), [task.id]);
  useEffect(() => { void load(); }, [load]);

  async function ask() {
    setBusy(true); setError("");
    try {
      await api.ask(task.id, text.trim());
      setText("");
      toast(t("s.path.q_sent"));
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <b className="row" style={{ gap: 8 }}><Icon name="help" size={18} />{t("s.path.q_title")}</b>
      <p className="hint" style={{ marginTop: 4 }}>{t("s.path.q_hint")}</p>
      {items?.map((q) => (
        <div key={q.id} className="qa">
          <div className="hint">{q.is_mine ? t("s.path.you") : q.author} · {formatDateTime(q.created_at, false)}</div>
          <div>{q.text}</div>
          {q.answer
            ? <div className="qa-answer"><div className="hint" style={{ color: "inherit" }}>{q.answered_by ?? t("nav.student.mentor")}</div>{q.answer}</div>
            : <div className="hint" style={{ marginTop: 4 }}>{t("s.path.q_waiting")}</div>}
        </div>
      ))}
      <textarea value={text} maxLength={1000} placeholder={t("s.path.q_ph")} onChange={(e) => setText(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn small" style={{ marginTop: 8 }} disabled={busy || text.trim().length < 5} onClick={ask}>
        {busy ? t("s.common.sending") : t("s.path.q_send")}
      </button>
    </div>
  );
}
