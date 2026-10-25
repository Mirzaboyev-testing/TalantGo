import { useEffect, useState } from "react";
import { api, type Me, type PublicCompany, type PublicJob, type PublicStats } from "../api";
import { t } from "../i18n";
import { navigate } from "../router";
import { PanelCards } from "./panels";
import { CompanyTile } from "./PublicCompanies";
import { PublicJobCard } from "./PublicJobs";

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

  return (
    <>
      <section className="pub-hero">
        <h1>{t("pub.hero.title")}</h1>
        <p>{t("pub.hero.text")}</p>
        <form className="pub-search" onSubmit={(e) => { e.preventDefault(); navigate(`/vakansiyalar${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}>
          <input value={q} maxLength={80} placeholder={t("pub.hero.search")} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
        </form>
      </section>

      {!me && (
        <section>
          <h2 className="pub-h2">{t("pub.panels.title")}</h2>
          <PanelCards />
        </section>
      )}

      {stats && (
        <section className="stat-tiles">
          <Stat n={stats.jobs} label={t("pub.stats.jobs")} accent />
          <Stat n={stats.companies} label={t("pub.stats.companies")} />
          <Stat n={stats.students} label={t("pub.stats.students")} />
          <Stat n={stats.universities} label={t("pub.stats.universities")} />
        </section>
      )}

      <section>
        <div className="row between">
          <h2 className="pub-h2">{t("pub.latest")}</h2>
          <a href="/vakansiyalar" onClick={(e) => { e.preventDefault(); navigate("/vakansiyalar"); }}>{t("pub.see_all")}</a>
        </div>
        {!jobs && <div className="hint">{t("common.loading")}</div>}
        {jobs?.length === 0 && <div className="card hint">{t("pub.jobs.empty")}</div>}
        <div className="job-grid">{jobs?.map((j) => <PublicJobCard key={j.id} job={j} />)}</div>
      </section>

      {companies && companies.length > 0 && (
        <section>
          <div className="row between">
            <h2 className="pub-h2">{t("pub.top_companies")}</h2>
            <a href="/korxonalar" onClick={(e) => { e.preventDefault(); navigate("/korxonalar"); }}>{t("pub.see_all")}</a>
          </div>
          <div className="company-grid">{companies.map((c) => <CompanyTile key={c.id} company={c} />)}</div>
        </section>
      )}
    </>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className={`stat-tile ${accent ? "accent" : ""}`}>
      <b>{n.toLocaleString("en-US")}</b>
      <span>{label}</span>
    </div>
  );
}
