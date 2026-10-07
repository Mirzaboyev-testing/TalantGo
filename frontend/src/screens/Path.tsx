import { useCallback, useEffect, useState } from "react";
import { api, type Me, type Task } from "../api";
import { haptic, openLink } from "../tg";
import { ErrorText, Sheet, StatusBadge, message } from "../ui";

export default function PathScreen({ me, onChanged, onChangeTrack }: { me: Me; onChanged: () => void; onChangeTrack: () => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [open, setOpen] = useState<Task | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api.tasks(me.track!.id).then(setTasks, (e) => setError(message(e))), [me.track]);
  useEffect(() => { void load(); }, [load]);

  const done = tasks?.filter((t) => t.submission && ["peer_verified", "mentor_verified"].includes(t.submission.status)).length ?? 0;

  return (
    <div>
      <div className="row between">
        <h1>{me.track!.icon} {me.track!.title}</h1>
      </div>
      <div className="stats">
        <div className="stat"><b>{me.points}</b><span>ball</span></div>
        <div className="stat"><b>{me.streak > 0 ? `🔥 ${me.streak}` : "0"}</b><span>kunlik seriya</span></div>
        <div className="stat"><b>#{me.rank_overall}</b><span>umumiy o'rin</span></div>
      </div>
      {tasks && (
        <p className="hint">{done} / {tasks.length} topshiriq tasdiqlangan · <a href="#" onClick={(e) => { e.preventDefault(); onChangeTrack(); }}>yo'lni o'zgartirish</a></p>
      )}
      <ErrorText error={error} />
      {!tasks && !error && <div className="hint">Yuklanmoqda…</div>}
      {tasks?.map((t) => (
        <div key={t.id} className="card tap" onClick={() => setOpen(t)}>
          <div className="row between">
            <span className="hint">{t.week}-hafta · {t.points} ball</span>
            <StatusBadge status={t.submission?.status ?? null} />
          </div>
          <b>{t.title}</b>
        </div>
      ))}
      {open && (
        <TaskSheet task={open} onClose={() => setOpen(null)}
                   onSubmitted={async () => { setOpen(null); await load(); onChanged(); }} />
      )}
    </div>
  );
}

function TaskSheet({ task, onClose, onSubmitted }: { task: Task; onClose: () => void; onSubmitted: () => void }) {
  const sub = task.submission;
  const canSubmit = !sub || sub.status === "rejected";
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    try {
      await api.submit(task.id, url.trim(), note.trim());
      haptic("success");
      onSubmitted();
    } catch (e) {
      haptic("error");
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="row between">
        <span className="hint">{task.week}-hafta · {task.points} ball</span>
        <StatusBadge status={sub?.status ?? null} />
      </div>
      <h1>{task.title}</h1>
      <div className="card">
        <p style={{ marginTop: 0 }}>{task.description}</p>
        <div className="hint"><b>Isbot:</b> {task.proof_hint}</div>
      </div>

      {sub && (
        <div className="card">
          <div className="row between">
            <b>Sizning ishingiz{sub.round > 1 ? ` (${sub.round}-urinish)` : ""}</b>
            <button className="btn small ghost" onClick={() => openLink(sub.proof_url)}>Ochish</button>
          </div>
          {sub.reviews.length === 0 && <p className="hint">Hali baholanmagan. Ikki tengdosh tasdiqlasa ball beriladi.</p>}
          {sub.reviews.map((r, i) => (
            <div key={i} className={`review ${r.approved ? "yes" : "no"}`}>
              <div className="hint">{r.reviewer_name}{r.kind === "mentor" ? " · mentor" : ""} · {r.approved ? "tasdiqladi" : "qaytardi"}</div>
              <div>{r.comment}</div>
            </div>
          ))}
        </div>
      )}

      {canSubmit && (
        <div className="card">
          <b>{sub ? "Qayta topshirish" : "Topshirish"}</b>
          <label>Isbot havolasi</label>
          <input value={url} placeholder="https://…" inputMode="url" onChange={(e) => setUrl(e.target.value)} />
          <label>Izoh (ixtiyoriy)</label>
          <textarea value={note} maxLength={1000} placeholder="Nima qildingiz, nimaga e'tibor berish kerak?" onChange={(e) => setNote(e.target.value)} />
          <ErrorText error={error} />
          <div style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy || url.trim().length < 10} onClick={send}>{busy ? "Yuborilmoqda…" : "Yuborish"}</button>
          </div>
        </div>
      )}
      <button className="btn ghost" onClick={onClose}>Yopish</button>
    </Sheet>
  );
}
