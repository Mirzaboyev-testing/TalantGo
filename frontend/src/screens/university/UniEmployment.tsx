import { useCallback, useEffect, useMemo, useState } from "react";
import { BarList, StackedShare } from "../../charts";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { ask, haptic } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { uapi, type FacultyRow, type OutcomeRow, type UniversityStats } from "./uapi";
import type { Go } from "./UniversityApp";
import { Empty, Kpi, PageHead, Panel, Ring, Tabs, UIcon, pct, type UIconName } from "./ukit";

const WHERE = ["full_time", "part_time", "dual_education", "internship", "seeking", "unknown"] as const;
type View = "stats" | "outcomes" | "reports";

/** Placement of verified students (jobs and internships), the records behind it, and the reports. */
export default function UniEmployment({ sub, go, onChanged }: { sub: string; go: Go; onChanged: () => void }) {
  useLang();
  const view: View = sub === "outcomes" || sub === "reports" ? sub : "stats";
  const [toConfirm, setToConfirm] = useState(0);
  return (
    <>
      <PageHead title={t("u.nav.employment")} sub={t("u.emp.sub")}
                actions={view === "stats" ? <button className="btn small ghost u-no-print" onClick={() => window.print()}><UIcon name="printer" size={16} />{t("u.emp.print")}</button> : undefined} />
      <div className="u-no-print">
        <Tabs value={view} onChange={(v) => go("employment", v === "stats" ? undefined : v)}
              items={[{ id: "stats", label: t("u.emp.tab_stats") }, { id: "outcomes", label: t("u.emp.tab_outcomes"), count: toConfirm || undefined },
                      { id: "reports", label: t("u.emp.tab_reports") }]} />
      </div>
      {view === "stats" && <Stats />}
      {view === "outcomes" && <Outcomes onCount={setToConfirm} onChanged={onChanged} />}
      {view === "reports" && <Reports go={go} />}
      {view !== "outcomes" && <OutcomeCounter onCount={setToConfirm} />}
    </>
  );
}

function OutcomeCounter({ onCount }: { onCount: (n: number) => void }) {
  useEffect(() => { uapi.outcomes().then((rows) => onCount(rows.filter((o) => !o.confirmed).length), () => {}); }, [onCount]);
  return null;
}

function Stats() {
  useLang();
  const [cohort, setCohort] = useState("");
  const [faculty, setFaculty] = useState("");
  const [s, setS] = useState<UniversityStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const p: Record<string, string> = {};
    if (cohort) p.cohort = cohort;
    if (faculty) p.faculty = faculty;
    uapi.stats(p).then(setS, (e) => setError(message(e)));
  }, [cohort, faculty]);

  const label = (k: (typeof WHERE)[number]) => (k === "seeking" || k === "unknown" ? t(`outcome.where.${k}`) : t(`outcome.kind.${k}`));
  if (error) return <ErrorText error={error} />;
  return (
    <>
      <div className="u-filter-row u-no-print" style={{ marginBottom: 14 }}>
        <select className={cohort ? "on" : ""} value={cohort} onChange={(e) => setCohort(e.target.value)} aria-label={t("emp.all_cohorts")}>
          <option value="">{t("emp.all_cohorts")}</option>
          {s?.cohorts.map((y) => <option key={y} value={y}>{t("emp.cohort_n", { year: y })}</option>)}
        </select>
        <select className={faculty ? "on" : ""} value={faculty} onChange={(e) => setFaculty(e.target.value)} aria-label={t("emp.all_faculties")}>
          <option value="">{t("emp.all_faculties")}</option>
          {s?.faculties.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="u-print-only"><p className="hint">{[cohort && t("emp.cohort_n", { year: cohort }), faculty].filter(Boolean).join(" · ") || t("emp.all_faculties")} · {formatDateTime(new Date().toISOString())}</p></div>
      {!s ? <div className="u-skel" style={{ minHeight: 300 }} /> : (
        <>
          <div className="u-grid c12" style={{ alignItems: "stretch" }}>
            <Panel title={t("emp.rate")} icon="target">
              <div className="row" style={{ gap: 18, alignItems: "center" }}>
                <Ring big pct={s.placement_rate ?? 0} label={s.placement_rate == null ? "—" : `${s.placement_rate}%`} />
                <div className="grow">
                  <div style={{ fontSize: 14 }}>{t("emp.rate_hint", { placed: s.placed, students: s.students })}</div>
                  {s.placement_rate == null && <div className="u-note" style={{ marginTop: 10 }}>{t("emp.not_enough", { n: s.min_sample })}</div>}
                </div>
              </div>
            </Panel>
            <div className="u-kpis" style={{ ["--n" as string]: 4, margin: 0 }}>
              <Kpi icon="school" label={t("emp.students")} value={s.students} sub={t("u.emp.with_year", { n: s.with_graduation_year })} />
              <Kpi icon="briefcase" tone="blue" label={t("emp.working")} value={s.employed} sub={s.employed_rate != null ? `${s.employed_rate}%` : undefined} />
              <Kpi icon="flag" tone="violet" label={t("emp.interned")} value={s.interned} sub={s.intern_rate != null ? `${s.intern_rate}%` : undefined} />
              <Kpi icon="star" tone="amber" label={t("emp.hires")} value={s.hires_on_platform} sub={t("u.emp.partners_n", { n: s.partners })} />
            </div>
          </div>
          <div className="u-grid c2">
            <Panel title={t("emp.where")} icon="chart">
              {s.students === 0 ? <Empty small icon="school" title={t("u.emp.no_verified")} text={t("u.emp.no_verified_sub")} /> : (
                <>
                  <StackedShare parts={WHERE.map((k) => ({ key: k, label: label(k), value: s.where[k] }))} neutralKey="unknown" />
                  {s.self_reported > 0 && <p className="hint" style={{ marginBottom: 0 }}>{t("emp.self_reported", { n: s.self_reported })}</p>}
                  {s.university_confirmed > 0 && <p className="hint" style={{ marginBottom: 0 }}>{t("emp.university_confirmed", { n: s.university_confirmed })}</p>}
                </>
              )}
            </Panel>
            <Panel title={t("emp.top_employers")} icon="building">
              {s.top_employers.length === 0 ? <Empty small icon="building" title={t("emp.no_employers")} text={t("u.emp.no_employers_sub")} />
                : <BarList rows={s.top_employers} />}
            </Panel>
          </div>
          <Panel title={t("emp.definitions")} icon="help">
            <p className="hint" style={{ marginTop: 0 }}>{t("emp.def_text", { n: s.min_sample })}</p>
            <p className="hint" style={{ marginBottom: 0 }}>{t("emp.coverage", { n: s.with_graduation_year, total: s.students })}</p>
          </Panel>
        </>
      )}
    </>
  );
}

