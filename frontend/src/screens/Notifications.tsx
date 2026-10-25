import { useCallback, useEffect, useState } from "react";
import { api, type AppNotification } from "../api";
import { formatDateTime, getLang, t, tMaybe, useLang } from "../i18n";
import { Icon } from "../icons";
import { navigate, usePath } from "../router";
import { ErrorText, Sheet, message } from "../ui";

const PLACEHOLDERS = ["job", "company", "student", "university", "task", "test", "challenge", "note", "verifier",
                      "points", "score", "max", "status"];

/** The message in the reader's language: Uzbek is stored as written; ru/en use a template by kind. */
export function notificationText(n: AppNotification): string {
  if (getLang() === "uz") return n.text;
  const p = n.params ?? {};
  const variant = typeof p.status === "string" ? `.${p.status}`
    : "approved" in p ? (p.approved ? ".ok" : ".no")
    : "accepted" in p ? (p.accepted ? ".ok" : ".no") : "";
  // every placeholder a template may use: a notice sent to one side leaves the other side's name out
  const params: Record<string, string> = Object.fromEntries(PLACEHOLDERS.map((k) => [k, ""]));
  for (const [k, v] of Object.entries(p)) params[k] = v == null ? "" : String(v);
  return tMaybe(`notif.${n.kind}${variant}`, params) ?? tMaybe(`notif.${n.kind}`, params) ?? n.text;
}

const POLL_MS = 60_000;

/** The bell with the unread count; opens the list. Clicking a notice opens the page it is about. */
export default function NotificationBell() {
  useLang();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(() => api.notifications.unread().then((r) => setUnread(r.unread), () => {}), []);
  const path = usePath();
  useEffect(() => setOpen(false), [path]);            // the list closes when the page changes (Back included)

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  return (
    <>
      <button className="icon-btn bell" title={t("shell.notifications")} aria-label={t("shell.notifications")}
              onClick={() => setOpen(true)}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <NotificationList onClose={() => { setOpen(false); void refresh(); }} onUnread={setUnread} />}
    </>
  );
}

function NotificationList({ onClose, onUnread }: { onClose: () => void; onUnread: (n: number) => void }) {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (beforeId?: number) => {
    try {
      const page = await api.notifications.list(beforeId);
      setItems((cur) => (beforeId && cur ? [...cur, ...page.items] : page.items));
      setMore(page.more);
      onUnread(page.unread);
    } catch (e) {
      setError(message(e));
    }
  }, [onUnread]);
  useEffect(() => { void load(); }, [load]);

  async function openItem(n: AppNotification) {
    if (!n.read) {
      api.notifications.read([n.id]).then((r) => onUnread(r.unread), () => {});
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    }
    if (n.link.startsWith("/")) { onClose(); navigate(n.link); }
  }

  async function readAll() {
    try {
      onUnread((await api.notifications.read()).unread);
      setItems((cur) => cur?.map((x) => ({ ...x, read: true })) ?? null);
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{t("shell.notifications")}</h1>
        {items?.some((n) => !n.read) && <button className="btn small ghost" onClick={readAll}>{t("notif.mark_all")}</button>}
      </div>
      <ErrorText error={error} />
      {!items && !error && <div className="hint">{t("common.loading")}</div>}
      {items?.length === 0 && <div className="center hint">{t("notif.empty")}</div>}
      <div className="notif-list">
        {items?.map((n) => (
          <button key={n.id} className={`notif ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}>
            <span className="notif-text">{notificationText(n)}</span>
            <span className="hint">{formatDateTime(n.created_at)}</span>
          </button>
        ))}
      </div>
      {more && <button className="btn ghost" onClick={() => load(items?.[items.length - 1]?.id)}>{t("notif.more")}</button>}
      <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
    </Sheet>
  );
}
