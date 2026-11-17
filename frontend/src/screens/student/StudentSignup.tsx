import { useEffect, useMemo, useState } from "react";
import { api, JOB_KIND, loadCatalog, type Catalog, type JobKind, type Me, type University } from "../../api";
import { kindLabel } from "../../format";
import { Field, Req, useRequired, type Check } from "../../form";
import { t, tMaybe, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { courseText } from "../../labels";
import { haptic, insideTelegram } from "../../tg";
import { ErrorText, isFullName, message, toast } from "../../ui";
import { Consent } from "../Consent";
import LangSwitch from "../LangSwitch";
import PhoneField from "../PhoneField";
import Combo, { uniItems } from "./Combo";
import { BrandLogo } from "../../brand";

export const FIELD_ICONS: Record<string, IconName> = {
  software: "code", data: "trend", it_support: "monitor", design: "palette", marketing: "megaphone", content: "play",
  sales: "cart", support: "headset", finance: "coins", economics: "chart", management: "target", hr: "users",
  admin: "inbox", law: "scale", education: "book", translation: "translate", logistics: "truck", engineering: "wrench",
  architecture: "building", medicine: "heart", tourism: "plane", agro: "leaf", other: "spark",
};
export const fieldLabel = (k: string, catalog: Catalog | null) => tMaybe(`field.${k}`) ?? catalog?.job_fields?.[k] ?? k;
export const KIND_ICONS: Record<JobKind, IconName> = { internship: "school", part_time: "clock", junior: "briefcase", project: "flag" };

const STEPS: { key: "person" | "study" | "goals"; icon: IconName }[] = [
  { key: "person", icon: "user" }, { key: "study", icon: "school" }, { key: "goals", icon: "target" },
];
// which step holds each field the server says is missing (Me.signup_missing)
const STEP_OF: Record<string, number> = {
  full_name: 0, phone: 0, university: 1, faculty: 1, course: 1, group: 1, job_fields: 2, job_types: 2, city: 2, consent: 2,
};
const COURSES = [1, 2, 3, 4, 5, 6, 7];
const MAX_FIELDS = 5;
const OTHER = "other";

const draftKey = (id: number) => `tg_student_draft_${id}`;
type Form = {
  full_name: string; uni: string; otherUni: string; faculty: string; facultyOther: boolean; course: number | null;
  group: string; job_fields: string[]; job_types: JobKind[]; city: string; industries: string[];
};
function readDraft(id: number): { f?: Partial<Form>; step?: number } | null {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null"); } catch { return null; }
}

/**
 * Student sign-up in three steps (2026-11-17): who you are, where you study, what work you can do.
 * Only what companies and the university need to find and trust the student; the rest is filled in the profile.
 * Earlier students whose profile misses a newly required field land on the step that has it.
 */
export default function StudentSignup({ me, onMe, onDone, onBack, onLogout }: {
  me: Me; onMe: (m: Me) => void; onDone: () => void; onBack?: () => void; onLogout?: () => void;
}) {
  useLang();
  const isNew = !me.has_consent && !me.track;
  const [draft] = useState(() => readDraft(me.id));
  const firstMissing = Math.min(...me.signup_missing.map((k) => STEP_OF[k] ?? 0), 2);
  const [step, setStep] = useState<number>(isNew ? draft?.step ?? 0 : firstMissing);
  const [unis, setUnis] = useState<University[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [f, setF] = useState<Form>({
    full_name: me.full_name, uni: me.university_ref ? String(me.university_ref.id) : "", otherUni: "",
    faculty: me.faculty, facultyOther: false, course: me.course, group: me.group_name,
    job_fields: me.job_fields, job_types: me.job_types, city: me.city, industries: me.work_industries,
    ...(isNew ? draft?.f ?? {} : {}),
  });
  const [consent, setConsent] = useState(me.consent_current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls, groupCls } = useRequired();

  useEffect(() => {
    api.universities().then(setUnis, (e) => setError(message(e)));
    loadCatalog().then(setCatalog, (e) => setError(message(e)));
  }, []);
  useEffect(() => {
    if (!isNew) return;
    try { localStorage.setItem(draftKey(me.id), JSON.stringify({ f, step })); } catch { /* storage blocked */ }
  }, [f, step, isNew, me.id]);

  const items = useMemo(() => uniItems(unis), [unis]);
  const uni = unis.find((u) => String(u.id) === f.uni) ?? null;
  const faculties = uni?.faculties ?? [];
  // a faculty saved earlier that is not on the list stays as typed text
  const facultyTyped = f.facultyOther || f.uni === OTHER || faculties.length === 0
    || (Boolean(f.faculty) && !faculties.includes(f.faculty) && faculties.length <= 12);
  const set = <K extends keyof Form>(k: K, v: Form[K], id?: string) => { setF((cur) => ({ ...cur, [k]: v })); if (id) clear(id); };
  const toggle = <T,>(list: T[], v: T, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].slice(0, max));

  const checksFor = (n: number): Check[] => {
    if (n === 0) return [
      ["s-name", isFullName(f.full_name), t("s.common.c_name")],
      ["s-phone", Boolean(me.phone), t("s.onb.c.phone")],
    ];
    if (n === 1) return [
      ["s-uni", f.uni === OTHER ? f.otherUni.trim().length >= 3 : Boolean(f.uni), t("s.onb.c.uni")],
      ["s-faculty", f.faculty.trim().length >= 2, t("s.onb.c.faculty")],
      ["s-course", f.course !== null, t("s.onb.c.course")],
      ["s-group", f.group.trim().length >= 2, t("s.onb.c.group")],
    ];
    return [
      ["s-fields", f.job_fields.length > 0, t("st.su.c.fields")],
      ["s-kinds", f.job_types.length > 0, t("s.onb.c.jobtypes")],
      ["s-city", Boolean(catalog?.regions.includes(f.city)), t("st.su.c.city")],
      ["s-consent", consent, t("s.onb.c.consent")],
    ];
  };

  function goTo(n: number) {
    for (let i = 0; i < n; i++) if (!check(checksFor(i))) { setStep(i); return; }
    setStep(n);
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    for (let i = 0; i < STEPS.length; i++) if (!check(checksFor(i))) { setStep(i); return; }
    setBusy(true); setError("");
    try {
      const universityId = f.uni === OTHER ? (await api.addUniversity(f.otherUni.trim())).id : Number(f.uni);
      const saved = await api.updateMe({
        full_name: f.full_name.trim(), university_id: universityId, faculty: f.faculty.trim(), course: f.course,
        group_name: f.group.trim().toUpperCase(), job_fields: f.job_fields, job_types: f.job_types, city: f.city,
        work_industries: f.industries, ...(me.role === "student" && isNew ? { open_to_work: true } : {}), consent: true,
      });
      try { localStorage.removeItem(draftKey(me.id)); } catch { /* storage blocked */ }
      onMe(saved);
      haptic("success");
      toast(isNew ? t("st.su.done_new") : t("s.onb.saved"));
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  const current = STEPS[step].key;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const last = step === STEPS.length - 1;

  return (
    <div className="co-signup st-signup">
      <aside className="co-signup-side">
        <div className="co-signup-brand">
          <span className="grow"><BrandLogo size={40} /></span>
          <LangSwitch />
        </div>
        <div className="co-signup-intro">
          <span className="co-chip-soft"><Icon name="school" size={15} />{t("st.su.badge")}</span>
          <h1>{isNew ? t("st.su.title") : t("st.su.title_update")}</h1>
          <p>{isNew ? t("st.su.intro") : t("st.su.intro_update")}</p>
        </div>
        <ol className="co-steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`${i === step ? "on" : ""} ${i < step ? "done" : ""}`}>
              <button type="button" onClick={() => (i !== step ? goTo(i) : undefined)}>
                <span className="co-step-n">{i < step ? <Icon name="tick" size={15} /> : i + 1}</span>
                <span className="co-step-text"><b>{t(`st.su.step.${s.key}` as MsgKey)}</b><small>{t(`st.su.step.${s.key}_hint` as MsgKey)}</small></span>
              </button>
            </li>
          ))}
        </ol>
        <div className="co-why">
          <span className="co-why-icon"><Icon name="lock" size={18} /></span>
          <div><b>{t("st.su.why_title")}</b><p>{t(`st.su.why.${current}` as MsgKey)}</p></div>
        </div>
        <ul className="co-perks">
          {(["tasks", "jobs", "cv"] as const).map((k) => (
            <li key={k}><span><Icon name="tick" size={14} /></span>{t(`st.su.perk.${k}` as MsgKey)}</li>
          ))}
        </ul>
        <div className="co-signup-foot">
          {onBack && <button className="link-btn" onClick={onBack}>{t("common.back")}</button>}
          {onLogout && !insideTelegram && <button className="link-btn" onClick={onLogout}>{t("shell.logout")}</button>}
        </div>
      </aside>

      <section className="co-signup-main">
        <div className="co-progress-row">
          <span>{t("co.su.step_n", { n: step + 1, total: STEPS.length })}</span>
          <div className="co-progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
        {!isNew && me.signup_missing.length > 0 && step === firstMissing && (
          <div className="notice" style={{ marginBottom: 12 }}>{t("st.su.returning_note")}</div>
        )}
        <div className="co-form-card" key={current}>
          <div className="co-form-title">
            <span className="co-form-icon"><Icon name={STEPS[step].icon} size={22} /></span>
            <div><h2>{t(`st.su.step.${current}` as MsgKey)}</h2><p>{t(`st.su.sub.${current}` as MsgKey)}</p></div>
          </div>

          {current === "person" && (
            <>
              <Field id="s-name" label={t("s.common.full_name")} required error={errors["s-name"] && t("s.common.full_name_error")}
                     hint={t("st.su.name_hint")}>
                <input id="s-name" className={cls("s-name")} value={f.full_name} maxLength={128} autoComplete="name"
                       placeholder={t("s.onb.name_ph")} onChange={(e) => set("full_name", e.target.value, "s-name")} />
              </Field>
              <div id="s-phone" tabIndex={-1} className={groupCls("s-phone", "co-block")}>
                <label style={{ marginTop: 0 }}>{t("s.onb.phone")}<Req /></label>
                <PhoneField me={me} onChanged={(m) => { onMe(m); if (m.phone) clear("s-phone"); }} />
                {errors["s-phone"] && <div className="field-error">{t("s.onb.phone_error")}</div>}
              </div>
            </>
          )}

          {current === "study" && (
            <>
              <Field id="s-uni" label={t("s.common.university")} required error={errors["s-uni"] && t("s.onb.uni_error")}
                     hint={t("st.su.uni_hint", { n: unis.length || "200+" })}>
                <Combo id="s-uni" items={items} value={f.uni === OTHER ? "" : f.uni} customValue={f.uni === OTHER ? f.otherUni : ""}
                       icon="school" placeholder={t("st.su.uni_ph")} invalid={Boolean(errors["s-uni"])} limit={8}
                       customLabel={(q) => t("st.su.uni_add", { name: q })}
                       onChange={(v, custom) => {
                         setF((cur) => ({ ...cur, uni: custom ? OTHER : v, otherUni: custom ? v : "",
                                          faculty: v === cur.uni ? cur.faculty : "", facultyOther: false }));
                         clear("s-uni");
                       }} />
              </Field>
              {f.uni === OTHER && <div className="co-note" style={{ marginTop: 8 }}>{t("st.su.uni_new_note", { name: f.otherUni })}</div>}

              <Field id="s-faculty" label={t("s.onb.faculty")} required error={errors["s-faculty"] && t("s.onb.faculty_error")}
                     hint={f.uni && !facultyTyped && faculties.length ? t("st.su.faculty_hint", { n: faculties.length }) : undefined}>
                {!f.uni ? (
                  <input id="s-faculty" disabled placeholder={t("st.su.faculty_first")} />
                ) : !facultyTyped && faculties.length > 12 ? (
                  <Combo id="s-faculty" items={faculties.map((x) => ({ value: x, label: x }))} value={faculties.includes(f.faculty) ? f.faculty : ""}
                         customValue={faculties.includes(f.faculty) ? "" : f.faculty} limit={20}
                         placeholder={t("st.su.faculty_search")} invalid={Boolean(errors["s-faculty"])}
                         customLabel={(q) => t("st.su.faculty_add", { name: q })}
                         onChange={(v) => set("faculty", v, "s-faculty")} />
                ) : !facultyTyped ? (
                  <select id="s-faculty" className={cls("s-faculty")} value={f.faculty}
                          onChange={(e) => {
                            if (e.target.value === OTHER) setF((cur) => ({ ...cur, faculty: "", facultyOther: true }));
                            else set("faculty", e.target.value, "s-faculty");
                          }}>
                    <option value="">{t("task.f.choose")}</option>
                    {faculties.map((x) => <option key={x} value={x}>{x}</option>)}
                    <option value={OTHER}>{t("st.su.faculty_other")}</option>
                  </select>
                ) : (
                  <>
                    <input id="s-faculty" className={cls("s-faculty")} value={f.faculty} maxLength={120} autoFocus={f.facultyOther}
                           placeholder={t("s.onb.faculty_ph")} onChange={(e) => set("faculty", e.target.value, "s-faculty")} />
                    {f.facultyOther && faculties.length > 0 && (
                      <button type="button" className="link-btn" style={{ marginTop: 6 }}
                              onClick={() => setF((cur) => ({ ...cur, faculty: "", facultyOther: false }))}>{t("st.su.faculty_back")}</button>
                    )}
                  </>
                )}
              </Field>

              <div id="s-course" tabIndex={-1} className={groupCls("s-course", "co-block")}>
                <label style={{ marginTop: 0 }}>{t("s.common.course")}<Req /></label>
                <div className="st-seg">
                  {COURSES.map((c) => (
                    <button key={c} type="button" className={f.course === c ? "on" : ""} onClick={() => set("course", c, "s-course")}>
                      {c === 7 ? t("course.master") : courseText(c)}
                    </button>
                  ))}
                </div>
                {errors["s-course"] && <div className="field-error">{t("s.onb.course_error")}</div>}
              </div>
              <Field id="s-group" label={t("s.common.group")} required error={errors["s-group"] && t("s.onb.group_error")} hint={t("st.su.group_hint")}>
                <input id="s-group" className={cls("s-group")} value={f.group} maxLength={40} placeholder="114-25"
                       autoCapitalize="characters" onChange={(e) => set("group", e.target.value, "s-group")} />
              </Field>
            </>
          )}

          {current === "goals" && (
            <>
              <div id="s-fields" tabIndex={-1} className={groupCls("s-fields", "co-block")} style={{ marginTop: 0 }}>
                <div className="row between" style={{ alignItems: "baseline" }}>
                  <label style={{ marginTop: 0 }}>{t("st.su.fields")}<Req /></label>
                  <span className="hint">{t("st.su.fields_n", { n: f.job_fields.length, max: MAX_FIELDS })}</span>
                </div>
                <div className="st-field-grid">
                  {Object.keys(catalog?.job_fields ?? {}).map((k) => {
                    const on = f.job_fields.includes(k);
                    const full = !on && f.job_fields.length >= MAX_FIELDS;
                    return (
                      <button key={k} type="button" className={`st-field ${on ? "on" : ""}`} disabled={full}
                              onClick={() => set("job_fields", toggle(f.job_fields, k, MAX_FIELDS), "s-fields")}>
                        <span className="st-field-icon"><Icon name={FIELD_ICONS[k] ?? "spark"} size={18} /></span>
                        <span className="st-field-label">{fieldLabel(k, catalog)}</span>
                        {on && <span className="st-field-tick"><Icon name="tick" size={13} /></span>}
                      </button>
                    );
                  })}
                </div>
                {errors["s-fields"] ? <div className="field-error">{t("st.su.fields_err")}</div>
                  : <div className="hint" style={{ marginTop: 6 }}>{t("st.su.fields_hint")}</div>}
              </div>

              <div id="s-kinds" tabIndex={-1} className={groupCls("s-kinds", "co-block")}>
                <label style={{ marginTop: 0 }}>{t("s.onb.jobtype")}<Req /></label>
                <div className="co-choice-row st-kinds">
                  {(Object.keys(JOB_KIND) as JobKind[]).map((k) => (
                    <button key={k} type="button" className={`co-choice ${f.job_types.includes(k) ? "on" : ""}`}
                            onClick={() => set("job_types", toggle(f.job_types, k), "s-kinds")}>
                      <span className="co-choice-icon"><Icon name={KIND_ICONS[k]} size={20} /></span>
                      <span><b>{kindLabel(k)}</b><small>{t(`st.kind.${k}` as MsgKey)}</small></span>
                      <span className="co-choice-tick"><Icon name="tick" size={14} /></span>
                    </button>
                  ))}
                </div>
                {errors["s-kinds"] && <div className="field-error">{t("s.onb.pick_one")}</div>}
              </div>

              <Field id="s-city" label={t("st.su.city")} required error={errors["s-city"] && t("st.su.city_err")} hint={t("st.su.city_hint")}>
                <select id="s-city" className={cls("s-city")} value={catalog?.regions.includes(f.city) ? f.city : ""}
                        onChange={(e) => set("city", e.target.value, "s-city")}>
                  <option value="">{t("task.f.choose")}</option>
                  {catalog?.regions.map((r) => <option key={r} value={r}>{tMaybe(`region.${r}`) ?? r}</option>)}
                </select>
              </Field>

              <details className="st-more" open={f.industries.length > 0}>
                <summary>{t("st.su.industries")} <span className="hint">· {t("st.su.optional")}</span></summary>
                <div className="chips" style={{ marginTop: 10 }}>
                  {catalog && Object.entries(catalog.industries).map(([k, label]) => (
                    <button key={k} type="button" className={`chip ${f.industries.includes(k) ? "on" : ""}`}
                            onClick={() => set("industries", toggle(f.industries, k, 6))}>{tMaybe(`industry.${k}`) ?? label}</button>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 6 }}>{t("s.onb.up_to_6")}</div>
              </details>

              <Consent id="s-consent" value={consent} onChange={(v) => { setConsent(v); clear("s-consent"); }} invalid={Boolean(errors["s-consent"])} />
              {errors["s-consent"] && <div className="field-error">{t("s.onb.consent_error")}</div>}
            </>
          )}

          <ErrorText error={error} />
          <div className="co-nav">
            {step > 0 ? <button className="btn ghost" onClick={() => { setStep(step - 1); window.scrollTo({ top: 0 }); }}>{t("common.back")}</button> : <span />}
            {last
              ? <button className="btn" disabled={busy} onClick={finish}>{busy ? t("s.common.saving") : t("st.su.finish")}</button>
              : <button className="btn" onClick={() => goTo(step + 1)}>{t("st.su.next")} <Icon name="arrow" size={18} /></button>}
          </div>
        </div>
      </section>
    </div>
  );
}
