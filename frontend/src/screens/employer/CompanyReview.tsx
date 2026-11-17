import { useCallback, useEffect, useState } from "react";
import { api, loadCatalog, type Catalog, type Me, type ReviewStatus } from "../../api";
import { formatDateTime, t, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { insideTelegram, openLink } from "../../tg";
import { absoluteUrl } from "../../api";
import { ErrorText, message } from "../../ui";
import LangSwitch from "../LangSwitch";
import CompanySignup, { industryLabel } from "./CompanySignup";
import { CompanyMark } from "./kit";
import { BrandLogo } from "../../brand";

const TIPS = [1, 2, 3, 4, 5] as const;
const PREP: { key: "job" | "task" | "profile" | "ai"; icon: IconName }[] = [
  { key: "job", icon: "briefcase" }, { key: "task", icon: "flag" }, { key: "profile", icon: "building" }, { key: "ai", icon: "spark" },
];
const LOCKED: { key: "jobs" | "students" | "tasks" | "tests" | "unis"; icon: IconName }[] = [
  { key: "jobs", icon: "briefcase" }, { key: "students", icon: "users" }, { key: "tasks", icon: "flag" },
  { key: "tests", icon: "check" }, { key: "unis", icon: "school" },
];
const prepKey = (id: number) => `tg_review_prep_${id}`;

/** "3 soat 20 daqiqa": how long ago the company sent its data. */
function elapsed(fromIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  if (mins < 60) return t("co.rv.minutes", { n: Math.max(1, mins) });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("co.rv.hours", { h: hours, m: mins % 60 });
  return t("co.rv.days", { d: Math.floor(hours / 24), h: hours % 24 });
}

/**
 * What a company sees while an admin checks it: where it is, how long it usually takes, the students it will
 * reach (real numbers), what to prepare meanwhile and what opens after approval. A refusal shows the reason
 * and leads straight to fixing the data. The decision is picked up without a reload.
 */
export default function CompanyReview({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout?: () => void }) {
  useLang();
  const company = me.company!;
  const [s, setS] = useState<ReviewStatus | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [tip, setTip] = useState(0);
  const [prep, setPrep] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(prepKey(company.id)) ?? "[]"); } catch { return []; }
  });
  const [error, setError] = useState("");
  const rejected = company.status === "rejected";

  const load = useCallback(() => api.employer.reviewStatus().then(setS, (e) => setError(message(e))), []);
  useEffect(() => { void load(); loadCatalog().then(setCatalog, () => {}); }, [load, company.status]);

  // the decision arrives without a reload (accounts without Telegram get no bot message)
  useEffect(() => {
    if (rejected || editing) return;
    const timer = window.setInterval(() => { api.me().then(onChanged, () => {}); setNow(Date.now()); }, 30000);
    return () => window.clearInterval(timer);
  }, [rejected, editing, onChanged]);
  useEffect(() => {
    const timer = window.setInterval(() => setTip((n) => (n + 1) % TIPS.length), 7000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { try { localStorage.setItem(prepKey(company.id), JSON.stringify(prep)); } catch { /* storage blocked */ } }, [prep, company.id]);

  if (editing) return <CompanySignup me={me} onSaved={(m) => { onChanged(m); setEditing(false); }} onBack={() => setEditing(false)} onLogout={onLogout} />;

  const submitted = s?.submitted_at ?? company.submitted_at ?? company.created_at;
  const profileReady = Boolean(company.logo_url && company.website);
  const done = (k: string) => (k === "profile" ? profileReady : prep.includes(k));
  const doneCount = PREP.filter((p) => done(p.key)).length;
  const togglePrep = (k: string) => setPrep((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const openAi = () => window.dispatchEvent(new Event("cf-open-ai"));
  const typical = s?.typical_hours != null
    ? (s.typical_hours < 1 ? t("co.rv.typical_lt1") : t("co.rv.typical_h", { n: Math.round(s.typical_hours) }))
    : t("co.rv.typical_default");

  return (
    <div className="co-review">
      <header className="co-review-top">
        <span className="grow"><BrandLogo size={36} /></span>
        <LangSwitch />
        {onLogout && !insideTelegram && <button className="btn small ghost" onClick={onLogout}><Icon name="logout" size={16} />{t("shell.logout")}</button>}
      </header>

      <div className="co-review-wrap">
        <section className={`co-hero ${rejected ? "rejected" : "waiting"}`}>
          <div className="co-hero-text">
            <span className="co-hero-badge">
              {rejected ? <Icon name="close" size={15} /> : <span className="co-pulse" />}
              {rejected ? t("co.rv.badge_rejected") : t("co.rv.badge_waiting")}
            </span>
            <h1>{rejected ? t("co.rv.title_rejected") : t("co.rv.title", { name: me.full_name.split(" ")[0] })}</h1>
            <p>{rejected ? t("co.rv.text_rejected") : t("co.rv.text")}</p>
            {rejected ? (
              <div className="co-reason">
                <b>{t("co.rv.reason")}</b>
                <p>{company.review_note || t("s.pending.no_note")}</p>
                <button className="btn" onClick={() => setEditing(true)}><Icon name="flag" size={16} />{t("co.rv.fix")}</button>
              </div>
            ) : (
              <div className="co-hero-facts">
                {s?.queue_position != null && (
                  <div><b>{t("co.rv.queue_n", { n: s.queue_position })}</b><span>{t("co.rv.queue")}</span></div>
                )}
                <div><b>{elapsed(submitted, now)}</b><span>{t("co.rv.since")}</span></div>
                <div><b>{typical}</b><span>{t("co.rv.typical")}</span></div>
              </div>
            )}
          </div>
          <ReviewArt rejected={rejected} />
        </section>

        <ErrorText error={error} />

        <div className="co-review-grid">
          <div className="co-col">
            <div className="co-card">
              <div className="co-card-head"><b>{t("co.rv.progress")}</b></div>
              <ol className="co-timeline">
                <li className="done">
                  <span className="co-tl-dot"><Icon name="tick" size={14} /></span>
                  <div><b>{t("co.rv.tl.sent")}</b><small>{formatDateTime(submitted)}</small></div>
                </li>
                <li className={rejected ? "done" : "now"}>
                  <span className="co-tl-dot">{rejected ? <Icon name="tick" size={14} /> : <span className="co-pulse" />}</span>
                  <div><b>{t("co.rv.tl.check")}</b><small>{t("co.rv.tl.check_hint")}</small></div>
                </li>
                <li className={rejected ? "bad" : ""}>
                  <span className="co-tl-dot">{rejected ? <Icon name="close" size={14} /> : "3"}</span>
                  <div><b>{t("co.rv.tl.decision")}</b>
                    <small>{rejected ? (s?.reviewed_at ? formatDateTime(s.reviewed_at) : t("co.rv.tl.rejected")) : t("co.rv.tl.decision_hint", { told: me.has_telegram ? t("co.rv.told_bot") : t("co.rv.told_page") })}</small>
                  </div>
                </li>
              </ol>
            </div>

            {s && (
              <div className="co-card">
                <div className="co-card-head">
                  <b>{t("co.rv.reach")}</b>
                  <span className="hint">{t("co.rv.reach_hint")}</span>
                </div>
                <div className="co-reach">
                  <div className="co-reach-main">
                    <b>{s.students}</b>
                    <span>{t("co.rv.reach_students")}</span>
                  </div>
                  <div className="co-reach-grid">
                    <div><b>{s.in_industry}</b><span>{t("co.rv.reach_industry", { industry: industryLabel(company.industry, catalog) })}</span></div>
                    <div><b>{s.open_to_work}</b><span>{t("co.rv.reach_open")}</span></div>
                    <div><b>{s.verified}</b><span>{t("co.rv.reach_verified")}</span></div>
                    <div><b>{s.universities}</b><span>{t("co.rv.reach_unis")}</span></div>
                  </div>
                </div>
                {s.top_tracks.length > 0 && (
                  <div className="co-tracks">
                    <div className="hint" style={{ marginBottom: 6 }}>{t("co.rv.top_tracks")}</div>
                    {s.top_tracks.map((tr) => {
                      const max = Math.max(1, ...s.top_tracks.map((x) => x.students));
                      return (
                        <div key={tr.title} className="bar-list-row">
                          <span className="ellipsis">{tr.title}</span>
                          <span className="bar-list-track"><span style={{ width: `${Math.round((100 * tr.students) / max)}%` }} /></span>
                          <span className="num">{tr.students}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!rejected && (
              <div className="co-card">
                <div className="co-card-head">
                  <b>{t("co.rv.prep")}</b>
                  <span className="co-pill">{t("co.rv.prep_n", { n: doneCount, total: PREP.length })}</span>
                </div>
                <div className="co-progress small"><span style={{ width: `${(100 * doneCount) / PREP.length}%` }} /></div>
                <div className="co-prep">
                  {PREP.map((p) => (
                    <div key={p.key} className={`co-prep-row ${done(p.key) ? "done" : ""}`}>
                      <button type="button" className="co-prep-check" aria-pressed={done(p.key)} disabled={p.key === "profile"}
                              onClick={() => togglePrep(p.key)} aria-label={t(`co.rv.prep.${p.key}` as MsgKey)}>
                        <Icon name="tick" size={14} />
                      </button>
                      <span className="co-prep-icon"><Icon name={p.icon} size={18} /></span>
                      <div className="grow">
                        <b>{t(`co.rv.prep.${p.key}` as MsgKey)}</b>
                        <p>{t(`co.rv.prep.${p.key}_hint` as MsgKey)}</p>
                      </div>
                      {p.key === "profile" && !profileReady && <button className="btn small soft" onClick={() => setEditing(true)}>{t("co.rv.add")}</button>}
                      {p.key === "ai" && <button className="btn small soft" onClick={() => { openAi(); if (!prep.includes("ai")) togglePrep("ai"); }}>{t("co.rv.ask_ai")}</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="co-col">
            <div className="co-card">
              <div className="co-company">
                <CompanyMark name={company.name} url={company.logo_url} size={52} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: "block", fontSize: 16 }}>{company.name}</b>
                  <div className="hint">{[industryLabel(company.industry, catalog), company.city].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <div className="co-kv">
                <span>STIR</span><b>{company.stir ?? "—"}</b>
                <span>{t("co.rv.person")}</span><b>{me.full_name}</b>
                <span>{t("p.signup.position")}</span><b>{me.job_title || "—"}</b>
              </div>
              {s && s.documents.filter((d) => d.kind !== "logo").length > 0 && (
                <div className="co-docs">
                  {s.documents.filter((d) => d.kind !== "logo").map((d) => (
                    <button key={d.id} className="file-chip" onClick={() => openLink(absoluteUrl(d.url))}>
                      <span className="file-ext">{(d.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>
                      <span className="file-name">{d.name}</span>
                      <span className="hint">{t(`co.doc.${d.kind}` as MsgKey)}</span>
                    </button>
                  ))}
                </div>
              )}
              {!rejected && <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setEditing(true)}><Icon name="flag" size={16} />{t("co.rv.edit")}</button>}
            </div>

            <div className="co-card co-tip-card">
              <div className="co-tip-icon"><Icon name="spark" size={18} /></div>
              <b>{t("co.rv.did_you_know")}</b>
              <p key={tip} className="co-tip-text">{t(`co.rv.tip.${TIPS[tip]}` as MsgKey)}</p>
              <div className="co-tip-dots">
                {TIPS.map((n, i) => <button key={n} className={i === tip ? "on" : ""} aria-label={String(n)} onClick={() => setTip(i)} />)}
              </div>
            </div>

            <div className="co-card">
              <div className="co-card-head"><b>{t("co.rv.unlock")}</b></div>
              <div className="co-locked">
                {LOCKED.map((l) => (
                  <div key={l.key}>
                    <span className="co-locked-icon"><Icon name={l.icon} size={18} /></span>
                    <div className="grow"><b>{t(`co.rv.lock.${l.key}` as MsgKey)}</b><small>{t(`co.rv.lock.${l.key}_hint` as MsgKey)}</small></div>
                    <Icon name="lock" size={16} className="co-lock" />
                  </div>
                ))}
              </div>
            </div>

            <button className="btn ghost" onClick={async () => onChanged(await api.backToStudent())}>{t("s.pending.as_seeker")}</button>
            <p className="hint" style={{ textAlign: "center" }}>{t("s.pending.cancel_hint")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A document under a magnifying glass while waiting; a document with a mark when it was sent back. */
function ReviewArt({ rejected }: { rejected: boolean }) {
  return (
    <div className="co-hero-art" aria-hidden="true">
      <svg viewBox="0 0 240 200" width="100%" height="100%">
        <circle cx="120" cy="100" r="86" className="art-ring" />
        <circle cx="120" cy="100" r="62" className="art-ring2" />
        <g className="art-doc">
          <rect x="72" y="38" width="96" height="124" rx="12" className="art-paper" />
          <rect x="88" y="58" width="44" height="8" rx="4" className="art-line strong" />
          <rect x="88" y="76" width="64" height="6" rx="3" className="art-line" />
          <rect x="88" y="90" width="58" height="6" rx="3" className="art-line" />
          <rect x="88" y="104" width="64" height="6" rx="3" className="art-line" />
          <rect x="88" y="118" width="40" height="6" rx="3" className="art-line" />
          <rect x="88" y="136" width="30" height="12" rx="6" className="art-stamp" />
        </g>
        {rejected ? (
          <g className="art-badge bad"><circle cx="168" cy="150" r="20" /><path d="M160 142l16 16M176 142l-16 16" /></g>
        ) : (
          <g className="art-lens">
            <circle cx="150" cy="96" r="24" className="art-glass" />
            <path d="M167 113l18 18" className="art-handle" />
          </g>
        )}
        {!rejected && <g className="art-badge ok"><circle cx="70" cy="48" r="14" /><path d="M64 48l4 4 8-8" /></g>}
      </svg>
    </div>
  );
}
