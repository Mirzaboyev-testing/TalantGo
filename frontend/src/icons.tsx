// One consistent line-icon set (24px grid, 1.8 stroke) instead of emoji.
const PATHS: Record<string, string> = {
  path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M15.5 8.5l-2 5-5 2 2-5 5-2Z",
  briefcase: "M4 8h16v11H4z M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8 M4 13h16",
  check: "M9 4h6v3H9z M7 5H5v15h14V5h-2 M9 13l2 2 4-4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.5a3.5 3.5 0 0 1 0 6.5 M21.5 20a6.5 6.5 0 0 0-4-6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4.5 20a7.5 7.5 0 0 1 15 0",
  chat: "M4 5h16v11H9l-5 4V5Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4",
  inbox: "M4 13l2-8h12l2 8 M4 13v6h16v-6 M4 13h5l1 2h4l1-2h5",
  building: "M5 21V4h10v17 M15 9h4v12 M8 8h2 M8 12h2 M8 16h2 M3 21h18",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M3 20h18",
  verified: "M12 3l2.4 1.8 3-.2.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3 .2L12 3Z M8.5 12l2.5 2.5 4.5-5",
  school: "M2 9l10-5 10 5-10 5-10-5Z M6 11v5c2 2 10 2 12 0v-5 M22 9v6",
  logout: "M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10",
  plus: "M12 5v14 M5 12h14",
  back: "M15 5l-7 7 7 7",
  send: "M4 12l16-8-6 16-2-7-8-1Z",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z",
  flame: "M12 21c4 0 7-2.7 7-6.5 0-3.5-2.5-5.5-4-8-1 2-2 3-3.5 3.5C11 7 10.5 5 11 3 7 5 5 9 5 14.5 5 18.3 8 21 12 21Z",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  close: "M6 6l12 12 M18 6L6 18",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z M10 20.5a2 2 0 0 0 4 0",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  flag: "M5 21V4 M5 4h12l-2.5 4 2.5 4H5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 15v5h16v-5",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** A track shown as a small lettered mark ("DA", "ML") rather than an emoji. */
export function TrackMark({ title, size = 36 }: { title?: string | null; size?: number }) {
  const words = (title ?? "").split(":")[0].split(/\s+/).filter((w) => w && w.toLowerCase() !== "va");
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return (
    <span className="track-mark" style={{ width: size, height: size, fontSize: size * 0.38 }}>{letters.toUpperCase()}</span>
  );
}
