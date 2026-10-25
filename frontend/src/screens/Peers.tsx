import { useEffect, useState } from "react";
import { api, formatPhone, type Me, type Peer } from "../api";
import { t, useLang } from "../i18n";
import { courseText } from "../labels";
import { openLink } from "../tg";
import { Avatar, ErrorText, message } from "../ui";
import { Icon } from "../icons";

export default function PeersScreen({ me }: { me: Me }) {
  useLang();
  const [goal, setGoal] = useState("");
  const [query, setQuery] = useState("");
  const [peers, setPeers] = useState<Peer[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPeers(null);
    api.peers(query || undefined).then(setPeers, (e) => setError(message(e)));
  }, [query]);

  return (
    <div>
      <h1>{t("s.community.peers")}</h1>
      <p className="hint">
        {query ? t("s.peers.by_goal", { goal: query }) : t("s.peers.by_track", { track: me.track?.title ?? "" })}. {t("s.peers.together")}
      </p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(goal.trim()); }}>
        <input className="grow" value={goal} placeholder={t("s.peers.search_ph")} onChange={(e) => setGoal(e.target.value)} />
        <button className="btn small" type="submit">{t("s.peers.find")}</button>
      </form>
      {me.goals.length > 0 && (
        <div className="chips" style={{ margin: "8px 0 12px" }}>
          <button className={`chip ${query === "" ? "on" : ""}`} onClick={() => { setGoal(""); setQuery(""); }}>{t("s.peers.my_track")}</button>
          {me.goals.map((g) => (
            <button key={g} className={`chip ${query === g ? "on" : ""}`} onClick={() => { setGoal(g); setQuery(g); }}>{g}</button>
          ))}
        </div>
      )}
      <ErrorText error={error} />
      {!peers && !error && <div className="hint">{t("common.loading")}</div>}
      {peers?.length === 0 && <div className="center hint">{t("s.peers.empty")}</div>}
      {peers?.map((p) => (
        <div key={p.id} className="card">
          <div className="row">
            <Avatar name={p.full_name} url={p.photo_url} />
            <div className="grow">
              <b>{p.full_name}</b>
              <div className="hint">
                {[p.track_title?.split(":")[0], courseText(p.course), p.university].filter(Boolean).join(" · ")}
              </div>
              {p.faculty && <div className="hint">{p.faculty}</div>}
            </div>
            {p.username
              ? <button className="btn small" onClick={() => openLink(`https://t.me/${p.username}`)}>{t("s.common.write")}</button>
              : <span className="hint" title={t("s.peers.no_username_title")}>{t("s.peers.no_username")}</span>}
          </div>
          {p.phone && (
            <div className="row" style={{ marginTop: 8 }}><Icon name="phone" size={16} /><a href={`tel:${p.phone}`}>{formatPhone(p.phone)}</a></div>
          )}
          <div className="hint" style={{ marginTop: 8 }}>
            {t("s.common.points", { n: p.points })} · {t("s.peers.verified_n", { n: p.verified_tasks })}
            {p.streak > 0 ? ` · ${t("s.peers.streak", { n: p.streak })}` : ""}
          </div>
          {p.goals.length > 0 && (
            <div className="chips" style={{ marginTop: 6 }}>{p.goals.map((g) => <span key={g} className="chip">{g}</span>)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
