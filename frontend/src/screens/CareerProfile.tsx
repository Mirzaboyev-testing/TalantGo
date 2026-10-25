import { useEffect, useState } from "react";
import { api, JOB_KIND, loadCatalog, type Catalog, type JobKind, type Me, type University } from "../api";
import { kindLabel } from "../format";
import { Req } from "../form";
import { t, tMaybe, useLang } from "../i18n";
import { courseText, verificationLabel } from "../labels";
import { haptic } from "../tg";
import { ErrorText, message, toast } from "../ui";

const missingLabel = (m: string) => tMaybe(`s.career.missing.${m}`) ?? m;
const LANGUAGE_HINTS = ["O'zbek (ona tili)", "Rus B2", "Ingliz B1", "Ingliz B2", "Ingliz C1", "Koreys TOPIK 3", "Nemis B1"];

const split = (v: string) => v.split(",").map((x) => x.trim()).filter((x) => x.length >= 2);

export default function CareerProfile({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  useLang();
  const [unis, setUnis] = useState<University[]>([]);
  const [f, setF] = useState({
    university_id: me.university_ref ? String(me.university_ref.id) : "", faculty: me.faculty,
    course: me.course ? String(me.course) : "", graduation_year: me.graduation_year ? String(me.graduation_year) : "",
    gpa: me.gpa != null ? String(me.gpa) : "", gpa_scale: String(me.gpa_scale), student_number: me.student_number,
    skills: me.skills.join(", "), languages: me.languages.join(", "), city: me.city,
  });
  const [jobTypes, setJobTypes] = useState<JobKind[]>(me.job_types);
  const [industries, setIndustries] = useState<string[]>(me.work_industries);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.universities().then(setUnis, () => {}); loadCatalog().then(setCatalog, () => {}); }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.value });
  };

  async function run(action: () => Promise<Me>, done = t("s.common.saved_ok")) {
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

  const seeker = me.role === "student";
  const save = () => {
    if (seeker && (industries.length === 0 || jobTypes.length === 0)) {
      setError(industries.length === 0 ? t("s.common.pick_industry") : t("s.career.pick_jobtype"));
      return;
    }
    return doSave();
  };
  const doSave = () => run(() => api.updateMe({
    ...(seeker ? { work_industries: industries } : {}),
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
          <b>{t("s.career.title")}</b>
          <span className={`badge ${me.verification === "verified" ? "peer_verified" : me.verification === "pending" ? "pending" : me.verification === "rejected" ? "rejected" : "todo"}`}>
            {verificationLabel(me.verification)}
          </span>
        </div>
        <div className="progress" style={{ margin: "10px 0 6px" }}><div style={{ width: `${pct}%` }} /></div>
        <div className="hint">
          {t("s.career.filled", { pct })}
          {me.completeness.missing.length > 0 && ` ${t("s.career.missing_list", { list: me.completeness.missing.map(missingLabel).join(", ") })}`}
        </div>
        {me.verification === "verified" && <p className="hint">{t("s.career.verified_by", { name: me.verified_by })}</p>}
        {me.verification === "pending" && <p className="notice" style={{ marginTop: 10 }}>{t("s.career.pending")}</p>}
        {me.verification === "rejected" && <p className="error">{t("s.career.rejected", { note: me.verification_note || t("s.career.no_reason") })}</p>}

        <label className="row between" style={{ color: "var(--text)", marginTop: 12, cursor: "pointer" }}>
          <span><b>{t("s.career.open_to_work")}</b><div className="hint">{t("s.career.open_to_work_hint")}</div></span>
          <input type="checkbox" checked={me.open_to_work} style={{ width: 22, height: 22, flex: "none" }}
                 onChange={(e) => run(() => api.updateMe({ open_to_work: e.target.checked }),
                   e.target.checked ? t("s.career.otw_on") : t("s.career.otw_off"))} />
        </label>
        <label className="row between" style={{ color: "var(--text)", marginTop: 12, cursor: "pointer" }}>
          <span><b>{t("profile.visible.title")}</b><div className="hint">{t("profile.visible.hint")}</div></span>
          <input type="checkbox" checked={me.visible_to_employers} style={{ width: 22, height: 22, flex: "none" }}
                 onChange={(e) => run(() => api.updateMe({ visible_to_employers: e.target.checked }),
                   t(e.target.checked ? "profile.visible.on" : "profile.visible.off"))} />
        </label>
      </div>

      <div className="card">
        <b>{t("s.career.study")}</b>
        <label>{t("s.common.university")}</label>
        <select value={f.university_id} onChange={set("university_id")}>
          <option value="">{t("task.f.choose")}</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} · {u.name}</option>)}
        </select>
        <label>{t("s.career.faculty")}</label>
        <input value={f.faculty} maxLength={120} onChange={set("faculty")} />
        <div className="row">
          <div className="grow"><label>{t("s.common.course")}</label>
            <select value={f.course} onChange={set("course")}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{courseText(c)}</option>)}
              <option value="7">{t("course.master")}</option>
            </select>
          </div>
          <div className="grow"><label>{t("s.common.grad_year")}</label>
            <input value={f.graduation_year} inputMode="numeric" maxLength={4} placeholder="2027" onChange={set("graduation_year")} />
          </div>
        </div>
        <label>{t("s.career.student_id")}</label>
        <input value={f.student_number} maxLength={32} onChange={set("student_number")} />
        <div className="hint">{t("s.career.student_id_hint")}</div>
        <div className="row">
          <div className="grow"><label>{t("s.career.gpa")}</label>
            <input value={f.gpa} inputMode="decimal" placeholder="4.2" onChange={set("gpa")} />
          </div>
          <div style={{ width: 110 }}><label>{t("s.career.scale")}</label>
            <select value={f.gpa_scale} onChange={set("gpa_scale")}>
              <option value="5">{t("s.career.scale_n", { n: 5 })}</option><option value="4">{t("s.career.scale_n", { n: 4 })}</option>
            </select>
          </div>
        </div>
        <div className="hint">{t("s.career.gpa_hint")}</div>
      </div>

      <div className="card">
        <b>{t("s.career.skills_title")}</b>
        <label>{t("s.common.skills_label")}</label>
        <input value={f.skills} placeholder="Excel, SQL, Power BI, Python" onChange={set("skills")} />
        <label>{t("s.common.langs_label")}</label>
        <input value={f.languages} placeholder={t("s.career.langs_ph")} onChange={set("languages")} />
        <div className="chips" style={{ marginTop: 6 }}>
          {LANGUAGE_HINTS.filter((l) => !split(f.languages).includes(l)).slice(0, 5).map((l) => (
            <button key={l} className="chip" onClick={() => setF({ ...f, languages: [...split(f.languages), l].join(", ") })}>+ {l}</button>
          ))}
        </div>
        {seeker && (
          <>
            <label>{t("s.common.industry_label")}<Req /></label>
            <div className="chips">
              {catalog && Object.entries(catalog.industries).map(([k, label]) => (
                <button key={k} className={`chip ${industries.includes(k) ? "on" : ""}`}
                        onClick={() => { setSaved(false); setIndustries(industries.includes(k) ? industries.filter((x) => x !== k) : [...industries, k].slice(0, 6)); }}>
                  {tMaybe(`industry.${k}`) ?? label}
                </button>
              ))}
            </div>
          </>
        )}
        <label>{t("s.career.jobtype_label")}{seeker && <Req />}</label>
        <div className="chips">
          {(Object.keys(JOB_KIND) as JobKind[]).map((k) => (
            <button key={k} className={`chip ${jobTypes.includes(k) ? "on" : ""}`}
                    onClick={() => { setSaved(false); setJobTypes(jobTypes.includes(k) ? jobTypes.filter((x) => x !== k) : [...jobTypes, k]); }}>
              {kindLabel(k)}
            </button>
          ))}
        </div>
        <label>{t("s.common.city")}</label>
        <input value={f.city} maxLength={60} placeholder={t("s.common.city_ph")} onChange={set("city")} />
        <ErrorText error={error} />
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={save}>{saved ? t("s.common.saved") : t("common.save")}</button>
          {(me.verification === "none" || me.verification === "rejected") && (
            <button className="btn ok" disabled={busy} onClick={() => run(api.requestVerification, t("s.career.verify_sent"))}>{t("s.career.verify_send")}</button>
          )}
        </div>
        <p className="hint">{t("s.career.verify_hint")}</p>
      </div>

      <AnonymousPreview me={me} />
    </>
  );
}

function AnonymousPreview({ me }: { me: Me }) {
  useLang();
  return (
    <div className="card">
      <b>{t("s.career.preview_title")}</b>
      <p className="hint">{t("s.career.preview_hint")}</p>
      <div className="card" style={{ background: "var(--bg2)", marginBottom: 0 }}>
        <div className="row between">
          <b>{me.full_name}</b>
          {me.verification === "verified" && <span className="badge peer_verified">{t("s.career.verified_badge")}</span>}
        </div>
        <div className="hint">
          {[me.university_ref?.short_name, me.faculty, courseText(me.course), me.group_name && t("s.career.group_n", { group: me.group_name })]
            .filter(Boolean).join(" · ") || t("s.career.no_uni")}
        </div>
        <div className="hint">{me.track?.title} · {t("s.common.points", { n: me.points })}</div>
        {me.skills.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{me.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
      </div>
    </div>
  );
}
