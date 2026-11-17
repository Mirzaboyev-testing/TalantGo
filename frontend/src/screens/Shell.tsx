import { useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "../api";
import { t, useLang } from "../i18n";
import { Icon, type IconName } from "../icons";
import { insideTelegram } from "../tg";
import { Avatar, Sheet } from "../ui";
import LangSwitch from "./LangSwitch";
import NotificationBell from "./Notifications";
import { BrandLogo } from "../brand";

export interface ShellTab<T extends string> { id: T; label: string; icon: IconName; badge?: number; group?: string;
  /** shown at the bottom of the sidebar, above the name card (e.g. settings) */
  bottom?: boolean }

const saveLanguage = (language: "uz" | "ru" | "en") => { api.updateMe({ language }).catch(() => {}); };

// the sidebar shows from 900px (styles.css); only the visible bell is mounted, so it polls once
const wideQuery = window.matchMedia("(min-width: 900px)");
const useWide = () => useSyncExternalStore((l) => { wideQuery.addEventListener("change", l); return () => wideQuery.removeEventListener("change", l); },
                                           () => wideQuery.matches);

/** Sidebar on a computer, top bar + bottom menu on a phone; the same screens inside. */
export default function Shell<T extends string>({ tabs, active, onChange, user, onLogout, children, wide = false, onUser }: {
  tabs: ShellTab<T>[]; active: T; onChange: (t: T) => void;
  user: { name: string; photo?: string | null; subtitle?: string; verified?: boolean; square?: boolean };
  onLogout?: () => void; children: ReactNode; wide?: boolean;
  /** the name card at the bottom of the sidebar opens the profile */
  onUser?: () => void;
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
          <span className="grow"><BrandLogo size={40} /></span>
          {isWide && <NotificationBell />}
        </div>
        {tabs.filter((tab) => !tab.bottom).map((tab, i, list) => (
          <div key={tab.id} style={{ display: "contents" }}>
            {tab.group && tab.group !== list[i - 1]?.group && <div className="side-group">{tab.group}</div>}
            <button className={`side-link ${active === tab.id ? "on" : ""}`} onClick={() => onChange(tab.id)}>
              <Icon name={tab.icon} />{tab.label}{tab.badge ? <span className="dot">{tab.badge}</span> : null}
            </button>
          </div>
        ))}
        {tabs.some((tab) => tab.bottom) && (
          <div className="side-bottom">
            {tabs.filter((tab) => tab.bottom).map((tab) => (
              <button key={tab.id} className={`side-link ${active === tab.id ? "on" : ""}`} onClick={() => onChange(tab.id)}>
                <Icon name={tab.icon} />{tab.label}{tab.badge ? <span className="dot">{tab.badge}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="side-user">
          {user.square
            ? (user.photo ? <img className="avatar square" src={user.photo} alt="" /> : <div className="avatar square">{user.name.slice(0, 1).toUpperCase()}</div>)
            : <Avatar name={user.name} url={user.photo} />}
          <div className={`grow ${onUser ? "side-user-link" : ""}`} style={{ minWidth: 0 }} role={onUser ? "button" : undefined}
               tabIndex={onUser ? 0 : undefined} onClick={onUser}
               onKeyDown={onUser ? (e) => { if (e.key === "Enter") onUser(); } : undefined}>
            <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            {user.subtitle && (
              <div className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                {user.verified && <span className="side-verified" title={t("co.verified")}><Icon name="verified" size={14} /></span>}
                {user.subtitle}
              </div>
            )}
          </div>
          {onLogout && !insideTelegram && (
            <button className="icon-btn" title={t("shell.logout")} aria-label={t("shell.logout")} onClick={onLogout}><Icon name="logout" size={18} /></button>
          )}
        </div>
        <div className="side-lang"><LangSwitch onChange={saveLanguage} /></div>
      </aside>
      <header className="topbar">
        <span className="grow"><BrandLogo size={34} /></span>
        <LangSwitch onChange={saveLanguage} />
        {!isWide && <NotificationBell />}
      </header>
      <main className={wide ? "app wide" : "app"}>{children}</main>
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
