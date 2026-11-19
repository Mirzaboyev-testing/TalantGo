import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setAdminUnauthorizedHandler, type AdminMe } from "../../api";
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
import AdminBell from "./AdminBell";
import PasswordRequests from "./PasswordRequests";
import { AiCard, AiConversations, AuditCard, BotCard, ExportCard, PartnerLinks, RulesCard } from "./Settings";
import Submissions from "./Submissions";
import Tracks from "./Tracks";
import Universities from "./Universities";
import SiteContent from "./SiteContent";
import PostsAdmin from "./PostsAdmin";
import Users from "./Users";
import { Complaints, Outcomes, Partnerships, Ranking } from "./Trust";
import { clearToken, loadToken, saveToken } from "./session";
import { BrandLogo } from "../../brand";

export interface AdminCtx { isOwner: boolean; name: string; can: (permission: string) => boolean }
type Me = AdminMe;

/** What the signed-in account may do (switched on by the owner in "Adminlar"); the server checks it again. */
const CanContext = createContext<(permission: string) => boolean>(() => false);
export const useCan = () => useContext(CanContext);

// `need`: the page shows only with one of these permissions; without it every active account sees the page
type Page = { id: string; label: string; icon: IconName; ownerOnly?: boolean; need?: string[] };
const APPROVALS = ["students", "companies", "universities", "jobs"];
const ROLE_LABEL: Record<string, string> = { owner: "Ega", admin: "Admin", moderator: "Moderator", analyst: "Tahlilchi" };
const MENU: { group: string; pages: Page[] }[] = [
  { group: "", pages: [{ id: "dashboard", label: "Bosh sahifa", icon: "chart" }] },
  { group: "Moderatsiya", pages: [
    { id: "queue", label: "Tasdiqlash navbati", icon: "inbox", need: APPROVALS },
    { id: "complaints", label: "Shikoyatlar", icon: "flag", need: ["complaints"] },
    { id: "posts", label: "Postlar", icon: "megaphone", need: ["complaints", "posts"] },
  ] },
  { group: "Talabalar", pages: [
    { id: "users", label: "Talabalar va mentorlar", icon: "school" },
    { id: "submissions", label: "Topshirilgan ishlar", icon: "check" },
    { id: "tracks", label: "Yo'nalishlar va topshiriqlar", icon: "path", need: ["content"] },
    { id: "challenges", label: "Chellenjlar va vazifalar", icon: "flag" },
  ] },
  { group: "Ish bozori", pages: [
    { id: "companies", label: "Kompaniyalar", icon: "building" },
    { id: "jobs", label: "Vakansiyalar", icon: "briefcase" },
    { id: "tests", label: "Testlar", icon: "check" },
    { id: "applications", label: "Arizalar", icon: "inbox" },
  ] },
  { group: "Ta'lim", pages: [
    { id: "universities", label: "Universitetlar", icon: "building" },
    { id: "outcomes", label: "Bandlik yozuvlari", icon: "briefcase" },
    { id: "partnerships", label: "Hamkorliklar", icon: "users" },
    { id: "ranking", label: "Reyting", icon: "chart" },
  ] },
  { group: "Aloqa", pages: [
    { id: "groups", label: "Guruhlar", icon: "chat", need: ["groups"] },
    { id: "site", label: "Sayt kontenti", icon: "globe", need: ["site"] },
    { id: "announcements", label: "E'lonlar (bot)", icon: "send", need: ["announcements"] },
    { id: "bot", label: "Telegram bot", icon: "chat", ownerOnly: true },
    { id: "ai", label: "AI yordamchi", icon: "spark", need: ["settings", "ai_chats"] },
  ] },
  { group: "Tizim", pages: [
    { id: "reports", label: "Hisobotlar", icon: "copy", need: ["reports"] },
    { id: "settings", label: "Sozlamalar", icon: "lock", need: ["settings"] },
    { id: "accounts", label: "Adminlar", icon: "verified", ownerOnly: true },
    { id: "audit", label: "Audit jurnali", icon: "copy", need: ["audit"] },
    { id: "me", label: "Profilim", icon: "user" },
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
  const [openComplaints, setOpenComplaints] = useState(0);
  const [passwordRequests, setPasswordRequests] = useState(0);
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
    const refresh = () => api.admin.inbox().then((c) => {
      setQueue(c.verifications + c.companies + c.jobs + c.staff);
      setPendingTests(c.tests ?? 0);
      setOpenComplaints(c.complaints ?? 0);
      setPasswordRequests(c.password_requests ?? 0);
    }, () => {});
    void refresh();
    const timer = window.setInterval(refresh, 60000);      // new requests show up without changing page
    return () => window.clearInterval(timer);
  }, [me, page]);

  const go = (id: string) => { window.location.hash = id; setPage(id); setMenuOpen(false); };

  if (checking) return <div className="admin-site"><div className="auth-wrap hint">Yuklanmoqda…</div></div>;
  if (!me) return <div className="admin-site"><AuthScreen onSignedIn={loadMe} /></div>;

  const can = (permission: string) => me.is_owner || me.permissions.includes(permission);
  const ctx: AdminCtx = { isOwner: me.is_owner, name: me.name, can };
  const visible = (p: Page) => (p.ownerOnly ? me.is_owner : !p.need || p.need.some(can));
  const current = ALL.find((p) => p.id === page && visible(p)) ?? ALL[0];

  return (
    <CanContext.Provider value={can}>
    <div className="admin-site">
      <div className="admin-shell">
        {menuOpen && <div className="admin-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={`admin-side ${menuOpen ? "open" : ""}`}>
          <div className="admin-brand"><BrandLogo size={36} suffix="admin" /></div>
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
                    {p.id === "complaints" && openComplaints > 0 && <span className="dot">{openComplaints}</span>}
                    {p.id === "users" && passwordRequests > 0 && <span className="dot" title="Parol tiklash so'rovlari">{passwordRequests}</span>}
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
            <AdminBell go={go} />
            <button className="btn small ghost" onClick={signOut}>Chiqish</button>
          </header>
          <div className="admin-content">
            {current.id === "dashboard" && <Dashboard go={go} />}
            {current.id === "queue" && <div className="narrow"><Queue ctx={ctx} /></div>}
            {current.id === "users" && ctx.isOwner && <div className="narrow"><PasswordRequests onChanged={() => setPasswordRequests((n) => Math.max(0, n - 1))} /></div>}
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
            {current.id === "site" && <div className="narrow"><SiteContent /></div>}
            {current.id === "bot" && <div className="narrow"><BotCard /></div>}
            {current.id === "ai" && <div className="narrow">{can("settings") && <AiCard canEdit={me.is_owner} />}{can("ai_chats") && <AiConversations />}</div>}
            {current.id === "reports" && <div className="narrow"><ExportCard /></div>}
            {current.id === "settings" && <div className="narrow"><RulesCard canEdit={me.is_owner} /><PartnerLinks /></div>}
            {current.id === "accounts" && <Accounts meId={me.id} />}
            {current.id === "audit" && <div className="narrow"><AuditCard /></div>}
            {current.id === "me" && <MyAccount me={me} />}
            {current.id === "complaints" && <Complaints canDecide={can("complaints")} />}
            {current.id === "posts" && <PostsAdmin canDecide={can("complaints") || can("posts")} />}
            {current.id === "ranking" && <Ranking canEdit={can("ranking")} />}
            {current.id === "partnerships" && <Partnerships />}
            {current.id === "outcomes" && <Outcomes />}
          </div>
        </main>
      </div>
    </div>
    </CanContext.Provider>
  );
}
