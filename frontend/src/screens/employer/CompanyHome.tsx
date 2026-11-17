import { useEffect, useState } from "react";
import { api, type EmployerCounters, type EmployerDashboard, type Me, type OutcomeRequest } from "../../api";
import { kindLabel } from "../../format";
import { formatDateTime, t, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { jobStatusLabel, type JobStatus } from "../../labels";
import { statusBadge, statusLabel } from "../../pipeline";
import { navigate } from "../../router";
import { haptic } from "../../tg";
import { ErrorText, message } from "../../ui";
import { AreaChart, Delta, PageHead, StatTile, Tabs } from "./kit";

const PERIODS = ["7", "30", "90", "365"] as const;
const STAGES = ["new", "viewed", "shortlisted", "interview", "offer", "hired"] as const;
const JOB_BADGE: Record<string, string> = { pending: "pending", approved: "peer_verified", rejected: "rejected", closed: "todo" };
const STEPS: { key: keyof EmployerDashboard["first_steps"]; icon: IconName; to: string }[] = [
  { key: "profile", icon: "building", to: "/korxona/profil" },
  { key: "job", icon: "briefcase", to: "/korxona/vakansiyalar?yangi=1" },
  { key: "task", icon: "flag", to: "/korxona/vazifalar?yangi=1" },
  { key: "test", icon: "check", to: "/korxona/testlar?yangi=1" },
  { key: "partnership", icon: "school", to: "/korxona/universitetlar" },
];
const welcomedKey = (id: number) => `tg_company_welcomed_${id}`;
const go = (to: string) => (e?: React.MouseEvent) => { e?.preventDefault(); navigate(to); };

function greeting(): MsgKey {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 11 ? "co.dash.morning" : h < 18 ? "co.dash.day" : "co.dash.evening";
}
const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** The company's first screen: what to do today, the hiring numbers with their trend, and where to start. */
export default function CompanyHome({ me, counters, onNewJob }: { me: Me; counters: EmployerCounters | null; onNewJob: () => void }) {
  useLang();
  const company = me.company!;
  const [days, setDays] = useState<(typeof PERIODS)[number]>("30");
  const [d, setD] = useState<EmployerDashboard | null>(null);
  const [error, setError] = useState("");
  const [welcomed, setWelcomed] = useState(() => { try { return localStorage.getItem(welcomedKey(company.id)) === "1"; } catch { return true; } });
  useEffect(() => { setD(null); api.employer.dashboard(Number(days)).then(setD, (e) => setError(message(e))); }, [days]);

  const dismissWelcome = () => { setWelcomed(true); try { localStorage.setItem(welcomedKey(company.id), "1"); } catch { /* storage blocked */ } };
  const stepsDone = d ? STEPS.filter((s) => d.first_steps[s.key]).length : 0;
  const conversion = d && d.received ? Math.round((100 * d.hired) / d.received) : null;
  const stageMax = d ? Math.max(1, ...STAGES.map((s) => d.pipeline[s] ?? 0)) : 1;
  const activeTotal = d ? STAGES.reduce((n, s) => n + (d.pipeline[s] ?? 0), 0) : 0;
  const todo: { key: string; n: number; icon: IconName; to: string; label: string }[] = counters ? [
    { key: "new", n: counters.new_applications, icon: "inbox", to: "/korxona/nomzodlar?status=new", label: t("co.todo.new", { n: counters.new_applications }) },
    { key: "outcomes", n: counters.outcomes, icon: "verified", to: "#co-outcomes", label: t("co.todo.outcomes", { n: counters.outcomes }) },
    { key: "grade", n: counters.to_grade, icon: "check", to: "/korxona/testlar", label: t("co.todo.grade", { n: counters.to_grade }) },
    { key: "review", n: counters.to_review, icon: "flag", to: "/korxona/vazifalar", label: t("co.todo.review", { n: counters.to_review }) },
    { key: "partners", n: counters.partnerships_in, icon: "school", to: "/korxona/universitetlar?tab=requests", label: t("co.todo.partners", { n: counters.partnerships_in }) },
    { key: "rejected", n: counters.rejected_jobs, icon: "briefcase", to: "/korxona/vakansiyalar?holat=rejected", label: t("co.todo.rejected", { n: counters.rejected_jobs }) },
    { key: "contacts", n: counters.contacts_accepted, icon: "users", to: "/korxona/talabalar?tab=contacts", label: t("co.todo.contacts", { n: counters.contacts_accepted }) },
  ].filter((x) => x.n > 0) : [];

  return (
    <div className="co-page">
      <PageHead
        eyebrow={<><span className="co-verified-pill"><Icon name="verified" size={14} />{t("co.verified")}</span>{company.name}</>}
        title={t(greeting(), { name: me.full_name.split(" ")[0] })}
        sub={counters && counters.new_applications > 0 ? t("co.dash.sub_new", { n: counters.new_applications }) : t("co.dash.sub")}
        actions={<>
          <Tabs items={PERIODS.map((p) => [p, t("co.dash.period", { n: p })] as [typeof p, string])} value={days} onChange={setDays} />
          <button className="btn" onClick={onNewJob}><Icon name="plus" size={18} />{t("cdash.new_job")}</button>
        </>} />

      {!welcomed && (
        <div className="co-welcome">
          <div className="co-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
          <span className="co-welcome-icon"><Icon name="verified" size={28} /></span>
          <div className="grow">
            <b>{t("co.dash.welcome_title")}</b>
            <p>{t("co.dash.welcome_text")}</p>
          </div>
          <div className="co-welcome-actions">
            <button className="btn light" onClick={() => { dismissWelcome(); onNewJob(); }}>{t("cdash.new_job")}</button>
            <button className="btn outline-light" onClick={dismissWelcome}>{t("common.close")}</button>
          </div>
        </div>
      )}

      <ErrorText error={error} />
      {!d && !error && <DashSkeleton />}
      {d && (
        <>
          {stepsDone < STEPS.length && (
            <div className="co-card co-start">
              <div className="co-start-head">
                <Ring percent={(100 * stepsDone) / STEPS.length} label={`${stepsDone}/${STEPS.length}`} />
                <div><b>{t("co.dash.start_title")}</b><p>{t("co.dash.start_text")}</p></div>
              </div>
              <div className="co-start-steps">
                {STEPS.map((s) => {
                  const ok = d.first_steps[s.key];
                  return (
                    <a key={s.key} href={s.to} onClick={go(s.to)} className={`co-start-step ${ok ? "done" : ""}`}>
                      <span className="co-start-icon">{ok ? <Icon name="tick" size={18} /> : <Icon name={s.icon} size={18} />}</span>
                      <b>{t(`co.dash.step.${s.key}` as MsgKey)}</b>
                      <small>{t(`co.dash.step.${s.key}_hint` as MsgKey)}</small>
                      {!ok && <span className="co-start-go">{t("co.dash.start_go")} →</span>}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="co-stats">
            <StatTile icon="briefcase" label={t("cdash.live_jobs")} value={d.jobs.approved}
                      sub={d.jobs.pending ? t("co.dash.pending_n", { n: d.jobs.pending }) : t("co.dash.views_n", { n: d.views })}
                      onClick={() => navigate("/korxona/vakansiyalar")} />
            <StatTile icon="inbox" tone="blue" label={t("cdash.received")} value={d.received}
                      delta={<Delta now={d.received} before={d.previous.received} />}
                      spark={d.trend.map((p) => p.applications)} onClick={() => navigate("/korxona/nomzodlar")} />
            <StatTile icon="users" tone="violet" label={t("cdash.interviews")} value={d.pipeline.interview ?? 0}
                      sub={t("co.dash.upcoming_n", { n: d.interviews.length })} onClick={() => navigate("/korxona/nomzodlar?status=interview")} />
            <StatTile icon="verified" tone="amber" label={t("cdash.hired")} value={d.hired}
                      delta={<Delta now={d.hired} before={d.previous.hired} />}
                      sub={conversion != null ? t("co.dash.conversion", { n: conversion }) : t("cdash.days", { n: d.days })}
                      onClick={() => navigate("/korxona/nomzodlar?status=hired")} />
          </div>

          <div className="co-dash-grid">
            <div className="co-col">
              <div className="co-card">
                <div className="co-card-head">
                  <div><b>{t("co.dash.trend")}</b><div className="hint">{t(d.trend_step === 7 ? "co.dash.trend_week" : "co.dash.trend_day")}</div></div>
                  <div className="co-big-num">{d.received}<span>{t("co.dash.in_period", { n: d.days })}</span></div>
                </div>
                {d.received === 0 && d.trend.every((p) => p.applications === 0) ? (
                  <div className="co-chart-empty">
                    <AreaChart points={d.trend.map((p) => ({ label: dayLabel(p.date), value: 0 }))} label={t("co.dash.trend")} />
                    <div className="co-chart-empty-note"><Icon name="inbox" size={18} />{t("co.dash.trend_empty")}</div>
                  </div>
                ) : (
                  <AreaChart points={d.trend.map((p) => ({ label: dayLabel(p.date), value: p.applications }))} label={t("co.dash.trend")} />
                )}
              </div>

              <div className="co-card">
                <div className="co-card-head">
                  <div><b>{t("cdash.pipeline")}</b><div className="hint">{t("co.dash.pipeline_hint", { n: activeTotal })}</div></div>
                  <a href="/korxona/nomzodlar?view=board" onClick={go("/korxona/nomzodlar?view=board")}>{t("co.dash.open_board")}</a>
                </div>
                <div className="co-funnel">
                  {STAGES.map((s) => {
                    const n = d.pipeline[s] ?? 0;
                    return (
                      <button key={s} className={`co-funnel-row st-${s}`} onClick={() => navigate(`/korxona/nomzodlar?status=${s}`)}>
                        <span className="co-funnel-label">{statusLabel(s)}</span>
                        <span className="co-funnel-bar"><span style={{ width: `${Math.max(n ? 3 : 0, (100 * n) / stageMax)}%` }} /></span>
                        <span className="co-funnel-n">{n}</span>
                        <span className="co-funnel-pct">{activeTotal ? Math.round((100 * n) / activeTotal) : 0}%</span>
                      </button>
                    );
                  })}
                </div>
                <div className="co-funnel-foot">
                  <span>{statusLabel("rejected")}: <b>{d.pipeline.rejected ?? 0}</b></span>
                  <span>{statusLabel("withdrawn")}: <b>{d.pipeline.withdrawn ?? 0}</b></span>
                </div>
              </div>

              <div className="co-card">
                <div className="co-card-head">
                  <b>{t("co.dash.jobs_perf")}</b>
                  <a href="/korxona/vakansiyalar" onClick={go("/korxona/vakansiyalar")}>{t("home.see_all")}</a>
                </div>
                {d.top_jobs.length === 0 ? (
                  <div className="co-inline-empty">
                    <Icon name="briefcase" size={20} /><span>{t("co.dash.no_jobs")}</span>
                    <button className="btn small" onClick={onNewJob}><Icon name="plus" size={16} />{t("cdash.new_job")}</button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="co-table">
                      <thead><tr><th>{t("cand.col.job")}</th><th className="num">{t("co.dash.col.views")}</th><th className="num">{t("co.dash.col.apps")}</th>
                        <th className="num">{t("co.dash.col.conv")}</th><th className="num">{t("co.dash.col.hired")}</th></tr></thead>
                      <tbody>
                        {d.top_jobs.map((j) => (
                          <tr key={j.id} onClick={() => navigate(`/korxona/nomzodlar?job=${j.id}`)}>
                            <td><b>{j.title}</b><div className="hint">{kindLabel(j.kind)} · <span className={`badge ${JOB_BADGE[j.status]}`}>{jobStatusLabel(j.status as JobStatus)}</span></div></td>
                            <td className="num">{j.views}</td><td className="num">{j.applications}</td>
                            <td className="num">{j.views ? `${Math.round((100 * j.applications) / j.views)}%` : "—"}</td>
                            <td className="num">{j.hired}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="co-col">
              <div className="co-card">
                <div className="co-card-head"><b>{t("co.dash.attention")}</b>{todo.length > 0 && <span className="co-pill warn">{todo.length}</span>}</div>
                {todo.length === 0 ? (
                  <div className="co-all-good"><span><Icon name="tick" size={18} /></span>{t("co.dash.all_good")}</div>
                ) : (
                  <div className="co-todo">
                    {todo.map((x) => (
                      <a key={x.key} href={x.to} className={`co-todo-row t-${x.key}`}
                         onClick={x.to.startsWith("#") ? (e) => { e.preventDefault(); document.getElementById(x.to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" }); } : go(x.to)}>
                        <span className="co-todo-icon"><Icon name={x.icon} size={18} /></span>
                        <span className="grow">{x.label}</span>
                        <span className="co-todo-n">{x.n}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <OutcomeRequests />

              <div className="co-card">
                <div className="co-card-head"><b>{t("cdash.upcoming")}</b></div>
                {d.interviews.length === 0 && <p className="hint" style={{ margin: 0 }}>{t("cdash.no_interviews")}</p>}
                <div className="co-list">
                  {d.interviews.map((i) => (
                    <div key={i.application_id} className="co-list-row">
                      <span className="co-date-chip">{i.at ? <><b>{formatDateTime(i.at, false).slice(0, 5)}</b><small>{formatDateTime(i.at).slice(11)}</small></> : "—"}</span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b className="ellipsis" style={{ display: "block" }}>{i.student}</b>
                        <div className="hint ellipsis">{[i.job, i.place].filter(Boolean).join(" · ")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="co-card">
                <div className="co-card-head">
                  <b>{t("cdash.recent")}</b>
                  <a href="/korxona/nomzodlar" onClick={go("/korxona/nomzodlar")}>{t("home.see_all")}</a>
                </div>
                {d.recent.length === 0 && <p className="hint" style={{ margin: 0 }}>{t("cdash.no_applications")}</p>}
                <div className="co-list">
                  {d.recent.map((a) => (
                    <div key={a.application_id} className="co-list-row">
                      <span className="co-avatar">{a.student.slice(0, 1).toUpperCase()}</span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b className="ellipsis" style={{ display: "block" }}>{a.student}</b>
                        <div className="hint ellipsis">{a.job} · {formatDateTime(a.created_at, false)}</div>
                      </div>
                      <span className={`badge ${statusBadge(a.status)}`}>{statusLabel(a.status)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {d.universities.length > 0 && (
                <div className="co-card">
                  <div className="co-card-head"><b>{t("co.dash.unis")}</b></div>
                  <div className="bar-list">
                    {d.universities.map((u) => {
                      const max = Math.max(1, ...d.universities.map((x) => x.applications));
                      return (
                        <div key={u.name} className="bar-list-row">
                          <span className="ellipsis">{u.name}</span>
                          <span className="bar-list-track"><span style={{ width: `${Math.round((100 * u.applications) / max)}%` }} /></span>
                          <span className="num">{u.applications}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="co-card co-profile-meter">
                <div className="co-card-head"><b>{t("co.dash.profile")}</b><span className="co-pill">{d.profile.percent}%</span></div>
                <div className="co-progress small"><span style={{ width: `${d.profile.percent}%` }} /></div>
                {d.profile.missing.length > 0 ? (
                  <>
                    <p className="hint" style={{ margin: "10px 0 6px" }}>{t("co.dash.profile_hint")}</p>
                    <div className="chips">{d.profile.missing.slice(0, 5).map((m) => <span key={m} className="chip">{t(`co.missing.${m}` as MsgKey)}</span>)}</div>
                    <button className="btn small soft" style={{ marginTop: 10 }} onClick={() => navigate("/korxona/profil")}>{t("co.dash.profile_fill")}</button>
                  </>
                ) : <p className="hint" style={{ margin: "10px 0 0" }}>{t("co.dash.profile_done")}</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Ring({ percent, label }: { percent: number; label: string }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <span className="co-ring">
      <svg viewBox="0 0 54 54" width="54" height="54" aria-hidden="true">
        <circle cx="27" cy="27" r={r} className="co-ring-track" />
        <circle cx="27" cy="27" r={r} className="co-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      </svg>
      <b>{label}</b>
    </span>
  );
}

function DashSkeleton() {
  return (
    <div className="co-skeleton">
      <div className="co-stats">{[0, 1, 2, 3].map((i) => <div key={i} className="co-sk-block" style={{ height: 132 }} />)}</div>
      <div className="co-dash-grid"><div className="co-sk-block" style={{ height: 300 }} /><div className="co-sk-block" style={{ height: 300 }} /></div>
    </div>
  );
}

/** Students who say they work or intern here: the company's confirmation counts for their university. */
function OutcomeRequests() {
  useLang();
  const [rows, setRows] = useState<OutcomeRequest[]>([]);
  const [error, setError] = useState("");
  const load = () => api.employer.outcomeRequests().then(setRows, (e) => setError(message(e)));
  useEffect(() => { void load(); }, []);
  async function decide(id: number, confirm: boolean) {
    try { await api.employer.decideOutcome(id, confirm); haptic("success"); void load(); } catch (e) { setError(message(e)); }
  }
  if (rows.length === 0 && !error) return null;
  return (
    <div className="co-card co-card-accent" id="co-outcomes">
      <div className="co-card-head"><b>{t("cdash.outcomes")}</b><span className="co-pill warn">{rows.length}</span></div>
      <p className="hint" style={{ marginTop: 0 }}>{t("cdash.outcomes_hint")}</p>
      <ErrorText error={error} />
      <div className="co-list">
        {rows.map((o) => (
          <div key={o.id} className="co-list-row wrap">
            <span className="co-avatar">{o.student.slice(0, 1).toUpperCase()}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{o.student}</b>{o.university ? <span className="hint"> · {o.university}</span> : null}
              <div className="hint">{[o.position, t(`outcome.kind.${o.kind}`), o.started_on && formatDateTime(o.started_on, false)].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="row">
              <button className="btn small ghost" onClick={() => decide(o.id, false)}>{t("cdash.decline")}</button>
              <button className="btn small ok" onClick={() => decide(o.id, true)}>{t("cdash.confirm")}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
