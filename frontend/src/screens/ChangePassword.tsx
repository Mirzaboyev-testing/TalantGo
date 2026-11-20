// «Parol va xavfsizlik» (2026-11-19): change the password with the current one; a forgotten current password is
// replaced through the bot's 6-digit code (services/password_reset.py), or, without Telegram, by a request to the
// admin who checks by phone. An account that signs in only through Telegram adds an e-mail and a first password here.
// One component for every panel: the student profile and settings, the company and university profiles.
// 2026-11-20 (review of e9ec19a): the sign-in e-mail can be changed again (PUT /me/email), a code that never came
// leads to the admin request, and switching steps starts clean.
import { useState } from "react";
import { api, type Me } from "../api";
import { Field, useRequired } from "../form";
import { t, useLang } from "../i18n";
import { Icon } from "../icons";
import { BOT_URL } from "../tg";
import { ErrorText, message, toast } from "../ui";
import PasswordInput from "./PasswordInput";

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
type Step = "change" | "email" | "bot" | "code" | "admin" | "sent";
type Check = [string, boolean, string];
// the admin reads requests in Uzbek, whatever language the person uses
const ADMIN_NOTE = "Paneldan: joriy parolni unutdi, bot kodi kelmadi yoki Telegram ulanmagan";

function Secret({ id, label, value, onChange, error, cls, autoComplete, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; cls: (id: string) => string;
  autoComplete: string; hint?: string;
}) {
  return (
    <Field id={id} label={label} required error={error} hint={hint}>
      <PasswordInput id={id} className={cls(id)} value={value} autoComplete={autoComplete} onChange={onChange} />
    </Field>
  );
}

