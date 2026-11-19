import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NewsCategory, NewsItem } from "../api";
import { formatDateTime, t, useLang, type MsgKey } from "../i18n";
import { Icon, type IconName } from "../icons";
import { navigate } from "../router";
import { openLink } from "../tg";
import "./news.css";

/** One university announcement, the same for a student ("Universitetim"), a company ("Universitetlar"), the
 *  public university page and the university's own preview: photos, category, text, link. */

const CATEGORY_ICON: Record<NewsCategory, IconName> = { news: "megaphone", career: "briefcase", internship: "school",
                                                         event: "calendar", scholarship: "award", other: "bell" };
export const NEWS_CATEGORIES = Object.keys(CATEGORY_ICON) as NewsCategory[];
export const categoryLabel = (c: NewsCategory) => t(`news.cat.${c}` as MsgKey);

export function NewsCard({ item, showUniversity = true, onUniversity }: {
  item: NewsItem; showUniversity?: boolean; onUniversity?: () => void;
}) {
  useLang();
  const [open, setOpen] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const long = item.text.length > 280 || item.text.split("\n").length > 5;
  const u = item.university;
  const external = item.link.startsWith("https://");
  return (
    <article className="nw">
      <header className="nw-head">
        {showUniversity && u && (
          <button className="nw-uni" onClick={onUniversity} disabled={!onUniversity} aria-label={u.name}>
            {u.logo_url ? <img src={u.logo_url} alt="" /> : <span>{u.short_name.slice(0, 4)}</span>}
          </button>
        )}
        <div className="nw-meta">
          {showUniversity && u && <b className="nw-uni-name" title={u.name}>{u.short_name}</b>}
          <span>{formatDateTime(item.created_at)}</span>
        </div>
        {item.partner && <span className="nw-chip partner">{t("news.partner")}</span>}
        <span className={`nw-chip cat-${item.category}`}><Icon name={CATEGORY_ICON[item.category] ?? "bell"} size={13} />{categoryLabel(item.category)}</span>
      </header>
      {item.photos.length > 0 && <Gallery photos={item.photos} onOpen={setOpen} />}
      <h3 className="nw-title">{item.title}</h3>
      <p className={`nw-text ${long && !expanded ? "clamp" : ""}`}>{item.text}</p>
      {long && <button className="nw-more" onClick={() => setExpanded((v) => !v)}>{expanded ? t("news.less") : t("news.more")}</button>}
      {item.link && (
        <button className="btn small ghost nw-link" onClick={() => (external ? openLink(item.link) : navigate(item.link))}>
          <Icon name={external ? "link" : "arrow"} size={15} />{external ? t("news.open_external") : t("news.open")}
          {external && <span className="nw-host">{hostOf(item.link)}</span>}
        </button>
      )}
      {open !== null && <Lightbox photos={item.photos} start={open} title={item.title} onClose={() => setOpen(null)} />}
    </article>
  );
}

const hostOf = (link: string) => { try { return new URL(link).host.replace(/^www\./, ""); } catch { return ""; } };

function Gallery({ photos, onOpen }: { photos: NewsItem["photos"]; onOpen: (i: number) => void }) {
  const shown = photos.slice(0, 4);
  return (
    <div className={`nw-gallery n${shown.length}`}>
      {shown.map((p, i) => (
        <button key={p.id} className="nw-photo" onClick={() => onOpen(i)} aria-label={t("news.photo_of", { n: i + 1, total: photos.length })}>
          <img src={p.url} alt="" loading="lazy" />
          {i === 3 && photos.length > 4 && <span className="nw-plus">+{photos.length - 4}</span>}
        </button>
      ))}
    </div>
  );
}

/** Photos full size: arrows or ←/→ to move, Escape or a click outside to close. */
export function Lightbox({ photos, start, title, onClose }: { photos: NewsItem["photos"]; start: number; title: string; onClose: () => void }) {
  useLang();
  const [i, setI] = useState(start);
  const step = useCallback((d: number) => setI((cur) => (cur + d + photos.length) % photos.length), [photos.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose, step]);
  const many = photos.length > 1;
  return createPortal(
    <div className="nw-lightbox" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="nw-lb-top" onClick={(e) => e.stopPropagation()}>
        <span>{many ? `${i + 1} / ${photos.length}` : ""}</span>
        <button className="nw-lb-btn" onClick={onClose} aria-label={t("common.close")}><Icon name="close" size={20} /></button>
      </div>
      <img src={photos[i].url} alt={title} onClick={(e) => e.stopPropagation()} />
      {many && <button className="nw-lb-btn nw-lb-prev" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label={t("news.prev")}><Icon name="back" size={20} /></button>}
      {many && <button className="nw-lb-btn nw-lb-next" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label={t("news.next")}><Icon name="arrow" size={20} /></button>}
    </div>,
    document.body,
  );
}
