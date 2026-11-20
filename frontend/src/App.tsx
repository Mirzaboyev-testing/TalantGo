import { useCallback, useEffect, useState } from "react";
import { api, setUserToken, setUserUnauthorizedHandler, type Me } from "./api";
import { initData, insideTelegram } from "./tg";
import { message } from "./ui";
import Onboarding from "./screens/Onboarding";
import StudentSignup from "./screens/student/StudentSignup";
import { MustChangePassword } from "./screens/PasswordRecovery";
import TasksHub, { type TasksView } from "./screens/student/TasksHub";
import StudentProfile from "./screens/student/StudentProfile";
import StudentSettings from "./screens/student/StudentSettings";
import DirectChat from "./screens/student/DirectChat";
import Events from "./screens/student/Events";
import Community from "./screens/student/Community";
import "./screens/student/student.css";
import ProfileScreen from "./screens/Profile";
import JobsScreen from "./screens/Jobs";
import StudentHome from "./screens/StudentHome";
import MyUniversity from "./screens/MyUniversity";
import Welcome from "./screens/Welcome";
import EmployerApp from "./screens/employer/EmployerApp";
import CompanySignup from "./screens/employer/CompanySignup";
import CompanyReview from "./screens/employer/CompanyReview";
import UniversityApp from "./screens/university/UniversityApp";
import UniPending from "./screens/university/UniPending";
import Assistant, { type AiAudience } from "./screens/Assistant";
import Shell, { type ShellTab } from "./screens/Shell";
import WebLogin from "./screens/WebLogin";
import { announceMove } from "./screens/MovedNotice";
import { getLang, hasChosenLang, setLang, t, useLang } from "./i18n";
import { navigate, usePath, useRouteTab } from "./router";
import { courseText } from "./labels";
import PublicSite, { isPublicPath } from "./public/PublicSite";
import { chosenPanel } from "./public/panels";
import { everyVisible } from "./poll";

// A group invite (t.me/<bot>?start=g<code>) opens the app with ?join=<code>.
const joinCode = new URLSearchParams(window.location.search).get("join");

// On the website (outside Telegram) the session survives a page reload.
const TOKEN_KEY = "cf_user_token";
const storeToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ } };
const storedToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
const forgetToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

type Tab = "home" | "jobs" | "applications" | "tasks" | "messages" | "events" | "university" | "community" | "profile" | "settings";
// /talaba/<segment>. Student panel v2 (2026-11-17): applications and tasks have their own sections;
// the older /talaba/yol and /talaba/tekshirish open "Topshiriqlar", /talaba/saqlangan the saved jobs
const STUDENT_TABS: Record<Tab, string> = {
  home: "", jobs: "vakansiyalar", applications: "arizalar", tasks: "topshiriqlar", messages: "xabarlar", events: "tadbirlar",
  university: "universitetim",
  community: "hamjamiyat", profile: "profil", settings: "sozlamalar",
};
let joinHandled = false;
type AuthState = { kind: "loading" } | { kind: "login"; dev: boolean } | { kind: "error"; text: string } | { kind: "ok" };

