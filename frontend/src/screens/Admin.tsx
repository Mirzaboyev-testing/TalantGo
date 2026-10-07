// The /admin page for a computer: the owner signs in with the password. Admins inside Telegram use
// the same panel from the app's "Boshqaruv" tab, with no password.
import { useState } from "react";
import { api, setAdminToken } from "../api";
import { ErrorText, message } from "../ui";
import AdminPanel from "./admin/AdminPanel";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  return <div className="app" style={{ paddingBottom: 32 }}>{authed ? <AdminPanel /> : <Login onOk={() => setAuthed(true)} />}</div>;
}

function Login({ onOk }: { onOk: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setAdminToken((await api.admin.login(password)).token);
      onOk();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: "15vh" }} onSubmit={submit}>
      <h1>CareerFlow boshqaruv</h1>
      <p className="hint">Ilova egasi paroli. Adminlar parolsiz, Telegram ilovasidagi «Boshqaruv» bo'limidan kiradi.</p>
      <label>Parol</label>
      <input type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
      <ErrorText error={error} />
      <div style={{ marginTop: 12 }}><button className="btn" type="submit" disabled={busy || !password}>Kirish</button></div>
    </form>
  );
}
