import { useCallback, useEffect, useMemo, useState } from "react";
import type { JobKind, WorkMode } from "../../api";
import { kindLabel, modeLabel, salaryText } from "../../format";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { courseText } from "../../labels";
import { navigate } from "../../router";
import { ask } from "../../tg";
import { ErrorText, Sheet, message, toast } from "../../ui";
import { fieldLabel } from "../student/StudentSignup";
import { uapi, type Facets, type Opportunity } from "./uapi";
import { Empty, Kpi, PageHead, Toggle, UIcon, UniLogo } from "./ukit";

const KINDS: JobKind[] = ["internship", "part_time", "junior", "project"];
const MODES: WorkMode[] = ["office", "remote", "hybrid"];

/** Live vacancies (partners first) with how many of our students applied; recommend one to a faculty or course. */
export default function UniOpportunities() {
  useLang();
  const [rows, setRows] = useState<Opportunity[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [mode, setMode] = useState("");
  const [partnersOnly, setPartnersOnly] = useState(false);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [recommending, setRecommending] = useState<Opportunity | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => uapi.opportunities().then(setRows, (e) => setError(message(e))), []);
  async function withdraw(j: Opportunity) {
    if (!(await ask(t("u.op.withdraw_confirm")))) return;
    try { await uapi.unrecommend(j.id); toast(t("u.op.withdrawn")); void load(); } catch (e) { toast(message(e), "error"); }
  }
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((j) => (!kind || j.kind === kind) && (!mode || j.work_mode === mode)
    && (!partnersOnly || j.partner) && (!recommendedOnly || j.recommended)
    && (!q.trim() || `${j.title} ${j.company_name} ${j.skills.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, q, kind, mode, partnersOnly, recommendedOnly]);
  const n = (f: (j: Opportunity) => boolean) => rows?.filter(f).length ?? 0;
  const applicants = rows?.reduce((a, j) => a + j.our_applicants, 0) ?? 0;

  return (
    <>
      <PageHead title={t("u.nav.opportunities")} sub={t("opp.intro")} />
      <div className="u-kpis" style={{ ["--n" as string]: 4 }}>
        <Kpi icon="briefcase" label={t("u.op.k.open")} value={rows ? rows.length : "…"} sub={t("u.op.k.internships", { n: n((j) => j.kind === "internship") })} />
        <Kpi icon="building" tone="blue" label={t("u.op.k.partners")} value={n((j) => j.partner)} onClick={() => setPartnersOnly(true)} />
        <Kpi icon="inbox" tone="violet" label={t("u.op.k.applicants")} value={applicants} />
        <Kpi icon="star" tone="amber" label={t("u.op.k.recommended")} value={n((j) => j.recommended)} onClick={() => setRecommendedOnly(true)} />
      </div>
      <div className="u-filter-row" style={{ marginBottom: 12 }}>
        <div className="u-search"><span className="si"><Icon name="search" size={17} /></span>
          <input value={q} placeholder={t("u.op.search_ph")} onChange={(e) => setQ(e.target.value)} /></div>
        <select className={kind ? "on" : ""} value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("u.op.kind")}>
          <option value="">{t("u.op.all_kinds")}</option>{KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
        </select>
        <select className={mode ? "on" : ""} value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t("u.op.mode")}>
          <option value="">{t("u.op.all_modes")}</option>{MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
        </select>
        <Toggle on={partnersOnly} onChange={setPartnersOnly}>{t("u.op.partners_only")}</Toggle>
        <Toggle on={recommendedOnly} onChange={setRecommendedOnly}>{t("u.op.recommended_only")}</Toggle>
      </div>
      <ErrorText error={error} />
      {!rows ? <div className="u-skel" style={{ minHeight: 240 }} /> : shown.length === 0 ? (
        <div className="u-panel"><Empty icon="briefcase" title={rows.length ? t("u.st.none_filtered") : t("opp.empty")} text={rows.length ? undefined : t("u.op.empty_sub")} /></div>
      ) : (
        <div className="u-cards">
          {shown.map((j) => (
            <div key={j.id} className="u-card">
              <div className="u-card-top">
                <UniLogo small name={j.company_name} url={j.company_logo_url} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <a href={`/vakansiyalar/${j.id}`} onClick={(e) => { e.preventDefault(); navigate(`/vakansiyalar/${j.id}`); }}><b>{j.title}</b></a>
                  <span>{j.company_name}{j.city ? ` · ${j.city}` : ""}</span>
                </div>
              </div>
              <div className="u-chipline">
                <span className="u-tag blue">{kindLabel(j.kind)}</span><span className="u-tag">{modeLabel(j.work_mode)}</span>
                <span className="u-tag green">{salaryText(j)}</span>
                {j.partner && <span className="u-tag violet"><Icon name="building" size={12} />{t("opp.partner")}</span>}
                {j.counts_as_practice && <span className="u-tag amber">{t("u.op.practice")}</span>}
                {(j.job_fields ?? []).slice(0, 2).map((f) => <span key={f} className="u-tag">{fieldLabel(f, null)}</span>)}
              </div>
              <div className="row between" style={{ fontSize: 13 }}>
                <span className="hint">{j.deadline ? t("u.op.deadline", { date: formatDateTime(j.deadline, false) }) : t("u.op.no_deadline")}</span>
                <span className={j.our_applicants ? "match" : "hint"}>{t("opp.our_applicants", { n: j.our_applicants })}</span>
              </div>
              <div className="u-card-foot">
                <span />
                {j.recommended ? (
                  <span className="row" style={{ gap: 6 }}>
                    <span className="u-tag amber"><UIcon name="star" size={12} />{t("opp.recommended")}</span>
                    <button className="btn small ghost" onClick={() => withdraw(j)}>{t("u.op.withdraw")}</button>
                  </span>
                ) : <button className="btn small" onClick={() => setRecommending(j)}><UIcon name="megaphone" size={15} />{t("opp.recommend")}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {recommending && <Recommend job={recommending} onClose={() => setRecommending(null)} onDone={() => { setRecommending(null); void load(); }} />}
    </>
  );
}

function Recommend({ job, onClose, onDone }: { job: Opportunity; onClose: () => void; onDone: () => void }) {
  useLang();
  const [note, setNote] = useState("");
  const [faculty, setFaculty] = useState("");
  const [course, setCourse] = useState("");
  const [facets, setFacets] = useState<Facets | null>(null);
  const [reach, setReach] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { uapi.facets().then(setFacets, () => {}); }, []);
  useEffect(() => {
    setReach(null);
    uapi.previewAudience({ faculty: faculty || undefined, course: course ? Number(course) : undefined, verified_only: true })
      .then((r) => setReach(r.recipients), () => {});
  }, [faculty, course]);
  async function send() {
    setBusy(true);
    try {
      const r = await uapi.recommend(job.id, note.trim(), faculty, course ? Number(course) : undefined);
      toast(t("opp.sent", { n: r.students }));
      onDone();
    } catch (e) { setError(message(e)); setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <span className="hint">{job.company_name}</span>
      <h1>{job.title}</h1>
      <label>{t("u.op.to_whom")}</label>
      <div className="u-audience" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <select value={faculty} onChange={(e) => setFaculty(e.target.value)}><option value="">{t("emp.all_faculties")}</option>
          {facets?.faculties.map((f) => <option key={f.value} value={f.value}>{f.value}</option>)}</select>
        <select value={course} onChange={(e) => setCourse(e.target.value)}><option value="">{t("u.st.all_courses")}</option>
          {facets?.courses.map((c) => <option key={c.value} value={c.value}>{courseText(c.value)}</option>)}</select>
      </div>
      <div className="u-reach"><UIcon name="users" size={18} /><span>{t("u.op.reach")}</span><b>{reach ?? "…"}</b></div>
      <label>{t("opp.note")}</label>
      <textarea value={note} maxLength={500} placeholder={t("u.op.note_ph")} onChange={(e) => setNote(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={busy || reach === 0} onClick={send}><UIcon name="megaphone" size={16} />{t("opp.recommend")}</button>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>{t("common.cancel")}</button>
    </Sheet>
  );
}
