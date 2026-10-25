import { useState } from "react";
import { api, type Me, type Task } from "../api";
import { t, useLang } from "../i18n";
import { haptic, openLink } from "../tg";
import { ErrorText, focusField, isFullName, message, toast } from "../ui";

const LANGS = ["O'zbek (ona tili)", "Rus B1", "Rus B2", "Ingliz A2", "Ingliz B1", "Ingliz B2", "Ingliz C1"];
const split = (v: string) => [...new Set(v.split(",").map((x) => x.trim()).filter((x) => x.length >= 2))];
const BIO_MIN = 30;

/** The Start task: build the professional profile right here; the server checks it and awards points.
 *  Only what every student has is required; an open CV and links stay optional. */
export default function ProfileTask({ me, task, onDone }: { me: Me; task: Task; onDone: () => void }) {
  useLang();
  const [name, setName] = useState(me.full_name);
  const [headline, setHeadline] = useState(me.headline || [me.faculty && t("s.ptask.student_of", { faculty: me.faculty }), me.track?.title.split(":")[0]].filter(Boolean).join(" | "));
  const [bio, setBio] = useState(me.bio);
  const [skills, setSkills] = useState(me.skills.join(", "));
  const [langs, setLangs] = useState<string[]>(me.languages);
  const [cvPublic, setCvPublic] = useState<boolean>(me.cv_public || !task.submission);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (task.submission) {
    return (
      <div className="card">
        <b>{t("s.ptask.done", { n: task.submission.points_awarded })}</b>
        <p className="hint">{t("s.ptask.done_hint")}</p>
        {me.cv_public && <button className="btn small ghost" onClick={() => openLink(task.submission!.proof_url)}>{t("s.ptask.view_cv")}</button>}
      </div>
    );
  }

  // [field id, label, ok] in the order the form shows them
  const checks: [string, string, boolean][] = [
    ["pt-name", t("s.common.full_name"), isFullName(name)],
    ["pt-headline", t("s.common.headline"), headline.trim().length >= 5],
    ["pt-bio", t("s.ptask.check_bio", { n: BIO_MIN }), bio.trim().length >= BIO_MIN],
    ["pt-skills", t("s.ptask.check_skills"), split(skills).length >= 1],
    ["pt-langs", t("s.ptask.check_langs"), langs.length >= 1],
  ];
  const bad = (id: string) => tried && !checks.find(([f]) => f === id)![2];

  async function finish() {
    const missing = checks.filter(([, , ok]) => !ok);
    if (missing.length) {
      setTried(true);
      haptic("error");
      toast(missing.length === 1 ? t("s.ptask.fill_one", { field: missing[0][1].toLowerCase() }) : t("s.ptask.fill_many", { n: missing.length }), "error");
      focusField(missing[0][0]);
      return;
    }
    setBusy(true); setError("");
    try {
      await api.updateMe({ full_name: name.trim(), headline: headline.trim(), bio: bio.trim(), skills: split(skills).slice(0, 20),
                           languages: langs, cv_public: cvPublic });
      await api.completeProfile(task.id);
      haptic("success");
      toast(t("s.ptask.saved", { n: task.points }));
      onDone();
    } catch (e) {
      haptic("error");
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <b>{t("s.ptask.title")}</b>
      <p className="hint" style={{ marginTop: 4 }}>{t("s.ptask.hint")}</p>
      <label htmlFor="pt-name">{t("s.common.full_name")} *</label>
      <input id="pt-name" className={bad("pt-name") ? "invalid" : ""} value={name} maxLength={128} autoComplete="name"
             placeholder={t("s.common.name_ph")} onChange={(e) => setName(e.target.value)} />
      {bad("pt-name") && <div className="field-error">{t("s.common.full_name_error")}</div>}
      <label htmlFor="pt-headline">{t("s.common.headline")} *</label>
      <input id="pt-headline" className={bad("pt-headline") ? "invalid" : ""} value={headline} maxLength={120}
             placeholder={t("s.common.headline_ph")} onChange={(e) => setHeadline(e.target.value)} />
      {bad("pt-headline") && <div className="field-error">{t("s.ptask.headline_error")}</div>}
      <label htmlFor="pt-bio">{t("s.ptask.bio_label")} *</label>
      <textarea id="pt-bio" className={bad("pt-bio") ? "invalid" : ""} value={bio} maxLength={600}
                placeholder={t("s.ptask.bio_ph")}
                onChange={(e) => setBio(e.target.value)} />
      <div className={bad("pt-bio") ? "field-error" : "hint"}>{t("s.ptask.chars", { n: bio.trim().length, min: BIO_MIN })}</div>
      <label htmlFor="pt-skills">{t("s.ptask.skills_label")} *</label>
      <input id="pt-skills" className={bad("pt-skills") ? "invalid" : ""} value={skills} placeholder="Excel, SQL, Power BI"
             onChange={(e) => setSkills(e.target.value)} />
      <div className={bad("pt-skills") ? "field-error" : "hint"}>{t("s.ptask.skills_hint")}</div>
      <label>{t("s.ptask.langs_label")} *</label>
      <div id="pt-langs" tabIndex={-1} className={`chips ${bad("pt-langs") ? "invalid-group" : ""}`}>
        {[...new Set([...LANGS, ...langs])].map((l) => (
          <button key={l} type="button" className={`chip ${langs.includes(l) ? "on" : ""}`}
                  onClick={() => setLangs(langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l])}>{l}</button>
        ))}
      </div>
      {bad("pt-langs") && <div className="field-error">{t("s.ptask.langs_error")}</div>}
      <label className="row between" style={{ color: "var(--text)", marginTop: 12, cursor: "pointer" }}>
        <span>{t("s.ptask.cv_public")}<div className="hint">{t("s.ptask.cv_public_hint")}</div></span>
        <input type="checkbox" checked={cvPublic} style={{ width: 22, height: 22, flex: "none" }} onChange={(e) => setCvPublic(e.target.checked)} />
      </label>

      <div style={{ marginTop: 12 }}>
        {checks.map(([id, label, ok]) => (
          <button key={id} type="button" className="check-line" style={{ color: ok ? "var(--ok)" : undefined }}
                  onClick={() => !ok && focusField(id)}>{ok ? "✓" : "○"} {label}</button>
        ))}
      </div>
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={finish}>
        {busy ? t("s.common.saving") : t("s.ptask.save", { n: task.points })}
      </button>
    </div>
  );
}
