import { useEffect, useState } from "react";
import { api, JOB_KIND, VERIFICATION_LABEL, type JobKind, type Me, type University } from "../api";
import { haptic } from "../tg";
import { ErrorText, message, toast } from "../ui";

const MISSING_LABEL: Record<string, string> = {
  university: "universitet", faculty: "fakultet", course: "kurs", track: "yo'nalish", skills: "kamida 3 ko'nikma",
  languages: "tillar", job_types: "qanday ish qidirasiz", verification: "talabalik tasdig'i",
};
const LANGUAGE_HINTS = ["O'zbek (ona tili)", "Rus B2", "Ingliz B1", "Ingliz B2", "Ingliz C1", "Koreys TOPIK 3", "Nemis B1"];

const split = (v: string) => v.split(",").map((x) => x.trim()).filter((x) => x.length >= 2);

export default function CareerProfile({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  const [unis, setUnis] = useState<University[]>([]);
  const [f, setF] = useState({
    university_id: me.university_ref ? String(me.university_ref.id) : "", faculty: me.faculty,
    course: me.course ? String(me.course) : "", graduation_year: me.graduation_year ? String(me.graduation_year) : "",
    gpa: me.gpa != null ? String(me.gpa) : "", gpa_scale: String(me.gpa_scale), student_number: me.student_number,
    skills: me.skills.join(", "), languages: me.languages.join(", "), city: me.city,
  });
  const [jobTypes, setJobTypes] = useState<JobKind[]>(me.job_types);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.universities().then(setUnis, () => {}); }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.value });
  };

  async function run(action: () => Promise<Me>, done = "Ma'lumotlar saqlandi") {
    setBusy(true); setError("");
    try {
      onSaved(await action());
      haptic("success");
      setSaved(true);
      toast(done);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => api.updateMe({
    university_id: f.university_id ? Number(f.university_id) : null, faculty: f.faculty.trim(),
    course: f.course ? Number(f.course) : null, graduation_year: f.graduation_year ? Number(f.graduation_year) : null,
    gpa: f.gpa ? Number(f.gpa.replace(",", ".")) : null, gpa_scale: Number(f.gpa_scale),
    student_number: f.student_number.trim(), skills: split(f.skills), languages: split(f.languages),
    job_types: jobTypes, city: f.city.trim(),
  }));

  const pct = me.completeness.percent;
  return (
    <>
      <div className="card">
        <div className="row between">
          <b>Ish beruvchilar uchun profil</b>
          <span className={`badge ${me.verification === "verified" ? "peer_verified" : me.verification === "pending" ? "pending" : me.verification === "rejected" ? "rejected" : "todo"}`}>
            {VERIFICATION_LABEL[me.verification]}
          </span>
        </div>
        <div className="progress" style={{ margin: "10px 0 6px" }}><div style={{ width: `${pct}%` }} /></div>
        <div className="hint">
          Profil {pct}% to'ldirilgan.{me.completeness.missing.length > 0 && ` Qolgani: ${me.completeness.missing.map((m) => MISSING_LABEL[m] ?? m).join(", ")}.`}
        </div>
        {me.verification === "verified" && <p className="hint">Tasdiqlagan: {me.verified_by}</p>}
        {me.verification === "pending" && <p className="notice" style={{ marginTop: 10 }}>So'rovingiz adminga yuborildi. Tasdiqlangach shu yerda «Talabalik tasdiqlangan» belgisi chiqadi.</p>}
        {me.verification === "rejected" && <p className="error">Rad etildi: {me.verification_note || "sabab ko'rsatilmagan"}. Ma'lumotni tuzatib, qayta yuboring.</p>}

        <label className="row between" style={{ color: "var(--text)", marginTop: 12, cursor: "pointer" }}>
          <span><b>Ish va amaliyotga tayyorman</b><div className="hint">Yoqilsa, kompaniyalar sizni ismingizsiz, anonim kartochka sifatida topadi</div></span>
          <input type="checkbox" checked={me.open_to_work} style={{ width: 22, height: 22, flex: "none" }}
                 onChange={(e) => run(() => api.updateMe({ open_to_work: e.target.checked }),
                   e.target.checked ? "Kompaniyalar endi sizni topa oladi" : "Profilingiz kompaniyalardan yashirildi")} />
        </label>
      </div>

      <div className="card">
        <b>O'qish</b>
        <label>Universitet</label>
        <select value={f.university_id} onChange={set("university_id")}>
          <option value="">Tanlang…</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} · {u.name}</option>)}
        </select>
        <label>Fakultet / yo'nalish</label>
        <input value={f.faculty} maxLength={120} onChange={set("faculty")} />
        <div className="row">
          <div className="grow"><label>Kurs</label>
            <select value={f.course} onChange={set("course")}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c}-kurs</option>)}
              <option value="7">Magistratura</option>
            </select>
          </div>
          <div className="grow"><label>Bitirish yili</label>
            <input value={f.graduation_year} inputMode="numeric" maxLength={4} placeholder="2027" onChange={set("graduation_year")} />
          </div>
        </div>
        <label>Talaba ID, HEMIS'dagi talaba raqami (ixtiyoriy)</label>
        <input value={f.student_number} maxLength={32} onChange={set("student_number")} />
        <div className="hint">Faqat universitetingiz karyera markazi va admin ko'radi. Ish beruvchilarga ko'rsatilmaydi.</div>
        <div className="row">
          <div className="grow"><label>O'rtacha baho, GPA (ixtiyoriy)</label>
            <input value={f.gpa} inputMode="decimal" placeholder="4.2" onChange={set("gpa")} />
          </div>
          <div style={{ width: 110 }}><label>Shkala</label>
            <select value={f.gpa_scale} onChange={set("gpa_scale")}><option value="5">5 ballik</option><option value="4">4 ballik</option></select>
          </div>
        </div>
        <div className="hint">GPA'ni yozsangiz, u ish beruvchilarga ko'rinadi. Yozmasangiz, ko'rinmaydi.</div>
      </div>

      <div className="card">
        <b>Ko'nikmalar va istaklar</b>
        <label>Ko'nikmalar (vergul bilan)</label>
        <input value={f.skills} placeholder="Excel, SQL, Power BI, Python" onChange={set("skills")} />
        <label>Tillar (vergul bilan)</label>
        <input value={f.languages} placeholder="Ingliz B2, Rus B1" onChange={set("languages")} />
        <div className="chips" style={{ marginTop: 6 }}>
          {LANGUAGE_HINTS.filter((l) => !split(f.languages).includes(l)).slice(0, 5).map((l) => (
            <button key={l} className="chip" onClick={() => setF({ ...f, languages: [...split(f.languages), l].join(", ") })}>+ {l}</button>
          ))}
        </div>
        <label>Qanday ish qidiryapsiz</label>
        <div className="chips">
          {(Object.keys(JOB_KIND) as JobKind[]).map((k) => (
            <button key={k} className={`chip ${jobTypes.includes(k) ? "on" : ""}`}
                    onClick={() => { setSaved(false); setJobTypes(jobTypes.includes(k) ? jobTypes.filter((x) => x !== k) : [...jobTypes, k]); }}>
              {JOB_KIND[k]}
            </button>
          ))}
        </div>
        <label>Shahar</label>
        <input value={f.city} maxLength={60} placeholder="Toshkent" onChange={set("city")} />
        <ErrorText error={error} />
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={save}>{saved ? "Saqlandi" : "Saqlash"}</button>
          {(me.verification === "none" || me.verification === "rejected") && (
            <button className="btn ok" disabled={busy} onClick={() => run(api.requestVerification, "So'rov yuborildi. Admin tasdiqlagach «Talabalik tasdiqlangan» belgisi chiqadi")}>Talabalikni tasdiqlashga yuborish</button>
          )}
        </div>
        <p className="hint">
          Tasdiqlashni universitetingiz karyera markazi yoki CareerFlow admini HEMIS ma'lumotlari bo'yicha qiladi.
          Tasdiqdan keyin universitet, fakultet yoki talaba ID o'zgarsa, qayta tasdiqlash kerak bo'ladi.
        </p>
      </div>

      <AnonymousPreview me={me} />
    </>
  );
}

function AnonymousPreview({ me }: { me: Me }) {
  return (
    <div className="card">
      <b>Kompaniyalar sizni shunday ko'radi</b>
      <p className="hint">Ismingiz, rasmingiz va Telegram'ingiz siz ariza topshirmaguningizcha yoki rozilik bermaguningizcha yashirin turadi.</p>
      <div className="card" style={{ background: "var(--bg2)", marginBottom: 0 }}>
        <div className="row between">
          <b>Talaba T-{String(me.id).padStart(5, "0")}</b>
          {me.verification === "verified" && <span className="badge peer_verified">Tasdiqlangan</span>}
        </div>
        <div className="hint">
          {[me.university_ref?.short_name, me.faculty, me.course && `${me.course}-kurs`].filter(Boolean).join(" · ") || "Universitet ko'rsatilmagan"}
        </div>
        <div className="hint">{me.track?.title} · {me.points} ball</div>
        {me.skills.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{me.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
      </div>
    </div>
  );
}
