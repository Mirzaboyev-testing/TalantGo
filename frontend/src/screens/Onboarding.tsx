import { useEffect, useState } from "react";
import { api, type Me, type Track, type University } from "../api";
import { ErrorText, message } from "../ui";
import { Consent } from "./Consent";

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
  const [unis, setUnis] = useState<University[]>([]);
  const [uniId, setUniId] = useState(me.university_ref ? String(me.university_ref.id) : "");
  const [faculty, setFaculty] = useState(me.faculty);
  const [course, setCourse] = useState(me.course ? String(me.course) : "");
  const [consent, setConsent] = useState(me.has_consent);
  const [goals, setGoals] = useState<string[]>(me.goals);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.tracks().then(setTracks, (e) => setError(message(e)));
    api.universities().then(setUnis, () => {});
  }, []);

  const chosen = tracks.find((t) => t.id === trackId);
  const suggestions = chosen ? GOAL_SUGGESTIONS[chosen.slug] ?? [] : [];
  const toggle = (g: string) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].slice(0, 8)));

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.updateMe({
        track_id: trackId, group_name: group.trim(), goals, consent: true,
        university_id: uniId ? Number(uniId) : null, faculty: faculty.trim(), course: course ? Number(course) : null,
      });
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
          <h2>2. O'qish joyi</h2>
          <div className="card">
            <label>Universitet</label>
            <select value={uniId} onChange={(e) => setUniId(e.target.value)}>
              <option value="">Tanlang…</option>
              {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} · {u.name}</option>)}
            </select>
            <div className="hint">Ro'yxatda yo'q bo'lsa, adminga yozing: qo'shib qo'yamiz.</div>
            <label>Fakultet</label>
            <input value={faculty} maxLength={120} placeholder="Masalan: Iqtisodiyot" onChange={(e) => setFaculty(e.target.value)} />
            <div className="row">
              <div className="grow"><label>Kurs</label>
                <select value={course} onChange={(e) => setCourse(e.target.value)}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c}-kurs</option>)}
                  <option value="7">Magistratura</option>
                </select>
              </div>
              <div className="grow"><label>Guruh</label>
                <input value={group} maxLength={40} placeholder="MM-21" onChange={(e) => setGroup(e.target.value)} />
              </div>
            </div>
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

      {chosen && !me.has_consent && <Consent value={consent} onChange={setConsent} />}
      <ErrorText error={error} />
      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn" disabled={!trackId || !group.trim() || !uniId || !consent || busy} onClick={save}>
          {busy ? "Saqlanmoqda…" : "Boshlash"}
        </button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Bekor qilish</button>}
      </div>
    </div>
  );
}
