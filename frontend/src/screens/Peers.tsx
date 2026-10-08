import { useEffect, useState } from "react";
import { api, courseLabel, formatPhone, type Me, type Peer } from "../api";
import { openLink } from "../tg";
import { Avatar, ErrorText, message } from "../ui";
import { Icon } from "../icons";

export default function PeersScreen({ me }: { me: Me }) {
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
      <h1>Tengdoshlar</h1>
      <p className="hint">
        {query ? `«${query}» maqsadidagi talabalar` : `${me.track?.title} yo'lidagi talabalar`}. Birga o'qing, bir-biringizni tekshiring.
      </p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(goal.trim()); }}>
        <input className="grow" value={goal} placeholder="Maqsad bo'yicha qidirish: SQL, Power BI…" onChange={(e) => setGoal(e.target.value)} />
        <button className="btn small" type="submit">Topish</button>
      </form>
      {me.goals.length > 0 && (
        <div className="chips" style={{ margin: "8px 0 12px" }}>
          <button className={`chip ${query === "" ? "on" : ""}`} onClick={() => { setGoal(""); setQuery(""); }}>Mening yo'lim</button>
          {me.goals.map((g) => (
            <button key={g} className={`chip ${query === g ? "on" : ""}`} onClick={() => { setGoal(g); setQuery(g); }}>{g}</button>
          ))}
        </div>
      )}
      <ErrorText error={error} />
      {!peers && !error && <div className="hint">Yuklanmoqda…</div>}
      {peers?.length === 0 && <div className="center hint">Hozircha hech kim yo'q. Kursdoshlaringizni taklif qiling!</div>}
      {peers?.map((p) => (
        <div key={p.id} className="card">
          <div className="row">
            <Avatar name={p.full_name} url={p.photo_url} />
            <div className="grow">
              <b>{p.full_name}</b>
              <div className="hint">
                {[p.track_title?.split(":")[0], courseLabel(p.course), p.university].filter(Boolean).join(" · ")}
              </div>
              {p.faculty && <div className="hint">{p.faculty}</div>}
            </div>
            {p.username
              ? <button className="btn small" onClick={() => openLink(`https://t.me/${p.username}`)}>Yozish</button>
              : <span className="hint" title="Telegram'da username o'rnatilmagan">username yo'q</span>}
          </div>
          {p.phone && (
            <div className="row" style={{ marginTop: 8 }}><Icon name="phone" size={16} /><a href={`tel:${p.phone}`}>{formatPhone(p.phone)}</a></div>
          )}
          <div className="hint" style={{ marginTop: 8 }}>
            {p.points} ball · {p.verified_tasks} tasdiqlangan ish{p.streak > 0 ? ` · ${p.streak} hafta ketma-ket` : ""}
          </div>
          {p.goals.length > 0 && (
            <div className="chips" style={{ marginTop: 6 }}>{p.goals.map((g) => <span key={g} className="chip">{g}</span>)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
