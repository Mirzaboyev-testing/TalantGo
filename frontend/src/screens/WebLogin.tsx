import { useCallback, useState } from "react";
import { api } from "../api";
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
export default function WebLogin({ dev, onSignIn, onDev }: {
  dev: boolean; onSignIn: (getToken: GetToken) => void; onDev: (id: number, name: string) => void;
}) {
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
      ? [["w-name", isFullName(f.name), "ism va familiya"], ["w-email", emailOk, "email"],
         ["w-pass", f.password.length >= 8, "parol (kamida 8 belgi)"], ["w-pass2", f.password2 === f.password && f.password2 !== "", "parolni takrorlash"]]
      : [["w-email", emailOk, "email"], ["w-pass", f.password.length > 0, "parol"]]);
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
        <h1 style={{ marginBottom: 6 }}>TalantGo</h1>
        <p className="hint" style={{ marginTop: 0 }}>O'qish davomida haqiqiy tajriba, tasdiqlangan portfolio va birinchi ish.</p>

        <div className="card" style={{ marginTop: 18 }}>
          <button className="btn" disabled={bot.state !== "idle"} onClick={bot.begin}>Telegram orqali davom etish</button>
          <p className="hint" style={{ marginBottom: 0 }}>Bot va sayt bitta akkaunt bilan ishlaydi. Yangi bo'lsangiz, akkaunt o'zi ochiladi.</p>
          {bot.link && bot.state !== "idle" && <BotWaiting link={bot.link} state={bot.state} onCancel={bot.stop} onPin={bot.submitPin} />}
          <ErrorText error={bot.error} />
        </div>

        <div className="hint" style={{ margin: "6px 0 10px" }}>yoki email bilan</div>

        <div className="card" style={{ textAlign: "left" }}>
          <div className="segmented">
            <button className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setError(""); }}>Kirish</button>
            <button className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setError(""); }}>Ro'yxatdan o'tish</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {mode === "register" && (
              <Field id="w-name" label="Ism va familiya" required error={errors["w-name"] && "Ism va familiyani to'liq yozing"}>
                <input id="w-name" className={cls("w-name")} value={f.name} maxLength={128} autoComplete="name" onChange={set("name", "w-name")} />
              </Field>
            )}
            <Field id="w-email" label="Email" required error={errors["w-email"] && "Email noto'g'ri: masalan, ism@gmail.com"}>
              <input id="w-email" className={cls("w-email")} value={f.email} inputMode="email" autoComplete="email" onChange={set("email", "w-email")} />
            </Field>
            <Field id="w-pass" label="Parol" required error={errors["w-pass"] && (mode === "register" ? "Kamida 8 belgi" : "Parolni kiriting")}>
              <input id="w-pass" type="password" className={cls("w-pass")} value={f.password} maxLength={128}
                     autoComplete={mode === "register" ? "new-password" : "current-password"} onChange={set("password", "w-pass")} />
            </Field>
            {mode === "register" && (
              <Field id="w-pass2" label="Parolni takrorlang" required error={errors["w-pass2"] && "Parollar bir xil emas"}>
                <input id="w-pass2" type="password" className={cls("w-pass2")} value={f.password2} maxLength={128} autoComplete="new-password" onChange={set("password2", "w-pass2")} />
              </Field>
            )}
            <ErrorText error={error} />
            <button className="btn" type="submit" style={{ marginTop: 14 }} disabled={busy}>
              {busy ? "Kutilmoqda…" : mode === "register" ? "Ro'yxatdan o'tish" : "Kirish"}
            </button>
          </form>
          <p className="hint" style={{ marginBottom: 0 }}>
            {mode === "register"
              ? "Keyin «Profil» bo'limida Telegram'ni ulasangiz, bot ham shu akkauntni ochadi."
              : "Parolni unutdingizmi? Telegram ulangan bo'lsa, «Telegram orqali davom etish» bilan kirib «Profil» bo'limida yangi parol qo'ying. Aks holda TalantGo admini vaqtinchalik parol beradi."}
          </p>
        </div>

        <p className="hint">Telefoningizda qulayroq: <a href={BOT_URL}>Telegram'da ochish</a></p>

        {dev && (
          <div className="card" style={{ textAlign: "left" }}>
            <b>Sinov rejimi</b>
            <p className="hint">Faqat ishlab chiqish serverida ko'rinadi.</p>
            <label>Ism</label>
            <input value={devName} onChange={(e) => setDevName(e.target.value)} />
            <label>Sinov ID</label>
            <input value={devId} inputMode="numeric" onChange={(e) => setDevId(e.target.value.replace(/\D/g, ""))} />
            <button className="btn" style={{ marginTop: 12 }} disabled={!devName.trim() || !devId} onClick={() => onDev(Number(devId), devName.trim())}>Kirish</button>
          </div>
        )}
      </div>
    </div>
  );
}
