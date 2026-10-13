import { Fragment, useCallback, useEffect, useState } from "react";
import { api, APPLICATION_STATUS, JOB_KIND, loadCatalog, QUESTION_KIND, salary, TEST_STATUS, type AdminApplication, type Catalog,
         type Company, type CompanyTestFull, type Job } from "../../api";
import { openLink } from "../../tg";
import { ErrorText, message } from "../../ui";

const when = (s: string) => new Date(s).toLocaleDateString("uz");
const STATE: Record<string, [string, string]> = {
  pending: ["Kutilmoqda", "pending"], approved: ["Tasdiqlangan", "peer_verified"],
  rejected: ["Rad etilgan", "rejected"], closed: ["Yopilgan", "todo"],
};
const Badge = ({ s }: { s: string }) => <span className={`badge ${STATE[s]?.[1] ?? "todo"}`}>{STATE[s]?.[0] ?? s}</span>;

function Tabs({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: [string, string][] }) {
  return (
    <div className="chips">
      {items.map(([id, label]) => <button key={id} className={`chip ${value === id ? "on" : ""}`} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}

async function decide(action: () => Promise<unknown>, reload: () => void, setError: (e: string) => void) {
  try { await action(); reload(); } catch (e) { setError(message(e)); }
}

// --------------------------------------------------------------------------- companies

export function Companies() {
  const [status, setStatus] = useState("pending");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => { loadCatalog().then(setCatalog, () => {}); }, []);
  const [rows, setRows] = useState<Company[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { setRows(null); api.admin.companies(status).then(setRows, (e) => setError(message(e))); }, [status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        <Tabs value={status} onChange={setStatus} items={[["pending", "Kutilmoqda"], ["approved", "Tasdiqlangan"], ["rejected", "Rad etilgan"], ["", "Hammasi"]]} />
        <button className="btn small ghost" onClick={() => openLink("https://module.stat.uz/egrpo/")}>STIR reyestri</button>
      </div>
      <p className="hint">STIR'ni davlat reyestrida (module.stat.uz/egrpo) va soliq holatini my.soliq.uz'da tekshiring. MLM va talabadan pul oladiganlarni rad eting.</p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="hint">Bo'sh</div>}
      {rows && rows.length > 0 && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Kompaniya</th><th>STIR</th><th>Turi</th><th>Soha</th><th>Xodimlar</th><th>Shahar</th><th>Holat</th><th>Sana</th><th /></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}>
              <td><b>{c.name}</b>{c.description && <div className="hint" style={{ maxWidth: 320 }}>{c.description.slice(0, 140)}</div>}
                {c.website && <div><a href={c.website} target="_blank" rel="noreferrer">{c.website}</a></div>}
                {(c.telegram || c.email) && <div className="hint">{[c.telegram, c.email].filter(Boolean).join(" · ")}</div>}</td>
              <td>{c.stir ?? "—"}</td><td>{catalog?.legal_forms[c.legal_form] ?? (c.legal_form || "—")}</td>
              <td>{catalog?.industries[c.industry] ?? c.industry}</td><td>{c.size || "—"}</td><td>{c.city}</td><td><Badge s={c.status} /></td>
              <td>{when(c.created_at)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {c.status !== "approved" && <button className="btn small ok" onClick={() => decide(() => api.admin.reviewCompany(c.id, true, ""), load, setError)}>Tasdiqlash</button>}{" "}
                {c.status !== "rejected" && <button className="btn small ghost" onClick={() => {
                  const note = prompt("Rad etish sababi (kompaniyaga yuboriladi):") ?? "";
                  if (note.trim()) void decide(() => api.admin.reviewCompany(c.id, false, note.trim()), load, setError);
                }}>Rad etish</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- jobs

export function Jobs() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Job[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { setRows(null); api.admin.allJobs(status).then(setRows, (e) => setError(message(e))); }, [status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        <Tabs value={status} onChange={setStatus} items={[["pending", "Tekshiruvda"], ["approved", "E'lon qilingan"], ["rejected", "Qaytarilgan"], ["closed", "Yopilgan"], ["", "Hammasi"]]} />
      </div>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="hint">Bo'sh</div>}
      {rows && rows.length > 0 && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Vakansiya</th><th>Kompaniya</th><th>Turi</th><th>Maosh</th><th>Holat</th><th className="num">Ko'rish</th><th>Sana</th><th /></tr></thead>
          <tbody>{rows.map((j) => (
            <Fragment key={j.id}>
              <tr>
                <td><a href="#" onClick={(e) => { e.preventDefault(); setOpen(open === j.id ? null : j.id); }}><b>{j.title}</b></a>
                  <div className="hint">{j.city}{j.counts_as_practice ? " · amaliyotga o'tadi" : ""}</div></td>
                <td>{j.company_name}</td><td>{JOB_KIND[j.kind]}</td><td>{salary(j)}</td><td><Badge s={j.status} /></td>
                <td className="num">{j.views}</td><td>{when(j.created_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {j.status !== "approved" && j.status !== "closed" && <button className="btn small ok" onClick={() => decide(() => api.admin.reviewJob(j.id, true, ""), load, setError)}>E'lon qilish</button>}{" "}
                  {j.status !== "rejected" && j.status !== "closed" && <button className="btn small ghost" onClick={() => {
                    const note = prompt("Qaytarish sababi (kompaniyaga yuboriladi):") ?? "";
                    if (note.trim()) void decide(() => api.admin.reviewJob(j.id, false, note.trim()), load, setError);
                  }}>Qaytarish</button>}
                </td>
              </tr>
              {open === j.id && (
                <tr><td colSpan={8}>
                  <div style={{ whiteSpace: "pre-line" }}>{j.description}</div>
                  {j.requirements && <div className="hint" style={{ whiteSpace: "pre-line", marginTop: 6 }}>{j.requirements}</div>}
                  {j.skills.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{j.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- applications

export function Applications() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminApplication[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (q.trim()) params.q = q.trim();
    setRows(null);
    api.admin.applications(params).then(setRows, (e) => setError(message(e)));
  }, [status, q]);
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="panel">
      <div className="panel-head">
        <Tabs value={status} onChange={setStatus} items={[["", "Hammasi"], ...Object.entries(APPLICATION_STATUS)] as [string, string][]} />
        <div className="row">
          <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input value={q} placeholder="Nomzod, vakansiya, kompaniya" onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
            <button className="btn small" type="submit">Qidirish</button>
          </form>
          <button className="btn small ghost" onClick={() => api.admin.exportApplications().catch((e) => setError(message(e)))}>CSV</button>
        </div>
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">Yuklanmoqda…</div>}
      {rows?.length === 0 && <div className="hint">Ariza yo'q</div>}
      {rows && rows.length > 0 && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Nomzod</th><th>Telefon</th><th>Universitet</th><th>Vakansiya</th><th>Kompaniya</th><th>Holat</th><th>Sana</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td><b>{a.candidate}</b>{a.username && <div className="hint">@{a.username}</div>}</td>
              <td>{a.phone || "—"}</td><td>{a.university ?? "—"}</td>
              <td>{a.job}<div className="hint">{JOB_KIND[a.kind]}</div></td><td>{a.company}</td>
              <td>{APPLICATION_STATUS[a.status]}</td><td>{when(a.created_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- company tests

const AUDIENCE: Record<string, string> = { all: "Barcha talabalar", tracks: "Tanlangan yo'nalishlar", applicants: "Ariza berganlar" };

export function Tests() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<CompanyTestFull[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { setRows(null); api.admin.tests(status).then(setRows, (e) => setError(message(e))); }, [status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        <Tabs value={status} onChange={setStatus} items={[["pending", "Tekshiruvda"], ["approved", "E'lon qilingan"], ["rejected", "Qaytarilgan"], ["closed", "Yopilgan"], ["", "Hammasi"]]} />
      </div>
      <p className="hint">Savollarni ochib o'qing: reklama, shaxsiy ma'lumot (pasport, karta) yoki to'lov so'raydigan testlarni qaytaring. Tasdiqlangan test mos talabalarga bot orqali e'lon qilinadi.</p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="hint">Bo'sh</div>}
      {rows && rows.length > 0 && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Test</th><th>Kompaniya</th><th>Kimga</th><th className="num">Savol</th><th className="num">Ball</th><th className="num">Topshirgan</th><th>Holat</th><th>Sana</th><th /></tr></thead>
          <tbody>{rows.map((t) => (
            <Fragment key={t.id}>
              <tr>
                <td><a href="#" onClick={(e) => { e.preventDefault(); setOpen(open === t.id ? null : t.id); }}><b>{t.title}</b></a>
                  <div className="hint">{t.is_survey ? "So'rovnoma" : "Test"}{t.time_limit_min ? ` · ${t.time_limit_min} daqiqa` : ""}{t.deadline ? ` · ${t.deadline} gacha` : ""}</div></td>
                <td>{t.company}</td><td>{AUDIENCE[t.audience]}{t.job_title ? <div className="hint">{t.job_title}</div> : null}</td>
                <td className="num">{t.questions_count}</td><td className="num">{t.max_score}</td><td className="num">{t.attempts}</td>
                <td><span className={`badge ${TEST_STATUS[t.status][1]}`}>{TEST_STATUS[t.status][0]}</span></td>
                <td>{when(t.updated_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {(t.status === "pending" || t.status === "rejected") && <button className="btn small ok" onClick={() => decide(() => api.admin.reviewTest(t.id, true, ""), load, setError)}>Tasdiqlash</button>}{" "}
                  {(t.status === "pending" || t.status === "approved") && <button className="btn small ghost" onClick={() => {
                    const note = prompt("Qaytarish sababi (kompaniyaga yuboriladi):") ?? "";
                    if (note.trim()) void decide(() => api.admin.reviewTest(t.id, false, note.trim()), load, setError);
                  }}>{t.status === "approved" ? "Yashirish" : "Qaytarish"}</button>}
                </td>
              </tr>
              {open === t.id && (
                <tr><td colSpan={9}>
                  {t.description && <p style={{ whiteSpace: "pre-line", marginTop: 0 }}>{t.description}</p>}
                  {t.questions.map((q, n) => (
                    <div key={q.id} style={{ marginBottom: 8 }}>
                      <b>{n + 1}. {q.text}</b> <span className="hint">({QUESTION_KIND[q.kind]}, {q.points} ball)</span>
                      {q.options.map((o, k) => (
                        <div key={k} className="hint" style={{ paddingLeft: 14, color: q.correct?.includes(k) ? "var(--ok)" : undefined }}>
                          {q.correct?.includes(k) ? "✓" : "·"} {o}
                        </div>
                      ))}
                    </div>
                  ))}
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
