import { useEffect, useState } from "react";
import { api, type Me, type University } from "../api";
import { t, useLang } from "../i18n";
import { ErrorText, LogoutLink, message } from "../ui";
import { Consent } from "./Consent";
import { Icon } from "../icons";
import EmployerSignup from "./employer/EmployerSignup";

type Choice = "student" | "employer" | "university" | null;

/** First screen for a new account: job seeker or employer. (University staff come with their own link.) */
export default function Welcome({ me, initial, onStudent, onChanged, onLogout }: {
  me: Me; initial: Choice; onStudent: () => void; onChanged: (m: Me) => void; onLogout?: () => void;
}) {
  useLang();
  const [choice, setChoice] = useState<Choice>(initial);

  if (choice === "employer") return <EmployerSignup me={me} onSaved={onChanged} onBack={() => setChoice(null)} onLogout={onLogout} />;
  if (choice === "university") return <StaffForm onBack={() => setChoice(null)} onChanged={onChanged} />;

  return (
    <div>
      <LogoutLink onLogout={onLogout} />
      <h1>{t("s.welcome.hello", { name: me.full_name.split(" ")[0] })}</h1>
      <p className="hint">{t("s.welcome.intro")}</p>
      <div className="choice-grid">
        <button className="choice-card" onClick={onStudent}>
          <span className="avatar"><Icon name="school" /></span>
          <b>{t("s.welcome.seeker")}</b>
          <span className="hint">{t("s.welcome.seeker_hint")}</span>
        </button>
        <button className="choice-card" onClick={() => setChoice("employer")}>
          <span className="avatar"><Icon name="briefcase" /></span>
          <b>{t("s.welcome.employer")}</b>
          <span className="hint">{t("s.welcome.employer_hint")}</span>
        </button>
      </div>
      {initial === "university" && (
        <div className="card tap" style={{ marginTop: 10 }} onClick={() => setChoice("university")}>
          <div className="row"><span className="avatar"><Icon name="building" /></span><div><b>{t("s.welcome.staff")}</b><div className="hint">{t("s.welcome.staff_hint")}</div></div></div>
        </div>
      )}
    </div>
  );
}

function StaffForm({ onBack, onChanged }: { onBack: () => void; onChanged: (m: Me) => void }) {
  useLang();
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
      <button className="btn small ghost" onClick={onBack}>{t("common.back")}</button>
      <h1>{t("s.staff.title")}</h1>
      <p className="hint">{t("s.staff.hint")}</p>
      <div className="card">
        <label>{t("s.common.university")}</label>
        <select value={uniId} onChange={(e) => setUniId(e.target.value)}>
          <option value="">{t("task.f.choose")}</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} · {u.name}</option>)}
        </select>
        <label>{t("s.staff.position")}</label>
        <input value={position} maxLength={120} placeholder={t("s.staff.position_ph")} onChange={(e) => setPosition(e.target.value)} />
        <Consent value={consent} onChange={setConsent} />
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 12 }} disabled={!uniId || position.trim().length < 3 || !consent} onClick={send}>{t("s.staff.send")}</button>
      </div>
    </div>
  );
}

/** Shown to employers and staff while an admin checks them. */
export function PendingScreen({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout?: () => void }) {
  useLang();
  const [editing, setEditing] = useState(false);
  const isEmployer = me.account_type === "employer";
  const rejected = isEmployer ? me.company?.status === "rejected" : me.staff_status === "rejected";
  const note = isEmployer ? me.company?.review_note : "";
  const told = me.has_telegram ? t("s.pending.told_bot") : t("s.pending.told_page");

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
      <h1>{rejected ? t("s.pending.rejected_title") : t("s.pending.checking")}</h1>
      <div className="card">
        {isEmployer ? <b>{me.company?.name}</b> : <b>{me.staff_university?.name}</b>}
        <p className="hint">
          {rejected
            ? t("s.pending.rejected", { note: note || t("s.pending.no_note") })
            : isEmployer
              ? t("s.pending.employer", { told })
              : t("s.pending.staff", { told })}
        </p>
        {isEmployer && <button className="btn small ghost" onClick={() => setEditing(true)}>{rejected ? t("s.pending.fix") : t("s.pending.edit")}</button>}
      </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={async () => onChanged(await api.backToStudent())}>
        {t("s.pending.as_seeker")}
      </button>
      {isEmployer && <p className="hint">{t("s.pending.cancel_hint")}</p>}
    </div>
  );
}
