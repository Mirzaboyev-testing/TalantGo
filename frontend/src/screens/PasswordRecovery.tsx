import { useEffect, useState } from "react";
import { api, type Me, type ResetLinkInfo } from "../api";
import { Field, useRequired } from "../form";
import { t, useLang } from "../i18n";
import { navigate, useSearch } from "../router";
import { BOT_URL } from "../tg";
import { ErrorText, isFullName, message, toast } from "../ui";

type GetToken = () => Promise<{ token: string }>;
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/** Two password fields that must match; `ok` is what the form checks before sending. */
function NewPassword({ value, onChange, errors, cls, clear }: {
  value: { password: string; password2: string }; onChange: (v: { password: string; password2: string }) => void;
  errors: Record<string, string | undefined>; cls: (id: string) => string; clear: (id: string) => void;
}) {
  return (
    <>
      <Field id="pw-new" label={t("pw.new")} required error={errors["pw-new"] && t("s.common.min8")}>
        <input id="pw-new" type="password" className={cls("pw-new")} value={value.password} maxLength={128} autoComplete="new-password"
               onChange={(e) => { onChange({ ...value, password: e.target.value }); clear("pw-new"); }} />
      </Field>
      <Field id="pw-new2" label={t("pw.new2")} required error={errors["pw-new2"] && t("s.web.pass_mismatch")}>
        <input id="pw-new2" type="password" className={cls("pw-new2")} value={value.password2} maxLength={128} autoComplete="new-password"
               onChange={(e) => { onChange({ ...value, password2: e.target.value }); clear("pw-new2"); }} />
      </Field>
    </>
  );
}

const passwordChecks = (v: { password: string; password2: string }): [string, boolean, string][] => [
  ["pw-new", v.password.length >= 8, t("s.web.c_pass8")],
  ["pw-new2", v.password2 === v.password && v.password2 !== "", t("s.web.c_pass2")],
];

/** "Parolni unutdim" on the sign-in page: the bot's code, or a request to the admin when there is no Telegram. */
export function ForgotPassword({ initialEmail, onSignIn, onBack }: {
  initialEmail: string; onSignIn: (getToken: GetToken) => void; onBack: () => void;
}) {
  useLang();
  const [step, setStep] = useState<"email" | "code" | "help" | "sent">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState({ password: "", password2: "" });
  const [help, setHelp] = useState({ name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls } = useRequired();

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  const sendCode = () => {
    if (!check([["pw-email", EMAIL.test(email.trim()), t("s.common.c_email")]])) return;
    void run(async () => { await api.forgotPassword(email.trim()); setStep("code"); });
  };
  const save = () => {
    if (!check([["pw-code", /^\d{6}$/.test(code.trim()), t("pw.code_error")], ...passwordChecks(pw)])) return;
    void run(async () => {
      const r = await api.resetPassword({ email: email.trim(), code: code.trim(), password: pw.password });
      onSignIn(() => Promise.resolve(r));
    });
  };
  const ask = () => {
    if (!check([["pw-email", EMAIL.test(email.trim()), t("s.common.c_email")], ["pw-name", isFullName(help.name), t("s.common.c_name")],
                ["pw-phone", help.phone.replace(/\D/g, "").length >= 7, t("pw.phone_error")]])) return;
    void run(async () => {
      await api.passwordHelp({ email: email.trim(), full_name: help.name.trim(), phone: help.phone.trim(), note: help.note.trim() });
      setStep("sent");
    });
  };

  const emailField = (
    <Field id="pw-email" label="Email" required error={errors["pw-email"] && t("s.web.email_error")}>
      <input id="pw-email" className={cls("pw-email")} value={email} inputMode="email" autoComplete="email"
             onChange={(e) => { setEmail(e.target.value); clear("pw-email"); }} />
    </Field>
  );

  return (
    <div className="login-form">
      <h2 style={{ margin: "0 0 4px" }}>{step === "help" || step === "sent" ? t("pw.help_title") : t("pw.title")}</h2>
      {step === "email" && (
        <form onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
          <p className="hint">{t("pw.email_step")}</p>
          {emailField}
          <ErrorText error={error} />
          <button className="btn" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? t("s.common.waiting") : t("pw.send_code")}</button>
        </form>
      )}
      {step === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <p className="hint">{t("pw.code_sent")} <a href={BOT_URL} target="_blank" rel="noreferrer">{t("pw.open_bot")}</a></p>
          <Field id="pw-code" label={t("pw.code")} required error={errors["pw-code"] && t("pw.code_error")}>
            <input id="pw-code" className={cls("pw-code")} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                   onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); clear("pw-code"); }} />
          </Field>
          <NewPassword value={pw} onChange={setPw} errors={errors} cls={cls} clear={clear} />
          <ErrorText error={error} />
          <button className="btn" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? t("s.common.waiting") : t("pw.save")}</button>
        </form>
      )}
      {step === "help" && (
        <form onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <p className="hint">{t("pw.help_hint")}</p>
          {emailField}
          <Field id="pw-name" label={t("s.common.full_name")} required error={errors["pw-name"] && t("s.common.full_name_error")}>
            <input id="pw-name" className={cls("pw-name")} value={help.name} maxLength={128} autoComplete="name"
                   onChange={(e) => { setHelp({ ...help, name: e.target.value }); clear("pw-name"); }} />
          </Field>
          <Field id="pw-phone" label={t("pw.phone")} required error={errors["pw-phone"] && t("pw.phone_error")}>
            <input id="pw-phone" className={cls("pw-phone")} value={help.phone} inputMode="tel" autoComplete="tel" maxLength={20}
                   placeholder="+998 90 123 45 67" onChange={(e) => { setHelp({ ...help, phone: e.target.value }); clear("pw-phone"); }} />
          </Field>
          <Field id="pw-note" label={t("pw.note")}>
            <input id="pw-note" value={help.note} maxLength={500} onChange={(e) => setHelp({ ...help, note: e.target.value })} />
          </Field>
          <ErrorText error={error} />
          <button className="btn" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? t("s.common.waiting") : t("pw.help_send")}</button>
        </form>
      )}
      {step === "sent" && <p className="hint">{t("pw.help_sent")}</p>}
      {(step === "email" || step === "code") && (
        <p className="hint" style={{ marginBottom: 0 }}>
          <button type="button" className="link-btn" onClick={() => { setStep("help"); setError(""); }}>{t("pw.no_code")}</button>
        </p>
      )}
      <p className="hint" style={{ marginBottom: 0 }}>
        <button type="button" className="link-btn" onClick={onBack}>{t("pw.back")}</button>
      </p>
    </div>
  );
}

