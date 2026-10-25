import { useEffect, type ReactNode } from "react";
import type { Me } from "../api";
import { t, useLang } from "../i18n";
import { navigate, usePath } from "../router";
import LangSwitch from "../screens/LangSwitch";
import { backButton, insideTelegram } from "../tg";
import WebLogin from "../screens/WebLogin";
import Home from "./Home";
import { CompaniesPage, CompanyPage } from "./PublicCompanies";
import { JobPage, JobsPage } from "./PublicJobs";
import { RankingPage } from "./PublicRanking";
import { UniversitiesPage, UniversityPage } from "./PublicUniversities";
import { PanelChooser, panelBase, type Panel } from "./panels";

type GetToken = () => Promise<{ token: string; moved_to?: string | null }>;

/** Pages anyone can open: the home page with the three panels, jobs, companies and the sign-in pages. */
export const isPublicPath = (path: string) => /^\/($|vakansiyalar(\/|$)|korxonalar(\/|$)|universitetlar(\/|$)|reyting$|kirish(\/|$))/.test(path);

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
  else if (section === "kirish") {
    page = id === "talaba" || id === "korxona" || id === "universitet"
      ? <WebLogin dev={dev} panel={id as Panel} onSignIn={onSignIn} onDev={onDev} />
      : <PanelChooser />;
  } else page = <Home me={me} />;

  return (
    <div className="pub">
      <header className="pub-header">
        <div className="pub-header-inner">
          <a className="pub-brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            <span className="brand-mark small">T</span>TalantGo
          </a>
          <nav className="pub-nav">
            <NavLink to="/vakansiyalar" active={section === "vakansiyalar"}>{t("pub.nav.jobs")}</NavLink>
            <NavLink to="/korxonalar" active={section === "korxonalar"}>{t("pub.nav.companies")}</NavLink>
            <NavLink to="/universitetlar" active={section === "universitetlar"}>{t("pub.nav.universities")}</NavLink>
            <NavLink to="/reyting" active={section === "reyting"}>{t("pub.nav.ranking")}</NavLink>
          </nav>
          <span className="grow" />
          <LangSwitch />
          {me
            ? <button className="btn small" onClick={() => navigate(panelBase(me))}>{t("pub.nav.my_panel")}</button>
            : section !== "kirish" && <button className="btn small" onClick={() => navigate("/kirish")}>{t("pub.nav.login")}</button>}
        </div>
      </header>
      <main className={section === "kirish" ? "" : "pub-main"}>{page}</main>
      {section !== "kirish" && <footer className="pub-footer">{t("pub.footer")}</footer>}
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <a href={to} className={active ? "on" : ""} onClick={(e) => { e.preventDefault(); navigate(to); }}>{children}</a>
  );
}
