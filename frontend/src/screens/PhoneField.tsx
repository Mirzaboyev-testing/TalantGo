import { useState } from "react";
import { api, type Me } from "../api";
import { canShareContact, haptic, shareContact } from "../tg";
import { ErrorText, message } from "../ui";

const normalize = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return null;
};

/** Phone number: shared through Telegram (confirmed) or typed by hand, plus who may see it. */
export default function PhoneField({ me, onChanged }: { me: Me; onChanged: (m: Me) => void }) {
  const [manual, setManual] = useState(!canShareContact);
  const [value, setValue] = useState(me.phone.replace(/^\+998/, ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function viaTelegram() {
    setBusy(true); setError("");
    try {
      if (!(await shareContact())) {
        setError("Raqam ulashilmadi. Qo'lda kiritishingiz mumkin.");
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
      setError("Raqam hali yetib kelmadi. Bir ozdan keyin qayta urinib ko'ring yoki qo'lda kiriting.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveManual() {
    const phone = normalize(value);
    if (!phone) {
      setError("Raqamni 90 123 45 67 ko'rinishida kiriting");
      return;
    }
    setBusy(true); setError("");
    try {
      onChanged(await api.updateMe({ phone }));
      haptic("success");
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
          <span><b>{me.phone}</b> {me.phone_verified ? <span className="badge peer_verified">✓ Telegram</span> : <span className="badge todo">qo'lda kiritilgan</span>}</span>
          <button className="btn small ghost" onClick={() => { onChanged({ ...me, phone: "" }); setManual(!canShareContact); }}>O'zgartirish</button>
        </div>
      ) : (
        <>
          {canShareContact && !manual && (
            <button className="btn" disabled={busy} onClick={viaTelegram}>{busy ? "Kutilmoqda…" : "📱 Telegram raqamimni ulashish"}</button>
          )}
          {manual && (
            <div className="row">
              <span style={{ padding: "10px 0" }}>+998</span>
              <input className="grow" value={value} inputMode="tel" maxLength={14} placeholder="90 123 45 67" onChange={(e) => setValue(e.target.value)} />
              <button className="btn small" disabled={busy} onClick={saveManual}>Saqlash</button>
            </div>
          )}
          {canShareContact && (
            <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setManual(!manual)}>
              {manual ? "Telegram orqali ulashish" : "Boshqa raqamni qo'lda kiritish"}
            </button>
          )}
        </>
      )}
      <ErrorText error={error} />
      {me.phone && (
        <label className="row between" style={{ color: "var(--text)", marginTop: 10, cursor: "pointer" }}>
          <span>Raqamim boshqa talabalarga ko'rinsin<div className="hint">O'chiq bo'lsa, faqat siz ariza bergan yoki rozilik bergan kompaniyalar ko'radi</div></span>
          <input type="checkbox" checked={me.show_phone} style={{ width: 22, height: 22, flex: "none" }} onChange={(e) => toggleVisible(e.target.checked)} />
        </label>
      )}
    </div>
  );
}
