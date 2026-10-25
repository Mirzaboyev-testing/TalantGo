import { useCallback, useEffect, useState } from "react";
import { api, type Applicant, type CandidateRow } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { statusBadge, statusLabel } from "../../pipeline";
import { useSearch } from "../../router";
import { ErrorText, Sheet, message } from "../../ui";
import { ApplicantCard } from "./ApplicantCard";
import { StudentSheet } from "./Students";

const STAGES = ["new", "viewed", "shortlisted", "interview", "offer", "hired", "rejected", "withdrawn"];
const PAGE = 25;

/** Every application to the company's jobs in one table: filter, open, move to the next stage. */
export default function Candidates() {
  useLang();
  const search = useSearch();
  const [jobId, setJobId] = useState(search.job ?? "");
  const [status, setStatus] = useState(search.status ?? "");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: CandidateRow[]; total: number; jobs: { id: number; title: string }[] } | null>(null);
  const [open, setOpen] = useState<CandidateRow | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback((from: number) => {
    const p: Record<string, string> = { limit: String(PAGE), offset: String(from) };
    if (jobId) p.job_id = jobId;
    if (status) p.status = status;
    if (q.trim()) p.q = q.trim();
    setError("");
    api.employer.candidates(p).then((r) => { setData(r); setOffset(from); }, (e) => setError(message(e)));
  }, [jobId, status, q]);
  useEffect(() => { load(0); }, [jobId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  function updated(a: Applicant) {
    setData((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === a.id ? { ...x, ...a } : x)) });
    setOpen((cur) => (cur && cur.id === a.id ? { ...cur, ...a } : cur));
  }

  return (
    <div>
      <h1>{t("cand.title")}</h1>
      <div className="filters">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">{t("cand.all_jobs")}</option>
          {data?.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("cand.all_status")}</option>
          {STAGES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <form className="pub-search" onSubmit={(e) => { e.preventDefault(); load(0); }}>
          <input value={q} maxLength={80} placeholder={t("cand.search")} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" type="submit"><Icon name="search" size={18} /></button>
        </form>
      </div>
      <ErrorText error={error} />
      {!data && !error && <div className="hint">{t("common.loading")}</div>}
      {data && <div className="hint" style={{ margin: "10px 0 6px" }}>{t("cand.total", { n: data.total })}</div>}
      {data?.items.length === 0 && <div className="card hint">{t("cand.empty")}</div>}
      {data && data.items.length > 0 && (
        <div className="card table-card">
          <table className="cand-table">
            <thead>
              <tr>
                <th>{t("cand.col.name")}</th><th>{t("cand.col.job")}</th><th>{t("cand.col.stage")}</th>
                <th title={t("cand.match_help")}>{t("cand.col.match")} ?</th><th>{t("cand.col.points")}</th>
                <th>{t("cand.col.university")}</th><th>{t("cand.col.date")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)}>
                  <td data-label={t("cand.col.name")}><b>{r.identity.full_name}</b></td>
                  <td data-label={t("cand.col.job")}>{r.job_title}</td>
                  <td data-label={t("cand.col.stage")}><span className={`badge ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td>
                  <td data-label={t("cand.col.match")}><span className="match">{r.match}%</span></td>
                  <td data-label={t("cand.col.points")}>{r.card.points}</td>
                  <td data-label={t("cand.col.university")}>{r.card.university ?? "–"}</td>
                  <td data-label={t("cand.col.date")}>{formatDateTime(r.created_at, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ margin: "8px 0 0" }}>{t("cand.match_help")}</p>
        </div>
      )}
      {data && data.total > PAGE && (
        <div className="row between" style={{ marginTop: 10 }}>
          <button className="btn small ghost" disabled={offset === 0} onClick={() => load(Math.max(0, offset - PAGE))}>{t("cand.prev")}</button>
          <span className="hint">{t("cand.page", { from: offset + 1, to: Math.min(offset + PAGE, data.total), total: data.total })}</span>
          <button className="btn small ghost" disabled={offset + PAGE >= data.total} onClick={() => load(offset + PAGE)}>{t("cand.next")}</button>
        </div>
      )}
      {open && (
        <Sheet onClose={() => setOpen(null)}>
          <ApplicantCard applicant={open} jobTitle={open.job_title} onUpdated={updated} onProfile={setProfile} />
          <button className="btn ghost" onClick={() => setOpen(null)}>{t("common.close")}</button>
        </Sheet>
      )}
      {profile && <StudentSheet id={profile} catalog={null} onClose={() => setProfile(null)} />}
    </div>
  );
}
