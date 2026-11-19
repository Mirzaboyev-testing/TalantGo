import { useCallback, useEffect, useState } from "react";
import { api, type PublicUniversity, type UniversityProfile } from "../api";
import { BarList } from "../charts";
import { BRAND } from "../brand";
import { t, useLang, type MsgKey } from "../i18n";
import { Icon } from "../icons";
import { navigate } from "../router";
import { openLink } from "../tg";
import { ErrorText, message } from "../ui";
import { NewsCard } from "../screens/NewsCard";
import "./universities.css";

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
      <UniversityAbout u={u} />
      {u.news && u.news.length > 0 && (
        <section className="uni-news">
          <h2 className="pub-h2">{t("news.public_title")}</h2>
          <div className="nw-grid">{u.news.map((n) => <NewsCard key={n.id} item={n} showUniversity={false} />)}</div>
        </section>
      )}
      <div className="stats four">
        <div className="stat"><b>{u.students}</b><span>{t("uni.students")}</span></div>
        <div className="stat"><b>{u.placement_rate == null ? "–" : `${u.placement_rate}%`}</b><span>{t("uni.rate")}</span></div>
        <div className="stat"><b>{u.employed ?? "–"}</b><span>{t("emp.working")}</span></div>
        <div className="stat"><b>{u.interned ?? "–"}</b><span>{t("emp.interned")}</span></div>
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

const tgLink = (v: string) => (v.startsWith("https://") ? v : v.startsWith("@") ? `https://t.me/${v.slice(1)}` : "");

/** What the university filled in on its profile: year, size, what it offers companies, its office contacts. */
function UniversityAbout({ u }: { u: UniversityProfile }) {
  useLang();
  const facts = [u.founded_year && t("uni.founded", { year: u.founded_year }), u.students_total && t("uni.students_total", { n: u.students_total }),
                 u.faculties_count ? t("uni.faculties_n", { n: u.faculties_count }) : ""].filter(Boolean) as string[];
  const contacts = [u.telegram, u.email, u.phone, u.address].some(Boolean);
  if (!facts.length && !u.cooperation?.length && !contacts) return null;
  return (
    <div className="uni-about">
      {facts.length > 0 && <div className="chips">{facts.map((f) => <span key={f} className="chip">{f}</span>)}</div>}
      {(u.cooperation?.length ?? 0) > 0 && (
        <div className="card">
          <b>{t("uni.cooperation")}</b>
          <div className="chips" style={{ marginTop: 8 }}>
            {u.cooperation!.map((c) => <span key={c} className="chip on"><Icon name="check" size={13} />{t(`u.coop.${c}` as MsgKey)}</span>)}
          </div>
        </div>
      )}
      {contacts && (
        <div className="card uni-contacts">
          <b>{t("uni.contacts")}</b>
          {u.telegram && <div><Icon name="send" size={15} />{tgLink(u.telegram) ? <a href={tgLink(u.telegram)} target="_blank" rel="noreferrer">{u.telegram}</a> : u.telegram}</div>}
          {u.email && <div><Icon name="mail" size={15} /><a href={`mailto:${u.email}`}>{u.email}</a></div>}
          {u.phone && <div><Icon name="phone" size={15} /><a href={`tel:${u.phone.replace(/\s/g, "")}`}>{u.phone}</a></div>}
          {u.address && <div><Icon name="pin" size={15} /><span>{u.address}</span></div>}
        </div>
      )}
    </div>
  );
}

/** The university's mark: its logo when it uploaded one, otherwise its short name. */
export function UniversityMark({ u, size = 44 }: { u: { short_name: string; logo_url?: string | null }; size?: number }) {
  return u.logo_url
    ? <img className="uni-mark img" src={u.logo_url} alt="" style={{ width: size, height: size }} />
    : <span className="uni-mark" style={{ width: size, height: size }}>{u.short_name.slice(0, 4)}</span>;
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
      <p className="hint" style={{ margin: "-6px 0 14px" }}>{t("site.uni.sub", { brand: BRAND })}</p>
      <form className="pub-search" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input value={q} maxLength={80} placeholder={t("uni.search")} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
      </form>
      <ErrorText error={error} />
      {data && <div className="hint" style={{ margin: "12px 0 6px" }}>{t("uni.count", { n: data.total })}</div>}
      {!data && !error && <div className="hint">{t("common.loading")}</div>}
      {data?.items.length === 0 && (q.trim()
        ? <div className="card hint">{t("uni.empty")}</div>
        : (
          <div className="card uni-none">
            <span className="h-feat-ic"><Icon name="building" size={24} /></span>
            <b>{t("site.uni.empty")}</b>
            <p className="hint">{t("site.uni.empty_sub")}</p>
            <a className="btn" href="/kirish/universitet" onClick={(e) => { e.preventDefault(); navigate("/kirish/universitet"); }}>{t("pub.uni.join")}</a>
          </div>
        ))}
      <div className="job-grid">
        {data?.items.map((u) => (
          <a key={u.id} className="card job-card tap" href={`/universitetlar/${u.id}`}
             onClick={(e) => { e.preventDefault(); navigate(`/universitetlar/${u.id}`); }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <UniversityMark u={u} size={40} />
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
      <div className="row uni-page-head" style={{ marginTop: 12, alignItems: "center" }}>
        <UniversityMark u={u} size={56} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{u.name}</h1>
          <div className="hint">{[u.short_name, u.city, u.region].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <UniversityFacts u={u} />
    </div>
  );
}
