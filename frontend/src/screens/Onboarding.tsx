import { useEffect, useState } from "react";
import { api, JOB_KIND, loadCatalog, type Catalog, type JobKind, type Me, type Track, type University } from "../api";
import { Field, Req, useRequired, type Check } from "../form";
import { haptic } from "../tg";
import { ErrorText, isFullName, message, toast } from "../ui";
import { Consent } from "./Consent";
import PhoneField from "./PhoneField";
import { TrackMark } from "../icons";

export const GOAL_SUGGESTIONS: Record<string, string[]> = {
  "data-analytics": ["Excel", "SQL", "Power BI", "Data Analyst"],
  econometrics: ["Stata", "R", "Statistika", "Tadqiqot"],
  "machine-learning": ["Python", "ML", "Kaggle", "Data Science"],
  finance: ["Moliyaviy model", "Investitsiya", "Startap", "Biznes tahlil"],
  backend: ["Python", "FastAPI", "SQL", "Backend Developer"],
};
const LANGUAGE_HINTS = ["O'zbek (ona tili)", "Rus B2", "Ingliz B1", "Ingliz B2", "Ingliz C1"];
const split = (v: string) => v.split(",").map((x) => x.trim()).filter((x) => x.length >= 2);

/** Job seeker (student) sign-up: one page, required fields starred. Also shown to earlier users whose
 *  profile misses a field that is now required, and when a student changes their path. */
