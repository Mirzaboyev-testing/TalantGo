import { useEffect, useState } from "react";
import { api, type Me } from "../api";
import { BrandLogo } from "../brand";
import { t, useLang, type MsgKey } from "../i18n";
import { Icon, type IconName } from "../icons";
import { PanelArt } from "../public/art";
import type { Panel } from "../public/panels";
import { insideTelegram } from "../tg";
import { LogoutLink } from "../ui";
import EmployerSignup from "./employer/EmployerSignup";
import CompanySignup from "./employer/CompanySignup";
import UniSignup from "./university/UniSignup";
import LangSwitch from "./LangSwitch";
import "./welcome.css";

type Choice = "student" | "employer" | "university" | null;

// The three ways to use Careerup, in the colours and pictures of the website's panel cards.
const ROLES: { id: Exclude<Choice, null>; panel: Panel; icon: IconName }[] = [
  { id: "student", panel: "talaba", icon: "school" },
  { id: "employer", panel: "korxona", icon: "briefcase" },
  { id: "university", panel: "universitet", icon: "building" },
];

/**
 * First screen of a brand-new account that did not pick a panel on the website (or came back from a sign-up form):
 * student, company or university staff. The next screen asks only what that role needs.
 */
export default function Welcome({ me, initial, onStudent, onChanged, onLogout }: {
  me: Me; initial: Choice; onStudent: () => void; onChanged: (m: Me) => void; onLogout?: () => void;
}) {
  useLang();
  const [choice, setChoice] = useState<Choice>(initial);

  if (choice === "employer") return <CompanySignup me={me} onSaved={onChanged} onBack={() => setChoice(null)} onLogout={onLogout} />;
  if (choice === "university") return <UniSignup me={me} onBack={() => setChoice(null)} onChanged={onChanged} onLogout={onLogout} />;

  const name = me.full_name.trim().split(/\s+/)[0];
  const pick = (id: Exclude<Choice, null>) => (id === "student" ? onStudent() : setChoice(id));
  return (
    <div className="wl">
      <header className="wl-top">
        <BrandLogo size={36} />
        <span className="grow" />
        <LangSwitch />
        {onLogout && !insideTelegram && (
          <button className="wl-logout" onClick={onLogout} aria-label={t("shell.logout")}>
            <Icon name="logout" size={16} /><span>{t("shell.logout")}</span>
          </button>
        )}
      </header>

      <main className="wl-main">
        <div className="wl-head">
          <span className="wl-chip"><Icon name="tick" size={14} />{t("st.wl.chip")}</span>
          <h1>{name ? t("st.wl.hello", { name }) : t("st.wl.hello_plain")}</h1>
          <p>{t("st.wl.intro")}</p>
        </div>

        <div className="wl-cards">
          {ROLES.map((r) => (
            <button key={r.id} type="button" className={`wl-card ${r.panel}`} onClick={() => pick(r.id)}>
              <span className="wl-art"><PanelArt panel={r.panel} /></span>
              <span className="wl-body">
                <span className="wl-title">
                  <span className="wl-icon"><Icon name={r.icon} size={22} /></span>
                  <span><b>{t(`st.wl.${r.id}` as MsgKey)}</b><small>{t(`st.wl.${r.id}_who` as MsgKey)}</small></span>
                </span>
                <span className="wl-points">
                  {[1, 2, 3].map((n) => (
                    <span key={n}><Icon name="tick" size={14} />{t(`st.wl.${r.id}_p${n}` as MsgKey)}</span>
                  ))}
                </span>
                <span className="wl-next"><Icon name="clock" size={15} />{t(`st.wl.${r.id}_next` as MsgKey)}</span>
                <span className="btn wl-go">{t(`st.wl.${r.id}_go` as MsgKey)}<Icon name="arrow" size={18} /></span>
              </span>
            </button>
          ))}
        </div>

        <p className="wl-foot"><Icon name="lock" size={15} />{t("st.wl.foot")}</p>
      </main>
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
    const timer = window.setInterval(() => { if (document.hidden) return; api.me().then(onChanged, () => {}); }, 30000);
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
