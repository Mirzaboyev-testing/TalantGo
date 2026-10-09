import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons";
import { insideTelegram } from "../tg";
import { Avatar } from "../ui";

export interface ShellTab<T extends string> { id: T; label: string; icon: IconName; badge?: number }

/** Sidebar on a computer, bottom menu on a phone; the same screens inside. */
export default function Shell<T extends string>({ tabs, active, onChange, user, onLogout, children }: {
  tabs: ShellTab<T>[]; active: T; onChange: (t: T) => void;
  user: { name: string; photo?: string | null; subtitle?: string }; onLogout?: () => void; children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="side-nav">
        <div className="side-brand"><span className="brand-mark">T</span>TalantGo</div>
        {tabs.map((t) => (
          <button key={t.id} className={`side-link ${active === t.id ? "on" : ""}`} onClick={() => onChange(t.id)}>
            <Icon name={t.icon} />{t.label}{t.badge ? <span className="dot">{t.badge}</span> : null}
          </button>
        ))}
        <div className="side-user">
          <Avatar name={user.name} url={user.photo} />
          <div className="grow">
            <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            {user.subtitle && <div className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.subtitle}</div>}
          </div>
          {onLogout && !insideTelegram && (
            <button className="icon-btn" title="Chiqish" aria-label="Chiqish" onClick={onLogout}><Icon name="logout" size={18} /></button>
          )}
        </div>
      </aside>
      <main className="app">{children}</main>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {tabs.map((t) => (
            <button key={t.id} className={active === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
              <Icon name={t.icon} size={22} />{t.label}{t.badge ? <span className="dot">{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
