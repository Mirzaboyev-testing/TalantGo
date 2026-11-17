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
  home: "M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-6h4v6",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z M10 20.5a2 2 0 0 0 4 0",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  flag: "M5 21V4 M5 4h12l-2.5 4 2.5 4H5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 15v5h16v-5",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01",
  tick: "M5 12.5l4.5 4.5L19 7.5",
  // student panel v2 (2026-11-17)
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M12 2.5v3 M12 18.5v3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M2.5 12h3 M18.5 12h3 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1",
  edit: "M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15.5 9.5h.01",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4Z M8 6H5v1a3 3 0 0 0 3 3 M16 6h3v1a3 3 0 0 1-3 3 M12 13v4 M8 20h8 M9.5 17h5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 12h.01",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M8.5 14L7 21l5-3 5 3-1.5-7",
  file: "M6 3h8l5 5v13H6z M14 3v5h5",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  mail: "M3 6h18v12H3z M3 7l9 6 9-6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  code: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  trend: "M4 19V5 M4 19h16 M8 15l3-4 3 2 5-6",
  monitor: "M3 4h18v12H3z M8 20h8 M12 16v4",
  palette: "M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3c.4.5.5 1.1.2 1.7-.4.7-1.4 1-2.7 1Z M7.5 11h.01 M10 7h.01 M14.5 7h.01",
  megaphone: "M4 10v4h3l7 4V6L7 10H4Z M17 9a4 4 0 0 1 0 6 M7 14l1 5h2.5l-1-4.5",
  play: "M4 5h16v14H4z M10 9l5 3-5 3V9Z",
  cart: "M3 4h2.5l2 11h10l2-8H6.5 M9 20h.01 M17 20h.01",
  headset: "M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v5H5a1 1 0 0 1-1-1v-4Z M20 14h-3v5h2a1 1 0 0 0 1-1v-4Z M17 19c0 1.5-2 2-5 2",
  coins: "M9 11c3.3 0 6-1.1 6-2.5S12.3 6 9 6 3 7.1 3 8.5 5.7 11 9 11Z M3 8.5v4C3 13.9 5.7 15 9 15s6-1.1 6-2.5v-4 M9 15v3.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4c0-1.4-2.7-2.5-6-2.5",
  scale: "M12 4v16 M8 20h8 M5 7h14 M5 7l-3 6a3 3 0 0 0 6 0L5 7Z M19 7l-3 6a3 3 0 0 0 6 0l-3-6Z",
  book: "M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5Z M4 20a2 2 0 0 0 2 2h13v-4",
  translate: "M4 5h9 M8.5 3v2 M6 5c.5 3 2.5 5.5 5 7 M11 5c-.5 3-2.5 6-6 8 M13 21l4-9 4 9 M14.5 18h5",
  truck: "M3 6h11v10H3z M14 10h4l3 3v3h-7 M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  wrench: "M15 4a5 5 0 0 0-4.6 7L4 17.4V20h2.6l6.4-6.4A5 5 0 0 0 20 9l-3 1-2-2 1-3a5 5 0 0 0-1-1Z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  plane: "M21 15l-8-4V5a1 1 0 0 0-2 0v6l-8 4v2l8-2v4l-2 1.5V22l3-1 3 1v-1.5L13 19v-4l8 2v-2Z",
  leaf: "M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z M5 19l8-8",
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
