import { useEffect, useState, type ReactNode } from "react";
import { api, type Me, type PublicCompany, type PublicJob, type PublicStats, type SitePartner } from "../api";
import { BRAND } from "../brand";
import { t, type MsgKey } from "../i18n";
import { Icon } from "../icons";
import { navigate } from "../router";
import { BOT_URL, insideTelegram, openLink, TELEGRAM_ON_SITE } from "../tg";
import { PanelArt, UniversityArt } from "./art";
import { PanelCards, panelBase } from "./panels";
import { CompanyTile } from "./PublicCompanies";
import { PublicJobCard } from "./PublicJobs";
import { initials, siteImage, useSiteContent } from "./siteContent";
import "./home.css";

const STEPS: { icon: string; title: MsgKey; text: MsgKey }[] = [
  { icon: "briefcase", title: "pub.how.1.title", text: "pub.how.1.text" },
  { icon: "path", title: "pub.how.2.title", text: "pub.how.2.text" },
  { icon: "verified", title: "pub.how.3.title", text: "pub.how.3.text" },
  { icon: "flag", title: "pub.how.4.title", text: "pub.how.4.text" },
];

const FEATURES: { icon: string; title: MsgKey; text: MsgKey; to: string }[] = [
  { icon: "school", title: "site.feat.skills", text: "site.feat.skills_sub", to: "/kirish/talaba" },
  { icon: "briefcase", title: "site.feat.exp", text: "site.feat.exp_sub", to: "/vakansiyalar" },
  { icon: "trend", title: "site.feat.portfolio", text: "site.feat.portfolio_sub", to: "/kirish/talaba" },
  { icon: "award", title: "site.feat.career", text: "site.feat.career_sub", to: "/korxonalar" },
];

export const go = (to: string) => (e: { preventDefault: () => void }) => { e.preventDefault(); navigate(to); };

