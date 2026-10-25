import { useEffect, useState } from "react";
import { api, courseLabel, type Me, type StudentDashboard } from "../api";
import { formatDateTime, t, useLang } from "../i18n";
import { Icon } from "../icons";
import { statusBadge, statusLabel } from "../pipeline";
import { navigate } from "../router";
import { PublicJobCard } from "../public/PublicJobs";
import { ErrorText, message } from "../ui";

/** The student's first screen: what to do next, where applications stand, jobs worth a look. */
export default function StudentHome({ me }: { me: Me }) {
  useLang();
  const [d, setD] = useState<StudentDashboard | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api.studentDashboard().then(setD, (e) => setError(message(e))); }, []);

  const study = [me.university_ref?.short_name, me.faculty, me.course ? courseLabel(me.course) : ""].filter(Boolean).join(" · ");
  const pct = me.completeness.percent;
  const notVerified = me.verification === "none" || me.verification === "rejected";

  return (
    <div>
      <div className="card home-hello">
        <h1 style={{ margin: 0 }}>{t("home.greeting", { name: me.full_name.split(" ")[0] })}</h1>
        {study && <div className="hint">{study}</div>}
        <form className="pub-search" style={{ marginTop: 12 }}
              onSubmit={(e) => { e.preventDefault(); navigate(`/vakansiyalar${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}>
          <input value={q} maxLength={80} placeholder={t("home.search")} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" type="submit"><Icon name="search" size={18} /></button>
        </form>
      </div>

      {pct < 100 && (
        <div className="card todo-card">
          <span className="panel-icon"><Icon name="user" /></span>
          <div className="grow">
            <b>{t("home.profile_title", { pct })}</b>
            <div className="hint">{t("home.profile_text")}</div>
          </div>
          <button className="btn small" onClick={() => navigate("/talaba/profil")}>{t("home.fill")}</button>
        </div>
      )}
      {notVerified && (
        <div className="card todo-card">
          <span className="panel-icon"><Icon name="verified" /></span>
          <div className="grow">
            <b>{t("home.verify_title")}</b>
            <div className="hint">{t("home.verify_text")}</div>
          </div>
          <button className="btn small" onClick={() => navigate("/talaba/profil")}>{t("job.open_profile")}</button>
        </div>
      )}

      <div className="stats four">
        <div className="stat"><b>{me.points}</b><span>{t("home.points")}</span></div>
        <div className="stat"><b>{me.streak}</b><span>{t("home.streak")}</span></div>
        <div className="stat"><b>#{me.rank_overall}</b><span>{t("home.rank")}</span></div>
        <div className="stat"><b>{d?.active_applications ?? "–"}</b><span>{t("home.active_apps")}</span></div>
      </div>

      <ErrorText error={error} />
      {d && d.interviews.length > 0 && (
        <div className="card">
          <b>{t("home.interviews")}</b>
          {d.interviews.map((i) => (
            <div key={i.application_id} className="notice" style={{ marginTop: 8 }}>
              <b>{i.job}</b> · {i.company}
              <div>{[formatDateTime(i.at), i.place].filter(Boolean).join(", ")}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="row between">
          <b>{t("home.my_apps")}</b>
          <a href="/talaba/arizalar" onClick={(e) => { e.preventDefault(); navigate("/talaba/arizalar"); }}>{t("home.see_all")}</a>
        </div>
        {!d && !error && <div className="hint">{t("common.loading")}</div>}
        {d?.recent.length === 0 && <p className="hint" style={{ marginBottom: 0 }}>{t("home.no_apps")}</p>}
        {d?.recent.map((a) => (
          <div key={a.id} className="row between list-row">
            <div style={{ minWidth: 0 }}><div className="ellipsis">{a.job}</div><div className="hint">{a.company}</div></div>
            <span className={`badge ${statusBadge(a.status)}`}>{statusLabel(a.status)}</span>
          </div>
        ))}
      </div>

      <div className="row between" style={{ margin: "18px 0 8px" }}>
        <b>{t("home.recommended")}</b>
        {d && d.saved > 0 && (
          <a href="/talaba/saqlangan" onClick={(e) => { e.preventDefault(); navigate("/talaba/saqlangan"); }}>{t("home.saved", { n: d.saved })}</a>
        )}
      </div>
      {d?.recommended.length === 0 && <div className="card hint">{t("home.no_recommended")}</div>}
      <div className="job-grid">{d?.recommended.map((j) => <PublicJobCard key={j.id} job={j} />)}</div>
    </div>
  );
}
