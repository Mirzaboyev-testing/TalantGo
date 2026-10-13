import { useCallback, useEffect, useState } from "react";
import { api, ATTEMPT_STATUS, courseLabel, QUESTION_KIND, TEST_STATUS, type AttemptDetail, type CompanyTestFull,
         type CompanyTestSummary, type Job, type QuestionInput, type QuestionKind, type TestInput, type TestResultRow,
         type Track } from "../../api";
import { Field, Req, useRequired, type Check } from "../../form";
import { Icon } from "../../icons";
import { ask, haptic } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { downloadCv, StudentSheet } from "./Students";

const AUDIENCE = { all: "Barcha talabalar", tracks: "Tanlangan yo'nalishlar", applicants: "Vakansiyaga ariza berganlar" };
const when = (s: string | null) => (s ? new Date(s).toLocaleString("uz", { dateStyle: "short", timeStyle: "short" }) : "—");

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
  const [tests, setTests] = useState<CompanyTestSummary[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.tests().then(setTests, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function act(action: () => Promise<unknown>) {
    try { await action(); void load(); } catch (e) { setError(message(e)); }
  }

  return (
    <div>
      <h1>Testlar</h1>
      <button className="btn" onClick={onNew}><Icon name="plus" size={18} />Test yoki so'rovnoma yaratish</button>
      <p className="hint">Variantli savollar avtomatik tekshiriladi, yozma javoblarni o'zingiz baholaysiz. Ballsiz savollar oddiy so'rovnoma bo'ladi. Har bir test admin tekshiruvidan keyin talabalarga chiqadi.</p>
      <ErrorText error={error} />
      {!tests && !error && <div className="hint">Yuklanmoqda…</div>}
      {tests?.length === 0 && <div className="center hint">Hali test yo'q</div>}
      {tests?.map((t) => (
        <div key={t.id} className="card">
          <div className="row between">
            <span className="hint">{t.is_survey ? "So'rovnoma" : `Test · ${t.max_score} ball`} · {t.questions_count} savol</span>
            <span className={`badge ${TEST_STATUS[t.status][1]}`}>{TEST_STATUS[t.status][0]}</span>
          </div>
          <b>{t.title}</b>
          <div className="hint">
            {AUDIENCE[t.audience]}{t.job_title ? ` · ${t.job_title}` : ""}{t.deadline ? ` · muddat ${t.deadline}` : ""}
            {t.time_limit_min ? ` · ${t.time_limit_min} daqiqa` : ""}
          </div>
          <div className="hint">{t.attempts} kishi topshirdi{t.to_grade ? ` · ${t.to_grade} ta baholash kutilmoqda` : ""}</div>
          {t.status === "rejected" && t.review_note && <div className="error">Admin izohi: {t.review_note}</div>}
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => onResults(t.id)}>Natijalar ({t.attempts}){t.to_grade ? ` · ${t.to_grade} baholash` : ""}</button>
            {t.attempts === 0 && t.status !== "closed" && (
              <button className="btn small ghost" onClick={() => act(async () => onEdit(await api.employer.test(t.id)))}>Tahrirlash</button>
            )}
            {t.status !== "closed" && t.status !== "draft" && (
              <button className="btn small ghost" onClick={async () => {
                if (await ask("Test yopilsinmi? Talabalar uni boshqa ishlay olmaydi.")) void act(() => api.employer.closeTest(t.id));
              }}>Yopish</button>
            )}
            {t.attempts === 0 && (
              <button className="btn small ghost" onClick={async () => {
                if (await ask("Test o'chirilsinmi?")) void act(() => api.employer.deleteTest(t.id));
              }}>O'chirish</button>
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
      ["t-title", f.title.trim().length >= 3, "test nomi"],
      ["t-tracks", f.audience !== "tracks" || trackIds.length > 0, "yo'nalishlar"],
      ["t-job", f.audience !== "applicants" || Boolean(f.job_id), "vakansiya"],
    ];
    questions.forEach((q, i) => {
      const filled = q.text.trim().length >= 3 && (q.kind === "text" || q.options.filter((o) => o.trim()).length >= 2);
      const answered = q.kind === "text" || q.points === 0 || q.correct.length > 0;
      checks.push([`q-${i}`, filled && answered, filled ? `${i + 1}-savolning to'g'ri javobi` : `${i + 1}-savol matni va variantlari`]);
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
      toast(submit ? "Test admin tekshiruviga yuborildi" : "Qoralama saqlandi");
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onDone}><Icon name="back" size={16} />Testlar</button>
      <h1>{test ? "Testni tahrirlash" : "Yangi test yoki so'rovnoma"}</h1>
      <p className="form-note"><Req />belgisi bor maydonlar majburiy.</p>
      <div className="card">
        <Field id="t-title" label="Nomi" required error={errors["t-title"] && "Test nomini yozing"}>
          <input id="t-title" className={cls("t-title")} value={f.title} maxLength={160} placeholder="Masalan: SQL bo'yicha kirish testi"
                 onChange={(e) => { setF({ ...f, title: e.target.value }); clear("t-title"); }} />
        </Field>
        <Field id="t-desc" label="Talabalar uchun izoh">
          <textarea id="t-desc" value={f.description} maxLength={3000} placeholder="Test nima haqida, natija nimaga ta'sir qiladi"
                    onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <label>Kimga ko'rinadi<Req /></label>
        {(Object.keys(AUDIENCE) as (keyof typeof AUDIENCE)[]).map((a) => (
          <label key={a} className="radio-line">
            <input type="radio" name="audience" checked={f.audience === a} onChange={() => setF({ ...f, audience: a })} />{AUDIENCE[a]}
          </label>
        ))}
        {f.audience === "tracks" && (
          <>
            <div id="t-tracks" tabIndex={-1} className={groupCls("t-tracks", "chips")}>
              {tracks.map((t) => (
                <button key={t.id} type="button" className={`chip ${trackIds.includes(t.id) ? "on" : ""}`}
                        onClick={() => { setTrackIds(trackIds.includes(t.id) ? trackIds.filter((x) => x !== t.id) : [...trackIds, t.id]); clear("t-tracks"); }}>
                  {t.title.split(":")[0]}
                </button>
              ))}
            </div>
            {errors["t-tracks"] && <div className="field-error">Kamida bitta yo'nalishni tanlang</div>}
          </>
        )}
        <Field id="t-job" label={f.audience === "applicants" ? "Vakansiya" : "Vakansiyaga bog'lash (ixtiyoriy)"} required={f.audience === "applicants"}
               error={errors["t-job"] && "Vakansiyani tanlang"}>
          <select id="t-job" className={cls("t-job")} value={f.job_id} onChange={(e) => { setF({ ...f, job_id: e.target.value }); clear("t-job"); }}>
            <option value="">{f.audience === "applicants" ? "Tanlang…" : "Bog'lanmagan"}</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </Field>
        <div className="row">
          <div className="grow"><Field id="t-deadline" label="Muddat (ixtiyoriy)">
            <input id="t-deadline" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          </Field></div>
          <div className="grow"><Field id="t-time" label="Vaqt, daqiqa (ixtiyoriy)">
            <input id="t-time" value={f.time_limit} inputMode="numeric" maxLength={3} placeholder="30"
                   onChange={(e) => setF({ ...f, time_limit: e.target.value.replace(/\D/g, "") })} />
          </Field></div>
        </div>
      </div>

      <div className="row between"><h2>Savollar ({questions.length})</h2><span className="hint">Jami: {total} ball</span></div>
      {questions.map((q, i) => (
        <div key={i} id={`q-${i}`} tabIndex={-1} className={groupCls(`q-${i}`, "q-card")}>
          <div className="row between">
            <b>{i + 1}-savol<Req /></b>
            <div className="row">
              <select value={q.kind} style={{ width: "auto" }} onChange={(e) => {
                const kind = e.target.value as QuestionKind;
                setQ(i, kind === "text" ? { kind, options: [], correct: [] }
                  : { kind, options: q.options.length >= 2 ? q.options : ["", ""], correct: kind === "single" ? q.correct.slice(0, 1) : q.correct });
              }}>
                {(Object.keys(QUESTION_KIND) as QuestionKind[]).map((k) => <option key={k} value={k}>{QUESTION_KIND[k]}</option>)}
              </select>
              {questions.length > 1 && (
                <button className="icon-btn" title="Savolni o'chirish" aria-label="Savolni o'chirish"
                        onClick={() => setQuestions(questions.filter((_, k) => k !== i))}><Icon name="trash" size={18} /></button>
              )}
            </div>
          </div>
          <textarea value={q.text} maxLength={2000} placeholder="Savol matni" style={{ marginTop: 8 }} onChange={(e) => setQ(i, { text: e.target.value })} />
          {q.kind !== "text" && (
            <>
              <div className="hint" style={{ marginTop: 6 }}>
                {q.kind === "single" ? "To'g'ri javobni doira bilan belgilang" : "Barcha to'g'ri javoblarni belgilang"}. Ball 0 bo'lsa, to'g'ri javob shart emas (so'rovnoma).
              </div>
              {q.options.map((o, k) => (
                <div key={k} className="q-option">
                  <input className="mark" type={q.kind === "single" ? "radio" : "checkbox"} name={`q${i}`} checked={q.correct.includes(k)}
                         title="To'g'ri javob" onChange={() => setQ(i, {
                           correct: q.kind === "single" ? [k] : q.correct.includes(k) ? q.correct.filter((x) => x !== k) : [...q.correct, k] })} />
                  <input value={o} maxLength={300} placeholder={`${k + 1}-variant`}
                         onChange={(e) => setQ(i, { options: q.options.map((x, n) => (n === k ? e.target.value : x)) })} />
                  {q.options.length > 2 && (
                    <button className="icon-btn" aria-label="Variantni o'chirish" onClick={() => setQ(i, {
                      options: q.options.filter((_, n) => n !== k),
                      correct: q.correct.filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)) })}><Icon name="close" size={16} /></button>
                  )}
                </div>
              ))}
              {q.options.length < 12 && <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setQ(i, { options: [...q.options, ""] })}>+ Variant</button>}
            </>
          )}
          {q.kind === "text" && <div className="hint" style={{ marginTop: 6 }}>Talaba javobni yozadi, siz ballni o'zingiz qo'yasiz. Ball 0 bo'lsa, oddiy so'rovnoma savoli.</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ margin: 0 }}>Ball</label>
            <input value={String(q.points)} inputMode="numeric" style={{ width: 80 }}
                   onChange={(e) => setQ(i, { points: Math.min(100, Number(e.target.value.replace(/\D/g, "") || 0)) })} />
          </div>
          {errors[`q-${i}`] && <div className="field-error">{q.text.trim().length < 3 || (q.kind !== "text" && q.options.filter((o) => o.trim()).length < 2)
            ? "Savol matnini va kamida 2 ta variantni yozing" : "To'g'ri javobni belgilang yoki ballni 0 qiling"}</div>}
        </div>
      ))}
      <div className="row wrap">
        <button className="btn small ghost" onClick={() => setQuestions([...questions, blankQuestion("single")])}>+ Bitta javobli</button>
        <button className="btn small ghost" onClick={() => setQuestions([...questions, blankQuestion("multi")])}>+ Bir nechta javobli</button>
        <button className="btn small ghost" onClick={() => setQuestions([...questions, blankQuestion("text")])}>+ Yozma javob</button>
      </div>
      <ErrorText error={error} />
      <div className="save-bar stack">
        <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? "Saqlanmoqda…" : "Saqlash va tekshiruvga yuborish"}</button>
        <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Qoralama sifatida saqlash</button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- results and grading

function Results({ id, onBack, onOpen }: { id: number; onBack: () => void; onOpen: (attemptId: number) => void }) {
  const [data, setData] = useState<{ test: CompanyTestSummary; rows: TestResultRow[] } | null>(null);
  const [profile, setProfile] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.employer.testResults(id).then(setData, (e) => setError(message(e))); }, [id]);

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />Testlar</button>
      <h1>{data?.test.title ?? "Natijalar"}</h1>
      <ErrorText error={error} />
      {data && (
        <p className="hint">{data.rows.length} kishi topshirdi{data.test.max_score ? ` · eng yuqori ball ${data.test.max_score}` : " · so'rovnoma"}
          {data.test.to_grade ? ` · ${data.test.to_grade} ta yozma javob baholashni kutmoqda` : ""}</p>
      )}
      {data?.rows.length === 0 && <div className="center hint">Hali hech kim topshirmagan</div>}
      {data?.rows.map((r) => (
        <div key={r.attempt_id} className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className={`rank ${r.place <= 3 && data.test.max_score ? "top" : ""}`}>{r.place}</span>
            <div className="grow">
              <div className="row between">
                <b>{r.student.full_name}</b>
                <span className={`badge ${r.status === "graded" ? "peer_verified" : "pending"}`}>{ATTEMPT_STATUS[r.status]}</span>
              </div>
              <div className="hint">{[r.student.university, r.student.faculty, courseLabel(r.student.course), r.student.group_name].filter(Boolean).join(" · ")}</div>
              <div className="hint">
                {data.test.max_score ? <><b style={{ color: "var(--text)" }}>{r.score} / {r.max_score}</b>{r.percent != null ? ` (${r.percent}%)` : ""} · </> : null}
                {when(r.submitted_at)}{r.late ? " · vaqtdan kech" : ""}
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => onOpen(r.attempt_id)}>{r.status === "submitted" ? "Baholash" : "Javoblarni ko'rish"}</button>
            <button className="btn small ghost" onClick={() => setProfile(r.student.id)}>Profil</button>
            <button className="btn small ghost" onClick={() => downloadCv(r.student.id)}>CV (PDF)</button>
          </div>
        </div>
      ))}
      {profile && <StudentSheet id={profile} catalog={null} onClose={() => setProfile(null)} />}
    </div>
  );
}

