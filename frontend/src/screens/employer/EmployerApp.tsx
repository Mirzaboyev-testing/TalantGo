import { useCallback, useEffect, useState } from "react";
import { api, APPLICATION_STATUS, JOB_KIND, salary, WORK_MODE, type Applicant, type EmployerContact, type Job,
         type JobInput, type JobKind, type Me, type TalentCard, type Track, type WorkMode } from "../../api";
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

type Tab = "students" | "jobs" | "tests" | "groups" | "profile";
const TABS: ShellTab<Tab>[] = [
  { id: "students", icon: "users", label: "Talabalar" },
  { id: "jobs", icon: "briefcase", label: "Vakansiyalarim" },
  { id: "tests", icon: "check", label: "Testlar" },
  { id: "groups", icon: "chat", label: "Guruhlar" },
  { id: "profile", icon: "building", label: "Profilim" },
];
const JOB_STATUS: Record<string, [string, string]> = {
  pending: ["Tekshiruvda", "pending"], approved: ["E'lon qilingan", "peer_verified"],
  rejected: ["Qaytarilgan", "rejected"], closed: ["Yopilgan", "todo"],
};

export default function EmployerApp({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("students");
  const [studentsView, setStudentsView] = useState<"all" | "contacts">("all");
  const [attempt, setAttempt] = useState<number | null>(null);
  const openAttempt = (id: number) => { setAttempt(id); setTab("tests"); };
  return (
    <Shell tabs={TABS} active={tab} onChange={(t) => { setAttempt(null); setTab(t); }} onLogout={onLogout}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: me.company?.name }}>
        {tab === "students" && (
          <>
            <div className="segmented">
              <button className={studentsView === "all" ? "on" : ""} onClick={() => setStudentsView("all")}>Barcha talabalar</button>
              <button className={studentsView === "contacts" ? "on" : ""} onClick={() => setStudentsView("contacts")}>Bog'lanish so'rovlari</button>
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
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const [applicantsOf, setApplicantsOf] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.jobs().then(setJobs, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (applicantsOf) return <Applicants job={applicantsOf} onBack={() => { setApplicantsOf(null); void load(); }} />;
  if (editing) return <JobForm job={editing === "new" ? undefined : editing} onDone={() => { setEditing(null); void load(); }} />;

  return (
    <div>
      <h1>Vakansiyalarim</h1>
      <button className="btn" onClick={() => setEditing("new")}><Icon name="plus" size={18} />Vakansiya qo'shish</button>
      <p className="hint">Faqat talabalar uchun: amaliyot, yarim stavka, junior va loyiha. Har bir e'lon admin tekshiruvidan keyin chiqadi.</p>
      <ErrorText error={error} />
      {!jobs && !error && <div className="hint">Yuklanmoqda…</div>}
      {jobs?.length === 0 && <div className="center hint">Hali vakansiya yo'q</div>}
      {jobs?.map((j) => (
        <div key={j.id} className="card">
          <div className="row between">
            <span className="hint">{JOB_KIND[j.kind]} · {salary(j)}</span>
            <span className={`badge ${JOB_STATUS[j.status][1]}`}>{JOB_STATUS[j.status][0]}</span>
          </div>
          <b>{j.title}</b>
          <div className="hint">{j.applications} ariza · {j.views} ko'rish</div>
          {j.status === "rejected" && j.review_note && <div className="error">Izoh: {j.review_note}</div>}
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => setApplicantsOf(j)}>Arizalar ({j.applications})</button>
            {j.status !== "closed" && <button className="btn small ghost" onClick={() => setEditing(j)}>Tahrirlash</button>}
            {j.status !== "closed" && (
              <button className="btn small ghost" onClick={async () => {
                if (await ask("Vakansiya yopilsinmi? Talabalar uni boshqa ko'rmaydi.")) { await api.employer.closeJob(j.id); void load(); }
              }}>Yopish</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function JobForm({ job, onDone }: { job?: Job; onDone: () => void }) {
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
      ["j-title", f.title.trim().length >= 3, "lavozim"],
      ["j-kind", Boolean(f.kind), "ish turi"],
      ["j-city", f.city.trim().length >= 2, "shahar"],
      ["j-desc", f.description.trim().length >= 20, "vazifalar (kamida 20 belgi)"],
      ["j-rules", rules, "platforma qoidalari"],
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
      toast("Vakansiya saqlandi va tekshiruvga yuborildi");
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />Orqaga</button>
      <h1>{job ? "Vakansiyani tahrirlash" : "Vakansiya qo'shish"}</h1>
      {job?.status === "approved" && <p className="notice">O'zgartirilgan e'lon qayta tekshiruvga yuboriladi.</p>}
      <p className="form-note"><Req />belgisi bor maydonlar majburiy.</p>
      <div className="card">
        <Field id="j-title" label="Lavozim" required error={errors["j-title"] && "Lavozim nomini yozing"}>
          <input id="j-title" className={cls("j-title")} value={f.title} maxLength={160} placeholder="Masalan: Data analitik stajyor" onChange={set("title", "j-title")} />
        </Field>
        <div className="row">
          <div className="grow">
            <Field id="j-kind" label="Ish turi" required error={errors["j-kind"] && "Tanlang"}>
              <select id="j-kind" className={cls("j-kind")} value={f.kind} onChange={set("kind", "j-kind")}>
                <option value="">Tanlang…</option>
                {(Object.keys(JOB_KIND) as JobKind[]).map((k) => <option key={k} value={k}>{JOB_KIND[k]}</option>)}
              </select>
            </Field>
          </div>
          <div className="grow">
            <Field id="j-mode" label="Format" required>
              <select id="j-mode" value={f.work_mode} onChange={set("work_mode")}>{(Object.keys(WORK_MODE) as WorkMode[]).map((k) => <option key={k} value={k}>{WORK_MODE[k]}</option>)}</select>
            </Field>
          </div>
        </div>
        <div className="row">
          <div className="grow">
            <Field id="j-city" label="Shahar" required error={errors["j-city"] && "Shaharni yozing"}>
              <input id="j-city" className={cls("j-city")} value={f.city} maxLength={60} onChange={set("city", "j-city")} />
            </Field>
          </div>
          <div style={{ width: 120 }}><Field id="j-hours" label="Soat/hafta"><input id="j-hours" value={f.hours} inputMode="numeric" placeholder="20" onChange={set("hours")} /></Field></div>
        </div>
        <label className="radio-line" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={f.is_paid} onChange={(e) => setF({ ...f, is_paid: e.target.checked })} />To'lanadi
        </label>
        {f.is_paid ? (
          <div className="row">
            <div className="grow"><Field id="j-from" label="Maosh, so'm/oy (dan)"><input id="j-from" value={f.salary_from} inputMode="numeric" placeholder="2000000" onChange={set("salary_from")} /></Field></div>
            <div className="grow"><Field id="j-to" label="gacha"><input id="j-to" value={f.salary_to} inputMode="numeric" placeholder="3000000" onChange={set("salary_to")} /></Field></div>
          </div>
        ) : (
          <p className="hint">To'lanmaydigan amaliyot talabalarga aniq ko'rsatiladi. Bo'sh lavozimga muddatli shartnoma bilan olinsa, Mehnat kodeksiga ko'ra haq to'lanadi.</p>
        )}
        <Field id="j-desc" label="Vazifalar" required error={errors["j-desc"] && "Kamida 20 belgi yozing"}>
          <textarea id="j-desc" className={cls("j-desc")} value={f.description} maxLength={5000}
                    placeholder="Stajyor nima qiladi, nimani o'rganadi, kimga hisobot beradi" onChange={set("description", "j-desc")} />
        </Field>
        <Field id="j-req" label="Talablar"><textarea id="j-req" value={f.requirements} maxLength={3000} onChange={set("requirements")} /></Field>
        <Field id="j-skills" label="Ko'nikmalar (vergul bilan)" hint="Talabalar bilan moslikni hisoblash uchun">
          <input id="j-skills" value={f.skills} placeholder="SQL, Power BI, Excel" onChange={set("skills")} />
        </Field>
        <label>Mos yo'nalishlar</label>
        <div className="chips">
          {tracks.map((t) => (
            <button key={t.id} type="button" className={`chip ${f.track_ids.includes(t.id) ? "on" : ""}`}
                    onClick={() => setF({ ...f, track_ids: f.track_ids.includes(t.id) ? f.track_ids.filter((x) => x !== t.id) : [...f.track_ids, t.id] })}>
              {t.title.split(":")[0]}
            </button>
          ))}
        </div>
        <Field id="j-deadline" label="Ariza muddati"><input id="j-deadline" type="date" value={f.deadline} onChange={set("deadline")} /></Field>
        <label className="radio-line" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={f.practice} onChange={(e) => setF({ ...f, practice: e.target.checked })} />
          <span>Universitetdagi malakaviy amaliyot sifatida rasmiylashtirishga tayyormiz (shartnoma va xulosa beramiz)</span>
        </label>
        <label id="j-rules" tabIndex={-1} className={groupCls("j-rules", "radio-line")} style={{ marginTop: 12 }}>
          <input type="checkbox" checked={rules} onChange={(e) => { setRules(e.target.checked); clear("j-rules"); }} />
          <span>Bu MLM yoki faqat foizga ishlash emas. Talabadan hech qanday to'lov olinmaydi va pasport yoki karta ma'lumotlari so'ralmaydi.<Req /></span>
        </label>
        {errors["j-rules"] && <div className="field-error">Qoidalarni tasdiqlang</div>}
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={save}>
          {busy ? "Yuborilmoqda…" : "Saqlash va tekshiruvga yuborish"}
        </button>
      </div>
    </div>
  );
}

const NEXT_STATUS: [string, string, string][] = [["shortlisted", "Keyingi bosqich", "ok"], ["hired", "Qabul qilindi", "ok"], ["rejected", "Rad etish", "bad"]];

function Applicants({ job, onBack }: { job: Job; onBack: () => void }) {
  const [items, setItems] = useState<Applicant[] | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.employer.applicants(job.id).then(setItems, (e) => setError(message(e))); }, [job.id]);

  async function setStatus(a: Applicant, status: string) {
    try {
      const updated = await api.employer.updateApplication(a.id, { status });
      setItems((cur) => cur?.map((x) => (x.id === a.id ? updated : x)) ?? null);
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />Vakansiyalar</button>
      <h1>{job.title}</h1>
      <p className="hint">Talaba o'zi ariza topshirgani uchun ismi va CV'si sizga ochiq. Holatni o'zgartirsangiz, talabaga bot orqali xabar boradi.</p>
      <ErrorText error={error} />
      {items?.length === 0 && <div className="center hint">Hali ariza yo'q</div>}
      {items?.map((a) => (
        <div key={a.id} className="card">
          <div className="row between">
            <b>{a.identity.full_name}</b>
            <span className={`badge ${a.status === "hired" || a.status === "shortlisted" ? "peer_verified" : a.status === "rejected" ? "rejected" : "pending"}`}>{APPLICATION_STATUS[a.status]}</span>
          </div>
          <CardBody card={a.card} />
          {a.note && <p style={{ whiteSpace: "pre-line" }}>«{a.note}»</p>}
          <div className="row wrap" style={{ marginTop: 8 }}>
            {a.identity.username && <button className="btn small" onClick={() => openLink(`https://t.me/${a.identity.username}`)}>Telegram'da yozish</button>}
            <button className="btn small ghost" onClick={() => setProfile(a.card.id)}>Profil</button>
            <button className="btn small ghost" onClick={() => downloadCv(a.card.id)}>CV (PDF)</button>
            {NEXT_STATUS.filter(([s]) => s !== a.status).map(([s, label, kind]) => (
              <button key={s} className={`btn small ${kind === "bad" ? "ghost" : "ghost"}`} onClick={() => setStatus(a, s)}>{label}</button>
            ))}
          </div>
        </div>
      ))}
      {profile && <StudentSheet id={profile} catalog={null} onClose={() => setProfile(null)} />}
    </div>
  );
}

// --------------------------------------------------------------------------- shared card

function CardBody({ card }: { card: TalentCard }) {
  return (
    <>
      {card.headline && <div style={{ fontWeight: 600 }}>{card.headline}</div>}
      <div className="hint">
        {[card.university, card.faculty, card.course && (card.course === 7 ? "magistratura" : `${card.course}-kurs`), card.city].filter(Boolean).join(" · ")}
      </div>
      <div className="hint">
        {card.track ?? "yo'nalish yo'q"} · {card.points} ball · {card.verified_tasks} tasdiqlangan ish
        {card.gpa != null ? ` · GPA ${card.gpa}/${card.gpa_scale}` : ""}
      </div>
      {(card.skills.length > 0 || card.languages.length > 0) && (
        <div className="chips" style={{ marginTop: 6 }}>
          {card.skills.map((s) => <span key={s} className="chip">{s}</span>)}
          {card.languages.map((s) => <span key={s} className="chip">{s}</span>)}
        </div>
      )}
    </>
  );
}

function ContactsTab() {
  const [items, setItems] = useState<EmployerContact[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.employer.contacts().then(setItems, (e) => setError(message(e))); }, []);
  return (
    <div>
      <h1>Kontaktlar</h1>
      <ErrorText error={error} />
      {items?.length === 0 && <div className="center hint">Hali so'rov yubormagansiz. Talaba profilidan «Bog'lanish so'rovi»ni bosing.</div>}
      {items?.map((c) => (
        <div key={c.id} className="card">
          <div className="row between">
            <b>{c.identity ? c.identity.full_name : `Talaba ${c.card.code}`}</b>
            <span className={`badge ${c.status === "accepted" ? "peer_verified" : c.status === "declined" ? "rejected" : "pending"}`}>
              {c.status === "accepted" ? "Rozi bo'ldi" : c.status === "declined" ? "Rad etdi" : "Javob kutilmoqda"}
            </span>
          </div>
          <CardBody card={c.card} />
          {c.identity && (
            <div className="row wrap" style={{ marginTop: 8 }}>
              {c.identity.username && <button className="btn small" onClick={() => openLink(`https://t.me/${c.identity!.username}`)}>Telegram'da yozish</button>}
              {c.identity.cv_url && <button className="btn small ghost" onClick={() => openLink(c.identity!.cv_url!)}>CV</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
