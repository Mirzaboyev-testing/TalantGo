import { useCallback, useEffect, useState } from "react";
import { api, JOB_KIND, loadCatalog, WORK_MODE, type Catalog, type Applicant, type EmployerContact, type EmployerCounters, type Job,
         type JobInput, type JobKind, type Me, type Track, type WorkMode } from "../../api";
import { kindLabel, modeLabel, salaryText } from "../../format";
import { jobStatusLabel, type JobStatus } from "../../labels";
import { Field, Req, useRequired, type Check } from "../../form";
import { ask, haptic, openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import Students, { downloadCv, StudentSheet } from "./Students";
import Tests from "./Tests";
import Groups from "../Groups";
import Shell, { type ShellTab } from "../Shell";
import { Icon } from "../../icons";
import { navigate, useRouteTab, useSearch } from "../../router";
import Candidates from "./Candidates";
import CompanyHome from "./CompanyHome";
import CompanyTasks from "./CompanyTasks";
import CompanyUniversities from "./CompanyUniversities";
import CompanyProfile from "./CompanyProfile";
import { fieldLabel } from "../student/StudentSignup";
import DirectChat from "../student/DirectChat";
import CompanyEvents from "./CompanyEvents";
import Feed from "../student/Feed";
import { formatDateTime, t, useLang } from "../../i18n";
import { statusLabel } from "../../pipeline";
import { ApplicantCard, CardBody } from "./ApplicantCard";
import { CompanyMark, daysLeft, EmptyState, PageHead, Tabs } from "./kit";

type Tab = "home" | "candidates" | "jobs" | "students" | "messages" | "tasks" | "events" | "feed" | "universities" | "tests" | "groups" | "profile";
const tabs = (n: EmployerCounters | null, chats = 0): ShellTab<Tab>[] => [
  { id: "home", icon: "home", label: t("nav.company.home"), group: t("co.nav.main"), badge: n?.outcomes || undefined },
  { id: "candidates", icon: "inbox", label: t("nav.company.candidates"), group: t("co.nav.hiring"), badge: n?.new_applications || undefined },
  { id: "jobs", icon: "briefcase", label: t("nav.company.jobs"), group: t("co.nav.hiring"), badge: n?.rejected_jobs || undefined },
  { id: "students", icon: "users", label: t("nav.company.students"), group: t("co.nav.hiring") },
  { id: "messages", icon: "chat", label: t("co.msg.nav"), group: t("co.nav.hiring"), badge: chats || undefined },
  { id: "tasks", icon: "flag", label: t("nav.company.tasks"), group: t("co.nav.talent"), badge: n?.to_review || undefined },
  { id: "tests", icon: "check", label: t("nav.company.tests"), group: t("co.nav.talent"), badge: n?.to_grade || undefined },
  { id: "events", icon: "calendar", label: t("co.ev.nav"), group: t("co.nav.talent") },
  { id: "feed", icon: "megaphone", label: t("co.feed.nav"), group: t("co.nav.talent") },
  { id: "universities", icon: "school", label: t("nav.company.universities"), group: t("co.nav.network"), badge: n?.partnerships_in || undefined },
  { id: "groups", icon: "chat", label: t("nav.company.groups"), group: t("co.nav.network") },
  { id: "profile", icon: "building", label: t("nav.company.profile"), group: t("co.nav.company") },
];
// /korxona/<segment>
const ROUTES: Record<Tab, string> = {
  home: "", candidates: "nomzodlar", jobs: "vakansiyalar", students: "talabalar", messages: "xabarlar", tasks: "vazifalar", events: "tadbirlar", feed: "postlar",
  universities: "universitetlar", tests: "testlar",
  groups: "guruhlar", profile: "profil",
};
const JOB_BADGE: Record<string, string> = { pending: "pending", approved: "peer_verified", rejected: "rejected", closed: "todo" };

export default function EmployerApp({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout: () => void }) {
  useLang();
  // "lenta" was the posts section's address until 2026-11-19: old links still open it
  const [tab, setTab] = useRouteTab<Tab>("/korxona", ROUTES, "home", { lenta: "feed" });
  const search = useSearch();
  const [attempt, setAttempt] = useState<number | null>(null);
  const [counters, setCounters] = useState<EmployerCounters | null>(null);
  const [chats, setChats] = useState(0);
  const openAttempt = (id: number) => { setAttempt(id); setTab("tests"); };

  // sidebar badges: refreshed on every section change and once a minute
  const refresh = useCallback(() => {
    api.employer.chatUnread().then((r) => setChats(r.unread), () => {});
    return api.employer.counters().then(setCounters, () => {});
  }, []);
  useEffect(() => { void refresh(); }, [tab, refresh]);
  useEffect(() => { const timer = setInterval(refresh, 60000); return () => clearInterval(timer); }, [refresh]);

  const company = me.company!;
  return (
    <Shell tabs={tabs(counters, chats)} active={tab} onChange={(t) => { setAttempt(null); setTab(t); }} onLogout={onLogout} wide
           onUser={() => { setAttempt(null); setTab("profile"); }}
           user={{ name: company.name, photo: company.logo_url, subtitle: me.full_name, verified: true, square: true }}>
        {tab === "home" && <CompanyHome me={me} counters={counters} onNewJob={() => navigate("/korxona/vakansiyalar?yangi=1")} />}
        {tab === "candidates" && <Candidates onChanged={refresh} />}
        {tab === "tasks" && <CompanyTasks />}
        {tab === "messages" && <DirectChat side="company" onUnread={refresh} />}
        {tab === "events" && <CompanyEvents />}
        {tab === "feed" && <div className="co-page co-narrow"><Feed me={me} /></div>}
        {tab === "universities" && <CompanyUniversities />}
        {tab === "students" && (
          <div className="co-page">
            <Tabs items={[["all", t("task.audience.all")], ["contacts", t("p.contacts.tab")]]} value={search.tab === "contacts" ? "contacts" : "all"}
                  onChange={(k) => navigate(k === "contacts" ? "/korxona/talabalar?tab=contacts" : "/korxona/talabalar")} />
            {search.tab === "contacts" ? <ContactsTab /> : <Students onTest={openAttempt} />}
          </div>
        )}
        {tab === "jobs" && <JobsTab me={me} />}
        {tab === "tests" && <Tests key={attempt ?? "list"} openAttempt={attempt} />}
        {tab === "groups" && <div className="co-page co-narrow"><Groups /></div>}
        {tab === "profile" && <CompanyProfile me={me} onChanged={onChanged} />}
    </Shell>
  );
}

// --------------------------------------------------------------------------- jobs and applicants

type JobFilter = "all" | "approved" | "expired" | "pending" | "rejected" | "closed";
// a live job whose deadline has passed: students no longer see it, so it is not counted as live
const isExpired = (j: Job) => j.status === "approved" && (daysLeft(j.deadline) ?? 1) < 0;
const jobState = (j: Job): JobFilter => (isExpired(j) ? "expired" : (j.status as JobFilter));
/** Today in Tashkent as yyyy-mm-dd, the earliest deadline a company can pick. */
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

function JobsTab({ me }: { me: Me }) {
  useLang();
  const search = useSearch();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [editing, setEditing] = useState<Job | "new" | null>(search.yangi ? "new" : null);
  const [applicantsOf, setApplicantsOf] = useState<Job | null>(null);
  const [filter, setFilter] = useState<JobFilter>((search.holat as JobFilter) || "all");
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.jobs().then(setJobs, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (search.yangi) setEditing("new"); }, [search.yangi]);

  const close = () => { setEditing(null); if (search.yangi) navigate("/korxona/vakansiyalar", { replace: true }); void load(); };
  if (applicantsOf) return <Applicants job={applicantsOf} onBack={() => { setApplicantsOf(null); void load(); }} />;
  if (editing) return <JobForm me={me} job={editing === "new" ? undefined : editing} onDone={close} />;

  const count = (f: JobFilter) => (jobs ?? []).filter((j) => f === "all" || jobState(j) === f).length;
  const shown = (jobs ?? []).filter((j) => filter === "all" || jobState(j) === filter);
  const totalViews = (jobs ?? []).reduce((n, j) => n + j.views, 0);
  const totalApps = (jobs ?? []).reduce((n, j) => n + j.applications, 0);

  return (
    <div className="co-page">
      <PageHead title={t("nav.company.jobs")} sub={t("p.jobs.hint")}
                actions={<button className="btn" onClick={() => setEditing("new")}><Icon name="plus" size={18} />{t("cdash.new_job")}</button>} />
      <ErrorText error={error} />
      {jobs && jobs.length > 0 && (
        <div className="co-mini-stats">
          <div><b>{count("approved")}</b><span>{t("co.jobs.live")}</span></div>
          <div><b>{count("pending")}</b><span>{t("co.jobs.in_review")}</span></div>
          <div><b>{totalViews}</b><span>{t("co.dash.col.views")}</span></div>
          <div><b>{totalApps}</b><span>{t("co.dash.col.apps")}</span></div>
          <div><b>{totalViews ? `${Math.round((100 * totalApps) / totalViews)}%` : "—"}</b><span>{t("co.dash.col.conv")}</span></div>
        </div>
      )}
      {jobs && jobs.length > 0 && (
        <Tabs items={(["all", "approved", "expired", "pending", "rejected", "closed"] as JobFilter[]).filter((f) => f !== "expired" || count(f) > 0).map((f) =>
          [f, f === "all" ? t("co.all") : f === "expired" ? t("co.jobs.expired_tab") : jobStatusLabel(f as JobStatus), count(f)] as [JobFilter, string, number])}
              value={filter} onChange={setFilter} />
      )}
      {!jobs && !error && <div className="co-grid">{[0, 1, 2].map((i) => <div key={i} className="co-sk-block" style={{ height: 220 }} />)}</div>}
      {jobs?.length === 0 && (
        <EmptyState icon="briefcase" title={t("co.jobs.empty_title")} text={t("co.jobs.empty_text")}
                    action={<button className="btn" style={{ width: "auto" }} onClick={() => setEditing("new")}><Icon name="plus" size={18} />{t("cdash.new_job")}</button>} />
      )}
      {jobs && jobs.length > 0 && shown.length === 0 && <div className="co-card hint">{t("co.nothing_here")}</div>}
      <div className="co-grid">
        {shown.map((j) => {
          const left = daysLeft(j.deadline);
          return (
            <div key={j.id} className={`co-job st-${j.status}`}>
              <div className="co-job-top">
                <span className="co-tag">{kindLabel(j.kind)}</span>
                {isExpired(j)
                  ? <span className="badge todo">{t("co.jobs.expired_tab")}</span>
                  : <span className={`badge ${JOB_BADGE[j.status]}`}>{jobStatusLabel(j.status as JobStatus)}</span>}
              </div>
              <h3>{j.title}</h3>
              <div className="co-job-meta">
                <span><Icon name="globe" size={14} />{[j.city, modeLabel(j.work_mode)].filter(Boolean).join(" · ")}</span>
                <span className="co-salary">{salaryText(j)}</span>
              </div>
              <div className="co-job-metrics">
                <div><b>{j.views}</b><span>{t("co.dash.col.views")}</span></div>
                <div><b>{j.applications}</b><span>{t("co.dash.col.apps")}</span></div>
                <div><b>{j.views ? `${Math.round((100 * j.applications) / j.views)}%` : "—"}</b><span>{t("co.dash.col.conv")}</span></div>
              </div>
              <div className={`co-job-deadline ${left != null && left < 0 ? "over" : left != null && left <= 3 ? "soon" : ""}`}>
                <Icon name="flame" size={14} />
                {left == null ? t("co.jobs.no_deadline") : left < 0 ? t("co.jobs.expired") : t("co.jobs.days_left", { n: left })}
                <span className="hint"> · {formatDateTime(j.created_at, false)}</span>
              </div>
              {(j.recommended_by?.length ?? 0) > 0 && (
                <div className="co-note good" title={j.recommended_by!.map((r) => r.name).join(", ")}>
                  <Icon name="school" size={14} /> {t("co.jobs.recommended_by", { list: j.recommended_by!.map((r) => r.short_name).join(", ") })}
                </div>
              )}
              {j.status === "rejected" && j.review_note && <div className="co-note bad">{t("p.jobs.review_note", { note: j.review_note })}</div>}
              {j.status === "pending" && <div className="co-note">{t("co.jobs.pending_note")}</div>}
              {isExpired(j) && <div className="co-note bad">{t("co.jobs.expired_note")}</div>}
              {j.status === "closed" && <div className="co-note">{t("co.jobs.closed_note")}</div>}
              <div className="co-job-actions">
                <button className="btn small" onClick={() => setApplicantsOf(j)}><Icon name="inbox" size={15} />{t("p.jobs.applications", { n: j.applications })}</button>
                <button className="btn small ghost" onClick={() => setEditing(j)}>
                  {j.status === "closed" ? t("co.jobs.reopen") : isExpired(j) ? t("co.jobs.extend") : t("p.common.edit")}
                </button>
                {j.status === "approved" && !isExpired(j) && (
                  <button className="icon-btn" title={t("co.jobs.public")} aria-label={t("co.jobs.public")} onClick={() => navigate(`/vakansiyalar/${j.id}`)}><Icon name="globe" size={16} /></button>
                )}
                {j.status !== "closed" && (
                  <button className="icon-btn" title={t("common.close")} aria-label={t("common.close")} onClick={async () => {
                    if (await ask(t("p.jobs.close_confirm"))) {
                      try { await api.employer.closeJob(j.id); void load(); } catch (e) { setError(message(e)); }
                    }
                  }}><Icon name="close" size={16} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobForm({ me, job, onDone }: { me: Me; job?: Job; onDone: () => void }) {
  useLang();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [f, setF] = useState({
    title: job?.title ?? "", kind: (job?.kind ?? "") as JobKind | "", work_mode: (job?.work_mode ?? "office") as WorkMode,
    city: job?.city ?? "Toshkent", is_paid: job?.is_paid ?? true, salary_from: job?.salary_from ? String(job.salary_from) : "",
    salary_to: job?.salary_to ? String(job.salary_to) : "", hours: job?.hours_per_week ? String(job.hours_per_week) : "",
    description: job?.description ?? "", requirements: job?.requirements ?? "", skills: job?.skills.join(", ") ?? "",
    track_ids: job?.track_ids ?? [] as number[], practice: job?.counts_as_practice ?? false, deadline: job?.deadline ?? "",
    job_fields: job?.job_fields ?? [] as string[],
  });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls, groupCls } = useRequired();
  useEffect(() => { api.tracks().then(setTracks, () => {}); loadCatalog().then(setCatalog, () => {}); }, []);
  const set = (k: keyof typeof f, id?: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setF((cur) => ({ ...cur, [k]: value }));
    if (id) clear(id);
  };
  const num = (v: string) => (v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")) : null);
  const skills = f.skills.split(",").map((s) => s.trim()).filter((s) => s.length >= 2);

  async function save() {
    const checks: Check[] = [
      ["j-title", f.title.trim().length >= 3, t("p.jobs.req.title")],
      ["j-kind", Boolean(f.kind), t("p.jobs.req.kind")],
      ["j-city", f.city.trim().length >= 2, t("p.jobs.req.city")],
      ["j-desc", f.description.trim().length >= 20, t("p.jobs.req.desc")],
      ["j-fields", f.job_fields.length > 0, t("co.jobs.f.fields_req")],
      ["j-deadline", !f.deadline || f.deadline >= todayIso(), t("co.jobs.f.deadline_past")],
      ["j-rules", rules, t("p.jobs.req.rules")],
    ];
    if (!check(checks)) return;
    const body: JobInput = {
      title: f.title.trim(), kind: f.kind as JobKind, work_mode: f.work_mode, city: f.city.trim(), is_paid: f.is_paid,
      salary_from: f.is_paid ? num(f.salary_from) : null, salary_to: f.is_paid ? num(f.salary_to) : null,
      hours_per_week: num(f.hours), description: f.description.trim(), requirements: f.requirements.trim(),
      skills, track_ids: f.track_ids, job_fields: f.job_fields, counts_as_practice: f.practice, deadline: f.deadline || null,
      rules_accepted: rules,
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

  const preview = { is_paid: f.is_paid, salary_from: f.is_paid ? num(f.salary_from) : null, salary_to: f.is_paid ? num(f.salary_to) : null };
  return (
    <div className="co-page">
      <button className="btn small ghost co-back" onClick={onDone}><Icon name="back" size={16} />{t("nav.company.jobs")}</button>
      <PageHead title={job ? t("p.jobs.edit_title") : t("cdash.new_job")} sub={<><Req />{t("p.common.required_note")}</>} />
      {job?.status === "approved" && <p className="notice">{t("p.jobs.recheck")}</p>}
      <div className="co-form-layout">
        <div className="co-col">
          <div className="co-card">
            <div className="co-section-title"><span>1</span>{t("co.jobs.s.basic")}</div>
            <Field id="j-title" label={t("p.jobs.f.title")} required error={errors["j-title"] && t("p.jobs.f.title_err")}>
              <input id="j-title" className={cls("j-title")} value={f.title} maxLength={160} placeholder={t("p.jobs.f.title_ph")} onChange={set("title", "j-title")} />
            </Field>
            <div className="co-form-grid three">
              <Field id="j-kind" label={t("p.jobs.f.kind")} required error={errors["j-kind"] && t("p.common.pick")}>
                <select id="j-kind" className={cls("j-kind")} value={f.kind} onChange={set("kind", "j-kind")}>
                  <option value="">{t("task.f.choose")}</option>
                  {(Object.keys(JOB_KIND) as JobKind[]).map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
                </select>
              </Field>
              <Field id="j-mode" label={t("p.jobs.f.mode")} required>
                <select id="j-mode" value={f.work_mode} onChange={set("work_mode")}>{(Object.keys(WORK_MODE) as WorkMode[]).map((k) => <option key={k} value={k}>{modeLabel(k)}</option>)}</select>
              </Field>
              <Field id="j-city" label={t("p.jobs.f.city")} required error={errors["j-city"] && t("p.jobs.f.city_err")}>
                <input id="j-city" className={cls("j-city")} value={f.city} maxLength={60} onChange={set("city", "j-city")} />
              </Field>
            </div>
          </div>
          <div className="co-card">
            <div className="co-section-title"><span>2</span>{t("co.jobs.s.terms")}</div>
            <label className="radio-line" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={f.is_paid} onChange={(e) => { const v = e.target.checked; setF((cur) => ({ ...cur, is_paid: v })); }} />{t("p.jobs.f.paid")}
            </label>
            {f.is_paid ? (
              <div className="co-form-grid three">
                <Field id="j-from" label={t("p.jobs.f.salary_from")}><input id="j-from" value={f.salary_from} inputMode="numeric" placeholder="2000000" onChange={set("salary_from")} /></Field>
                <Field id="j-to" label={t("p.jobs.f.salary_to")}><input id="j-to" value={f.salary_to} inputMode="numeric" placeholder="3000000" onChange={set("salary_to")} /></Field>
                <Field id="j-hours" label={t("p.jobs.f.hours")}><input id="j-hours" value={f.hours} inputMode="numeric" placeholder="20" onChange={set("hours")} /></Field>
              </div>
            ) : (
              <>
                <p className="hint">{t("p.jobs.f.unpaid_hint")}</p>
                <Field id="j-hours" label={t("p.jobs.f.hours")}><input id="j-hours" value={f.hours} inputMode="numeric" placeholder="20" onChange={set("hours")} /></Field>
              </>
            )}
            <div className="co-form-grid">
              <Field id="j-deadline" label={t("p.jobs.f.deadline")} error={errors["j-deadline"] && t("co.jobs.f.deadline_past")}>
                <input id="j-deadline" className={cls("j-deadline")} type="date" min={todayIso()} value={f.deadline} onChange={set("deadline", "j-deadline")} />
              </Field>
            </div>
            <label className="radio-line" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={f.practice} onChange={(e) => { const v = e.target.checked; setF((cur) => ({ ...cur, practice: v })); }} />
              <span>{t("p.jobs.f.practice")}</span>
            </label>
          </div>
          <div className="co-card">
            <div className="co-section-title"><span>3</span>{t("co.jobs.s.text")}</div>
            <Field id="j-desc" label={t("job.description")} required error={errors["j-desc"] && t("p.common.min20")}>
              <textarea id="j-desc" className={cls("j-desc")} value={f.description} maxLength={5000} rows={7}
                        placeholder={t("p.jobs.f.desc_ph")} onChange={set("description", "j-desc")} />
            </Field>
            <Field id="j-req" label={t("job.requirements")}><textarea id="j-req" value={f.requirements} maxLength={3000} rows={4} onChange={set("requirements")} /></Field>
          </div>
          <div className="co-card">
            <div className="co-section-title"><span>4</span>{t("co.jobs.s.match")}</div>
            <Field id="j-skills" label={t("p.jobs.f.skills")} hint={t("p.jobs.f.skills_hint")}>
              <input id="j-skills" value={f.skills} placeholder="SQL, Power BI, Excel" onChange={set("skills")} />
            </Field>
            <label>{t("co.jobs.f.fields")}<Req /></label>
            <div id="j-fields" tabIndex={-1} className={groupCls("j-fields", "chips")}>
              {Object.keys(catalog?.job_fields ?? {}).map((k) => (
                <button key={k} type="button" className={`chip ${f.job_fields.includes(k) ? "on" : ""}`}
                        onClick={() => { setF((cur) => ({ ...cur, job_fields: cur.job_fields.includes(k) ? cur.job_fields.filter((x) => x !== k) : [...cur.job_fields, k].slice(0, 3) })); clear("j-fields"); }}>
                  {fieldLabel(k, catalog)}
                </button>
              ))}
            </div>
            {errors["j-fields"] ? <div className="field-error">{t("co.jobs.f.fields_req")}</div> : <div className="hint" style={{ marginTop: 4 }}>{t("co.jobs.f.fields_hint")}</div>}
            <label>{t("p.jobs.f.tracks")}</label>
            <div className="chips">
              {tracks.map((tr) => (
                <button key={tr.id} type="button" className={`chip ${f.track_ids.includes(tr.id) ? "on" : ""}`}
                        onClick={() => setF((cur) => ({ ...cur, track_ids: cur.track_ids.includes(tr.id) ? cur.track_ids.filter((x) => x !== tr.id) : [...cur.track_ids, tr.id] }))}>
                  {tr.title.split(":")[0]}
                </button>
              ))}
            </div>
            <label id="j-rules" tabIndex={-1} className={groupCls("j-rules", "radio-line")} style={{ marginTop: 16 }}>
              <input type="checkbox" checked={rules} onChange={(e) => { setRules(e.target.checked); clear("j-rules"); }} />
              <span>{t("p.jobs.f.rules")}<Req /></span>
            </label>
            {errors["j-rules"] && <div className="field-error">{t("p.jobs.f.rules_err")}</div>}
            <ErrorText error={error} />
            <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={save}>
              <Icon name="send" size={16} />{busy ? t("p.common.sending") : t("p.common.save_submit")}
            </button>
          </div>
        </div>
        <aside className="co-col co-sticky">
          <div className="co-preview">
            <div className="co-preview-label">{t("co.jobs.preview")}</div>
            <div className="co-preview-card">
              <div className="row">
                <CompanyMark name={me.company!.name} url={me.company!.logo_url} size={40} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: "block" }}>{f.title || t("p.jobs.f.title_ph")}</b>
                  <div className="hint ellipsis">{me.company!.name}</div>
                </div>
              </div>
              <div className="co-salary" style={{ marginTop: 10 }}>{salaryText(preview)}</div>
              <div className="chips" style={{ marginTop: 8 }}>
                {f.kind && <span className="chip">{kindLabel(f.kind as JobKind)}</span>}
                <span className="chip">{modeLabel(f.work_mode)}</span>
                {f.city && <span className="chip">{f.city}</span>}
                {f.practice && <span className="chip">{t("co.jobs.practice_chip")}</span>}
              </div>
              {f.description && <p className="co-preview-text">{f.description.slice(0, 220)}{f.description.length > 220 ? "…" : ""}</p>}
              {skills.length > 0 && <div className="chips">{skills.slice(0, 6).map((s) => <span key={s} className="chip">{s}</span>)}</div>}
            </div>
          </div>
          <div className="co-card co-tips">
            <b><Icon name="spark" size={16} />{t("co.jobs.tips_title")}</b>
            <ul>{([1, 2, 3, 4] as const).map((n) => <li key={n}>{t(`co.jobs.tip.${n}`)}</li>)}</ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

const APPLICANT_STAGES = ["all", "new", "viewed", "shortlisted", "interview", "offer", "hired", "rejected"] as const;

function Applicants({ job, onBack }: { job: Job; onBack: () => void }) {
  useLang();
  const [items, setItems] = useState<Applicant[] | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [stage, setStage] = useState<(typeof APPLICANT_STAGES)[number]>("all");
  const [error, setError] = useState("");
  useEffect(() => { api.employer.applicants(job.id).then(setItems, (e) => setError(message(e))); }, [job.id]);
  const count = (s: string) => (items ?? []).filter((a) => s === "all" || a.status === s).length;
  const shown = (items ?? []).filter((a) => stage === "all" || a.status === stage);

  return (
    <div className="co-page">
      <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("app.applicants.back")}</button>
      <PageHead title={job.title} sub={t("app.applicants.hint")} />
      <ErrorText error={error} />
      {items && items.length > 0 && (
        <Tabs items={APPLICANT_STAGES.map((s) => [s, s === "all" ? t("co.all") : statusLabel(s), count(s)] as [typeof s, string, number])}
              value={stage} onChange={setStage} />
      )}
      {!items && !error && <div className="hint">{t("common.loading")}</div>}
      {items?.length === 0 && <EmptyState icon="inbox" title={t("app.applicants.empty")} text={t("co.jobs.applicants_empty")} />}
      <div className="co-grid wide-cards">
        {shown.map((a) => (
          <ApplicantCard key={a.id} applicant={a} onProfile={setProfile}
                         onUpdated={(updated) => setItems((cur) => cur?.map((x) => (x.id === updated.id ? updated : x)) ?? null)} />
        ))}
      </div>
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
  const n = (s: string) => (items ?? []).filter((c) => c.status === s).length;
  return (
    <>
      <PageHead title={t("p.contacts.title")} sub={t("co.contacts.sub")} />
      <ErrorText error={error} />
      {items && items.length > 0 && (
        <div className="co-mini-stats">
          <div><b>{items.length}</b><span>{t("co.contacts.sent")}</span></div>
          <div><b>{n("accepted")}</b><span>{t("p.contacts.accepted")}</span></div>
          <div><b>{n("pending")}</b><span>{t("p.contacts.waiting")}</span></div>
          <div><b>{n("declined")}</b><span>{t("p.contacts.declined")}</span></div>
        </div>
      )}
      {items?.length === 0 && <EmptyState icon="send" title={t("co.contacts.empty_title")} text={t("p.contacts.empty")}
                                          action={<button className="btn" style={{ width: "auto" }} onClick={() => navigate("/korxona/talabalar")}>{t("nav.company.students")}</button>} />}
      <div className="co-grid">
        {items?.map((c) => (
          <div key={c.id} className="co-card co-contact">
            <div className="row between">
              <b>{c.identity ? c.identity.full_name : t("p.contacts.student_code", { code: c.card.code })}</b>
              <span className={`badge ${c.status === "accepted" ? "peer_verified" : c.status === "declined" ? "rejected" : "pending"}`}>
                {c.status === "accepted" ? t("p.contacts.accepted") : c.status === "declined" ? t("p.contacts.declined") : t("p.contacts.waiting")}
              </span>
            </div>
            <CardBody card={c.card} />
            {c.message && <p className="co-quote">«{c.message}»</p>}
            <div className="hint">{formatDateTime(c.created_at, false)}{c.job_title ? ` · ${c.job_title}` : ""}</div>
            {c.identity && (
              <div className="row wrap" style={{ marginTop: 10 }}>
                {c.identity.phone && <span className="co-tag"><Icon name="phone" size={14} />{c.identity.phone}</span>}
                {c.identity.username && <button className="btn small" onClick={() => openLink(`https://t.me/${c.identity!.username}`)}>{t("p.common.write_telegram")}</button>}
                <button className="btn small ghost" onClick={() => setProfile(c.card.id)}>{t("p.common.profile")}</button>
                <button className="btn small ghost" onClick={() => downloadCv(c.card.id)}>{t("p.common.cv_pdf")}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {profile && <StudentSheet id={profile} catalog={null} onClose={() => setProfile(null)} />}
    </>
  );
}
