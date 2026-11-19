import { useCallback, useEffect, useRef, useState } from "react";
import { api, daysLeft, type AttemptDetail, type StartedTest, type StudentTestCard } from "../api";
import { formatDateTime, t, useLang } from "../i18n";
import { Icon } from "../icons";
import { attemptStatusLabel } from "../labels";
import { ask, backButton, haptic } from "../tg";
import { ErrorText, message, toast } from "../ui";

type View = { kind: "list" } | { kind: "take"; test: StartedTest } | { kind: "result"; id: number };

/** Company tests and surveys a student can take, and the results of those already taken. */
export default function StudentTests() {
  const [view, setView] = useState<View>({ kind: "list" });
  useEffect(() => (view.kind === "result" ? backButton(() => setView({ kind: "list" })) : backButton(null)), [view.kind]);
  if (view.kind === "take") return <TakeTest test={view.test} onDone={(id) => setView({ kind: "result", id })} onLeave={() => setView({ kind: "list" })} />;
  if (view.kind === "result") return <Result id={view.id} onBack={() => setView({ kind: "list" })} />;
  return <TestList onStart={(test) => setView({ kind: "take", test })} onResult={(id) => setView({ kind: "result", id })} />;
}

function TestList({ onStart, onResult }: { onStart: (t: StartedTest) => void; onResult: (id: number) => void }) {
  useLang();
  const [tests, setTests] = useState<StudentTestCard[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.tests.list().then(setTests, (e) => setError(message(e))); }, []);

  async function start(test: StudentTestCard) {
    const resuming = test.my_attempt?.status === "in_progress";
    if (!resuming && !(await ask(test.time_limit_min
      ? t("s.tests.start_timed", { n: test.time_limit_min })
      : t("s.tests.start_once")))) return;
    try {
      onStart(await api.tests.start(test.id));
    } catch (e) {
      setError(message(e));
    }
  }

  const open = (tests ?? []).filter((x) => !x.my_attempt || x.my_attempt.status === "in_progress");
  const taken = (tests ?? []).filter((x) => x.my_attempt && x.my_attempt.status !== "in_progress");
  const card = (test: StudentTestCard) => {
    const a = test.my_attempt;
    const done = a && a.status !== "in_progress";
    const left = test.deadline ? daysLeft(test.deadline) : null;
    return (
      <div key={test.id} className="st-task-card st-test-card">
        <div className="row between" style={{ gap: 8 }}>
          <span className="st-task-from"><Icon name="building" size={14} />{test.company}</span>
          {done ? <span className={`st-entry ${a.status === "graded" ? "accepted" : "submitted"}`}>{attemptStatusLabel(a.status)}</span>
            : <span className="co-pill">{test.is_survey ? t("s.tests.survey") : t("s.tests.test")}</span>}
        </div>
        <b>{test.title}</b>
        {test.description && <p className="co-clamp" style={{ margin: 0 }}>{test.description}</p>}
        <div className="st-task-meta">
          <span className="co-pill"><Icon name="help" size={13} />{t("s.tests.questions_n", { n: test.questions_count })}</span>
          {test.max_score > 0 && <span className="co-pill">{t("s.common.points", { n: test.max_score })}</span>}
          {test.time_limit_min ? <span className="co-pill"><Icon name="clock" size={13} />{t("s.tests.minutes", { n: test.time_limit_min })}</span> : null}
          {test.job_title && <span className="co-pill"><Icon name="briefcase" size={13} />{test.job_title}</span>}
        </div>
        <div className="row between" style={{ marginTop: "auto", gap: 8 }}>
          <span className={`hint ${left != null && left <= 2 && !done ? "st-soon" : ""}`}>
            {test.deadline ? t("s.tests.deadline", { date: formatDateTime(test.deadline, false) }) : ""}
          </span>
          {done ? (
            <button className="btn small ghost" style={{ width: "auto" }} onClick={() => onResult(test.id)}>
              {t("s.tests.result")}{a.status === "graded" && a.max_score ? `: ${a.score} / ${a.max_score}` : ""}
            </button>
          ) : a?.status === "in_progress" || (test.open && test.status === "approved") ? (
            <button className="btn small" style={{ width: "auto" }} onClick={() => start(test)}>{a ? t("s.tests.resume") : t("s.tests.start")}</button>
          ) : (
            <span className="hint">{t("s.tests.expired")}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="st-tests">
      <p className="hint" style={{ marginTop: 0 }}>{t("s.tests.intro")}</p>
      <ErrorText error={error} />
      {!tests && !error && <div className="st-skeleton-grid"><span /><span /><span /></div>}
      {tests?.length === 0 && (
        <div className="st-empty"><Icon name="file" size={28} /><b>{t("s.tests.empty")}</b><span className="hint">{t("st.tests.empty_hint")}</span></div>
      )}
      {open.length > 0 && <div className="st-card-grid">{open.map(card)}</div>}
      {taken.length > 0 && (
        <>
          <h3 className="st-sub-title">{t("st.tests.taken")}</h3>
          <div className="st-card-grid">{taken.map(card)}</div>
        </>
      )}
    </div>
  );
}

const draftKey = (attemptId: number) => `tg_test_draft_${attemptId}`;
function loadDraft(attemptId: number): Record<number, { choice: number[]; text: string }> {
  try { return JSON.parse(localStorage.getItem(draftKey(attemptId)) ?? "{}"); } catch { return {}; }
}

function TakeTest({ test, onDone, onLeave }: { test: StartedTest; onDone: (id: number) => void; onLeave: () => void }) {
  useLang();
  // answers are kept on this device as they are given: a reload, a tab switch or a closed app loses nothing
  const [answers, setAnswers] = useState<Record<number, { choice: number[]; text: string }>>(() => loadDraft(test.attempt_id));
  useEffect(() => {
    try { localStorage.setItem(draftKey(test.attempt_id), JSON.stringify(answers)); } catch { /* storage blocked */ }
  }, [answers, test.attempt_id]);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sent = useRef(false);

  const submit = useCallback(async (auto = false) => {
    if (sent.current) return;
    if (!auto) {
      const empty = test.questions.filter((q) => {
        const a = answers[q.id];
        return !a || (q.kind === "text" ? !a.text.trim() : a.choice.length === 0);
      }).length;
      if (!(await ask(empty ? t("s.tests.unanswered", { n: empty }) : t("s.tests.confirm_submit")))) return;
    }
    sent.current = true;
    setBusy(true); setError("");
    try {
      await api.tests.submit(test.id, test.questions.map((q) => ({ question_id: q.id, choice: answers[q.id]?.choice ?? [], text: answers[q.id]?.text ?? "" })));
      try { localStorage.removeItem(draftKey(test.attempt_id)); } catch { /* storage blocked */ }
      haptic("success");
      toast(auto ? t("s.tests.time_up") : t("s.tests.submitted"));
      onDone(test.id);
    } catch (e) {
      sent.current = false;
      setError(message(e));
      setBusy(false);
    }
  }, [answers, onDone, test]);

  // the clock: counts down to the end time the server set, then hands the answers in by itself
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!test.ends_at) return;
    const end = new Date(test.ends_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void submitRef.current(true);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [test.ends_at]);

  const pick = (qid: number, k: number, multi: boolean) => setAnswers((cur) => {
    const prev = cur[qid]?.choice ?? [];
    const choice = multi ? (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]) : [k];
    return { ...cur, [qid]: { choice, text: "" } };
  });

  async function leave() {
    if (await ask(test.ends_at ? t("st.tests.leave_timed") : t("st.tests.leave"))) onLeave();
  }

  return (
    <div className="st-test-run">
      <button className="btn small ghost co-back" onClick={leave}><Icon name="back" size={16} />{t("st.tests.later")}</button>
      {left != null && (
        <div className={`timer ${left < 60 ? "low" : ""}`}>
          {t("s.tests.time_left", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}
        </div>
      )}
      <h1>{test.title}</h1>
      <div className="hint">{test.company} · {t("s.tests.questions_n", { n: test.questions.length })}</div>
      {test.questions.map((q, n) => (
        <div key={q.id} className="card" style={{ marginTop: 10 }}>
          <div className="row between">
            <b>{n + 1}. {q.text}</b>
            {q.points > 0 && <span className="hint" style={{ whiteSpace: "nowrap" }}>{t("s.common.points", { n: q.points })}</span>}
          </div>
          {q.kind === "multi" && <div className="hint">{t("s.tests.multi_hint")}</div>}
          {q.kind !== "text" && q.options.map((o, k) => {
            const on = answers[q.id]?.choice.includes(k) ?? false;
            return (
              <label key={k} className={`answer-opt ${on ? "on" : ""}`}>
                <input type={q.kind === "multi" ? "checkbox" : "radio"} name={`q${q.id}`} checked={on} onChange={() => pick(q.id, k, q.kind === "multi")} />
                <span>{o}</span>
              </label>
            );
          })}
          {q.kind === "text" && (
            <textarea value={answers[q.id]?.text ?? ""} maxLength={5000} placeholder={t("s.tests.answer_ph")} style={{ marginTop: 8 }}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: { choice: [], text: e.target.value } })} />
          )}
        </div>
      ))}
      <ErrorText error={error} />
      <div className="save-bar">
        <button className="btn" disabled={busy} onClick={() => submit(false)}>{busy ? t("s.common.sending") : t("s.common.submit")}</button>
      </div>
    </div>
  );
}

