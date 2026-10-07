import { useCallback, useEffect, useState } from "react";
import { api, setUserToken, type Me } from "./api";
import { BOT_URL, initData, insideTelegram } from "./tg";
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
import UniversityApp from "./screens/university/UniversityApp";
import Groups from "./screens/Groups";

// A group invite (t.me/<bot>?start=g<code>) opens the app with ?join=<code>.
const joinCode = new URLSearchParams(window.location.search).get("join");

type Tab = "path" | "jobs" | "review" | "community" | "profile";
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "path", icon: "🧭", label: "Yo'l" },
  { id: "jobs", icon: "💼", label: "Vakansiyalar" },
  { id: "review", icon: "✅", label: "Tekshirish" },
  { id: "community", icon: "🤝", label: "Hamjamiyat" },
  { id: "profile", icon: "👤", label: "Profil" },
];

type AuthState = { kind: "loading" } | { kind: "outside" } | { kind: "dev" } | { kind: "error"; text: string } | { kind: "ok" };

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

  const signIn = useCallback(async (getToken: () => Promise<{ token: string }>) => {
    try {
      setUserToken((await getToken()).token);
      await refreshMe();
      setAuth({ kind: "ok" });
    } catch (e) {
      setAuth({ kind: "error", text: message(e) });
    }
  }, [refreshMe]);

  useEffect(() => {
    if (insideTelegram) {
      void signIn(() => api.telegramLogin(initData));
      return;
    }
    // Outside Telegram: the dev sign-in exists only when the server runs with APP_ENV=dev
    api.mode().then(
      (m) => setAuth({ kind: m.dev ? "dev" : "outside" }),
      (e) => setAuth({ kind: "error", text: message(e) }),
    );
  }, [signIn]);

  // unread group messages on the Hamjamiyat tab, refreshed every 30 seconds
  useEffect(() => {
    if (auth.kind !== "ok") return;
    void refreshUnread();
    const timer = setInterval(refreshUnread, 30000);
    return () => clearInterval(timer);
  }, [auth.kind, refreshUnread]);

  if (auth.kind === "loading") return <div className="center hint">Yuklanmoqda…</div>;
  if (auth.kind === "outside") {
    return (
      <div className="center">
        <div className="stack">
          <h1>CareerFlow</h1>
          <p className="hint">Ilova Telegram ichida ishlaydi.</p>
          <a className="btn" href={BOT_URL}>Telegram'da ochish</a>
        </div>
      </div>
    );
  }
  if (auth.kind === "error") return <div className="center"><div><h1>Kirib bo'lmadi</h1><p className="error">{auth.text}</p></div></div>;
  if (auth.kind === "dev") return <DevLogin onLogin={(id, name) => signIn(() => api.devLogin(id, name))} />;
  if (!me) return null;

  // Employers and university staff get their own apps once an admin has checked them.
  if (me.account_type === "employer") {
    return me.company?.status === "approved"
      ? <EmployerApp me={me} onChanged={setMe} />
      : <div className="app"><PendingScreen me={me} onChanged={setMe} /></div>;
  }
  if (me.account_type === "university") {
    return me.staff_status === "approved"
      ? <UniversityApp me={me} />
      : <div className="app"><PendingScreen me={me} onChanged={setMe} /></div>;
  }
  const partnerRole = new URLSearchParams(window.location.search).get("role");
  if (partnerRole && !me.track && !me.has_consent && !chosenStudent) {
    return <div className="app"><Welcome me={me} initial={partnerRole === "employer" || partnerRole === "university" ? partnerRole : null}
                                               onStudent={() => setChosenStudent(true)} onChanged={setMe} /></div>;
  }

  const incomplete = !me.track || !me.university_ref || !me.course || !me.faculty || !me.phone || !me.has_consent;
  if (incomplete || changingTrack) {
    return (
      <div className="app">
        <Onboarding me={me} onMe={setMe} onDone={async () => { await refreshMe(); setChangingTrack(false); setTab("path"); }}
                    onCancel={changingTrack && !incomplete ? () => setChangingTrack(false) : undefined} />
      </div>
    );
  }


  return (
    <>
      <div className="app">
        {tab === "path" && <PathScreen me={me} onChanged={refreshMe} onChangeTrack={() => setChangingTrack(true)} />}
        {tab === "review" && <ReviewScreen me={me} onChanged={refreshMe} />}
        {tab === "jobs" && <JobsScreen me={me} onOpenProfile={() => setTab("profile")} />}
        {tab === "community" && (
          <>
            <div className="segmented" style={{ marginTop: 4 }}>
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
      </div>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span>{t.label}{t.id === "community" && unread > 0 && <span className="dot">{unread}</span>}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

function DevLogin({ onLogin }: { onLogin: (id: number, name: string) => void }) {
  const [name, setName] = useState("Aziza Karimova");
  const [id, setId] = useState("1001");
  return (
    <div className="app">
      <h1>Sinov rejimi</h1>
      <p className="notice">Bu oyna faqat kompyuterda sinash uchun. Telegram ichida kirish avtomatik bo'ladi.</p>
      <div className="card">
        <label>Ism</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>Sinov ID (har xil odam uchun har xil raqam)</label>
        <input value={id} inputMode="numeric" onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={!name.trim() || !id} onClick={() => onLogin(Number(id), name.trim())}>Kirish</button>
        </div>
      </div>
    </div>
  );
}
