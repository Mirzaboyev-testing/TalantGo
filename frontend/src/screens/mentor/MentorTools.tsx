import { useCallback, useEffect, useState } from "react";
import { api, daysLeft, uzDate, type Challenge, type ChallengeEntry, type MentorTask, type Track } from "../../api";
import { Icon } from "../../icons";
import { haptic, openLink } from "../../tg";
import { ErrorText, message } from "../../ui";

const STATE_LABEL = { upcoming: ["Boshlanmagan", "todo"], active: ["Davom etmoqda", "peer_verified"], finished: ["Tugagan", "todo"] } as const;
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => { api.tracks().then(setTracks, () => {}); }, []);
  return tracks;
}

// --------------------------------------------------------------------------- tasks

export function MentorTasks() {
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
        <p className="hint" style={{ margin: 0 }}>Siz qo'shgan topshiriq tanlangan yo'nalishdagi talabalarga darhol ko'rinadi va ularga bot orqali xabar boradi.</p>
        <button className="btn small" onClick={() => setEditing("new")}><Icon name="plus" size={16} />Topshiriq</button>
      </div>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">Hali topshiriq qo'shmagansiz.</div>}
      {rows?.map((t) => (
        <div key={t.id} className="card" style={t.is_active ? undefined : { opacity: 0.55 }}>
          <div className="row between">
            <span className="hint">{t.track.split(":")[0]} · {t.week}-hafta · {t.points} ball</span>
            {!t.is_active && <span className="badge todo">Yashirilgan</span>}
          </div>
          <b>{t.title}</b>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn small ghost" onClick={() => setEditing(t)}>Tahrirlash</button>
            <button className="btn small ghost" onClick={() => api.mentor.editTask(t.id, { is_active: !t.is_active }).then(load, (e) => setError(message(e)))}>
              {t.is_active ? "Yashirish" : "Qayta ko'rsatish"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskForm({ tracks, task, onDone }: { tracks: Track[]; task?: MentorTask; onDone: () => void }) {
  const [f, setF] = useState({
    track_id: task ? String(task.track_id) : "", week: String(task?.week ?? 1), title: task?.title ?? "",
    description: task?.description ?? "", proof_hint: task?.proof_hint ?? "", points: String(task?.points ?? 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const body = { track_id: Number(f.track_id), week: Number(f.week), title: f.title.trim(), description: f.description.trim(),
                   proof_hint: f.proof_hint.trim(), points: Number(f.points) };
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
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />Orqaga</button>
      <h2>{task ? "Topshiriqni tahrirlash" : "Yangi topshiriq"}</h2>
      <div className="card">
        <label>Yo'nalish</label>
        <select value={f.track_id} disabled={!!task} onChange={set("track_id")}>
          <option value="">Tanlang…</option>
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <div className="row">
          <div className="grow"><label>Hafta</label><input value={f.week} inputMode="numeric" onChange={set("week")} /></div>
          <div className="grow"><label>Ball (1–50)</label><input value={f.points} inputMode="numeric" onChange={set("points")} /></div>
        </div>
        <label>Nomi</label>
        <input value={f.title} maxLength={160} placeholder="Masalan: SQL bilan savdo tahlili" onChange={set("title")} />
        <label>Nima qilish kerak</label>
        <textarea value={f.description} maxLength={4000} placeholder="Vazifa, ma'lumot manbasi, natija qanday bo'lishi kerak" onChange={set("description")} />
        <label>Isbot sifatida nima topshiriladi</label>
        <input value={f.proof_hint} maxLength={500} placeholder="Masalan: GitHub repo yoki Google Drive havolasi" onChange={set("proof_hint")} />
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 14 }} disabled={busy || !f.track_id || f.title.trim().length < 3 || f.description.trim().length < 10} onClick={save}>
          {busy ? "Saqlanmoqda…" : task ? "Saqlash" : "Qo'shish"}
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- challenges

export function MentorChallenges() {
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
        <p className="hint" style={{ margin: 0 }}>Muddatli musobaqa: talabalar ish topshiradi, siz baholab g'oliblarni belgilaysiz. 1–3-o'rinlar +30, +20, +10 bonus ball oladi.</p>
        <button className="btn small" onClick={() => setMode("new")}><Icon name="plus" size={16} />Chellenj</button>
      </div>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">Hali chellenj tashkil qilmagansiz.</div>}
      {rows?.map((c) => (
        <div key={c.id} className="card tap" onClick={() => setMode(c.id)}>
          <div className="row between">
            <span className="hint">{c.track?.split(":")[0] ?? "Barcha yo'nalishlar"} · {uzDate(c.ends_at)} gacha</span>
            <span className={`badge ${STATE_LABEL[c.state][1]}`}>{STATE_LABEL[c.state][0]}</span>
          </div>
          <b>{c.title}</b>
          <div className="hint" style={{ marginTop: 4 }}>
            {c.entries} ishtirokchi{c.to_review ? ` · ${c.to_review} ta baholanmagan` : ""}{c.prize ? ` · sovrin: ${c.prize}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChallengeForm({ tracks, onDone }: { tracks: Track[]; onDone: () => void }) {
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
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />Orqaga</button>
      <h2>Yangi chellenj</h2>
      <div className="card">
        <label>Nomi</label>
        <input value={f.title} maxLength={160} placeholder="Masalan: Power BI haftaligi" onChange={set("title")} />
        <label>Vazifa va baholash mezoni</label>
        <textarea value={f.description} maxLength={5000} rows={5}
                  placeholder="Nima qilish kerak, qanday ma'lumot bilan, nimaga qarab baholanadi" onChange={set("description")} />
        <label>Kimlar uchun</label>
        <select value={f.track_id} onChange={set("track_id")}>
          <option value="">Barcha yo'nalishlar</option>
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <div className="row">
          <div className="grow"><label>Boshlanishi</label><input type="date" value={f.starts_on} min={today()} onChange={set("starts_on")} /></div>
          <div className="grow"><label>Tugashi</label><input type="date" value={f.ends_on} min={f.starts_on} onChange={set("ends_on")} /></div>
        </div>
        <div className="row">
          <div className="grow"><label>Qatnashib qabul qilingan ish uchun ball</label><input value={f.points} inputMode="numeric" onChange={set("points")} /></div>
        </div>
        <label>Sovrin (ixtiyoriy)</label>
        <input value={f.prize} maxLength={300} placeholder="Masalan: hamkor kompaniyada amaliyot suhbati" onChange={set("prize")} />
        <p className="hint">E'lon qilinishi bilan tanlangan talabalarga bot orqali xabar boradi.</p>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 10 }} disabled={busy || f.title.trim().length < 3 || f.description.trim().length < 20} onClick={save}>
          {busy ? "E'lon qilinmoqda…" : "E'lon qilish"}
        </button>
      </div>
    </div>
  );
}

function Entries({ challenge, onBack }: { challenge: Challenge; onBack: () => void }) {
  const [rows, setRows] = useState<ChallengeEntry[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.mentor.entries(challenge.id).then(setRows, (e) => setError(message(e))), [challenge.id]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />Chellenjlar</button>
      <h2>{challenge.title}</h2>
      <p className="hint">
        {STATE_LABEL[challenge.state][0]} · {uzDate(challenge.ends_at)} gacha
        {challenge.state === "active" ? ` (${daysLeft(challenge.ends_at)} kun qoldi)` : ""} · har bir qabul qilingan ish {challenge.points} ball
      </p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">Hali hech kim ish topshirmagan.</div>}
      {rows?.map((e) => <EntryCard key={e.id} challengeId={challenge.id} entry={e} onDone={load} />)}
    </div>
  );
}

function EntryCard({ challengeId, entry, onDone }: { challengeId: number; entry: ChallengeEntry; onDone: () => void }) {
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

  const badge = entry.status === "accepted" ? ["Qabul qilingan", "peer_verified"] : entry.status === "rejected" ? ["Rad etilgan", "rejected"] : ["Baholanmagan", "pending"];
  return (
    <div className="card">
      <div className="row between">
        <b>{entry.student}</b>
        <span className={`badge ${badge[1]}`}>{entry.place ? `${entry.place}-o'rin` : badge[0]}</span>
      </div>
      <div className="hint">{[entry.university, entry.username && `@${entry.username}`].filter(Boolean).join(" · ")}</div>
      {entry.note && <p style={{ margin: "8px 0 0", whiteSpace: "pre-line" }}>{entry.note}</p>}
      <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => openLink(entry.proof_url)}>Ishni ochish</button>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="grow"><label>Baho (0–100)</label><input value={score} inputMode="numeric" onChange={(e) => setScore(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
        <div className="grow"><label>O'rin</label>
          <select value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">—</option><option value="1">1-o'rin (+30)</option><option value="2">2-o'rin (+20)</option><option value="3">3-o'rin (+10)</option>
          </select>
        </div>
      </div>
      <label>Izoh talabaga</label>
      <input value={comment} maxLength={1000} placeholder="Nima yaxshi, nimani yaxshilash mumkin" onChange={(e) => setComment(e.target.value)} />
      <ErrorText error={error} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn bad" disabled={busy} onClick={() => decide(false)}>Rad etish</button>
        <button className="btn ok" disabled={busy} onClick={() => decide(true)}>Qabul qilish</button>
      </div>
    </div>
  );
}
