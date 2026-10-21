import { useCallback, useEffect, useRef, useState } from "react";
import { api, fileSize, uzDate, type Me, type Task, type TaskQuestion } from "../api";
import { haptic, openLink } from "../tg";
import { ErrorText, FileList, ReviewList, Sheet, StatusBadge, message, toast } from "../ui";
import InviteCard from "./InviteCard";
import Challenges from "./Challenges";
import { Icon, TrackMark } from "../icons";
import ProfileTask from "./ProfileTask";

const MAX_FILES = 5;
const MAX_MB = 10;

export default function PathScreen({ me, onChanged, onChangeTrack }: { me: Me; onChanged: () => void; onChangeTrack: () => void }) {
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
        <div className="stat"><b>{me.points}</b><span>ball</span></div>
        <div className="stat"><b>{me.streak > 0 && <Icon name="flame" size={18} />}{me.streak}</b><span>haftalik seriya</span></div>
        <div className="stat"><b>#{me.rank_overall}</b><span>umumiy o'rin</span></div>
      </div>
      {tasks && (
        <p className="hint">{done} / {tasks.length} topshiriq tasdiqlangan · <a href="#" onClick={(e) => { e.preventDefault(); onChangeTrack(); }}>yo'lni o'zgartirish</a></p>
      )}
      {me.invited_count < 3 && <InviteCard me={me} compact />}
      <div className="segmented">
        <button className={view === "tasks" ? "on" : ""} onClick={() => setView("tasks")}>Topshiriqlar</button>
        <button className={view === "challenges" ? "on" : ""} onClick={() => setView("challenges")}>Chellenjlar</button>
      </div>
      {view === "challenges" && <Challenges />}
      <ErrorText error={error} />
      {view === "tasks" && !tasks && !error && <div className="hint">Yuklanmoqda…</div>}
      {view === "tasks" && tasks?.map((t) => (
        <div key={t.id} className="card tap" onClick={() => setOpenId(t.id)}>
          <div className="row between">
            <span className="hint">{t.kind === "profile" ? "Start" : `${t.week}-hafta`} · {t.points} ball</span>
            {t.kind === "profile" && t.submission ? <span className="badge peer_verified">Bajarildi</span>
              : t.submission?.ai_state === "checking" ? <span className="badge pending">Tekshirilmoqda</span>
              : <StatusBadge status={t.submission?.status ?? null} />}
          </div>
          <b>{t.title}</b>
          {(t.mentor || t.questions > 0) && (
            <div className="hint" style={{ marginTop: 2 }}>
              {[t.mentor && `Mentor: ${t.mentor}`, t.questions > 0 && `${t.questions} ta savol`].filter(Boolean).join(" · ")}
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
  const sub = task.submission;
  const isProfile = task.kind === "profile";
  const canSubmit = !isProfile && (!sub || sub.status === "rejected");

  return (
    <Sheet onClose={onClose}>
      <div className="row between">
        <span className="hint">{isProfile ? "Start" : `${task.week}-hafta`} · {task.points} ball</span>
        {isProfile && sub ? <span className="badge peer_verified">Bajarildi</span>
          : sub?.ai_state === "checking" ? <span className="badge pending">Tekshirilmoqda</span>
          : <StatusBadge status={sub?.status ?? null} />}
      </div>
      <h1>{task.title}</h1>
      <div className="card">
        <p style={{ marginTop: 0, whiteSpace: "pre-line" }}>{task.description}</p>
        {!isProfile && task.proof_hint && <div className="hint"><b>Nima topshiriladi:</b> {task.proof_hint}</div>}
        {!isProfile && task.criteria && <div className="hint" style={{ marginTop: 6, whiteSpace: "pre-line" }}><b>Qanday baholanadi:</b> {task.criteria}</div>}
        {task.mentor && <div className="hint" style={{ marginTop: 6 }}>Mentor: {task.mentor}</div>}
      </div>

      {isProfile && <ProfileTask me={me} task={task} onDone={onSubmitted} />}

      {sub && !isProfile && (
        <div className="card">
          <div className="row between">
            <b>Sizning ishingiz{sub.round > 1 ? ` (${sub.round}-urinish)` : ""}</b>
            {sub.proof_url && <button className="btn small ghost" onClick={() => openLink(sub.proof_url)}>Havolani ochish</button>}
          </div>
          {sub.note && <div style={{ marginTop: 6 }}>«{sub.note}»</div>}
          <FileList files={sub.files} />
          {sub.ai_state === "checking" && (
            <div className="notice ai-note" style={{ marginTop: 10 }}>
              <span className="spinner" />
              <span>AI yordamchi ishingizni tekshirmoqda. Odatda bir daqiqadan kam vaqt oladi, natija shu yerda chiqadi.</span>
            </div>
          )}
          {sub.ai_state === "unsure" && (
            <p className="notice" style={{ marginTop: 10 }}>AI aniq baho bera olmadi: {sub.ai_note} Ishingizni tengdosh yoki mentor tekshiradi.</p>
          )}
          {sub.ai_state === "failed" && sub.status === "pending" && (
            <p className="hint" style={{ marginTop: 10 }}>Avtomatik tekshiruv hozir ishlamadi. Ishingizni tengdosh yoki mentor tekshiradi.</p>
          )}
          {sub.reviews.length === 0 && sub.ai_state !== "checking" && sub.status === "pending" && (
            <p className="hint">Hali baholanmagan. Tasdiqlansa ball beriladi.</p>
          )}
          <ReviewList reviews={sub.reviews} />
        </div>
      )}

      {canSubmit && <SubmitForm task={task} resubmit={!!sub} onSubmitted={onSubmitted} />}
      {!isProfile && <Questions task={task} />}
      <button className="btn ghost" onClick={onClose}>Yopish</button>
    </Sheet>
  );
}

function SubmitForm({ task, resubmit, onSubmitted }: { task: Task; resubmit: boolean; onSubmitted: () => Promise<void> | void }) {
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
      if (f.size > MAX_MB * 1024 * 1024) { setError(`«${f.name}» ${MAX_MB} MB dan katta`); continue; }
      if (chosen.length >= MAX_FILES) { setError(`Ko'pi bilan ${MAX_FILES} ta fayl`); break; }
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
        setBusy(`Fayl yuklanmoqda ${i + 1}/${picked.length}…`);
        // a retry after a failed submit reuses what was already uploaded instead of uploading it again
        let id = uploaded.current.get(f);
        if (id === undefined) { id = (await api.upload(f)).id; uploaded.current.set(f, id); }
        ids.push(id);
      }
      setBusy("Yuborilmoqda…");
      await api.submit(task.id, url.trim(), note.trim(), ids);
      haptic("success");
      toast("Ish topshirildi");
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
      <b>{resubmit ? "Qayta topshirish" : "Topshirish"}</b>
      <label>Fayllar</label>
      <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
      <div className="dropzone" role="button" onClick={() => input.current?.click()}>
        <Icon name="upload" size={20} />
        Fayl tanlash
        <span className="hint">Excel, Word, PDF, PowerPoint, rasm, kod, CSV va boshqalar. {MAX_FILES} tagacha, har biri {MAX_MB} MB gacha</span>
      </div>
      {picked.length > 0 && (
        <div className="files">
          {picked.map((f, i) => (
            <div key={`${f.name}-${i}`} className="file-chip">
              <span className="file-ext">{(f.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>
              <span className="file-name">{f.name}</span>
              <span className="hint">{fileSize(f.size)}</span>
              <button className="file-remove" aria-label="Olib tashlash" onClick={() => setPicked(picked.filter((_, j) => j !== i))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <label>Havola (ixtiyoriy): GitHub, Google Drive, Power BI</label>
      <input value={url} placeholder="github.com/ismingiz/loyiha" inputMode="url" onChange={(e) => setUrl(e.target.value)} />
      <label>Izoh (ixtiyoriy)</label>
      <textarea value={note} maxLength={1000} placeholder="Nima qildingiz, nimaga e'tibor berish kerak?" onChange={(e) => setNote(e.target.value)} />
      <p className="hint">Fayl yoki havoladan kamida bittasi kerak.</p>
      <ErrorText error={error} />
      <button className="btn" disabled={!!busy || !ready} onClick={send}>{busy || "Yuborish"}</button>
    </div>
  );
}

function Questions({ task }: { task: Task }) {
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
      toast("Savolingiz mentorga yuborildi");
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <b className="row" style={{ gap: 8 }}><Icon name="help" size={18} />Mentorga savol</b>
      <p className="hint" style={{ marginTop: 4 }}>Tushunarsiz joy bo'lsa so'rang. Javob shu yerda chiqadi va botga xabar keladi. Savol-javoblarni yo'nalishdagi hamma ko'radi.</p>
      {items?.map((q) => (
        <div key={q.id} className="qa">
          <div className="hint">{q.is_mine ? "Siz" : q.author} · {uzDate(q.created_at)}</div>
          <div>{q.text}</div>
          {q.answer
            ? <div className="qa-answer"><div className="hint" style={{ color: "inherit" }}>{q.answered_by ?? "Mentor"}</div>{q.answer}</div>
            : <div className="hint" style={{ marginTop: 4 }}>Javob kutilmoqda</div>}
        </div>
      ))}
      <textarea value={text} maxLength={1000} placeholder="Savolingiz: masalan, ma'lumotni qayerdan olish kerak?" onChange={(e) => setText(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn small" style={{ marginTop: 8 }} disabled={busy || text.trim().length < 5} onClick={ask}>
        {busy ? "Yuborilmoqda…" : "Savol yuborish"}
      </button>
    </div>
  );
}
