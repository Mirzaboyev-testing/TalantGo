import { useEffect, useState } from "react";
import { api, type Me, type University } from "../api";
import { ErrorText, LogoutLink, message } from "../ui";
import { Consent } from "./Consent";
import { Icon } from "../icons";
import EmployerSignup from "./employer/EmployerSignup";

type Choice = "student" | "employer" | "university" | null;

/** First screen for a new account: job seeker or employer. (University staff come with their own link.) */
export default function Welcome({ me, initial, onStudent, onChanged, onLogout }: {
  me: Me; initial: Choice; onStudent: () => void; onChanged: (m: Me) => void; onLogout?: () => void;
}) {
  const [choice, setChoice] = useState<Choice>(initial);

  if (choice === "employer") return <EmployerSignup me={me} onSaved={onChanged} onBack={() => setChoice(null)} onLogout={onLogout} />;
  if (choice === "university") return <StaffForm onBack={() => setChoice(null)} onChanged={onChanged} />;

  return (
    <div>
      <LogoutLink onLogout={onLogout} />
      <h1>Salom, {me.full_name.split(" ")[0]}!</h1>
      <p className="hint">TalantGo: talabalar tasdiqlangan ko'nikmalar bilan amaliyot va birinchi ishni topadigan joy. Kim sifatida ro'yxatdan o'tasiz?</p>
      <div className="choice-grid">
        <button className="choice-card" onClick={onStudent}>
          <span className="avatar"><Icon name="school" /></span>
          <b>Ish izlovchi</b>
          <span className="hint">Talabaman: yo'nalish tanlayman, portfolio yig'aman, amaliyot va ish topaman</span>
        </button>
        <button className="choice-card" onClick={() => setChoice("employer")}>
          <span className="avatar"><Icon name="briefcase" /></span>
          <b>Ish beruvchi</b>
          <span className="hint">Kompaniyaman: talabalarni reyting bo'yicha ko'raman, vakansiya va test joylayman</span>
        </button>
      </div>
      {initial === "university" && (
        <div className="card tap" style={{ marginTop: 10 }} onClick={() => setChoice("university")}>
          <div className="row"><span className="avatar"><Icon name="building" /></span><div><b>Universitet xodimiman</b><div className="hint">Karyera markazi: talabalarni tasdiqlash va hisobotlar</div></div></div>
        </div>
      )}
    </div>
  );
}

function StaffForm({ onBack, onChanged }: { onBack: () => void; onChanged: (m: Me) => void }) {
  const [unis, setUnis] = useState<University[]>([]);
  const [uniId, setUniId] = useState("");
  const [position, setPosition] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.universities().then(setUnis, (e) => setError(message(e))); }, []);

  async function send() {
    try {
      onChanged(await api.requestStaff(Number(uniId), position.trim()));
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}>Orqaga</button>
      <h1>Universitet xodimi</h1>
      <p className="hint">Karyera markazi xodimlari o'z talabalarining talabaligini tasdiqlaydi va bandlik hisobotlarini ko'radi. So'rovingizni ilova egasi universitet bilan bog'lanib tekshiradi.</p>
      <div className="card">
        <label>Universitet</label>
        <select value={uniId} onChange={(e) => setUniId(e.target.value)}>
          <option value="">Tanlang…</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} · {u.name}</option>)}
        </select>
        <label>Lavozim</label>
        <input value={position} maxLength={120} placeholder="Masalan: Karyera markazi rahbari" onChange={(e) => setPosition(e.target.value)} />
        <Consent value={consent} onChange={setConsent} />
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 12 }} disabled={!uniId || position.trim().length < 3 || !consent} onClick={send}>So'rov yuborish</button>
      </div>
    </div>
  );
}

/** Shown to employers and staff while an admin checks them. */
export function PendingScreen({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout?: () => void }) {
  const [editing, setEditing] = useState(false);
  const isEmployer = me.account_type === "employer";
  const rejected = isEmployer ? me.company?.status === "rejected" : me.staff_status === "rejected";
  const note = isEmployer ? me.company?.review_note : "";
  const told = me.has_telegram ? "Tasdiqlangach botdan xabar keladi." : "Tasdiqlangach shu sahifa o'zi yangilanadi.";

  // the decision is picked up without a reload (accounts without Telegram get no bot message)
  useEffect(() => {
    if (rejected || editing) return;
    const timer = window.setInterval(() => { api.me().then(onChanged, () => {}); }, 30000);
    return () => window.clearInterval(timer);
  }, [rejected, editing, onChanged]);

  if (editing && isEmployer) return <EmployerSignup me={me} onSaved={(m) => { onChanged(m); setEditing(false); }} onBack={() => setEditing(false)} onLogout={onLogout} />;
  return (
    <div>
      <LogoutLink onLogout={onLogout} />
      <h1>{rejected ? "So'rov tasdiqlanmadi" : "Tekshirilmoqda"}</h1>
      <div className="card">
        {isEmployer ? <b>{me.company?.name}</b> : <b>{me.staff_university?.name}</b>}
        <p className="hint">
          {rejected
            ? `Izoh: ${note || "ko'rsatilmagan"}. Ma'lumotlarni tuzatib saqlasangiz, kompaniya qayta tekshiruvga yuboriladi.`
            : isEmployer
              ? `Admin kompaniyangizni STIR bo'yicha tekshiradi. Odatda 1 ish kuni ichida. ${told}`
              : `Ilova egasi universitet bilan bog'lanib tekshiradi. ${told}`}
        </p>
        {isEmployer && <button className="btn small ghost" onClick={() => setEditing(true)}>{rejected ? "Tuzatib qayta yuborish" : "Ma'lumotlarni tahrirlash"}</button>}
      </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={async () => onChanged(await api.backToStudent())}>
        Ish izlovchi sifatida davom etish
      </button>
      {isEmployer && <p className="hint">Bu kompaniya so'rovini bekor qiladi. Keyin xohlasangiz, qaytadan ish beruvchi sifatida ro'yxatdan o'tishingiz mumkin.</p>}
    </div>
  );
}
