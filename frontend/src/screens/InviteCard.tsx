import { useState } from "react";
import type { Me } from "../api";
import { t, useLang } from "../i18n";
import { BOT_URL, haptic, openLink } from "../tg";

/** Each student's own invite link; the count shows how many friends joined through it. */
export default function InviteCard({ me, compact = false }: { me: Me; compact?: boolean }) {
  useLang();
  const [copied, setCopied] = useState(false);
  const link = `${BOT_URL}?start=${me.invite_code}`;
  const text = t("s.invite.text");

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
    <div className="card soft">
      <div className="row between">
        <b>{t("s.invite.title")}</b>
        <span className="badge peer_verified">{t("s.invite.count", { n: me.invited_count })}</span>
      </div>
      {!compact && (
        <p className="hint">{t("s.invite.hint")}</p>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`)}>
          {t("s.common.share")}
        </button>
        <button className="btn small ghost" onClick={copy}>{copied ? t("s.invite.copied") : t("s.invite.copy")}</button>
      </div>
    </div>
  );
}
