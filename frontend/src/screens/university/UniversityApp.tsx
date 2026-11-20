import { useCallback, useEffect, useState } from "react";
import type { Me } from "../../api";
import { t, useLang } from "../../i18n";
import { navigate, useRouteTab, useSearch } from "../../router";
import Shell, { type ShellTab } from "../Shell";
import { uapi, type Dashboard } from "./uapi";
import UniDashboard from "./UniDashboard";
import UniStudents from "./UniStudents";
import UniEmployment from "./UniEmployment";
import UniPartners from "./UniPartners";
import UniOpportunities from "./UniOpportunities";
import CompetitionManager from "../competitions/CompetitionManager";
import { competitionsApi } from "../../competitionsApi";
import { Tabs } from "./ukit";
import UniEvents from "./UniEvents";
import UniMessages from "./UniMessages";
import UniProfile from "./UniProfile";
import { posLabel } from "./UniPending";
import "./uni.css";

export type Tab = "dashboard" | "students" | "employment" | "partners" | "opportunities" | "events" | "messages" | "profile";
const ROUTES: Record<Tab, string> = {
  dashboard: "", students: "talabalar", employment: "bandlik", partners: "hamkorlar", opportunities: "imkoniyatlar",
  events: "tadbirlar", messages: "xabarlar", profile: "profil",
};
// older links keep working: the verification queue now lives in Students, groups in Messages
const ALIASES: Record<string, Tab> = { tasdiqlash: "students", guruhlar: "messages", hisobotlar: "employment", lenta: "messages", postlar: "messages",
                                       musobaqalar: "opportunities" };
const ALIAS_SUB: Record<string, string> = { tasdiqlash: "queue", guruhlar: "groups", hisobotlar: "reports", lenta: "feed", postlar: "feed",
                                            musobaqalar: "competitions" };

/** Opens a section, optionally on one of its tabs (?tab=...). */
export type Go = (tab: Tab, sub?: string) => void;

export default function UniversityApp({ me, onMe, onLogout }: { me: Me; onMe: (m: Me) => void; onLogout: () => void }) {
  useLang();
  const [tab, , segment] = useRouteTab<Tab>("/universitet", ROUTES, "dashboard", ALIASES);
  const search = useSearch();
  const sub = search.tab ?? ALIAS_SUB[segment] ?? "";
  const [counts, setCounts] = useState<Dashboard["todo"] | null>(null);

  const go: Go = useCallback((next, subTab) => {
    navigate(`/universitet${ROUTES[next] ? `/${ROUTES[next]}` : ""}${subTab ? `?tab=${encodeURIComponent(subTab)}` : ""}`);
  }, []);
  const refreshCounts = useCallback(() => { uapi.dashboard().then((d) => setCounts(d.todo), () => {}); }, []);
  useEffect(() => {
    refreshCounts();
    const timer = window.setInterval(refreshCounts, 120_000);
    return () => window.clearInterval(timer);
  }, [refreshCounts]);

  const g = (k: string) => t(`u.group.${k}` as "u.group.students");
  const tabs: ShellTab<Tab>[] = [
    { id: "dashboard", icon: "home", label: t("u.nav.dashboard"), group: g("main") },
    { id: "students", icon: "school", label: t("u.nav.students"), group: g("students"), badge: counts?.pending_verification || undefined },
    { id: "employment", icon: "chart", label: t("u.nav.employment"), group: g("students"), badge: counts?.outcomes_to_confirm || undefined },
    { id: "partners", icon: "building", label: t("u.nav.partners"), group: g("companies"), badge: counts?.partner_requests || undefined },
    { id: "opportunities", icon: "briefcase", label: t("u.nav.opportunities"), group: g("companies") },
    { id: "events", icon: "flag", label: t("u.nav.events"), group: g("companies") },
    { id: "messages", icon: "chat", label: t("u.nav.messages"), group: g("university") },
    { id: "profile", icon: "users", label: t("u.nav.profile"), group: g("university"), badge: counts?.team_requests || undefined },
  ];
  const subtitle = [me.staff_university?.short_name, posLabel(me.staff_position)].filter(Boolean).join(" · ");

  return (
    <Shell tabs={tabs} active={tab} onChange={(next) => go(next)} onLogout={onLogout} wide
           user={{ name: me.full_name, photo: me.photo_url, subtitle, verified: true }}>
      <div className="uni-page" key={tab}>
        {tab === "dashboard" && <UniDashboard me={me} go={go} />}
        {tab === "students" && <UniStudents sub={sub} go={go} onChanged={refreshCounts} />}
        {tab === "employment" && <UniEmployment sub={sub} go={go} onChanged={refreshCounts} />}
        {tab === "partners" && <UniPartners sub={sub} go={go} onChanged={refreshCounts} />}
        {/* Imkoniyatlar: companies' vacancies and the university's own competitions (docs/13-musobaqalar.md);
            /universitet/musobaqalar?c=<id> (organizer notices) opens a competition */}
        {tab === "opportunities" && (
          <>
            <Tabs value={sub === "competitions" ? "competitions" : "jobs"} onChange={(v) => go("opportunities", v === "jobs" ? undefined : v)}
                  items={[{ id: "jobs", label: t("corg.uni_jobs") }, { id: "competitions", label: t("corg.title") }]} />
            {sub === "competitions" ? <CompetitionManager api={competitionsApi.organizer} kind="university" me={me} /> : <UniOpportunities />}
          </>
        )}
        {tab === "events" && <UniEvents sub={sub} go={go} />}
        {tab === "messages" && <UniMessages me={me} sub={sub} go={go} />}
        {tab === "profile" && <UniProfile me={me} sub={sub} go={go} onChanged={refreshCounts} onMe={onMe} />}
      </div>
    </Shell>
  );
}
