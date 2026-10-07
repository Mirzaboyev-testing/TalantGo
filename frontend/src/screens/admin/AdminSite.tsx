import { useCallback, useEffect, useState } from "react";
import { api, setAdminUnauthorizedHandler } from "../../api";
import "./admin.css";
import { Accounts, MyAccount } from "./Accounts";
import Announcements from "./Announcements";
import AuthScreen from "./AuthScreen";
import Dashboard from "./Dashboard";
import { Applications, Companies, Jobs } from "./Market";
import Queue from "./Queue";
import { AuditCard, BotCard, ExportCard, PartnerLinks, RulesCard } from "./Settings";
import Submissions from "./Submissions";
import Tracks from "./Tracks";
import Universities from "./Universities";
import Users from "./Users";
import { clearToken, loadToken, saveToken } from "./session";

export interface AdminCtx { isOwner: boolean; name: string }
type Me = { id: number; name: string; email: string; role: string; is_owner: boolean };

type Page = { id: string; label: string; icon: string; ownerOnly?: boolean };
const MENU: { group: string; pages: Page[] }[] = [
  { group: "", pages: [{ id: "dashboard", label: "Bosh sahifa", icon: "📊" }] },
  { group: "Moderatsiya", pages: [{ id: "queue", label: "Tasdiqlash navbati", icon: "⏳" }] },
  { group: "Talabalar", pages: [
    { id: "users", label: "Talabalar va mentorlar", icon: "🎓" },
    { id: "submissions", label: "Topshirilgan ishlar", icon: "📝" },
    { id: "tracks", label: "Yo'nalishlar va topshiriqlar", icon: "🧭" },
  ] },
  { group: "Ish bozori", pages: [
    { id: "companies", label: "Kompaniyalar", icon: "🏢" },
    { id: "jobs", label: "Vakansiyalar", icon: "💼" },
    { id: "applications", label: "Arizalar", icon: "📨" },
  ] },
  { group: "Ta'lim", pages: [{ id: "universities", label: "Universitetlar", icon: "🏛️" }] },
  { group: "Aloqa", pages: [
    { id: "announcements", label: "E'lonlar (bot)", icon: "📣" },
    { id: "bot", label: "Telegram bot", icon: "🤖", ownerOnly: true },
  ] },
  { group: "Tizim", pages: [
    { id: "reports", label: "Hisobotlar", icon: "📁" },
    { id: "settings", label: "Sozlamalar", icon: "⚙️" },
    { id: "accounts", label: "Adminlar", icon: "🛡️", ownerOnly: true },
    { id: "audit", label: "Audit jurnali", icon: "🧾" },
    { id: "me", label: "Profilim", icon: "👤" },
  ] },
];
const ALL = MENU.flatMap((g) => g.pages);
const pageFromHash = () => (ALL.some((p) => `#${p.id}` === window.location.hash) ? window.location.hash.slice(1) : "dashboard");

export default function AdminSite() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState(pageFromHash());
  const [menuOpen, setMenuOpen] = useState(false);
  const [queue, setQueue] = useState(0);
  const [userFilter, setUserFilter] = useState<{ id: number; name: string } | null>(null);

  const signOut = useCallback(() => { clearToken(); setMe(null); }, []);
  const loadMe = useCallback(() => {
    setChecking(true);
    api.adminAuth.me().then(setMe, () => setMe(null)).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    setAdminUnauthorizedHandler(signOut);
    const saved = loadToken();
    if (saved) { saveToken(saved); loadMe(); } else setChecking(false);
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [loadMe, signOut]);

  useEffect(() => {
    if (!me) return;
    api.admin.inbox().then((c) => setQueue(c.verifications + c.companies + c.jobs + c.staff), () => {});
  }, [me, page]);

  const go = (id: string) => { window.location.hash = id; setPage(id); setMenuOpen(false); };

  if (checking) return <div className="admin-site"><div className="auth-wrap hint">Yuklanmoqda…</div></div>;
  if (!me) return <div className="admin-site"><AuthScreen onSignedIn={loadMe} /></div>;

  const ctx: AdminCtx = { isOwner: me.is_owner, name: me.name };
  const current = ALL.find((p) => p.id === page && (!p.ownerOnly || me.is_owner)) ?? ALL[0];

  return (
    <div className="admin-site">
      <div className="admin-shell">
        {menuOpen && <div className="admin-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={`admin-side ${menuOpen ? "open" : ""}`}>
          <div className="admin-brand"><i>C</i>CareerFlow</div>
          {MENU.map((g) => {
            const pages = g.pages.filter((p) => !p.ownerOnly || me.is_owner);
            if (pages.length === 0) return null;
            return (
              <div key={g.group || "home"}>
                {g.group && <div className="admin-group">{g.group}</div>}
                {pages.map((p) => (
                  <button key={p.id} className={`admin-link ${current.id === p.id ? "on" : ""}`} onClick={() => go(p.id)}>
                    <span className="ico">{p.icon}</span>{p.label}
                    {p.id === "queue" && queue > 0 && <span className="dot">{queue}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </aside>
        <main className="admin-main">
          <header className="admin-top">
            <button className="admin-burger" aria-label="Menyu" onClick={() => setMenuOpen(true)}>☰</button>
            <h1>{current.label}</h1>
            <div className="who">
              <b>{me.name}</b> · {me.is_owner ? "Ega" : "Admin"}
              <div className="hint email">{me.email}</div>
            </div>
            <button className="btn small ghost" onClick={signOut}>Chiqish</button>
          </header>
          <div className="admin-content">
            {current.id === "dashboard" && <Dashboard go={go} />}
            {current.id === "queue" && <div className="narrow"><Queue ctx={ctx} /></div>}
            {current.id === "users" && <Users ctx={ctx} onShowWork={(u) => { setUserFilter(u); go("submissions"); }} />}
            {current.id === "submissions" && <div className="narrow"><Submissions user={userFilter} onClearUser={() => setUserFilter(null)} /></div>}
            {current.id === "tracks" && <div className="narrow"><Tracks /></div>}
            {current.id === "companies" && <Companies />}
            {current.id === "jobs" && <Jobs />}
            {current.id === "applications" && <Applications />}
            {current.id === "universities" && <div className="narrow"><Universities /></div>}
            {current.id === "announcements" && <div className="narrow"><Announcements /></div>}
            {current.id === "bot" && <div className="narrow"><BotCard /></div>}
            {current.id === "reports" && <div className="narrow"><ExportCard /></div>}
            {current.id === "settings" && <div className="narrow"><RulesCard canEdit={me.is_owner} /><PartnerLinks /></div>}
            {current.id === "accounts" && <Accounts meId={me.id} />}
            {current.id === "audit" && <div className="narrow"><AuditCard /></div>}
            {current.id === "me" && <MyAccount me={me} />}
          </div>
        </main>
      </div>
    </div>
  );
}
