import { useCallback, useEffect, useState } from "react";
import { api, daysLeft, type Challenge } from "../api";
import { formatDateTime, t, useLang } from "../i18n";
import { haptic, openLink } from "../tg";
import { ErrorText, Sheet, message } from "../ui";

const ENTRY_LABEL = {
  submitted: ["s.ch.entry.submitted", "pending"], accepted: ["s.ch.entry.accepted", "peer_verified"], rejected: ["s.ch.entry.rejected", "rejected"],
} as const;
const day = (iso: string) => formatDateTime(iso, false);

/** Mentors' challenges for the student's path and for everyone. */
export default function Challenges() {
  useLang();
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.challenges.list().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && (
        <div className="card soft">
          <b>{t("s.ch.empty_title")}</b>
          <p className="hint" style={{ marginBottom: 0 }}>{t("s.ch.empty_hint")}</p>
        </div>
      )}
      {rows?.map((c) => (
        <div key={c.id} className="card tap" onClick={() => setOpen(c.id)}>
          <div className="row between">
            <span className="hint">
              {c.state === "active" ? t("s.ch.days_left", { n: daysLeft(c.ends_at) })
                : c.state === "upcoming" ? t("s.ch.starts", { date: day(c.starts_at) }) : t("s.ch.finished")}
              {" · "}{t("s.ch.entries_n", { n: c.entries })}
            </span>
            {c.my_entry ? <span className={`badge ${ENTRY_LABEL[c.my_entry.status][1]}`}>{c.my_entry.place ? t("s.ch.place", { n: c.my_entry.place }) : t(ENTRY_LABEL[c.my_entry.status][0])}</span>
              : c.state === "active" ? <span className="badge peer_verified">{t("s.ch.open")}</span> : null}
          </div>
          {c.company && <span className="badge company-badge">{t("task.badge")} · {c.company}</span>}
          <b style={{ display: "block" }}>{c.title}</b>
          <div className="hint" style={{ marginTop: 4 }}>
            {t("s.common.points", { n: c.points })}{c.prize ? ` · ${t("s.ch.prize_inline", { prize: c.prize })}` : ""}
            {c.mentor ? ` · ${t("s.ch.mentor_inline", { name: c.mentor })}` : ""}
          </div>
        </div>
      ))}
      {open !== null && <ChallengeSheet id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function ChallengeSheet({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  useLang();
  const [c, setC] = useState<Challenge | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.challenges.detail(id).then((d) => {
    setC(d);
    if (d.my_entry) { setUrl(d.my_entry.proof_url); setNote(d.my_entry.note); }
  }, (e) => setError(message(e))), [id]);
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    setBusy(true); setError("");
    try {
      await api.challenges.enter(id, url.trim(), note.trim());
      haptic("success");
      await load();
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  if (!c) return <Sheet onClose={onClose}><div className="hint">{t("common.loading")}</div><ErrorText error={error} /></Sheet>;
  const canSubmit = c.state === "active" && (!c.my_entry || c.my_entry.status === "submitted");

  return (
    <Sheet onClose={onClose}>
      {c.company ? <span className="badge company-badge">{t("task.badge")} · {c.company}</span>
        : <span className="hint">{c.track?.split(":")[0] ?? t("s.ch.all_tracks")}{c.mentor ? ` · ${t("s.ch.mentor_inline", { name: c.mentor })}` : ""}</span>}
      <h1>{c.title}</h1>
      <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat"><b>{c.state === "active" ? daysLeft(c.ends_at) : 0}</b><span>{t("s.ch.days_left_label")}</span></div>
        <div className="stat"><b>{c.points}</b><span>{t("home.points")}</span></div>
        <div className="stat"><b>{c.entries}</b><span>{t("s.ch.entries_label")}</span></div>
      </div>
      {c.prize && <p className="notice">{t("s.ch.prize_notice", { prize: c.prize })}</p>}
      <div className="card">
        <b>{t("s.ch.task")}</b>
        <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{c.description}</p>
        <div className="hint" style={{ marginTop: 8 }}>{day(c.starts_at)} – {day(c.ends_at)}</div>
      </div>

      {c.my_entry && c.my_entry.status !== "submitted" && (
        <div className="card">
          <div className="row between"><b>{t("s.ch.your_result")}</b>
            <span className={`badge ${ENTRY_LABEL[c.my_entry.status][1]}`}>{c.my_entry.place ? t("s.ch.place", { n: c.my_entry.place }) : t(ENTRY_LABEL[c.my_entry.status][0])}</span></div>
          <div className="hint">
            {c.my_entry.score != null ? `${t("s.ch.score", { n: c.my_entry.score })} · ` : ""}+{t("s.common.points", { n: c.my_entry.points_awarded })}
          </div>
          {c.my_entry.comment && <div className="review yes">{c.my_entry.comment}</div>}
        </div>
      )}

      {canSubmit && (
        <div className="card">
          <b>{c.my_entry ? t("s.ch.update_title") : t("s.ch.join_title")}</b>
          <p className="hint">{c.my_entry ? t("s.ch.update_hint") : t("s.ch.join_hint")}</p>
          <label>{t("s.ch.link")}</label>
          <input value={url} placeholder="https://…" inputMode="url" onChange={(e) => setUrl(e.target.value)} />
          <label>{t("s.common.note_optional")}</label>
          <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <ErrorText error={error} />
          <button className="btn" style={{ marginTop: 10 }} disabled={busy || url.trim().length < 10} onClick={submit}>
            {busy ? t("s.common.sending") : c.my_entry ? t("s.ch.update") : t("s.common.send")}
          </button>
        </div>
      )}

      {c.results && c.results.length > 0 && (
        <div className="card">
          <b>{t("s.ch.results")}</b>
          {c.results.map((r, i) => (
            <div key={i} className="lb-row">
              <div className={`lb-rank ${r.place ? "top" : ""}`}>{r.place ?? "–"}</div>
              <div className="grow">{r.student}</div>
              {r.score != null && <span className="hint">{r.score}/100</span>}
            </div>
          ))}
        </div>
      )}
      {c.my_entry && <button className="btn ghost" style={{ marginBottom: 8 }} onClick={() => openLink(c.my_entry!.proof_url)}>{t("s.ch.open_mine")}</button>}
      <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
    </Sheet>
  );
}
