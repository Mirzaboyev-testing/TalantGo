import { useEffect, useState } from "react";
import { api, courseLabel, daysLeft, type Challenge, type Me, type StudentDashboard } from "../api";
import { formatDateTime, t, tMaybe, useLang } from "../i18n";
import { Icon, type IconName } from "../icons";
import { statusBadge, statusLabel } from "../pipeline";
import { navigate } from "../router";
import { PublicJobCard } from "../public/PublicJobs";
import { Avatar, ErrorText, message } from "../ui";
import { StatTile } from "./employer/kit";
import { BRAND } from "../brand";

const go = (path: string) => (e?: React.MouseEvent) => { e?.preventDefault(); navigate(path); };
export const missingLabel = (m: string) => tMaybe(`st.missing.${m}`) ?? tMaybe(`s.career.missing.${m}`) ?? m;

/** The one thing worth doing next, with what it gives (research: one next action beats a long checklist). */
function nextStep(me: Me, d: StudentDashboard | null): { icon: IconName; title: string; text: string; cta: string; to: string } | null {
  const basics = ["university", "faculty", "course", "phone"].every((k) => !me.completeness.missing.includes(k));
  if (basics && (me.verification === "none" || me.verification === "rejected")) {
    return { icon: "verified", title: t("st.home.next.verify"), text: t("st.home.next.verify_text"), cta: t("st.home.next.verify_cta"), to: "/talaba/profil" };
  }
  if (me.completeness.missing.some((k) => k !== "verification")) {
    const first = me.completeness.missing.find((k) => k !== "verification")!;
    return { icon: "user", title: t("st.home.next.profile", { item: missingLabel(first).toLowerCase() }), text: t("st.home.next.profile_text"),
             cta: t("home.fill"), to: "/talaba/profil" };
  }
  if (d && Object.keys(d.applications).length === 0) {
    return { icon: "send", title: t("st.home.next.apply"), text: t("st.home.next.apply_text"), cta: t("st.home.next.apply_cta"), to: "/talaba/vakansiyalar" };
  }
  if (!me.track) {
    return { icon: "path", title: t("st.home.next.weekly"), text: t("st.home.next.weekly_text"), cta: t("st.weekly.pick"), to: "/talaba/topshiriqlar" };
  }
  return null;
}

