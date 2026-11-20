import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { api, type AppNotification } from "../api";
import { formatDateTime, getLang, t, tMaybe, useLang, type MsgKey } from "../i18n";
import { Icon, type IconName } from "../icons";
import { navigate, usePath } from "../router";
import { ErrorText, Sheet, message } from "../ui";
import "./notifications.css";
import { everyVisible } from "../poll";

const PLACEHOLDERS = ["job", "company", "student", "university", "task", "test", "challenge", "note", "verifier",
                      "points", "score", "max", "status", "text", "title", "comment", "place", "when", "name", "count"];

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

// ------------------------------------------------------------------ how a notice looks (icon, colour, time)

type Tone = "green" | "blue" | "violet" | "amber" | "red";
const KIND_ICON: [RegExp, IconName, Tone][] = [
  [/^chat_/, "chat", "blue"],
  [/^post_|^comment_/, "chat", "blue"],
  [/^application_/, "inbox", "green"],
  [/^contact_/, "phone", "blue"],
  [/^partnership_/, "building", "violet"],
  [/^company_review/, "building", "green"],
  [/^job_/, "briefcase", "green"],
  [/hire/, "award", "green"],                    // university_hire: a company hired one of the university's students
  [/^university_announcement/, "megaphone", "violet"],
  [/^admin_announcement/, "megaphone", "violet"],
  [/^interview_|deadline/, "clock", "amber"],     // reminders: an interview soon, a test or task closing tomorrow
  [/^weekly_/, "spark", "green"],
  [/event/, "calendar", "blue"],
  [/^verification_/, "verified", "green"],
  [/^staff_/, "users", "amber"],
  [/^outcome_/, "award", "amber"],
  [/^test_/, "check", "blue"],
  [/^challenge_/, "trophy", "amber"],
  [/task|work_|question_/, "flag", "green"],
  [/^password_/, "lock", "amber"],
];

function look(n: AppNotification): { icon: IconName; tone: Tone } {
  const [, icon, base] = KIND_ICON.find(([re]) => re.test(n.kind)) ?? [null, "bell" as IconName, "green" as Tone];
  const p = n.params ?? {};
  const bad = p.approved === false || p.accepted === false || p.status === "rejected" || n.kind.endsWith("cancelled");
  const info = p.status === "needs_info" || p.status === "interview";
  return { icon, tone: bad ? "red" : info ? "amber" : base };
}

/** The calendar day in Tashkent (yyyy-mm-dd), so "today" is the same for everyone. */
const tashkentDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(d);
const DAY_MS = 86_400_000;

type Group = "today" | "yesterday" | "week" | "earlier";
function groupOf(iso: string, now: Date): Group {
  const days = Math.round((Date.parse(tashkentDay(now)) - Date.parse(tashkentDay(new Date(iso)))) / DAY_MS);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? "week" : "earlier";
}

function timeOf(iso: string, group: Group, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t("notif.just_now");
  if (minutes < 60) return t("notif.minutes_ago", { n: minutes });
  const full = formatDateTime(iso);
  return group === "today" || group === "yesterday" ? full.slice(-5) : group === "week" ? full.slice(0, 5) + full.slice(10) : full;
}

const GROUP_KEY: Record<Group, MsgKey> = { today: "notif.today", yesterday: "notif.yesterday", week: "notif.week",
                                           earlier: "notif.earlier" };

// ------------------------------------------------------------------ the bell

const POLL_MS = 60_000;
const wideQuery = window.matchMedia("(min-width: 900px)");
const useWide = () => useSyncExternalStore((l) => { wideQuery.addEventListener("change", l); return () => wideQuery.removeEventListener("change", l); },
                                           () => wideQuery.matches);

