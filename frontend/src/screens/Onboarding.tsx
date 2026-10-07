import { useEffect, useState } from "react";
import { api, type Me, type Track } from "../api";
import { ErrorText, message } from "../ui";

export const GOAL_SUGGESTIONS: Record<string, string[]> = {
  "data-analytics": ["Excel", "SQL", "Power BI", "Data Analyst"],
  econometrics: ["Stata", "R", "Statistika", "Tadqiqot"],
  "machine-learning": ["Python", "ML", "Kaggle", "Data Science"],
  finance: ["Moliyaviy model", "Investitsiya", "Startap", "Biznes tahlil"],
  backend: ["Python", "FastAPI", "SQL", "Backend Developer"],
};

export default function Onboarding({ me, onDone, onCancel }: { me: Me; onDone: () => void; onCancel?: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState<number | null>(me.track?.id ?? null);
  const [group, setGroup] = useState(me.group_name);
  const [university, setUniversity] = useState(me.university);
  const [goals, setGoals] = useState<string[]>(me.goals);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api.tracks().then(setTracks, (e) => setError(message(e))); }, []);

  const chosen = tracks.find((t) => t.id === trackId);
  const suggestions = chosen ? GOAL_SUGGESTIONS[chosen.slug] ?? [] : [];
  const toggle = (g: string) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].slice(0, 8)));

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.updateMe({ track_id: trackId, group_name: group.trim(), university: university.trim(), goals });
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>{me.track ? "Yo'lni o'zgartirish" : `Salom, ${me.full_name.split(" ")[0]}!`}</h1>
      <p className="hint">
        Yo'lingizni tanlang. Har hafta bitta topshiriq bajarasiz, tengdoshlar va mentor uni tasdiqlaydi,
        tasdiqlangan ishlar esa CV'ingizga tushadi.
      </p>

      <h2>1. Yo'nalish</h2>
      {tracks.map((t) => (
        <div key={t.id} className={`card tap ${t.id === trackId ? "selected" : ""}`} onClick={() => setTrackId(t.id)}>
          <div className="row"><span style={{ fontSize: 24 }}>{t.icon}</span><b>{t.title}</b></div>
          <div className="hint" style={{ marginTop: 4 }}>{t.description}</div>
        </div>
      ))}

      {chosen && (
        <>
          <h2>2. Guruh</h2>
          <div className="card">
            <label>Guruh (masalan, MM-21)</label>
            <input value={group} maxLength={40} onChange={(e) => setGroup(e.target.value)} />
            <label>Universitet</label>
            <input value={university} maxLength={120} placeholder="TDIU, TATU, WIUT…" onChange={(e) => setUniversity(e.target.value)} />
          </div>

          <h2>3. Maqsadlar</h2>
          <p className="hint">Shu maqsaddagi tengdoshlarni topishga yordam beradi.</p>
          <div className="chips">
            {[...new Set([...suggestions, ...goals])].map((g) => (
              <button key={g} className={`chip ${goals.includes(g) ? "on" : ""}`} onClick={() => toggle(g)}>{g}</button>
            ))}
          </div>
        </>
      )}

      <ErrorText error={error} />
      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn" disabled={!trackId || !group.trim() || busy} onClick={save}>
          {busy ? "Saqlanmoqda…" : "Boshlash"}
        </button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Bekor qilish</button>}
      </div>
    </div>
  );
}
