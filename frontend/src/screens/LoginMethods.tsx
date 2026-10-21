import { useCallback, useState } from "react";
import { api, type Me } from "../api";
import { Field, useRequired } from "../form";
import { insideTelegram } from "../tg";
import { ErrorText, message, toast } from "../ui";
import { BotWaiting, useBotLink } from "./BotLink";

/**
 * "Kirish usullari": one account for the bot and the website.
 * A Telegram account adds an email and password (to sign in on a computer); a website account ties Telegram.
 */
export default function LoginMethods({ me, onChanged }: { me: Me; onChanged: (m: Me) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: me.email ?? "", password: "", current: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls } = useRequired();

  const link = useBotLink(api.telegramLinkStart, api.telegramLinkVerify, useCallback((m: Me) => {
    onChanged(m);
    toast("Telegram ulandi: bot va sayt endi bitta akkaunt");
  }, [onChanged]));

  async function save() {
    const ok = check([
      ["lm-email", /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.trim()), "email"],
      ["lm-pass", f.password.length >= 8, "yangi parol (kamida 8 belgi)"],
      ...(me.has_password ? [["lm-cur", f.current.length > 0, "joriy parol"] as [string, boolean, string]] : []),
    ]);
    if (!ok) return;
    setBusy(true); setError("");
    try {
      onChanged(await api.setPassword(f.email.trim(), f.password, f.current));
      toast(me.has_password ? "Parol yangilandi" : "Endi saytga email va parol bilan ham kira olasiz");
      setOpen(false);
      setF({ ...f, password: "", current: "" });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <b>Kirish usullari</b>
      <p className="hint">Bot va sayt bitta akkaunt bilan ishlaydi: qaysi usul bilan kirsangiz ham, ma'lumotlaringiz bir joyda.</p>

      <div className="row between" style={{ marginTop: 6 }}>
        <span>Telegram</span>
        {me.has_telegram ? <span className="badge peer_verified">Ulangan</span>
          : <button className="btn small" disabled={link.state !== "idle"} onClick={link.begin}>Telegram'ni ulash</button>}
      </div>
      {!me.has_telegram && link.state === "idle" && (
        <div className="hint">Telegram ulansa, ariza, test va tasdiq haqidagi xabarlar botga keladi.</div>
      )}
      {link.link && link.state !== "idle" && <BotWaiting link={link.link} state={link.state} onCancel={link.stop} onPin={link.submitPin} />}
      <ErrorText error={link.error} />

      <div className="row between" style={{ marginTop: 12 }}>
        <span>Email va parol{me.email ? `: ${me.email}` : ""}</span>
        <button className="btn small ghost" onClick={() => setOpen(!open)}>
          {me.has_password ? "Parolni o'zgartirish" : "Qo'shish"}
        </button>
      </div>
      {!me.has_password && !open && insideTelegram && (
        <div className="hint">Kompyuterda saytga kirish uchun email va parol qo'shing.</div>
      )}
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field id="lm-email" label="Email" required error={errors["lm-email"] && "Email noto'g'ri"}>
            <input id="lm-email" className={cls("lm-email")} value={f.email} inputMode="email" autoComplete="email"
                   onChange={(e) => { setF({ ...f, email: e.target.value }); clear("lm-email"); }} />
          </Field>
          {me.has_password && (
            <Field id="lm-cur" label="Joriy parol" required error={errors["lm-cur"] && "Joriy parolni kiriting"}>
              <input id="lm-cur" type="password" className={cls("lm-cur")} value={f.current} autoComplete="current-password"
                     onChange={(e) => { setF({ ...f, current: e.target.value }); clear("lm-cur"); }} />
            </Field>
          )}
          <Field id="lm-pass" label={me.has_password ? "Yangi parol" : "Parol"} required error={errors["lm-pass"] && "Kamida 8 belgi"}>
            <input id="lm-pass" type="password" className={cls("lm-pass")} value={f.password} autoComplete="new-password"
                   onChange={(e) => { setF({ ...f, password: e.target.value }); clear("lm-pass"); }} />
          </Field>
          <ErrorText error={error} />
          <button className="btn" type="submit" style={{ marginTop: 12 }} disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        </form>
      )}
    </div>
  );
}