/** /parol-tiklash?t=…: the link from the bot (/parol). A Telegram-only account adds its e-mail here. */
export function ResetByLink({ onSignIn }: { onSignIn: (getToken: GetToken) => void }) {
  useLang();
  const token = useSearch().t ?? "";
  const [info, setInfo] = useState<ResetLinkInfo | null>(null);
  const [bad, setBad] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState({ password: "", password2: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls } = useRequired();
  useEffect(() => {
    if (!token) { setBad(t("pw.link_bad")); return; }
    api.resetLinkInfo(token).then(setInfo, () => setBad(t("pw.link_bad")));
  }, [token]);

  async function save() {
    const needsEmail = info && !info.email;
    if (!check([...(needsEmail ? [["pw-email", EMAIL.test(email.trim()), t("s.common.c_email")] as [string, boolean, string]] : []),
                ...passwordChecks(pw)])) return;
    setBusy(true); setError("");
    try {
      const r = await api.resetPassword({ token, password: pw.password, ...(needsEmail ? { email: email.trim() } : {}) });
      const panel = info?.account_type === "employer" ? "korxona" : info?.account_type === "university" ? "universitet" : "talaba";
      navigate(`/kirish/${panel}`, { replace: true });          // after signing in, App opens the panel
      onSignIn(() => Promise.resolve(r));
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div className="pub-wrap" style={{ maxWidth: 460, padding: "32px 16px 48px" }}>
      <div className="card login-form">
        <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>{t("pw.link_title")}</h1>
        {bad && <p className="error">{bad}</p>}
        {!bad && !info && <p className="hint">{t("common.loading")}</p>}
        {info && (
          <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <p className="hint">{t("pw.link_hello", { name: info.name })}{info.email ? ` (${info.email})` : ""}</p>
            {!info.email && (
              <>
                <p className="hint">{t("pw.link_add_email")}</p>
                <Field id="pw-email" label="Email" required error={errors["pw-email"] && t("s.web.email_error")}>
                  <input id="pw-email" className={cls("pw-email")} value={email} inputMode="email" autoComplete="email"
                         onChange={(e) => { setEmail(e.target.value); clear("pw-email"); }} />
                </Field>
              </>
            )}
            <NewPassword value={pw} onChange={setPw} errors={errors} cls={cls} clear={clear} />
            <ErrorText error={error} />
            <button className="btn" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? t("s.common.waiting") : t("pw.save")}</button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Signed in with the owner's temporary password: a new password before anything else. */
export function MustChangePassword({ me, onDone, onLogout }: { me: Me; onDone: (m: Me) => void; onLogout: () => void }) {
  useLang();
  const [pw, setPw] = useState({ password: "", password2: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls } = useRequired();

  async function save() {
    if (!check(passwordChecks(pw))) return;
    setBusy(true); setError("");
    try {
      const m = await api.setPassword(me.email ?? "", pw.password, "");
      toast(t("pw.saved"));
      onDone(m);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div className="center" style={{ padding: 16 }}>
      <form className="card login-form" style={{ width: "100%", maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>{t("pw.must_title")}</h1>
        <p className="hint">{t("pw.must_hint")}</p>
        <NewPassword value={pw} onChange={setPw} errors={errors} cls={cls} clear={clear} />
        <ErrorText error={error} />
        <button className="btn" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? t("s.common.waiting") : t("common.save")}</button>
        <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={onLogout}>{t("shell.logout")}</button>
      </form>
    </div>
  );
}
