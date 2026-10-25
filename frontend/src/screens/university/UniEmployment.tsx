import { useCallback, useEffect, useState } from "react";
import { api, type UniversityOutcome, type UniversityStats } from "../../api";
import { BarList, StackedShare } from "../../charts";
import { formatDateTime, t, useLang } from "../../i18n";
import { ask, haptic } from "../../tg";
import { ErrorText, message } from "../../ui";

const WHERE = ["full_time", "part_time", "dual_education", "internship", "seeking", "unknown"] as const;

/** Placement of the university's verified students (jobs and internships), with the records behind it. */
export default function UniEmployment() {
  useLang();
  const [cohort, setCohort] = useState("");
  const [faculty, setFaculty] = useState("");
  const [s, setS] = useState<UniversityStats | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const p: Record<string, string> = {};
    if (cohort) p.cohort = cohort;
    if (faculty) p.faculty = faculty;
    api.university.stats(p).then(setS, (e) => setError(message(e)));
  }, [cohort, faculty]);
  useEffect(() => { load(); }, [load]);

  const label = (k: (typeof WHERE)[number]) => (k === "seeking" || k === "unknown" ? t(`outcome.where.${k}`) : t(`outcome.kind.${k}`));
  const rate = (v: number | null) => (v == null ? <span className="hint" style={{ fontSize: 14 }}>{t("emp.not_enough", { n: s?.min_sample ?? 10 })}</span> : `${v}%`);

  return (
    <div>
      <h1>{t("emp.title")}</h1>
      <div className="filters two">
        <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
          <option value="">{t("emp.all_cohorts")}</option>
          {s?.cohorts.map((y) => <option key={y} value={y}>{t("emp.cohort_n", { year: y })}</option>)}
        </select>
        <select value={faculty} onChange={(e) => setFaculty(e.target.value)}>
          <option value="">{t("emp.all_faculties")}</option>
          {s?.faculties.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <ErrorText error={error} />
      {!s && !error && <div className="hint">{t("common.loading")}</div>}
      {s && (
        <>
          <div className="card">
            <div className="hint">{t("emp.rate")}</div>
            <div className="big-rate">{rate(s.placement_rate)}</div>
            <div className="hint">{t("emp.rate_hint", { placed: s.placed, students: s.students })}</div>
          </div>
          <div className="stats four">
            <div className="stat"><b>{s.students}</b><span>{t("emp.students")}</span></div>
            <div className="stat"><b>{s.employed}</b><span>{t("emp.working")}</span></div>
            <div className="stat"><b>{s.interned}</b><span>{t("emp.interned")}</span></div>
            <div className="stat"><b>{s.hires_on_platform}</b><span>{t("emp.hires")}</span></div>
          </div>
          <div className="grid-2">
            <div className="card">
              <b>{t("emp.where")}</b>
              <StackedShare parts={WHERE.map((k) => ({ key: k, label: label(k), value: s.where[k] }))} neutralKey="unknown" />
              {s.self_reported > 0 && <p className="hint" style={{ marginBottom: 0 }}>{t("emp.self_reported", { n: s.self_reported })}</p>}
            </div>
            <div className="card">
              <b>{t("emp.top_employers")}</b>
              {s.top_employers.length === 0 ? <p className="hint" style={{ marginBottom: 0 }}>{t("emp.no_employers")}</p>
                : <BarList rows={s.top_employers} />}
              <p className="hint" style={{ marginBottom: 0 }}>{t("emp.partners")}: {s.partners}</p>
            </div>
          </div>
          <details className="card">
            <summary><b>{t("emp.definitions")}</b></summary>
            <p className="hint">{t("emp.def_text", { n: s.min_sample })}</p>
            <p className="hint" style={{ marginBottom: 0 }}>{t("emp.coverage", { n: s.with_graduation_year, total: s.students })}</p>
          </details>
        </>
      )}
      <Outcomes onChanged={load} />
    </div>
  );
}

function Outcomes({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<UniversityOutcome[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.university.outcomes().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function decide(o: UniversityOutcome, confirm: boolean) {
    if (!confirm && !(await ask(t("emp.remove") + "?"))) return;
    try {
      await api.university.decideOutcome(o.id, confirm);
      haptic("success");
      void load(); onChanged();
    } catch (e) { setError(message(e)); }
  }

  return (
    <>
      <h2 className="pub-h2">{t("emp.outcomes")}</h2>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="card hint">{t("emp.no_outcomes")}</div>}
      {rows?.map((o) => (
        <div key={o.id} className="card">
          <div className="row between">
            <b>{o.student}</b>
            <span className={`badge ${o.confirmed ? "peer_verified" : "pending"}`}>
              {o.confirmed ? t(`emp.confirmed_by.${o.confirmed_by === "university" ? "university" : "company"}`) : t("emp.pending")}
            </span>
          </div>
          <div>{o.company}{o.position ? ` · ${o.position}` : ""} · {t(`outcome.kind.${o.kind}`)}</div>
          <div className="hint">
            {[o.faculty, o.graduation_year && t("emp.graduation", { year: o.graduation_year }),
              o.started_on && formatDateTime(o.started_on, false), o.source === "self" ? t("emp.source_self") : ""].filter(Boolean).join(" · ")}
          </div>
          {!o.confirmed && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small ghost" onClick={() => decide(o, false)}>{t("emp.remove")}</button>
              <button className="btn small ok" onClick={() => decide(o, true)}>{t("emp.confirm")}</button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
