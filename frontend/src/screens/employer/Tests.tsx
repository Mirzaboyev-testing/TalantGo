import { useCallback, useEffect, useState } from "react";
import { api, QUESTION_KIND, type AttemptDetail, type CompanyTestFull,
         type CompanyTestSummary, type Job, type QuestionInput, type QuestionKind, type TestInput, type TestResultRow,
         type Track } from "../../api";
import { Field, Req, useRequired, type Check } from "../../form";
import { formatDateTime, t, useLang } from "../../i18n";
import { attemptStatusLabel, courseText, questionKindLabel, testStatus } from "../../labels";
import { Icon } from "../../icons";
import { ask, haptic } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { downloadCv, StudentSheet } from "./Students";

const audience = () => ({ all: t("task.audience.all"), tracks: t("p.tests.audience_tracks"), applicants: t("p.tests.audience_applicants") });
const when = (s: string | null) => (s ? formatDateTime(s) : "—");

type View = { kind: "list" } | { kind: "edit"; test?: CompanyTestFull } | { kind: "results"; id: number } | { kind: "attempt"; id: number; back: View };

export default function Tests({ openAttempt }: { openAttempt?: number | null }) {
  const [view, setView] = useState<View>(openAttempt ? { kind: "attempt", id: openAttempt, back: { kind: "list" } } : { kind: "list" });
  if (view.kind === "edit") return <TestBuilder test={view.test} onDone={() => setView({ kind: "list" })} />;
  if (view.kind === "results") return <Results id={view.id} onBack={() => setView({ kind: "list" })} onOpen={(a) => setView({ kind: "attempt", id: a, back: view })} />;
  if (view.kind === "attempt") return <Grading id={view.id} onBack={() => setView(view.back)} />;
  return <TestList onNew={() => setView({ kind: "edit" })} onEdit={(t) => setView({ kind: "edit", test: t })}
                   onResults={(id) => setView({ kind: "results", id })} />;
}

// --------------------------------------------------------------------------- list