export default function ChangePassword({ me, onChanged, bare = false }: { me: Me; onChanged: (m: Me) => void; bare?: boolean }) {
  useLang();
  const [step, setStep] = useState<Step>("change");
  const [f, setF] = useState({ email: me.email ?? "", current: "", password: "", password2: "", code: "", phone: me.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls } = useRequired();
  const set = (k: keyof typeof f, id: string) => (v: string) => { setF((cur) => ({ ...cur, [k]: v })); clear(id); setError(""); };
  const first = !me.has_password;
  const botCanReach = Boolean(me.has_telegram && me.email && !me.telegram_blocked);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  /** A new step starts clean: no old error, no red marks left from the previous form. */
  const go = (next: Step) => { setStep(next); setError(""); check([]); };
  /** Required fields first (one toast that names them), then a repeat that does not match gets its own message. */
  function valid(checks: Check[], withNew = true): boolean {
    const all: Check[] = withNew
      ? [...checks, ["cp-new", f.password.length >= 8, t("s.web.c_pass8")], ["cp-new2", f.password2 !== "", t("s.web.c_pass2")]]
      : checks;
    if (!check(all)) return false;
    if (withNew && f.password2 !== f.password) {
      check([["cp-new2", false, t("s.web.c_pass2")]]);
      setError(t("s.web.pass_mismatch"));
      return false;
    }
    return true;
  }
  const reset = () => setF((cur) => ({ ...cur, current: "", password: "", password2: "", code: "" }));

  function save() {
    const checks: Check[] = first
      ? [["cp-email", EMAIL.test(f.email.trim()), t("s.common.c_email")]]
      : [["cp-cur", f.current.length > 0, t("s.lm.c_cur_pass")]];
    if (!valid(checks)) return;
    void run(async () => {
      onChanged(await api.setPassword(first ? f.email.trim() : me.email ?? f.email.trim(), f.password, f.current));
      toast(first ? t("cp.done_new") : t("cp.done"));
      reset();
    });
  }
  function saveEmail() {
    if (!valid([["cp-email", EMAIL.test(f.email.trim()), t("cp.f_email")], ["cp-cur", f.current.length > 0, t("s.lm.c_cur_pass")]], false)) return;
    if (f.email.trim().toLowerCase() === (me.email ?? "").toLowerCase()) return setError(t("cp.email_same"));
    void run(async () => {
      onChanged(await api.changeEmail(f.email.trim(), f.current));
      toast(t("cp.email_done"));
      reset();
      go("change");
    });
  }
  const sendCode = () => run(async () => { await api.forgotPassword(me.email ?? ""); go("code"); });
  function saveByCode() {
    if (!valid([["cp-code", /^\d{6}$/.test(f.code.trim()), t("cp.f_code")]])) return;
    void run(async () => {
      await api.resetPasswordHere({ email: me.email ?? "", code: f.code.trim(), password: f.password });
      // the password is changed now: say so and leave the code step even if refreshing the profile fails
      toast(t("cp.done"));
      reset();
      go("change");
      api.me().then(onChanged, () => {});
    });
  }
  function askAdmin() {
    if (!valid([["cp-phone", f.phone.replace(/\D/g, "").length >= 7, t("cp.f_phone")]], false)) return;
    void run(async () => {
      await api.passwordHelp({ email: me.email ?? "", full_name: me.full_name, phone: f.phone.trim(), note: ADMIN_NOTE });
      go("sent");
    });
  }

  const newFields = (
    <>
      <Secret id="cp-new" label={first ? t("s.common.password") : t("pw.new")} value={f.password} onChange={set("password", "cp-new")}
              error={errors["cp-new"] && t("s.common.min8")} cls={cls} autoComplete="new-password" hint={t("cp.strength")} />
      <Secret id="cp-new2" label={first ? t("s.web.pass2") : t("pw.new2")} value={f.password2} onChange={set("password2", "cp-new2")}
              error={errors["cp-new2"] && t("s.web.pass_mismatch")} cls={cls} autoComplete="new-password" />
    </>
  );
  const back = (label = t("cp.back")) => (
    <p style={{ margin: "12px 0 0" }}>
      <button type="button" className="link-btn" disabled={busy} onClick={() => { reset(); go("change"); }}>{label}</button>
    </p>
  );
  const noCode = (
    <p style={{ margin: "10px 0 0" }}>
      <button type="button" className="link-btn" disabled={busy} onClick={() => go("admin")}>{t("cp.no_code")}</button>
    </p>
  );
  const adminForm = (lead: string) => (
    <form onSubmit={(e) => { e.preventDefault(); askAdmin(); }}>
      <p className="hint">{lead}</p>
      <Field id="cp-phone" label={t("pw.phone")} required error={errors["cp-phone"] && t("pw.phone_error")}>
        <input id="cp-phone" className={cls("cp-phone")} value={f.phone} inputMode="tel" autoComplete="tel" maxLength={20}
               placeholder="+998 90 123 45 67" onChange={(e) => set("phone", "cp-phone")(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <button className="btn" type="submit" disabled={busy}>{busy ? t("s.common.waiting") : t("cp.ask_admin")}</button>
    </form>
  );

  const body = (
    <>
      {step === "change" && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <p className="hint cp-lead">{first ? t("cp.hint_new") : t("cp.hint")}</p>
          {first ? (
            <Field id="cp-email" label="Email" required error={errors["cp-email"] && t("s.web.email_error")}>
              <input id="cp-email" className={cls("cp-email")} value={f.email} inputMode="email" autoComplete="email"
                     onChange={(e) => set("email", "cp-email")(e.target.value)} />
            </Field>
          ) : (
            <>
              {me.email && (
                <div className="cp-account">
                  <Icon name="mail" size={15} /><span className="grow">{t("cp.login_email", { email: me.email })}</span>
                  <button type="button" className="link-btn" onClick={() => { setF((cur) => ({ ...cur, email: me.email ?? "", current: "" })); go("email"); }}>
                    {t("cp.email_change")}
                  </button>
                </div>
              )}
              <Secret id="cp-cur" label={t("s.lm.cur_pass")} value={f.current} onChange={set("current", "cp-cur")}
                      error={errors["cp-cur"] && t("s.lm.cur_pass_error")} cls={cls} autoComplete="current-password" />
            </>
          )}
          {newFields}
          <ErrorText error={error} />
          <div className="cp-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? t("s.common.saving") : first ? t("cp.set") : t("cp.save")}</button>
            {!first && <button type="button" className="link-btn" disabled={busy} onClick={() => { reset(); go("bot"); }}>{t("cp.forgot")}</button>}
          </div>
        </form>
      )}

      {step === "email" && (
        <form onSubmit={(e) => { e.preventDefault(); saveEmail(); }}>
          <p className="cp-sub"><Icon name="mail" size={16} /><b>{t("cp.email_title")}</b></p>
          <p className="hint">{t("cp.email_hint")}</p>
          <Field id="cp-email" label={t("cp.email_new")} required error={errors["cp-email"] && t("s.web.email_error")}>
            <input id="cp-email" className={cls("cp-email")} value={f.email} inputMode="email" autoComplete="email"
                   onChange={(e) => set("email", "cp-email")(e.target.value)} />
          </Field>
          <Secret id="cp-cur" label={t("s.lm.cur_pass")} value={f.current} onChange={set("current", "cp-cur")}
                  error={errors["cp-cur"] && t("s.lm.cur_pass_error")} cls={cls} autoComplete="current-password" />
          <ErrorText error={error} />
          <div className="cp-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? t("s.common.saving") : t("cp.email_save")}</button>
          </div>
          {back(t("common.cancel"))}
        </form>
      )}

      {step === "bot" && (
        <div>
          <p className="cp-sub"><Icon name="send" size={16} /><b>{t("cp.bot_title")}</b></p>
          {botCanReach ? (
            <>
              <p className="hint">{t("cp.bot_hint")}</p>
              <ErrorText error={error} />
              <button className="btn" disabled={busy} onClick={() => void sendCode()}>{busy ? t("s.common.waiting") : t("cp.bot_send")}</button>
              {noCode}
            </>
          ) : adminForm(me.has_telegram && me.telegram_blocked ? t("cp.tg_blocked") : t("cp.no_tg"))}
          {back()}
        </div>
      )}

      {step === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); saveByCode(); }}>
          <p className="hint">{t("cp.code_sent")} <a href={BOT_URL} target="_blank" rel="noreferrer">{t("pw.open_bot")}</a></p>
          <Field id="cp-code" label={t("pw.code")} required error={errors["cp-code"] && t("pw.code_error")}>
            <input id="cp-code" className={cls("cp-code")} value={f.code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                   onChange={(e) => set("code", "cp-code")(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {newFields}
          <ErrorText error={error} />
          <div className="cp-actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? t("s.common.saving") : t("cp.save")}</button>
            <button type="button" className="link-btn" disabled={busy} onClick={() => void sendCode()}>{t("cp.resend")}</button>
          </div>
          {noCode}
          {back()}
        </form>
      )}

      {step === "admin" && (
        <div>
          <p className="cp-sub"><Icon name="user" size={16} /><b>{t("cp.ask_admin")}</b></p>
          {adminForm(me.has_telegram && me.telegram_blocked ? t("cp.tg_blocked") : t("cp.no_tg"))}
          {back()}
        </div>
      )}

      {step === "sent" && (
        <div>
          <p className="notice" style={{ margin: 0 }}>{t("cp.ask_sent", { phone: f.phone.trim() })}</p>
          {back()}
        </div>
      )}
    </>
  );

  if (bare) return <div className="cp">{body}</div>;
  return (
    <div className="co-card cp" id="parol">
      <div className="co-card-head"><b className="row" style={{ gap: 8 }}><Icon name="lock" size={18} />{t("cp.title")}</b></div>
      {body}
    </div>
  );
}
