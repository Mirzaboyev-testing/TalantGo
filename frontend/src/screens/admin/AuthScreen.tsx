import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorText, message } from "../../ui";
import { saveToken } from "./session";

/** Email + password sign-in and sign-up for the admin website. */
export default function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [needsOwner, setNeedsOwner] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.adminAuth.status().then((s) => { setNeedsOwner(s.needs_owner); if (s.needs_owner) setMode("register"); }, () => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register" && password !== repeat) return setError("Parollar bir xil emas");
    setBusy(true);
    try {
      if (mode === "login") {
        saveToken((await api.adminAuth.login(email.trim(), password)).token);
        onSignedIn();
      } else {
        const r = await api.adminAuth.register({ name: name.trim(), email: email.trim(), password, setup_code: needsOwner ? code : undefined });
        if (r.token) {
          saveToken(r.token);
          onSignedIn();
        } else {
          setPending(true);
        }
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="admin-brand" style={{ justifyContent: "center" }}><i>C</i>CareerFlow admin</div>
        {pending ? (
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>So'rov yuborildi ⏳</h3>
            <p>Ilova egasi hisobingizni tasdiqlagach, shu email va parol bilan kira olasiz.</p>
            <button className="btn ghost" onClick={() => { setPending(false); setMode("login"); }}>Kirish sahifasiga qaytish</button>
          </div>
        ) : (
          <form className="panel" onSubmit={submit}>
            {!needsOwner && (
              <div className="segmented" style={{ background: "var(--page-bg)" }}>
                <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Kirish</button>
                <button type="button" className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>Ro'yxatdan o'tish</button>
              </div>
            )}
            {needsOwner && (
              <p className="notice">Birinchi hisob ilova egasiniki bo'ladi. Serverdagi admin parolini «sozlash kodi» sifatida kiriting.</p>
            )}
            {mode === "register" && (
              <>
                <label>Ism</label>
                <input value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />
              </>
            )}
            <label>Email</label>
            <input type="email" value={email} autoComplete="email" placeholder="ism@gmail.com" onChange={(e) => setEmail(e.target.value)} />
            <label>Parol{mode === "register" ? " (kamida 10 belgi)" : ""}</label>
            <input type="password" value={password} autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={(e) => setPassword(e.target.value)} />
            {mode === "register" && (
              <>
                <label>Parolni takrorlang</label>
                <input type="password" value={repeat} autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} />
              </>
            )}
            {mode === "register" && needsOwner && (
              <>
                <label>Sozlash kodi</label>
                <input type="password" value={code} autoComplete="off" onChange={(e) => setCode(e.target.value)} />
              </>
            )}
            {mode === "register" && !needsOwner && <p className="hint">Hisobingiz ilova egasi tasdiqlagandan keyin ochiladi.</p>}
            <ErrorText error={error} />
            <button className="btn" style={{ marginTop: 14 }} disabled={busy || !email || !password || (mode === "register" && (name.trim().length < 2 || password.length < 10))}>
              {busy ? "Kuting…" : mode === "login" ? "Kirish" : needsOwner ? "Ega hisobini yaratish" : "So'rov yuborish"}
            </button>
            {mode === "login" && <p className="hint" style={{ marginBottom: 0 }}>Parolni unutdingizmi? Ilova egasidan parolni tiklashni so'rang.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
