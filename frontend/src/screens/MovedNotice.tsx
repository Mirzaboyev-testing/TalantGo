import { useEffect, useState } from "react";
import { t, useLang } from "../i18n";
import { openLink } from "../tg";

/** Shown when the app was opened from the old bot: the account works as before, but the new bot is
 *  where messages now come from. App fires the "cf-moved" event with the new bot's @username. */
export function announceMove(username: string): void {
  window.dispatchEvent(new CustomEvent("cf-moved", { detail: username }));
}

export default function MovedNotice() {
  useLang();
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    const onMove = (e: Event) => setUsername((e as CustomEvent<string>).detail);
    window.addEventListener("cf-moved", onMove);
    return () => window.removeEventListener("cf-moved", onMove);
  }, []);
  if (!username) return null;
  const [before, after] = t("s.moved.text").split("{bot}");

  return (
    <div className="sheet-back" style={{ zIndex: 40, alignItems: "center", padding: 16 }} onClick={() => setUsername(null)}>
      <div className="card" style={{ maxWidth: 420, width: "100%", margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{t("s.moved.title")}</h2>
        <p>
          {before}<b>@{username}</b>{after}
        </p>
        <p className="hint">{t("s.moved.hint")}</p>
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => openLink(`https://t.me/${username}?start=moved`)}>{t("s.moved.open")}</button>
          <button className="btn ghost" onClick={() => setUsername(null)}>{t("s.moved.later")}</button>
        </div>
      </div>
    </div>
  );
}
