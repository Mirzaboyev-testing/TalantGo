import { useEffect, useState } from "react";
import { openLink } from "../tg";

/** Shown when the app was opened from the old bot: the account works as before, but the new bot is
 *  where messages now come from. App fires the "cf-moved" event with the new bot's @username. */
export function announceMove(username: string): void {
  window.dispatchEvent(new CustomEvent("cf-moved", { detail: username }));
}

export default function MovedNotice() {
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    const onMove = (e: Event) => setUsername((e as CustomEvent<string>).detail);
    window.addEventListener("cf-moved", onMove);
    return () => window.removeEventListener("cf-moved", onMove);
  }, []);
  if (!username) return null;

  return (
    <div className="sheet-back" style={{ zIndex: 40, alignItems: "center", padding: 16 }} onClick={() => setUsername(null)}>
      <div className="card" style={{ maxWidth: 420, width: "100%", margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Botimiz yangilandi</h2>
        <p>
          TalantGo endi <b>@{username}</b> botida ishlaydi. Akkauntingiz, ballaringiz va CV'ingiz joyida, hech narsa
          yo'qolmaydi.
        </p>
        <p className="hint">Yangi botni ochib «Start» ni bosing: xabarlar va eslatmalar endi o'sha yerdan keladi.</p>
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => openLink(`https://t.me/${username}?start=moved`)}>Yangi botni ochish</button>
          <button className="btn ghost" onClick={() => setUsername(null)}>Keyinroq</button>
        </div>
      </div>
    </div>
  );
}
