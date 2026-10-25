import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BotLink, type BotLoginStatus } from "../api";
import { t, useLang } from "../i18n";
import { openLink } from "../tg";
import { message } from "../ui";

/**
 * A one-time bot link: open it, confirm in the bot, then type the 6-digit code the bot shows.
 * `start` gets the link; `verify` sends the code (only this browser can finish); `onDone` gets its result.
 */
export function useBotLink<R>(start: () => Promise<BotLink>, verify: (code: string, pin: string) => Promise<R>,
                              onDone: (result: R) => void) {
  const [link, setLink] = useState<BotLink | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "claimed" | "pin">("idle");
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const clear = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; };
  const stop = useCallback(() => { clear(); setState("idle"); setLink(null); }, []);
  useEffect(() => stop, [stop]);

  const finish = (s: BotLoginStatus) => {
    clear(); setState("idle"); setLink(null);
    if (s.status === "expired") setError(t("s.bot.expired"));
    else if (s.status === "rejected") setError(t("s.bot.rejected"));
    else if (s.status === "conflict") setError(s.note || t("s.bot.conflict"));
  };

  const begin = useCallback(async () => {
    setError("");
    // open the window at once (inside the click), so the browser does not block it as a pop-up
    const win = window.open("", "_blank");
    try {
      const l = await start();
      setLink(l);
      if (win) win.location.href = l.url; else openLink(l.url);
      setState("waiting");
      clear();
      timer.current = window.setInterval(async () => {
        try {
          const s = await api.botLoginStatus(l.code);
          if (s.status === "pending") return;
          if (s.status === "claimed") { setState("claimed"); return; }
          if (s.status === "awaiting_pin") { clear(); setState("pin"); return; }
          finish(s);
        } catch { /* a missed poll is retried on the next tick */ }
      }, 2000);
    } catch (e) {
      win?.close();
      setError(message(e));
    }
  }, [start]);

  const submitPin = useCallback(async (pin: string) => {
    if (!link) return;
    setError("");
    try {
      const result = await verify(link.code, pin);
      stop();
      done.current(result);
    } catch (e) {
      setError(message(e));
      const s = await api.botLoginStatus(link.code).catch(() => null);
      if (s && s.status !== "awaiting_pin") finish(s);
    }
  }, [link, verify, stop]);

  return { link, state, error, begin, stop, submitPin };
}

/** What the person sees while the bot waits: first "confirm in Telegram", then the code box. */
export function BotWaiting({ link, state, onCancel, onPin }: {
  link: BotLink; state: string; onCancel: () => void; onPin: (pin: string) => void;
}) {
  useLang();
  const [pin, setPin] = useState("");
  if (state === "pin") {
    return (
      <form className="notice" style={{ textAlign: "left", marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (pin.length === 6) onPin(pin); }}>
        <b>{t("s.bot.enter_code")}</b>
        <input value={pin} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" autoFocus
               style={{ marginTop: 8, letterSpacing: 4, fontSize: 18, textAlign: "center" }}
               onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <div className="row wrap" style={{ marginTop: 8, gap: 12 }}>
          <button className="btn small" type="submit" disabled={pin.length !== 6}>{t("s.bot.confirm")}</button>
          <a href="#" onClick={(e) => { e.preventDefault(); onCancel(); }}>{t("common.cancel")}</a>
        </div>
      </form>
    );
  }
  return (
    <div className="notice" style={{ textAlign: "left", marginTop: 12 }}>
      <b>{state === "claimed" ? t("s.bot.confirm_in_tg") : t("s.bot.opened")}</b>
      <div style={{ marginTop: 4 }}>
        {t("s.bot.instruction")}
      </div>
      <div className="row wrap" style={{ marginTop: 8, gap: 12 }}>
        <a href={link.url} target="_blank" rel="noreferrer">{t("s.bot.not_opened")}</a>
        <a href="#" onClick={(e) => { e.preventDefault(); onCancel(); }}>{t("common.cancel")}</a>
      </div>
    </div>
  );
}
