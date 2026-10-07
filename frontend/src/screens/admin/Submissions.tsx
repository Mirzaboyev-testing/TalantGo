import { useCallback, useEffect, useState } from "react";
import { api, type AdminSubmission, type Status } from "../../api";
import { openLink } from "../../tg";
import { ErrorText, StatusBadge, message } from "../../ui";

const FILTERS: [Status | "", string][] = [
  ["", "Hammasi"], ["pending", "Tekshiruvda"], ["peer_verified", "Tengdosh tasdig'i"],
  ["mentor_verified", "Mentor tasdig'i"], ["rejected", "Qaytarilgan"],
];

export default function Submissions({ user, onClearUser }: { user: { id: number; name: string } | null; onClearUser: () => void }) {
  const [status, setStatus] = useState<Status | "">("");
  const [items, setItems] = useState<AdminSubmission[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (user) params.user_id = String(user.id);
    setItems(null);
    api.admin.submissions(params).then(setItems, (e) => setError(message(e)));
  }, [status, user]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {user && (
        <div className="notice row between" style={{ marginBottom: 8 }}>
          <span>{user.name} ishlari</span>
          <button className="btn small ghost" onClick={onClearUser}>Hammasini ko'rsatish</button>
        </div>
      )}
      <div className="chips" style={{ marginBottom: 8 }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`chip ${status === id ? "on" : ""}`} onClick={() => setStatus(id)}>{label}</button>
        ))}
      </div>
      <p className="hint">Ishni tasdiqlash yoki qaytarish «Tekshirish» bo'limida qilinadi. Bu yerda nazorat qilasiz va ko'chirilgan yoki spam ishni o'chirasiz.</p>
      <ErrorText error={error} />
      {!items && !error && <div className="hint">Yuklanmoqda…</div>}
      {items?.length === 0 && <div className="hint">Ish yo'q</div>}
      {items?.map((s) => <SubmissionCard key={s.id} item={s} onDeleted={() => setItems((cur) => cur?.filter((x) => x.id !== s.id) ?? null)} />)}
    </div>
  );
}

function SubmissionCard({ item, onDeleted }: { item: AdminSubmission; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function remove() {
    try {
      await api.admin.deleteSubmission(item.id, reason.trim());
      onDeleted();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <span className="hint">{item.author_name} · {item.track_title}</span>
        <StatusBadge status={item.status} />
      </div>
      <b>{item.task_title}</b>
      <div className="hint">{item.points_awarded} ball · {item.round}-urinish · {new Date(item.updated_at).toLocaleDateString()}</div>
      {item.note && <div style={{ marginTop: 4 }}>«{item.note}»</div>}
      {item.reviews.map((r, i) => (
        <div key={i} className={`review ${r.approved ? "yes" : "no"}`}>
          <div className="hint">{r.reviewer_name}{r.kind === "mentor" ? " · mentor" : ""} · {r.approved ? "tasdiqladi" : "qaytardi"}</div>
          <div>{r.comment}</div>
        </div>
      ))}
      <div className="row wrap" style={{ marginTop: 8 }}>
        <button className="btn small ghost" onClick={() => openLink(item.proof_url)}>Isbotni ochish ↗</button>
        <button className="btn small ghost" onClick={() => setDeleting(!deleting)}>O'chirish</button>
      </div>
      {deleting && (
        <div style={{ marginTop: 8 }}>
          <input value={reason} placeholder="Sabab: masalan, boshqadan ko'chirilgan" onChange={(e) => setReason(e.target.value)} />
          <p className="hint">Berilgan {item.points_awarded} ball talabadan qaytarib olinadi. Amal jurnalga yoziladi.</p>
          <button className="btn small bad" disabled={reason.trim().length < 5} onClick={remove}>Butunlay o'chirish</button>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
