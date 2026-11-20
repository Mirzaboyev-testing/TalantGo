/** Repeats `fn` every `ms` only while the tab is visible, and once right away when it is shown again. A tab left
 * open in the background asks the server nothing (2026-11-20 logs: every open tab polled three counters every
 * 30 seconds, seen or not). Returns the cleanup for useEffect. */
export function everyVisible(fn: () => void, ms: number): () => void {
  const tick = () => { if (!document.hidden) fn(); };
  const timer = window.setInterval(tick, ms);
  document.addEventListener("visibilitychange", tick);
  return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
}
