// The student side of the university panel: messages from the career centre and events to sign up for.
// Shown on the student's "Universitetim" page; hidden while there is nothing to show.
import { useCallback, useEffect, useState } from "react";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { haptic } from "../../tg";
import { message, toast } from "../../ui";
import { uapi, type UniEvent } from "./uapi";
import { UIcon, dayMonth, timeOf } from "./ukit";

type Feed = { announcements: { id: number; title: string; text: string; link: string; created_at: string }[]; events: UniEvent[] };

export default function StudentUniFeed() {
  useLang();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(() => uapi.myFeed().then(setFeed, () => setFeed({ announcements: [], events: [] })), []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(e: UniEvent) {
    setBusy(e.id);
    try {
      if (e.me_registered) await uapi.unregisterEvent(e.id); else await uapi.registerEvent(e.id);
      haptic("success");
      toast(e.me_registered ? t("u.feed.left") : t("u.feed.joined"));
      void load();
    } catch (err) { toast(message(err), "error"); }
    finally { setBusy(null); }
  }
  if (!feed || (feed.events.length === 0 && feed.announcements.length === 0)) return null;
  return (
    <div className="uni-page" style={{ marginTop: 6 }}>
      {feed.events.length > 0 && (
        <>
          <h2 className="pub-h2">{t("u.feed.events")}</h2>
          <div className="u-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
            {feed.events.map((e) => {
              const [day, mon] = dayMonth(e.starts_at);
              const left = e.capacity ? Math.max(0, e.capacity - e.registered) : null;
              return (
                <div key={e.id} className="u-card">
                  <div className="u-card-top">
                    <span className="u-date lg"><b>{day}</b><span>{mon}</span></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <span className="u-tag blue" style={{ marginBottom: 4 }}>{t(`u.ev.kind.${e.kind}` as "u.ev.kind.career_day")}</span>
                      <b>{e.title}</b>
                      <span><UIcon name="clock" size={12} /> {timeOf(e.starts_at)}{e.location ? ` · ${e.location}` : e.online_url ? ` · ${t("u.ev.online")}` : ""}</span>
                    </div>
                  </div>
                  {e.description && <p style={{ margin: 0, fontSize: 13.5, whiteSpace: "pre-line" }}>{e.description.length > 200 ? `${e.description.slice(0, 200)}…` : e.description}</p>}
                  {e.companies && <div className="hint"><Icon name="building" size={13} /> {e.companies}</div>}
                  <div className="u-card-foot">
                    <span className="u-dim">{left !== null ? (left > 0 ? t("u.feed.seats", { n: left }) : t("u.feed.full")) : t("u.ev.registered_n", { n: e.registered })}</span>
                    <button className={`btn small ${e.me_registered ? "ghost" : ""}`} disabled={busy === e.id || (!e.me_registered && left === 0)} onClick={() => toggle(e)}>
                      {e.me_registered ? <><Icon name="tick" size={15} />{t("u.feed.registered")}</> : t("u.feed.register")}
                    </button>
                  </div>
                  {e.me_registered && e.online_url && <a className="u-link" href={e.online_url} target="_blank" rel="noreferrer"><UIcon name="link" size={13} /> {t("u.feed.join_online")}</a>}
                </div>
              );
            })}
          </div>
        </>
      )}
      {feed.announcements.length > 0 && (
        <>
          <h2 className="pub-h2">{t("u.feed.news")}</h2>
          <div className="u-panel">
            {feed.announcements.map((a) => (
              <div key={a.id} className="u-msg">
                <b>{a.title}</b>
                <p>{a.text}</p>
                <span className="hint">{formatDateTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
