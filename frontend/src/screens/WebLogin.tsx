import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { t, useLang } from "../i18n";
import { PANELS, rememberPanel, type Panel } from "../public/panels";
import { navigate } from "../router";
import { Field, useRequired } from "../form";
import { BOT_URL } from "../tg";
import { ErrorText, isFullName, message } from "../ui";
import { BotWaiting, useBotLink } from "./BotLink";

type GetToken = () => Promise<{ token: string; moved_to?: string | null }>;

/**
 * The website's sign-in. Two ways, both on any domain:
 * through the bot (the same account as in Telegram), or with email and password (no Telegram needed;
 * Telegram can be tied to that account later in the profile).
 */
const PANEL_HINT: Record<Panel, "login.student_hint" | "login.company_hint" | "login.university_hint"> = {
  talaba: "login.student_hint", korxona: "login.company_hint", universitet: "login.university_hint",
};

export default function WebLogin({ dev, panel, onSignIn, onDev }: {
  dev: boolean; panel?: Panel; onSignIn: (getToken: GetToken) => void; onDev: (id: number, name: string) => void;
}) {
  useLang();
  useEffect(() => { if (panel) rememberPanel(panel); }, [panel]);
  const panelInfo = PANELS.find((p) => p.id === panel);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", password2: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devName, setDevName] = useState("Aziza Karimova");
  const [devId, setDevId] = useState("1001");
  const { errors, check, clear, cls } = useRequired();

  const bot = useBotLink(api.botLoginStart, api.botLoginVerify,
                         useCallback((r: { token: string }) => onSignIn(() => Promise.resolve(r)), [onSignIn]));

  const set = (k: keyof typeof f, id: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    clear(id);
  };

  async function submit() {
    const emailOk = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.trim());
    const ok = check(mode === "register"
      ? [["w-name", isFullName(f.name), t("s.common.c_name")], ["w-email", emailOk, t("s.common.c_email")],
         ["w-pass", f.password.length >= 8, t("s.web.c_pass8")],
         ["w-pass2", f.password2 === f.password && f.password2 !== "", t("s.web.c_pass2")]]
      : [["w-email", emailOk, t("s.common.c_email")], ["w-pass", f.password.length > 0, t("s.web.c_pass")]]);
    if (!ok) return;
    setBusy(true); setError("");
    try {
      const r = mode === "register"
        ? await api.emailRegister(f.name.trim(), f.email.trim(), f.password)
        : await api.emailLogin(f.email.trim(), f.password);
      onSignIn(() => Promise.resolve(r));
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <span className="brand-mark" style={{ display: "grid" }}>T</span>
        {panelInfo && panel ? (
          <>
            <h1 style={{ marginBottom: 6 }}>{t(panelInfo.title)}</h1>
            <p className="hint" style={{ marginTop: 0 }}>{t(PANEL_HINT[panel])}</p>
            <a href="/kirish" onClick={(e) => { e.preventDefault(); navigate("/kirish"); }}>{t("login.other_panel")}</a>
          </>
        ) : (
          <>
            <h1 style={{ marginBottom: 6 }}>TalantGo</h1>
            <p className="hint" style={{ marginTop: 0 }}>{t("s.web.tagline")}</p>
          </>
        )}

        <div className="card" style={{ marginTop: 18 }}>
          <button className="btn" disabled={bot.state !== "idle"} onClick={bot.begin}>{t("s.web.via_tg")}</button>
          <p className="hint" style={{ marginBottom: 0 }}>{t("s.web.tg_hint")}</p>
          {bot.link && bot.state !== "idle" && <BotWaiting link={bot.link} state={bot.state} onCancel={bot.stop} onPin={bot.submitPin} />}
          <ErrorText error={bot.error} />
        </div>

        <div className="hint" style={{ margin: "6px 0 10px" }}>{t("s.web.or_email")}</div>

        <div className="card" style={{ textAlign: "left" }}>
          <div className="segmented">
            <button className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setError(""); }}>{t("s.web.login")}</button>
            <button className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setError(""); }}>{t("s.web.register")}</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {mode === "register" && (
              <Field id="w-name" label={t("s.common.full_name")} required error={errors["w-name"] && t("s.common.full_name_error")}>
                <input id="w-name" className={cls("w-name")} value={f.name} maxLength={128} autoComplete="name" onChange={set("name", "w-name")} />
              </Field>
            )}
            <Field id="w-email" label="Email" required error={errors["w-email"] && t("s.web.email_error")}>
              <input id="w-email" className={cls("w-email")} value={f.email} inputMode="email" autoComplete="email" onChange={set("email", "w-email")} />
            </Field>
            <Field id="w-pass" label={t("s.common.password")} required
                   error={errors["w-pass"] && (mode === "register" ? t("s.common.min8") : t("s.web.pass_needed"))}>
              <input id="w-pass" type="password" className={cls("w-pass")} value={f.password} maxLength={128}
                     autoComplete={mode === "register" ? "new-password" : "current-password"} onChange={set("password", "w-pass")} />
            </Field>
            {mode === "register" && (
              <Field id="w-pass2" label={t("s.web.pass2")} required error={errors["w-pass2"] && t("s.web.pass_mismatch")}>
                <input id="w-pass2" type="password" className={cls("w-pass2")} value={f.password2} maxLength={128} autoComplete="new-password" onChange={set("password2", "w-pass2")} />
              </Field>
            )}
            <ErrorText error={error} />
            <button className="btn" type="submit" style={{ marginTop: 14 }} disabled={busy}>
              {busy ? t("s.common.waiting") : mode === "register" ? t("s.web.register") : t("s.web.login")}
            </button>
          </form>
          <p className="hint" style={{ marginBottom: 0 }}>
            {mode === "register" ? t("s.web.hint_register") : t("s.web.hint_login")}
          </p>
        </div>

        <p className="hint">{t("s.web.phone_better")} <a href={BOT_URL}>{t("s.web.open_tg")}</a></p>

        {dev && (
          <div className="card" style={{ textAlign: "left" }}>
            <b>{t("s.web.dev_title")}</b>
            <p className="hint">{t("s.web.dev_hint")}</p>
            <label>{t("s.web.dev_name")}</label>
            <input value={devName} onChange={(e) => setDevName(e.target.value)} />
            <label>{t("s.web.dev_id")}</label>
            <input value={devId} inputMode="numeric" onChange={(e) => setDevId(e.target.value.replace(/\D/g, ""))} />
            <button className="btn" style={{ marginTop: 12 }} disabled={!devName.trim() || !devId} onClick={() => onDev(Number(devId), devName.trim())}>{t("s.web.login")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
