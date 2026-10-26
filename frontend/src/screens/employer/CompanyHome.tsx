import { useEffect, useState } from "react";
import { api, type EmployerDashboard, type OutcomeRequest } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { statusBadge, statusLabel } from "../../pipeline";
import { navigate } from "../../router";
import { haptic } from "../../tg";
import { ErrorText, message } from "../../ui";

const PERIODS = [7, 30, 90, 365];
const FUNNEL: [string, "cdash.in_review" | "app.status.shortlisted" | "cdash.interviews" | "cdash.offers" | "cdash.hired"][] = [
  ["viewed", "cdash.in_review"], ["shortlisted", "app.status.shortlisted"], ["interview", "cdash.interviews"],
  ["offer", "cdash.offers"], ["hired", "cdash.hired"],
];

/** The company's first screen: live jobs, the hiring pipeline and what needs attention today. */
export default function CompanyHome({ onNewJob }: { onNewJob: () => void }) {
  useLang();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<EmployerDashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setD(null); api.employer.dashboard(days).then(setD, (e) => setError(message(e))); }, [days]);

  if (error) return <ErrorText error={error} />;
  const max = d ? Math.max(1, ...FUNNEL.map(([s]) => d.pipeline[s] ?? 0), d.pipeline.new ?? 0) : 1;

  return (
    <div>
      <div className="row between wrap">
        <h1 style={{ margin: 0 }}>{t("nav.company.home")}</h1>
        <div className="row" style={{ gap: 8 }}>
          <select className="period-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIODS.map((n) => <option key={n} value={n}>{t("cdash.period", { n })}</option>)}
          </select>
          <button className="btn small" onClick={onNewJob}><Icon name="plus" size={16} />{t("cdash.new_job")}</button>
        </div>
      </div>
      {!d && <div className="hint" style={{ marginTop: 12 }}>{t("common.loading")}</div>}
      {d && (
        <>
          <div className="kpi-row">
            <Kpi label={t("cdash.live_jobs")} value={d.jobs.approved} icon="briefcase" onClick={() => navigate("/korxona/vakansiyalar")} />
            <Kpi label={t("cdash.received")} value={d.received} icon="inbox" sub={t("cdash.days", { n: d.days })} onClick={() => navigate("/korxona/nomzodlar")} />
            <Kpi label={t("cdash.interviews")} value={d.pipeline.interview} icon="users" onClick={() => navigate("/korxona/nomzodlar?status=interview")} />
            <Kpi label={t("cdash.hired")} value={d.hired} icon="verified" sub={t("cdash.days", { n: d.days })} onClick={() => navigate("/korxona/nomzodlar?status=hired")} />
          </div>

          {d.jobs.pending > 0 && <div className="notice" style={{ marginBottom: 8 }}>{t("cdash.pending_jobs", { n: d.jobs.pending })}</div>}
          {d.jobs.rejected > 0 && (
            <div className="notice warn" style={{ marginBottom: 8 }}>
              <a href="/korxona/vakansiyalar" onClick={(e) => { e.preventDefault(); navigate("/korxona/vakansiyalar"); }}>
                {t("cdash.rejected_jobs", { n: d.jobs.rejected })}
              </a>
            </div>
          )}

          <div className="card">
            <b>{t("cdash.pipeline")}</b>
            <div className="funnel">
              <FunnelRow label={statusLabel("new")} n={d.pipeline.new ?? 0} max={max} status="new" />
              {FUNNEL.map(([s, key]) => <FunnelRow key={s} label={t(key)} n={d.pipeline[s] ?? 0} max={max} status={s} />)}
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>{t("cdash.how")}</p>
          </div>

          <OutcomeRequests />

          <div className="grid-2">
            <div className="card">
              <b>{t("cdash.upcoming")}</b>
              {d.interviews.length === 0 && <p className="hint" style={{ marginBottom: 0 }}>{t("cdash.no_interviews")}</p>}
              {d.interviews.map((i) => (
                <div key={i.application_id} className="list-row">
                  <div><b>{i.student}</b> · <span className="hint">{i.job}</span></div>
                  <div className="hint">{[formatDateTime(i.at), i.place].filter(Boolean).join(", ")}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="row between">
                <b>{t("cdash.recent")}</b>
                <a href="/korxona/nomzodlar" onClick={(e) => { e.preventDefault(); navigate("/korxona/nomzodlar"); }}>{t("home.see_all")}</a>
              </div>
              {d.recent.length === 0 && <p className="hint" style={{ marginBottom: 0 }}>{t("cdash.no_applications")}</p>}
              {d.recent.map((a) => (
                <div key={a.application_id} className="row between list-row">
                  <div style={{ minWidth: 0 }}><div className="ellipsis"><b>{a.student}</b></div><div className="hint ellipsis">{a.job}</div></div>
                  <span className={`badge ${statusBadge(a.status)}`}>{statusLabel(a.status)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Students who say they work or intern here: the company's confirmation counts for their university. */
function OutcomeRequests() {
  const [rows, setRows] = useState<OutcomeRequest[]>([]);
  const [error, setError] = useState("");
  const load = () => api.employer.outcomeRequests().then(setRows, (e) => setError(message(e)));
  useEffect(() => { void load(); }, []);
  async function decide(id: number, confirm: boolean) {
    try { await api.employer.decideOutcome(id, confirm); haptic("success"); void load(); } catch (e) { setError(message(e)); }
  }
  if (rows.length === 0 && !error) return null;
  return (
    <div className="card">
      <b>{t("cdash.outcomes")}</b>
      <p className="hint" style={{ marginTop: 4 }}>{t("cdash.outcomes_hint")}</p>
      <ErrorText error={error} />
      {rows.map((o) => (
        <div key={o.id} className="list-row">
          <div><b>{o.student}</b>{o.university ? ` · ${o.university}` : ""}</div>
          <div className="hint">{[o.position, t(`outcome.kind.${o.kind}`), o.started_on && formatDateTime(o.started_on, false)].filter(Boolean).join(" · ")}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small ghost" onClick={() => decide(o.id, false)}>{t("cdash.decline")}</button>
            <button className="btn small ok" onClick={() => decide(o.id, true)}>{t("cdash.confirm")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, icon, sub, onClick }: { label: string; value: number; icon: string; sub?: string; onClick?: () => void }) {
  return (
    <button className="kpi-card" onClick={onClick}>
      <span className="kpi-icon"><Icon name={icon} size={20} /></span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {sub && <span className="hint" style={{ fontSize: 12 }}>{sub}</span>}
    </button>
  );
}

function FunnelRow({ label, n, max, status }: { label: string; n: number; max: number; status: string }) {
  return (
    <button className="funnel-row" onClick={() => navigate(`/korxona/nomzodlar?status=${status}`)}>
      <span className="funnel-label">{label}</span>
      <span className="funnel-bar"><span style={{ width: `${Math.round((100 * n) / max)}%` }} /></span>
      <span className="funnel-n">{n}</span>
    </button>
  );
}
