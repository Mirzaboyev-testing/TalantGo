import { useCallback, useState } from "react";
import { api, type Me } from "../api";
import { Field, useRequired } from "../form";
import { t, useLang } from "../i18n";
import { insideTelegram } from "../tg";
import { ErrorText, message, toast } from "../ui";
import { BotWaiting, useBotLink } from "./BotLink";

/**
 * "Kirish usullari": one account for the bot and the website.
 * A Telegram account adds an email and password (to sign in on a computer); a website account ties Telegram.
 */
export default function LoginMethods({ me, onChanged }: { me: Me; onChanged: (m: Me) => void }) {
  useLang();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: me.email ?? "", password: "", current: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls } = useRequired();

  const link = useBotLink(api.telegramLinkStart, api.telegramLinkVerify, useCallback((m: Me) => {
    onChanged(m);
    toast(t("s.lm.tg_linked"));
  }, [onChanged]));

  async function save() {
    const ok = check([
      ["lm-email", /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.trim()), t("s.common.c_email")],
      ["lm-pass", f.password.length >= 8, t("s.lm.c_new_pass")],
      ...(me.has_password ? [["lm-cur", f.current.length > 0, t("s.lm.c_cur_pass")] as [string, boolean, string]] : []),
    ]);
    if (!ok) return;
    setBusy(true); setError("");
    try {
      onChanged(await api.setPassword(f.email.trim(), f.password, f.current));
      toast(me.has_password ? t("s.lm.pass_updated") : t("s.lm.pass_added"));
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
      <b>{t("s.lm.title")}</b>
      <p className="hint">{t("s.lm.hint")}</p>

      <div className="row between" style={{ marginTop: 6 }}>
        <span>Telegram</span>
        {me.has_telegram ? <span className="badge peer_verified">{t("s.lm.linked")}</span>
          : <button className="btn small" disabled={link.state !== "idle"} onClick={link.begin}>{t("s.lm.link_tg")}</button>}
      </div>
      {!me.has_telegram && link.state === "idle" && (
        <div className="hint">{t("s.lm.tg_hint")}</div>
      )}
      {link.link && link.state !== "idle" && <BotWaiting link={link.link} state={link.state} onCancel={link.stop} onPin={link.submitPin} />}
      <ErrorText error={link.error} />

      <div className="row between" style={{ marginTop: 12 }}>
        <span>{t("s.lm.email_pass")}{me.email ? `: ${me.email}` : ""}</span>
        <button className="btn small ghost" onClick={() => setOpen(!open)}>
          {me.has_password ? t("s.lm.change_pass") : t("s.lm.add")}
        </button>
      </div>
      {!me.has_password && !open && insideTelegram && (
        <div className="hint">{t("s.lm.add_hint")}</div>
      )}
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field id="lm-email" label="Email" required error={errors["lm-email"] && t("s.lm.email_error")}>
            <input id="lm-email" className={cls("lm-email")} value={f.email} inputMode="email" autoComplete="email"
                   onChange={(e) => { setF({ ...f, email: e.target.value }); clear("lm-email"); }} />
          </Field>
          {me.has_password && (
            <Field id="lm-cur" label={t("s.lm.cur_pass")} required error={errors["lm-cur"] && t("s.lm.cur_pass_error")}>
              <input id="lm-cur" type="password" className={cls("lm-cur")} value={f.current} autoComplete="current-password"
                     onChange={(e) => { setF({ ...f, current: e.target.value }); clear("lm-cur"); }} />
            </Field>
          )}
          <Field id="lm-pass" label={me.has_password ? t("s.lm.new_pass") : t("s.common.password")} required error={errors["lm-pass"] && t("s.common.min8")}>
            <input id="lm-pass" type="password" className={cls("lm-pass")} value={f.password} autoComplete="new-password"
                   onChange={(e) => { setF({ ...f, password: e.target.value }); clear("lm-pass"); }} />
          </Field>
          <ErrorText error={error} />
          <button className="btn" type="submit" style={{ marginTop: 12 }} disabled={busy}>{busy ? t("s.common.saving") : t("common.save")}</button>
        </form>
      )}
    </div>
  );
}