function TestList({ onNew, onEdit, onResults }: { onNew: () => void; onEdit: (t: CompanyTestFull) => void; onResults: (id: number) => void }) {
  useLang();
  const [tests, setTests] = useState<CompanyTestSummary[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.tests().then(setTests, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function act(action: () => Promise<unknown>) {
    try { await action(); void load(); } catch (e) { setError(message(e)); }
  }

  return (
    <div>
      <h1>{t("nav.company.tests")}</h1>
      <button className="btn" onClick={onNew}><Icon name="plus" size={18} />{t("p.tests.create")}</button>
      <p className="hint">{t("p.tests.hint")}</p>
      <ErrorText error={error} />
      {!tests && !error && <div className="hint">{t("common.loading")}</div>}
      {tests?.length === 0 && <div className="center hint">{t("p.tests.empty")}</div>}
      {tests?.map((x) => (
        <div key={x.id} className="card">
          <div className="row between">
            <span className="hint">{x.is_survey ? t("p.tests.survey") : t("p.tests.test_points", { n: x.max_score })} · {t("p.tests.questions_n", { n: x.questions_count })}</span>
            <span className={`badge ${testStatus(x.status)[1]}`}>{testStatus(x.status)[0]}</span>
          </div>
          <b>{x.title}</b>
          <div className="hint">
            {audience()[x.audience]}{x.job_title ? ` · ${x.job_title}` : ""}{x.deadline ? ` · ${t("p.tests.deadline", { date: x.deadline })}` : ""}
            {x.time_limit_min ? ` · ${t("p.tests.minutes", { n: x.time_limit_min })}` : ""}
          </div>
          <div className="hint">{t("p.tests.attempts", { n: x.attempts })}{x.to_grade ? ` · ${t("p.tests.to_grade", { n: x.to_grade })}` : ""}</div>
          {x.status === "rejected" && x.review_note && <div className="error">{t("p.tests.admin_note", { note: x.review_note })}</div>}
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => onResults(x.id)}>{t("p.tests.results_n", { n: x.attempts })}{x.to_grade ? ` · ${t("p.tests.grade_n", { n: x.to_grade })}` : ""}</button>
            {x.attempts === 0 && x.status !== "closed" && (
              <button className="btn small ghost" onClick={() => act(async () => onEdit(await api.employer.test(x.id)))}>{t("p.common.edit")}</button>
            )}
            {x.status !== "closed" && x.status !== "draft" && (
              <button className="btn small ghost" onClick={async () => {
                if (await ask(t("p.tests.close_confirm"))) void act(() => api.employer.closeTest(x.id));
              }}>{t("common.close")}</button>
            )}
            {x.attempts === 0 && (
              <button className="btn small ghost" onClick={async () => {
                if (await ask(t("p.tests.delete_confirm"))) void act(() => api.employer.deleteTest(x.id));
              }}>{t("p.tests.delete")}</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- builder

const blankQuestion = (kind: QuestionKind = "single"): QuestionInput =>
  ({ kind, text: "", options: kind === "text" ? [] : ["", ""], correct: [], points: kind === "text" ? 10 : 5 });

function TestBuilder({ test, onDone }: { test?: CompanyTestFull; onDone: () => void }) {
  useLang();
  const aud = audience();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [f, setF] = useState({
    title: test?.title ?? "", description: test?.description ?? "", audience: test?.audience ?? "all",
    job_id: test?.job_id ? String(test.job_id) : "", deadline: test?.deadline ?? "",
    time_limit: test?.time_limit_min ? String(test.time_limit_min) : "",
  });
  const [trackIds, setTrackIds] = useState<number[]>(test?.track_ids ?? []);
  const [questions, setQuestions] = useState<QuestionInput[]>(
    test?.questions.map((q) => ({ kind: q.kind, text: q.text, options: [...q.options], correct: q.correct ?? [], points: q.points }))
    ?? [blankQuestion()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls, groupCls } = useRequired();

  useEffect(() => {
    api.tracks().then(setTracks, () => {});
    api.employer.jobs().then((js) => setJobs(js.filter((j) => j.status !== "closed")), () => {});
  }, []);

  const setQ = (i: number, change: Partial<QuestionInput>) => {
    setQuestions((cur) => cur.map((q, k) => (k === i ? { ...q, ...change } : q)));
    clear(`q-${i}`);
  };
  const total = questions.reduce((sum, q) => sum + ((q.kind === "text" || q.correct.length > 0) ? q.points : 0), 0);

  async function save(submit: boolean) {
    const checks: Check[] = [
      ["t-title", f.title.trim().length >= 3, t("p.tests.req.title")],
      ["t-tracks", f.audience !== "tracks" || trackIds.length > 0, t("p.tests.req.tracks")],
      ["t-job", f.audience !== "applicants" || Boolean(f.job_id), t("p.tests.req.job")],
    ];
    questions.forEach((q, i) => {
      const filled = q.text.trim().length >= 3 && (q.kind === "text" || q.options.filter((o) => o.trim()).length >= 2);
      const answered = q.kind === "text" || q.points === 0 || q.correct.length > 0;
      checks.push([`q-${i}`, filled && answered, filled ? t("p.tests.req.q_answer", { n: i + 1 }) : t("p.tests.req.q_text", { n: i + 1 })]);
    });
    if (!check(checks)) return;
    const body: TestInput = {
      title: f.title.trim(), description: f.description.trim(), audience: f.audience as TestInput["audience"],
      track_ids: f.audience === "tracks" ? trackIds : [], job_id: f.job_id ? Number(f.job_id) : null,
      deadline: f.deadline || null, time_limit_min: f.time_limit ? Number(f.time_limit) : null, submit,
      questions: questions.map((q) => {
        // drop empty options and renumber the right answers to match
        const kept = q.options.map((o, i) => [o.trim(), i] as const).filter(([o]) => o);
        return { kind: q.kind, text: q.text.trim(), points: q.points, options: kept.map(([o]) => o),
                 correct: kept.map(([, i], k) => (q.correct.includes(i) ? k : -1)).filter((k) => k >= 0) };
      }),
    };
    setBusy(true); setError("");
    try {
      if (test) await api.employer.editTest(test.id, body);
      else await api.employer.createTest(body);
      haptic("success");
      toast(submit ? t("p.tests.submitted") : t("p.tests.draft_saved"));
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />{t("nav.company.tests")}</button>
      <h1>{test ? t("p.tests.edit_title") : t("p.tests.new_title")}</h1>
      <p className="form-note"><Req />{t("p.common.required_note")}</p>
      <div className="card">
        <Field id="t-title" label={t("p.common.title")} required error={errors["t-title"] && t("p.tests.f.title_err")}>
          <input id="t-title" className={cls("t-title")} value={f.title} maxLength={160} placeholder={t("p.tests.f.title_ph")}
                 onChange={(e) => { setF({ ...f, title: e.target.value }); clear("t-title"); }} />
        </Field>
        <Field id="t-desc" label={t("p.tests.f.desc")}>
          <textarea id="t-desc" value={f.description} maxLength={3000} placeholder={t("p.tests.f.desc_ph")}
                    onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <label>{t("p.tests.f.audience")}<Req /></label>
        {(Object.keys(aud) as (keyof typeof aud)[]).map((a) => (
          <label key={a} className="radio-line">
            <input type="radio" name="audience" checked={f.audience === a} onChange={() => setF({ ...f, audience: a })} />{aud[a]}
          </label>
        ))}
        {f.audience === "tracks" && (
          <>
            <div id="t-tracks" tabIndex={-1} className={groupCls("t-tracks", "chips")}>
              {tracks.map((tr) => (
                <button key={tr.id} type="button" className={`chip ${trackIds.includes(tr.id) ? "on" : ""}`}
                        onClick={() => { setTrackIds(trackIds.includes(tr.id) ? trackIds.filter((x) => x !== tr.id) : [...trackIds, tr.id]); clear("t-tracks"); }}>
                  {tr.title.split(":")[0]}
                </button>
              ))}
            </div>
            {errors["t-tracks"] && <div className="field-error">{t("p.tests.f.tracks_err")}</div>}
          </>
        )}
        <Field id="t-job" label={f.audience === "applicants" ? t("p.tests.f.job") : t("p.tests.f.job_optional")} required={f.audience === "applicants"}
               error={errors["t-job"] && t("p.tests.f.job_err")}>
          <select id="t-job" className={cls("t-job")} value={f.job_id} onChange={(e) => { setF({ ...f, job_id: e.target.value }); clear("t-job"); }}>
            <option value="">{f.audience === "applicants" ? t("task.f.choose") : t("p.tests.f.not_linked")}</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </Field>
        <div className="row">
          <div className="grow"><Field id="t-deadline" label={t("p.tests.f.deadline")}>
            <input id="t-deadline" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          </Field></div>
          <div className="grow"><Field id="t-time" label={t("p.tests.f.time")}>
            <input id="t-time" value={f.time_limit} inputMode="numeric" maxLength={3} placeholder="30"
                   onChange={(e) => setF({ ...f, time_limit: e.target.value.replace(/\D/g, "") })} />
          </Field></div>
        </div>
      </div>

      <div className="row between"><h2>{t("p.tests.questions_title", { n: questions.length })}</h2><span className="hint">{t("p.tests.total", { n: total })}</span></div>
      {questions.map((q, i) => (
        <div key={i} id={`q-${i}`} tabIndex={-1} className={groupCls(`q-${i}`, "q-card")}>
          <div className="row between">
            <b>{t("p.tests.q_n", { n: i + 1 })}<Req /></b>
            <div className="row">
              <select value={q.kind} style={{ width: "auto" }} onChange={(e) => {
                const kind = e.target.value as QuestionKind;
                setQ(i, kind === "text" ? { kind, options: [], correct: [] }
                  : { kind, options: q.options.length >= 2 ? q.options : ["", ""], correct: kind === "single" ? q.correct.slice(0, 1) : q.correct });
              }}>
                {(Object.keys(QUESTION_KIND) as QuestionKind[]).map((k) => <option key={k} value={k}>{questionKindLabel(k)}</option>)}
              </select>
              {questions.length > 1 && (
                <button className="icon-btn" title={t("p.tests.delete_question")} aria-label={t("p.tests.delete_question")}
                        onClick={() => setQuestions(questions.filter((_, k) => k !== i))}><Icon name="trash" size={18} /></button>
              )}
            </div>
          </div>
          <textarea value={q.text} maxLength={2000} placeholder={t("p.tests.question_text")} style={{ marginTop: 8 }} onChange={(e) => setQ(i, { text: e.target.value })} />
          {q.kind !== "text" && (
            <>
              <div className="hint" style={{ marginTop: 6 }}>
                {q.kind === "single" ? t("p.tests.mark_single") : t("p.tests.mark_multi")}. {t("p.tests.zero_points")}
              </div>
              {q.options.map((o, k) => (
                <div key={k} className="q-option">
                  <input className="mark" type={q.kind === "single" ? "radio" : "checkbox"} name={`q${i}`} checked={q.correct.includes(k)}
                         title={t("p.tests.correct")} onChange={() => setQ(i, {
                           correct: q.kind === "single" ? [k] : q.correct.includes(k) ? q.correct.filter((x) => x !== k) : [...q.correct, k] })} />
                  <input value={o} maxLength={300} placeholder={t("p.tests.option_n", { n: k + 1 })}
                         onChange={(e) => setQ(i, { options: q.options.map((x, n) => (n === k ? e.target.value : x)) })} />
                  {q.options.length > 2 && (
                    <button className="icon-btn" aria-label={t("p.tests.delete_option")} onClick={() => setQ(i, {
                      options: q.options.filter((_, n) => n !== k),
                      correct: q.correct.filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)) })}><Icon name="close" size={16} /></button>
                  )}
                </div>
              ))}
              {q.options.length < 12 && <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setQ(i, { options: [...q.options, ""] })}>{t("p.tests.add_option")}</button>}
            </>
          )}
          {q.kind === "text" && <div className="hint" style={{ marginTop: 6 }}>{t("p.tests.text_hint")}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ margin: 0 }}>{t("p.tests.points")}</label>
            <input value={String(q.points)} inputMode="numeric" style={{ width: 80 }}
                   onChange={(e) => setQ(i, { points: Math.min(100, Number(e.target.value.replace(/\D/g, "") || 0)) })} />
          </div>
          {errors[`q-${i}`] && <div className="field-error">{q.text.trim().length < 3 || (q.kind !== "text" && q.options.filter((o) => o.trim()).length < 2)
            ? t("p.tests.q_err_text") : t("p.tests.q_err_answer")}</div>}
        </div>
      ))}
      <div className="row wrap">
        <button className="btn small ghost" onClick={() => setQuestions([...questions, blankQuestion("single")])}>{t("p.tests.add_single")}</button>
        <button className="btn small ghost" onClick={() => setQuestions([...questions, blankQuestion("multi")])}>{t("p.tests.add_multi")}</button>
        <button className="btn small ghost" onClick={() => setQuestions([...questions, blankQuestion("text")])}>{t("p.tests.add_text")}</button>
      </div>
      <ErrorText error={error} />
      <div className="save-bar stack">
        <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? t("p.common.saving") : t("p.common.save_submit")}</button>
        <button className="btn ghost" disabled={busy} onClick={() => save(false)}>{t("p.tests.save_draft")}</button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- results and grading

function Results({ id, onBack, onOpen }: { id: number; onBack: () => void; onOpen: (attemptId: number) => void }) {
  useLang();
  const [data, setData] = useState<{ test: CompanyTestSummary; rows: TestResultRow[] } | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.employer.testResults(id).then(setData, (e) => setError(message(e))); }, [id]);

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />{t("nav.company.tests")}</button>
      <h1>{data?.test.title ?? t("p.tests.results")}</h1>
      <ErrorText error={error} />
      {data && (
        <p className="hint">{t("p.tests.attempts", { n: data.rows.length })}{data.test.max_score ? ` · ${t("p.tests.max_score", { n: data.test.max_score })}` : ` · ${t("p.tests.survey_lc")}`}
          {data.test.to_grade ? ` · ${t("p.tests.written_to_grade", { n: data.test.to_grade })}` : ""}</p>
      )}
      {data?.rows.length === 0 && <div className="center hint">{t("p.tests.no_attempts")}</div>}
      {data?.rows.map((r) => (
        <div key={r.attempt_id} className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className={`rank ${r.place <= 3 && data.test.max_score ? "top" : ""}`}>{r.place}</span>
            <div className="grow">
              <div className="row between">
                <b>{r.student.full_name}</b>
                <span className={`badge ${r.status === "graded" ? "peer_verified" : "pending"}`}>{attemptStatusLabel(r.status)}</span>
              </div>
              <div className="hint">{[r.student.university, r.student.faculty, courseText(r.student.course), r.student.group_name].filter(Boolean).join(" · ")}</div>
              <div className="hint">
                {data.test.max_score ? <><b style={{ color: "var(--text)" }}>{r.score} / {r.max_score}</b>{r.percent != null ? ` (${r.percent}%)` : ""} · </> : null}
                {when(r.submitted_at)}{r.late ? ` · ${t("p.tests.late")}` : ""}
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => onOpen(r.attempt_id)}>{r.status === "submitted" ? t("p.tests.grade") : t("p.tests.view_answers")}</button>
            <button className="btn small ghost" onClick={() => setProfile(r.student.id)}>{t("p.common.profile")}</button>
            <button className="btn small ghost" onClick={() => downloadCv(r.student.id)}>{t("p.common.cv_pdf")}</button>
          </div>
        </div>
      ))}
      {profile && <StudentSheet id={profile} catalog={null} onClose={() => setProfile(null)} />}
    </div>
  );
}

function Grading({ id, onBack }: { id: number; onBack: () => void }) {
  useLang();
  const [a, setA] = useState<AttemptDetail | null>(null);
  const [grades, setGrades] = useState<Record<number, { points: string; comment: string }>>({});
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.employer.attempt(id).then((d) => {
      setA(d);
      setFeedback(d.feedback);
      setGrades(Object.fromEntries(d.items.filter((i) => i.scored && i.question.kind === "text")
        .map((i) => [i.question.id, { points: i.points != null ? String(i.points) : "", comment: i.comment }])));
    }, (e) => setError(message(e)));
  }, [id]);

  async function save() {
    if (!a) return;
    const list = Object.entries(grades).filter(([, g]) => g.points.trim() !== "")
      .map(([qid, g]) => ({ question_id: Number(qid), points: Number(g.points.replace(",", ".")), comment: g.comment.trim() }));
    setBusy(true); setError("");
    try {
      const d = await api.employer.grade(a.id, list, feedback.trim());
      setA(d);
      haptic("success");
      toast(d.status === "graded" ? t("p.tests.graded") : t("p.tests.saved_partial"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />{t("p.tests.results")}</button>
      <ErrorText error={error} />
      {!a && !error && <div className="hint">{t("common.loading")}</div>}
      {a && (
        <>
          <h1>{a.student?.full_name}</h1>
          <div className="hint">{a.title} · {attemptStatusLabel(a.status)} · {t("p.tests.score_of", { score: a.score, max: a.max_score })}{a.late ? ` · ${t("p.tests.late_submitted")}` : ""}</div>
          {a.items.map((item, n) => {
            const q = item.question;
            return (
              <div key={q.id} className="card" style={{ marginTop: 10 }}>
                <div className="row between">
                  <b>{n + 1}. {q.text}</b>
                  <span className="hint" style={{ whiteSpace: "nowrap" }}>{item.scored ? `${item.points ?? "?"} / ${q.points}` : t("p.tests.survey_lc")}</span>
                </div>
                {q.kind !== "text" && q.options.map((o, k) => {
                  const picked = item.choice.includes(k);
                  const right = (q.correct ?? []).includes(k);
                  return (
                    <div key={k} className={`answer-opt ${picked ? "on" : ""} ${picked && item.scored ? (right ? "right" : "wrong") : ""}`}>
                      <span>{picked ? "●" : "○"}</span><span className="grow">{o}</span>
                      {right && item.scored && <span className="hint">{t("p.tests.right_answer")}</span>}
                    </div>
                  );
                })}
                {q.kind === "text" && <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{item.text || <span className="hint">{t("p.tests.no_answer")}</span>}</p>}
                {q.kind === "text" && item.scored && item.text && grades[q.id] && (
                  <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
                    <div style={{ width: 110 }}>
                      <label>{t("p.tests.points_range", { n: q.points })}</label>
                      <input value={grades[q.id].points} inputMode="decimal"
                             onChange={(e) => setGrades({ ...grades, [q.id]: { ...grades[q.id], points: e.target.value } })} />
                    </div>
                    <div className="grow">
                      <label>{t("p.tests.comment")}</label>
                      <input value={grades[q.id].comment} maxLength={1000}
                             onChange={(e) => setGrades({ ...grades, [q.id]: { ...grades[q.id], comment: e.target.value } })} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="card">
            <label style={{ marginTop: 0 }}>{t("p.tests.feedback")}</label>
            <textarea value={feedback} maxLength={2000} placeholder={t("p.tests.feedback_ph")} onChange={(e) => setFeedback(e.target.value)} />
          </div>
          <div className="save-bar">
            <button className="btn" disabled={busy} onClick={save}>{busy ? t("p.common.saving") : t("p.tests.save_grades")}</button>
          </div>
        </>
      )}
    </div>
  );
}