export default function Onboarding({ me, onDone, onCancel, onMe }: {
  me: Me; onDone: () => void; onCancel?: () => void; onMe: (m: Me) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [unis, setUnis] = useState<University[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [f, setF] = useState({
    full_name: me.full_name, faculty: me.faculty, course: me.course ? String(me.course) : "", group: me.group_name,
    uni: me.university_ref ? String(me.university_ref.id) : "", otherUni: "",
    skills: me.skills.join(", "), languages: me.languages.join(", "), city: me.city,
    graduation_year: me.graduation_year ? String(me.graduation_year) : "", gpa: me.gpa != null ? String(me.gpa) : "",
    bio: me.bio, github: me.github_url, linkedin: me.linkedin_url, hemis: me.student_number,
  });
  const [trackId, setTrackId] = useState<number | null>(me.track?.id ?? null);
  const [industries, setIndustries] = useState<string[]>(me.work_industries);
  const [jobTypes, setJobTypes] = useState<JobKind[]>(me.job_types);
  const [consent, setConsent] = useState(me.consent_current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls, groupCls } = useRequired();
  const seeker = me.role === "student";                  // mentors are not looking for work

  useEffect(() => {
    api.tracks().then(setTracks, (e) => setError(message(e)));
    api.universities().then(setUnis, () => {});
    loadCatalog().then(setCatalog, () => {});
  }, []);

  const set = (k: keyof typeof f, id?: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (id) clear(id);
  };
  const toggle = <T,>(list: T[], value: T, max = 8) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value].slice(0, max));
  const chosen = tracks.find((t) => t.id === trackId);
  const suggestions = chosen ? GOAL_SUGGESTIONS[chosen.slug] ?? [] : [];
  const skillList = split(f.skills);

  async function save() {
    const checks: Check[] = [
      ["f-name", isFullName(f.full_name), "ism va familiya"],
      ["f-phone", Boolean(me.phone), "telefon raqam"],
      ["f-uni", f.uni === "other" ? f.otherUni.trim().length >= 3 : Boolean(f.uni), "universitet"],
      ["f-faculty", f.faculty.trim().length >= 2, "fakultet / mutaxassislik"],
      ["f-course", Boolean(f.course), "kurs"],
      ["f-group", f.group.trim().length >= 2, "guruh"],
      ["f-track", Boolean(trackId), "TalantGo yo'nalishi"],
      ...(seeker ? [["f-industries", industries.length > 0, "qaysi sohada ishlamoqchisiz"] as Check,
                    ["f-jobtypes", jobTypes.length > 0, "qanday ish izlayapsiz"] as Check] : []),
      ["f-consent", consent, "shaxsiy ma'lumotlarga rozilik"],
    ];
    if (!check(checks)) return;
    setBusy(true); setError("");
    try {
      const universityId = f.uni === "other" ? (await api.addUniversity(f.otherUni.trim())).id : Number(f.uni);
      const gpa = f.gpa.trim() ? Number(f.gpa.replace(",", ".")) : null;
      const saved = await api.updateMe({
        full_name: f.full_name.trim(), university_id: universityId, faculty: f.faculty.trim(), course: Number(f.course),
        group_name: f.group.trim().toUpperCase(), track_id: trackId, consent: true,
        ...(seeker ? { work_industries: industries, job_types: jobTypes, open_to_work: true } : {}),
        skills: skillList.slice(0, 20), languages: split(f.languages).slice(0, 6), city: f.city.trim(),
        graduation_year: f.graduation_year ? Number(f.graduation_year) : null,
        gpa: gpa != null && !Number.isNaN(gpa) ? gpa : null, bio: f.bio.trim(), github_url: f.github.trim(),
        linkedin_url: f.linkedin.trim(), student_number: f.hemis.trim(),
      });
      onMe(saved);
      haptic("success");
      toast("Ma'lumotlar saqlandi. Ularni «Profil» bo'limida ko'rasiz.");
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  const returning = Boolean(me.track) && !onCancel;
  return (
    <div>
      <h1>{onCancel ? "Profilni tahrirlash" : returning ? "Profilingizni to'ldiring" : "Ish izlovchi sifatida ro'yxatdan o'tish"}</h1>
      <p className="hint">
        {returning
          ? "Ro'yxatdan o'tish formasi yangilandi. Qizil yulduzcha bilan belgilangan maydonlarni to'ldiring."
          : "Ma'lumotlaringiz «Profil» bo'limida saqlanadi va tasdiqlangan ish beruvchilarga ko'rinadi."}
      </p>
      <p className="form-note"><Req />belgisi bor maydonlar majburiy.</p>

      <h2>1. Shaxsiy ma'lumotlar</h2>
      <div className="card">
        <Field id="f-name" label="Ism va familiya" required error={errors["f-name"] && "Ism va familiyani to'liq yozing"}>
          <input id="f-name" className={cls("f-name")} value={f.full_name} maxLength={128} placeholder="Masalan: Aziza Karimova"
                 onChange={set("full_name", "f-name")} />
        </Field>
        <div id="f-phone" tabIndex={-1} className={groupCls("f-phone")} style={{ marginTop: 12 }}>
          <label style={{ marginTop: 0 }}>Telefon raqam<Req /></label>
          <PhoneField me={me} onChanged={(m) => { onMe(m); if (m.phone) clear("f-phone"); }} />
          {errors["f-phone"] && <div className="field-error">Telefon raqamni kiriting yoki Telegram orqali ulashing</div>}
        </div>
      </div>

      <h2>2. O'qish joyi</h2>
      <div className="card">
        <Field id="f-uni" label="Universitet" required error={errors["f-uni"] && "Universitetni tanlang"}>
          <select id="f-uni" className={cls("f-uni")} value={f.uni} onChange={set("uni", "f-uni")}>
            <option value="">Tanlang…</option>
            {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name === u.name ? u.name : `${u.short_name} · ${u.name}`}</option>)}
            <option value="other">Ro'yxatda yo'q: o'zim yozaman</option>
          </select>
          {f.uni === "other" && (
            <input className={cls("f-uni")} value={f.otherUni} maxLength={200} placeholder="Universitetingizning to'liq nomi"
                   style={{ marginTop: 8 }} onChange={set("otherUni", "f-uni")} />
          )}
        </Field>
        <Field id="f-faculty" label="Fakultet / mutaxassislik" required error={errors["f-faculty"] && "Mutaxassisligingizni yozing"}>
          <input id="f-faculty" className={cls("f-faculty")} value={f.faculty} maxLength={120}
                 placeholder="Masalan: Iqtisodiyot, Dasturiy injiniring" onChange={set("faculty", "f-faculty")} />
        </Field>
        <div className="row">
          <div className="grow">
            <Field id="f-course" label="Kurs" required error={errors["f-course"] && "Kursni tanlang"}>
              <select id="f-course" className={cls("f-course")} value={f.course} onChange={set("course", "f-course")}>
                <option value="">Tanlang…</option>
                {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c}-kurs</option>)}
                <option value="7">Magistratura</option>
              </select>
            </Field>
          </div>
          <div className="grow">
            <Field id="f-group" label="Guruh" required error={errors["f-group"] && "Guruhni yozing"}>
              <input id="f-group" className={cls("f-group")} value={f.group} maxLength={40} placeholder="114-25"
                     autoCapitalize="characters" onChange={set("group", "f-group")} />
            </Field>
          </div>
        </div>
      </div>

      <h2>3. TalantGo yo'nalishi<Req /></h2>
      <p className="hint">Har hafta shu yo'nalish bo'yicha topshiriq bajarasiz. Tasdiqlangan ishlar CV'ingizga tushadi.</p>
      <div id="f-track" tabIndex={-1} className={groupCls("f-track")}>
        {tracks.map((t) => (
          <div key={t.id} className={`card tap ${t.id === trackId ? "selected" : ""}`} onClick={() => { setTrackId(t.id); clear("f-track"); }}>
            <div className="row"><TrackMark title={t.title} /><b>{t.title}</b></div>
            <div className="hint" style={{ marginTop: 4 }}>{t.description}</div>
          </div>
        ))}
      </div>
      {errors["f-track"] && <div className="field-error">Yo'nalishni tanlang</div>}

      {seeker && (
        <>
          <h2>4. Qanday ish izlayapsiz</h2>
          <div className="card">
            <label style={{ marginTop: 0 }}>Qaysi sohada ishlamoqchisiz<Req /></label>
            <div id="f-industries" tabIndex={-1} className={groupCls("f-industries", "chips")}>
              {catalog && Object.entries(catalog.industries).map(([key, label]) => (
                <button key={key} type="button" className={`chip ${industries.includes(key) ? "on" : ""}`}
                        onClick={() => { setIndustries(toggle(industries, key, 6)); clear("f-industries"); }}>{label}</button>
              ))}
            </div>
            {errors["f-industries"] ? <div className="field-error">Kamida bitta sohani tanlang</div>
              : <div className="hint" style={{ marginTop: 4 }}>6 tagacha tanlash mumkin</div>}
            <label>Ish turi<Req /></label>
            <div id="f-jobtypes" tabIndex={-1} className={groupCls("f-jobtypes", "chips")}>
              {(Object.keys(JOB_KIND) as JobKind[]).map((k) => (
                <button key={k} type="button" className={`chip ${jobTypes.includes(k) ? "on" : ""}`}
                        onClick={() => { setJobTypes(toggle(jobTypes, k)); clear("f-jobtypes"); }}>{JOB_KIND[k]}</button>
              ))}
            </div>
            {errors["f-jobtypes"] && <div className="field-error">Kamida bittasini tanlang</div>}
          </div>
        </>
      )}

      <h2>{seeker ? 5 : 4}. Qo'shimcha (ixtiyoriy)</h2>
      <div className="card">
        <Field id="f-skills" label="Ko'nikmalar (vergul bilan)">
          <input id="f-skills" value={f.skills} placeholder="Excel, SQL, Power BI" onChange={set("skills")} />
        </Field>
        {suggestions.length > 0 && (
          <div className="chips" style={{ marginTop: 6 }}>
            {suggestions.map((g) => (
              <button key={g} type="button" className={`chip ${skillList.includes(g) ? "on" : ""}`}
                      onClick={() => setF({ ...f, skills: toggle(skillList, g, 20).join(", ") })}>{g}</button>
            ))}
          </div>
        )}
        <Field id="f-langs" label="Tillar (vergul bilan)" hint={LANGUAGE_HINTS.join(", ")}>
          <input id="f-langs" value={f.languages} placeholder="O'zbek (ona tili), Ingliz B2" onChange={set("languages")} />
        </Field>
        <div className="row">
          <div className="grow"><Field id="f-city" label="Shahar"><input id="f-city" value={f.city} maxLength={60} placeholder="Toshkent" onChange={set("city")} /></Field></div>
          <div className="grow"><Field id="f-grad" label="Bitirish yili">
            <input id="f-grad" value={f.graduation_year} inputMode="numeric" maxLength={4} placeholder="2028" onChange={set("graduation_year")} />
          </Field></div>
        </div>
        <div className="row">
          <div className="grow"><Field id="f-gpa" label="GPA (5 ballik)"><input id="f-gpa" value={f.gpa} inputMode="decimal" placeholder="4.5" onChange={set("gpa")} /></Field></div>
          <div className="grow"><Field id="f-hemis" label="HEMIS ID"><input id="f-hemis" value={f.hemis} maxLength={32} onChange={set("hemis")} /></Field></div>
        </div>
        <Field id="f-bio" label="O'zingiz haqingizda">
          <textarea id="f-bio" value={f.bio} maxLength={600} placeholder="Nimaga qiziqasiz, qanday loyihalar qilgansiz" onChange={set("bio")} />
        </Field>
        <Field id="f-gh" label="GitHub"><input id="f-gh" value={f.github} inputMode="url" placeholder="github.com/ismingiz" onChange={set("github")} /></Field>
        <Field id="f-li" label="LinkedIn"><input id="f-li" value={f.linkedin} inputMode="url" placeholder="linkedin.com/in/ismingiz" onChange={set("linkedin")} /></Field>
      </div>

      <Consent value={consent} onChange={(v) => { setConsent(v); clear("f-consent"); }} invalid={Boolean(errors["f-consent"])} />
      {errors["f-consent"] && <div className="field-error">Rozilik belgisini qo'ying</div>}
      <ErrorText error={error} />
      <div className="save-bar stack">
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Bekor qilish</button>}
      </div>
    </div>
  );
}
