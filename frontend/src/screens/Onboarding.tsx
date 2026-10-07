import { useEffect, useState } from "react";
import { api, type Me, type Track, type University } from "../api";
import { ErrorText, message } from "../ui";
import { Consent } from "./Consent";
import PhoneField from "./PhoneField";

export const GOAL_SUGGESTIONS: Record<string, string[]> = {
  "data-analytics": ["Excel", "SQL", "Power BI", "Data Analyst"],
  econometrics: ["Stata", "R", "Statistika", "Tadqiqot"],
  "machine-learning": ["Python", "ML", "Kaggle", "Data Science"],
  finance: ["Moliyaviy model", "Investitsiya", "Startap", "Biznes tahlil"],
  backend: ["Python", "FastAPI", "SQL", "Backend Developer"],
};

/** Everything a student profile needs before the app is useful: path, study place, phone.
 *  Also shown to earlier users whose profile misses any of these. */
export default function Onboarding({ me, onDone, onCancel, onMe }: {
  me: Me; onDone: () => void; onCancel?: () => void; onMe: (m: Me) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState<number | null>(me.track?.id ?? null);
  const [unis, setUnis] = useState<University[]>([]);
  const [uniId, setUniId] = useState(me.university_ref ? String(me.university_ref.id) : "");
  const [faculty, setFaculty] = useState(me.faculty);
  const [course, setCourse] = useState(me.course ? String(me.course) : "");
  const [consent, setConsent] = useState(me.has_consent);
  const [goals, setGoals] = useState<string[]>([...new Set([...me.skills, ...me.goals])]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.tracks().then(setTracks, (e) => setError(message(e)));
    api.universities().then(setUnis, () => {});
  }, []);

  const chosen = tracks.find((t) => t.id === trackId);
  const suggestions = chosen ? GOAL_SUGGESTIONS[chosen.slug] ?? [] : [];
  const toggle = (g: string) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].slice(0, 8)));
  const ready = Boolean(trackId && uniId && faculty.trim().length >= 2 && course && me.phone && consent);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.updateMe({
        track_id: trackId, goals, skills: [...new Set([...me.skills, ...goals])].slice(0, 20), consent: true, university_id: Number(uniId), faculty: faculty.trim(),
        course: Number(course),
      });
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  const returning = Boolean(me.track) && !onCancel;
  return (
    <div>
      <h1>{onCancel ? "Yo'lni o'zgartirish" : returning ? "Profilingizni to'ldiring" : `Salom, ${me.full_name.split(" ")[0]}!`}</h1>
      <p className="hint">
        {returning
          ? "Ilovaga yangi imkoniyatlar qo'shildi: amaliyot va ish e'lonlari. Buning uchun bir nechta ma'lumot kerak."
          : "Yo'lingizni tanlang. Har hafta bitta topshiriq bajarasiz, tengdoshlar va mentor uni tasdiqlaydi, tasdiqlangan ishlar esa CV'ingizga tushadi."}
      </p>

      <h2>1. Qaysi yo'nalishda rivojlanmoqchisiz</h2>
      {tracks.map((t) => (
        <div key={t.id} className={`card tap ${t.id === trackId ? "selected" : ""}`} onClick={() => setTrackId(t.id)}>
          <div className="row"><span style={{ fontSize: 24 }}>{t.icon}</span><b>{t.title}</b></div>
          <div className="hint" style={{ marginTop: 4 }}>{t.description}</div>
        </div>
      ))}

      <h2>2. Qayerda o'qiysiz</h2>
      <div className="card">
        <label>Universitet</label>
        <select value={uniId} onChange={(e) => setUniId(e.target.value)}>
          <option value="">Tanlang…</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} · {u.name}</option>)}
        </select>
        <div className="hint">Ro'yxatda yo'q bo'lsa, adminga yozing: qo'shib qo'yamiz.</div>
        <label>Universitetdagi yo'nalishingiz (mutaxassislik)</label>
        <input value={faculty} maxLength={120} placeholder="Masalan: Iqtisodiyot, Menejment, Dasturiy injiniring" onChange={(e) => setFaculty(e.target.value)} />
        <label>Kurs</label>
        <select value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">Tanlang…</option>
          {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c}-kurs</option>)}
          <option value="7">Magistratura</option>
        </select>
      </div>

      <h2>3. Telefon raqamingiz</h2>
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>Amaliyot va ish bo'yicha kompaniyalar siz bilan bog'lanishi uchun kerak.</p>
        <PhoneField me={me} onChanged={onMe} />
      </div>

      {chosen && suggestions.length > 0 && (
        <>
          <h2>4. Qaysi ko'nikmalarni o'rganyapsiz</h2>
          <p className="hint">Shu ko'nikmadagi tengdoshlarni va mos vakansiyalarni topishga yordam beradi.</p>
          <div className="chips">
            {[...new Set([...suggestions, ...goals])].map((g) => (
              <button key={g} className={`chip ${goals.includes(g) ? "on" : ""}`} onClick={() => toggle(g)}>{g}</button>
            ))}
          </div>
        </>
      )}

      {!me.has_consent && <Consent value={consent} onChange={setConsent} />}
      <ErrorText error={error} />
      {!ready && (
        <p className="hint" style={{ marginTop: 12 }}>
          To'ldirilmagan: {[!trackId && "yo'nalish", !uniId && "universitet", faculty.trim().length < 2 && "mutaxassislik",
                            !course && "kurs", !me.phone && "telefon", !consent && "rozilik"].filter(Boolean).join(", ")}
        </p>
      )}
      <div className="stack" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!ready || busy} onClick={save}>{busy ? "Saqlanmoqda…" : returning ? "Saqlash" : "Boshlash"}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Bekor qilish</button>}
      </div>
    </div>
  );
}
