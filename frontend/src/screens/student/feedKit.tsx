// Small pieces of the posts feed ("Lenta", docs/12-talaba-postlar.md) shared by the feed, the profile's
// "Faoliyat" block and the admin's "Postlar" queue: relative time, author avatar, post text with "Ko'proq",
// the 1–4 image grid with a lightbox, the overflow menu and the report sheet. Styles: feed.css ("fd-" classes).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { api, type Me, type PostAuthor, type PostKind, type ReportReason } from "../../api";
import { formatDateTime, t, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { haptic, insideTelegram, openLink } from "../../tg";
import { Avatar, ErrorText, Sheet, message, toast } from "../../ui";
import "./feed.css";

export const MAX_TEXT = 2000;
export const MAX_IMAGES = 4;
export const KIND_ICON: Record<PostKind, IconName> = {
  experience: "briefcase", project: "grid", achievement: "trophy", event: "calendar", question: "help", news: "megaphone",
};
export const kindLabel = (k: PostKind) => t(`fd.kind.${k}` as MsgKey);

/** The post kinds this account may pick: "news" is for companies and universities. */
export function kindsFor(me: Me): PostKind[] {
  return me.account_type === "student" ? ["experience", "project", "achievement", "event", "question"]
    : ["news", "event", "project", "achievement", "question"];
}

/** Who a new post is written as: a student as themselves, a company or university staff as their organisation. */
export function identityOf(me: Me): { kind: PostAuthor["kind"]; name: string; photo: string | null; org: boolean; subtitle: string } {
  if (me.account_type === "employer") {
    return { kind: "company", name: me.company?.name || me.full_name, photo: me.company?.logo_url ?? null, org: true, subtitle: me.company?.city ?? "" };
  }
  if (me.account_type === "university") {
    const u = me.staff_university ?? me.university_ref;
    return { kind: "university", name: u?.name || me.university || me.full_name, photo: null, org: true, subtitle: u?.city ?? "" };
  }
  return { kind: "student", name: me.full_name, photo: me.photo_url, org: false,
           subtitle: me.headline || [me.university_ref?.short_name || me.university, me.faculty].filter(Boolean).join(" · ") };
}

/** "hozirgina", "5 daqiqa oldin", "3 soat oldin", "kecha", "4 kun oldin", then the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 1) return t("fd.time.now");
  if (min < 60) return t("fd.time.min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("fd.time.hour", { n: h });
  const d = Math.floor(h / 24);
  if (d === 1) return t("fd.time.yesterday");
  if (d < 7) return t("fd.time.day", { n: d });
  return formatDateTime(iso, false);
}

export function TimeAgo({ iso }: { iso: string }) {
  useLang();
  return <time dateTime={iso} title={formatDateTime(iso)}>{timeAgo(iso)}</time>;
}

/** A person's photo or initials; a company or university gets a square logo. */
export function AuthorAvatar({ author, className = "" }: { author: Pick<PostAuthor, "kind" | "name" | "photo_url" | "company_logo">; className?: string }) {
  const org = author.kind !== "student";
  const url = author.kind === "company" ? author.company_logo || author.photo_url : author.photo_url;
  return <Avatar name={author.name} url={url} className={`${org ? "square" : ""} ${className}`.trim()} />;
}

export function Verified() {
  useLang();
  return <span className="fd-verified" title={t("fd.verified")} aria-label={t("fd.verified")}><Icon name="verified" size={15} /></span>;
}

export function KindChip({ kind }: { kind: PostKind }) {
  useLang();
  return <span className={`fd-kind k-${kind}`}><Icon name={KIND_ICON[kind]} size={13} />{kindLabel(kind)}</span>;
}

const URL_RE = /(https?:\/\/[^\s<>«»"']+[^\s<>«»"'.,;:!?)\]])/g;
/** Plain text with its web links made clickable (opened outside the app). */
export function linkify(text: string): ReactNode[] {
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!insideTelegram) return;
    e.preventDefault();
    openLink(e.currentTarget.href);
  };
  return text.split(URL_RE).map((part, i) => (i % 2
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={open}>{part}</a> : part));
}

/** The post's text, cut after a few lines with "Ko'proq". */
export function PostText({ text, lines = 6 }: { text: string; lines?: number }) {
  useLang();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || open) return;
    const check = () => setCut(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open, lines]);
  return (
    <div className="fd-text-wrap">
      <div ref={box} className={`fd-text ${open ? "open" : ""}`} style={open ? undefined : { WebkitLineClamp: lines }}>{linkify(text)}</div>
      {cut && !open && <button type="button" className="fd-more" onClick={() => setOpen(true)}>…{t("fd.more")}</button>}
    </div>
  );
}

