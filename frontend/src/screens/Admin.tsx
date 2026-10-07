import { useCallback, useEffect, useState } from "react";
import { api, setAdminToken, STATUS_LABEL, type AdminUser, type BotStatus, type Role, type Status } from "../api";
import { ErrorText, message } from "../ui";

type Stats = { users: number; with_track: number; submissions: Record<Status, number> };

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  return <div className="app">{authed ? <Panel /> : <Login onOk={() => setAuthed(true)} />}</div>;
}

function Login({ onOk }: { onOk: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setAdminToken((await api.admin.login(password)).token);
      onOk();
    } catch (err) {
      setError(message(err));
    }
  }
  return (
    <form className="card" style={{ marginTop: "15vh" }} onSubmit={submit}>
      <h1>CareerFlow admin</h1>
      <label>Parol</label>
      <input type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
      <ErrorText error={error} />
      <div style={{ marginTop: 12 }}><button className="btn" type="submit">Kirish</button></div>
    </form>
  );
}

function Panel() {
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, s, u] = await Promise.all([api.admin.bot(), api.admin.stats(), api.admin.users()]);
      setBot(b); setStats(s); setUsers(u);
    } catch (e) {
      setError(message(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function changeRole(id: number, role: Role) {
    try {
      const updated = await api.admin.setRole(id, role);
      setUsers((cur) => cur.map((u) => (u.id === id ? updated : u)));
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div>
      <h1>Admin panel</h1>
      <ErrorText error={error} />
      {bot && <BotCard status={bot} onChanged={load} />}

      {stats && (
        <>
          <h2>Statistika</h2>
          <div className="stats">
            <div className="stat"><b>{stats.users}</b><span>foydalanuvchi</span></div>
            <div className="stat"><b>{stats.with_track}</b><span>yo'l tanlagan</span></div>
            <div className="stat"><b>{Object.values(stats.submissions).reduce((a, b) => a + b, 0)}</b><span>topshirilgan ish</span></div>
          </div>
          <div className="card hint">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => `${STATUS_LABEL[s]}: ${stats.submissions[s] ?? 0}`).join(" · ")}
          </div>
        </>
      )}

      <h2>Foydalanuvchilar va rollar</h2>
      <p className="hint">Mentor tengdoshlar tasdiqlagan ishlarni yakuniy tasdiqlaydi. Admin rolida ham mentor huquqi bor.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Ism</th><th>Guruh</th><th>Ball</th><th>Rol</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}{u.username && <div className="hint">@{u.username}</div>}</td>
                <td>{u.group_name}</td>
                <td>{u.points}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as Role)}>
                    <option value="student">talaba</option>
                    <option value="mentor">mentor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotCard({ status, onChanged }: { status: BotStatus; onChanged: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function run(action: () => Promise<string>) {
    setBusy(true); setError(""); setResult("");
    try {
      setResult(await action());
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <b>Telegram bot</b>
        <span className={`badge ${status.configured ? "peer_verified" : "rejected"}`}>{status.configured ? "Sozlangan" : "Sozlanmagan"}</span>
      </div>
      {status.hint && <p className="hint">Saqlangan token: {status.hint}</p>}
      <label>Bot token (BotFather bergan; saqlangach faqat qisqartirilgan ko'rinishi qoladi)</label>
      <input type="password" value={token} placeholder="123456789:AA…" autoComplete="off" onChange={(e) => setToken(e.target.value.trim())} />
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button className="btn small" disabled={busy || !token}
                onClick={() => run(async () => { await api.admin.saveBot(token); setToken(""); return "Token saqlandi va tekshirildi."; })}>Saqlash</button>
        <button className="btn small ghost" disabled={busy || !status.configured}
                onClick={() => run(async () => `Ishlayapti: @${(await api.admin.testBot()).username}`)}>Tekshirish</button>
        <button className="btn small ghost" disabled={busy || !status.configured}
                onClick={() => run(async () => `@${(await api.admin.connectBot()).username} menyusi ${status.public_url} ga ulandi.`)}>Botni ilovaga ulash</button>
      </div>
      {result && <p className="notice" style={{ marginTop: 10 }}>{result}</p>}
      <ErrorText error={error} />
      <p className="hint">Ilova manzili: {status.public_url}. «Botni ilovaga ulash» bot menyusiga ilova tugmasini va /start javobini o'rnatadi.</p>
    </div>
  );
}
