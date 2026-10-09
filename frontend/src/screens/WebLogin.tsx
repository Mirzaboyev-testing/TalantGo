import { useEffect, useRef, useState } from "react";
import { BOT_URL, BOT_USERNAME } from "../tg";

export interface TelegramWidgetUser {
  id: number; first_name: string; last_name?: string; username?: string; photo_url?: string; auth_date: number; hash: string;
}

declare global {
  interface Window { cfTelegramAuth?: (user: TelegramWidgetUser) => void }
}

/** The website's sign-in: Telegram's official login button, so the account is the same as in the bot. */
export default function WebLogin({ dev, onTelegram, onDev }: {
  dev: boolean; onTelegram: (u: TelegramWidgetUser) => void; onDev: (id: number, name: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onTelegram);
  callback.current = onTelegram;
  const [name, setName] = useState("Aziza Karimova");
  const [id, setId] = useState("1001");

  useEffect(() => {
    window.cfTelegramAuth = (u) => callback.current(u);
    const el = box.current;
    if (!el) return;
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", BOT_USERNAME);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "10");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "cfTelegramAuth(user)");
    el.appendChild(s);
    return () => { el.innerHTML = ""; };
  }, []);

  return (
    <div className="login">
      <div className="login-card">
        <span className="brand-mark" style={{ display: "grid" }}>C</span>
        <h1 style={{ marginBottom: 6 }}>TalantGo</h1>
        <p className="hint" style={{ marginTop: 0 }}>O'qish davomida haqiqiy tajriba, tasdiqlangan portfolio va birinchi ish.</p>
        <div className="card" style={{ marginTop: 18 }}>
          <b>Kirish</b>
          <p className="hint">Telegram akkauntingiz bilan kiring. Bot va sayt bitta akkaunt bilan ishlaydi.</p>
          <div ref={box} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
          <p className="hint" style={{ marginBottom: 0 }}>
            Telefoningizda qulayroq: <a href={BOT_URL}>Telegram'da ochish</a>
          </p>
        </div>
        {dev && (
          <div className="card" style={{ textAlign: "left" }}>
            <b>Sinov rejimi</b>
            <p className="hint">Faqat ishlab chiqish serverida ko'rinadi.</p>
            <label>Ism</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <label>Sinov ID</label>
            <input value={id} inputMode="numeric" onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} />
            <button className="btn" style={{ marginTop: 12 }} disabled={!name.trim() || !id} onClick={() => onDev(Number(id), name.trim())}>Kirish</button>
          </div>
        )}
      </div>
    </div>
  );
}
