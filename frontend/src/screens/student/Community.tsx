import { useState } from "react";
import type { Me } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import Groups from "../Groups";
import LeaderboardScreen from "../Leaderboard";
import PeersScreen from "../Peers";
import { PageHead } from "../employer/kit";

type View = "groups" | "peers" | "top";

/** "Hamjamiyat" (student panel v2): groups, peers on the same path or goal, and the rating, in the wide layout. */
export default function Community({ me, joinCode, onUnreadChange }: { me: Me; joinCode: string | null; onUnreadChange: () => void }) {
  useLang();
  const [view, setView] = useState<View>("groups");
  const tabs: { id: View; label: string; icon: "chat" | "users" | "trophy" }[] = [
    { id: "groups", label: t("s.community.groups"), icon: "chat" },
    { id: "peers", label: t("s.community.peers"), icon: "users" },
    { id: "top", label: t("s.community.top"), icon: "trophy" },
  ];
  return (
    <div className="co-page st-page st-community">
      <PageHead title={t("nav.student.community")} sub={t("st.com.sub")} />
      <div className="co-tabs">
        {tabs.map((x) => <button key={x.id} className={view === x.id ? "on" : ""} onClick={() => setView(x.id)}><Icon name={x.icon} size={16} />{x.label}</button>)}
      </div>
      {view === "groups" && <div className="st-legacy-left"><Groups joinCode={joinCode} onUnreadChange={onUnreadChange} /></div>}
      {view === "peers" && <div className="st-peers"><PeersScreen me={me} /></div>}
      {view === "top" && <div className="st-legacy-left"><LeaderboardScreen /></div>}
    </div>
  );
}