/** One to four images in a grid (one keeps its shape); a tap opens them full size. */
export function PostMedia({ media }: { media: { id: number; url: string }[] }) {
  useLang();
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const shown = media.slice(0, MAX_IMAGES);
  if (!shown.length) return null;
  return (
    <>
      <div className={`fd-media n${shown.length}`}>
        {shown.map((m, i) => (
          <button key={m.id} type="button" className="fd-media-item" onClick={() => setOpen(i)} aria-label={t("fd.image_alt", { n: i + 1 })}>
            <img src={m.url} alt="" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox media={shown} start={open} onClose={close} />}
    </>
  );
}

function Lightbox({ media, start, onClose }: { media: { id: number; url: string }[]; start: number; onClose: () => void }) {
  useLang();
  const [i, setI] = useState(start);
  const n = media.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  const touchX = useRef<number | null>(null);
  return (
    <Sheet onClose={onClose}>
      <div className="fd-lightbox" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
           onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
           onTouchEnd={(e) => {
             const x0 = touchX.current;
             touchX.current = null;
             const dx = x0 == null ? 0 : (e.changedTouches[0]?.clientX ?? x0) - x0;
             if (n > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
           }}>
        <img src={media[i].url} alt={t("fd.image_alt", { n: i + 1 })} />
        <button type="button" className="fd-lb-btn fd-lb-close" onClick={onClose} aria-label={t("common.close")}><Icon name="close" size={20} /></button>
        {n > 1 && (
          <>
            <button type="button" className="fd-lb-btn fd-lb-prev" onClick={() => go(-1)} aria-label={t("fd.lightbox.prev")}><Icon name="back" size={22} /></button>
            <button type="button" className="fd-lb-btn fd-lb-next" onClick={() => go(1)} aria-label={t("fd.lightbox.next")}><Icon name="back" size={22} className="flip" /></button>
            <div className="fd-lb-count" aria-live="polite">{i + 1} / {n}</div>
          </>
        )}
      </div>
    </Sheet>
  );
}

const Dots = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
  </svg>
);

export type MenuItem = { label: string; icon: IconName; onClick: () => void; danger?: boolean };
/** The "⋯" button with a small menu (edit / delete for one's own post, report for others'). */
export function OverflowMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="fd-menu" ref={box}>
      <button type="button" className="fd-icon-btn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}><Dots /></button>
      {open && (
        <div className="fd-menu-pop" role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? "danger" : ""}
                    onClick={() => { setOpen(false); it.onClick(); }}>
              <Icon name={it.icon} size={16} />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  useLang();
  return (
    <div className="fd-sheet-head">
      <b>{title}</b>
      <button type="button" className="icon-btn" onClick={onClose} aria-label={t("common.close")}><Icon name="close" size={18} /></button>
    </div>
  );
}

const REASONS: ReportReason[] = ["spam", "offensive", "false", "private", "other"];

/** Report a post or a comment: a reason and an optional note. */
export function ReportSheet({ target, onClose, onSent }: {
  target: { kind: "post" | "comment"; id: number }; onClose: () => void; onSent?: () => void;
}) {
  useLang();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    if (!reason || busy) return;
    setBusy(true); setError("");
    try {
      await (target.kind === "post" ? api.feed.report : api.feed.reportComment)(target.id, reason, note.trim());
      haptic("success");
      toast(t("fd.report.sent"));
      onSent?.();
      onClose();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={target.kind === "post" ? t("fd.report.title") : t("fd.report.comment_title")} onClose={onClose} />
      <p className="hint fd-sheet-hint">{t("fd.report.hint")}</p>
      <div className="fd-reasons" role="radiogroup">
        {REASONS.map((r) => (
          <label key={r} className={`fd-reason ${reason === r ? "on" : ""}`}>
            <input type="radio" name={`fd-reason-${target.kind}-${target.id}`} checked={reason === r} onChange={() => setReason(r)} />
            <span>{t(`fd.reason.${r}` as MsgKey)}</span>
          </label>
        ))}
      </div>
      <textarea className="fd-report-note" value={note} maxLength={500} rows={3} placeholder={t("fd.report.note_ph")}
                onChange={(e) => setNote(e.target.value)} />
      <ErrorText error={error} />
      <button type="button" className="btn fd-sheet-btn" disabled={!reason || busy} onClick={send}>{t("fd.report.send")}</button>
    </Sheet>
  );
}
