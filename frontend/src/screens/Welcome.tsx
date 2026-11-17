import { useEffect, useState } from "react";
import { api, type Me } from "../api";
import { t, useLang } from "../i18n";
import { LogoutLink } from "../ui";
import { Icon } from "../icons";
import EmployerSignup from "./employer/EmployerSignup";
import CompanySignup from "./employer/CompanySignup";
import UniSignup from "./university/UniSignup";

type Choice = "student" | "employer" | "university" | null;

/** First screen for a new account: job seeker or employer. (University staff come with their own link.) */
export default function Welcome({ me, initial, onStudent, onChanged, onLogout }: {
  me: Me; initial: Choice; onStudent: () => void; onChanged: (m: Me) => void; onLogout?: () => void;
}) {
  useLang();
  const [choice, setChoice] = useState<Choice>(initial);

  if (choice === "employer") return <CompanySignup me={me} onSaved={onChanged} onBack={() => setChoice(null)} onLogout={onLogout} />;
  if (choice === "university") return <UniSignup me={me} onBack={() => setChoice(null)} onChanged={onChanged} onLogout={onLogout} />;

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