function Grading({ id, onBack }: { id: number; onBack: () => void }) {
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
      toast(d.status === "graded" ? "Baholandi. Talabaga bot orqali xabar boradi." : "Saqlandi. Hali baholanmagan javoblar bor.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />Natijalar</button>
      <ErrorText error={error} />
      {!a && !error && <div className="hint">Yuklanmoqda…</div>}
      {a && (
        <>
          <h1>{a.student?.full_name}</h1>
          <div className="hint">{a.title} · {ATTEMPT_STATUS[a.status]} · {a.score} / {a.max_score} ball{a.late ? " · vaqtdan kech topshirgan" : ""}</div>
          {a.items.map((item, n) => {
            const q = item.question;
            return (
              <div key={q.id} className="card" style={{ marginTop: 10 }}>
                <div className="row between">
                  <b>{n + 1}. {q.text}</b>
                  <span className="hint" style={{ whiteSpace: "nowrap" }}>{item.scored ? `${item.points ?? "?"} / ${q.points}` : "so'rovnoma"}</span>
                </div>
                {q.kind !== "text" && q.options.map((o, k) => {
                  const picked = item.choice.includes(k);
                  const right = (q.correct ?? []).includes(k);
                  return (
                    <div key={k} className={`answer-opt ${picked ? "on" : ""} ${picked && item.scored ? (right ? "right" : "wrong") : ""}`}>
                      <span>{picked ? "●" : "○"}</span><span className="grow">{o}</span>
                      {right && item.scored && <span className="hint">to'g'ri javob</span>}
                    </div>
                  );
                })}
                {q.kind === "text" && <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{item.text || <span className="hint">Javob yozilmagan</span>}</p>}
                {q.kind === "text" && item.scored && item.text && grades[q.id] && (
                  <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
                    <div style={{ width: 110 }}>
                      <label>Ball (0–{q.points})</label>
                      <input value={grades[q.id].points} inputMode="decimal"
                             onChange={(e) => setGrades({ ...grades, [q.id]: { ...grades[q.id], points: e.target.value } })} />
                    </div>
                    <div className="grow">
                      <label>Izoh</label>
                      <input value={grades[q.id].comment} maxLength={1000}
                             onChange={(e) => setGrades({ ...grades, [q.id]: { ...grades[q.id], comment: e.target.value } })} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="card">
            <label style={{ marginTop: 0 }}>Talabaga umumiy fikr</label>
            <textarea value={feedback} maxLength={2000} placeholder="Masalan: suhbatga taklif qilamiz" onChange={(e) => setFeedback(e.target.value)} />
          </div>
          <div className="save-bar">
            <button className="btn" disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Bahoni saqlash"}</button>
          </div>
        </>
      )}
    </div>
  );
}