export default function Home({ me }: { me: Me | null }) {
  const site = useSiteContent();
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
  const tiles = statTiles(stats).slice(0, 3);
  // a first visit means signing up: the sign-in page opens on «Ro'yxatdan o'tish» (?yangi), not on «Kirish»
  const start = me ? panelBase(me) : "/kirish?yangi=1";

  return (
    <>
      <section className="h-hero">
        <HeroBackdrop />
        <div className="pub-wrap h-hero-grid">
          <div className="h-copy">
            <span className="h-badge"><i />{t("site.hero.badge")}</span>
            <h1 className="h-title">
              <span>{t("site.hero.l1")}</span> <span>{t("site.hero.l2")}</span> <em>{t("site.hero.l3")}</em>
            </h1>
            <p className="h-lead">{t("site.hero.text", { brand: BRAND })}</p>
            <div className="h-actions">
              <a className="btn h-primary" href={start} onClick={go(start)}>
                {me ? t("pub.nav.my_panel") : t("site.hero.start")}<Icon name="arrow" size={18} />
              </a>
              <a className="h-play" href="#how" onClick={(e) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }); }}>
                <span><Icon name="play" size={15} /></span>{t("site.hero.how")}
              </a>
            </div>
            {tiles.length > 0 && (
              <div className="h-stats">
                {tiles.map(([icon, n, label]) => (
                  <div key={label} className="h-stat">
                    <span className="h-stat-ic"><Icon name={icon} size={20} /></span>
                    <div><b>{n.toLocaleString("en-US")}</b><small>{t(label)}</small></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-visual">
            <div className="h-ring" aria-hidden="true" />
            <div className={`h-photo ${site ? "ready" : ""}`}>
              {site && <img src={siteImage(site, "hero")} alt={t("site.hero.photo", { brand: BRAND })} width={515} height={705} />}
            </div>
            <FloatCard className="f1" icon="verified" title={t("site.float.portfolio")} sub={t("site.float.portfolio_sub")} to="/kirish/talaba" />
            <FloatCard className="f2" icon="briefcase" title={t("site.float.jobs")} sub={t("site.float.jobs_sub")} to="/vakansiyalar" />
            <FloatCard className="f3" icon="trend" title={t("site.float.grow")} sub={t("site.float.grow_sub")} to={start} />
          </div>
        </div>
        {site && site.partners.length > 0 && <div className="pub-wrap h-trust-wrap"><TrustStrip partners={site.partners} /></div>}
      </section>

      <section className="pub-wrap h-features">
        {FEATURES.map((f) => (
          <a key={f.title} className="h-feat" href={f.to} onClick={go(f.to)}>
            <span className="h-feat-ic"><Icon name={f.icon} size={24} /></span>
            <span className="h-feat-body"><b>{t(f.title)}</b><small>{t(f.text)}</small></span>
            <span className="h-go"><Icon name="arrow" size={16} /></span>
          </a>
        ))}
      </section>

      {!me && (
        <section className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("pub.panels.title")}</h2>
          <PanelCards />
        </section>
      )}

      <section className="soft-band" id="how">
        <div className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("pub.how.title")}</h2>
          <ol className="steps h-steps">
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
        <div className="h-split">
          <div className="h-media">
            <div className="h-media-photo">{site && <img src={siteImage(site, "students")} alt="" loading="lazy" width={650} height={650} />}</div>
            <div className="h-media-badge">
              <span className="h-stat-ic"><Icon name="verified" size={20} /></span>
              <div><b>{t("site.stu.badge")}</b><small>{t("site.stu.badge_sub")}</small></div>
            </div>
          </div>
          <div className="split-copy">
            <span className="eyebrow">{t("site.stu.eyebrow")}</span>
            <h2>{t("site.stu.title")}</h2>
            <Ticks keys={["site.stu.p1", "site.stu.p2", "site.stu.p3", "site.stu.p4"]} />
            {!me && <div className="btn-row"><a className="btn" href="/kirish/talaba" onClick={go("/kirish/talaba")}>{t("site.stu.cta")}<Icon name="arrow" size={18} /></a></div>}
          </div>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="h-split reverse">
          <div className="h-media art"><div className="h-art-box"><PanelArt panel="korxona" /></div></div>
          <div className="split-copy">
            <span className="eyebrow">{t("site.co.eyebrow")}</span>
            <h2>{t("site.co.title")}</h2>
            <Ticks keys={["site.co.p1", "site.co.p2", "site.co.p3"]} />
            {!me && <div className="btn-row"><a className="btn" href="/kirish/korxona" onClick={go("/kirish/korxona")}>{t("site.co.cta")}<Icon name="arrow" size={18} /></a></div>}
          </div>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="h-split">
          <div className="h-media art"><UniversityArt /></div>
          <div className="split-copy">
            <span className="eyebrow">{t("pub.uni.eyebrow")}</span>
            <h2>{t("pub.uni.title")}</h2>
            <Ticks keys={["pub.uni.point1", "pub.uni.point2", "pub.uni.point3"]} />
            <div className="btn-row">
              <a className="btn" href="/reyting" onClick={go("/reyting")}>{t("pub.uni.ranking")}</a>
              {!me && <a className="btn ghost" href="/kirish/universitet" onClick={go("/kirish/universitet")}>{t("pub.uni.join")}</a>}
            </div>
          </div>
        </div>
      </section>

      {jobs && jobs.length > 0 && (
        <section className="pub-wrap pub-section">
          <div className="h-jobs-head">
            <SectionHead title={t("pub.latest")} to="/vakansiyalar" />
            <form className="pub-search h-search" role="search" aria-label={t("site.jobs.search_title")}
                  onSubmit={(e) => { e.preventDefault(); navigate(`/vakansiyalar${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}>
              <span className="pub-search-ic"><Icon name="search" size={18} /></span>
              <input value={q} maxLength={80} placeholder={t("pub.hero.search")} aria-label={t("pub.hero.search")} onChange={(e) => setQ(e.target.value)} />
              <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
            </form>
          </div>
          <div className="job-grid">{jobs.map((j) => <PublicJobCard key={j.id} job={j} />)}</div>
        </section>
      )}

      {companies && companies.length > 0 && (
        <section className="pub-wrap pub-section">
          <SectionHead title={t("pub.top_companies")} to="/korxonalar" />
          <div className="company-grid">{companies.map((c) => <CompanyTile key={c.id} company={c} />)}</div>
        </section>
      )}

      <section className="pub-wrap pub-section">
        <div className="h-about">
          <div className="h-about-copy">
            <span className="eyebrow">{t("site.about.eyebrow")}</span>
            <h2>{t("site.about.teaser_title")}</h2>
            <p>{t("site.about.teaser_text", { brand: BRAND })}</p>
            <a className="btn ghost" href="/biz-haqimizda" onClick={go("/biz-haqimizda")}>{t("site.about.more")}<Icon name="arrow" size={18} /></a>
          </div>
          <ul className="h-values">
            {([["target", "site.about.mission", "site.about.mission_text"], ["eye", "site.about.vision", "site.about.vision_text"],
               ["scale", "site.about.v1", "site.about.v1_text"], ["users", "site.about.v4", "site.about.v4_text"]] as const).map(([icon, title, text]) => (
              <li key={title}><span className="h-feat-ic small"><Icon name={icon} size={18} /></span><b>{t(title)}</b><small>{t(text)}</small></li>
            ))}
          </ul>
        </div>
      </section>

      {!me && (
        <section className="pub-wrap pub-section">
          <div className="cta-band h-cta">
            <div>
              <h2>{t("pub.cta.title")}</h2>
              <p>{t("pub.cta.text")}</p>
            </div>
            <div className="btn-row">
              <a className="btn light" href="/kirish" onClick={go("/kirish")}>{t("pub.cta.start")}<Icon name="arrow" size={18} /></a>
              {TELEGRAM_ON_SITE && !insideTelegram && (
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

export function statTiles(stats: PublicStats | null) {
  return stats ? ([
    ["school", stats.students, "pub.stats.students"],
    ["briefcase", stats.companies, "pub.stats.companies"],
    ["building", stats.universities, "pub.stats.universities"],
    ["inbox", stats.jobs, "pub.stats.jobs"],
  ] as const).filter(([, n]) => n > 0) : [];
}

function Ticks({ keys }: { keys: MsgKey[] }) {
  return (
    <ul className="tick-list">
      {keys.map((k) => <li key={k}><span><Icon name="tick" size={14} /></span>{t(k)}</li>)}
    </ul>
  );
}

function FloatCard({ className, icon, title, sub, to }: { className: string; icon: string; title: string; sub: string; to: string }) {
  return (
    <a className={`h-float ${className}`} href={to} onClick={go(to)}>
      <span className="h-float-ic"><Icon name={icon} size={20} /></span>
      <span className="h-float-body"><b>{title}</b><small>{sub}</small></span>
      <span className="h-go small"><Icon name="arrow" size={14} /></span>
    </a>
  );
}

/** Soft green sweeps behind the hero, like the brand board. */
function HeroBackdrop() {
  return (
    <svg className="h-backdrop" viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hb-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#22c55e" stopOpacity=".0" />
          <stop offset=".5" stopColor="#22c55e" stopOpacity=".16" />
          <stop offset="1" stopColor="#16a34a" stopOpacity=".05" />
        </linearGradient>
        <linearGradient id="hb-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#4ade80" stopOpacity=".55" />
          <stop offset="1" stopColor="#16a34a" stopOpacity=".0" />
        </linearGradient>
      </defs>
      <path d="M560 760C760 520 1040 300 1440 250V0H1180C1000 160 760 420 560 760Z" fill="url(#hb-a)" />
      <path d="M0 640C180 610 330 660 430 760H0Z" fill="url(#hb-b)" />
      <path d="M1440 560C1330 640 1250 700 1200 760H1440Z" fill="url(#hb-b)" opacity=".7" />
    </svg>
  );
}

/** The moving strip of companies and universities that trust us (managed in admin → Sayt). */
export function TrustStrip({ partners }: { partners: SitePartner[] }) {
  // the strip is the list twice, moving by half its width; a short list is repeated so it never shows a gap
  const base = partners.length >= 6 ? partners : Array.from({ length: Math.ceil(6 / partners.length) }, () => partners).flat();
  const seconds = Math.max(24, base.length * 4);
  return (
    <div className="h-trust">
      <div className="h-trust-label"><b>{t("site.trust.title")}</b><span>{t("site.trust.sub")}</span></div>
      <div className="h-marquee" aria-label={partners.map((p) => p.name).join(", ")}>
        <div className="h-marquee-track" style={{ animationDuration: `${seconds}s` }}>
          {[0, 1].map((copy) => base.map((p, i) => <PartnerLogo key={`${copy}-${i}`} partner={p} hidden={copy === 1 || i >= partners.length} />))}
        </div>
      </div>
    </div>
  );
}

export function PartnerLogo({ partner, hidden }: { partner: SitePartner; hidden?: boolean }) {
  const body: ReactNode = partner.logo_url
    ? <img src={partner.logo_url} alt={hidden ? "" : partner.name} loading="lazy" />
    : <><span className="h-initials">{initials(partner.name, partner.short)}</span><span className="h-pname">{partner.name}</span></>;
  const props = { className: `h-partner ${partner.logo_url ? "" : "text"}`, title: partner.name, "aria-hidden": hidden || undefined };
  return partner.website
    ? <a {...props} href={partner.website} target="_blank" rel="noopener noreferrer" tabIndex={hidden ? -1 : undefined}>{body}</a>
    : <span {...props}>{body}</span>;
}

function SectionHead({ title, to }: { title: ReactNode; to: string }) {
  return (
    <div className="section-head">
      <h2 className="pub-h2">{title}</h2>
      <a href={to} onClick={go(to)}>{t("pub.see_all")} →</a>
    </div>
  );
}
