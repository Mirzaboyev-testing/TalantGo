import { useCallback, useEffect, useState } from "react";
import { api, loadCatalog, type Catalog, type CompanyActivity, type Me, type PublicCompany, type PublicJob } from "../api";
import { industryLabel } from "../format";
import { t } from "../i18n";
import { Icon } from "../icons";
import { navigate } from "../router";
import { openLink } from "../tg";
import { ErrorText, message } from "../ui";
import { PublicJobCard } from "./PublicJobs";
import { ReportButton } from "./PublicRanking";

export function CompanyTile({ company }: { company: PublicCompany }) {
  return (
    <a className="card company-tile tap" href={`/korxonalar/${company.id}`}
       onClick={(e) => { e.preventDefault(); navigate(`/korxonalar/${company.id}`); }}>
      <span className="avatar company-mark big">{company.name.slice(0, 1).toUpperCase()}</span>
      <b>{company.name}</b>
      <span className="hint">{industryLabel(company.industry)}</span>
      <span className="chip">{t("pub.open_jobs", { n: company.open_jobs })}</span>
    </a>
  );
}

export function CompaniesPage() {
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [items, setItems] = useState<PublicCompany[] | null>(null);
  const [total, setTotal] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const p: Record<string, string> = { limit: "60" };
    if (q.trim()) p.q = q.trim();
    if (industry) p.industry = industry;
    setItems(null); setError("");
    api.public.companies(p).then((r) => { setItems(r.items); setTotal(r.total); }, (e) => setError(message(e)));
  }, [q, industry]);
  useEffect(() => { void load(); }, [industry]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadCatalog().then(setCatalog, () => {}); }, []);

  return (
    <div>
      <h1>{t("pub.nav.companies")}</h1>
      <form className="pub-search" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input value={q} maxLength={80} placeholder={t("company.search")} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
      </form>
      {catalog && (
        <select className="pub-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">{t("pub.filter.any_industry")}</option>
          {Object.keys(catalog.industries).map((k) => <option key={k} value={k}>{industryLabel(k)}</option>)}
        </select>
      )}
      <ErrorText error={error} />
      {items && <div className="hint" style={{ margin: "12px 0 6px" }}>{t("company.count", { n: total })}</div>}
      {!items && !error && <div className="hint">{t("common.loading")}</div>}
      {items?.length === 0 && <div className="card hint">{t("company.empty")}</div>}
      <div className="company-grid">{items?.map((c) => <CompanyTile key={c.id} company={c} />)}</div>
    </div>
  );
}

export function CompanyPage({ id, me }: { id: number; me: Me | null }) {
  const [company, setCompany] = useState<(PublicCompany & { jobs: PublicJob[]; activity: CompanyActivity }) | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.public.company(id).then(setCompany, (e) => setError(message(e))); }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!company) return <div className="hint">{t("common.loading")}</div>;
  return (
    <div>
      <button className="btn small ghost" onClick={() => navigate("/korxonalar")}><Icon name="back" size={16} />{t("company.back")}</button>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <span className="avatar company-mark big">{company.name.slice(0, 1).toUpperCase()}</span>
          <div className="grow">
            <h1 style={{ margin: "0 0 4px" }}>{company.name}</h1>
            <div className="hint">{[industryLabel(company.industry), company.city].filter(Boolean).join(" · ")}</div>
            <div className="hint" style={{ marginTop: 2 }}><Icon name="verified" size={14} /> {t("job.verified_company")}</div>
          </div>
        </div>
        {company.description && <p style={{ whiteSpace: "pre-line" }}>{company.description}</p>}
        {company.website && (
          <button className="btn small ghost" onClick={() => openLink(company.website.startsWith("http") ? company.website : `https://${company.website}`)}>
            <Icon name="globe" size={16} />{t("company.website")}
          </button>
        )}
      </div>
      <div className="card">
        <b>{t("activity.title")}</b>
        <div className="stats" style={{ marginTop: 10, marginBottom: 0 }}>
          <div className="stat">
            <b>{company.activity.answer_rate == null ? "–" : `${company.activity.answer_rate}%`}</b>
            <span>{company.activity.answer_rate == null ? t("activity.not_enough", { n: company.activity.min_applications }) : t("activity.answer_rate")}</span>
          </div>
          <div className="stat"><b>{company.activity.hires}</b><span>{t("activity.hires")}</span></div>
          <div className="stat"><b>{company.activity.tasks}</b><span>{t("activity.tasks")}</span></div>
        </div>
      </div>
      <h2 className="pub-h2">{t("company.jobs")}</h2>
      {company.jobs.length === 0 && <div className="card hint">{t("company.no_jobs")}</div>}
      <div className="job-grid">{company.jobs.map((j) => <PublicJobCard key={j.id} job={j} />)}</div>
      <p style={{ marginTop: 16 }}><ReportButton me={me} kind="company" id={company.id} /></p>
    </div>
  );
}
