import { useCallback, useEffect, useState } from "react";
import { api, setAdminUnauthorizedHandler } from "../../api";
import "./admin.css";
import { Icon, type IconName } from "../../icons";
import { Accounts, MyAccount } from "./Accounts";
import Announcements from "./Announcements";
import AuthScreen from "./AuthScreen";
import Dashboard from "./Dashboard";
import GroupsAdmin from "./GroupsAdmin";
import ChallengesAdmin from "./ChallengesAdmin";
import { Applications, Companies, Jobs, Tests } from "./Market";
import Queue from "./Queue";
import { AiCard, AiConversations, AuditCard, BotCard, ExportCard, PartnerLinks, RulesCard } from "./Settings";
import Submissions from "./Submissions";
import Tracks from "./Tracks";
import Universities from "./Universities";
import Users from "./Users";
import { Complaints, Outcomes, Partnerships, Ranking } from "./Trust";
import { clearToken, loadToken, saveToken } from "./session";

export interface AdminCtx { isOwner: boolean; name: string }
type Me = { id: number; name: string; email: string; role: string; is_owner: boolean };

// `limited`: which of the two limited roles also see the page (owner and admin see everything not ownerOnly)
type Page = { id: string; label: string; icon: IconName; ownerOnly?: boolean; limited?: ("moderator" | "analyst")[] };
const M = "moderator" as const, A = "analyst" as const;
const ROLE_LABEL: Record<string, string> = { owner: "Ega", admin: "Admin", moderator: "Moderator", analyst: "Tahlilchi" };
const MENU: { group: string; pages: Page[] }[] = [
  { group: "", pages: [{ id: "dashboard", label: "Bosh sahifa", icon: "chart", limited: [M, A] }] },
  { group: "Moderatsiya", pages: [
    { id: "queue", label: "Tasdiqlash navbati", icon: "inbox", limited: [M] },
    { id: "complaints", label: "Shikoyatlar", icon: "flag", limited: [M] },
  ] },
  { group: "Talabalar", pages: [
    { id: "users", label: "Talabalar va mentorlar", icon: "school", limited: [M, A] },
    { id: "submissions", label: "Topshirilgan ishlar", icon: "check", limited: [M, A] },
    { id: "tracks", label: "Yo'nalishlar va topshiriqlar", icon: "path" },
    { id: "challenges", label: "Chellenjlar va vazifalar", icon: "flag", limited: [M, A] },
  ] },
  { group: "Ish bozori", pages: [
    { id: "companies", label: "Kompaniyalar", icon: "building", limited: [M, A] },
    { id: "jobs", label: "Vakansiyalar", icon: "briefcase", limited: [M, A] },
    { id: "tests", label: "Testlar", icon: "check", limited: [M, A] },
    { id: "applications", label: "Arizalar", icon: "inbox", limited: [M, A] },
  ] },
  { group: "Ta'lim", pages: [
    { id: "universities", label: "Universitetlar", icon: "building", limited: [M, A] },
    { id: "outcomes", label: "Bandlik yozuvlari", icon: "briefcase", limited: [M, A] },
    { id: "partnerships", label: "Hamkorliklar", icon: "users", limited: [M, A] },
    { id: "ranking", label: "Reyting", icon: "chart", limited: [M, A] },
  ] },
  { group: "Aloqa", pages: [
    { id: "groups", label: "Guruhlar", icon: "chat", limited: [M] },
    { id: "announcements", label: "E'lonlar (bot)", icon: "send" },
    { id: "bot", label: "Telegram bot", icon: "chat", ownerOnly: true },
    { id: "ai", label: "AI yordamchi", icon: "spark" },
  ] },
  { group: "Tizim", pages: [
    { id: "reports", label: "Hisobotlar", icon: "copy" },
    { id: "settings", label: "Sozlamalar", icon: "lock" },
    { id: "accounts", label: "Adminlar", icon: "verified", ownerOnly: true },
    { id: "audit", label: "Audit jurnali", icon: "copy" },
    { id: "me", label: "Profilim", icon: "user", limited: [M, A] },
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
  const [pendingTests, setPendingTests] = useState(0);
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
    const refresh = () => api.admin.inbox().then((c) => { setQueue(c.verifications + c.companies + c.jobs + c.staff); setPendingTests(c.tests ?? 0); }, () => {});
    void refresh();
    const timer = window.setInterval(refresh, 60000);      // new requests show up without changing page
    return () => window.clearInterval(timer);
  }, [me, page]);

  const go = (id: string) => { window.location.hash = id; setPage(id); setMenuOpen(false); };

  if (checking) return <div className="admin-site"><div className="auth-wrap hint">Yuklanmoqda…</div></div>;
  if (!me) return <div className="admin-site"><AuthScreen onSignedIn={loadMe} /></div>;

  const ctx: AdminCtx = { isOwner: me.is_owner, name: me.name };
  const limitedRole = me.role === "moderator" || me.role === "analyst" ? me.role : null;
  const visible = (p: Page) => (limitedRole ? (p.limited ?? []).includes(limitedRole) : !p.ownerOnly || me.is_owner);
  const current = ALL.find((p) => p.id === page && visible(p)) ?? ALL[0];
  const fullAdmin = !limitedRole;

  return (
    <div className="admin-site">
      <div className="admin-shell">
        {menuOpen && <div className="admin-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={`admin-side ${menuOpen ? "open" : ""}`}>
          <div className="admin-brand"><i>T</i>TalantGo</div>
          {MENU.map((g) => {
            const pages = g.pages.filter(visible);
            if (pages.length === 0) return null;
            return (
              <div key={g.group || "home"}>
                {g.group && <div className="admin-group">{g.group}</div>}
                {pages.map((p) => (
                  <button key={p.id} className={`admin-link ${current.id === p.id ? "on" : ""}`} onClick={() => go(p.id)}>
                    <Icon name={p.icon} size={18} />{p.label}
                    {p.id === "queue" && queue > 0 && <span className="dot">{queue}</span>}
                    {p.id === "tests" && pendingTests > 0 && <span className="dot">{pendingTests}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </aside>
        <main className="admin-main">
          <header className="admin-top">
            <button className="admin-burger" aria-label="Menyu" onClick={() => setMenuOpen(true)}><Icon name="menu" size={18} /></button>
            <h1>{current.label}</h1>
            <div className="who">
              <b>{me.name}</b> · {ROLE_LABEL[me.role] ?? me.role}
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
            {current.id === "tests" && <Tests />}
            {current.id === "applications" && <Applications />}
            {current.id === "universities" && <div className="narrow"><Universities /></div>}
            {current.id === "groups" && <GroupsAdmin />}
            {current.id === "challenges" && <ChallengesAdmin />}
            {current.id === "announcements" && <div className="narrow"><Announcements /></div>}
            {current.id === "bot" && <div className="narrow"><BotCard /></div>}
            {current.id === "ai" && <div className="narrow"><AiCard canEdit={me.is_owner} /><AiConversations /></div>}
            {current.id === "reports" && <div className="narrow"><ExportCard /></div>}
            {current.id === "settings" && <div className="narrow"><RulesCard canEdit={me.is_owner} /><PartnerLinks /></div>}
            {current.id === "accounts" && <Accounts meId={me.id} />}
            {current.id === "audit" && <div className="narrow"><AuditCard /></div>}
            {current.id === "me" && <MyAccount me={me} />}
            {current.id === "complaints" && <Complaints canDecide={me.role !== "analyst"} />}
            {current.id === "ranking" && <Ranking canEdit={fullAdmin} />}
            {current.id === "partnerships" && <Partnerships />}
            {current.id === "outcomes" && <Outcomes />}
          </div>
        </main>
      </div>
    </div>
  );
}
