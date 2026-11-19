// Company tasks and mentor challenges for the student (student panel v2, phase 3): filterable cards with the
// deadline, prize and own status; a detail page with the brief, a sticky status card and the submission form
// (files and/or a link, editable until the deadline or the review), then the result and the winners.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, daysLeft, fileSize, type Challenge, type SubmittedFile } from "../../api";
import { formatDateTime, t, useLang, type MsgKey } from "../../i18n";
import { Icon } from "../../icons";
import { navigate, useSearch } from "../../router";
import { haptic, openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { BRAND } from "../../brand";

// a student's own entry sits in the tab of its state: in review, accepted or rejected (2026-11-19)
type Filter = "open" | "review" | "accepted" | "rejected" | "upcoming" | "finished";
const FILTERS: Filter[] = ["open", "review", "accepted", "rejected", "upcoming", "finished"];
const ENTRY_OF: Partial<Record<Filter, string>> = { review: "submitted", accepted: "accepted", rejected: "rejected" };
const MAX_FILES = 5;
const day = (iso: string) => formatDateTime(iso, false);

function Deadline({ c }: { c: Challenge }) {
  useLang();
  if (c.state === "upcoming") return <span className="st-deadline"><Icon name="calendar" size={13} />{t("s.ch.starts", { date: day(c.starts_at) })}</span>;
  if (c.state === "finished") return <span className="st-deadline"><Icon name="flag" size={13} />{t("s.ch.finished")}</span>;
  const left = daysLeft(c.ends_at);
  return <span className={`st-deadline ${left <= 2 ? "soon" : ""}`}><Icon name="clock" size={13} />{left === 0 ? t("st.tb.today") : t("s.ch.days_left", { n: left })}</span>;
}

function EntryBadge({ c }: { c: Challenge }) {
  useLang();
  const e = c.my_entry;
  if (!e) return c.state === "active" ? <span className="co-pill">{t("s.ch.open")}</span> : null;
  if (e.place) return <span className="co-pill warn"><Icon name="trophy" size={13} />{t("s.ch.place", { n: e.place })}</span>;
  return <span className={`st-entry ${e.status}`}>{t(`st.tb.entry.${e.status}` as MsgKey)}</span>;
}

export default function TaskBoard() {
  useLang();
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  // a notification or the home page opens one task straight away: /talaba/topshiriqlar?vazifa=<id>
  const search = useSearch();
  const [openId, setOpenId] = useState<number | null>(search.vazifa ? Number(search.vazifa) || null : null);
  useEffect(() => { if (search.vazifa) setOpenId(Number(search.vazifa) || null); }, [search.vazifa]);
  const [error, setError] = useState("");
  const load = useCallback(() => api.challenges.list().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  const pick = (f: Filter) => (rows ?? []).filter((c) => ENTRY_OF[f] ? c.my_entry?.status === ENTRY_OF[f]
    : !c.my_entry && c.state === (f === "open" ? "active" : f));
  if (openId) return <TaskDetail id={openId} onBack={() => { setOpenId(null); if (search.vazifa) navigate("/talaba/topshiriqlar", { replace: true }); void load(); }} />;

  return (
    <div className="co-page">
      <div className="co-tabs">
        {FILTERS.filter((f) => f === "open" || !rows || pick(f).length > 0 || f === filter).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {t(`st.tb.f.${f}` as MsgKey)}{rows && <span className="co-tab-n">{pick(f).length}</span>}
          </button>
        ))}
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="st-skeleton-grid"><span /><span /><span /></div>}
      {rows && pick(filter).length === 0 && (
        <div className="st-empty"><Icon name="target" size={28} /><b>{t(`st.tb.empty.${filter}` as MsgKey)}</b><span className="hint">{t("st.tb.empty_hint")}</span></div>
      )}
      <div className="st-card-grid">
        {pick(filter).map((c) => (
          <button key={c.id} className="st-task-card" onClick={() => setOpenId(c.id)}>
            <div className="row between" style={{ gap: 8 }}>
              <span className="st-task-from"><Icon name={c.company ? "building" : "user"} size={14} />{c.company ?? c.mentor ?? BRAND}</span>
              <Deadline c={c} />
            </div>
            <b>{c.title}</b>
            <p className="co-clamp" style={{ margin: 0 }}>{c.description}</p>
            <div className="st-task-meta">
              <span className="co-pill">+{c.points} {t("home.points")}</span>
              {c.prize && <span className="co-pill warn"><Icon name="trophy" size={13} />{c.prize}</span>}
              <span className="hint">{t("s.ch.entries_n", { n: c.entries })}</span>
            </div>
            <div className="row between" style={{ marginTop: "auto" }}>
              <span className="hint">{c.company ? t("st.tb.kind.company") : t("st.tb.kind.mentor")}</span>
              <EntryBadge c={c} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskDetail({ id, onBack }: { id: number; onBack: () => void }) {
  useLang();
  const [c, setC] = useState<Challenge | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.challenges.detail(id).then(setC, (e) => setError(message(e))), [id]);
  useEffect(() => { void load(); }, [load]);
  if (!c) return <div className="co-page"><button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("common.back")}</button>{error ? <ErrorText error={error} /> : <div className="st-skeleton-grid"><span /></div>}</div>;

  const e = c.my_entry;
  const canSubmit = c.state === "active" && (!e || e.status !== "accepted");
  const steps = [
    { key: "join", done: true }, { key: "submit", done: Boolean(e) },
    { key: "review", done: Boolean(e && e.status !== "submitted") }, { key: "result", done: Boolean(e && (e.status !== "submitted" || c.state === "finished")) },
  ];
  return (
    <div className="co-page">
      <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("st.tb.back")}</button>
      <div className="co-dash-grid">
        <div className="co-col">
          <div className="co-card st-task-hero">
            <div className="row between wrap" style={{ gap: 8 }}>
              <span className="st-task-from"><Icon name={c.company ? "building" : "user"} size={15} />{c.company ?? c.mentor ?? BRAND}</span>
              <Deadline c={c} />
            </div>
            <h1>{c.title}</h1>
            <div className="st-task-meta">
              <span className="co-pill">+{c.points} {t("home.points")}</span>
              {c.prize && <span className="co-pill warn"><Icon name="trophy" size={13} />{c.prize}</span>}
              <span className="hint">{t("s.ch.entries_n", { n: c.entries })}</span>
            </div>
            <ol className="st-steps">
              {steps.map((s) => <li key={s.key} className={s.done ? "done" : ""}><span>{s.done ? <Icon name="tick" size={13} /> : null}</span>{t(`st.tb.step.${s.key}` as MsgKey)}</li>)}
            </ol>
          </div>
          <div className="co-card">
            <div className="co-card-head"><b>{t("st.tb.brief")}</b></div>
            <p className="st-pre" style={{ marginTop: 0 }}>{c.description}</p>
          </div>
          <div className="co-card">
            <div className="co-card-head"><b>{t("st.tb.timeline")}</b></div>
            <div className="st-timeline-mini">
              <div><Icon name="calendar" size={16} /><span>{t("st.tb.starts")}</span><b>{formatDateTime(c.starts_at)}</b></div>
              <div><Icon name="clock" size={16} /><span>{t("st.tb.ends")}</span><b>{formatDateTime(c.ends_at)}</b></div>
            </div>
          </div>
          {c.results && c.results.length > 0 && (
            <div className="co-card">
              <div className="co-card-head"><b>{t("st.tb.results")}</b></div>
              {c.results.map((r, i) => (
                <div key={i} className="row between list-row">
                  <span className="row" style={{ gap: 8 }}>{r.place ? <span className="lb-rank top">{r.place}</span> : <span className="lb-rank">·</span>}{r.student}</span>
                  {r.score != null && <b>{r.score}/100</b>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="co-col st-sticky">
          <div className={`co-card st-task-status ${e?.status ?? ""}`}>
            <b>{t("st.tb.your_status")}</b>
            {!e && <p className="hint">{c.state === "active" ? t("st.tb.not_sent") : c.state === "upcoming" ? t("st.tb.not_started") : t("st.tb.closed")}</p>}
            {e && (
              <>
                <div style={{ marginTop: 8 }}><EntryBadge c={c} /></div>
                {e.score != null && <div className="st-score"><b>{e.score}</b>/100</div>}
                {e.status === "accepted" && c.company && (
                  <button className="btn small soft" style={{ marginTop: 8 }}
                          onClick={() => navigate(`/talaba/hamjamiyat?yoz=achievement&matn=${encodeURIComponent(t("fd.share.task_t", { task: c.title, company: c.company! }))}`)}>
                    <Icon name="megaphone" size={15} />{t("fd.share")}
                  </button>
                )}
                {e.points_awarded > 0 && <div className="hint">+{e.points_awarded} {t("home.points")}</div>}
                {e.comment && <blockquote className="co-quote">«{e.comment}»</blockquote>}
                {e.proof_url && <button className="link-btn" onClick={() => openLink(e.proof_url)}><Icon name="link" size={14} /> {t("s.common.open_link")}</button>}
                {(e.files ?? []).length > 0 && (
                  <div className="st-entry-files">
                    {e.files!.map((f, i) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer"><Icon name="file" size={14} /><span className="ellipsis">{f.name || t("co.task.file_n", { n: i + 1 })}</span></a>
                    ))}
                  </div>
                )}
                {e.status === "submitted" && c.state === "active" && <p className="hint">{t("st.tb.can_edit", { date: day(c.ends_at) })}</p>}
                {e.status === "rejected" && c.state === "active" && <p className="st-fix-hint">{t("st.tb.can_fix", { date: day(c.ends_at) })}</p>}
              </>
            )}
          </div>
          {canSubmit && <SubmitTask c={c} onDone={load} />}
          {c.company && <div className="co-card hint">{t("st.tb.company_note")}</div>}
        </div>
      </div>
    </div>
  );
}

function SubmitTask({ c, onDone }: { c: Challenge; onDone: () => void }) {
  useLang();
  const e = c.my_entry;
  const [url, setUrl] = useState(e?.proof_url ?? "");
  const [note, setNote] = useState(e?.note ?? "");
  const [files, setFiles] = useState<SubmittedFile[]>([]);
  const [kept, setKept] = useState(e?.files ?? []);
  const fixing = e?.status === "rejected";
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null) {
    if (!list) return;
    setError("");
    try {
      for (const f of Array.from(list)) {
        if (files.length + kept.length >= MAX_FILES) { setError(t("s.path.max_files", { n: MAX_FILES })); break; }
        setBusy(t("co.file.uploading"));
        const up = await api.upload(f);
        setFiles((cur) => [...cur, up]);
      }
    } catch (err) { setError(message(err)); }
    finally { setBusy(""); if (input.current) input.current.value = ""; }
  }
  async function send() {
    setBusy(t("s.common.sending")); setError("");
    try {
      await api.challenges.enter(c.id, url.trim(), note.trim(), [...kept.map((f) => f.id), ...files.map((f) => f.id)]);
      haptic("success");
      toast(fixing ? t("st.tb.resent") : e ? t("st.tb.updated") : t("st.tb.sent"));
      setFiles([]);
      onDone();
    } catch (err) { setError(message(err)); }
    finally { setBusy(""); }
  }
  const ready = url.trim().length >= 10 || files.length > 0 || kept.length > 0;
  const title = fixing ? t("st.tb.fix") : e ? t("st.tb.update") : t("st.tb.submit");
  return (
    <div className={`co-card ${fixing ? "st-fix-card" : ""}`}>
      <b>{title}</b>
      {fixing && e?.comment && <p className="hint" style={{ margin: "6px 0 0" }}>{t("st.tb.fix_hint")}</p>}
      {kept.length > 0 && (
        <div className="files" style={{ marginTop: 10 }}>
          {kept.map((f, i) => (
            <div key={f.id} className="file-chip">
              <span className="file-ext"><Icon name="file" size={14} /></span>
              <a className="file-name" href={f.url} target="_blank" rel="noreferrer">{f.name || t("co.task.file_n", { n: i + 1 })}</a>
              <button className="file-remove" aria-label={t("s.path.remove_file")} onClick={() => setKept(kept.filter((x) => x.id !== f.id))}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={input} type="file" multiple hidden onChange={(ev) => pick(ev.target.files)} />
      <div className="dropzone" role="button" style={{ marginTop: 10 }} onClick={() => input.current?.click()}>
        <Icon name="upload" size={20} />{t("s.path.choose_file")}
        <span className="hint">{t("st.tb.file_hint", { n: MAX_FILES })}</span>
      </div>
      {files.length > 0 && (
        <div className="files">
          {files.map((f) => (
            <div key={f.id} className="file-chip">
              <span className="file-ext">{(f.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>
              <span className="file-name">{f.name}</span><span className="hint">{fileSize(f.size)}</span>
              <button className="file-remove" aria-label={t("s.path.remove_file")} onClick={() => setFiles(files.filter((x) => x.id !== f.id))}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <label>{t("s.path.link_label")}</label>
      <input value={url} inputMode="url" placeholder={t("s.path.link_ph")} onChange={(ev) => setUrl(ev.target.value)} />
      <label>{t("s.common.note_optional")}</label>
      <textarea value={note} maxLength={1000} rows={3} placeholder={t("st.tb.note_ph")} onChange={(ev) => setNote(ev.target.value)} />
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 10 }} disabled={!!busy || !ready} onClick={send}>{busy || (fixing ? t("st.tb.resend") : e ? t("st.tb.update") : t("s.common.send"))}</button>
    </div>
  );
}
