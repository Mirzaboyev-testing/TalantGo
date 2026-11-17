// "Tadbirlar" (student panel v2, phase 3): the student's university events and company events in one list,
// with registration. Registering for a company event shares the student's name with that company.
import { useCallback, useEffect, useState } from "react";
import { api, type EventItem } from "../../api";
import { getLang, t, tMaybe, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { haptic, openLink } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { PageHead } from "../employer/kit";

type Scope = "upcoming" | "mine" | "past";
export const eventKind = (k: string) => tMaybe(`u.ev.kind.${k}`) ?? k;
const LOCALE = { uz: "uz-UZ", ru: "ru-RU", en: "en-GB" } as const;
const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE[getLang()], { timeZone: "Asia/Tashkent", ...o }).format(new Date(iso));

export function EventCard({ e, onChanged }: { e: EventItem; onChanged: () => void }) {
  useLang();
  const [busy, setBusy] = useState(false);
  const full = e.capacity != null && e.registered >= e.capacity && !e.me_registered;
  const past = new Date(e.starts_at).getTime() < Date.now() - 6 * 3600 * 1000;
  async function toggle() {
    setBusy(true);
    try {
      if (e.me_registered) { await api.unregisterEvent(e.id); toast(t("st.ev.unregistered")); }
      else { await api.registerEvent(e.id); haptic("success"); toast(t("st.ev.registered_ok")); }
      onChanged();
    } catch (err) { toast(message(err), "error"); }
    finally { setBusy(false); }
  }
  return (
    <article className={`st-event ${e.me_registered ? "mine" : ""} ${e.status === "cancelled" ? "cancelled" : ""}`}>
      <div className="st-event-date">
        <b>{part(e.starts_at, { day: "2-digit" })}</b>
        <span>{part(e.starts_at, { month: "short" })}</span>
        <small>{part(e.starts_at, { hour: "2-digit", minute: "2-digit", hour12: false })}</small>
      </div>
      <div className="st-event-body">
        <div className="st-event-top">
          <span className={`co-pill ${e.organiser === "company" ? "" : "warn"}`}>{eventKind(e.kind)}</span>
          <span className="st-event-org">
            <Icon name={e.organiser === "company" ? "building" : "school"} size={14} />{e.organiser_name}
          </span>
        </div>
        <b className="st-event-title">{e.title}</b>
        {e.description && <p className="co-clamp">{e.description}</p>}
        <div className="st-event-meta">
          {e.location && <span><Icon name="pin" size={14} />{e.location}</span>}
          {e.online_url && <span><Icon name="globe" size={14} />{t("st.ev.online")}</span>}
          <span><Icon name="users" size={14} />{e.capacity ? t("st.ev.seats", { n: e.registered, max: e.capacity }) : t("st.ev.going", { n: e.registered })}</span>
          {e.companies && <span><Icon name="briefcase" size={14} />{e.companies}</span>}
        </div>
        {e.organiser === "company" && !e.me_registered && !past && <div className="hint" style={{ marginTop: 6 }}>{t("st.ev.company_note")}</div>}
        <div className="st-event-actions">
          {e.status === "cancelled" ? <span className="co-note bad">{t("st.ev.cancelled")}</span>
            : past ? <span className="hint">{t("st.ev.past")}</span>
            : full ? <span className="co-note">{t("st.ev.full")}</span>
            : <button className={`btn small ${e.me_registered ? "ghost" : ""}`} disabled={busy} onClick={toggle}>
                {e.me_registered ? t("st.ev.unregister") : t("st.ev.register")}
              </button>}
          {e.me_registered && e.status !== "cancelled" && <span className="st-event-going"><Icon name="tick" size={14} />{t("st.ev.you_going")}</span>}
          {e.online_url && e.me_registered && <button className="link-btn" onClick={() => openLink(e.online_url)}>{t("st.ev.join")}</button>}
        </div>
      </div>
    </article>
  );
}

export default function Events() {
  useLang();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [rows, setRows] = useState<EventItem[] | null>(null);
  const [kind, setKind] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => api.events(scope).then(setRows, (e) => setError(message(e))), [scope]);
  useEffect(() => { setRows(null); void load(); }, [load]);
  const kinds = [...new Set((rows ?? []).map((e) => e.kind))];
  const shown = (rows ?? []).filter((e) => !kind || e.kind === kind);

  return (
    <div className="co-page st-page">
      <PageHead title={t("st.ev.title")} sub={t("st.ev.sub")} />
      <div className="row wrap" style={{ gap: 10, justifyContent: "space-between" }}>
        <div className="co-tabs">
          {(["upcoming", "mine", "past"] as Scope[]).map((s) => (
            <button key={s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>{t(`st.ev.scope.${s}`)}</button>
          ))}
        </div>
        {kinds.length > 1 && (
          <div className="scroll-tabs">
            <button className={`chip ${kind === "" ? "on" : ""}`} onClick={() => setKind("")}>{t("pub.filter.all")}</button>
            {kinds.map((k) => <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{eventKind(k)}</button>)}
          </div>
        )}
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="st-skeleton-grid"><span /><span /><span /></div>}
      {rows && shown.length === 0 && (
        <div className="st-empty"><Icon name="calendar" size={28} /><b>{t(`st.ev.empty.${scope}`)}</b><span className="hint">{t("st.ev.empty_hint")}</span></div>
      )}
      <div className="st-card-grid two">{shown.map((e) => <EventCard key={e.id} e={e} onChanged={load} />)}</div>
    </div>
  );
}
