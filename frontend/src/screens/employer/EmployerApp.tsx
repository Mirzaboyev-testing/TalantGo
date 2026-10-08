import { useCallback, useEffect, useState } from "react";
import { api, APPLICATION_STATUS, JOB_KIND, salary, WORK_MODE, type Applicant, type EmployerContact, type Job,
         type JobInput, type JobKind, type Me, type TalentCard, type Track, type University, type WorkMode } from "../../api";
import { ask, haptic, openLink } from "../../tg";
import { ErrorText, Sheet, message } from "../../ui";
import CompanyForm from "./CompanyForm";
import Groups from "../Groups";
import Shell, { type ShellTab } from "../Shell";
import { Icon } from "../../icons";

type Tab = "jobs" | "talent" | "contacts" | "groups" | "company";
const TABS: ShellTab<Tab>[] = [
  { id: "jobs", icon: "briefcase", label: "Vakansiyalar" },
  { id: "talent", icon: "search", label: "Talantlar" },
  { id: "contacts", icon: "inbox", label: "Kontaktlar" },
  { id: "groups", icon: "chat", label: "Guruhlar" },
  { id: "company", icon: "building", label: "Kompaniya" },
];
const JOB_STATUS: Record<string, [string, string]> = {
  pending: ["Tekshiruvda", "pending"], approved: ["E'lon qilingan", "peer_verified"],
  rejected: ["Qaytarilgan", "rejected"], closed: ["Yopilgan", "todo"],
};

