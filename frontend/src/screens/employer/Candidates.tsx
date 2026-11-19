import { useCallback, useEffect, useState } from "react";
import { api, type Applicant, type CandidateRow } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { statusBadge, statusLabel } from "../../pipeline";
import { navigate, useSearch } from "../../router";
import { ErrorText, Sheet, message } from "../../ui";
import { ApplicantCard } from "./ApplicantCard";
import { StudentSheet } from "./Students";
import { EmptyState, initials, nameTone, PageHead, Tabs } from "./kit";

const STAGES = ["new", "viewed", "shortlisted", "interview", "offer", "hired", "rejected", "withdrawn"];
const BOARD = ["new", "viewed", "shortlisted", "interview", "offer", "hired"];
const PAGE = 25;
type View = "board" | "table";
type Data = { items: CandidateRow[]; total: number; jobs: { id: number; title: string }[]; stages: Record<string, number> };

/** Every application to the company's jobs: a board by stage or a table; open one to move it on. */
export default function Candidates({ onChanged }: { onChanged?: () => void }) {
  useLang();
  const search = useSearch();
  const [view, setView] = useState<View>(search.view === "table" || search.status ? "table" : "board");
  const [jobId, setJobId] = useState(search.job ?? "");
  const [status, setStatus] = useState(search.status ?? "");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<CandidateRow | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((from: number) => {
    const board = view === "board";
    const p: Record<string, string> = { limit: String(board ? 200 : PAGE), offset: String(board ? 0 : from) };
    if (jobId) p.job_id = jobId;
    if (status && !board) p.status = status;
    if (q.trim()) p.q = q.trim();
    setError("");
    api.employer.candidates(p).then((r) => { setData(r); setOffset(from); }, (e) => setError(message(e)));
  }, [jobId, status, q, view]);
  useEffect(() => { load(0); }, [jobId, status, view]); // eslint-disable-line react-hooks/exhaustive-deps

  function updated(a: Applicant) {
    setData((cur) => {
      if (!cur) return cur;
      const before = cur.items.find((x) => x.id === a.id)?.status;
      const stages = { ...cur.stages };
      if (before && before !== a.status) { stages[before] = Math.max(0, (stages[before] ?? 1) - 1); stages[a.status] = (stages[a.status] ?? 0) + 1; }
      return { ...cur, stages, items: cur.items.map((x) => (x.id === a.id ? { ...x, ...a } : x)) };
    });
    setOpen((cur) => (cur && cur.id === a.id ? { ...cur, ...a } : cur));
    onChanged?.();
  }
  const switchView = (v: View) => { setView(v); navigate(v === "table" ? "/korxona/nomzodlar?view=table" : "/korxona/nomzodlar", { replace: true }); };
  const total = data ? Object.values(data.stages).reduce((n, v) => n + v, 0) : 0;

  return (
    <div className="co-page">
      <PageHead title={t("cand.title")} sub={data ? t("co.cand.sub", { n: total }) : undefined}
                actions={<Tabs items={[["board", t("co.cand.board")], ["table", t("co.cand.table")]]} value={view} onChange={switchView} />} />
      <div className="co-toolbar">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">{t("cand.all_jobs")}</option>
          {data?.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <form className="co-search" onSubmit={(e) => { e.preventDefault(); load(0); }}>
          <Icon name="search" size={18} />
          <input value={q} maxLength={80} placeholder={t("cand.search")} onChange={(e) => setQ(e.target.value)} />
          <button className="btn small" type="submit">{t("p.common.search")}</button>
        </form>
        {view === "board" && (
          <label className="radio-line co-toggle"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />{t("co.cand.show_closed")}</label>
        )}
      </div>
      {view === "table" && data && (
        <Tabs items={[["", t("cand.all_status"), total] as [string, string, number],
                      ...STAGES.map((s) => [s, statusLabel(s), data.stages[s] ?? 0] as [string, string, number])]}
              value={status} onChange={setStatus} />
      )}
      <ErrorText error={error} />
      {!data && !error && <div className="co-board">{BOARD.map((s) => <div key={s} className="co-sk-block" style={{ height: 260 }} />)}</div>}
      {data && total === 0 && !q && !jobId && (
        <EmptyState icon="inbox" title={t("co.cand.empty_title")} text={t("co.cand.empty_text")}
                    action={<button className="btn" style={{ width: "auto" }} onClick={() => navigate("/korxona/vakansiyalar?yangi=1")}><Icon name="plus" size={18} />{t("cdash.new_job")}</button>} />
      )}

      {data && total > 0 && view === "board" && (
        <div className="co-board">
          {[...BOARD, ...(showClosed ? ["rejected", "withdrawn"] : [])].map((s) => {
            const cards = data.items.filter((r) => r.status === s);
            return (
              <div key={s} className={`co-col-stage st-${s}`}>
                <div className="co-stage-head"><span className="co-stage-dot" />{statusLabel(s)}<span className="co-stage-n">{data.stages[s] ?? 0}</span></div>
                <div className="co-stage-body">
                  {cards.length === 0 && <div className="co-stage-empty">{t("co.cand.col_empty")}</div>}
                  {cards.map((r) => (
                    <button key={r.id} className="co-cand" onClick={() => setOpen(r)}>
                      <div className="row">
                        {r.identity.photo_url ? <img className="co-avatar" src={r.identity.photo_url} alt="" /> : <span className="co-avatar" style={nameTone(r.identity.full_name)}>{initials(r.identity.full_name)}</span>}
                        <div className="grow" style={{ minWidth: 0 }}>
                          <b className="ellipsis" style={{ display: "block" }}>{r.identity.full_name}</b>
                          <div className="hint ellipsis">{r.job_title}</div>
                        </div>
                      </div>
                      <div className="co-match" title={t("cand.match_help")}>
                        <span className="co-match-bar"><span style={{ width: `${r.match}%` }} /></span><b>{r.match}%</b>
                      </div>
                      <div className="co-cand-foot">
                        <span>{r.card.university ?? "—"}</span>
                        <span>{t("p.common.points_n", { n: r.card.points })}</span>
                        <span>{formatDateTime(r.created_at, false).slice(0, 5)}</span>
                      </div>
                    </button>
                  ))}
                  {(data.stages[s] ?? 0) > cards.length && <div className="co-stage-empty">{t("co.cand.more", { n: (data.stages[s] ?? 0) - cards.length })}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && view === "table" && (data.items.length === 0 ? (total > 0 || q || jobId) && <div className="co-card hint">{t("cand.empty")}</div> : (
        <div className="co-card table-card">
          <table className="cand-table co-cand-table">
            <thead>
              <tr>
                <th>{t("cand.col.name")}</th><th>{t("cand.col.job")}</th><th>{t("cand.col.stage")}</th>
                <th title={t("cand.match_help")}>{t("cand.col.match")}</th><th>{t("cand.col.points")}</th>
                <th>{t("cand.col.university")}</th><th>{t("cand.col.date")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)}>
                  <td data-label={t("cand.col.name")}>
                    <span className="row" style={{ gap: 10 }}><span className="co-avatar small" style={nameTone(r.identity.full_name)}>{initials(r.identity.full_name)}</span><b>{r.identity.full_name}</b></span>
                  </td>
                  <td data-label={t("cand.col.job")}>{r.job_title}</td>
                  <td data-label={t("cand.col.stage")}><span className={`badge ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td>
                  <td data-label={t("cand.col.match")}>
                    <span className="co-match inline"><span className="co-match-bar"><span style={{ width: `${r.match}%` }} /></span><b>{r.match}%</b></span>
                  </td>
                  <td data-label={t("cand.col.points")}>{r.card.points}</td>
                  <td data-label={t("cand.col.university")}>{r.card.university ?? "–"}</td>
                  <td data-label={t("cand.col.date")}>{formatDateTime(r.created_at, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ margin: 0, padding: "10px 14px" }}>{t("cand.match_help")}</p>
        </div>
      ))}
      {data && view === "table" && data.total > PAGE && (
        <div className="row between" style={{ marginTop: 12 }}>
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
