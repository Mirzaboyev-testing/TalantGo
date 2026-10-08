import { useCallback, useEffect, useState } from "react";
import { api, daysLeft, uzDate, type Challenge } from "../api";
import { haptic, openLink } from "../tg";
import { ErrorText, Sheet, message } from "../ui";

const ENTRY_LABEL = { submitted: ["Baholanmoqda", "pending"], accepted: ["Qabul qilindi", "peer_verified"], rejected: ["Qabul qilinmadi", "rejected"] } as const;

/** Mentors' challenges for the student's path and for everyone. */
export default function Challenges() {
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.challenges.list().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">Yuklanmoqda…</div>}
      {rows?.length === 0 && (
        <div className="card soft">
          <b>Hozircha chellenj yo'q</b>
          <p className="hint" style={{ marginBottom: 0 }}>Mentorlar chellenj e'lon qilganda shu yerda paydo bo'ladi va botdan xabar keladi.</p>
        </div>
      )}
      {rows?.map((c) => (
        <div key={c.id} className="card tap" onClick={() => setOpen(c.id)}>
          <div className="row between">
            <span className="hint">
              {c.state === "active" ? `${daysLeft(c.ends_at)} kun qoldi` : c.state === "upcoming" ? `${uzDate(c.starts_at)} dan boshlanadi` : "Tugagan"}
              {" · "}{c.entries} ishtirokchi
            </span>
            {c.my_entry ? <span className={`badge ${ENTRY_LABEL[c.my_entry.status][1]}`}>{c.my_entry.place ? `${c.my_entry.place}-o'rin` : ENTRY_LABEL[c.my_entry.status][0]}</span>
              : c.state === "active" ? <span className="badge peer_verified">Ochiq</span> : null}
          </div>
          <b>{c.title}</b>
          <div className="hint" style={{ marginTop: 4 }}>
            {c.points} ball{c.prize ? ` · sovrin: ${c.prize}` : ""}{c.mentor ? ` · mentor: ${c.mentor}` : ""}
          </div>
        </div>
      ))}
      {open !== null && <ChallengeSheet id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function ChallengeSheet({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [c, setC] = useState<Challenge | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.challenges.detail(id).then((d) => {
    setC(d);
    if (d.my_entry) { setUrl(d.my_entry.proof_url); setNote(d.my_entry.note); }
  }, (e) => setError(message(e))), [id]);
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    setBusy(true); setError("");
    try {
      await api.challenges.enter(id, url.trim(), note.trim());
      haptic("success");
      await load();
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  if (!c) return <Sheet onClose={onClose}><div className="hint">Yuklanmoqda…</div><ErrorText error={error} /></Sheet>;
  const canSubmit = c.state === "active" && (!c.my_entry || c.my_entry.status === "submitted");

  return (
    <Sheet onClose={onClose}>
      <span className="hint">{c.track?.split(":")[0] ?? "Barcha yo'nalishlar"}{c.mentor ? ` · mentor: ${c.mentor}` : ""}</span>
      <h1>{c.title}</h1>
      <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat"><b>{c.state === "active" ? daysLeft(c.ends_at) : 0}</b><span>kun qoldi</span></div>
        <div className="stat"><b>{c.points}</b><span>ball</span></div>
        <div className="stat"><b>{c.entries}</b><span>ishtirokchi</span></div>
      </div>
      {c.prize && <p className="notice">Sovrin: {c.prize}. G'oliblar qo'shimcha ball oladi: 1-o'rin +30, 2-o'rin +20, 3-o'rin +10.</p>}
      <div className="card">
        <b>Vazifa</b>
        <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{c.description}</p>
        <div className="hint" style={{ marginTop: 8 }}>{uzDate(c.starts_at)} – {uzDate(c.ends_at)}</div>
      </div>

      {c.my_entry && c.my_entry.status !== "submitted" && (
        <div className="card">
          <div className="row between"><b>Sizning natijangiz</b>
            <span className={`badge ${ENTRY_LABEL[c.my_entry.status][1]}`}>{c.my_entry.place ? `${c.my_entry.place}-o'rin` : ENTRY_LABEL[c.my_entry.status][0]}</span></div>
          <div className="hint">{c.my_entry.score != null ? `Baho: ${c.my_entry.score}/100 · ` : ""}+{c.my_entry.points_awarded} ball</div>
          {c.my_entry.comment && <div className="review yes">{c.my_entry.comment}</div>}
        </div>
      )}

      {canSubmit && (
        <div className="card">
          <b>{c.my_entry ? "Ishingizni yangilash" : "Ishtirok etish"}</b>
          <p className="hint">{c.my_entry ? "Mentor baholaguncha havolani yangilashingiz mumkin." : "Ishingiz havolasini yuboring: GitHub, Google Drive, Kaggle va hokazo."}</p>
          <label>Ish havolasi</label>
          <input value={url} placeholder="https://…" inputMode="url" onChange={(e) => setUrl(e.target.value)} />
          <label>Izoh (ixtiyoriy)</label>
          <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <ErrorText error={error} />
          <button className="btn" style={{ marginTop: 10 }} disabled={busy || url.trim().length < 10} onClick={submit}>
            {busy ? "Yuborilmoqda…" : c.my_entry ? "Yangilash" : "Yuborish"}
          </button>
        </div>
      )}

      {c.results && c.results.length > 0 && (
        <div className="card">
          <b>Natijalar</b>
          {c.results.map((r, i) => (
            <div key={i} className="lb-row">
              <div className={`lb-rank ${r.place ? "top" : ""}`}>{r.place ?? "–"}</div>
              <div className="grow">{r.student}</div>
              {r.score != null && <span className="hint">{r.score}/100</span>}
            </div>
          ))}
        </div>
      )}
      {c.my_entry && <button className="btn ghost" style={{ marginBottom: 8 }} onClick={() => openLink(c.my_entry!.proof_url)}>Yuborgan ishimni ochish</button>}
      <button className="btn ghost" onClick={onClose}>Yopish</button>
    </Sheet>
  );
}
