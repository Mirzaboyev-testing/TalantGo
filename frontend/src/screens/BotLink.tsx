import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BotLink, type BotLoginStatus } from "../api";
import { openLink } from "../tg";

/**
 * A one-time bot link: open it, confirm in the bot, and this page learns the result by polling.
 * `start` gets the link (website sign-in or tying Telegram to this account); `onDone` gets the final status.
 */
export function useBotLink(start: () => Promise<BotLink>, onDone: (s: BotLoginStatus) => void) {
  const [link, setLink] = useState<BotLink | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "claimed">("idle");
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setState("idle");
    setLink(null);
  }, []);
  useEffect(() => stop, [stop]);

  const begin = useCallback(async () => {
    setError("");
    // open the window at once (inside the click), so the browser does not block it as a pop-up
    const win = window.open("", "_blank");
    try {
      const l = await start();
      setLink(l);
      if (win) win.location.href = l.url; else openLink(l.url);
      setState("waiting");
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(async () => {
        try {
          const s = await api.botLoginStatus(l.code);
          if (s.status === "pending") return;
          if (s.status === "claimed") { setState("claimed"); return; }
          window.clearInterval(timer.current!);
          timer.current = null;
          setState("idle");
          setLink(null);
          if (s.status === "expired") setError("Vaqt tugadi. Tugmani qaytadan bosing.");
          else if (s.status === "rejected") setError("Telegram'da bekor qilindi.");
          else if (s.status === "conflict") setError(s.note || "Ulab bo'lmadi.");
          done.current(s);
        } catch { /* a missed poll is retried on the next tick */ }
      }, 2000);
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : "Kutilmagan xato");
    }
  }, [start]);

  return { link, state, error, begin, stop };
}

/** What the person sees while the bot waits for their confirmation. */
export function BotWaiting({ link, state, onCancel }: { link: BotLink; state: string; onCancel: () => void }) {
  return (
    <div className="notice" style={{ textAlign: "left", marginTop: 12 }}>
      <b>{state === "claimed" ? "Telegram'da tasdiqlang" : "Telegram ochildi"}</b>
      <div style={{ marginTop: 4 }}>
        Botda «✅ Ha, tasdiqlayman» tugmasini bosing. Shundan keyin bu sahifa o'zi davom etadi.
      </div>
      <div className="row wrap" style={{ marginTop: 8, gap: 12 }}>
        <a href={link.url} target="_blank" rel="noreferrer">Telegram ochilmadimi? Shu yerni bosing</a>
        <a href="#" onClick={(e) => { e.preventDefault(); onCancel(); }}>Bekor qilish</a>
      </div>
    </div>
  );
}