/** The student's first screen: a wide two-column dashboard (main + right rail from 1200px, one column below). */
export default function StudentHome({ me }: { me: Me }) {
  useLang();
  const [d, setD] = useState<StudentDashboard | null>(null);
  const [tasks, setTasks] = useState<Challenge[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api.studentDashboard().then(setD, (e) => setError(message(e)));
    api.challenges.list().then((rows) => setTasks(rows.filter((c) => c.state === "active")
      .sort((a, b) => a.ends_at.localeCompare(b.ends_at))), () => setTasks([]));
  }, []);

  const first = me.full_name.split(" ")[0];
  const study = [me.university_ref?.short_name, me.faculty, me.course ? courseLabel(me.course) : ""].filter(Boolean).join(" · ");
  const step = nextStep(me, d);
  const search = (term: string) => navigate(`/vakansiyalar${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ""}`);

  return (
    <div className="co-page st-home">
      <section className="st-hero">
        <div className="st-hero-text">
          <span className="st-hero-eyebrow"><Icon name="spark" size={15} />{t("st.home.eyebrow")}</span>
          <h1>{t("home.greeting", { name: first })}</h1>
          {study && <p>{study}</p>}
          <form className="st-hero-search" onSubmit={(e) => { e.preventDefault(); search(q); }}>
            <Icon name="search" size={18} />
            <input value={q} maxLength={80} placeholder={t("home.search")} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
          </form>
          <div className="st-hero-chips">
            {(["st.home.chip.internship", "st.home.chip.part_time", "st.home.chip.remote"] as const).map((k) => (
              <button key={k} type="button" onClick={() => search(t(k))}>{t(k)}</button>
            ))}
          </div>
        </div>
        <div className="st-hero-kpis">
          <div><b>{me.points}</b><span>{t("home.points")}</span></div>
          <div><b>{me.streak > 0 && <Icon name="flame" size={18} />}{me.streak}</b><span>{t("home.streak")}</span></div>
          <div><b>#{me.rank_overall}</b><span>{t("home.rank")}</span></div>
        </div>
      </section>

      <ErrorText error={error} />

      <div className="co-dash-grid">
        <div className="co-col">
          {step && (
            <div className="co-card st-next">
              <span className="st-next-icon"><Icon name={step.icon} size={22} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <span className="st-next-eyebrow">{t("st.home.next.eyebrow")}</span>
                <b>{step.title}</b>
                <p>{step.text}</p>
              </div>
              <button className="btn" onClick={go(step.to)}>{step.cta}<Icon name="arrow" size={17} /></button>
            </div>
          )}

          <div className="co-stats">
            <StatTile icon="inbox" label={t("home.active_apps")} value={d?.active_applications ?? "–"} onClick={go("/talaba/arizalar")} />
            <StatTile icon="calendar" tone="blue" label={t("st.home.interviews")} value={d ? d.interviews.length : "–"} onClick={go("/talaba/arizalar")} />
            <StatTile icon="verified" tone="violet" label={t("st.home.verified_work")} value={d?.verified_tasks ?? "–"} onClick={go("/talaba/topshiriqlar")} />
            <StatTile icon="heart" tone="amber" label={t("st.home.saved")} value={d?.saved ?? "–"} onClick={go("/talaba/saqlangan")} />
          </div>

          <div className="co-card">
            <div className="co-card-head">
              <div><b>{t("home.recommended")}</b><div className="hint">{t("st.home.recommended_hint")}</div></div>
              <a href="/talaba/vakansiyalar" onClick={go("/talaba/vakansiyalar")}>{t("st.home.all_jobs", { n: d?.open_jobs ?? 0 })}</a>
            </div>
            {!d && !error && <div className="st-skeleton-grid"><span /><span /><span /></div>}
            {d?.recommended.length === 0 && (
              <div className="st-empty">
                <Icon name="briefcase" size={26} />
                <b>{t("home.no_recommended")}</b>
                <button className="btn small ghost" onClick={go("/talaba/profil")}>{t("st.home.improve_match")}</button>
              </div>
            )}
            <div className="st-card-grid">
              {d?.recommended.map((j) => (
                <div key={j.id} className="st-job">
                  <PublicJobCard job={j} />
                  {j.match >= 50 && <span className="st-match">{t("home.match", { n: j.match })}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="co-card">
            <div className="co-card-head">
              <div><b>{t("st.home.tasks")}</b><div className="hint">{t("st.home.tasks_hint")}</div></div>
              <a href="/talaba/topshiriqlar" onClick={go("/talaba/topshiriqlar")}>{t("home.see_all")}</a>
            </div>
            {!tasks && <div className="st-skeleton-grid"><span /><span /></div>}
            {tasks?.length === 0 && (
              <div className="st-empty">
                <Icon name="target" size={26} />
                <b>{t("st.home.no_tasks")}</b>
                <span className="hint">{t("st.home.no_tasks_hint")}</span>
              </div>
            )}
            <div className="st-card-grid two">
              {tasks?.slice(0, 4).map((c) => {
                const left = daysLeft(c.ends_at);
                return (
                  <button key={c.id} type="button" className="st-task-card" onClick={go("/talaba/topshiriqlar")}>
                    <div className="row between">
                      <span className="st-task-from"><Icon name={c.company ? "building" : "user"} size={14} />{c.company ?? c.mentor ?? BRAND}</span>
                      <span className={`st-deadline ${left <= 2 ? "soon" : ""}`}><Icon name="clock" size={13} />{t("s.ch.days_left", { n: left })}</span>
                    </div>
                    <b>{c.title}</b>
                    <div className="st-task-meta">
                      <span className="co-pill">+{c.points} {t("home.points")}</span>
                      {c.prize && <span className="co-pill warn"><Icon name="trophy" size={13} />{c.prize}</span>}
                      <span className="hint">{t("s.ch.entries_n", { n: c.entries })}</span>
                    </div>
                    {c.my_entry && <span className="st-task-mine">{t("st.home.task_sent")}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="co-col">
          <ProfileCard me={me} />

          {d && d.interviews.length > 0 && (
            <div className="co-card co-card-accent">
              <div className="co-card-head"><b>{t("home.interviews")}</b></div>
              {d.interviews.map((i) => (
                <div key={i.application_id} className="st-interview">
                  <span className="co-stat-icon" style={{ background: "#e8f1fc", color: "#2a78d6" }}><Icon name="calendar" size={18} /></span>
                  <div style={{ minWidth: 0 }}>
                    <b className="ellipsis">{i.job}</b>
                    <div className="hint">{i.company}</div>
                    <div className="hint">{[formatDateTime(i.at), i.place].filter(Boolean).join(", ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="co-card">
            <div className="co-card-head">
              <b>{t("home.my_apps")}</b>
              <a href="/talaba/arizalar" onClick={go("/talaba/arizalar")}>{t("home.see_all")}</a>
            </div>
            {!d && !error && <div className="hint">{t("common.loading")}</div>}
            {d?.recent.length === 0 && (
              <div className="st-empty compact">
                <span className="hint">{t("home.no_apps")}</span>
                <button className="btn small ghost" onClick={go("/talaba/vakansiyalar")}>{t("st.home.next.apply_cta")}</button>
              </div>
            )}
            {d?.recent.map((a) => (
              <div key={a.id} className="row between list-row">
                <div style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 600 }}>{a.job}</div><div className="hint">{a.company}</div></div>
                <span className={`badge ${statusBadge(a.status)}`}>{statusLabel(a.status)}</span>
              </div>
            ))}
          </div>

          <div className="co-card st-uni-card">
            <span className="co-stat-icon"><Icon name="school" size={20} /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="ellipsis">{me.university_ref?.name ?? t("nav.student.university")}</b>
              <div className="hint">{t("st.home.uni_hint")}</div>
            </div>
            <a href="/talaba/universitetim" onClick={go("/talaba/universitetim")} aria-label={t("nav.student.university")}><Icon name="arrow" size={18} /></a>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The right-rail profile card: photo, headline, profile strength and the first missing items. */
function ProfileCard({ me }: { me: Me }) {
  useLang();
  const pct = me.completeness.percent;
  const r = 26, c = 2 * Math.PI * r;
  const verified = me.verification === "verified";
  return (
    <div className="co-card st-profile-card">
      <div className="st-profile-top">
        <Avatar name={me.full_name} url={me.photo_url} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis st-profile-name">{me.full_name}{verified && <span className="side-verified"><Icon name="verified" size={16} /></span>}</b>
          <div className="hint ellipsis">{me.headline || me.faculty || t("st.home.no_headline")}</div>
        </div>
        <span className="st-ring" title={t("st.home.strength")}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} className="st-ring-track" />
            <circle cx="32" cy="32" r={r} className="st-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
          </svg>
          <b>{pct}%</b>
        </span>
      </div>
      <div className="st-profile-status">
        <span className={`co-pill ${verified ? "" : "warn"}`}>
          {verified ? t("st.home.verified_by", { name: me.verified_by }) : me.verification === "pending" ? t("st.home.pending") : t("st.home.not_verified")}
        </span>
        {me.open_to_work && <span className="co-pill">{t("st.home.open_to_work")}</span>}
      </div>
      {me.completeness.missing.length > 0 && (
        <ul className="st-checklist">
          {me.completeness.missing.slice(0, 4).map((m) => (
            <li key={m}><span /><a href="/talaba/profil" onClick={go("/talaba/profil")}>{missingLabel(m)}</a></li>
          ))}
        </ul>
      )}
      <button className="btn ghost small" onClick={go("/talaba/profil")}>{pct < 100 ? t("st.home.complete_profile") : t("st.home.open_profile")}</button>
    </div>
  );
}