export default function App() {
  useLang();
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [me, setMe] = useState<Me | null>(null);
  const [changingTrack, setChangingTrack] = useState(false);
  const [chosenStudent, setChosenStudent] = useState(false);
  const refreshMe = useCallback(async () => setMe(await api.me()), []);
  const path = usePath();

  const showLogin = useCallback(() => {
    api.mode().then((m) => setAuth({ kind: "login", dev: m.dev }), () => setAuth({ kind: "login", dev: false }));
  }, []);

  const signIn = useCallback(async (getToken: () => Promise<{ token: string; moved_to?: string | null }>) => {
    try {
      const { token, moved_to } = await getToken();
      setUserToken(token);
      if (moved_to) announceMove(moved_to);       // opened from the old bot
      if (!insideTelegram) storeToken(token);
      await refreshMe();
      setAuth({ kind: "ok" });
    } catch (e) {
      setAuth({ kind: "error", text: message(e) });
    }
  }, [refreshMe]);

  const logout = useCallback(() => {
    forgetToken();
    setUserToken("");
    setMe(null);
    navigate("/", { replace: true });     // the next person starts on the home screen
    showLogin();
  }, [showLogin]);

  // an expired website session goes back to the sign-in screen instead of failing on every screen; inside Telegram
  // (a password changed on the website ends this session too) the Mini App signs in again with Telegram, once a minute
  // at most, instead of failing on every call until it is reopened
  useEffect(() => {
    if (!insideTelegram) { setUserUnauthorizedHandler(logout); return; }
    let last = 0;
    setUserUnauthorizedHandler(() => {
      if (Date.now() - last < 60_000) return;
      last = Date.now();
      void signIn(() => api.telegramLogin(initData));
    });
  }, [logout, signIn]);

  useEffect(() => {
    if (insideTelegram) {
      void signIn(() => api.telegramLogin(initData));
      return;
    }
    const saved = storedToken();
    if (!saved) return showLogin();
    setUserToken(saved);
    refreshMe().then(() => setAuth({ kind: "ok" }), () => { forgetToken(); showLogin(); });
  }, [signIn, refreshMe, showLogin]);

  // the language saved in the profile applies on a device where nobody picked one yet
  const savedLanguage = me?.language;
  useEffect(() => {
    if (savedLanguage && !hasChosenLang() && savedLanguage !== getLang()) setLang(savedLanguage, false);
  }, [savedLanguage]);

  // a panel page needs an account: that panel's sign-in page first, then back to the page;
  // after signing in on /kirish/... the person goes to `next` (or their panel)
  useEffect(() => {
    const live = window.location.pathname;           // effects of child panels may have moved it already
    if (auth.kind === "login" && !insideTelegram && !isPublicPath(live)) {
      const panel = live.startsWith("/korxona") ? "korxona" : live.startsWith("/universitet") ? "universitet" : "talaba";
      navigate(`/kirish/${panel}?next=${encodeURIComponent(live + window.location.search)}`, { replace: true });
    }
    if (auth.kind === "ok" && (path.startsWith("/kirish") || new URLSearchParams(window.location.search).has("next"))) {
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      navigate(next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    }
  }, [auth.kind, path]);

  if (auth.kind === "loading") return <div className="center hint">{t("common.loading")}</div>;
  const devLogin = (id: number, name: string) => signIn(() => api.devLogin(id, name));
  if (auth.kind === "login") {
    if (insideTelegram) return <WebLogin dev={auth.dev} onSignIn={signIn} onDev={devLogin} />;
    return <PublicSite me={null} dev={auth.dev} onSignIn={signIn} onDev={devLogin} />;
  }
  if (auth.kind === "error") {
    return (
      <div className="center"><div className="stack" style={{ maxWidth: 360 }}>
        <h1>{t("s.app.login_failed")}</h1>
        <p className="error">{auth.text}</p>
        <button className="btn ghost" onClick={() => (insideTelegram ? window.location.reload() : logout())}>{t("s.app.retry")}</button>
      </div></div>
    );
  }
  if (!me) return null;
  // signed-in people can still browse the public jobs and companies; "/" and /kirish lead to their panel
  // (inside the Telegram Mini App too: recommended jobs and notices open /vakansiyalar/:id)
  if (isPublicPath(path) && path !== "/" && !path.startsWith("/kirish")) {
    return <PublicSite me={me} dev={false} onSignIn={signIn} onDev={devLogin} />;
  }

  // signed in with the owner's temporary password: a new password before any panel (every panel, the same rule)
  if (me.must_change_password) return <MustChangePassword me={me} onDone={setMe} onLogout={logout} />;

  // Careerup AI is there from the first screen: people ask how to sign up, then how to use their part of the app
  const audience: AiAudience = me.account_type === "employer" ? "employer"
    : me.account_type === "university" || me.signup_missing.length > 0 ? "signup" : "student";
  const ai = <Assistant key={`${me.id}-${audience}`} audience={audience} />;

  // Employers: the sign-up form until every required field is filled, then the admin check, then their app.
  if (me.account_type === "employer") {
    if (me.signup_missing.length > 0) return <>{ai}<CompanySignup me={me} onSaved={setMe} onLogout={logout} /></>;
    return <>{ai}{me.company?.status === "approved"
      ? <EmployerApp me={me} onChanged={setMe} onLogout={logout} />
      : <CompanyReview me={me} onChanged={setMe} onLogout={logout} />}</>;
  }
  if (me.account_type === "university") {
    return <>{ai}{me.staff_status === "approved"
      ? <UniversityApp me={me} onMe={setMe} onLogout={logout} />
      : <div className="app"><UniPending me={me} onChanged={setMe} onLogout={logout} /></div>}</>;
  }
  // a brand-new account first chooses: job seeker or employer (the panel picked on the website decides it)
  const isNew = !me.track && !me.has_consent;
  const intent = chosenPanel();
  if (isNew && !chosenStudent && intent !== "talaba") {
    const partnerRole = new URLSearchParams(window.location.search).get("role");
    const initial = partnerRole === "employer" || partnerRole === "university" ? partnerRole
      : intent === "korxona" ? "employer" : intent === "universitet" ? "university" : null;
    return <>{ai}<div className="app"><Welcome me={me} initial={initial}
                                         onStudent={() => setChosenStudent(true)} onChanged={setMe} onLogout={logout} /></div></>;
  }

  // students stay on the three-step sign-up until every required field is filled (mentors keep the older form)
  if (me.role === "student" && me.signup_missing.length > 0) {
    return <>{ai}<StudentSignup me={me} onMe={setMe} onDone={async () => { await refreshMe(); navigate("/talaba"); }}
                                onBack={isNew ? () => setChosenStudent(false) : undefined} onLogout={logout} /></>;
  }
  if (me.signup_missing.length > 0 || changingTrack) {
    return (
      <>
      {ai}
      <div className="app">
        {isNew && <button className="btn small ghost" onClick={() => setChosenStudent(false)}>{t("common.back")}</button>}
        <Onboarding me={me} onMe={setMe} onDone={async () => { await refreshMe(); setChangingTrack(false); navigate(isNew ? "/talaba/profil" : "/talaba"); }}
                    onCancel={changingTrack && me.signup_missing.length === 0 ? () => setChangingTrack(false) : undefined} />
      </div>
      </>
    );
  }

  return <>{ai}<StudentApp me={me} refreshMe={refreshMe} setMe={setMe} onChangeTrack={() => setChangingTrack(true)} onLogout={logout} /></>;
}

function StudentApp({ me, refreshMe, setMe, onChangeTrack, onLogout }: {
  me: Me; refreshMe: () => Promise<void>; setMe: (m: Me) => void; onChangeTrack: () => void; onLogout: () => void;
}) {
  useLang();
  const [tab, setTab, segment] = useRouteTab<Tab>("/talaba", STUDENT_TABS, "home", { saqlangan: "jobs", yol: "tasks", tekshirish: "tasks" });
  // the part after the section: /talaba/vakansiyalar/saqlangan, /talaba/topshiriqlar/testlar
  const sub = usePath().split("/")[3] ?? "";
  // tests moved from Arizalarim to Topshiriqlar (2026-11-19): older links still land on them
  useEffect(() => { if (segment === "arizalar" && sub === "testlar") navigate("/talaba/topshiriqlar/testlar", { replace: true }); }, [segment, sub]);
  const tasksView: TasksView | undefined = segment === "tekshirish" ? "review" : segment === "yol" ? "weekly" : sub === "testlar" ? "tests" : undefined;
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const refreshUnread = useCallback(() => api.groups.unread().then((r) => setUnread(r.unread), () => {}), []);
  const refreshChats = useCallback(() => api.chatUnread().then((r) => setChatUnread(r.unread), () => {}), []);

  // a group invite (?join=) opens the community once
  useEffect(() => {
    if (joinCode && !joinHandled) { joinHandled = true; navigate(`/talaba/hamjamiyat${window.location.search}`, { replace: true }); }
  }, []);

  // unread group messages on the community tab, refreshed every 30 seconds
  useEffect(() => {
    void refreshUnread(); void refreshChats();
    return everyVisible(() => { void refreshUnread(); void refreshChats(); }, 30000);
  }, [refreshUnread, refreshChats]);

  const seeker = me.role === "student";
  const main = t("st.nav.main"), mine = t("st.nav.mine");
  // the phone's bottom bar shows the first four; the rest open from "Ko'proq"
  const tabs: ShellTab<Tab>[] = [
    { id: "home", icon: "home", label: t("nav.student.home"), group: main },
    { id: "jobs", icon: "briefcase", label: t("nav.student.jobs"), group: main },
    { id: "tasks", icon: "target", label: seeker ? t("st.nav.tasks") : t("nav.student.mentor"), group: main },
    { id: "applications", icon: "inbox", label: t("st.nav.applications"), group: main },
    { id: "messages", icon: "chat", label: t("st.nav.messages"), badge: chatUnread, group: main },
    { id: "events", icon: "calendar", label: t("st.nav.events"), group: main },
    { id: "university", icon: "school", label: t("nav.student.university"), group: mine },
    { id: "community", icon: "users", label: t("nav.student.community"), badge: unread, group: mine },
    { id: "profile", icon: "user", label: t("st.nav.profile"), group: mine },
    { id: "settings", icon: "settings", label: t("st.nav.settings"), bottom: true },
  ];
  const subtitle = seeker ? me.headline || [me.university_ref?.short_name, me.course ? courseText(me.course) : ""].filter(Boolean).join(" · ")
    : t("nav.student.mentor");

  return (
    <Shell tabs={tabs} active={tab} onChange={setTab} onLogout={onLogout} wide onUser={() => setTab("profile")}
           phoneBar={["home", "jobs", "tasks", "messages"]}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: subtitle || undefined, verified: me.verification === "verified" }}>
      {tab === "home" && <StudentHome me={me} />}
      {tab === "tasks" && <TasksHub key={`tasks-${segment}-${sub}`} me={me} onChanged={refreshMe} initial={tasksView} />}
      {tab === "university" && <MyUniversity me={me} />}
      {tab === "messages" && <DirectChat side="student" onUnread={refreshChats} />}
      {tab === "events" && <Events />}
      {tab === "jobs" && <JobsScreen key={`jobs-${segment}-${sub}`} me={me} views={["jobs", "saved"]}
                                     initialView={segment === "saqlangan" || sub === "saqlangan" ? "saved" : "jobs"}
                                     onOpenProfile={() => setTab("profile")} />}
      {tab === "applications" && <JobsScreen key="applications" me={me} views={["mine"]} initialView="mine"
                                             onOpenProfile={() => setTab("profile")} />}
      {tab === "community" && <Community me={me} joinCode={joinCode} onUnreadChange={refreshUnread} />}
      {tab === "profile" && (seeker ? <StudentProfile me={me} onSaved={setMe} />
        : <div className="st-legacy"><ProfileScreen me={me} onSaved={setMe} onChangeTrack={onChangeTrack} /></div>)}
      {tab === "settings" && <StudentSettings me={me} onSaved={setMe} onLogout={onLogout} />}
    </Shell>
  );
}