function Outcomes({ onCount, onChanged }: { onCount: (n: number) => void; onChanged: () => void }) {
  useLang();
  const [rows, setRows] = useState<OutcomeRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => uapi.outcomes().then((r) => { setRows(r); onCount(r.filter((o) => !o.confirmed).length); }, (e) => setError(message(e))), [onCount]);
  useEffect(() => { void load(); }, [load]);

  async function decide(o: OutcomeRow, confirm: boolean) {
    if (!confirm && !(await ask(t("emp.remove") + "?"))) return;
    try {
      await uapi.decideOutcome(o.id, confirm);
      haptic("success");
      void load(); onChanged();
    } catch (e) { setError(message(e)); }
  }
  const shown = useMemo(() => (rows ?? []).filter((o) => (filter === "all" || (filter === "pending") === !o.confirmed)
    && (!q.trim() || `${o.student} ${o.company} ${o.faculty}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, filter, q]);
  const pending = rows?.filter((o) => !o.confirmed).length ?? 0;

  return (
    <>
      <p className="hint" style={{ marginTop: -4 }}>{t("emp.outcomes_hint")}</p>
      <div className="u-filter-row" style={{ marginBottom: 12 }}>
        <div className="u-search"><span className="si"><Icon name="search" size={17} /></span>
          <input value={q} placeholder={t("u.emp.search_ph")} onChange={(e) => setQ(e.target.value)} /></div>
        {(["all", "pending", "confirmed"] as const).map((k) => (
          <button key={k} className={`u-toggle ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
            {t(`u.emp.f.${k}` as "u.emp.f.all")}{k === "pending" && pending > 0 && <span className="u-tag amber" style={{ padding: "0 7px" }}>{pending}</span>}
          </button>
        ))}
        <button className="btn small ghost" onClick={() => uapi.exportOutcomes().catch((e) => toast(message(e), "error"))}><UIcon name="download" size={16} />Excel</button>
      </div>
      <ErrorText error={error} />
      {!rows ? <div className="u-skel" style={{ minHeight: 200 }} /> : shown.length === 0 ? (
        <Panel><Empty icon="briefcase" title={rows.length ? t("u.st.none_filtered") : t("emp.no_outcomes")} text={rows.length ? undefined : t("u.emp.no_outcomes_sub")} /></Panel>
      ) : (
        <Panel className="flush">
          <div className="u-table-wrap">
            <table className="u-table cards">
              <thead><tr><th>{t("u.col.student")}</th><th>{t("u.emp.col.company")}</th><th>{t("u.emp.col.kind")}</th><th>{t("u.emp.col.source")}</th><th>{t("u.col.status")}</th><th /></tr></thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id} style={{ cursor: "default" }}>
                    <td className="main"><b>{o.student}</b><div className="u-dim">{[o.faculty, o.graduation_year && t("emp.graduation", { year: o.graduation_year })].filter(Boolean).join(" · ")}</div></td>
                    <td data-label={t("u.emp.col.company")}>{o.company}{o.position && <div className="u-dim">{o.position}</div>}</td>
                    <td data-label={t("u.emp.col.kind")}>{t(`outcome.kind.${o.kind}`)}{o.started_on && <div className="u-dim">{formatDateTime(o.started_on, false)}</div>}</td>
                    <td data-label={t("u.emp.col.source")}><span className="u-dim">{o.source === "self" ? t("emp.source_self") : t("u.emp.source_app")}</span></td>
                    <td data-label={t("u.col.status")}><span className={`u-tag ${o.confirmed ? "green" : "amber"}`}>
                      {o.confirmed ? t(`emp.confirmed_by.${o.confirmed_by === "university" ? "university" : "company"}`) : t("emp.pending")}</span></td>
                    <td>{!o.confirmed && (
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn small ghost" onClick={() => decide(o, false)}>{t("emp.remove")}</button>
                        <button className="btn small" onClick={() => decide(o, true)}><Icon name="tick" size={15} />{t("emp.confirm")}</button>
                      </div>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

function Reports({ go }: { go: Go }) {
  useLang();
  const [fac, setFac] = useState<FacultyRow[] | null>(null);
  useEffect(() => { uapi.faculties().then(setFac, () => setFac([])); }, []);
  const run = (p: Promise<void>) => p.then(() => toast(t("u.rep.downloaded")), (e) => toast(message(e), "error"));
  const cards: { icon: UIconName; tone: string; title: string; text: string; btn: string; act: () => void }[] = [
    { icon: "school", tone: "", title: t("u.rep.students"), text: t("u.rep.students_sub"), btn: "Excel", act: () => run(uapi.exportStudents({})) },
    { icon: "building", tone: "blue", title: t("u.rep.faculties"), text: t("u.rep.faculties_sub"), btn: "Excel", act: () => run(uapi.exportFaculties()) },
    { icon: "briefcase", tone: "violet", title: t("u.rep.outcomes"), text: t("u.rep.outcomes_sub"), btn: "Excel", act: () => run(uapi.exportOutcomes()) },
    { icon: "printer", tone: "amber", title: t("u.rep.print"), text: t("u.rep.print_sub"), btn: t("u.rep.open"), act: () => go("employment") },
    { icon: "calendar", tone: "blue", title: t("u.rep.events"), text: t("u.rep.events_sub"), btn: t("u.rep.open"), act: () => go("events", "past") },
    { icon: "filter", tone: "", title: t("u.rep.custom"), text: t("u.rep.custom_sub"), btn: t("u.rep.open"), act: () => go("students") },
  ];
  const KEYS = ["students", "verified", "active_7d", "with_track", "cv_public", "open_to_work", "applied", "hired", "placed"] as const;
  const total = fac && Object.fromEntries(KEYS.map((k) => [k, fac.reduce((n, r) => n + r[k], 0)])) as Record<(typeof KEYS)[number], number>;
  return (
    <>
      <div className="u-cards" style={{ marginBottom: 14 }}>
        {cards.map((c) => (
          <div key={c.title} className="u-card">
            <div className="u-card-top"><span className={`u-ic big ${c.tone}`}><UIcon name={c.icon} size={22} /></span>
              <div className="grow"><b>{c.title}</b><span>{c.text}</span></div></div>
            <div className="u-card-foot"><span /><button className="btn small soft" onClick={c.act}>
              <UIcon name={c.btn === "Excel" ? "download" : "right"} size={15} />{c.btn}</button></div>
          </div>
        ))}
      </div>
      <Panel className="flush" title={t("u.rep.faculty_table")} icon="building">
        {!fac ? <div className="u-skel" style={{ margin: 16 }} /> : fac.length === 0 ? <Empty small title={t("u.dash.no_faculties")} /> : (
          <div className="u-table-wrap" style={{ marginTop: 10 }}>
            <table className="u-table">
              <thead><tr>
                <th>{t("u.col.faculty")}</th><th className="num">{t("u.col.students")}</th><th className="num">{t("u.col.verified")}</th>
                <th className="num">{t("u.col.active")}</th><th className="num">{t("u.col.track")}</th><th className="num">CV</th>
                <th className="num">{t("u.col.ready")}</th><th className="num">{t("u.col.applied")}</th><th className="num">{t("u.col.hired")}</th><th className="num">{t("u.col.placed")}</th>
              </tr></thead>
              <tbody>
                {fac.map((r) => (
                  <tr key={r.faculty} style={{ cursor: "default" }}>
                    <td><b>{r.faculty || t("p.uni.not_set")}</b></td><td className="num">{r.students}</td>
                    <td className="num">{r.verified} <span className="u-dim">({pct(r.verified, r.students)}%)</span></td>
                    <td className="num">{r.active_7d}</td><td className="num">{r.with_track}</td><td className="num">{r.cv_public}</td>
                    <td className="num">{r.open_to_work}</td><td className="num">{r.applied}</td><td className="num">{r.hired}</td><td className="num">{r.placed}</td>
                  </tr>
                ))}
                {total && fac.length > 1 && (
                  <tr style={{ cursor: "default", background: "var(--bg2)", fontWeight: 700 }}>
                    <td>{t("u.rep.total")}</td><td className="num">{total.students}</td>
                    <td className="num">{total.verified} <span className="u-dim">({pct(total.verified, total.students)}%)</span></td>
                    <td className="num">{total.active_7d}</td><td className="num">{total.with_track}</td><td className="num">{total.cv_public}</td>
                    <td className="num">{total.open_to_work}</td><td className="num">{total.applied}</td><td className="num">{total.hired}</td><td className="num">{total.placed}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
