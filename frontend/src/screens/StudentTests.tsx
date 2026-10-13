import { useCallback, useEffect, useRef, useState } from "react";
import { api, ATTEMPT_STATUS, type AttemptDetail, type StartedTest, type StudentTestCard } from "../api";
import { ask, backButton, haptic } from "../tg";
import { ErrorText, message, toast } from "../ui";

type View = { kind: "list" } | { kind: "take"; test: StartedTest } | { kind: "result"; id: number };

/** Company tests and surveys a student can take, and the results of those already taken. */
export default function StudentTests() {
  const [view, setView] = useState<View>({ kind: "list" });
  useEffect(() => (view.kind === "result" ? backButton(() => setView({ kind: "list" })) : backButton(null)), [view.kind]);
  if (view.kind === "take") return <TakeTest test={view.test} onDone={(id) => setView({ kind: "result", id })} />;
  if (view.kind === "result") return <Result id={view.id} onBack={() => setView({ kind: "list" })} />;
  return <TestList onStart={(t) => setView({ kind: "take", test: t })} onResult={(id) => setView({ kind: "result", id })} />;
}

function TestList({ onStart, onResult }: { onStart: (t: StartedTest) => void; onResult: (id: number) => void }) {
  const [tests, setTests] = useState<StudentTestCard[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.tests.list().then(setTests, (e) => setError(message(e))); }, []);

  async function start(t: StudentTestCard) {
    const resuming = t.my_attempt?.status === "in_progress";
    if (!resuming && !(await ask(t.time_limit_min
      ? `Testga ${t.time_limit_min} daqiqa beriladi va uni faqat bir marta ishlash mumkin. Boshlaymizmi?`
      : "Testni faqat bir marta ishlash mumkin. Boshlaymizmi?"))) return;
    try {
      onStart(await api.tests.start(t.id));
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div>
      <p className="hint">Kompaniyalarning testlari va so'rovnomalari. Natijangiz shu kompaniyaga ko'rinadi va tanlovda hisobga olinadi.</p>
      <ErrorText error={error} />
      {!tests && !error && <div className="hint">Yuklanmoqda…</div>}
      {tests?.length === 0 && <div className="center hint">Hozircha siz uchun test yo'q. Yangi test chiqsa, bot xabar beradi.</div>}
      {tests?.map((t) => {
        const a = t.my_attempt;
        const done = a && a.status !== "in_progress";
        return (
          <div key={t.id} className="card">
            <div className="row between">
              <span className="hint">{t.company}</span>
              {done ? <span className={`badge ${a.status === "graded" ? "peer_verified" : "pending"}`}>{ATTEMPT_STATUS[a.status]}</span>
                : <span className="badge todo">{t.is_survey ? "So'rovnoma" : "Test"}</span>}
            </div>
            <b>{t.title}</b>
            {t.description && <div className="hint" style={{ whiteSpace: "pre-line" }}>{t.description}</div>}
            <div className="hint">
              {t.questions_count} savol{t.max_score ? ` · ${t.max_score} ball` : ""}{t.time_limit_min ? ` · ${t.time_limit_min} daqiqa` : ""}
              {t.deadline ? ` · muddat ${t.deadline}` : ""}{t.job_title ? ` · ${t.job_title}` : ""}
            </div>
            <div style={{ marginTop: 8 }}>
              {done ? (
                <button className="btn small ghost" onClick={() => onResult(t.id)}>
                  Natija{a.status === "graded" && a.max_score ? `: ${a.score} / ${a.max_score}` : ""}
                </button>
              ) : t.open && t.status === "approved" ? (
                <button className="btn small" onClick={() => start(t)}>{a ? "Davom etish" : "Boshlash"}</button>
              ) : (
                <span className="hint">Muddat tugagan</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TakeTest({ test, onDone }: { test: StartedTest; onDone: (id: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, { choice: number[]; text: string }>>({});
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
      if (!(await ask(empty ? `${empty} ta savolga javob berilmagan. Baribir topshirasizmi?` : "Javoblarni topshirasizmi? Keyin o'zgartirib bo'lmaydi."))) return;
    }
    sent.current = true;
    setBusy(true); setError("");
    try {
      await api.tests.submit(test.id, test.questions.map((q) => ({ question_id: q.id, choice: answers[q.id]?.choice ?? [], text: answers[q.id]?.text ?? "" })));
      haptic("success");
      toast(auto ? "Vaqt tugadi: javoblaringiz topshirildi" : "Javoblaringiz topshirildi");
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

  return (
    <div>
      {left != null && (
        <div className={`timer ${left < 60 ? "low" : ""}`}>
          Qolgan vaqt: {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </div>
      )}
      <h1>{test.title}</h1>
      <div className="hint">{test.company} · {test.questions.length} savol</div>
      {test.questions.map((q, n) => (
        <div key={q.id} className="card" style={{ marginTop: 10 }}>
          <div className="row between">
            <b>{n + 1}. {q.text}</b>
            {q.points > 0 && <span className="hint" style={{ whiteSpace: "nowrap" }}>{q.points} ball</span>}
          </div>
          {q.kind === "multi" && <div className="hint">Bir nechta javobni belgilash mumkin</div>}
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
            <textarea value={answers[q.id]?.text ?? ""} maxLength={5000} placeholder="Javobingiz" style={{ marginTop: 8 }}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: { choice: [], text: e.target.value } })} />
          )}
        </div>
      ))}
      <ErrorText error={error} />
      <div className="save-bar">
        <button className="btn" disabled={busy} onClick={() => submit(false)}>{busy ? "Yuborilmoqda…" : "Topshirish"}</button>
      </div>
    </div>
  );
}

function Result({ id, onBack }: { id: number; onBack: () => void }) {
  const [r, setR] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.tests.result(id).then(setR, (e) => setError(message(e))); }, [id]);
  return (
    <div>
      <button className="btn small ghost" onClick={onBack}>Testlar</button>
      <ErrorText error={error} />
      {r && (
        <>
          <h1>{r.title}</h1>
          <div className="card soft">
            <b>{ATTEMPT_STATUS[r.status]}</b>
            {r.max_score > 0 && (
              <div style={{ fontSize: 22, fontWeight: 700 }}>{r.score} / {r.max_score} ball</div>
            )}
            {r.status === "submitted" && <div className="hint">Yozma javoblaringizni kompaniya baholaydi. Baholanganda bot xabar beradi.</div>}
            {r.feedback && <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>Kompaniya fikri: {r.feedback}</p>}
          </div>
          {r.items.map((item, n) => (
            <div key={item.question.id} className="card">
              <div className="row between">
                <b>{n + 1}. {item.question.text}</b>
                {item.scored && <span className="hint" style={{ whiteSpace: "nowrap" }}>{item.points ?? "?"} / {item.question.points}</span>}
              </div>
              {item.question.kind !== "text"
                ? <div className="hint">Javobingiz: {item.choice.map((k) => item.question.options[k]).join(", ") || "—"}</div>
                : <p style={{ whiteSpace: "pre-line" }}>{item.text || "—"}</p>}
              {item.comment && <div className="hint">Izoh: {item.comment}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
