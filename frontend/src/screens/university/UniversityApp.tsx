import { useCallback, useEffect, useState } from "react";
import { api, APPLICATION_STATUS, VERIFICATION_LABEL, type Me, type UniversityDashboard, type UniversityStudent } from "../../api";
import { ErrorText, message } from "../../ui";
import Groups from "../Groups";
import Shell, { type ShellTab } from "../Shell";
import { useRouteTab } from "../../router";
import { t } from "../../i18n";
import UniEmployment from "./UniEmployment";
import { UniOpportunities, UniPartners, UniProfile } from "./UniCollab";

type Tab = "dashboard" | "employment" | "verify" | "students" | "partners" | "opportunities" | "profile" | "groups";
const tabs = (): ShellTab<Tab>[] => [
  { id: "dashboard", icon: "chart", label: t("nav.university.dashboard") },
  { id: "employment", icon: "briefcase", label: t("nav.university.employment") },
  { id: "verify", icon: "verified", label: t("nav.university.verify") },
  { id: "students", icon: "school", label: t("nav.university.students") },
  { id: "partners", icon: "building", label: t("nav.university.partners") },
  { id: "opportunities", icon: "flag", label: t("nav.university.opportunities") },
  { id: "profile", icon: "globe", label: t("nav.university.profile") },
  { id: "groups", icon: "chat", label: t("nav.university.groups") },
];

const ROUTES: Record<Tab, string> = {
  dashboard: "", employment: "bandlik", verify: "tasdiqlash", students: "talabalar", partners: "hamkorlar",
  opportunities: "imkoniyatlar", profile: "profil", groups: "guruhlar",
};

export default function UniversityApp({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [tab, setTab] = useRouteTab<Tab>("/universitet", ROUTES, "dashboard");
  return (
    <Shell tabs={tabs()} active={tab} onChange={setTab} onLogout={onLogout}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: `${me.staff_university?.short_name ?? ""} karyera markazi` }}>
        {tab === "dashboard" && <Dashboard />}
        {tab === "employment" && <UniEmployment />}
        {tab === "partners" && <UniPartners />}
        {tab === "opportunities" && <UniOpportunities />}
        {tab === "profile" && <UniProfile />}
        {tab === "verify" && <StudentList mode="verify" />}
        {tab === "students" && <StudentList mode="all" />}
        {tab === "groups" && <Groups />}
    </Shell>
  );
}

function Dashboard() {
  const [d, setD] = useState<UniversityDashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.university.dashboard().then(setD, (e) => setError(message(e))); }, []);
  if (error) return <ErrorText error={error} />;
  if (!d) return <div className="hint">Yuklanmoqda…</div>;

  const bar = (label: string, n: number, pct: number) => (
    <div style={{ marginTop: 8 }}>
      <div className="row between"><span>{label}</span><span className="hint">{n} · {pct}%</span></div>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );

  return (
    <div>
      <h1>Ko'rsatkichlar</h1>
      <div className="stats">
        <div className="stat"><b>{d.students}</b><span>talaba platformada</span></div>
        <div className="stat"><b>{d.pending_verification}</b><span>tasdiq kutmoqda</span></div>
        <div className="stat"><b>{d.hired}</b><span>ishga qabul qilingan</span></div>
      </div>
      <div className="card">
        <b>Talabalar faolligi</b>
        {bar("Talabaligi tasdiqlangan", d.verified, d.percent.verified)}
        {bar("Oxirgi 7 kunda kirgan", d.active_7d, d.percent.active_7d)}
        {bar("Yo'nalish tanlagan", d.with_track, d.percent.with_track)}
        {bar("CV'ni ochiq qilgan", d.cv_public, d.percent.cv_public)}
        {bar("Ishga tayyorman deb belgilagan", d.open_to_work, d.percent.open_to_work)}
      </div>
      <div className="card">
        <b>Arizalar</b>
        <div className="hint" style={{ marginTop: 6 }}>
          {Object.keys(d.applications).length === 0 ? "Hali ariza yo'q"
            : Object.entries(d.applications).map(([s, n]) => `${APPLICATION_STATUS[s] ?? s}: ${n}`).join(" · ")}
        </div>
      </div>
      <div className="card">
        <b>Talabalaringizga qiziqayotgan kompaniyalar</b>
        {d.companies_by_applications.length + d.companies_by_contacts.length === 0 && <div className="hint">Hali yo'q</div>}
        {d.companies_by_applications.map((c) => <div key={`a${c.name}`} className="row between" style={{ marginTop: 6 }}><span>{c.name}</span><span className="hint">{c.count} ariza</span></div>)}
        {d.companies_by_contacts.map((c) => <div key={`c${c.name}`} className="row between" style={{ marginTop: 6 }}><span>{c.name}</span><span className="hint">{c.count} bog'lanish so'rovi</span></div>)}
      </div>
      {d.recent_hires.length > 0 && (
        <div className="card">
          <b>Ishga qabul qilinganlar</b>
          {d.recent_hires.map((h, i) => (
            <div key={i} className="review"><div>{h.student}</div><div className="hint">{h.company} · {h.job} · {new Date(h.date).toLocaleDateString()}</div></div>
          ))}
        </div>
      )}
      <div className="card">
        <b>Kurslar bo'yicha</b>
        {d.by_course.map((c) => <div key={String(c.course)} className="row between" style={{ marginTop: 6 }}><span>{c.course ? (c.course === 7 ? "Magistratura" : `${c.course}-kurs`) : "Ko'rsatilmagan"}</span><b>{c.count}</b></div>)}
      </div>
      <div className="card">
        <b>Fakultetlar bo'yicha</b>
        {d.by_faculty.map((f) => <div key={f.faculty} className="row between" style={{ marginTop: 6 }}><span>{f.faculty}</span><b>{f.count}</b></div>)}
      </div>
      <button className="btn ghost" onClick={() => api.university.exportCsv().catch(() => {})}>Hisobotni yuklab olish (Excel)</button>
    </div>
  );
}

