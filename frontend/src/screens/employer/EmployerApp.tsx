import { useCallback, useEffect, useState } from "react";
import { api, JOB_KIND, WORK_MODE, type Applicant, type EmployerContact, type Job,
         type JobInput, type JobKind, type Me, type Track, type WorkMode } from "../../api";
import { kindLabel, modeLabel, salaryText } from "../../format";
import { jobStatusLabel, type JobStatus } from "../../labels";
import { Field, Req, useRequired, type Check } from "../../form";
import { ask, haptic, openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import EmployerSignup from "./EmployerSignup";
import Students, { downloadCv, StudentSheet } from "./Students";
import Tests from "./Tests";
import LoginMethods from "../LoginMethods";
import Groups from "../Groups";
import Shell, { type ShellTab } from "../Shell";
import { Icon } from "../../icons";
import { navigate, useRouteTab, useSearch } from "../../router";
import Candidates from "./Candidates";
import CompanyHome from "./CompanyHome";
import CompanyTasks from "./CompanyTasks";
import CompanyUniversities from "./CompanyUniversities";
import { t, useLang } from "../../i18n";
import { ApplicantCard, CardBody } from "./ApplicantCard";

type Tab = "home" | "candidates" | "jobs" | "students" | "tasks" | "universities" | "tests" | "groups" | "profile";
const tabs = (): ShellTab<Tab>[] => [
  { id: "home", icon: "home", label: t("nav.company.home") },
  { id: "candidates", icon: "inbox", label: t("nav.company.candidates") },
  { id: "jobs", icon: "briefcase", label: t("nav.company.jobs") },
  { id: "students", icon: "users", label: t("nav.company.students") },
  { id: "tasks", icon: "flag", label: t("nav.company.tasks") },
  { id: "universities", icon: "school", label: t("nav.company.universities") },
  { id: "tests", icon: "check", label: t("nav.company.tests") },
  { id: "groups", icon: "chat", label: t("nav.company.groups") },
  { id: "profile", icon: "building", label: t("nav.company.profile") },
];
// /korxona/<segment>
const ROUTES: Record<Tab, string> = {
  home: "", candidates: "nomzodlar", jobs: "vakansiyalar", students: "talabalar", tasks: "vazifalar", universities: "universitetlar", tests: "testlar",
  groups: "guruhlar", profile: "profil",
};
const JOB_BADGE: Record<string, string> = { pending: "pending", approved: "peer_verified", rejected: "rejected", closed: "todo" };

export default function EmployerApp({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout: () => void }) {
  useLang();
  const [tab, setTab] = useRouteTab<Tab>("/korxona", ROUTES, "home");
  const [studentsView, setStudentsView] = useState<"all" | "contacts">("all");
  const [attempt, setAttempt] = useState<number | null>(null);
  const openAttempt = (id: number) => { setAttempt(id); setTab("tests"); };
  return (
    <Shell tabs={tabs()} active={tab} onChange={(t) => { setAttempt(null); setTab(t); }} onLogout={onLogout}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: me.company?.name }}>
        {tab === "home" && <CompanyHome onNewJob={() => navigate("/korxona/vakansiyalar?yangi=1")} />}
        {tab === "candidates" && <Candidates />}
        {tab === "tasks" && <CompanyTasks />}
        {tab === "universities" && <CompanyUniversities />}
        {tab === "students" && (
          <>
            <div className="segmented">
              <button className={studentsView === "all" ? "on" : ""} onClick={() => setStudentsView("all")}>{t("task.audience.all")}</button>
              <button className={studentsView === "contacts" ? "on" : ""} onClick={() => setStudentsView("contacts")}>{t("p.contacts.tab")}</button>
            </div>
            {studentsView === "all" ? <Students onTest={openAttempt} /> : <ContactsTab />}
          </>
        )}
        {tab === "jobs" && <JobsTab />}
        {tab === "tests" && <Tests key={attempt ?? "list"} openAttempt={attempt} />}
        {tab === "groups" && <Groups />}
        {tab === "profile" && <><EmployerSignup me={me} onSaved={onChanged} /><LoginMethods me={me} onChanged={onChanged} /></>}
    </Shell>
  );
}

