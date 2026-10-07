import { useCallback, useEffect, useState } from "react";
import { api, JOB_KIND, salary, type Company, type Job, type PendingStudent, type StaffRequest } from "../../api";
import { openLink } from "../../tg";
import { ErrorText, message } from "../../ui";
import type { AdminCtx } from "./AdminPanel";

type Kind = "verifications" | "companies" | "jobs" | "staff";
const KINDS: [Kind, string][] = [["verifications", "Talabalar"], ["companies", "Kompaniyalar"], ["jobs", "Vakansiyalar"], ["staff", "Universitet xodimlari"]];

export default function Queue({ ctx }: { ctx: AdminCtx }) {
  const [kind, setKind] = useState<Kind>("verifications");
  const [counts, setCounts] = useState<Record<Kind, number> | null>(null);
  const refreshCounts = useCallback(() => api.admin.inbox().then(setCounts, () => {}), []);
  useEffect(() => { void refreshCounts(); }, [refreshCounts]);

  return (
    <div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {KINDS.map(([k, label]) => (
          <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
            {label}{counts && counts[k] > 0 && <span className="dot">{counts[k]}</span>}
          </button>
        ))}
      </div>
      {kind === "verifications" && <Verifications onChanged={refreshCounts} />}
      {kind === "companies" && <Companies onChanged={refreshCounts} />}
      {kind === "jobs" && <Jobs onChanged={refreshCounts} />}
      {kind === "staff" && <Staff ctx={ctx} onChanged={refreshCounts} />}
    </div>
  );
}

function Decision({ onDecide, needNote = true }: { onDecide: (approve: boolean, note: string) => Promise<void>; needNote?: boolean }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(approve: boolean) {
    setBusy(true); setError("");
    try { await onDecide(approve, note.trim()); } catch (e) { setError(message(e)); setBusy(false); }
  }
  return (
    <div style={{ marginTop: 8 }}>
      {needNote && <input value={note} placeholder="Izoh (rad etsangiz, sababi foydalanuvchiga boradi)" onChange={(e) => setNote(e.target.value)} />}
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn bad" disabled={busy || (needNote && note.trim().length < 3)} onClick={() => run(false)}>Rad etish</button>
        <button className="btn ok" disabled={busy} onClick={() => run(true)}>Tasdiqlash</button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function Verifications({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<PendingStudent[] | null>(null);
  const load = useCallback(() => api.admin.verifications().then(setRows, () => setRows([])), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div>
      <p className="hint">Universitetida tasdiqlangan karyera markazi xodimi bo'lsa, tasdiqlashni o'sha xodim qiladi. Yo'q bo'lsa, siz qilasiz: talaba ID va fakultetni talabaning HEMIS ma'lumoti bilan solishtiring.</p>
      {rows?.length === 0 && <div className="center hint">Navbat bo'sh 🎉</div>}
      {rows?.map((s) => (
        <div key={s.id} className="card">
          <b>{s.full_name}</b>{s.username && <span className="hint"> · @{s.username}</span>}
          <div className="hint">{s.university}</div>
          <div className="hint">{[s.faculty, s.course && `${s.course}-kurs`, s.group_name, `ID: ${s.student_number}`].filter(Boolean).join(" · ")}</div>
          <Decision needNote={false} onDecide={async (approve, note) => { await api.admin.decideVerification(s.id, approve, note); void load(); onChanged(); }} />
        </div>
      ))}
    </div>
  );
}

function Companies({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Company[] | null>(null);
  const load = useCallback(() => api.admin.companies(status).then(setRows, () => setRows([])), [status]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div>
      <div className="segmented">
        {[["pending", "Kutilmoqda"], ["approved", "Tasdiqlangan"], ["rejected", "Rad etilgan"]].map(([s, l]) => (
          <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{l}</button>
        ))}
      </div>
      <p className="hint">Tekshirish: STIR bo'yicha davlat reyestri (module.stat.uz/egrpo) va soliq holati (my.soliq.uz). MLM va «talabadan pul oladigan» kompaniyalarni rad eting.</p>
      {rows?.length === 0 && <div className="center hint">Bo'sh</div>}
      {rows?.map((c) => (
        <div key={c.id} className="card">
          <b>{c.name}</b>
          <div className="hint">{[c.industry, c.city, c.stir && `STIR: ${c.stir}`].filter(Boolean).join(" · ")}</div>
          {c.description && <p style={{ whiteSpace: "pre-line" }}>{c.description}</p>}
          <div className="row wrap">
            {c.website && <button className="btn small ghost" onClick={() => openLink(c.website)}>Sayt ↗</button>}
            <button className="btn small ghost" onClick={() => openLink("https://module.stat.uz/egrpo/")}>Reyestr ↗</button>
          </div>
          {c.status === "pending" && <Decision onDecide={async (a, n) => { await api.admin.reviewCompany(c.id, a, n); void load(); onChanged(); }} needNote={false} />}
          {c.review_note && <div className="hint">Izoh: {c.review_note}</div>}
        </div>
      ))}
    </div>
  );
}

function Jobs({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Job[] | null>(null);
  const load = useCallback(() => api.admin.pendingJobs().then(setRows, () => setRows([])), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div>
      <p className="hint">Faqat talabalarga mos e'lonlar: amaliyot, yarim stavka, junior, loyiha. Talabadan pul so'raydigan, MLM yoki tafsiloti noaniq e'lonlarni qaytaring.</p>
      {rows?.length === 0 && <div className="center hint">Navbat bo'sh 🎉</div>}
      {rows?.map((j) => (
        <div key={j.id} className="card">
          <span className="hint">{j.company_name}</span>
          <div><b>{j.title}</b></div>
          <div className="hint">{JOB_KIND[j.kind]} · {salary(j)} · {j.city}</div>
          <p style={{ whiteSpace: "pre-line" }}>{j.description}</p>
          {j.requirements && <p className="hint" style={{ whiteSpace: "pre-line" }}>{j.requirements}</p>}
          <Decision needNote={false} onDecide={async (a, n) => { await api.admin.reviewJob(j.id, a, n); void load(); onChanged(); }} />
        </div>
      ))}
    </div>
  );
}

function Staff({ ctx, onChanged }: { ctx: AdminCtx; onChanged: () => void }) {
  const [rows, setRows] = useState<StaffRequest[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.staff().then(setRows, () => setRows([])), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div>
      <p className="hint">Universitet xodimi talabalarni tasdiqlay oladi, shuning uchun so'rovni faqat ilova egasi tasdiqlaydi. Tasdiqlashdan oldin universitetga qo'ng'iroq qilib, odam haqiqatan u yerda ishlashini aniqlang.</p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="center hint">Navbat bo'sh</div>}
      {rows?.map((s) => (
        <div key={s.id} className="card">
          <b>{s.full_name}</b>{s.username && <span className="hint"> · @{s.username}</span>}
          <div className="hint">{s.university} · {s.position}</div>
          {ctx.isOwner ? (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn bad" onClick={async () => { try { await api.admin.reviewStaff(s.id, false); void load(); onChanged(); } catch (e) { setError(message(e)); } }}>Rad etish</button>
              <button className="btn ok" onClick={async () => { try { await api.admin.reviewStaff(s.id, true); void load(); onChanged(); } catch (e) { setError(message(e)); } }}>Tasdiqlash</button>
            </div>
          ) : <div className="hint">Ilova egasi tasdiqlaydi</div>}
        </div>
      ))}
    </div>
  );
}
