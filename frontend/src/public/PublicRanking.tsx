import { useEffect, useState } from "react";
import { api, type Me, type RankingMethod, type RankingRow, type RankingSnapshot } from "../api";
import { formatDateTime, t, useLang } from "../i18n";
import { navigate } from "../router";
import { ErrorText, Sheet, message, toast } from "../ui";

/** The university ranking: the latest published one, or the live figures marked as not yet official. */
export function RankingPage() {
  useLang();
  const [data, setData] = useState<{ published: RankingSnapshot | null; live: { method: RankingMethod; rows: RankingRow[] } } | null>(null);
  const [view, setView] = useState<"published" | "live">("published");
  const [error, setError] = useState("");
  useEffect(() => { api.public.ranking().then((d) => { setData(d); if (!d.published) setView("live"); }, (e) => setError(message(e))); }, []);

  if (error) return <ErrorText error={error} />;
  if (!data) return <div className="hint">{t("common.loading")}</div>;
  const showPublished = view === "published" && data.published;
  const rows = showPublished ? data.published!.rows ?? [] : data.live.rows;
  const method = showPublished ? data.published!.config : data.live.method;

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{t("rank.title")}</h1>
      <p className="hint" style={{ marginTop: 0 }}>{t("rank.subtitle")}</p>
      {data.published && (
        <div className="segmented">
          <button className={view === "published" ? "on" : ""} onClick={() => setView("published")}>{t("rank.show_published")}</button>
          <button className={view === "live" ? "on" : ""} onClick={() => setView("live")}>{t("rank.show_live")}</button>
        </div>
      )}
      {showPublished
        ? <div className="notice" style={{ marginBottom: 10 }}>{t("rank.published", { period: data.published!.period, date: formatDateTime(data.published!.published_at, false) })}</div>
        : <div className="notice warn" style={{ marginBottom: 10 }}>{t("rank.live_note")}</div>}
      {rows.length === 0 ? <div className="card hint">{t("rank.empty")}</div> : (
        <div className="card table-card">
          <table className="cand-table">
            <thead><tr>
              <th>{t("rank.col.place")}</th><th>{t("rank.col.university")}</th><th>{t("rank.col.students")}</th>
              <th>{t("rank.col.employed")}</th><th>{t("rank.col.interned")}</th><th>{t("rank.col.score")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.university_id} onClick={() => navigate(`/universitetlar/${r.university_id}`)}>
                  <td data-label={t("rank.col.place")}><b>{r.rank ?? "–"}</b></td>
                  <td data-label={t("rank.col.university")}>{r.short_name} · {r.name}</td>
                  <td data-label={t("rank.col.students")}>{r.students}</td>
                  <td data-label={t("rank.col.employed")}>{r.employed}</td>
                  <td data-label={t("rank.col.interned")}>{r.interned}</td>
                  <td data-label={t("rank.col.score")}>{r.score == null ? <span className="hint">{t("rank.no_score")}</span> : <b className="match">{r.score}</b>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{t("rank.method", { w: method.internship_weight, n: method.min_sample })}</p>
    </div>
  );
}

const REASONS = ["fake", "wrong_info", "spam", "offensive", "unpaid", "other"] as const;

/** "Report": signed-in people flag a vacancy, a company or a task for the admins. */
export function ReportButton({ me, kind, id }: { me: Me | null; kind: "job" | "company" | "task"; id: number }) {
  useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("wrong_info");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  if (!me) return null;
  async function send() {
    try {
      await api.complain({ target_kind: kind, target_id: id, reason, text: text.trim() });
      toast(t("report.sent"));
      setOpen(false); setText("");
    } catch (e) { setError(message(e)); }
  }
  return (
    <>
      <button className="link-btn" onClick={() => setOpen(true)}>{t("report.button")}</button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <h1>{t("report.button")}</h1>
          <label>{t("report.reason")}</label>
          <select value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}>
            {REASONS.map((r) => <option key={r} value={r}>{t(`report.reason.${r}`)}</option>)}
          </select>
          <label>{t("report.text")}</label>
          <textarea value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          <ErrorText error={error} />
          <button className="btn" style={{ marginTop: 12 }} onClick={send}>{t("report.send")}</button>
          <button className="btn ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
        </Sheet>
      )}
    </>
  );
}
