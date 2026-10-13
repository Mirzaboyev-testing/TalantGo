import { useCallback, useEffect, useState } from "react";
import { api, setUserToken, type Me } from "./api";
import { initData, insideTelegram } from "./tg";
import { message } from "./ui";
import Onboarding from "./screens/Onboarding";
import PathScreen from "./screens/Path";
import ReviewScreen from "./screens/Review";
import PeersScreen from "./screens/Peers";
import LeaderboardScreen from "./screens/Leaderboard";
import ProfileScreen from "./screens/Profile";
import JobsScreen from "./screens/Jobs";
import Welcome, { PendingScreen } from "./screens/Welcome";
import EmployerApp from "./screens/employer/EmployerApp";
import EmployerSignup from "./screens/employer/EmployerSignup";
import UniversityApp from "./screens/university/UniversityApp";
import Groups from "./screens/Groups";
import Assistant, { type AiAudience } from "./screens/Assistant";
import Shell, { type ShellTab } from "./screens/Shell";
import WebLogin from "./screens/WebLogin";
import { announceMove } from "./screens/MovedNotice";

// A group invite (t.me/<bot>?start=g<code>) opens the app with ?join=<code>.
const joinCode = new URLSearchParams(window.location.search).get("join");

// On the website (outside Telegram) the session survives a page reload.
const TOKEN_KEY = "cf_user_token";
const storeToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ } };
const storedToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
const forgetToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

type Tab = "path" | "jobs" | "review" | "community" | "profile";
type AuthState = { kind: "loading" } | { kind: "login"; dev: boolean } | { kind: "error"; text: string } | { kind: "ok" };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>(joinCode ? "community" : "path");
  const [unread, setUnread] = useState(0);
  const [changingTrack, setChangingTrack] = useState(false);
  const [chosenStudent, setChosenStudent] = useState(false);
  const [communityView, setCommunityView] = useState<"groups" | "peers" | "top">("groups");
  const refreshUnread = useCallback(() => api.groups.unread().then((r) => setUnread(r.unread), () => {}), []);
  const refreshMe = useCallback(async () => setMe(await api.me()), []);

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
    setTab("path");                 // the next person starts on the home screen
    setCommunityView("groups");
    showLogin();
  }, [showLogin]);

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

  // unread group messages on the community tab, refreshed every 30 seconds
  useEffect(() => {
    if (auth.kind !== "ok") return;
    void refreshUnread();
    const timer = setInterval(refreshUnread, 30000);
    return () => clearInterval(timer);
  }, [auth.kind, refreshUnread]);

  if (auth.kind === "loading") return <div className="center hint">Yuklanmoqda…</div>;
  if (auth.kind === "login") {
    return <WebLogin dev={auth.dev} onTelegram={(u) => signIn(() => api.telegramWebLogin(u))}
                     onDev={(id, name) => signIn(() => api.devLogin(id, name))} />;
  }
  if (auth.kind === "error") {
    return (
      <div className="center"><div className="stack" style={{ maxWidth: 360 }}>
        <h1>Kirib bo'lmadi</h1>
        <p className="error">{auth.text}</p>
        <button className="btn ghost" onClick={() => (insideTelegram ? window.location.reload() : logout())}>Qayta urinish</button>
      </div></div>
    );
  }
  if (!me) return null;

  // TalantGo AI is there from the first screen: people ask how to sign up, then how to use their part of the app
  const audience: AiAudience = me.account_type === "employer" ? "employer"
    : me.account_type === "university" || me.signup_missing.length > 0 ? "signup" : "student";
  const ai = <Assistant key={`${me.id}-${audience}`} audience={audience} />;

  // Employers: the sign-up form until every required field is filled, then the admin check, then their app.
  if (me.account_type === "employer") {
    if (me.signup_missing.length > 0) return <>{ai}<div className="app"><EmployerSignup me={me} onSaved={setMe} /></div></>;
    return <>{ai}{me.company?.status === "approved"
      ? <EmployerApp me={me} onChanged={setMe} onLogout={logout} />
      : <div className="app"><PendingScreen me={me} onChanged={setMe} /></div>}</>;
  }
  if (me.account_type === "university") {
    return <>{ai}{me.staff_status === "approved"
      ? <UniversityApp me={me} onLogout={logout} />
      : <div className="app"><PendingScreen me={me} onChanged={setMe} /></div>}</>;
  }
  // a brand-new account first chooses: job seeker or employer
  const isNew = !me.track && !me.has_consent;
  if (isNew && !chosenStudent) {
    const partnerRole = new URLSearchParams(window.location.search).get("role");
    return <>{ai}<div className="app"><Welcome me={me} initial={partnerRole === "employer" || partnerRole === "university" ? partnerRole : null}
                                         onStudent={() => setChosenStudent(true)} onChanged={setMe} /></div></>;
  }

  // job seekers stay on the sign-up form until every required field is filled
  if (me.signup_missing.length > 0 || changingTrack) {
    return (
      <>
      {ai}
      <div className="app">
        {isNew && <button className="btn small ghost" onClick={() => setChosenStudent(false)}>Orqaga</button>}
        <Onboarding me={me} onMe={setMe} onDone={async () => { await refreshMe(); setChangingTrack(false); setTab(isNew ? "profile" : "path"); }}
                    onCancel={changingTrack && me.signup_missing.length === 0 ? () => setChangingTrack(false) : undefined} />
      </div>
      </>
    );
  }

  const tabs: ShellTab<Tab>[] = [
    { id: "path", icon: "path", label: "Yo'l" },
    { id: "jobs", icon: "briefcase", label: "Vakansiyalar" },
    { id: "review", icon: "check", label: me.role === "student" ? "Tekshirish" : "Mentor" },
    { id: "community", icon: "users", label: "Hamjamiyat", badge: unread },
    { id: "profile", icon: "user", label: "Profil" },
  ];
  const subtitle = me.role === "student" ? me.headline || me.track?.title.split(":")[0] : "Mentor";

  return (
    <>
    {ai}
    <Shell tabs={tabs} active={tab} onChange={setTab} onLogout={logout}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: subtitle ?? undefined }}>
      {tab === "path" && <PathScreen me={me} onChanged={refreshMe} onChangeTrack={() => setChangingTrack(true)} />}
      {tab === "review" && <ReviewScreen me={me} onChanged={refreshMe} />}
      {tab === "jobs" && <JobsScreen me={me} onOpenProfile={() => setTab("profile")} />}
      {tab === "community" && (
        <>
          <div className="segmented">
            <button className={communityView === "groups" ? "on" : ""} onClick={() => setCommunityView("groups")}>Guruhlar</button>
            <button className={communityView === "peers" ? "on" : ""} onClick={() => setCommunityView("peers")}>Tengdoshlar</button>
            <button className={communityView === "top" ? "on" : ""} onClick={() => setCommunityView("top")}>Reyting</button>
          </div>
          {communityView === "groups" && <Groups joinCode={joinCode} onUnreadChange={refreshUnread} />}
          {communityView === "peers" && <PeersScreen me={me} />}
          {communityView === "top" && <LeaderboardScreen />}
        </>
      )}
      {tab === "profile" && <ProfileScreen me={me} onSaved={setMe} onChangeTrack={() => setChangingTrack(true)} />}
    </Shell>
    </>
  );
}
