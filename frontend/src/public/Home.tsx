import { useEffect, useState, type ReactNode } from "react";
import { api, type Me, type PublicCompany, type PublicJob, type PublicStats } from "../api";
import { t, type MsgKey } from "../i18n";
import { Icon } from "../icons";
import { navigate } from "../router";
import { BOT_URL, insideTelegram, openLink } from "../tg";
import { HeroArt, UniversityArt } from "./art";
import { PanelCards } from "./panels";
import { CompanyTile } from "./PublicCompanies";
import { PublicJobCard } from "./PublicJobs";

const STEPS: { icon: string; title: MsgKey; text: MsgKey }[] = [
  { icon: "briefcase", title: "pub.how.1.title", text: "pub.how.1.text" },
  { icon: "path", title: "pub.how.2.title", text: "pub.how.2.text" },
  { icon: "verified", title: "pub.how.3.title", text: "pub.how.3.text" },
  { icon: "flag", title: "pub.how.4.title", text: "pub.how.4.text" },
];

export default function Home({ me }: { me: Me | null }) {
  const [q, setQ] = useState("");
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [companies, setCompanies] = useState<PublicCompany[] | null>(null);

  useEffect(() => {
    api.public.stats().then(setStats, () => {});
    api.public.jobs({ limit: "6" }).then((r) => setJobs(r.items), () => setJobs([]));
    api.public.companies({ limit: "6" }).then((r) => setCompanies(r.items), () => setCompanies([]));
  }, []);

  // a zero next to a label reads as "nothing here yet"; such numbers are left out
  const tiles = stats ? ([
    ["building", stats.universities, "pub.stats.universities"],
    ["school", stats.students, "pub.stats.students"],
    ["briefcase", stats.companies, "pub.stats.companies"],
    ["inbox", stats.jobs, "pub.stats.jobs"],
  ] as const).filter(([, n]) => n > 0) : [];

  return (
    <>
      <section className="hero-band">
        <div className="pub-wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">{t("pub.hero.badge")}</span>
            <h1>{t("pub.hero.title")}</h1>
            <p>{t("pub.hero.text")}</p>
            <form className="pub-search big" onSubmit={(e) => { e.preventDefault(); navigate(`/vakansiyalar${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}>
              <span className="pub-search-ic"><Icon name="search" size={18} /></span>
              <input value={q} maxLength={80} placeholder={t("pub.hero.search")} onChange={(e) => setQ(e.target.value)} />
              <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
            </form>
            <ul className="hero-points">
              {(["pub.hero.point1", "pub.hero.point2", "pub.hero.point3"] as const).map((k) => (
                <li key={k}><span><Icon name="tick" size={13} /></span>{t(k)}</li>
              ))}
            </ul>
          </div>
          <HeroArt />
        </div>
      </section>

      {tiles.length > 0 && (
        <div className="pub-wrap">
          <section className="stat-strip">
            {tiles.map(([icon, n, label]) => (
              <div key={label} className="stat-item">
                <span className="stat-ic"><Icon name={icon} size={20} /></span>
                <div><b>{n.toLocaleString("en-US")}</b><span>{t(label)}</span></div>
              </div>
            ))}
          </section>
        </div>
      )}

      {!me && (
        <section className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("pub.panels.title")}</h2>
          <PanelCards />
        </section>
      )}

      <section className="soft-band">
        <div className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("pub.how.title")}</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step-ic"><Icon name={s.icon} size={22} /><i>{i + 1}</i></span>
                <b>{t(s.title)}</b>
                <p className="hint">{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="split">
          <UniversityArt />
          <div className="split-copy">
            <span className="eyebrow">{t("pub.uni.eyebrow")}</span>
            <h2>{t("pub.uni.title")}</h2>
            <ul className="tick-list">
              {(["pub.uni.point1", "pub.uni.point2", "pub.uni.point3"] as const).map((k) => (
                <li key={k}><span><Icon name="tick" size={14} /></span>{t(k)}</li>
              ))}
            </ul>
            <div className="btn-row">
              <button className="btn" onClick={() => navigate("/reyting")}>{t("pub.uni.ranking")}</button>
              {!me && <button className="btn ghost" onClick={() => navigate("/kirish/universitet")}>{t("pub.uni.join")}</button>}
            </div>
          </div>
        </div>
      </section>

      {jobs && jobs.length > 0 && (
        <section className="pub-wrap pub-section">
          <SectionHead title={t("pub.latest")} to="/vakansiyalar" />
          <div className="job-grid">{jobs.map((j) => <PublicJobCard key={j.id} job={j} />)}</div>
        </section>
      )}

      {companies && companies.length > 0 && (
        <section className="pub-wrap pub-section">
          <SectionHead title={t("pub.top_companies")} to="/korxonalar" />
          <div className="company-grid">{companies.map((c) => <CompanyTile key={c.id} company={c} />)}</div>
        </section>
      )}

      {!me && (
        <section className="pub-wrap pub-section">
          <div className="cta-band">
            <div>
              <h2>{t("pub.cta.title")}</h2>
              <p>{t("pub.cta.text")}</p>
            </div>
            <div className="btn-row">
              <button className="btn light" onClick={() => navigate("/kirish")}>{t("pub.cta.start")}</button>
              {!insideTelegram && (
                <a className="btn outline-light" href={BOT_URL} onClick={(e) => { e.preventDefault(); openLink(BOT_URL); }}>
                  <Icon name="send" size={18} />{t("pub.cta.telegram")}
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function SectionHead({ title, to }: { title: ReactNode; to: string }) {
  return (
    <div className="section-head">
      <h2 className="pub-h2">{title}</h2>
      <a href={to} onClick={(e) => { e.preventDefault(); navigate(to); }}>{t("pub.see_all")} →</a>
    </div>
  );
}
