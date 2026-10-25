import { useState } from "react";
import { api, type Applicant, type TalentCard } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { actionLabel, EMPLOYER_MOVES, statusBadge, statusLabel } from "../../pipeline";
import { ask, haptic, openLink } from "../../tg";
import { ErrorText, Sheet, message } from "../../ui";
import { downloadCv } from "./Students";

/** Study details and verified results of a student, as companies see them on cards. */
export function CardBody({ card }: { card: TalentCard }) {
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

/** One application with the moves the company may make from its current stage. */
export function ApplicantCard({ applicant: a, onUpdated, onProfile, jobTitle }: {
  applicant: Applicant; onUpdated: (a: Applicant) => void; onProfile: (studentId: number) => void; jobTitle?: string;
}) {
  useLang();
  const [interview, setInterview] = useState(false);
  const [error, setError] = useState("");

  async function save(changes: { status: string; interview_at?: string; interview_place?: string }) {
    setError("");
    try {
      onUpdated(await api.employer.updateApplication(a.id, changes));
      haptic("success");
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    }
  }

  async function act(status: string) {
    if (status === "interview") return setInterview(true);
    if (status === "hired" && !(await ask(t("app.confirm.hired")))) return;
    if (status === "rejected" && !(await ask(t("app.confirm.rejected")))) return;
    await save({ status });
  }

  const moves = EMPLOYER_MOVES[a.status] ?? [];
  return (
    <div className="card">
      <div className="row between">
        <b>{a.identity.full_name}</b>
        <span className={`badge ${statusBadge(a.status)}`}>{statusLabel(a.status)}</span>
      </div>
      {jobTitle && <div className="hint">{jobTitle}</div>}
      <CardBody card={a.card} />
      {a.note && <p style={{ whiteSpace: "pre-line" }}>«{a.note}»</p>}
      {a.status === "interview" && (a.interview_at || a.interview_place) && (
        <div className="notice" style={{ marginTop: 8 }}>
          {t("app.interview.at", { when: [formatDateTime(a.interview_at), a.interview_place].filter(Boolean).join(", ") })}
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 8 }}>
        {a.identity.username && <button className="btn small" onClick={() => openLink(`https://t.me/${a.identity.username}`)}>Telegram'da yozish</button>}
        {a.identity.phone && <span className="hint">Tel: {a.identity.phone}</span>}
        <button className="btn small ghost" onClick={() => onProfile(a.card.id)}>Profil</button>
        <button className="btn small ghost" onClick={() => downloadCv(a.card.id)}>CV (PDF)</button>
      </div>
      {moves.length > 0 && (
        <div className="row wrap" style={{ marginTop: 8 }}>
          {moves.map((to) => (
            <button key={to} className={`btn small ${to === "hired" ? "ok" : "ghost"}`} onClick={() => act(to)}>{actionLabel(a.status, to)}</button>
          ))}
        </div>
      )}
      <ErrorText error={error} />
      {interview && (
        <InterviewSheet applicant={a} onClose={() => setInterview(false)}
                        onSend={async (at, place) => { if (await save({ status: "interview", interview_at: at, interview_place: place })) setInterview(false); }} />
      )}
    </div>
  );
}

/** Tashkent wall-clock time as the value of a datetime-local input ("2026-11-02T10:30"). */
function localValue(iso: string | null): string {
  if (!iso) return "";
  const shifted = new Date(new Date(iso).getTime() + 5 * 3600_000);      // Asia/Tashkent is UTC+5 all year
  return shifted.toISOString().slice(0, 16);
}

function InterviewSheet({ applicant, onClose, onSend }: {
  applicant: Applicant; onClose: () => void; onSend: (at: string, place: string) => Promise<void>;
}) {
  const [at, setAt] = useState(localValue(applicant.interview_at));
  const [place, setPlace] = useState(applicant.interview_place);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    if (!at) return setError(t("app.interview.need_time"));
    setBusy(true);
    await onSend(`${at}:00+05:00`, place.trim());
    setBusy(false);
  }
  return (
    <Sheet onClose={onClose}>
      <h1>{t("app.interview.title")}</h1>
      <p className="hint">{applicant.identity.full_name}</p>
      <label>{t("app.interview.when")}</label>
      <input type="datetime-local" value={at} onChange={(e) => { setAt(e.target.value); setError(""); }} />
      <label>{t("app.interview.place")}</label>
      <input value={place} maxLength={300} placeholder={t("app.interview.place_hint")} onChange={(e) => setPlace(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={send}>{t("app.interview.send")}</button>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
    </Sheet>
  );
}