// --------------------------------------------------------------------------- jobs and applicants

function JobsTab() {
  useLang();
  const search = useSearch();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [editing, setEditing] = useState<Job | "new" | null>(search.yangi ? "new" : null);
  const [applicantsOf, setApplicantsOf] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.jobs().then(setJobs, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (applicantsOf) return <Applicants job={applicantsOf} onBack={() => { setApplicantsOf(null); void load(); }} />;
  if (editing) return <JobForm job={editing === "new" ? undefined : editing} onDone={() => { setEditing(null); void load(); }} />;

  return (
    <div>
      <h1>{t("nav.company.jobs")}</h1>
      <button className="btn" onClick={() => setEditing("new")}><Icon name="plus" size={18} />{t("cdash.new_job")}</button>
      <p className="hint">{t("p.jobs.hint")}</p>
      <ErrorText error={error} />
      {!jobs && !error && <div className="hint">{t("common.loading")}</div>}
      {jobs?.length === 0 && <div className="center hint">{t("p.jobs.empty")}</div>}
      {jobs?.map((j) => (
        <div key={j.id} className="card">
          <div className="row between">
            <span className="hint">{kindLabel(j.kind)} · {salaryText(j)}</span>
            <span className={`badge ${JOB_BADGE[j.status]}`}>{jobStatusLabel(j.status as JobStatus)}</span>
          </div>
          <b>{j.title}</b>
          <div className="hint">{t("p.jobs.stats", { apps: j.applications, views: j.views })}</div>
          {j.status === "rejected" && j.review_note && <div className="error">{t("p.jobs.review_note", { note: j.review_note })}</div>}
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => setApplicantsOf(j)}>{t("p.jobs.applications", { n: j.applications })}</button>
            {j.status !== "closed" && <button className="btn small ghost" onClick={() => setEditing(j)}>{t("p.common.edit")}</button>}
            {j.status !== "closed" && (
              <button className="btn small ghost" onClick={async () => {
                if (await ask(t("p.jobs.close_confirm"))) {
                  try { await api.employer.closeJob(j.id); void load(); } catch (e) { setError(message(e)); }
                }
              }}>{t("common.close")}</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function JobForm({ job, onDone }: { job?: Job; onDone: () => void }) {
  useLang();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [f, setF] = useState({
    title: job?.title ?? "", kind: (job?.kind ?? "") as JobKind | "", work_mode: (job?.work_mode ?? "office") as WorkMode,
    city: job?.city ?? "Toshkent", is_paid: job?.is_paid ?? true, salary_from: job?.salary_from ? String(job.salary_from) : "",
    salary_to: job?.salary_to ? String(job.salary_to) : "", hours: job?.hours_per_week ? String(job.hours_per_week) : "",
    description: job?.description ?? "", requirements: job?.requirements ?? "", skills: job?.skills.join(", ") ?? "",
    track_ids: job?.track_ids ?? [] as number[], practice: job?.counts_as_practice ?? false, deadline: job?.deadline ?? "",
  });
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls, groupCls } = useRequired();
  useEffect(() => { api.tracks().then(setTracks, () => {}); }, []);
  const set = (k: keyof typeof f, id?: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (id) clear(id);
  };
  const num = (v: string) => (v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")) : null);

  async function save() {
    const checks: Check[] = [
      ["j-title", f.title.trim().length >= 3, t("p.jobs.req.title")],
      ["j-kind", Boolean(f.kind), t("p.jobs.req.kind")],
      ["j-city", f.city.trim().length >= 2, t("p.jobs.req.city")],
      ["j-desc", f.description.trim().length >= 20, t("p.jobs.req.desc")],
      ["j-rules", rules, t("p.jobs.req.rules")],
    ];
    if (!check(checks)) return;
    const body: JobInput = {
      title: f.title.trim(), kind: f.kind as JobKind, work_mode: f.work_mode, city: f.city.trim(), is_paid: f.is_paid,
      salary_from: f.is_paid ? num(f.salary_from) : null, salary_to: f.is_paid ? num(f.salary_to) : null,
      hours_per_week: num(f.hours), description: f.description.trim(), requirements: f.requirements.trim(),
      skills: f.skills.split(",").map((s) => s.trim()).filter((s) => s.length >= 2), track_ids: f.track_ids,
      counts_as_practice: f.practice, deadline: f.deadline || null, rules_accepted: rules,
    };
    setBusy(true); setError("");
    try {
      if (job) await api.employer.editJob(job.id, body);
      else await api.employer.createJob(body);
      haptic("success");
      toast(t("p.jobs.saved"));
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />{t("common.back")}</button>
      <h1>{job ? t("p.jobs.edit_title") : t("cdash.new_job")}</h1>
      {job?.status === "approved" && <p className="notice">{t("p.jobs.recheck")}</p>}
      <p className="form-note"><Req />{t("p.common.required_note")}</p>
      <div className="card">
        <Field id="j-title" label={t("p.jobs.f.title")} required error={errors["j-title"] && t("p.jobs.f.title_err")}>
          <input id="j-title" className={cls("j-title")} value={f.title} maxLength={160} placeholder={t("p.jobs.f.title_ph")} onChange={set("title", "j-title")} />
        </Field>
        <div className="row">
          <div className="grow">
            <Field id="j-kind" label={t("p.jobs.f.kind")} required error={errors["j-kind"] && t("p.common.pick")}>
              <select id="j-kind" className={cls("j-kind")} value={f.kind} onChange={set("kind", "j-kind")}>
                <option value="">{t("task.f.choose")}</option>
                {(Object.keys(JOB_KIND) as JobKind[]).map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
              </select>
            </Field>
          </div>
          <div className="grow">
            <Field id="j-mode" label={t("p.jobs.f.mode")} required>
              <select id="j-mode" value={f.work_mode} onChange={set("work_mode")}>{(Object.keys(WORK_MODE) as WorkMode[]).map((k) => <option key={k} value={k}>{modeLabel(k)}</option>)}</select>
            </Field>
          </div>
        </div>
        <div className="row">
          <div className="grow">
            <Field id="j-city" label={t("p.jobs.f.city")} required error={errors["j-city"] && t("p.jobs.f.city_err")}>
              <input id="j-city" className={cls("j-city")} value={f.city} maxLength={60} onChange={set("city", "j-city")} />
            </Field>
          </div>
          <div style={{ width: 120 }}><Field id="j-hours" label={t("p.jobs.f.hours")}><input id="j-hours" value={f.hours} inputMode="numeric" placeholder="20" onChange={set("hours")} /></Field></div>
        </div>
        <label className="radio-line" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={f.is_paid} onChange={(e) => setF({ ...f, is_paid: e.target.checked })} />{t("p.jobs.f.paid")}
        </label>
        {f.is_paid ? (
          <div className="row">
            <div className="grow"><Field id="j-from" label={t("p.jobs.f.salary_from")}><input id="j-from" value={f.salary_from} inputMode="numeric" placeholder="2000000" onChange={set("salary_from")} /></Field></div>
            <div className="grow"><Field id="j-to" label={t("p.jobs.f.salary_to")}><input id="j-to" value={f.salary_to} inputMode="numeric" placeholder="3000000" onChange={set("salary_to")} /></Field></div>
          </div>
        ) : (
          <p className="hint">{t("p.jobs.f.unpaid_hint")}</p>
        )}
        <Field id="j-desc" label={t("job.description")} required error={errors["j-desc"] && t("p.common.min20")}>
          <textarea id="j-desc" className={cls("j-desc")} value={f.description} maxLength={5000}
                    placeholder={t("p.jobs.f.desc_ph")} onChange={set("description", "j-desc")} />
        </Field>
        <Field id="j-req" label={t("job.requirements")}><textarea id="j-req" value={f.requirements} maxLength={3000} onChange={set("requirements")} /></Field>
        <Field id="j-skills" label={t("p.jobs.f.skills")} hint={t("p.jobs.f.skills_hint")}>
          <input id="j-skills" value={f.skills} placeholder="SQL, Power BI, Excel" onChange={set("skills")} />
        </Field>
        <label>{t("p.jobs.f.tracks")}</label>
        <div className="chips">
          {tracks.map((t) => (
            <button key={t.id} type="button" className={`chip ${f.track_ids.includes(t.id) ? "on" : ""}`}
                    onClick={() => setF({ ...f, track_ids: f.track_ids.includes(t.id) ? f.track_ids.filter((x) => x !== t.id) : [...f.track_ids, t.id] })}>
              {t.title.split(":")[0]}
            </button>
          ))}
        </div>
        <Field id="j-deadline" label={t("p.jobs.f.deadline")}><input id="j-deadline" type="date" value={f.deadline} onChange={set("deadline")} /></Field>
        <label className="radio-line" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={f.practice} onChange={(e) => setF({ ...f, practice: e.target.checked })} />
          <span>{t("p.jobs.f.practice")}</span>
        </label>
        <label id="j-rules" tabIndex={-1} className={groupCls("j-rules", "radio-line")} style={{ marginTop: 12 }}>
          <input type="checkbox" checked={rules} onChange={(e) => { setRules(e.target.checked); clear("j-rules"); }} />
          <span>{t("p.jobs.f.rules")}<Req /></span>
        </label>
        {errors["j-rules"] && <div className="field-error">{t("p.jobs.f.rules_err")}</div>}
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={save}>
          {busy ? t("p.common.sending") : t("p.common.save_submit")}
        </button>
      </div>
    </div>
  );
}

function Applicants({ job, onBack }: { job: Job; onBack: () => void }) {
  useLang();
  const [items, setItems] = useState<Applicant[] | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.employer.applicants(job.id).then(setItems, (e) => setError(message(e))); }, [job.id]);

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />{t("app.applicants.back")}</button>
      <h1>{job.title}</h1>
      <p className="hint">{t("app.applicants.hint")}</p>
      <ErrorText error={error} />
      {!items && !error && <div className="hint">{t("common.loading")}</div>}
      {items?.length === 0 && <div className="center hint">{t("app.applicants.empty")}</div>}
      {items?.map((a) => (
        <ApplicantCard key={a.id} applicant={a} onProfile={setProfile}
                       onUpdated={(updated) => setItems((cur) => cur?.map((x) => (x.id === updated.id ? updated : x)) ?? null)} />
      ))}
      {profile && <StudentSheet id={profile} catalog={null} onClose={() => setProfile(null)} />}
    </div>
  );
}

function ContactsTab() {
  useLang();
  const [items, setItems] = useState<EmployerContact[] | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.employer.contacts().then(setItems, (e) => setError(message(e))); }, []);
  return (
    <div>
      <h1>{t("p.contacts.title")}</h1>
      <ErrorText error={error} />
      {items?.length === 0 && <div className="center hint">{t("p.contacts.empty")}</div>}
      {items?.map((c) => (
        <div key={c.id} className="card">
          <div className="row between">
            <b>{c.identity ? c.identity.full_name : t("p.contacts.student_code", { code: c.card.code })}</b>
            <span className={`badge ${c.status === "accepted" ? "peer_verified" : c.status === "declined" ? "rejected" : "pending"}`}>
              {c.status === "accepted" ? t("p.contacts.accepted") : c.status === "declined" ? t("p.contacts.declined") : t("p.contacts.waiting")}
            </span>
          </div>
          <CardBody card={c.card} />
          {c.identity && (
            <div className="row wrap" style={{ marginTop: 8 }}>
              {c.identity.phone && <span className="hint">{t("p.common.phone_short", { phone: c.identity.phone })}</span>}
              {c.identity.username && <button className="btn small" onClick={() => openLink(`https://t.me/${c.identity!.username}`)}>{t("p.common.write_telegram")}</button>}
              <button className="btn small ghost" onClick={() => setProfile(c.card.id)}>{t("p.common.profile")}</button>
              <button className="btn small ghost" onClick={() => downloadCv(c.card.id)}>{t("p.common.cv_pdf")}</button>
            </div>
          )}
        </div>
      ))}
      {profile && <StudentSheet id={profile} catalog={null} onClose={() => setProfile(null)} />}
    </div>
  );
}
