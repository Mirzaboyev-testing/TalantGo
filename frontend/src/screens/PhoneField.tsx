import { useState } from "react";
import { api, formatPhone, type Me } from "../api";
import { t, useLang } from "../i18n";
import { canShareContact, haptic, shareContact } from "../tg";
import { ErrorText, message, toast } from "../ui";

const normalize = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;   // other countries
  return null;
};

/** Phone number: shared through Telegram (confirmed) or typed by hand, plus who may see it. */
export default function PhoneField({ me, onChanged }: { me: Me; onChanged: (m: Me) => void }) {
  useLang();
  const [manual, setManual] = useState(!canShareContact);
  const [value, setValue] = useState(me.phone.replace(/^\+998/, ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function viaTelegram() {
    setBusy(true); setError("");
    try {
      if (!(await shareContact())) {
        setError(t("s.phone.not_shared"));
        return;
      }
      // the number reaches the server through the bot a moment later
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const fresh = await api.me();
        if (fresh.phone_verified) {
          onChanged(fresh);
          haptic("success");
          return;
        }
      }
      setError(t("s.phone.not_arrived"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveManual() {
    const phone = normalize(value);
    if (!phone) {
      setError(t("s.phone.format"));
      return;
    }
    setBusy(true); setError("");
    try {
      onChanged(await api.updateMe({ phone }));
      haptic("success");
      toast(t("s.phone.saved"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisible(show: boolean) {
    try {
      onChanged(await api.updateMe({ show_phone: show }));
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div>
      {me.phone ? (
        <div className="row between">
          <span><b>{formatPhone(me.phone)}</b> {me.phone_verified ? <span className="badge peer_verified">{t("s.phone.via_tg")}</span> : <span className="badge todo">{t("s.phone.manual")}</span>}</span>
          <button className="btn small ghost" onClick={() => { onChanged({ ...me, phone: "" }); setManual(!canShareContact); }}>{t("s.phone.change")}</button>
        </div>
      ) : (
        <>
          {canShareContact && !manual && (
            <button className="btn" disabled={busy} onClick={viaTelegram}>{busy ? t("s.common.waiting") : t("s.phone.share")}</button>
          )}
          {manual && (
            <div className="row">
              <span style={{ padding: "10px 0" }}>+998</span>
              <input className="grow" value={value} inputMode="tel" maxLength={14} placeholder="90 123 45 67" onChange={(e) => setValue(e.target.value)} />
              <button className="btn small" disabled={busy} onClick={saveManual}>{t("common.save")}</button>
            </div>
          )}
          {canShareContact && (
            <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setManual(!manual)}>
              {manual ? t("s.phone.share_tg") : t("s.phone.type_other")}
            </button>
          )}
        </>
      )}
      <ErrorText error={error} />
      {me.phone && (
        <label className="row between" style={{ color: "var(--text)", marginTop: 10, cursor: "pointer" }}>
          <span>{t("s.phone.visible")}<div className="hint">{t("s.phone.visible_hint")}</div></span>
          <input type="checkbox" checked={me.show_phone} style={{ width: 22, height: 22, flex: "none" }} onChange={(e) => toggleVisible(e.target.checked)} />
        </label>
      )}
    </div>
  );
}
