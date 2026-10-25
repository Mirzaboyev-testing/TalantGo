// A small History API router: every panel page has its own URL, so links, reloads and the browser's
// Back button work (also inside the Telegram Mini App). No library: the app needs only paths.
import { useEffect, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
window.addEventListener("popstate", emit);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Goes to an in-app path such as /talaba/arizalar (a query string may follow). */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (to === window.location.pathname + window.location.search) return;
  window.history[opts.replace ? "replaceState" : "pushState"](null, "", to);
  emit();
  if (!opts.replace) window.scrollTo(0, 0);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** The query string as an object, re-read on every navigation. */
export function useSearch(): Record<string, string> {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return Object.fromEntries(new URLSearchParams(search));
}

/**
 * Ties a panel's tabs to URLs: `/talaba/vakansiyalar` selects the "jobs" tab of the base `/talaba`.
 * A path outside the base (or `/`) is replaced with the base so the address always shows where you are.
 * `aliases` maps extra segments to a tab (e.g. "arizalar" opens "jobs" on the applications view).
 */
export function useRouteTab<T extends string>(base: string, segments: Record<T, string>, fallback: T,
                                              aliases: Record<string, T> = {}): [T, (t: T) => void, string] {
  const path = usePath();
  const inside = path === base || path.startsWith(`${base}/`);
  useEffect(() => {
    // read the live address: another effect in the same commit may already have moved it
    const live = window.location.pathname;
    if (live !== base && !live.startsWith(`${base}/`)) navigate(base + window.location.search, { replace: true });
  }, [inside, base]);
  const segment = inside ? path.slice(base.length).replace(/^\//, "").split("/")[0] : "";
  const tab = (Object.keys(segments) as T[]).find((k) => segments[k] === segment) ?? aliases[segment] ?? fallback;
  const go = (t: T) => navigate(segments[t] ? `${base}/${segments[t]}` : base);
  return [tab, go, segment];
}
