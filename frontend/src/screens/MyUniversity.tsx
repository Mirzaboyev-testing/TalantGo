import { useCallback, useEffect, useState } from "react";
import { api, type EventItem, type Job, type Me, type MyOutcome, type NewsItem, type UniversityProfile } from "../api";
import { BarList } from "../charts";
import { t, useLang } from "../i18n";
import { Icon } from "../icons";
import { navigate } from "../router";
import { PublicJobCard } from "../public/PublicJobs";
import { openLink } from "../tg";
import { ErrorText, message } from "../ui";
import { PageHead, StatTile } from "./employer/kit";
import { EventCard } from "./student/Events";
import { NewsCard } from "./NewsCard";

type Data = { university: UniversityProfile | null; verified?: boolean; recommended: (Job & { note: string })[]; outcomes: MyOutcome[] };
type Feed = { announcements: NewsItem[]; events: EventItem[] };

/** "Universitetim" (student panel v2): the university's page for its own student — what it recommends, its news
 *  and events, how its students get placed. The student's own jobs moved to the profile ("Tajriba"). */
export default function MyUniversity({ me }: { me: Me }) {
  useLang();
  const [data, setData] = useState<Data | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api.myUniversity().then(setData, (e) => setError(message(e)));
    api.universityFeed().then(setFeed, () => setFeed({ announcements: [], events: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <div className="co-page"><div className="st-skeleton-grid"><span /><span /><span /></div></div>;
  const u = data.university;
  if (!u) {
    return (
      <div className="co-page st-page">
        <PageHead title={t("nav.student.university")} />
        <div className="st-empty"><Icon name="school" size={28} /><b>{t("my.no_university")}</b>
          <button className="btn small" onClick={() => navigate("/talaba/profil")}>{t("job.open_profile")}</button></div>
      </div>
    );
  }
  const verified = me.verification === "verified";
  return (
    <div className="co-page st-page">
      <section className="st-uni-hero">
        <span className="st-uni-logo">{u.short_name.slice(0, 4)}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <span className="st-hero-eyebrow"><Icon name="school" size={14} />{t("st.uni.eyebrow")}</span>
          <h1>{u.name}</h1>
          <p>{[u.city, u.region].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="st-uni-actions">
          <span className={`st-uni-verify ${verified ? "on" : ""}`}>
            <Icon name={verified ? "verified" : "lock"} size={15} />{verified ? t("st.uni.verified") : me.verification === "pending" ? t("st.home.pending") : t("st.uni.not_verified")}
          </span>
          {u.website && <button className="st-glass" onClick={() => openLink(u.website)}><Icon name="globe" size={15} />{t("company.website")}</button>}
        </div>
      </section>

      <div className="co-stats">
        <StatTile icon="users" label={t("uni.students")} value={u.students} />
        <StatTile icon="chart" tone="blue" label={t("uni.rate")} value={u.placement_rate == null ? "–" : `${u.placement_rate}%`}
                  sub={u.placement_rate == null ? t("uni.no_data") : undefined} />
        <StatTile icon="briefcase" tone="violet" label={t("emp.working")} value={u.employed ?? "–"} />
        <StatTile icon="school" tone="amber" label={t("emp.interned")} value={u.interned ?? "–"} />
      </div>

      <div className="co-dash-grid">
        <div className="co-col">
          {!verified && (
            <div className="co-card st-next">
              <span className="st-next-icon"><Icon name="verified" size={22} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{t("st.uni.verify_title")}</b>
                <p>{t("my.not_verified")}</p>
              </div>
              <button className="btn" onClick={() => navigate("/talaba/profil")}>{t("job.open_profile")}</button>
            </div>
          )}
          <div className="co-card">
            <div className="co-card-head">
              <div><b>{t("my.recommended")}</b><div className="hint">{t("st.uni.recommended_hint")}</div></div>
              <a href="/talaba/vakansiyalar" onClick={(e) => { e.preventDefault(); navigate("/talaba/vakansiyalar"); }}>{t("home.see_all")}</a>
            </div>
            {data.recommended.length === 0 && <div className="st-empty compact"><span className="hint">{t("my.no_recommended")}</span></div>}
            <div className="st-card-grid">
              {data.recommended.map((j) => (
                <div key={j.id} className="st-job">
                  <PublicJobCard job={j} />
                  {j.note && <p className="hint" style={{ margin: "6px 4px 0" }}><Icon name="chat" size={13} /> {j.note}</p>}
                </div>
              ))}
            </div>
          </div>
          <div className="co-card">
            <div className="co-card-head"><b>{t("st.uni.news")}</b></div>
            {feed && feed.announcements.length === 0 && <div className="st-empty compact"><span className="hint">{t("st.uni.no_news")}</span></div>}
            {/* photos, category and the link (an app page opens here, a form in the browser): the same card companies see */}
            <div className="nw-list">
              {feed?.announcements.map((a) => <NewsCard key={a.id} item={a} showUniversity={false} />)}
            </div>
          </div>
          {u.description && (
            <div className="co-card">
              <div className="co-card-head"><b>{t("st.uni.about")}</b></div>
              <p className="st-pre" style={{ marginTop: 0 }}>{u.description}</p>
            </div>
          )}
        </div>

        <div className="co-col">
          <div className="co-card">
            <div className="co-card-head">
              <b>{t("st.uni.events")}</b>
              <a href="/talaba/tadbirlar" onClick={(e) => { e.preventDefault(); navigate("/talaba/tadbirlar"); }}>{t("home.see_all")}</a>
            </div>
            {feed && feed.events.length === 0 && <div className="st-empty compact"><span className="hint">{t("st.uni.no_events")}</span></div>}
            <div className="co-col" style={{ gap: 10 }}>
              {feed?.events.slice(0, 3).map((e) => <EventCard key={e.id} e={{ ...e, organiser: "university", organiser_name: u.short_name }} onChanged={load} />)}
            </div>
          </div>
          <div className="co-card st-uni-card">
            <span className="co-stat-icon"><Icon name="briefcase" size={20} /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{t("st.uni.my_work")}</b>
              <div className="hint">{data.outcomes.length ? t("st.uni.my_work_n", { n: data.outcomes.length }) : t("st.uni.my_work_hint")}</div>
            </div>
            <a href="/talaba/profil" onClick={(e) => { e.preventDefault(); navigate("/talaba/profil"); }} aria-label={t("st.uni.my_work")}><Icon name="arrow" size={18} /></a>
          </div>
          <div className="co-card">
            <div className="co-card-head"><b>{t("uni.top_employers")}</b></div>
            {u.top_employers.length ? <BarList rows={u.top_employers} /> : <p className="hint" style={{ margin: 0 }}>{t("emp.no_employers")}</p>}
          </div>
          {u.partners.length > 0 && (
            <div className="co-card">
              <div className="co-card-head"><b>{t("uni.partners")}</b></div>
              <div className="chips">{u.partners.map((p) => <span key={p.id} className="co-tag"><Icon name="building" size={14} />{p.name}</span>)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
