import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api, type Job, type JobKind, type Me, type MyApplication,
         type StudentContact } from "../api";
import { kindLabel, modeLabel, salaryText } from "../format";
import { formatDateTime, t, useLang } from "../i18n";
import { ACTIVE_STATES, statusBadge, statusLabel } from "../pipeline";
import { ask, haptic } from "../tg";
import { ErrorText, Sheet, message } from "../ui";
import StudentTests from "./StudentTests";

const KINDS: (JobKind | "")[] = ["", "internship", "part_time", "junior", "project"];

export default function JobsScreen({ me, onOpenProfile, initialView = "jobs" }: {
  me: Me; onOpenProfile: () => void; initialView?: "jobs" | "mine" | "saved";
}) {
  useLang();
  const [view, setView] = useState<"jobs" | "mine" | "saved" | "tests">(initialView);
  const [saved, setSaved] = useState<Job[] | null>(null);
  const [kind, setKind] = useState<JobKind | "">("");
  const [paidOnly, setPaidOnly] = useState(false);
  const [practiceOnly, setPracticeOnly] = useState(false);
  const [q, setQ] = useState("");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [mine, setMine] = useState<MyApplication[] | null>(null);
  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [open, setOpen] = useState<Job | null>(null);
  const [error, setError] = useState("");

  const loadJobs = useCallback(() => {
    const params: Record<string, string> = {};
    if (kind) params.kind = kind;
    if (paidOnly) params.paid_only = "true";
    if (practiceOnly) params.practice_only = "true";
    if (q.trim()) params.q = q.trim();
    setJobs(null);
    api.jobs(params).then(setJobs, (e) => setError(message(e)));
  }, [kind, paidOnly, practiceOnly, q]);

  useEffect(() => { if (view === "jobs") loadJobs(); }, [view, kind, paidOnly, practiceOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view === "mine") api.myApplications().then(setMine, (e) => setError(message(e))); }, [view]);
  useEffect(() => { if (view === "saved") api.savedJobs().then(setSaved, (e) => setError(message(e))); }, [view]);
  const loadContacts = useCallback(() => api.myContacts().then(setContacts, () => {}), []);
  useEffect(() => { void loadContacts(); }, [loadContacts]);

  const pending = contacts.filter((c) => c.status === "pending");
  const notReady = me.verification === "none" || me.verification === "rejected";

  return (
    <div>
      <h1>{t("jobs.title")}</h1>
      <div className="segmented">
        <button className={view === "jobs" ? "on" : ""} onClick={() => setView("jobs")}>{t("jobs.tab.jobs")}</button>
        <button className={view === "mine" ? "on" : ""} onClick={() => setView("mine")}>{t("jobs.tab.mine")}</button>
        <button className={view === "saved" ? "on" : ""} onClick={() => setView("saved")}>{t("jobs.tab.saved")}</button>
        <button className={view === "tests" ? "on" : ""} onClick={() => setView("tests")}>{t("jobs.tab.tests")}</button>
      </div>

      {pending.map((c) => <ContactCard key={c.id} contact={c} onAnswered={loadContacts} />)}

      {notReady && (
        <div className="notice" style={{ marginBottom: 10 }}>
          {t("s.jobs.not_ready")}{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); onOpenProfile(); }}>{t("s.jobs.fill_profile")}</a>
        </div>
      )}

      {view === "jobs" && (
        <>
          <form className="row" onSubmit={(e) => { e.preventDefault(); loadJobs(); }}>
            <input className="grow" value={q} placeholder={t("pub.hero.search")} onChange={(e) => setQ(e.target.value)} />
            <button className="btn small" type="submit">{t("pub.hero.search_btn")}</button>
          </form>
          <div className="scroll-tabs" style={{ marginTop: 8 }}>
            {KINDS.map((id) => (
              <button key={id} className={`chip ${kind === id ? "on" : ""}`} onClick={() => setKind(id)}>{id ? kindLabel(id) : t("pub.filter.all")}</button>
            ))}
            <button className={`chip ${paidOnly ? "on" : ""}`} onClick={() => setPaidOnly(!paidOnly)}>{t("pub.filter.paid")}</button>
            <button className={`chip ${practiceOnly ? "on" : ""}`} onClick={() => setPracticeOnly(!practiceOnly)}>{t("pub.filter.practice")}</button>
          </div>
          <ErrorText error={error} />
          {!jobs && !error && <div className="hint">{t("common.loading")}</div>}
          {jobs?.length === 0 && <div className="center hint">{t("s.jobs.empty")}</div>}
          {jobs?.map((j) => <JobCard key={j.id} job={j} onOpen={() => setOpen(j)} />)}
        </>
      )}

      {view === "tests" && <StudentTests />}
      {view === "saved" && (
        <>
          {!saved && !error && <div className="hint">{t("common.loading")}</div>}
          {saved?.length === 0 && <div className="center hint">{t("jobs.saved_empty")}</div>}
          {saved?.map((j) => (
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
          ))}
        </>
      )}
      {view === "mine" && (
        <>
          {!mine && !error && <div className="hint">{t("common.loading")}</div>}
          {mine?.length === 0 && <div className="center hint">{t("app.mine.empty")}</div>}
          {mine?.map((a) => (
            <ApplicationCard key={a.id} app={a} onOpen={() => setOpen({ ...a.job, application_status: a.status })}
                             onWithdrawn={(updated) => setMine((cur) => cur?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
                             onError={setError} />
          ))}
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

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  useLang();
  return (
    <div className="card tap" onClick={onOpen}>
      <div className="row between">
        <span className="hint">{job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ""}</span>
        {job.match >= 60 && <span className="badge peer_verified">{t("home.match", { n: job.match })}</span>}
      </div>
      <b>{job.title}</b>
      <div className="chips" style={{ marginTop: 6 }}>
        <span className="chip">{kindLabel(job.kind)}</span>
        <span className="chip">{modeLabel(job.work_mode)}{job.city ? ` · ${job.city}` : ""}</span>
        <span className="chip">{salaryText(job)}</span>
        {job.counts_as_practice && <span className="chip">{t("job.practice")}</span>}
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
