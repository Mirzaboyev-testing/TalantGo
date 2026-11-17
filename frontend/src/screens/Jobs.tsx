import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api, loadCatalog, type Catalog, type Job, type JobKind, type Me, type MyApplication,
         type StudentContact, type WorkMode } from "../api";
import { kindLabel, modeLabel, salaryText } from "../format";
import { formatDateTime, t, useLang } from "../i18n";
import { ACTIVE_STATES, statusBadge, statusLabel } from "../pipeline";
import { ask, haptic } from "../tg";
import { ErrorText, Sheet, message } from "../ui";
import StudentTests from "./StudentTests";
import { PageHead } from "./employer/kit";
import { Icon } from "../icons";
import { navigate } from "../router";
import { fieldLabel } from "./student/StudentSignup";

const KINDS: (JobKind | "")[] = ["", "internship", "part_time", "junior", "project"];
const inStage = (a: MyApplication, k: "all" | "active" | "interview" | "closed") =>
  k === "all" || (k === "interview" ? a.status === "interview" || a.status === "offer"
    : k === "active" ? ACTIVE_STATES.includes(a.status) : !ACTIVE_STATES.includes(a.status));

type JobsView = "jobs" | "mine" | "saved" | "tests";

/** Student panel v2: "Vakansiyalar" shows jobs and saved jobs, "Arizalarim" applications and company tests. */
export default function JobsScreen({ me, onOpenProfile, initialView = "jobs", views = ["jobs", "mine", "saved", "tests"] }: {
  me: Me; onOpenProfile: () => void; initialView?: JobsView; views?: JobsView[];
}) {
  useLang();
  const [view, setView] = useState<JobsView>(initialView);
  const [saved, setSaved] = useState<Job[] | null>(null);
  const [kind, setKind] = useState<JobKind | "">("");
  const [mode, setMode] = useState<WorkMode | "">("");
  const [field, setField] = useState("");
  const [sort, setSort] = useState<"match" | "new">("match");
  const [paidOnly, setPaidOnly] = useState(false);
  const [practiceOnly, setPracticeOnly] = useState(false);
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stage, setStage] = useState<"all" | "active" | "interview" | "closed">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [mine, setMine] = useState<MyApplication[] | null>(null);
  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [open, setOpen] = useState<Job | null>(null);
  const [error, setError] = useState("");

  const loadJobs = useCallback(() => {
    const params: Record<string, string> = {};
    if (kind) params.kind = kind;
    if (mode) params.work_mode = mode;
    if (field) params.field = field;
    params.sort = sort;
    if (paidOnly) params.paid_only = "true";
    if (practiceOnly) params.practice_only = "true";
    if (q.trim()) params.q = q.trim();
    setJobs(null);
    api.jobs(params).then(setJobs, (e) => setError(message(e)));
  }, [kind, mode, field, sort, paidOnly, practiceOnly, q]);

  useEffect(() => { if (view === "jobs") loadJobs(); }, [view, kind, mode, field, sort, paidOnly, practiceOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadCatalog().then(setCatalog, () => {}); }, []);
  async function toggleSave(j: Job) {
    try {
      if (j.saved) await api.unsaveJob(j.id); else await api.saveJob(j.id);
      setJobs((cur) => cur?.map((x) => (x.id === j.id ? { ...x, saved: !j.saved } : x)) ?? cur);
    } catch (e) { setError(message(e)); }
  }
  const filtersOn = [kind, mode, field].filter(Boolean).length + Number(paidOnly) + Number(practiceOnly);
  const reset = () => { setKind(""); setMode(""); setField(""); setPaidOnly(false); setPracticeOnly(false); };
  useEffect(() => { if (view === "mine") api.myApplications().then(setMine, (e) => setError(message(e))); }, [view]);
  useEffect(() => { if (view === "saved") api.savedJobs().then(setSaved, (e) => setError(message(e))); }, [view]);
  const loadContacts = useCallback(() => api.myContacts().then(setContacts, () => {}), []);
  useEffect(() => { void loadContacts(); }, [loadContacts]);

  const pending = contacts.filter((c) => c.status === "pending");
  const notReady = me.verification === "none" || me.verification === "rejected";

  return (
    <div className="co-page st-page">
      <PageHead title={views.includes("jobs") ? t("jobs.title") : t("st.nav.applications")}
                sub={views.includes("jobs") ? t("st.jobs.sub") : t("st.apps.sub")} />
      <div className="co-tabs">
        {views.map((v) => (
          <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{t(`jobs.tab.${v}`)}</button>
        ))}
      </div>

      {!views.includes("jobs") && pending.map((c) => <ContactCard key={c.id} contact={c} onAnswered={loadContacts} />)}

      {notReady && views.includes("jobs") && (
        <div className="notice" style={{ marginBottom: 10 }}>
          {t("s.jobs.not_ready")}{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); onOpenProfile(); }}>{t("s.jobs.fill_profile")}</a>
        </div>
      )}

      {view === "jobs" && (
        <div className="st-jobs">
          <aside className={`co-card st-filters ${showFilters ? "open" : ""}`}>
            <form className="st-chat-search" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); loadJobs(); }}>
              <Icon name="search" size={16} />
              <input value={q} placeholder={t("pub.hero.search")} onChange={(e) => setQ(e.target.value)} />
            </form>
            <button type="button" className="btn small ghost st-filters-toggle" onClick={() => setShowFilters(!showFilters)}>
              <Icon name="menu" size={16} />{t("st.jobs.filters")}{filtersOn > 0 && <span className="co-tab-n">{filtersOn}</span>}
            </button>
            <div className="st-filters-body">
              <div className="st-filter-group">
                <b>{t("st.jobs.f.kind")}</b>
                {KINDS.map((id) => (
                  <label key={id} className="st-radio"><input type="radio" checked={kind === id} onChange={() => setKind(id)} />{id ? kindLabel(id) : t("pub.filter.all")}</label>
                ))}
              </div>
              <div className="st-filter-group">
                <b>{t("st.jobs.f.mode")}</b>
                {(["", "office", "remote", "hybrid"] as (WorkMode | "")[]).map((id) => (
                  <label key={id} className="st-radio"><input type="radio" checked={mode === id} onChange={() => setMode(id)} />{id ? modeLabel(id) : t("pub.filter.all")}</label>
                ))}
              </div>
              <div className="st-filter-group">
                <b>{t("st.jobs.f.field")}</b>
                <select value={field} onChange={(e) => setField(e.target.value)}>
                  <option value="">{t("pub.filter.all")}</option>
                  {me.job_fields.length > 0 && <optgroup label={t("st.jobs.f.mine")}>{me.job_fields.map((k) => <option key={k} value={k}>{fieldLabel(k, catalog)}</option>)}</optgroup>}
                  <optgroup label={t("st.jobs.f.all_fields")}>
                    {Object.keys(catalog?.job_fields ?? {}).filter((k) => !me.job_fields.includes(k)).map((k) => <option key={k} value={k}>{fieldLabel(k, catalog)}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="st-filter-group">
                <label className="st-switch-row"><span><b>{t("pub.filter.paid")}</b></span><input type="checkbox" className="st-switch" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} /></label>
                <label className="st-switch-row"><span><b>{t("pub.filter.practice")}</b></span><input type="checkbox" className="st-switch" checked={practiceOnly} onChange={(e) => setPracticeOnly(e.target.checked)} /></label>
              </div>
              {filtersOn > 0 && <button type="button" className="link-btn" onClick={reset}>{t("st.jobs.reset")}</button>}
            </div>
          </aside>
          <section className="co-col">
            <div className="row between wrap" style={{ gap: 8 }}>
              <b>{jobs ? t("st.jobs.found", { n: jobs.length }) : t("common.loading")}</b>
              <label className="row" style={{ gap: 8, margin: 0, color: "var(--hint)", fontSize: 13.5 }}>
                {t("st.jobs.sort")}
                <select value={sort} style={{ width: "auto" }} onChange={(e) => setSort(e.target.value as "match" | "new")}>
                  <option value="match">{t("st.jobs.sort_match")}</option>
                  <option value="new">{t("st.jobs.sort_new")}</option>
                </select>
              </label>
            </div>
            <ErrorText error={error} />
            {!jobs && !error && <div className="st-skeleton-grid"><span /><span /><span /></div>}
            {jobs?.length === 0 && (
              <div className="st-empty"><Icon name="briefcase" size={28} /><b>{t("s.jobs.empty")}</b>
                {filtersOn > 0 && <button className="btn small ghost" onClick={reset}>{t("st.jobs.reset")}</button>}</div>
            )}
            <div className="st-card-grid">{jobs?.map((j) => <JobCard key={j.id} job={j} onOpen={() => setOpen(j)} onSave={() => toggleSave(j)} />)}</div>
          </section>
        </div>
      )}

      {view === "tests" && <StudentTests />}
      {view === "saved" && (
        <>
          {!saved && !error && <div className="hint">{t("common.loading")}</div>}
          {saved?.length === 0 && <div className="center hint">{t("jobs.saved_empty")}</div>}
          <div className="st-card-grid">{saved?.map((j) => (
            <div key={j.id} style={{ position: "relative" }}>
              <JobCard job={j} onOpen={() => setOpen(j)} />
              <button className="icon-btn heart on saved-remove" title={t("job.saved")} aria-label={t("job.saved")}
                      onClick={async () => {
                        try { await api.unsaveJob(j.id); setSaved((cur) => cur?.filter((x) => x.id !== j.id) ?? null); }
                        catch (e) { setError(message(e)); }
                      }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
                     aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" /></svg>
              </button>
            </div>
          ))}</div>
        </>
      )}
      {view === "mine" && (
        <>
          {mine && mine.length > 0 && (
            <div className="st-stages">
              {([["all", "inbox"], ["active", "send"], ["interview", "calendar"], ["closed", "flag"]] as const).map(([k, icon]) => (
                <button key={k} className={`st-stage ${stage === k ? "on" : ""}`} onClick={() => setStage(k)}>
                  <span className="co-stat-icon"><Icon name={icon} size={18} /></span>
                  <b>{mine.filter((a) => inStage(a, k)).length}</b>
                  <span>{t(`st.apps.stage.${k}`)}</span>
                </button>
              ))}
            </div>
          )}
          {!mine && !error && <div className="st-skeleton-grid"><span /><span /></div>}
          {mine?.length === 0 && (
            <div className="st-empty"><Icon name="inbox" size={28} /><b>{t("app.mine.empty")}</b>
              <button className="btn small" onClick={() => navigate("/talaba/vakansiyalar")}>{t("st.home.next.apply_cta")}</button></div>
          )}
          <div className="st-card-grid two">{mine?.filter((a) => inStage(a, stage)).map((a) => (
            <ApplicationCard key={a.id} app={a} onOpen={() => setOpen({ ...a.job, application_status: a.status })}
                             onWithdrawn={(updated) => setMine((cur) => cur?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
                             onError={setError} />
          ))}</div>
        </>
      )}

      {open && <JobSheet job={open} canApply={!notReady} onClose={() => setOpen(null)} onApplied={() => {
        setOpen(null);
        if (view === "mine") api.myApplications().then(setMine, (e) => setError(message(e)));
        else loadJobs();
      }} />}
    </div>
  );
}

function ApplicationCard({ app, onOpen, onWithdrawn, onError }: {
  app: MyApplication; onOpen: () => void; onWithdrawn: (a: MyApplication) => void; onError: (e: string) => void;
}) {
  useLang();
  async function withdraw(e: ReactMouseEvent) {
    e.stopPropagation();
    if (!(await ask(t("app.mine.withdraw_confirm")))) return;
    try {
      await api.withdraw(app.id);
      onWithdrawn({ ...app, status: "withdrawn", history: [...app.history, { status: "withdrawn", at: new Date().toISOString() }] });
    } catch (err) {
      onError(message(err));
    }
  }
  return (
    <div className="card tap" onClick={onOpen}>
      <div className="row between">
        <span className="hint">{app.job.company_name}</span>
        <span className={`badge ${statusBadge(app.status)}`}>{statusLabel(app.status)}</span>
      </div>
      <b>{app.job.title}</b>
      <div className="hint">{t("app.mine.sent_on", { date: formatDateTime(app.created_at, false) })}</div>
      {app.status === "interview" && (app.interview_at || app.interview_place) && (
        <div className="notice" style={{ marginTop: 8 }}>
          {t("app.interview.at", { when: [formatDateTime(app.interview_at), app.interview_place].filter(Boolean).join(", ") })}
        </div>
      )}
      {app.status === "offer" && <div className="notice" style={{ marginTop: 8 }}>{t("app.mine.offer")}</div>}
      {app.status === "hired" && <div className="notice" style={{ marginTop: 8 }}>{t("app.mine.hired")}</div>}
      {app.history.length > 1 && (
        <div className="timeline">{app.history.map((h, i) => <span key={i}>{statusLabel(h.status)}</span>)}</div>
      )}
      {ACTIVE_STATES.includes(app.status) && (
        <button className="btn small ghost" style={{ marginTop: 8 }} onClick={withdraw}>{t("app.mine.withdraw")}</button>
      )}
      {app.status === "withdrawn" && (
        <button className="btn small ghost" style={{ marginTop: 8 }} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
          {t("app.mine.reapply")}
        </button>
      )}
    </div>
  );
}

function JobCard({ job, onOpen, onSave }: { job: Job; onOpen: () => void; onSave?: () => void }) {
  useLang();
  return (
    <div className="card tap st-jobcard" onClick={onOpen}>
      <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
        <span className="avatar company-mark">{job.company_name.slice(0, 1).toUpperCase()}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="job-title">{job.title}</b>
          <div className="job-salary">{salaryText(job)}</div>
          <div className="hint ellipsis">{job.company_name}{job.city ? ` · ${job.city}` : ""}</div>
        </div>
        {onSave && (
          <button className={`icon-btn heart ${job.saved ? "on" : ""}`} title={t(job.saved ? "job.saved" : "job.save")} aria-label={t(job.saved ? "job.saved" : "job.save")}
                  onClick={(e) => { e.stopPropagation(); onSave(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={job.saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
                 strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" /></svg>
          </button>
        )}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        <span className="chip">{kindLabel(job.kind)}</span>
        <span className="chip">{modeLabel(job.work_mode)}</span>
        {job.counts_as_practice && <span className="chip">{t("job.practice")}</span>}
      </div>
      <div className="st-match-bar" title={t("st.jobs.match_hint")}>
        <span style={{ width: `${job.match}%` }} />
        <small>{t("home.match", { n: job.match })}</small>
      </div>
      {job.applied && <div className="hint" style={{ marginTop: 6 }}>{t("app.mine.applied", { status: statusLabel(job.application_status ?? "new") })}</div>}
    </div>
  );
}

function JobSheet({ job, canApply, onClose, onApplied }: { job: Job; canApply: boolean; onClose: () => void; onApplied: () => void }) {
  useLang();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply() {
    setBusy(true); setError("");
    try {
      await api.apply(job.id, note.trim());
      haptic("success");
      onApplied();
    } catch (e) {
      haptic("error");
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <span className="hint">{job.company_name}</span>
      <h1>{job.title}</h1>
      <div className="chips">
        <span className="chip">{kindLabel(job.kind)}</span>
        <span className="chip">{modeLabel(job.work_mode)}{job.city ? ` · ${job.city}` : ""}</span>
        <span className="chip">{salaryText(job)}</span>
        {job.hours_per_week && <span className="chip">{t("job.hours", { n: job.hours_per_week })}</span>}
        {job.deadline && <span className="chip">{t("s.jobs.deadline", { date: job.deadline })}</span>}
      </div>
      {job.counts_as_practice && <p className="notice">{t("s.jobs.practice_notice")}</p>}
      {!job.is_paid && <p className="hint">{t("s.jobs.unpaid_hint")}</p>}
      <div className="card">
        <b>{t("job.description")}</b>
        <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{job.description}</p>
      </div>
      {job.requirements && (
        <div className="card">
          <b>{t("job.requirements")}</b>
          <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{job.requirements}</p>
        </div>
      )}
      {job.skills.length > 0 && (
        <div className="chips" style={{ marginBottom: 10 }}>{job.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
      )}
      {job.applied && job.application_status !== "withdrawn" ? (
        <p className="notice">{t("app.mine.applied", { status: statusLabel(job.application_status ?? "new") })}</p>
      ) : (
        <div className="card">
          <b>{t("job.apply")}</b>
          <p className="hint">{t("s.jobs.apply_hint")}</p>
          <textarea value={note} maxLength={1500} placeholder={t("job.apply_note")} onChange={(e) => setNote(e.target.value)} />
          <ErrorText error={error} />
          <button className="btn" style={{ marginTop: 8 }} disabled={busy || !canApply} onClick={apply}>
            {canApply ? (busy ? t("s.common.sending") : t("job.apply")) : t("s.jobs.verify_first")}
          </button>
        </div>
      )}
      <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
    </Sheet>
  );
}

function ContactCard({ contact, onAnswered }: { contact: StudentContact; onAnswered: () => void }) {
  useLang();
  const [error, setError] = useState("");
  async function answer(accept: boolean) {
    try {
      await api.answerContact(contact.id, accept);
      haptic("success");
      onAnswered();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div className="card" style={{ border: "2px solid var(--btn)" }}>
      <b>{t("s.jobs.contact", { company: contact.company })}</b>
      <div className="hint">{contact.industry}{contact.job_title ? ` · ${contact.job_title}` : ""}</div>
      <p style={{ whiteSpace: "pre-line" }}>{contact.message}</p>
      <p className="hint">{t("s.jobs.contact_hint")}</p>
      <ErrorText error={error} />
      <div className="row">
        <button className="btn ghost" onClick={() => answer(false)}>{t("s.jobs.decline")}</button>
        <button className="btn ok" onClick={() => answer(true)}>{t("s.jobs.accept")}</button>
      </div>
    </div>
  );
}
