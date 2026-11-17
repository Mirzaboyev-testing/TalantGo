import { useEffect, useState } from "react";
import type { Me } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import Challenges from "../Challenges";
import PathScreen from "../Path";
import ReviewScreen from "../Review";
import { PageHead } from "../employer/kit";

type View = "company" | "weekly" | "review";

/**
 * "Topshiriqlar" (student panel v2): tasks companies give, mentors' challenges, the optional weekly programme of a
 * track and reviewing other students' work, in one place. Mentors get their mentor tools here instead.
 */
export default function TasksHub({ me, onChanged, initial }: { me: Me; onChanged: () => void; initial?: View }) {
  useLang();
  const [view, setView] = useState<View>(initial ?? "company");
  useEffect(() => { if (initial) setView(initial); }, [initial]);

  if (me.role !== "student") return <div className="st-page"><ReviewScreen me={me} onChanged={onChanged} /></div>;

  const tabs: { id: View; label: string; icon: "briefcase" | "path" | "check" }[] = [
    { id: "company", label: t("st.tasks.tab.company"), icon: "briefcase" },
    { id: "weekly", label: t("st.tasks.tab.weekly"), icon: "path" },
    { id: "review", label: t("st.tasks.tab.review"), icon: "check" },
  ];
  return (
    <div className="co-page st-page">
      <PageHead title={t("st.tasks.title")} sub={t("st.tasks.sub")} />
      <div className="co-tabs">
        {tabs.map((x) => (
          <button key={x.id} className={view === x.id ? "on" : ""} onClick={() => setView(x.id)}>
            <Icon name={x.icon} size={16} />{x.label}
          </button>
        ))}
      </div>
      {view === "company" && <div className="st-list-grid"><Challenges /></div>}
      {view === "weekly" && <PathScreen me={me} onChanged={onChanged} />}
      {view === "review" && <div className="st-list-grid"><ReviewScreen me={me} onChanged={onChanged} /></div>}
    </div>
  );
}
