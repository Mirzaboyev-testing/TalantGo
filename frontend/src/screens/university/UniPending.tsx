import { useEffect, useState } from "react";
import { api, type Me } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { haptic } from "../../tg";
import { ErrorText, LogoutLink, message } from "../../ui";
import { staffOf } from "./uapi";
import UniSignup from "./UniSignup";
import { CopyField, Panel, UIcon, type UIconName } from "./ukit";
import { BRAND, BrandLogo } from "../../brand";

const TIPS = 6;
const LOCKS: [string, UIconName, string][] = [
  ["dashboard", "home", "blue"], ["students", "school", ""], ["employment", "chart", "violet"], ["partners", "building", "amber"],
  ["opportunities", "briefcase", ""], ["events", "calendar", "blue"], ["messages", "megaphone", "violet"], ["profile", "users", "amber"],
];
const PREP = ["hemis", "companies", "logo", "event"] as const;
const PREP_KEY = "tg_uni_prep";

function readPrep(): string[] {
  try { return JSON.parse(localStorage.getItem(PREP_KEY) ?? "[]"); } catch { return []; }
}

function Confetti() {
  const colors = ["#16a34a", "#2563eb", "#f59e0b", "#e11d48", "#22c55e", "#60a5fa"];
  return (
    <div className="u-confetti" aria-hidden="true">
      {Array.from({ length: 70 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 14) * 0.08}s`,
                            transform: `rotate(${i * 23}deg)` }} />
      ))}
    </div>
  );
}

/**
 * What a university staff member sees between sending the request and getting the panel: a live timeline,
 * what happens at each step, useful things to do meanwhile, and a celebration when the panel opens.
 */
export default function UniPending({ me, onChanged, onLogout }: { me: Me; onChanged: (m: Me) => void; onLogout?: () => void }) {
  useLang();
  const s = staffOf(me);
  const [editing, setEditing] = useState(false);
  const [tip, setTip] = useState(0);
  const [prep, setPrep] = useState<string[]>(readPrep);
  const [opened, setOpened] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const status = me.staff_status;
  const uni = me.staff_university;

  // the decision arrives without a reload; an approval first shows the celebration
  useEffect(() => {
    if (editing || status === "rejected" || opened) return;
    const timer = window.setInterval(() => {
      api.me().then((fresh) => {
        if (fresh.staff_status === "approved") { haptic("success"); setOpened(fresh); }
        else if (fresh.staff_status !== status) onChanged(fresh);
      }, () => {});
    }, 20000);
    return () => window.clearInterval(timer);
  }, [editing, status, opened, onChanged]);

  useEffect(() => { window.scrollTo(0, 0); }, [status, editing]);
  useEffect(() => {
    const timer = window.setInterval(() => setTip((n) => (n + 1) % TIPS), 7000);
    return () => window.clearInterval(timer);
  }, []);

  if (editing) return <UniSignup me={me} onChanged={(m) => { onChanged(m); setEditing(false); }} onBack={() => setEditing(false)} onLogout={onLogout} />;

  if (opened) {
    return (
      <div className="uni-page">
        <Confetti />
        <div className="u-wait-hero green" style={{ maxWidth: 760, margin: "6vh auto 0", textAlign: "center" }}>
          <span className="u-wait-badge"><Icon name="verified" size={16} />{t("u.wait.approved_badge")}</span>
          <h1>{t("u.wait.approved_title", { name: opened.staff_university?.short_name ?? "" })}</h1>
          <p style={{ margin: "0 auto" }}>{t("u.wait.approved_text")}</p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button className="btn light" onClick={() => onChanged(opened)}><UIcon name="rocket" size={18} />{t("u.wait.open_panel")}</button>
          </div>
        </div>
      </div>
    );
  }

  const tone = status === "needs_info" ? "amber" : status === "rejected" ? "red" : "";
  const byLead = Boolean(s?.decided_by_lead);
  const title = status === "needs_info" ? t("u.wait.info_title") : status === "rejected" ? t("u.wait.rejected_title")
    : byLead ? t("u.wait.lead_title") : t("u.wait.title");
  const text = status === "needs_info" ? t("u.wait.info_text") : status === "rejected" ? t("u.wait.rejected_text")
    : byLead ? t("u.wait.lead_text", { lead: s?.leads.join(", ") ?? "" }) : t("u.wait.text");
  const waiting = Math.max(0, (s?.university_students ?? 0) - (s?.university_verified ?? 0));
  const togglePrep = (k: string) => {
    const next = prep.includes(k) ? prep.filter((x) => x !== k) : [...prep, k];
    setPrep(next);
    try { localStorage.setItem(PREP_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const step2 = status === "needs_info" ? "now amber" : status === "rejected" ? "done" : "now";
  const step3 = status === "rejected" ? "x" : "";
  const invite = `${window.location.origin}/kirish/talaba`;

  async function asStudent() {
    try { onChanged(await api.backToStudent()); } catch (e) { setError(message(e)); }
  }

  return (
    <div className="uni-page">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 10, fontWeight: 700, color: "var(--uni-ink)" }}>
          <BrandLogo size={34} /><span className="hint" style={{ fontWeight: 500 }}>· {t("u.wait.crumb")}</span>
        </div>
        <LogoutLink onLogout={onLogout} />
      </div>
      <div>
        <div className="u-wait">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <section className={`u-wait-hero ${tone}`}>
              <div className="u-wait-art"><span className="orbit" /><span className="core"><UIcon name={status === "pending" ? "hourglass" : status === "needs_info" ? "edit" : "close"} size={30} /></span></div>
              <span className="u-wait-badge">
                {status === "pending" ? <span className="u-pulse" /> : <Icon name={status === "needs_info" ? "help" : "close"} size={15} />}
                {status === "pending" ? t("u.wait.badge") : status === "needs_info" ? t("u.wait.badge_info") : t("u.wait.badge_rejected")}
              </span>
              <h1>{title}</h1>
              <p>{text}</p>
              <div className="u-wait-meta">
                <div><b>{uni?.short_name ?? "—"}</b><span>{s?.university_active === false ? t("u.wait.new_uni") : t("s.common.university")}</span></div>
                <div><b>{s?.submitted_at ? formatDateTime(s.submitted_at, false) : "—"}</b><span>{t("u.wait.sent_on")}</span></div>
                <div><b>{byLead ? t("u.wait.eta_lead") : t("u.wait.eta")}</b><span>{t("u.wait.eta_label")}</span></div>
              </div>
              <div className="btn-row">
                <button className="btn light" onClick={() => setEditing(true)}>
                  <UIcon name="edit" size={17} />{status === "pending" ? t("u.wait.edit") : t("u.wait.fix")}
                </button>
                <button className="btn outline-light" onClick={asStudent}>{t("s.pending.as_seeker")}</button>
              </div>
            </section>

            {s?.review_note && status !== "pending" && (
              <div className={`u-note ${status === "rejected" ? "red" : ""}`}>
                <b>{t("u.wait.note_from", { who: s.reviewed_by || BRAND })}</b>{s.review_note}
              </div>
            )}
            <ErrorText error={error} />

            <Panel title={t("u.wait.timeline")} icon="clock">
              <ol className="u-timeline">
                <li className="done"><i><Icon name="tick" size={15} /></i><div><b>{t("u.wait.t1")}</b><span>{t("u.wait.t1_sub")}</span>
                  {s?.submitted_at && <><br /><small>{formatDateTime(s.submitted_at)}</small></>}</div></li>
                <li className={step2}><i>{status === "needs_info" ? <Icon name="help" size={15} /> : status === "rejected" ? <Icon name="tick" size={15} /> : 2}</i>
                  <div><b>{status === "needs_info" ? t("u.wait.t2_info") : t("u.wait.t2")}</b><span>{t("u.wait.t2_sub")}</span>
                    {status === "pending" && <><br /><small>{t("u.wait.in_progress")}</small></>}</div></li>
                <li className={step3}><i>{status === "rejected" ? <Icon name="close" size={15} /> : 3}</i>
                  <div><b>{byLead ? t("u.wait.t3_lead") : t("u.wait.t3")}</b>
                    <span>{byLead ? t("u.wait.t3_lead_sub", { lead: s?.leads[0] ?? "" }) : t("u.wait.t3_sub")}</span></div></li>
                <li><i>4</i><div><b>{t("u.wait.t4")}</b><span>{t("u.wait.t4_sub")}</span></div></li>
              </ol>
            </Panel>

            <Panel title={t("u.wait.what_opens")} icon="lock" sub={t("u.wait.what_opens_sub")}>
              <div className="u-locks">
                {LOCKS.map(([key, icon, tn]) => (
                  <div key={key} className="u-lock">
                    <span className="lk"><Icon name="lock" size={15} /></span>
                    <span className={`u-ic ${tn}`}><UIcon name={icon} size={18} /></span>
                    <b>{t(`u.nav.${key}` as "u.nav.dashboard")}</b>
                    <span>{t(`u.lock.${key}` as "u.lock.dashboard")}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div className="u-tip">
              <span className="u-ic blue" style={{ background: "#fff" }}><UIcon name="spark" size={18} /></span>
              <div className="grow"><b style={{ display: "block", fontSize: 13, marginBottom: 2 }}>{t("u.wait.did_you_know")}</b>
                <p key={tip}>{t(`u.tip.${tip + 1}` as "u.tip.1")}</p></div>
            </div>

            <Panel title={t("u.wait.students_title")} icon="school">
              <div className="row" style={{ gap: 14, alignItems: "center" }}>
                <div className="u-kpi-value" style={{ color: "var(--uni)" }}>{s?.university_students ?? 0}</div>
                <div className="hint" style={{ fontSize: 13.5 }}>
                  {(s?.university_students ?? 0) > 0 ? t("u.wait.students_text", { n: waiting }) : t("u.wait.students_zero")}
                </div>
              </div>
              <label style={{ marginTop: 14 }}>{t("u.wait.invite_label")}</label>
              <CopyField value={invite} />
              <p className="hint" style={{ margin: "6px 0 0" }}>{t("u.wait.invite_hint")}</p>
            </Panel>

            <Panel title={t("u.wait.prep_title")} icon="check" sub={t("u.wait.prep_sub")}>
              <div className="u-check">
                {PREP.map((k) => (
                  <button key={k} className={`u-check-row ${prep.includes(k) ? "done" : ""}`} onClick={() => togglePrep(k)}>
                    <span className="u-tick">{prep.includes(k) && <Icon name="tick" size={13} />}</span>
                    <span className="grow">{t(`u.prep.${k}` as "u.prep.hemis")}</span>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title={t("u.wait.sent_title")} icon="file">
              <dl className="u-dl">
                <dt>{t("s.common.university")}</dt><dd>{uni?.name ?? "—"}</dd>
                <dt>{t("u.su.position")}</dt><dd>{posLabel(me.staff_position)}</dd>
                {s?.department && <><dt>{t("u.su.department")}</dt><dd>{s.department}</dd></>}
                <dt>{t("u.su.phone")}</dt><dd>{me.phone || "—"}</dd>
                {s?.work_email && <><dt>{t("u.su.work_email")}</dt><dd>{s.work_email}</dd></>}
                <dt>{t("u.su.doc")}</dt><dd>{s?.doc ? s.doc.name : "—"}</dd>
              </dl>
              {s && s.cooperation.length > 0 && (
                <div className="u-chipline" style={{ marginTop: 12 }}>
                  {s.cooperation.map((c) => <span key={c} className="u-tag blue">{t(`u.coop.${c}` as "u.coop.job_fair")}</span>)}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A position key in the reader's language, or the text typed by hand. */
export function posLabel(position: string): string {
  const known = ["career_head", "career_staff", "vice_rector", "dean_deputy"];
  return known.includes(position) ? t(`u.pos.${position}` as "u.pos.career_head") : position;
}