function Result({ id, onBack }: { id: number; onBack: () => void }) {
  useLang();
  const [r, setR] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.tests.result(id).then(setR, (e) => setError(message(e))); }, [id]);
  return (
    <div>
      <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("st.tasks.tab.tests")}</button>
      <ErrorText error={error} />
      {r && (
        <>
          <h1>{r.title}</h1>
          <div className="card soft">
            <b>{attemptStatusLabel(r.status)}</b>
            {r.max_score > 0 && (
              <div style={{ fontSize: 22, fontWeight: 700 }}>{t("s.tests.score", { score: r.score, max: r.max_score })}</div>
            )}
            {r.status === "submitted" && <div className="hint">{t("s.tests.submitted_hint")}</div>}
            {r.feedback && <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{t("s.tests.feedback", { text: r.feedback })}</p>}
          </div>
          {r.items.map((item, n) => (
            <div key={item.question.id} className="card">
              <div className="row between">
                <b>{n + 1}. {item.question.text}</b>
                {item.scored && <span className="hint" style={{ whiteSpace: "nowrap" }}>{item.points ?? "?"} / {item.question.points}</span>}
              </div>
              {item.question.kind !== "text"
                ? <div className="hint">{t("s.tests.your_answer", { answer: item.choice.map((k) => item.question.options[k]).join(", ") || "—" })}</div>
                : <p style={{ whiteSpace: "pre-line" }}>{item.text || "—"}</p>}
              {item.comment && <div className="hint">{t("s.tests.comment", { text: item.comment })}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
