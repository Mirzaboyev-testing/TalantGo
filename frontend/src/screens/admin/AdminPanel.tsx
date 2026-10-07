import { useEffect, useState } from "react";
import { api, type AdminStats } from "../../api";
import { ErrorText, message } from "../../ui";
import Users from "./Users";
import Submissions from "./Submissions";
import Tracks from "./Tracks";
import Announcements from "./Announcements";
import Settings from "./Settings";
import Queue from "./Queue";
import Universities from "./Universities";

const SECTIONS = [
  { id: "home", label: "Umumiy" },
  { id: "queue", label: "Navbat" },
  { id: "users", label: "Odamlar" },
  { id: "work", label: "Ishlar" },
  { id: "tracks", label: "Yo'nalishlar" },
  { id: "unis", label: "Universitetlar" },
  { id: "news", label: "E'lonlar" },
  { id: "settings", label: "Sozlamalar" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

export interface AdminCtx { isOwner: boolean; name: string }

export default function AdminPanel() {
  const [ctx, setCtx] = useState<AdminCtx | null>(null);
  const [section, setSection] = useState<Section>("home");
  const [userFilter, setUserFilter] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    api.admin.inbox().then((c) => setWaiting(c.verifications + c.companies + c.jobs + c.staff), () => {});
  }, [section]);

  useEffect(() => {
    api.admin.me().then((m) => setCtx({ isOwner: m.is_owner, name: m.name }), (e) => setError(message(e)));
  }, []);

  if (error) return <ErrorText error={error} />;
  if (!ctx) return <div className="hint">Yuklanmoqda…</div>;

  return (
    <div>
      <h1>Boshqaruv</h1>
      <p className="hint" style={{ marginTop: -8 }}>{ctx.name} · {ctx.isOwner ? "ilova egasi" : "admin"}</p>
      <div className="scroll-tabs">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`chip ${section === s.id ? "on" : ""}`} onClick={() => setSection(s.id)}>
            {s.label}{s.id === "queue" && waiting > 0 && <span className="dot">{waiting}</span>}
          </button>
        ))}
      </div>
      {section === "home" && <Overview />}
      {section === "queue" && <Queue ctx={ctx} />}
      {section === "unis" && <Universities />}
      {section === "users" && (
        <Users ctx={ctx} onShowWork={(u) => { setUserFilter(u); setSection("work"); }} />
      )}
      {section === "work" && <Submissions user={userFilter} onClearUser={() => setUserFilter(null)} />}
      {section === "tracks" && <Tracks />}
      {section === "news" && <Announcements />}
      {section === "settings" && <Settings ctx={ctx} />}
    </div>
  );
}

function Overview() {
  const [s, setS] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.admin.stats().then(setS, (e) => setError(message(e))); }, []);
  if (error) return <ErrorText error={error} />;
  if (!s) return <div className="hint">Yuklanmoqda…</div>;
  const pending = s.submissions.pending + s.submissions.peer_verified;
  return (
    <div>
      <div className="stats">
        <div className="stat"><b>{s.users}</b><span>foydalanuvchi</span></div>
        <div className="stat"><b>{s.seen_7d}</b><span>7 kunda kirgan</span></div>
        <div className="stat"><b>{s.active_7d}</b><span>7 kunda faol</span></div>
      </div>
      <div className="stats">
        <div className="stat"><b>{s.with_track}</b><span>yo'l tanlagan</span></div>
        <div className="stat"><b>{s.mentors}</b><span>mentor</span></div>
        <div className="stat"><b>{pending}</b><span>tasdiq kutmoqda</span></div>
      </div>
      <div className="card">
        <b>Ishlar holati</b>
        <div className="hint" style={{ marginTop: 6 }}>
          Tekshiruvda: {s.submissions.pending} · Tengdoshlar tasdiqlagan: {s.submissions.peer_verified} ·
          Mentor tasdiqlagan: {s.submissions.mentor_verified} · Qaytarilgan: {s.submissions.rejected}
        </div>
      </div>
      <div className="card">
        <b>Yo'nalishlar bo'yicha talabalar</b>
        {s.per_track.map((t) => (
          <div key={t.title} className="row between" style={{ marginTop: 6 }}>
            <span>{t.icon} {t.title}</span><b>{t.students}</b>
          </div>
        ))}
      </div>
      <div className="card">
        <b>Eng ko'p odam olib kelganlar</b>
        {s.top_inviters.length === 0 && <div className="hint">Hali taklif havolasi orqali hech kim kelmagan</div>}
        {s.top_inviters.map((t, i) => (
          <div key={i} className="row between" style={{ marginTop: 6 }}><span>{i + 1}. {t.name}</span><b>{t.count}</b></div>
        ))}
      </div>
      <div className="card">
        <b>Top 5</b>
        {s.top.length === 0 && <div className="hint">Hali ball yo'q</div>}
        {s.top.map((t, i) => (
          <div key={i} className="row between" style={{ marginTop: 6 }}>
            <span>{i + 1}. {t.name} <span className="hint">{t.group}</span></span><b>{t.points}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
