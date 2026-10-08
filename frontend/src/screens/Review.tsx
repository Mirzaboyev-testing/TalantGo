import { useCallback, useEffect, useState } from "react";
import { api, type Me, type QueueItem, type Rules } from "../api";
import { haptic, openLink } from "../tg";
import { ErrorText, StatusBadge, message } from "../ui";
import { MentorChallenges, MentorTasks } from "./mentor/MentorTools";

export default function ReviewScreen({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [view, setView] = useState<"queue" | "tasks" | "challenges">("queue");
  const isMentor = me.role !== "student";
  if (!isMentor) return <Queue me={me} onChanged={onChanged} />;
  return (
    <div>
      <h1>Mentor paneli</h1>
      <div className="segmented">
        <button className={view === "queue" ? "on" : ""} onClick={() => setView("queue")}>Tekshirish</button>
        <button className={view === "tasks" ? "on" : ""} onClick={() => setView("tasks")}>Topshiriqlar</button>
        <button className={view === "challenges" ? "on" : ""} onClick={() => setView("challenges")}>Chellenjlar</button>
      </div>
      {view === "queue" && <Queue me={me} onChanged={onChanged} embedded />}
      {view === "tasks" && <MentorTasks />}
      {view === "challenges" && <MentorChallenges />}
    </div>
  );
}

function Queue({ me, onChanged, embedded = false }: { me: Me; onChanged: () => void; embedded?: boolean }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<Rules | null>(null);
  const isMentor = me.role !== "student";
  useEffect(() => { api.rules().then(setRules, () => {}); }, []);

  const load = useCallback(() => api.queue().then(setItems, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      {!embedded && <h1>Tekshirish</h1>}
      <p className="notice">
        {isMentor
          ? "Siz mentorsiz: tasdig'ingiz ishga eng yuqori ishonch darajasini beradi va 50% bonus qo'shadi. Rad etsangiz, berilgan ball qaytarib olinadi."
          : `Yo'lingizdagi tengdoshlar ishini tekshiring. Har bir yozma baho uchun +${rules?.review_points ?? 2} ball. ` +
            `${rules?.peer_approvals_required ?? 1} ta tasdiq yig'ilsa, ish portfolioga tushadi.`}
      </p>
      <ErrorText error={error} />
      {!items && !error && <div className="hint">Yuklanmoqda…</div>}
      {items?.length === 0 && <div className="center hint">Hozircha tekshiriladigan ish yo'q</div>}
      {items?.map((it) => (
        <ReviewCard key={it.submission_id} item={it} onDone={async () => { await load(); onChanged(); }} />
      ))}
    </div>
  );
}

function ReviewCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(approved: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.review(item.submission_id, approved, comment.trim());
      haptic("success");
      onDone();
    } catch (e) {
      haptic("error");
      setError(message(e));
      setBusy(false);
    }
  }

  const tooShort = comment.trim().length < 10;
  return (
    <div className="card">
      <div className="row between">
        <span className="hint">{item.author_name} · {item.track_title}</span>
        <StatusBadge status={item.status} />
      </div>
      <b>{item.task_title}</b>
      <div className="hint" style={{ marginTop: 4 }}>Nimani tekshirish kerak: {item.proof_hint}</div>
      {item.note && <div style={{ marginTop: 6 }}>«{item.note}»</div>}
      <div style={{ margin: "10px 0" }}>
        <button className="btn ghost" onClick={() => openLink(item.proof_url)}>Isbotni ochish</button>
      </div>
      <textarea value={comment} maxLength={1000} placeholder="Fikringiz: nima yaxshi, nima yetishmaydi (kamida 10 belgi)"
                onChange={(e) => setComment(e.target.value)} />
      <ErrorText error={error} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn bad" disabled={busy || tooShort} onClick={() => decide(false)}>Qaytarish</button>
        <button className="btn ok" disabled={busy || tooShort} onClick={() => decide(true)}>Tasdiqlash</button>
      </div>
    </div>
  );
}
