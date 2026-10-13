import { useCallback, useEffect, useState } from "react";
import { api, APPLICATION_STATUS, JOB_KIND, salary, WORK_MODE, type Job, type JobKind, type Me, type MyApplication,
         type StudentContact } from "../api";
import { haptic } from "../tg";
import { ErrorText, Sheet, message } from "../ui";
import StudentTests from "./StudentTests";

const KINDS: [JobKind | "", string][] = [["", "Hammasi"], ["internship", "Amaliyot"], ["part_time", "Yarim stavka"],
                                        ["junior", "Junior"], ["project", "Loyiha"]];

export default function JobsScreen({ me, onOpenProfile }: { me: Me; onOpenProfile: () => void }) {
  const [view, setView] = useState<"jobs" | "mine" | "tests">("jobs");
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
  const loadContacts = useCallback(() => api.myContacts().then(setContacts, () => {}), []);
  useEffect(() => { void loadContacts(); }, [loadContacts]);

  const pending = contacts.filter((c) => c.status === "pending");
  const notReady = me.verification === "none" || me.verification === "rejected";

  return (
    <div>
      <h1>Vakansiyalar</h1>
      <div className="segmented">
        <button className={view === "jobs" ? "on" : ""} onClick={() => setView("jobs")}>Amaliyot va ish</button>
        <button className={view === "mine" ? "on" : ""} onClick={() => setView("mine")}>Arizalarim</button>
        <button className={view === "tests" ? "on" : ""} onClick={() => setView("tests")}>Testlar</button>
      </div>

      {pending.map((c) => <ContactCard key={c.id} contact={c} onAnswered={loadContacts} />)}

      {notReady && (
        <div className="notice" style={{ marginBottom: 10 }}>
          Ariza topshirish uchun talabaligingizni tasdiqlashga yuboring. Ish beruvchilar faqat haqiqiy talabalarni ko'radi.{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); onOpenProfile(); }}>Profilni to'ldirish</a>
        </div>
      )}

      {view === "jobs" && (
        <>
          <form className="row" onSubmit={(e) => { e.preventDefault(); loadJobs(); }}>
            <input className="grow" value={q} placeholder="Lavozim yoki kompaniya" onChange={(e) => setQ(e.target.value)} />
            <button className="btn small" type="submit">Qidirish</button>
          </form>
          <div className="scroll-tabs" style={{ marginTop: 8 }}>
            {KINDS.map(([id, label]) => <button key={id} className={`chip ${kind === id ? "on" : ""}`} onClick={() => setKind(id)}>{label}</button>)}
            <button className={`chip ${paidOnly ? "on" : ""}`} onClick={() => setPaidOnly(!paidOnly)}>To'lanadigan</button>
            <button className={`chip ${practiceOnly ? "on" : ""}`} onClick={() => setPracticeOnly(!practiceOnly)}>Malakaviy amaliyot</button>
          </div>
          <ErrorText error={error} />
          {!jobs && !error && <div className="hint">Yuklanmoqda…</div>}
          {jobs?.length === 0 && <div className="center hint">Hozircha mos vakansiya yo'q. Profilingizni to'ldiring, kompaniyalar o'zlari topadi.</div>}
          {jobs?.map((j) => <JobCard key={j.id} job={j} onOpen={() => setOpen(j)} />)}
        </>
      )}

      {view === "tests" && <StudentTests />}
      {view === "mine" && (
        <>
          {!mine && !error && <div className="hint">Yuklanmoqda…</div>}
          {mine?.length === 0 && <div className="center hint">Hali ariza topshirmagansiz</div>}
          {mine?.map((a) => (
            <div key={a.id} className="card tap" onClick={() => setOpen(a.job)}>
              <div className="row between">
                <span className="hint">{a.job.company_name}</span>
                <span className={`badge ${a.status === "hired" || a.status === "shortlisted" ? "peer_verified" : a.status === "rejected" ? "rejected" : "pending"}`}>
                  {APPLICATION_STATUS[a.status]}
                </span>
              </div>
              <b>{a.job.title}</b>
              <div className="hint">{new Date(a.created_at).toLocaleDateString()} da topshirilgan</div>
            </div>
          ))}
        </>
      )}

      {open && <JobSheet job={open} canApply={!notReady} onClose={() => setOpen(null)} onApplied={() => { setOpen(null); loadJobs(); }} />}
    </div>
  );
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  return (
    <div className="card tap" onClick={onOpen}>
      <div className="row between">
        <span className="hint">{job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ""}</span>
        {job.match >= 60 && <span className="badge peer_verified">{job.match}% mos</span>}
      </div>
      <b>{job.title}</b>
      <div className="chips" style={{ marginTop: 6 }}>
        <span className="chip">{JOB_KIND[job.kind]}</span>
        <span className="chip">{WORK_MODE[job.work_mode]}{job.city ? ` · ${job.city}` : ""}</span>
        <span className="chip">{salary(job)}</span>
        {job.counts_as_practice && <span className="chip">Amaliyotga o'tadi</span>}
      </div>
      {job.applied && <div className="hint" style={{ marginTop: 6 }}>Ariza topshirilgan: {APPLICATION_STATUS[job.application_status ?? "new"]}</div>}
    </div>
  );
}

function JobSheet({ job, canApply, onClose, onApplied }: { job: Job; canApply: boolean; onClose: () => void; onApplied: () => void }) {
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
        <span className="chip">{JOB_KIND[job.kind]}</span>
        <span className="chip">{WORK_MODE[job.work_mode]}{job.city ? ` · ${job.city}` : ""}</span>
        <span className="chip">{salary(job)}</span>
        {job.hours_per_week && <span className="chip">haftasiga {job.hours_per_week} soat</span>}
        {job.deadline && <span className="chip">muddat: {job.deadline}</span>}
      </div>
      {job.counts_as_practice && <p className="notice">Kompaniya bu o'rinni universitetdagi malakaviy amaliyot sifatida rasmiylashtirishga tayyor.</p>}
      {!job.is_paid && <p className="hint">Bu amaliyot to'lanmaydi. Mehnat kodeksiga ko'ra, bo'sh lavozimga muddatli shartnoma bilan qabul qilingan stajyorga haq to'lanadi.</p>}
      <div className="card">
        <b>Vazifalar</b>
        <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{job.description}</p>
      </div>
      {job.requirements && (
        <div className="card">
          <b>Talablar</b>
          <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{job.requirements}</p>
        </div>
      )}
      {job.skills.length > 0 && (
        <div className="chips" style={{ marginBottom: 10 }}>{job.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
      )}
      {job.applied ? (
        <p className="notice">Ariza topshirgansiz: {APPLICATION_STATUS[job.application_status ?? "new"]}</p>
      ) : (
        <div className="card">
          <b>Ariza topshirish</b>
          <p className="hint">Kompaniya ismingizni, tasdiqlangan ishlaringizni va CV'ingizni ko'radi.</p>
          <textarea value={note} maxLength={1500} placeholder="Qisqacha: nega aynan siz? (ixtiyoriy)" onChange={(e) => setNote(e.target.value)} />
          <ErrorText error={error} />
          <button className="btn" style={{ marginTop: 8 }} disabled={busy || !canApply} onClick={apply}>
            {canApply ? (busy ? "Yuborilmoqda…" : "Ariza topshirish") : "Avval talabalikni tasdiqlang"}
          </button>
        </div>
      )}
      <button className="btn ghost" onClick={onClose}>Yopish</button>
    </Sheet>
  );
}

function ContactCard({ contact, onAnswered }: { contact: StudentContact; onAnswered: () => void }) {
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
      <b>{contact.company} siz bilan bog'lanmoqchi</b>
      <div className="hint">{contact.industry}{contact.job_title ? ` · ${contact.job_title}` : ""}</div>
      <p style={{ whiteSpace: "pre-line" }}>{contact.message}</p>
      <p className="hint">Rozilik bersangiz, ismingiz, Telegram'ingiz va CV'ingiz shu kompaniyaga ochiladi.</p>
      <ErrorText error={error} />
      <div className="row">
        <button className="btn ghost" onClick={() => answer(false)}>Rad etish</button>
        <button className="btn ok" onClick={() => answer(true)}>Roziman</button>
      </div>
    </div>
  );
}
