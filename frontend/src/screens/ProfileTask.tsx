import { useState } from "react";
import { api, type Me, type Task } from "../api";
import { haptic, openLink } from "../tg";
import { ErrorText, message } from "../ui";

const LANGS = ["O'zbek (ona tili)", "Rus B1", "Rus B2", "Ingliz A2", "Ingliz B1", "Ingliz B2", "Ingliz C1"];
const split = (v: string) => [...new Set(v.split(",").map((x) => x.trim()).filter((x) => x.length >= 2))];

/** The Start task: build the professional profile right here; the server checks it and awards points. */
export default function ProfileTask({ me, task, onDone }: { me: Me; task: Task; onDone: () => void }) {
  const [headline, setHeadline] = useState(me.headline || [me.faculty && `${me.faculty} talabasi`, me.track?.title.split(":")[0]].filter(Boolean).join(" | "));
  const [bio, setBio] = useState(me.bio);
  const [skills, setSkills] = useState(me.skills.join(", "));
  const [langs, setLangs] = useState<string[]>(me.languages);
  const [cvPublic, setCvPublic] = useState<boolean>(true);   // the task asks for an open CV
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (task.submission) {
    return (
      <div className="card">
        <b>✅ Bajarildi: +{task.submission.points_awarded} ball</b>
        <p className="hint">Profilingiz tayyor. Ish beruvchi sizni shu ko'rinishda ko'radi.</p>
        <button className="btn small ghost" onClick={() => openLink(task.submission!.proof_url)}>CV'ni ko'rish</button>
      </div>
    );
  }

  const checks: [string, boolean][] = [
    ["Qisqa sarlavha (kamida 10 belgi)", headline.trim().length >= 10],
    ["O'zingiz haqingizda (kamida 60 belgi)", bio.trim().length >= 60],
    ["Kamida 3 ta ko'nikma", split(skills).length >= 3],
    ["Kamida 1 ta til", langs.length >= 1],
    ["CV ochiq", cvPublic],
  ];
  const ready = checks.every(([, ok]) => ok);

  async function finish() {
    setBusy(true); setError("");
    try {
      await api.updateMe({ headline: headline.trim(), bio: bio.trim(), skills: split(skills).slice(0, 20), languages: langs, cv_public: cvPublic });
      await api.completeProfile(task.id);
      haptic("success");
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
      <label>Sarlavha: kim siz va nimaga yo'nalgansiz</label>
      <input value={headline} maxLength={120} placeholder="Iqtisodiyot talabasi | Data Analytics" onChange={(e) => setHeadline(e.target.value)} />
      <label>O'zingiz haqingizda (2-3 gap)</label>
      <textarea value={bio} maxLength={600} placeholder="Qayerda o'qiysiz, nimani o'rganyapsiz, qanday amaliyot yoki ish qidiryapsiz"
                onChange={(e) => setBio(e.target.value)} />
      <div className="hint">{bio.trim().length} / 60 belgi</div>
      <label>Ko'nikmalar (vergul bilan)</label>
      <input value={skills} placeholder="Excel, SQL, Power BI" onChange={(e) => setSkills(e.target.value)} />
      <label>Tillar</label>
      <div className="chips">
        {[...new Set([...LANGS, ...langs])].map((l) => (
          <button key={l} className={`chip ${langs.includes(l) ? "on" : ""}`}
                  onClick={() => setLangs(langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l])}>{l}</button>
        ))}
      </div>
      <label className="row between" style={{ color: "var(--text)", marginTop: 12, cursor: "pointer" }}>
        <span>CV'im ochiq bo'lsin<div className="hint">Havolani ish beruvchiga yubora olasiz</div></span>
        <input type="checkbox" checked={cvPublic} style={{ width: 22, height: 22, flex: "none" }} onChange={(e) => setCvPublic(e.target.checked)} />
      </label>

      <div style={{ marginTop: 12 }}>
        {checks.map(([label, ok]) => (
          <div key={label} className="hint" style={{ color: ok ? "var(--ok)" : undefined }}>{ok ? "✓" : "○"} {label}</div>
        ))}
      </div>
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={!ready || busy} onClick={finish}>
        {busy ? "Tekshirilmoqda…" : `Saqlash va ${task.points} ball olish`}
      </button>
    </div>
  );
}
