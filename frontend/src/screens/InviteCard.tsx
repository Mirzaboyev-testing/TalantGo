import { useState } from "react";
import type { Me } from "../api";
import { BOT_URL, haptic, openLink } from "../tg";

/** Each student's own invite link; the count shows how many friends joined through it. */
export default function InviteCard({ me, compact = false }: { me: Me; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = `${BOT_URL}?start=${me.invite_code}`;
  const text = "Men CareerFlow'da o'qish davomida tajriba yig'yapman. Sen ham qo'shil, birga o'samiz! 🚀";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      haptic("success");
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card" style={{ border: "1px solid var(--btn)" }}>
      <div className="row between">
        <b>🤝 Kursdoshlaringizni taklif qiling</b>
        <span className="badge peer_verified">{me.invited_count} kishi</span>
      </div>
      {!compact && (
        <p className="hint">Yo'lingizda tengdosh qancha ko'p bo'lsa, ishlaringiz shuncha tez tasdiqlanadi. Havolangiz orqali kelganlar shu yerda sanaladi.</p>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`)}>
          Ulashish
        </button>
        <button className="btn small ghost" onClick={copy}>{copied ? "Nusxalandi ✓" : "Havolani nusxalash"}</button>
      </div>
    </div>
  );
}
