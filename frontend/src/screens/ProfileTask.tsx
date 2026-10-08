import { useState } from "react";
import { api, type Me, type Task } from "../api";
import { haptic, openLink } from "../tg";
import { ErrorText, focusField, isFullName, message, toast } from "../ui";

const LANGS = ["O'zbek (ona tili)", "Rus B1", "Rus B2", "Ingliz A2", "Ingliz B1", "Ingliz B2", "Ingliz C1"];
const split = (v: string) => [...new Set(v.split(",").map((x) => x.trim()).filter((x) => x.length >= 2))];
const BIO_MIN = 30;

/** The Start task: build the professional profile right here; the server checks it and awards points.
 *  Only what every student has is required; an open CV and links stay optional. */
export default function ProfileTask({ me, task, onDone }: { me: Me; task: Task; onDone: () => void }) {
  const [name, setName] = useState(me.full_name);
  const [headline, setHeadline] = useState(me.headline || [me.faculty && `${me.faculty} talabasi`, me.track?.title.split(":")[0]].filter(Boolean).join(" | "));
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
        <b>Bajarildi: +{task.submission.points_awarded} ball</b>
        <p className="hint">Profilingiz tayyor. Ma'lumotlarni istalgan vaqtda Profil bo'limida o'zgartirasiz.</p>
        {me.cv_public && <button className="btn small ghost" onClick={() => openLink(task.submission!.proof_url)}>CV'ni ko'rish</button>}
      </div>
    );
  }

  // [field id, label, ok] in the order the form shows them
  const checks: [string, string, boolean][] = [
    ["pt-name", "Ism va familiya", isFullName(name)],
    ["pt-headline", "Soha yoki sarlavha", headline.trim().length >= 5],
    ["pt-bio", `O'zingiz haqingizda (kamida ${BIO_MIN} belgi)`, bio.trim().length >= BIO_MIN],
    ["pt-skills", "Kamida 1 ta ko'nikma", split(skills).length >= 1],
    ["pt-langs", "Kamida 1 ta til", langs.length >= 1],
  ];
  const bad = (id: string) => tried && !checks.find(([f]) => f === id)![2];

  async function finish() {
    const missing = checks.filter(([, , ok]) => !ok);
    if (missing.length) {
      setTried(true);
      haptic("error");
      toast(missing.length === 1 ? `To'ldiring: ${missing[0][1].toLowerCase()}` : `${missing.length} ta majburiy maydon to'ldirilmagan`, "error");
      focusField(missing[0][0]);
      return;
    }
    setBusy(true); setError("");
    try {
      await api.updateMe({ full_name: name.trim(), headline: headline.trim(), bio: bio.trim(), skills: split(skills).slice(0, 20),
                           languages: langs, cv_public: cvPublic });
      await api.completeProfile(task.id);
      haptic("success");
      toast(`Ma'lumotlar saqlandi. +${task.points} ball`);
      onDone();
    } catch (e) {
      haptic("error");
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <b>Profilingizni shu yerda to'ldiring</b>
      <p className="hint" style={{ marginTop: 4 }}>* belgili maydonlar majburiy. GitHub va LinkedIn ixtiyoriy, ularni Profil bo'limida qo'shasiz.</p>
      <label htmlFor="pt-name">Ism va familiya *</label>
      <input id="pt-name" className={bad("pt-name") ? "invalid" : ""} value={name} maxLength={128} autoComplete="name"
             placeholder="Masalan: Nodira Ergasheva" onChange={(e) => setName(e.target.value)} />
      {bad("pt-name") && <div className="field-error">Ism va familiyani to'liq yozing</div>}
      <label htmlFor="pt-headline">Soha yoki sarlavha *</label>
      <input id="pt-headline" className={bad("pt-headline") ? "invalid" : ""} value={headline} maxLength={120}
             placeholder="Iqtisodiyot talabasi | Data Analytics" onChange={(e) => setHeadline(e.target.value)} />
      {bad("pt-headline") && <div className="field-error">Sohangizni yozing, masalan: Data analitik</div>}
      <label htmlFor="pt-bio">O'zingiz haqingizda (1-2 gap) *</label>
      <textarea id="pt-bio" className={bad("pt-bio") ? "invalid" : ""} value={bio} maxLength={600}
                placeholder="Qayerda o'qiysiz, nimani o'rganyapsiz, qanday amaliyot yoki ish qidiryapsiz"
                onChange={(e) => setBio(e.target.value)} />
      <div className={bad("pt-bio") ? "field-error" : "hint"}>{bio.trim().length} / {BIO_MIN} belgi</div>
      <label htmlFor="pt-skills">Ko'nikmalar, vergul bilan *</label>
      <input id="pt-skills" className={bad("pt-skills") ? "invalid" : ""} value={skills} placeholder="Excel, SQL, Power BI"
             onChange={(e) => setSkills(e.target.value)} />
      <div className={bad("pt-skills") ? "field-error" : "hint"}>Bitta bo'lsa ham yetadi, keyin qo'shib borasiz.</div>
      <label>Tillar *</label>
      <div id="pt-langs" tabIndex={-1} className={`chips ${bad("pt-langs") ? "invalid-group" : ""}`}>
        {[...new Set([...LANGS, ...langs])].map((l) => (
          <button key={l} type="button" className={`chip ${langs.includes(l) ? "on" : ""}`}
                  onClick={() => setLangs(langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l])}>{l}</button>
        ))}
      </div>
      {bad("pt-langs") && <div className="field-error">Kamida bitta tilni tanlang</div>}
      <label className="row between" style={{ color: "var(--text)", marginTop: 12, cursor: "pointer" }}>
        <span>CV'im ochiq bo'lsin (ixtiyoriy)<div className="hint">Havolani ish beruvchiga yubora olasiz</div></span>
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
        {busy ? "Saqlanmoqda…" : `Saqlash va ${task.points} ball olish`}
      </button>
    </div>
  );
}
