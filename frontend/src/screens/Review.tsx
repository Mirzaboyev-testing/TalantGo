import { useCallback, useEffect, useState } from "react";
import { api, type Me, type QueueItem, type Rules } from "../api";
import { t, useLang } from "../i18n";
import { haptic, openLink } from "../tg";
import { ErrorText, FileList, StatusBadge, message } from "../ui";
import { MentorChallenges, MentorQuestions, MentorTasks } from "./mentor/MentorTools";

export default function ReviewScreen({ me, onChanged }: { me: Me; onChanged: () => void }) {
  useLang();
  const [view, setView] = useState<"queue" | "questions" | "tasks" | "challenges">("queue");
  const [openQuestions, setOpenQuestions] = useState(0);
  const isMentor = me.role !== "student";
  useEffect(() => {
    if (isMentor) api.mentor.questions().then((q) => setOpenQuestions(q.length), () => {});
  }, [isMentor, view]);
  if (!isMentor) return <Queue me={me} onChanged={onChanged} />;
  return (
    <div>
      <h1>{t("s.review.mentor_panel")}</h1>
      <div className="segmented">
        <button className={view === "queue" ? "on" : ""} onClick={() => setView("queue")}>{t("nav.student.review")}</button>
        <button className={view === "questions" ? "on" : ""} onClick={() => setView("questions")}>
          {t("s.review.questions")}{openQuestions > 0 && <span className="seg-count">{openQuestions}</span>}
        </button>
        <button className={view === "tasks" ? "on" : ""} onClick={() => setView("tasks")}>{t("s.common.tasks")}</button>
        <button className={view === "challenges" ? "on" : ""} onClick={() => setView("challenges")}>{t("s.common.challenges")}</button>
      </div>
      {view === "queue" && <Queue me={me} onChanged={onChanged} embedded />}
      {view === "questions" && <MentorQuestions onCount={setOpenQuestions} />}
      {view === "tasks" && <MentorTasks />}
      {view === "challenges" && <MentorChallenges />}
    </div>
  );
}

function Queue({ me, onChanged, embedded = false }: { me: Me; onChanged: () => void; embedded?: boolean }) {
  useLang();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<Rules | null>(null);
  const isMentor = me.role !== "student";
  useEffect(() => { api.rules().then(setRules, () => {}); }, []);

  const load = useCallback(() => api.queue().then(setItems, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      {!embedded && <h1>{t("nav.student.review")}</h1>}
      <p className="notice">
        {isMentor
          ? t("s.review.mentor_notice")
          : t("s.review.peer_notice", { points: rules?.review_points ?? 2, n: rules?.peer_approvals_required ?? 1 })}
      </p>
      <ErrorText error={error} />
      {!items && !error && <div className="hint">{t("common.loading")}</div>}
      {items?.length === 0 && <div className="center hint">{t("s.review.empty")}</div>}
      {items?.map((it) => (
        <ReviewCard key={it.submission_id} item={it} onDone={async () => { await load(); onChanged(); }} />
      ))}
    </div>
  );
}

function ReviewCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  useLang();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(approved: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.review(item.submission_id, approved, comment.trim());
      haptic("success");
      onDone();
    } catch (e) {
      haptic("error");
      setError(message(e));
      setBusy(false);
    }
  }

  const tooShort = comment.trim().length < 10;
  return (
    <div className="card">
      <div className="row between wrap" style={{ gap: 6 }}>
        <span className="hint">{item.author_name} · {item.track_title.split(":")[0]}</span>
        <StatusBadge status={item.status} />
      </div>
      <b>{item.task_title}</b>
      {item.proof_hint && <div className="hint" style={{ marginTop: 4 }}>{t("s.common.proof")} {item.proof_hint}</div>}
      {item.criteria && <div className="hint" style={{ marginTop: 4, whiteSpace: "pre-line" }}>{t("s.common.criteria")} {item.criteria}</div>}
      {item.note && <div style={{ marginTop: 6 }}>«{item.note}»</div>}
      <FileList files={item.files} />
      {item.proof_url && (
        <div style={{ marginTop: 8 }}>
          <button className="btn ghost" onClick={() => openLink(item.proof_url)}>{t("s.common.open_link")}</button>
        </div>
      )}
      <div style={{ height: 10 }} />
      <textarea value={comment} maxLength={1000} placeholder={t("s.review.comment_ph")}
                onChange={(e) => setComment(e.target.value)} />
      <ErrorText error={error} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn bad" disabled={busy || tooShort} onClick={() => decide(false)}>{t("s.review.reject")}</button>
        <button className="btn ok" disabled={busy || tooShort} onClick={() => decide(true)}>{t("s.review.approve")}</button>
      </div>
    </div>
  );
}
