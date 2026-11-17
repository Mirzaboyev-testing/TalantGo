import { useEffect, type ReactNode } from "react";
import type { Me } from "../api";
import { t, useLang } from "../i18n";
import { navigate, usePath } from "../router";
import LangSwitch from "../screens/LangSwitch";
import { backButton, insideTelegram } from "../tg";
import WebLogin from "../screens/WebLogin";
import About from "./About";
import Home from "./Home";
import { contactHref, useSiteContent } from "./siteContent";
import { Icon } from "../icons";
import { CompaniesPage, CompanyPage } from "./PublicCompanies";
import { JobPage, JobsPage } from "./PublicJobs";
import { RankingPage } from "./PublicRanking";
import { UniversitiesPage, UniversityPage } from "./PublicUniversities";
import { PanelChooser, panelBase, type Panel } from "./panels";
import { BRAND, BrandLogo } from "../brand";

type GetToken = () => Promise<{ token: string; moved_to?: string | null }>;

/** Pages anyone can open: the home page with the three panels, jobs, companies and the sign-in pages. */
export const isPublicPath = (path: string) => /^\/($|vakansiyalar(\/|$)|korxonalar(\/|$)|universitetlar(\/|$)|reyting$|biz-haqimizda$|kirish(\/|$))/.test(path);

export default function PublicSite({ me, dev, onSignIn, onDev }: {
  me: Me | null; dev: boolean; onSignIn: (getToken: GetToken) => void; onDev: (id: number, name: string) => void;
}) {
  useLang();
  const path = usePath();
  const [, section, id] = path.split("/");
  // the Mini App has no browser Back button: Telegram's own one goes back (or to the panel)
  useEffect(() => backButton(insideTelegram && me
    ? () => (window.history.length > 1 ? window.history.back() : navigate(panelBase(me)))
    : null), [me]);
  let page: ReactNode;
  if (section === "vakansiyalar") page = id ? <JobPage id={Number(id)} me={me} /> : <JobsPage me={me} />;
  else if (section === "korxonalar") page = id ? <CompanyPage id={Number(id)} me={me} /> : <CompaniesPage />;
  else if (section === "universitetlar") page = id ? <UniversityPage id={Number(id)} /> : <UniversitiesPage />;
  else if (section === "reyting") page = <RankingPage />;
  else if (section === "biz-haqimizda") page = <About me={me} />;
  else if (section === "kirish") {
    page = id === "talaba" || id === "korxona" || id === "universitet"
      ? <WebLogin dev={dev} panel={id as Panel} onSignIn={onSignIn} onDev={onDev} />
      : <PanelChooser />;
  } else page = <Home me={me} />;

  return (
    <div className="pub">
      <header className="pub-header">
        <div className="pub-wrap pub-header-inner">
          <a className="pub-brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            <BrandLogo size={40} />
          </a>
          <nav className="pub-nav">
            <NavLink to="/vakansiyalar" active={section === "vakansiyalar"}>{t("pub.nav.jobs")}</NavLink>
            <NavLink to="/korxonalar" active={section === "korxonalar"}>{t("pub.nav.companies")}</NavLink>
            <NavLink to="/universitetlar" active={section === "universitetlar"}>{t("pub.nav.universities")}</NavLink>
            <NavLink to="/reyting" active={section === "reyting"}>{t("pub.nav.ranking")}</NavLink>
            <NavLink to="/biz-haqimizda" active={section === "biz-haqimizda"}>{t("site.nav.about")}</NavLink>
          </nav>
          <span className="grow" />
          <LangSwitch />
          {me
            ? <button className="btn small" onClick={() => navigate(panelBase(me))}>{t("pub.nav.my_panel")}</button>
            : section !== "kirish" && <button className="btn small" onClick={() => navigate("/kirish")}>{t("pub.nav.login")}<Icon name="arrow" size={16} /></button>}
        </div>
      </header>
      <main className={section === "kirish" ? "" : section && section !== "biz-haqimizda" ? "pub-main" : "pub-home"}>{page}</main>
      {section !== "kirish" && (
        <footer className="pub-footer">
          <div className="pub-wrap pub-footer-inner">
            <div className="pub-footer-about">
              <span className="pub-brand"><BrandLogo size={34} /></span>
              <p>{t("pub.footer")}</p>
            </div>
            <nav className="pub-footer-nav">
              <NavLink to="/vakansiyalar" active={false}>{t("pub.nav.jobs")}</NavLink>
              <NavLink to="/korxonalar" active={false}>{t("pub.nav.companies")}</NavLink>
              <NavLink to="/universitetlar" active={false}>{t("pub.nav.universities")}</NavLink>
              <NavLink to="/reyting" active={false}>{t("pub.nav.ranking")}</NavLink>
              <NavLink to="/biz-haqimizda" active={false}>{t("site.nav.about")}</NavLink>
            </nav>
            <FooterContacts />
            <small>© {new Date().getFullYear()} {BRAND}</small>
          </div>
        </footer>
      )}
    </div>
  );
}

/** Email, phone and social links from admin → Sayt, when set. */
const SOCIAL_ICON = { telegram: "send", instagram: "camera", linkedin: "link", facebook: "link", youtube: "play" } as const;
function FooterContacts() {
  const site = useSiteContent();
  if (!site) return null;
  const direct = (["email", "phone"] as const).filter((f) => site.contacts[f]);
  const social = (Object.keys(SOCIAL_ICON) as (keyof typeof SOCIAL_ICON)[]).filter((f) => site.contacts[f]);
  if (direct.length + social.length === 0) return null;
  return (
    <div className="pub-footer-contacts">
      {direct.map((f) => (
        <a key={f} href={contactHref(f, site.contacts[f] ?? "") ?? undefined}><Icon name={f === "email" ? "mail" : "phone"} size={15} />{site.contacts[f]}</a>
      ))}
      {social.map((f) => {
        const href = contactHref(f, site.contacts[f] ?? "");
        return href && (
          <a key={f} className="social" href={href} target="_blank" rel="noopener noreferrer" aria-label={t(`site.contact.${f}`)} title={t(`site.contact.${f}`)}>
            <Icon name={SOCIAL_ICON[f]} size={15} />
          </a>
        );
      })}
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <a href={to} className={active ? "on" : ""} onClick={(e) => { e.preventDefault(); navigate(to); }}>{children}</a>
  );
}
