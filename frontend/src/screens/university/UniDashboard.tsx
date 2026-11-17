import { useEffect, useState } from "react";
import type { Me } from "../../api";
import { BarList, StackedShare } from "../../charts";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { courseText } from "../../labels";
import { statusLabel } from "../../pipeline";
import { ErrorText, message } from "../../ui";
import { uapi, type Dashboard, type FacultyRow } from "./uapi";
import type { Go } from "./UniversityApp";
import { Empty, Kpi, Panel, Ring, Skeleton, UIcon, UniLogo, dayMonth, pct, timeOf, type UIconName } from "./ukit";

const APP_ORDER = ["new", "viewed", "shortlisted", "interview", "offer", "hired", "rejected", "withdrawn"];

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(new Date()));
  return t(h < 12 ? "u.dash.morning" : h < 18 ? "u.dash.day" : "u.dash.evening");
}

/** The first page: who we are, what needs attention, how students are doing, faculties, events. */
export default function UniDashboard({ me, go }: { me: Me; go: Go }) {
  useLang();
  const [d, setD] = useState<Dashboard | null>(null);
  const [fac, setFac] = useState<FacultyRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    uapi.dashboard().then(setD, (e) => setError(message(e)));
    uapi.faculties().then(setFac, () => setFac([]));
  }, []);

  if (error) return <ErrorText error={error} />;
  if (!d) return <><div className="u-skel" style={{ minHeight: 110, marginBottom: 14 }} /><Skeleton rows={6} /><Skeleton rows={3} height={220} /></>;

  const u = d.university_info;
  const coverage = u.students_total ? pct(d.students, u.students_total) : null;
  const todo = d.todo;
  const todoItems: { n: number; icon: UIconName; tone: string; title: string; sub: string; act: () => void }[] = [
    { n: todo.pending_verification, icon: "verified", tone: "amber", title: t("u.dash.todo.verify"), sub: t("u.dash.todo.verify_sub"), act: () => go("students", "queue") },
    { n: todo.outcomes_to_confirm, icon: "briefcase", tone: "blue", title: t("u.dash.todo.outcomes"), sub: t("u.dash.todo.outcomes_sub"), act: () => go("employment", "outcomes") },
    { n: todo.partner_requests, icon: "building", tone: "violet", title: t("u.dash.todo.partners"), sub: t("u.dash.todo.partners_sub"), act: () => go("partners", "requests") },
    { n: todo.team_requests, icon: "users", tone: "", title: t("u.dash.todo.team"), sub: t("u.dash.todo.team_sub"), act: () => go("profile", "team") },
  ].filter((x) => x.n > 0);
  const profileDone = 8 - todo.profile_missing.length;
  const steps = [
    { done: todo.profile_missing.length <= 2, label: t("u.dash.step.profile"), act: () => go("profile") },
    { done: d.verified > 0, label: t("u.dash.step.verify"), act: () => go("students", "queue") },
    { done: d.students >= 10, label: t("u.dash.step.invite"), act: () => go("profile", "invite") },
    { done: d.partners > 0, label: t("u.dash.step.partner"), act: () => go("partners", "directory") },
    { done: d.upcoming_events.length > 0, label: t("u.dash.step.event"), act: () => go("events", "new") },
  ];
  const stepsDone = steps.filter((s) => s.done).length;
  const funnel: [string, number][] = [
    [t("u.dash.f.registered"), d.students], [t("u.dash.f.verified"), d.verified], [t("u.dash.f.track"), d.with_track],
    [t("u.dash.f.cv"), d.cv_public], [t("u.dash.f.ready"), d.open_to_work], [t("u.dash.f.hired"), d.hired],
  ];
  const apps = APP_ORDER.filter((s) => d.applications[s]).map((s) => ({ key: s, label: statusLabel(s), value: d.applications[s] }));
  const courseMax = Math.max(1, ...d.by_course.map((c) => c.count));
  const interested = [...d.companies_by_applications.map((c) => ({ name: c.name, count: c.count }))];
  for (const c of d.companies_by_contacts) {
    const hit = interested.find((x) => x.name === c.name);
    if (hit) hit.count += c.count; else interested.push({ ...c });
  }
  interested.sort((a, b) => b.count - a.count);

  return (
    <>
      <section className="u-hero">
        <div className="u-hero-id">
          <UniLogo url={u.logo_url} name={u.short_name} />
          <div style={{ minWidth: 0 }}>
            <div className="hint">{greeting()}, {me.full_name.split(" ")[0]}</div>
            <h2>{u.name}</h2>
            <div className="u-hero-meta">
              <span className={`u-role ${d.role === "lead" ? "lead" : ""}`}><UIcon name={d.role === "lead" ? "key" : "user"} size={13} />{t(d.role === "lead" ? "u.role.lead" : "u.role.member")}</span>
              {u.city && <span>{u.city}</span>}
              <span>{t("u.dash.updated", { time: formatDateTime(new Date().toISOString()) })}</span>
            </div>
          </div>
        </div>
        <div className="u-hero-actions">
          {d.pending_verification > 0 && <button className="btn" onClick={() => go("students", "queue")}><Icon name="verified" size={17} />{t("u.dash.act.verify", { n: d.pending_verification })}</button>}
          <button className="btn ghost" onClick={() => go("messages")}><UIcon name="megaphone" size={17} />{t("u.dash.act.message")}</button>
          <button className="btn ghost" onClick={() => go("events", "new")}><UIcon name="calendar" size={17} />{t("u.dash.act.event")}</button>
        </div>
      </section>

      <div className="u-kpis" style={{ ["--n" as string]: 6 }}>
        <Kpi icon="school" label={t("u.dash.k.students")} value={d.students} spark={d.signups_weekly} onClick={() => go("students")}
             delta={d.new_7d > 0 ? <span className="u-delta up">+{d.new_7d}</span> : undefined}
             sub={coverage !== null ? t("u.dash.k.coverage", { p: coverage, total: u.students_total ?? 0 }) : t("u.dash.k.new_week", { n: d.new_7d })} />
        <Kpi icon="verified" tone="blue" label={t("u.dash.k.verified")} value={<>{d.verified}<small>{d.percent.verified}%</small></>}
             sub={t("u.dash.k.waiting", { n: d.pending_verification })} onClick={() => go("students", "queue")} />
        <Kpi icon="flame" tone="amber" label={t("u.dash.k.active")} value={<>{d.active_7d}<small>{d.percent.active_7d}%</small></>}
             sub={t("u.dash.k.active_sub")} onClick={() => go("students")} />
        <Kpi icon="target" tone="violet" label={t("u.dash.k.ready")} value={<>{d.open_to_work}<small>{d.percent.open_to_work}%</small></>}
             sub={t("u.dash.k.cv", { n: d.cv_public })} />
        <Kpi icon="briefcase" label={t("u.dash.k.placed")} value={d.placement_rate !== null ? `${d.placement_rate}%` : d.placed}
             sub={d.placement_rate !== null ? t("u.dash.k.placed_sub", { n: d.placed, total: d.placement_students })
               : t("u.dash.k.placed_small", { n: d.min_sample })} onClick={() => go("employment")} />
        <Kpi icon="building" tone="blue" label={t("u.dash.k.partners")} value={d.partners}
             sub={t("u.dash.k.jobs", { n: d.open_jobs })} onClick={() => go("partners")} />
      </div>

      <div className="u-grid c21">
        <Panel title={t("u.dash.attention")} icon="bell">
          {todoItems.length === 0 && todo.profile_missing.length === 0 ? (
            <div className="u-allgood"><span className="u-ic"><Icon name="tick" size={20} /></span><div><b>{t("u.dash.all_good")}</b><div className="hint">{t("u.dash.all_good_sub")}</div></div></div>
          ) : (
            <div className="u-todo">
              {todoItems.map((x) => (
                <button key={x.title} className="u-todo-item" onClick={x.act}>
                  <span className={`u-ic ${x.tone}`}><UIcon name={x.icon} size={18} /></span>
                  <span className="grow"><b>{x.title}</b><span>{x.sub}</span></span>
                  <span className="u-todo-n">{x.n}</span>
                  <UIcon name="right" size={16} />
                </button>
              ))}
              {todo.profile_missing.length > 0 && (
                <button className="u-todo-item" onClick={() => go("profile")}>
                  <span className="u-ic blue"><Icon name="globe" size={18} /></span>
                  <span className="grow"><b>{t("u.dash.todo.profile")}</b>
                    <span>{t("u.dash.todo.profile_sub", { list: todo.profile_missing.map((m) => t(`u.missing.${m}` as "u.missing.logo")).join(", ") })}</span></span>
                  <Ring pct={pct(profileDone, 8)} />
                </button>
              )}
            </div>
          )}
        </Panel>
        <Panel title={t("u.dash.start")} icon="rocket" action={<span className="hint">{stepsDone}/{steps.length}</span>}>
          <div className="u-meter" style={{ marginBottom: 10 }}><span style={{ width: `${pct(stepsDone, steps.length)}%` }} /></div>
          <div className="u-check">
            {steps.map((s) => (
              <button key={s.label} className={`u-check-row ${s.done ? "done" : ""}`} onClick={s.act}>
                <span className="u-tick">{s.done && <Icon name="tick" size={13} />}</span><span className="grow">{s.label}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="u-grid c2">
        <Panel title={t("u.dash.funnel")} icon="chart" sub={t("u.dash.funnel_sub")}>
          {d.students === 0 ? <Empty small icon="school" title={t("u.dash.no_students")} text={t("u.dash.no_students_sub")}
                                     action={<button className="btn small" onClick={() => go("profile", "invite")}>{t("u.dash.invite")}</button>} /> : (
            <div className="u-funnel">
              {funnel.map(([label, n]) => (
                <div key={label} className="u-funnel-row">
                  <span>{label}</span>
                  <span className="u-funnel-track"><span style={{ width: `${pct(n, d.students)}%` }} /></span>
                  <span className="num">{n}<small>{pct(n, d.students)}%</small></span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title={t("u.dash.apps")} icon="inbox" action={<span className="hint">{t("u.dash.apps_total", { n: d.applications_total })}</span>}>
          {apps.length === 0 ? <Empty small icon="briefcase" title={t("u.dash.no_apps")} text={t("u.dash.no_apps_sub")}
                                      action={<button className="btn small soft" onClick={() => go("opportunities")}>{t("u.dash.see_jobs")}</button>} />
            : <StackedShare parts={apps} />}
        </Panel>
      </div>

      <Panel className="flush" title={t("u.dash.faculties")} icon="building"
             action={<button className="link-btn" onClick={() => go("employment", "reports")}>{t("u.dash.to_reports")}</button>}>
        {!fac ? <div className="u-skel" style={{ margin: 16 }} /> : fac.length === 0 ? <Empty small title={t("u.dash.no_faculties")} /> : (
          <div className="u-table-wrap" style={{ marginTop: 10 }}>
            <table className="u-table">
              <thead><tr>
                <th>{t("u.col.faculty")}</th><th className="num">{t("u.col.students")}</th><th>{t("u.col.verified")}</th>
                <th className="num">{t("u.col.active")}</th><th className="num">{t("u.col.ready")}</th>
                <th className="num">{t("u.col.applied")}</th><th className="num">{t("u.col.placed")}</th>
              </tr></thead>
              <tbody>
                {fac.map((r) => (
                  <tr key={r.faculty} onClick={() => go("students", `faculty:${r.faculty}`)}>
                    <td><b>{r.faculty || t("p.uni.not_set")}</b></td>
                    <td className="num">{r.students}</td>
                    <td style={{ minWidth: 140 }}><div className="row" style={{ gap: 8 }}><span className="grow u-meter" style={{ marginTop: 0 }}><span style={{ width: `${pct(r.verified, r.students)}%` }} /></span><span className="u-dim">{pct(r.verified, r.students)}%</span></div></td>
                    <td className="num">{r.active_7d}</td><td className="num">{r.open_to_work}</td>
                    <td className="num">{r.applied}</td><td className="num">{r.placed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="u-grid c3" style={{ marginTop: 14 }}>
        <Panel title={t("u.dash.courses")} icon="school">
          {d.by_course.length === 0 ? <Empty small title={t("p.uni.none_yet")} /> : (
            <>
              <div className="u-cols">
                {d.by_course.map((c) => (
                  <div key={String(c.course)} className="u-col"><b>{c.count}</b><span className="bar" style={{ height: `${Math.max(4, (100 * c.count) / courseMax)}%` }} /></div>
                ))}
              </div>
              <div className="u-col-labels">{d.by_course.map((c) => <span key={String(c.course)}>{courseText(c.course) || "—"}</span>)}</div>
            </>
          )}
        </Panel>
        <Panel title={t("p.uni.interested")} icon="building">
          {interested.length === 0 ? <Empty small icon="building" title={t("p.uni.none_yet")} text={t("u.dash.interested_empty")} />
            : <BarList rows={interested.slice(0, 7)} />}
        </Panel>
        <Panel title={t("u.dash.events")} icon="calendar" action={<button className="link-btn" onClick={() => go("events")}>{t("u.all")}</button>}>
          {d.upcoming_events.length === 0 ? (
            <Empty small icon="calendar" tone="blue" title={t("u.dash.no_events")}
                   action={<button className="btn small soft" onClick={() => go("events", "new")}>{t("u.dash.act.event")}</button>} />
          ) : (
            <div className="u-list">
              {d.upcoming_events.map((e) => {
                const [day, mon] = dayMonth(e.starts_at);
                return (
                  <div key={e.id} className="u-list-row">
                    <span className="u-date"><b>{day}</b><span>{mon}</span></span>
                    <span className="grow" style={{ minWidth: 0 }}><b>{e.title}</b><span>{timeOf(e.starts_at)}{e.location ? ` · ${e.location}` : ""}</span></span>
                    <span className="u-tag green">{t("u.ev.registered_n", { n: e.registered })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {d.recent_hires.length > 0 && (
        <Panel title={t("p.uni.recent_hires")} icon="star">
          <div className="u-list">
            {d.recent_hires.slice(0, 6).map((h, i) => (
              <div key={i} className="u-list-row">
                <span className="u-ic"><Icon name="briefcase" size={17} /></span>
                <span className="grow"><b>{h.student}</b><span>{h.company} · {h.job}</span></span>
                <span className="u-dim">{formatDateTime(h.date, false)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
