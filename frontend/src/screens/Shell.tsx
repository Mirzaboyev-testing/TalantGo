import { useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "../api";
import { t, useLang } from "../i18n";
import { Icon, type IconName } from "../icons";
import { insideTelegram } from "../tg";
import { Avatar, Sheet } from "../ui";
import LangSwitch from "./LangSwitch";
import NotificationBell from "./Notifications";

export interface ShellTab<T extends string> { id: T; label: string; icon: IconName; badge?: number }

const saveLanguage = (language: "uz" | "ru" | "en") => { api.updateMe({ language }).catch(() => {}); };

// the sidebar shows from 900px (styles.css); only the visible bell is mounted, so it polls once
const wide = window.matchMedia("(min-width: 900px)");
const useWide = () => useSyncExternalStore((l) => { wide.addEventListener("change", l); return () => wide.removeEventListener("change", l); },
                                           () => wide.matches);

/** Sidebar on a computer, top bar + bottom menu on a phone; the same screens inside. */
export default function Shell<T extends string>({ tabs, active, onChange, user, onLogout, children }: {
  tabs: ShellTab<T>[]; active: T; onChange: (t: T) => void;
  user: { name: string; photo?: string | null; subtitle?: string }; onLogout?: () => void; children: ReactNode;
}) {
  useLang();
  const isWide = useWide();
  const [moreOpen, setMoreOpen] = useState(false);
  // a phone's bottom bar fits five buttons: with more sections the last one opens the rest
  const bar = tabs.length > 5 ? tabs.slice(0, 4) : tabs;
  const rest = tabs.length > 5 ? tabs.slice(4) : [];
  const restActive = rest.some((tab) => tab.id === active);
  const restBadge = rest.reduce((n, tab) => n + (tab.badge ?? 0), 0);
  return (
    <div className="shell">
      <aside className="side-nav">
        <div className="side-brand">
          <span className="brand-mark">T</span><span className="grow">TalantGo</span>
          {isWide && <NotificationBell />}
        </div>
        {tabs.map((tab) => (
          <button key={tab.id} className={`side-link ${active === tab.id ? "on" : ""}`} onClick={() => onChange(tab.id)}>
            <Icon name={tab.icon} />{tab.label}{tab.badge ? <span className="dot">{tab.badge}</span> : null}
          </button>
        ))}
        <div className="side-user">
          <Avatar name={user.name} url={user.photo} />
          <div className="grow">
            <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            {user.subtitle && <div className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.subtitle}</div>}
          </div>
          {onLogout && !insideTelegram && (
            <button className="icon-btn" title={t("shell.logout")} aria-label={t("shell.logout")} onClick={onLogout}><Icon name="logout" size={18} /></button>
          )}
        </div>
        <div className="side-lang"><LangSwitch onChange={saveLanguage} /></div>
      </aside>
      <header className="topbar">
        <span className="brand-mark small">T</span><b className="grow">TalantGo</b>
        <LangSwitch onChange={saveLanguage} />
        {!isWide && <NotificationBell />}
      </header>
      <main className="app">{children}</main>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {bar.map((tab) => (
            <button key={tab.id} className={active === tab.id ? "on" : ""} onClick={() => onChange(tab.id)}>
              <Icon name={tab.icon} size={22} />{tab.label}{tab.badge ? <span className="dot">{tab.badge}</span> : null}
            </button>
          ))}
          {rest.length > 0 && (
            <button className={restActive ? "on" : ""} onClick={() => setMoreOpen(true)}>
              <Icon name="menu" size={22} />{t("nav.more")}{restBadge ? <span className="dot">{restBadge}</span> : null}
            </button>
          )}
        </div>
      </nav>
      {moreOpen && (
        <Sheet onClose={() => setMoreOpen(false)}>
          {rest.map((tab) => (
            <button key={tab.id} className={`side-link ${active === tab.id ? "on" : ""}`}
                    onClick={() => { setMoreOpen(false); onChange(tab.id); }}>
              <Icon name={tab.icon} />{tab.label}{tab.badge ? <span className="dot">{tab.badge}</span> : null}
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
