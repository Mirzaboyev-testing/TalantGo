import { useCallback, useEffect, useState } from "react";
import { api, setUserToken, setUserUnauthorizedHandler, type Me } from "./api";
import { initData, insideTelegram } from "./tg";
import { message } from "./ui";
import Onboarding from "./screens/Onboarding";
import PathScreen from "./screens/Path";
import ReviewScreen from "./screens/Review";
import PeersScreen from "./screens/Peers";
import LeaderboardScreen from "./screens/Leaderboard";
import ProfileScreen from "./screens/Profile";
import JobsScreen from "./screens/Jobs";
import StudentHome from "./screens/StudentHome";
import MyUniversity from "./screens/MyUniversity";
import Welcome, { PendingScreen } from "./screens/Welcome";
import EmployerApp from "./screens/employer/EmployerApp";
import EmployerSignup from "./screens/employer/EmployerSignup";
import UniversityApp from "./screens/university/UniversityApp";
import Groups from "./screens/Groups";
import Assistant, { type AiAudience } from "./screens/Assistant";
import Shell, { type ShellTab } from "./screens/Shell";
import WebLogin from "./screens/WebLogin";
import { announceMove } from "./screens/MovedNotice";
import { getLang, hasChosenLang, setLang, t, useLang } from "./i18n";
import { navigate, usePath, useRouteTab } from "./router";
import PublicSite, { isPublicPath } from "./public/PublicSite";
import { chosenPanel } from "./public/panels";

// A group invite (t.me/<bot>?start=g<code>) opens the app with ?join=<code>.
const joinCode = new URLSearchParams(window.location.search).get("join");

// On the website (outside Telegram) the session survives a page reload.
const TOKEN_KEY = "cf_user_token";
const storeToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ } };
const storedToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
const forgetToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

type Tab = "home" | "path" | "jobs" | "review" | "university" | "community" | "profile";
// /talaba/<segment>; /talaba/arizalar and /talaba/saqlangan open the jobs tab on that view
const STUDENT_TABS: Record<Tab, string> = {
  home: "", path: "yol", jobs: "vakansiyalar", review: "tekshirish", university: "universitetim", community: "hamjamiyat", profile: "profil",
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

  // an expired website session goes back to the sign-in screen instead of failing on every screen
  useEffect(() => { if (!insideTelegram) setUserUnauthorizedHandler(logout); }, [logout]);

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
  if (!insideTelegram && isPublicPath(path) && path !== "/" && !path.startsWith("/kirish")) {
    return <PublicSite me={me} dev={false} onSignIn={signIn} onDev={devLogin} />;
  }

  // TalantGo AI is there from the first screen: people ask how to sign up, then how to use their part of the app
  const audience: AiAudience = me.account_type === "employer" ? "employer"
    : me.account_type === "university" || me.signup_missing.length > 0 ? "signup" : "student";
  const ai = <Assistant key={`${me.id}-${audience}`} audience={audience} />;

  // Employers: the sign-up form until every required field is filled, then the admin check, then their app.
  if (me.account_type === "employer") {
    if (me.signup_missing.length > 0) return <>{ai}<div className="app"><EmployerSignup me={me} onSaved={setMe} onLogout={logout} /></div></>;
    return <>{ai}{me.company?.status === "approved"
      ? <EmployerApp me={me} onChanged={setMe} onLogout={logout} />
      : <div className="app"><PendingScreen me={me} onChanged={setMe} onLogout={logout} /></div>}</>;
  }
  if (me.account_type === "university") {
    return <>{ai}{me.staff_status === "approved"
      ? <UniversityApp me={me} onLogout={logout} />
      : <div className="app"><PendingScreen me={me} onChanged={setMe} onLogout={logout} /></div>}</>;
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

  // job seekers stay on the sign-up form until every required field is filled
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
  const [tab, setTab, segment] = useRouteTab<Tab>("/talaba", STUDENT_TABS, "home", { arizalar: "jobs", saqlangan: "jobs" });
  const [unread, setUnread] = useState(0);
  const [communityView, setCommunityView] = useState<"groups" | "peers" | "top">("groups");
  const refreshUnread = useCallback(() => api.groups.unread().then((r) => setUnread(r.unread), () => {}), []);

  // a group invite (?join=) opens the community once
  useEffect(() => {
    if (joinCode && !joinHandled) { joinHandled = true; navigate(`/talaba/hamjamiyat${window.location.search}`, { replace: true }); }
  }, []);

  // unread group messages on the community tab, refreshed every 30 seconds
  useEffect(() => {
    void refreshUnread();
    const timer = setInterval(refreshUnread, 30000);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  const tabs: ShellTab<Tab>[] = [
    { id: "home", icon: "home", label: t("nav.student.home") },
    { id: "path", icon: "path", label: t("nav.student.path") },
    { id: "jobs", icon: "briefcase", label: t("nav.student.jobs") },
    { id: "review", icon: "check", label: t(me.role === "student" ? "nav.student.review" : "nav.student.mentor") },
    { id: "university", icon: "school", label: t("nav.student.university") },
    { id: "community", icon: "users", label: t("nav.student.community"), badge: unread },
    { id: "profile", icon: "user", label: t("nav.student.profile") },
  ];
  const subtitle = me.role === "student" ? me.headline || me.track?.title.split(":")[0] : t("nav.student.mentor");

  return (
    <Shell tabs={tabs} active={tab} onChange={setTab} onLogout={onLogout}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: subtitle ?? undefined }}>
      {tab === "home" && <StudentHome me={me} />}
      {tab === "path" && <PathScreen me={me} onChanged={refreshMe} onChangeTrack={onChangeTrack} />}
      {tab === "review" && <ReviewScreen me={me} onChanged={refreshMe} />}
      {tab === "university" && <MyUniversity me={me} />}
      {tab === "jobs" && <JobsScreen key={segment} me={me}
                                     initialView={segment === "arizalar" ? "mine" : segment === "saqlangan" ? "saved" : "jobs"}
                                     onOpenProfile={() => setTab("profile")} />}
      {tab === "community" && (
        <>
          <div className="segmented">
            <button className={communityView === "groups" ? "on" : ""} onClick={() => setCommunityView("groups")}>{t("s.community.groups")}</button>
            <button className={communityView === "peers" ? "on" : ""} onClick={() => setCommunityView("peers")}>{t("s.community.peers")}</button>
            <button className={communityView === "top" ? "on" : ""} onClick={() => setCommunityView("top")}>{t("s.community.top")}</button>
          </div>
          {communityView === "groups" && <Groups joinCode={joinCode} onUnreadChange={refreshUnread} />}
          {communityView === "peers" && <PeersScreen me={me} />}
          {communityView === "top" && <LeaderboardScreen />}
        </>
      )}
      {tab === "profile" && <ProfileScreen me={me} onSaved={setMe} onChangeTrack={onChangeTrack} />}
    </Shell>
  );
}