function StudentList({ mode }: { mode: "verify" | "all" }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UniversityStudent[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params: Record<string, string> = {};
    if (mode === "verify") params.verification = "pending";
    if (q.trim()) params.q = q.trim();
    setRows(null);
    api.university.students(params).then(setRows, (e) => setError(message(e)));
  }, [mode, q]);
  useEffect(() => { load(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h1>{mode === "verify" ? "Talabalikni tasdiqlash" : "Talabalar"}</h1>
      {mode === "verify" && <p className="hint">Talaba ID va fakultetni HEMIS'dagi ma'lumot bilan solishtiring. Tasdiqlangan talaba ish beruvchilarga «universitet tasdiqlagan» belgisi bilan ko'rinadi.</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="grow" value={q} placeholder="Ism, talaba ID yoki fakultet" onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" type="submit">Qidirish</button>
      </form>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint" style={{ marginTop: 8 }}>Yuklanmoqda…</div>}
      {rows?.length === 0 && <div className="center hint">{mode === "verify" ? "Navbat bo'sh" : "Hali talaba yo'q"}</div>}
      {rows?.map((s) => <StudentRow key={s.id} s={s} onDone={load} />)}
    </div>
  );
}

function StudentRow({ s, onDone }: { s: UniversityStudent; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function decide(approve: boolean) {
    try {
      await api.university.verify(s.id, approve, note.trim());
      onDone();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row between">
        <b>{s.full_name}</b>
        <span className={`badge ${s.verification === "verified" ? "peer_verified" : s.verification === "pending" ? "pending" : s.verification === "rejected" ? "rejected" : "todo"}`}>
          {VERIFICATION_LABEL[s.verification]}
        </span>
      </div>
      <div className="hint">{[s.faculty, s.course && `${s.course}-kurs`, s.group_name, s.student_number && `ID: ${s.student_number}`].filter(Boolean).join(" · ")}</div>
      <div className="hint">{s.track ?? "yo'nalish yo'q"} · {s.points} ball · {s.verified_tasks} tasdiqlangan ish{s.open_to_work ? " · ishga tayyor" : ""}</div>
      {s.verification === "pending" && (
        <div style={{ marginTop: 8 }}>
          <input value={note} placeholder="Izoh (rad etsangiz, sababini yozing)" onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn bad" disabled={note.trim().length < 3} onClick={() => decide(false)}>Rad etish</button>
            <button className="btn ok" onClick={() => decide(true)}>Tasdiqlash</button>
          </div>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
