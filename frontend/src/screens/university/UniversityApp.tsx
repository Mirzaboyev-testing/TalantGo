import { useCallback, useEffect, useState } from "react";
import { api, type Me, type UniversityDashboard, type UniversityStudent } from "../../api";
import { ErrorText, message } from "../../ui";
import Groups from "../Groups";
import Shell, { type ShellTab } from "../Shell";
import { useRouteTab } from "../../router";
import { t, useLang } from "../../i18n";
import { courseText, verificationLabel } from "../../labels";
import { statusLabel } from "../../pipeline";
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
  useLang();
  const [tab, setTab] = useRouteTab<Tab>("/universitet", ROUTES, "dashboard");
  return (
    <Shell tabs={tabs()} active={tab} onChange={setTab} onLogout={onLogout}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: t("p.uni.career_center", { name: me.staff_university?.short_name ?? "" }) }}>
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
  useLang();
  const [d, setD] = useState<UniversityDashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.university.dashboard().then(setD, (e) => setError(message(e))); }, []);
  if (error) return <ErrorText error={error} />;
  if (!d) return <div className="hint">{t("common.loading")}</div>;

  const bar = (label: string, n: number, pct: number) => (
    <div style={{ marginTop: 8 }}>
      <div className="row between"><span>{label}</span><span className="hint">{n} · {pct}%</span></div>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );

  return (
    <div>
      <h1>{t("nav.university.dashboard")}</h1>
      <div className="stats">
        <div className="stat"><b>{d.students}</b><span>{t("p.uni.on_platform")}</span></div>
        <div className="stat"><b>{d.pending_verification}</b><span>{t("p.uni.awaiting")}</span></div>
        <div className="stat"><b>{d.hired}</b><span>{t("p.uni.hired")}</span></div>
      </div>
      <div className="card">
        <b>{t("p.uni.activity")}</b>
        {bar(t("p.uni.bar.verified"), d.verified, d.percent.verified)}
        {bar(t("p.uni.bar.active_7d"), d.active_7d, d.percent.active_7d)}
        {bar(t("p.uni.bar.with_track"), d.with_track, d.percent.with_track)}
        {bar(t("p.uni.bar.cv_public"), d.cv_public, d.percent.cv_public)}
        {bar(t("p.uni.bar.open_to_work"), d.open_to_work, d.percent.open_to_work)}
      </div>
      <div className="card">
        <b>{t("p.uni.applications")}</b>
        <div className="hint" style={{ marginTop: 6 }}>
          {Object.keys(d.applications).length === 0 ? t("app.applicants.empty")
            : Object.entries(d.applications).map(([s, n]) => `${statusLabel(s)}: ${n}`).join(" · ")}
        </div>
      </div>
      <div className="card">
        <b>{t("p.uni.interested")}</b>
        {d.companies_by_applications.length + d.companies_by_contacts.length === 0 && <div className="hint">{t("p.uni.none_yet")}</div>}
        {d.companies_by_applications.map((c) => <div key={`a${c.name}`} className="row between" style={{ marginTop: 6 }}><span>{c.name}</span><span className="hint">{t("p.uni.apps_n", { n: c.count })}</span></div>)}
        {d.companies_by_contacts.map((c) => <div key={`c${c.name}`} className="row between" style={{ marginTop: 6 }}><span>{c.name}</span><span className="hint">{t("p.uni.contacts_n", { n: c.count })}</span></div>)}
      </div>
      {d.recent_hires.length > 0 && (
        <div className="card">
          <b>{t("p.uni.recent_hires")}</b>
          {d.recent_hires.map((h, i) => (
            <div key={i} className="review"><div>{h.student}</div><div className="hint">{h.company} · {h.job} · {new Date(h.date).toLocaleDateString()}</div></div>
          ))}
        </div>
      )}
      <div className="card">
        <b>{t("p.uni.by_course")}</b>
        {d.by_course.map((c) => <div key={String(c.course)} className="row between" style={{ marginTop: 6 }}><span>{courseText(c.course) || t("p.uni.not_set")}</span><b>{c.count}</b></div>)}
      </div>
      <div className="card">
        <b>{t("p.uni.by_faculty")}</b>
        {d.by_faculty.map((f) => <div key={f.faculty} className="row between" style={{ marginTop: 6 }}><span>{f.faculty}</span><b>{f.count}</b></div>)}
      </div>
      <button className="btn ghost" onClick={() => api.university.exportCsv().catch(() => {})}>{t("p.uni.export")}</button>
    </div>
  );
}

function StudentList({ mode }: { mode: "verify" | "all" }) {
  useLang();
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
      <h1>{mode === "verify" ? t("p.uni.verify_title") : t("nav.university.students")}</h1>
      {mode === "verify" && <p className="hint">{t("p.uni.verify_hint")}</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="grow" value={q} placeholder={t("p.uni.search_ph")} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" type="submit">{t("p.common.search")}</button>
      </form>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint" style={{ marginTop: 8 }}>{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="center hint">{mode === "verify" ? t("p.uni.queue_empty") : t("p.uni.no_students")}</div>}
      {rows?.map((s) => <StudentRow key={s.id} s={s} onDone={load} />)}
    </div>
  );
}

function StudentRow({ s, onDone }: { s: UniversityStudent; onDone: () => void }) {
  useLang();
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
          {verificationLabel(s.verification)}
        </span>
      </div>
      <div className="hint">{[s.faculty, courseText(s.course), s.group_name, s.student_number && `ID: ${s.student_number}`].filter(Boolean).join(" · ")}</div>
      <div className="hint">
        {s.track ?? t("p.common.no_track")} · {t("p.common.points_n", { n: s.points })} · {t("p.common.verified_works", { n: s.verified_tasks })}
        {s.open_to_work ? ` · ${t("p.uni.open_to_work")}` : ""}
      </div>
      {s.verification === "pending" && (
        <div style={{ marginTop: 8 }}>
          <input value={note} placeholder={t("p.uni.note_ph")} onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn bad" disabled={note.trim().length < 3} onClick={() => decide(false)}>{t("p.uni.reject")}</button>
            <button className="btn ok" onClick={() => decide(true)}>{t("p.uni.verify")}</button>
          </div>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
