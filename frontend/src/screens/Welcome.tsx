import { useEffect, useState } from "react";
import { api, type Me, type University } from "../api";
import { ErrorText, message } from "../ui";
import { Consent } from "./Consent";
import { Icon } from "../icons";
import CompanyForm from "./employer/CompanyForm";

type Choice = "student" | "employer" | "university" | null;

/** First screen for a new account: who are you? */
export default function Welcome({ me, initial, onStudent, onChanged }: {
  me: Me; initial: Choice; onStudent: () => void; onChanged: (m: Me) => void;
}) {
  const [choice, setChoice] = useState<Choice>(initial);

  if (choice === "employer") {
    return (
      <div>
        <button className="btn small ghost" onClick={() => setChoice(null)}>Orqaga</button>
        <h1>Kompaniyani ro'yxatdan o'tkazish</h1>
        <p className="hint">Kompaniya STIR orqali tekshiriladi. Tasdiqlangach vakansiya joylaysiz va talabalarni qidirasiz. Talabalar uchun bepul, kompaniyalar uchun asosiy imkoniyatlar ham hozircha bepul.</p>
        <CompanyForm submitLabel="Yuborish" onSubmit={async (c) => onChanged(await api.registerCompany(c))} requireConsent />
      </div>
    );
  }
  if (choice === "university") return <StaffForm onBack={() => setChoice(null)} onChanged={onChanged} />;

  return (
    <div>
      <h1>Salom, {me.full_name.split(" ")[0]}!</h1>
      <p className="hint">TalantGo: talabalar tasdiqlangan ko'nikmalar bilan amaliyot va birinchi ishni topadigan joy. Siz kimsiz?</p>
      <div className="card tap" onClick={onStudent}>
        <div className="row"><span className="avatar"><Icon name="school" /></span><div><b>Talabaman</b><div className="hint">Yo'l tanlayman, portfolio yig'aman, amaliyot va ish topaman</div></div></div>
      </div>
      <div className="card tap" onClick={() => setChoice("employer")}>
        <div className="row"><span className="avatar"><Icon name="briefcase" /></span><div><b>Ish beruvchiman (HR)</b><div className="hint">Stajyor va yosh mutaxassislarni qidiraman</div></div></div>
      </div>
      <div className="card tap" onClick={() => setChoice("university")}>
        <div className="row"><span className="avatar"><Icon name="building" /></span><div><b>Universitet xodimiman</b><div className="hint">Karyera markazi: talabalarni tasdiqlash va hisobotlar</div></div></div>
      </div>
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
export function PendingScreen({ me, onChanged }: { me: Me; onChanged: (m: Me) => void }) {
  const [editing, setEditing] = useState(false);
  const isEmployer = me.account_type === "employer";
  const rejected = isEmployer ? me.company?.status === "rejected" : me.staff_status === "rejected";
  const note = isEmployer ? me.company?.review_note : "";

  return (
    <div>
      <h1>{rejected ? "So'rov tasdiqlanmadi" : "Tekshirilmoqda"}</h1>
      <div className="card">
        {isEmployer ? <b>{me.company?.name}</b> : <b>{me.staff_university?.name}</b>}
        <p className="hint">
          {rejected
            ? `Izoh: ${note || "ko'rsatilmagan"}. Ma'lumotlarni tuzatib qayta yuboring yoki adminga yozing.`
            : isEmployer
              ? "Admin kompaniyangizni STIR bo'yicha tekshiradi. Odatda 1 ish kuni ichida. Tasdiqlangach botdan xabar keladi."
              : "Ilova egasi universitet bilan bog'lanib tekshiradi. Tasdiqlangach botdan xabar keladi."}
        </p>
        {isEmployer && <button className="btn small ghost" onClick={() => setEditing(!editing)}>Ma'lumotlarni tahrirlash</button>}
      </div>
      {editing && me.company && (
        <CompanyForm initial={me.company} submitLabel="Saqlash"
                     onSubmit={async (c) => { await api.employer.editCompany(c); onChanged(await api.me()); setEditing(false); }} />
      )}
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={async () => onChanged(await api.backToStudent())}>
        Talaba sifatida davom etish
      </button>
    </div>
  );
}