/** The bell with the unread count; opens the list. Clicking a notice opens the page it is about. */
export default function NotificationBell() {
  useLang();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const refresh = useCallback(() => api.notifications.unread().then((r) => setUnread(r.unread), () => {}), []);
  const path = usePath();
  useEffect(() => setOpen(false), [path]);            // the list closes when the page changes (Back included)

  useEffect(() => {
    void refresh();
    const stop = everyVisible(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { stop(); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const close = useCallback(() => { setOpen(false); void refresh(); bell.current?.focus(); }, [refresh]);
  return (
    <>
      <button ref={bell} className={`icon-btn bell ${open ? "on" : ""}`} title={t("shell.notifications")}
              aria-label={unread ? `${t("shell.notifications")}: ${unread}` : t("shell.notifications")}
              aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <NotificationList anchor={bell} onClose={close} onUnread={setUnread} />}
    </>
  );
}

// ------------------------------------------------------------------ the list: a panel by the bell on a computer, a sheet on a phone

function NotificationList({ anchor, onClose, onUnread }: {
  anchor: RefObject<HTMLButtonElement | null>; onClose: () => void; onUnread: (n: number) => void;
}) {
  const wide = useWide();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const report = useCallback((n: number) => { setUnread(n); onUnread(n); }, [onUnread]);
  const load = useCallback(async (beforeId?: number) => {
    try {
      const page = await api.notifications.list(beforeId);
      setItems((cur) => (beforeId && cur ? [...cur, ...page.items] : page.items));
      setMore(page.more);
      report(page.unread);
    } catch (e) {
      setError(message(e));
    }
  }, [report]);
  useEffect(() => { void load(); }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    await load(items?.[items.length - 1]?.id);
    setLoadingMore(false);
  }

  function openItem(n: AppNotification) {
    if (!n.read) {
      api.notifications.read([n.id]).then((r) => report(r.unread), () => {});
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    }
    if (n.link.startsWith("/")) { onClose(); navigate(n.link); }       // query strings (?c=12, ?tab=team) go along
  }

  async function readAll() {
    try {
      report((await api.notifications.read()).unread);
      setItems((cur) => cur?.map((x) => ({ ...x, read: true })) ?? null);
    } catch (e) {
      setError(message(e));
    }
  }

  const now = new Date();
  // newest first; a day appears once even if an older page brings more of it
  const byGroup = new Map<Group, AppNotification[]>();
  for (const n of items ?? []) {
    const g = groupOf(n.created_at, now);
    byGroup.set(g, [...(byGroup.get(g) ?? []), n]);
  }
  const groups = (["today", "yesterday", "week", "earlier"] as Group[])
    .filter((g) => byGroup.has(g)).map((group) => ({ group, rows: byGroup.get(group)! }));

  const body = (
    <>
      <div className="nt-head">
        <div className="nt-title">
          <h2>{t("shell.notifications")}</h2>
          <button className="nt-x" onClick={onClose} aria-label={t("common.close")} title={t("common.close")}><Icon name="close" size={18} /></button>
        </div>
        {items && items.length > 0 && (
          <div className="nt-sub">
            <span>{unread ? t("notif.unread_n", { n: unread }) : t("notif.all_read")}</span>
            {unread > 0 && <button className="nt-link" onClick={readAll}><Icon name="tick" size={14} />{t("notif.read_all")}</button>}
          </div>
        )}
      </div>
      <ErrorText error={error} />
      {!items && !error && <div className="nt-skel" aria-hidden="true"><span /><span /><span /><span /></div>}
      {items?.length === 0 && (
        <div className="nt-empty">
          <span className="nt-ic green"><Icon name="bell" size={22} /></span>
          <b>{t("notif.empty")}</b>
          <span>{t("notif.empty_sub")}</span>
        </div>
      )}
      {groups.map(({ group, rows }) => (
        <section key={group} className="nt-group" aria-label={t(GROUP_KEY[group])}>
          <h3>{t(GROUP_KEY[group])}</h3>
          {rows.map((n) => {
            const { icon, tone } = look(n);
            return (
              <button key={n.id} className={`nt-item ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}>
                <span className={`nt-ic ${tone}`}><Icon name={icon} size={17} /></span>
                <span className="nt-body">
                  <span className="nt-text">{notificationText(n)}</span>
                  <span className="nt-time" title={formatDateTime(n.created_at)}>{timeOf(n.created_at, group, now)}</span>
                </span>
                {!n.read && <span className="nt-dot"><span className="nt-sr">{t("notif.new")}</span></span>}
              </button>
            );
          })}
        </section>
      ))}
      {more && <button className="btn ghost small nt-more" disabled={loadingMore} onClick={loadMore}>{t("notif.more")}</button>}
    </>
  );

  if (!wide) return <Sheet onClose={onClose}><div className="nt nt-sheet">{body}</div></Sheet>;
  return <Popover anchor={anchor} onClose={onClose}>{body}</Popover>;
}

/** A panel next to the bell, drawn on <body> so a sticky sidebar or a card never covers it. A click outside
 *  (anywhere but the panel and the bell) or Escape closes it; the page under it keeps working. */
function Popover({ anchor, onClose, children }: { anchor: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  useEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(420, window.innerWidth - 24);
      const left = r.right + 12 + width <= window.innerWidth - 12 ? r.right + 12 : Math.max(12, r.right - width);
      const top = Math.max(12, r.top - 6);
      setPos({ left, top, maxHeight: window.innerHeight - top - 12 });
    };
    place();
    window.addEventListener("resize", place);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [anchor, onClose]);
  useEffect(() => { if (pos) panel.current?.focus(); }, [pos]);
  return createPortal(
    <div ref={panel} className="nt nt-pop" role="dialog" aria-label={t("shell.notifications")} tabIndex={-1}
         style={pos ?? { visibility: "hidden" }}>
      {children}
    </div>,
    document.body,
  );
}