export default function EmployerApp({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("jobs");
  return (
    <Shell tabs={TABS} active={tab} onChange={setTab} onLogout={onLogout}
           user={{ name: me.full_name, photo: me.photo_url, subtitle: me.company?.name }}>
        {tab === "jobs" && <JobsTab />}
        {tab === "talent" && <TalentTab />}
        {tab === "contacts" && <ContactsTab />}
        {tab === "groups" && <Groups />}
        {tab === "company" && (
          <div>
            <h1>Kompaniya</h1>
            {me.company && (
              <CompanyForm initial={me.company} submitLabel="Saqlash"
                           onSubmit={async (c) => { await api.employer.editCompany(c); onChanged(await api.me()); }} />
            )}
            <p className="hint">Nom yoki STIR o'zgarsa, kompaniya qayta tekshiriladi.</p>
          </div>
        )}
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
      <h1>Vakansiyalar</h1>
      <button className="btn" onClick={() => setEditing("new")}>+ Yangi vakansiya</button>
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
    title: job?.title ?? "", kind: (job?.kind ?? "internship") as JobKind, work_mode: (job?.work_mode ?? "office") as WorkMode,
    city: job?.city ?? "Toshkent", is_paid: job?.is_paid ?? true, salary_from: job?.salary_from ? String(job.salary_from) : "",
    salary_to: job?.salary_to ? String(job.salary_to) : "", hours: job?.hours_per_week ? String(job.hours_per_week) : "",
    description: job?.description ?? "", requirements: job?.requirements ?? "", skills: job?.skills.join(", ") ?? "",
    track_ids: job?.track_ids ?? [] as number[], practice: job?.counts_as_practice ?? false, deadline: job?.deadline ?? "",
  });
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.tracks().then(setTracks, () => {}); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")) : null);

  async function save() {
    const body: JobInput = {
      title: f.title.trim(), kind: f.kind, work_mode: f.work_mode, city: f.city.trim(), is_paid: f.is_paid,
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
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />Orqaga</button>
      <h1>{job ? "Vakansiyani tahrirlash" : "Yangi vakansiya"}</h1>
      {job?.status === "approved" && <p className="notice">O'zgartirilgan e'lon qayta tekshiruvga yuboriladi.</p>}
      <div className="card">
        <label>Lavozim</label>
        <input value={f.title} maxLength={160} placeholder="Masalan: Data analitik stajyor" onChange={set("title")} />
        <div className="row">
          <div className="grow"><label>Turi</label>
            <select value={f.kind} onChange={set("kind")}>{(Object.keys(JOB_KIND) as JobKind[]).map((k) => <option key={k} value={k}>{JOB_KIND[k]}</option>)}</select>
          </div>
          <div className="grow"><label>Format</label>
            <select value={f.work_mode} onChange={set("work_mode")}>{(Object.keys(WORK_MODE) as WorkMode[]).map((k) => <option key={k} value={k}>{WORK_MODE[k]}</option>)}</select>
          </div>
        </div>
        <div className="row">
          <div className="grow"><label>Shahar</label><input value={f.city} maxLength={60} onChange={set("city")} /></div>
          <div style={{ width: 120 }}><label>Soat/hafta</label><input value={f.hours} inputMode="numeric" placeholder="20" onChange={set("hours")} /></div>
        </div>
        <label className="row" style={{ color: "var(--text)", marginTop: 12, gap: 8 }}>
          <input type="checkbox" checked={f.is_paid} style={{ width: 20, height: 20 }} onChange={(e) => setF({ ...f, is_paid: e.target.checked })} />
          To'lanadi
        </label>
        {f.is_paid ? (
          <div className="row">
            <div className="grow"><label>Maosh, so'm/oy (dan)</label><input value={f.salary_from} inputMode="numeric" placeholder="2000000" onChange={set("salary_from")} /></div>
            <div className="grow"><label>gacha</label><input value={f.salary_to} inputMode="numeric" placeholder="3000000" onChange={set("salary_to")} /></div>
          </div>
        ) : (
          <p className="hint">To'lanmaydigan amaliyot talabalarga aniq ko'rsatiladi. Bo'sh lavozimga muddatli shartnoma bilan olinsa, Mehnat kodeksiga ko'ra haq to'lanadi.</p>
        )}
        <label>Vazifalar</label>
        <textarea value={f.description} maxLength={5000} placeholder="Stajyor nima qiladi, nimani o'rganadi, kimga hisobot beradi" onChange={set("description")} />
        <label>Talablar (ixtiyoriy)</label>
        <textarea value={f.requirements} maxLength={3000} onChange={set("requirements")} />
        <label>Ko'nikmalar (vergul bilan, moslikni hisoblash uchun)</label>
        <input value={f.skills} placeholder="SQL, Power BI, Excel" onChange={set("skills")} />
        <label>Mos yo'nalishlar</label>
        <div className="chips">
          {tracks.map((t) => (
            <button key={t.id} className={`chip ${f.track_ids.includes(t.id) ? "on" : ""}`}
                    onClick={() => setF({ ...f, track_ids: f.track_ids.includes(t.id) ? f.track_ids.filter((x) => x !== t.id) : [...f.track_ids, t.id] })}>
              {t.title.split(":")[0]}
            </button>
          ))}
        </div>
        <label>Ariza muddati (ixtiyoriy)</label>
        <input type="date" value={f.deadline} onChange={set("deadline")} />
        <label className="row" style={{ color: "var(--text)", marginTop: 12, gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={f.practice} style={{ width: 20, height: 20, flex: "none" }} onChange={(e) => setF({ ...f, practice: e.target.checked })} />
          <span>Universitetdagi malakaviy amaliyot sifatida rasmiylashtirishga tayyormiz (shartnoma va xulosa beramiz)</span>
        </label>
        <label className="row" style={{ color: "var(--text)", marginTop: 12, gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={rules} style={{ width: 20, height: 20, flex: "none" }} onChange={(e) => setRules(e.target.checked)} />
          <span>Bu MLM yoki faqat foizga ishlash emas. Talabadan hech qanday to'lov olinmaydi va pasport yoki karta ma'lumotlari so'ralmaydi.</span>
        </label>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 12 }} disabled={busy || !rules || f.title.trim().length < 3 || f.description.trim().length < 20} onClick={save}>
          {busy ? "Yuborilmoqda…" : "Tekshiruvga yuborish"}
        </button>
      </div>
    </div>
  );
}

const NEXT_STATUS: [string, string, string][] = [["shortlisted", "Keyingi bosqich", "ok"], ["hired", "Qabul qilindi", "ok"], ["rejected", "Rad etish", "bad"]];

function Applicants({ job, onBack }: { job: Job; onBack: () => void }) {
  const [items, setItems] = useState<Applicant[] | null>(null);
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
            {a.identity.cv_url && <button className="btn small ghost" onClick={() => openLink(a.identity.cv_url!)}>CV</button>}
            {NEXT_STATUS.filter(([s]) => s !== a.status).map(([s, label, kind]) => (
              <button key={s} className={`btn small ${kind === "bad" ? "ghost" : "ghost"}`} onClick={() => setStatus(a, s)}>{label}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- talent search

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

function TalentTab() {
  const [unis, setUnis] = useState<University[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [filters, setFilters] = useState({ university_id: "", track_id: "", course: "", skill: "", job_type: "", verified_only: false });
  const [cards, setCards] = useState<TalentCard[] | null>(null);
  const [contacting, setContacting] = useState<TalentCard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.universities().then(setUnis, () => {});
    api.tracks().then(setTracks, () => {});
  }, []);

  const search = useCallback(() => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) if (v) params[k] = String(v);
    setCards(null); setError("");
    api.employer.talent(params).then(setCards, (e) => setError(message(e)));
  }, [filters]);
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div>
      <h1>Talantlar</h1>
      <p className="hint">Ishga tayyorligini bildirgan talabalar. Ismlar yashirin: siz ko'nikmalar va tasdiqlangan natijalarga qarab tanlaysiz. Talaba rozi bo'lsa, ismi va Telegram'i ochiladi.</p>
      <div className="card">
        <div className="row">
          <select className="grow" value={filters.university_id} onChange={set("university_id")}>
            <option value="">Barcha universitetlar</option>
            {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name}</option>)}
          </select>
          <select className="grow" value={filters.track_id} onChange={set("track_id")}>
            <option value="">Barcha yo'nalishlar</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.title.split(":")[0]}</option>)}
          </select>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <select className="grow" value={filters.course} onChange={set("course")}>
            <option value="">Har qanday kurs</option>
            {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c}-kurs</option>)}
            <option value="7">Magistratura</option>
          </select>
          <select className="grow" value={filters.job_type} onChange={set("job_type")}>
            <option value="">Har qanday ish</option>
            {(Object.keys(JOB_KIND) as JobKind[]).map((k) => <option key={k} value={k}>{JOB_KIND[k]}</option>)}
          </select>
        </div>
        <input style={{ marginTop: 8 }} value={filters.skill} placeholder="Ko'nikma: SQL, Power BI…" onChange={set("skill")} />
        <label className="row" style={{ color: "var(--text)", gap: 8 }}>
          <input type="checkbox" checked={filters.verified_only} style={{ width: 20, height: 20 }}
                 onChange={(e) => setFilters({ ...filters, verified_only: e.target.checked })} />
          Faqat talabaligi tasdiqlanganlar
        </label>
        <button className="btn" style={{ marginTop: 10 }} onClick={search}>Qidirish</button>
      </div>
      <ErrorText error={error} />
      {!cards && !error && <div className="hint">Yuklanmoqda…</div>}
      {cards?.length === 0 && <div className="center hint">Mos talaba topilmadi. Filtrlarni kengaytiring.</div>}
      {cards?.map((c) => (
        <div key={c.id} className="card">
          <div className="row between">
            <b>Talaba {c.code}</b>
            {c.verification === "verified" ? <span className="badge peer_verified">{c.verified_by || "Tasdiqlangan"}</span>
              : <span className="badge todo">Tasdiq kutilmoqda</span>}
          </div>
          <CardBody card={c} />
          <div style={{ marginTop: 8 }}>
            {c.contact_status ? (
              <span className="hint">So'rov yuborilgan: {c.contact_status === "accepted" ? "rozi bo'ldi" : c.contact_status === "declined" ? "rad etdi" : "javob kutilmoqda"}</span>
            ) : (
              <button className="btn small" onClick={() => setContacting(c)}>Bog'lanish so'rovi</button>
            )}
          </div>
        </div>
      ))}
      {contacting && <ContactSheet card={contacting} onClose={() => setContacting(null)} onSent={() => { setContacting(null); search(); }} />}
    </div>
  );
}

function ContactSheet({ card, onClose, onSent }: { card: TalentCard; onClose: () => void; onSent: () => void }) {
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  async function send() {
    try {
      await api.employer.contact(card.id, msg.trim());
      haptic("success");
      onSent();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Sheet onClose={onClose}>
      <h1>Talaba {card.code}</h1>
      <p className="hint">Xabaringiz botdan talabaga boradi. U rozi bo'lsa, «Kontaktlar»da ismi va Telegram'i ochiladi. Kuniga 20 tagacha so'rov.</p>
      <textarea value={msg} maxLength={1000} placeholder="Kim ekansiz va nimani taklif qilyapsiz: amaliyot, muddat, to'lov" onChange={(e) => setMsg(e.target.value)} />
      <ErrorText error={error} />
      <div className="stack" style={{ marginTop: 10 }}>
        <button className="btn" disabled={msg.trim().length < 10} onClick={send}>Yuborish</button>
        <button className="btn ghost" onClick={onClose}>Bekor qilish</button>
      </div>
    </Sheet>
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
      {items?.length === 0 && <div className="center hint">Hali so'rov yubormagansiz. «Talantlar»dan boshlang.</div>}
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
