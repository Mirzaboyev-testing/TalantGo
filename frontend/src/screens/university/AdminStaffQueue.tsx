// Admin site: university staff requests (the admin site is Uzbek only, like the rest of screens/admin).
import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "../../i18n";
import { openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { uapi, type StaffRow } from "./uapi";

const POS: Record<string, string> = { career_head: "Karyera markazi rahbari", career_staff: "Karyera markazi xodimi",
  vice_rector: "Prorektor", dean_deputy: "Dekan o'rinbosari" };
const COOP: Record<string, string> = { invite_students: "Talabalarni taklif qilish", verify_students: "Talabalikni tasdiqlash",
  ambassadors: "Ambassadorlar", introduce_companies: "Korxonalarni tanishtirish", dual: "Dual ta'lim (PF-209)", venue: "Zal berish",
  job_fair: "Ish yarmarkasi", hackathon: "Hakaton", announce: "E'lon kanallari" };
const STATES: [string, string][] = [["open", "Navbat"], ["approved", "Tasdiqlangan"], ["rejected", "Rad etilgan"]];

/** Owner decides: approve, ask for more (the person edits and re-sends), or reject with a reason. */
export default function AdminStaffQueue({ canDecide, onChanged }: { canDecide: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: number; action: "needs_info" | "reject" | "revoke" } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => { setRows(null); uapi.adminStaff(status).then(setRows, (e) => { setError(message(e)); setRows([]); }); }, [status]);
  useEffect(() => { load(); }, [load]);

  async function run(p: Promise<unknown>, done: string) {
    try { await p; toast(done); setNoteFor(null); setNote(""); load(); onChanged(); } catch (e) { setError(message(e)); }
  }

  return (
    <div>
      <div className="segmented">
        {STATES.map(([s, l]) => <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{l}</button>)}
      </div>
      <p className="hint">Universitet xodimi talabalarni tasdiqlay oladi, shuning uchun so'rovni ilova egasi tekshiradi: hujjatni ko'ring va universitetga
        qo'ng'iroq qilib, odam haqiqatan u yerda ishlashini aniqlang. Universitetda rahbar bo'lsa, hamkasblarni u ham tasdiqlay oladi.</p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="center hint">Bo'sh</div>}
      {rows?.map((s) => (
        <div key={s.id} className="card">
          <div className="row between wrap">
            <div><b>{s.full_name}</b>{s.username && <span className="hint"> · @{s.username}</span>}</div>
            <span className={`badge ${s.status === "approved" ? "peer_verified" : s.status === "rejected" ? "rejected" : "pending"}`}>
              {s.status === "needs_info" ? "Ma'lumot so'ralgan" : s.status === "pending" ? "Kutmoqda" : s.status === "approved" ? (s.role === "lead" ? "Tasdiqlangan · rahbar" : "Tasdiqlangan") : "Rad etilgan"}
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <b>{s.university}</b>{s.new_university && <span className="badge pending" style={{ marginLeft: 6 }}>Yangi universitet{s.university_region ? ` · ${s.university_region}` : ""}</span>}
          </div>
          <div className="hint">{[POS[s.position] ?? s.position, s.department].filter(Boolean).join(" · ")}</div>
          <div className="hint">{[s.phone && `Tel: ${s.phone}`, s.work_email && `Ish emaili: ${s.work_email}`, s.email && `Hisob: ${s.email}`].filter(Boolean).join(" · ")}</div>
          {s.cooperation.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{s.cooperation.map((c) => <span key={c} className="chip">{COOP[c] ?? c}</span>)}</div>}
          {(s.website || s.telegram || s.social) && <div className="hint" style={{ marginTop: 4 }}>{[s.website, s.telegram, s.social].filter(Boolean).join(" · ")}</div>}
          <div className="row wrap" style={{ marginTop: 8 }}>
            {s.doc ? <button className="btn small ghost" onClick={() => openLink(s.doc!.url)}>Lavozim hujjati: {s.doc.name}</button>
              : <span className="hint">Hujjat yuklanmagan (eski so'rov)</span>}
            {s.mou && <button className="btn small ghost" onClick={() => openLink(s.mou!.url)}>Memorandum</button>}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            {s.submitted_at && `Yuborilgan: ${formatDateTime(s.submitted_at)}`}
            {s.leads.length > 0 && ` · Universitet rahbari: ${s.leads.join(", ")}`}
            {s.reviewed_at && ` · Qaror: ${formatDateTime(s.reviewed_at)} (${s.reviewed_by})`}
          </div>
          {s.review_note && <div className="hint">Izoh: {s.review_note}</div>}
          {!canDecide ? <div className="hint">Qaror uchun "Universitetlarni tasdiqlash" ruxsati kerak (ilova egasi beradi)</div> : noteFor?.id === s.id ? (
            <div style={{ marginTop: 8 }}>
              <input value={note} placeholder={noteFor.action === "needs_info" ? "Nima yetishmayapti? (xodimga boradi)" : "Sababi (xodimga boradi)"} onChange={(e) => setNote(e.target.value)} />
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn ghost" onClick={() => setNoteFor(null)}>Bekor qilish</button>
                <button className="btn bad" disabled={note.trim().length < 3} onClick={() => run(
                  noteFor.action === "revoke" ? uapi.adminRevoke(s.id, note.trim()) : uapi.adminDecide(s.id, noteFor.action, note.trim()),
                  noteFor.action === "needs_info" ? "Savol yuborildi" : "Bajarildi")}>Yuborish</button>
              </div>
            </div>
          ) : (s.status === "pending" || s.status === "needs_info") ? (
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn small ghost" onClick={() => setNoteFor({ id: s.id, action: "needs_info" })}>Ma'lumot so'rash</button>
              <button className="btn small bad" onClick={() => setNoteFor({ id: s.id, action: "reject" })}>Rad etish</button>
              <button className="btn small ok" onClick={() => run(uapi.adminDecide(s.id, "approve"), `${s.full_name}: panel ochildi`)}>Tasdiqlash</button>
            </div>
          ) : s.status === "approved" ? (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small bad" onClick={() => setNoteFor({ id: s.id, action: "revoke" })}>Kirishni olib tashlash</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
