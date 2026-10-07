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
import AdminPanel from "./screens/admin/AdminPanel";
import JobsScreen from "./screens/Jobs";
import Welcome, { PendingScreen } from "./screens/Welcome";
import EmployerApp from "./screens/employer/EmployerApp";
import UniversityApp from "./screens/university/UniversityApp";

type Tab = "path" | "jobs" | "review" | "community" | "profile" | "admin";
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "path", icon: "🧭", label: "Yo'l" },
  { id: "jobs", icon: "💼", label: "Vakansiyalar" },
  { id: "review", icon: "✅", label: "Tekshirish" },
  { id: "community", icon: "🤝", label: "Hamjamiyat" },
  { id: "profile", icon: "👤", label: "Profil" },
  { id: "admin", icon: "⚙️", label: "Boshqaruv" },
];

type AuthState = { kind: "loading" } | { kind: "outside" } | { kind: "dev" } | { kind: "error"; text: string } | { kind: "ok" };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("path");
  const [changingTrack, setChangingTrack] = useState(false);
  const [chosenStudent, setChosenStudent] = useState(false);
  const [communityView, setCommunityView] = useState<"peers" | "top">("peers");

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
  if (!me.track && !me.has_consent && !chosenStudent) {
    return <div className="app"><Welcome me={me} onStudent={() => setChosenStudent(true)} onChanged={setMe} /></div>;
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

  const isAdmin = me.role === "admin" || me.is_owner;
  const tabs = TABS.filter((t) => t.id !== "admin" || isAdmin);

  return (
    <>
      <div className="app">
        {tab === "path" && <PathScreen me={me} onChanged={refreshMe} onChangeTrack={() => setChangingTrack(true)} />}
        {tab === "review" && <ReviewScreen me={me} onChanged={refreshMe} />}
        {tab === "jobs" && <JobsScreen me={me} onOpenProfile={() => setTab("profile")} />}
        {tab === "community" && (
          <>
            <div className="segmented" style={{ marginTop: 4 }}>
              <button className={communityView === "peers" ? "on" : ""} onClick={() => setCommunityView("peers")}>Tengdoshlar</button>
              <button className={communityView === "top" ? "on" : ""} onClick={() => setCommunityView("top")}>Reyting</button>
            </div>
            {communityView === "peers" ? <PeersScreen me={me} /> : <LeaderboardScreen />}
          </>
        )}
        {tab === "profile" && <ProfileScreen me={me} onSaved={setMe} onChangeTrack={() => setChangingTrack(true)} />}
        {tab === "admin" && isAdmin && <AdminPanel />}
      </div>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span>{t.label}
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
