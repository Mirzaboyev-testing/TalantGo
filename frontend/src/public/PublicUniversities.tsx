import { useCallback, useEffect, useState } from "react";
import { api, type PublicUniversity, type UniversityProfile } from "../api";
import { BarList } from "../charts";
import { t, useLang } from "../i18n";
import { Icon } from "../icons";
import { navigate } from "../router";
import { openLink } from "../tg";
import { ErrorText, message } from "../ui";

/** Aggregates only: verified students, placement (jobs and internships), employers, partners, tracks. */
export function UniversityFacts({ u }: { u: UniversityProfile }) {
  useLang();
  return (
    <>
      {u.description && <p style={{ whiteSpace: "pre-line" }}>{u.description}</p>}
      {u.website && (
        <button className="btn small ghost" style={{ marginBottom: 10 }} onClick={() => openLink(u.website)}>
          <Icon name="globe" size={16} />{t("company.website")}
        </button>
      )}
      <div className="stats four">
        <div className="stat"><b>{u.students}</b><span>{t("uni.students")}</span></div>
        <div className="stat"><b>{u.placement_rate == null ? "–" : `${u.placement_rate}%`}</b><span>{t("uni.rate")}</span></div>
        <div className="stat"><b>{u.employed}</b><span>{t("emp.working")}</span></div>
        <div className="stat"><b>{u.interned}</b><span>{t("emp.interned")}</span></div>
      </div>
      {u.placement_rate == null && <p className="hint">{t("uni.no_data")}</p>}
      <div className="grid-2">
        <div className="card">
          <b>{t("uni.top_employers")}</b>
          {u.top_employers.length ? <BarList rows={u.top_employers} /> : <p className="hint" style={{ marginBottom: 0 }}>{t("emp.no_employers")}</p>}
        </div>
        <div className="card">
          <b>{t("uni.tracks")}</b>
          {u.tracks.length ? <BarList rows={u.tracks.map((x) => ({ name: x.title.split(":")[0], count: x.count }))} />
            : <p className="hint" style={{ marginBottom: 0 }}>{t("uni.no_data")}</p>}
        </div>
      </div>
      {u.partners.length > 0 && (
        <div className="card">
          <b>{t("uni.partners")}</b>
          <div className="chips" style={{ marginTop: 8 }}>
            {u.partners.map((c) => (
              <a key={c.id} className="chip" href={`/korxonalar/${c.id}`} onClick={(e) => { e.preventDefault(); navigate(`/korxonalar/${c.id}`); }}>{c.name}</a>
            ))}
          </div>
        </div>
      )}
      <p className="hint">{t("uni.method", { n: u.min_sample })}</p>
    </>
  );
}

export function UniversitiesPage() {
  useLang();
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ items: PublicUniversity[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.public.universities(q.trim()).then(setData, (e) => setError(message(e))), [q]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <h1>{t("pub.nav.universities")}</h1>
      <form className="pub-search" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input value={q} maxLength={80} placeholder={t("uni.search")} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
      </form>
      <ErrorText error={error} />
      {data && <div className="hint" style={{ margin: "12px 0 6px" }}>{t("uni.count", { n: data.total })}</div>}
      {!data && !error && <div className="hint">{t("common.loading")}</div>}
      {data?.items.length === 0 && <div className="card hint">{t("uni.empty")}</div>}
      <div className="job-grid">
        {data?.items.map((u) => (
          <a key={u.id} className="card job-card tap" href={`/universitetlar/${u.id}`}
             onClick={(e) => { e.preventDefault(); navigate(`/universitetlar/${u.id}`); }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span className="avatar company-mark">{u.short_name.slice(0, 2).toUpperCase()}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="job-title">{u.name}</b>
                <div className="hint">{[u.short_name, u.city].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="chip">{t("uni.students_n", { n: u.students })}</span>
              {u.partners > 0 && <span className="chip">{t("uni.partners")}: {u.partners}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function UniversityPage({ id }: { id: number }) {
  const [u, setU] = useState<UniversityProfile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.public.university(id).then(setU, (e) => setError(message(e))); }, [id]);
  if (error) return <ErrorText error={error} />;
  if (!u) return <div className="hint">{t("common.loading")}</div>;
  return (
    <div className="job-page">
      <button className="btn small ghost" onClick={() => navigate("/universitetlar")}><Icon name="back" size={16} />{t("uni.back")}</button>
      <h1 style={{ marginTop: 12 }}>{u.name}</h1>
      <div className="hint" style={{ marginBottom: 10 }}>{[u.short_name, u.city, u.region].filter(Boolean).join(" · ")}</div>
      <UniversityFacts u={u} />
    </div>
  );
}
