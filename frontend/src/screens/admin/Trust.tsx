import { useCallback, useEffect, useState } from "react";
import { api, type AdminComplaint, type AdminOutcome, type PartnershipRow, type RankingMethod, type RankingRow, type RankingSnapshot } from "../../api";
import { ErrorText, message, toast } from "../../ui";

const when = (s: string) => new Date(s).toLocaleString("uz", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const REASON: Record<string, string> = {
  fake: "Soxta", wrong_info: "Noto'g'ri ma'lumot", spam: "Spam", offensive: "Haqoratli", unpaid: "To'lov / maosh muammosi", other: "Boshqa",
};
const TARGET: Record<string, string> = { job: "Vakansiya", company: "Kompaniya", task: "Vazifa", user: "Foydalanuvchi" };
const KIND: Record<string, string> = { full_time: "To'liq stavka", part_time: "Yarim stavka", internship: "Amaliyot", dual_education: "Dual ta'lim" };

/** Reports from users about vacancies, companies, tasks and people. */
export function Complaints({ canDecide }: { canDecide: boolean }) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<AdminComplaint[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const load = useCallback(() => { setRows(null); api.admin.complaints(status).then(setRows, (e) => setError(message(e))); }, [status]);
  useEffect(() => { load(); }, [load]);

  async function decide(c: AdminComplaint, verdict: "resolved" | "dismissed") {
    try { await api.admin.decideComplaint(c.id, verdict, notes[c.id] ?? ""); toast("Saqlandi"); load(); } catch (e) { setError(message(e)); }
  }

  return (
    <div className="narrow">
      <div className="segmented">
        {[["open", "Ochiq"], ["resolved", "Hal qilingan"], ["dismissed", "Rad etilgan"]].map(([id, label]) => (
          <button key={id} className={status === id ? "on" : ""} onClick={() => setStatus(id)}>{label}</button>
        ))}
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">Yuklanmoqda…</div>}
      {rows?.length === 0 && <div className="card hint">Shikoyat yo'q</div>}
      {rows?.map((c) => (
        <div key={c.id} className="card">
          <div className="row between">
            <b>{TARGET[c.target_kind]}: {c.target}</b>
            <span className="badge pending">{REASON[c.reason] ?? c.reason}</span>
          </div>
          {c.text && <p style={{ whiteSpace: "pre-line" }}>{c.text}</p>}
          <div className="hint">{c.reporter ?? "—"} · {when(c.created_at)}</div>
          {c.admin_note && <div className="hint">Izoh: {c.admin_note}</div>}
          {c.status === "open" && canDecide && (
            <>
              <input style={{ marginTop: 8 }} value={notes[c.id] ?? ""} placeholder="Izoh (ixtiyoriy)" maxLength={1000}
                     onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn small ghost" onClick={() => decide(c, "dismissed")}>Rad etish</button>
                <button className="btn small" onClick={() => decide(c, "resolved")}>Hal qilindi</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** The university ranking: method settings, the live table and published snapshots. */
export function Ranking({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<{ method: RankingMethod; rows: RankingRow[]; snapshots: RankingSnapshot[] } | null>(null);
  const [weight, setWeight] = useState("1");
  const [minSample, setMinSample] = useState("10");
  const [period, setPeriod] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.ranking().then((d) => {
    setData(d); setWeight(String(d.method.internship_weight)); setMinSample(String(d.method.min_sample));
  }, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    try { await api.admin.saveRanking({ internship_weight: Number(weight), min_sample: Number(minSample) }); toast("Sozlama saqlandi"); void load(); }
    catch (e) { setError(message(e)); }
  }
  async function publish() {
    try { await api.admin.publishRanking(period.trim()); toast("Reyting e'lon qilindi"); setPeriod(""); void load(); }
    catch (e) { setError(message(e)); }
  }

  if (!data) return error ? <ErrorText error={error} /> : <div className="hint">Yuklanmoqda…</div>;
  return (
    <div className="narrow">
      <div className="card">
        <b>Hisoblash usuli</b>
        <p className="hint">
          Hozircha faqat bandlik: tasdiqlangan ish yoki amaliyoti bor tasdiqlangan talabalar ulushi. Sifat mezonlari kirmaydi.
          Ball = 100 × (ishda + amaliyot vazni × amaliyotda) / tasdiqlangan talabalar. Talabalari minimal sondan kam universitetga ball berilmaydi.
        </p>
        <div className="row">
          <div className="grow"><label>Amaliyot vazni (0–1)</label>
            <input value={weight} disabled={!canEdit} inputMode="decimal" onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, "").slice(0, 4))} />
          </div>
          <div className="grow"><label>Minimal talabalar soni</label>
            <input value={minSample} disabled={!canEdit} inputMode="numeric" onChange={(e) => setMinSample(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </div>
        </div>
        {canEdit && <button className="btn small" style={{ marginTop: 10 }} onClick={save}>Saqlash</button>}
      </div>
      <div className="card">
        <b>Joriy holat (jonli)</b>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>O'rin</th><th>Universitet</th><th>Talabalar</th><th>Ishda</th><th>Amaliyotda</th><th>Ball</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.university_id}>
                  <td>{r.rank ?? "—"}</td><td>{r.short_name} · {r.name}</td><td>{r.students}</td><td>{r.employed}</td><td>{r.interned}</td>
                  <td>{r.score == null ? <span className="hint">Ma'lumot yetarli emas</span> : r.score}</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={6} className="hint">Tasdiqlangan talabasi bor universitet yo'q</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {canEdit && (
        <div className="card">
          <b>E'lon qilish</b>
          <p className="hint">Joriy jadval davr nomi bilan saqlanadi va ochiq «Reyting» sahifasida ko'rinadi. Keyingi o'zgarishlar e'lon qilinganini o'zgartirmaydi.</p>
          <input value={period} maxLength={60} placeholder="Masalan: 2026-yil kuz semestri" onChange={(e) => setPeriod(e.target.value)} />
          <button className="btn small" style={{ marginTop: 10 }} disabled={period.trim().length < 3} onClick={publish}>E'lon qilish</button>
        </div>
      )}
      <ErrorText error={error} />
      <div className="card">
        <b>E'lon qilingan reytinglar</b>
        {data.snapshots.length === 0 && <p className="hint" style={{ marginBottom: 0 }}>Hali e'lon qilinmagan</p>}
        {data.snapshots.map((s) => (
          <div key={s.id} className="hint" style={{ marginTop: 6 }}>
            <b style={{ color: "var(--text)" }}>{s.period}</b> · {when(s.published_at)} · {s.published_by} · amaliyot vazni {s.config.internship_weight}, minimal {s.config.min_sample}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Partnerships() {
  const [rows, setRows] = useState<PartnershipRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.admin.partnerships().then(setRows, (e) => setError(message(e))); }, []);
  const STATUS: Record<string, string> = { pending: "Javob kutilmoqda", accepted: "Hamkor", rejected: "Rad etilgan" };
  return (
    <div className="card">
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">Yuklanmoqda…</div>}
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Kompaniya</th><th>Universitet</th><th>Holat</th><th>Kim boshlagan</th><th>Sana</th></tr></thead>
          <tbody>
            {rows?.map((p) => (
              <tr key={p.id}><td>{p.company}</td><td>{p.university_short} · {p.university}</td><td>{STATUS[p.status]}</td>
                <td>{p.initiated_by === "company" ? "Kompaniya" : "Universitet"}</td><td>{when(p.created_at)}</td></tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={5} className="hint">Hamkorlik yo'q</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Outcomes() {
  const [rows, setRows] = useState<AdminOutcome[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.admin.outcomes().then(setRows, (e) => setError(message(e))); }, []);
  return (
    <div className="card">
      <p className="hint" style={{ marginTop: 0 }}>Talabalarning ish va amaliyot joylari. Universitet statistikasi va reytingiga faqat tasdiqlanganlari kiradi.</p>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">Yuklanmoqda…</div>}
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Talaba</th><th>Universitet</th><th>Kompaniya</th><th>Turi</th><th>Manba</th><th>Holat</th><th>Sana</th></tr></thead>
          <tbody>
            {rows?.map((o) => (
              <tr key={o.id}><td>{o.student}</td><td>{o.university ?? "—"}</td><td>{o.company}{o.position ? ` · ${o.position}` : ""}</td>
                <td>{KIND[o.kind]}</td><td>{o.source === "application" ? "Platformada ishga olish" : "Talaba kiritgan"}</td>
                <td>{o.confirmed ? `Tasdiqlangan (${o.confirmed_by === "university" ? "universitet" : "kompaniya"})` : "Kutilmoqda"}</td>
                <td>{when(o.created_at)}</td></tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={7} className="hint">Yozuv yo'q</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
