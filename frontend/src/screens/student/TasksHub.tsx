import { useEffect, useState } from "react";
import type { Me } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import TaskBoard from "./TaskBoard";
import StudentTests from "../StudentTests";
import PathScreen from "../Path";
import ReviewScreen from "../Review";
import { PageHead } from "../employer/kit";
import { navigate } from "../../router";

// each view has its own address, so a reload or a shared link opens the same view
const PATH: Record<TasksView, string> = {
  company: "/talaba/topshiriqlar", tests: "/talaba/topshiriqlar/testlar", weekly: "/talaba/yol", review: "/talaba/tekshirish",
};

export type TasksView = "company" | "tests" | "weekly" | "review";
type View = TasksView;

/**
 * "Topshiriqlar" (student panel v2): tasks companies give, mentors' challenges, company tests (moved here from
 * Arizalarim on 2026-11-19: /talaba/topshiriqlar/testlar), the optional weekly programme of a track and reviewing
 * other students' work, in one place. Mentors get their mentor tools here instead.
 */
export default function TasksHub({ me, onChanged, initial }: { me: Me; onChanged: () => void; initial?: View }) {
  useLang();
  const [view, setView] = useState<View>(initial ?? "company");
  useEffect(() => { if (initial) setView(initial); }, [initial]);

  if (me.role !== "student") return <div className="st-page"><ReviewScreen me={me} onChanged={onChanged} /></div>;

  const tabs: { id: View; label: string; icon: "briefcase" | "path" | "check" | "file" }[] = [
    { id: "company", label: t("st.tasks.tab.company"), icon: "briefcase" },
    { id: "tests", label: t("st.tasks.tab.tests"), icon: "file" },
    { id: "weekly", label: t("st.tasks.tab.weekly"), icon: "path" },
    { id: "review", label: t("st.tasks.tab.review"), icon: "check" },
  ];
  return (
    <div className="co-page st-page">
      <PageHead title={t("st.tasks.title")} sub={t("st.tasks.sub")} />
      <div className="co-tabs">
        {tabs.map((x) => (
          <button key={x.id} className={view === x.id ? "on" : ""} onClick={() => { setView(x.id); navigate(PATH[x.id]); }}>
            <Icon name={x.icon} size={16} />{x.label}
          </button>
        ))}
      </div>
      {view === "company" && <TaskBoard />}
      {view === "tests" && <StudentTests />}
      {view === "weekly" && <PathScreen me={me} onChanged={onChanged} />}
      {view === "review" && <div className="st-list-grid"><ReviewScreen me={me} onChanged={onChanged} /></div>}
    </div>
  );
}
