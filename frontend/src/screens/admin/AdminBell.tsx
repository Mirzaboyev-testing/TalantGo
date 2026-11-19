import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type AdminNotice } from "../../api";
import { formatDateTime } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { ErrorText, message } from "../../ui";
import "../notifications.css";

// what each notice is about: icon and colour (the kinds come from services/admin_inbox.py callers)
const KIND: [RegExp, IconName, string][] = [
  [/^company_/, "building", "green"],
  [/^job_/, "briefcase", "green"],
  [/^test_/, "check", "blue"],
  [/^staff_/, "users", "violet"],
  [/^verification_/, "verified", "green"],
  [/^complaint_/, "flag", "red"],
  [/^post_/, "flag", "red"],
  [/^admin_account_/, "user", "amber"],
  [/^password_/, "lock", "amber"],
];
const look = (n: AdminNotice) => KIND.find(([re]) => re.test(n.kind)) ?? [null, "bell" as IconName, "green"];

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "hozirgina";
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  return formatDateTime(iso);
}

/** The admin website's bell: what waits for this account's decision (its permissions decide what it gets). */
export default function AdminBell({ go }: { go: (page: string) => void }) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const refresh = useCallback(() => api.admin.notificationsUnread().then((r) => setUnread(r.unread), () => {}), []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  const close = useCallback(() => { setOpen(false); void refresh(); }, [refresh]);
  return (
    <>
      <button ref={bell} className={`icon-btn bell ${open ? "on" : ""}`} title="Bildirishnomalar"
              aria-label={unread ? `Bildirishnomalar: ${unread}` : "Bildirishnomalar"} aria-haspopup="dialog" aria-expanded={open}
              onClick={() => (open ? close() : setOpen(true))}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <List anchor={bell} onClose={close} onUnread={setUnread} go={go} />}
    </>
  );
}

function List({ anchor, onClose, onUnread, go }: {
  anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void; onUnread: (n: number) => void; go: (page: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<AdminNotice[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const report = useCallback((n: number) => { setUnread(n); onUnread(n); }, [onUnread]);
  const load = useCallback(async (beforeId?: number) => {
    try {
      const page = await api.admin.notifications(beforeId);
      setItems((cur) => (beforeId && cur ? [...cur, ...page.items] : page.items));
      setMore(page.more);
      report(page.unread);
    } catch (e) { setError(message(e)); }
  }, [report]);
  useEffect(() => { void load(); }, [load]);

  // under the bell, kept inside the window; a click outside or Escape closes it
  useEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(420, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12));
      const top = r.bottom + 8;
      setPos({ left, top, maxHeight: window.innerHeight - top - 12 });
    };
    place();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [anchor, onClose]);

  function openItem(n: AdminNotice) {
    if (!n.read) {
      api.admin.readNotifications([n.id]).then((r) => report(r.unread), () => {});
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    }
    if (n.link) { onClose(); go(n.link); }
  }

  async function readAll() {
    try {
      report((await api.admin.readNotifications()).unread);
      setItems((cur) => cur?.map((x) => ({ ...x, read: true })) ?? null);
    } catch (e) { setError(message(e)); }
  }

  return createPortal(
    <div ref={panel} className="nt nt-pop" role="dialog" aria-label="Bildirishnomalar" style={pos ?? { visibility: "hidden" }}>
      <div className="nt-head">
        <div className="nt-title">
          <h2>Bildirishnomalar</h2>
          <button className="nt-x" onClick={onClose} aria-label="Yopish" title="Yopish"><Icon name="close" size={18} /></button>
        </div>
        {items && items.length > 0 && (
          <div className="nt-sub">
            <span>{unread ? `${unread} ta o'qilmagan` : "Hammasi o'qilgan"}</span>
            {unread > 0 && <button className="nt-link" onClick={readAll}><Icon name="tick" size={14} />Hammasini o'qilgan qilish</button>}
          </div>
        )}
      </div>
      <ErrorText error={error} />
      {!items && !error && <div className="nt-skel" aria-hidden="true"><span /><span /><span /></div>}
      {items?.length === 0 && (
        <div className="nt-empty">
          <span className="nt-ic green"><Icon name="bell" size={22} /></span>
          <b>Hozircha bildirishnoma yo'q</b>
          <span>Yangi korxona, vakansiya, test, universitet xodimi, shikoyat yoki parol so'rovi kelsa, shu yerda ko'rinadi.</span>
        </div>
      )}
      {items?.map((n) => {
        const [, icon, tone] = look(n);
        return (
          <button key={n.id} className={`nt-item ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}>
            <span className={`nt-ic ${tone}`}><Icon name={icon} size={17} /></span>
            <span className="nt-body">
              <span className="nt-text">{n.text}</span>
              <span className="nt-time" title={formatDateTime(n.created_at)}>{ago(n.created_at)}</span>
            </span>
            {!n.read && <span className="nt-dot"><span className="nt-sr">yangi</span></span>}
          </button>
        );
      })}
      {more && <button className="btn ghost small nt-more" onClick={() => load(items?.[items.length - 1]?.id)}>Yana ko'rsatish</button>}
    </div>,
    document.body,
  );
}
