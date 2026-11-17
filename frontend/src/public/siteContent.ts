import { useEffect, useState } from "react";
import { api, type PublicSiteContent, type SiteImageSlot } from "../api";

// The website's own content (partner logos, team, page photos, contacts) is managed in admin → Sayt.
// One request per page load, shared by the home page, "About us" and the footer.

const EMPTY: PublicSiteContent = { partners: [], team: [], images: { hero: null, students: null, about: null }, contacts: {} };
let pending: Promise<PublicSiteContent> | null = null;

/** The built-in photos, shown until an admin uploads others. */
export const DEFAULT_IMAGES: Record<SiteImageSlot, string> = {
  hero: "/img/home/students-hero.webp",
  students: "/img/home/students-team.webp",
  about: "/img/home/students-team.webp",
};

export function useSiteContent(): PublicSiteContent | null {
  const [site, setSite] = useState<PublicSiteContent | null>(null);
  useEffect(() => {
    let live = true;
    pending ??= api.public.site().catch(() => { pending = null; return EMPTY; });
    void pending.then((s) => { if (live) setSite(s); });
    return () => { live = false; };
  }, []);
  return site;
}

export const siteImage = (site: PublicSiteContent | null, slot: SiteImageSlot) => site?.images[slot] ?? DEFAULT_IMAGES[slot];

/** Initials for a partner without a logo: the university's short name, or the first letters of the name. */
export function initials(name: string, short = ""): string {
  if (short && short.length <= 6) return short.toUpperCase();
  const words = name.replace(/["'«»]/g, "").split(/\s+/).filter((w) => w && !/^(mchj|ooo|llc|jsc|aj|xk|qk)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 2)).toUpperCase();
}

/** A link a person typed (Telegram @name, an Instagram handle...) as something a browser can open. */
export function contactHref(field: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (field === "email") return `mailto:${v}`;
  if (field === "phone") return `tel:${v.replace(/[^\d+]/g, "")}`;
  if (field === "address") return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  const base: Record<string, string> = {
    telegram: "https://t.me/", instagram: "https://instagram.com/", linkedin: "https://www.linkedin.com/in/",
    facebook: "https://facebook.com/", youtube: "https://youtube.com/@",
  };
  return base[field] ? base[field] + encodeURIComponent(handle) : null;
}
