import { useCallback, useEffect, useState } from "react";
import { api, type AdminAccount } from "../../api";
import { saveToken } from "./session";
import { ErrorText, message } from "../../ui";

const STATUS: Record<AdminAccount["status"], [string, string]> = {
  pending: ["Tasdiq kutmoqda", "pending"], active: ["Faol", "peer_verified"], disabled: ["O'chirilgan", "rejected"],
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString("uz") : "hali kirmagan");

/** Owner only: approve new admins, make owners, disable, reset passwords. */
export function Accounts({ meId }: { meId: number }) {
  const [rows, setRows] = useState<AdminAccount[] | null>(null);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.accounts().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try { await action(); await load(); } catch (e) { setError(message(e)); }
  }

  return (
    <div className="panel">
      <p className="hint" style={{ marginTop: 0 }}>
        Yangi admin saytdagi «Ro'yxatdan o'tish» orqali email va parol bilan so'rov yuboradi. Siz tasdiqlaguningizcha u kira olmaydi.
        Ega hamma narsani qiladi. Admin ilovani boshqaradi, lekin adminlarni tayinlay olmaydi va bot hamda qoidalarni o'zgartira olmaydi.
      </p>
      <ErrorText error={error} />
      {temp && (
        <div className="notice" style={{ margin: "8px 0" }}>
          {temp.email} uchun vaqtinchalik parol: <b style={{ userSelect: "all" }}>{temp.password}</b>. Uni egasiga yuboring; kirgach, «Profilim»da almashtirsin. Bu parol qayta ko'rsatilmaydi.
        </div>
      )}
      {rows && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Ism</th><th>Email</th><th>Rol</th><th>Holat</th><th>Oxirgi kirish</th><th /></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td><b>{a.name}</b>{a.id === meId && <span className="hint"> (siz)</span>}</td>
              <td>{a.email}</td>
              <td>
                <select value={a.role} disabled={a.status !== "active"} onChange={(e) => run(() => api.admin.updateAccount(a.id, { role: e.target.value as "owner" | "admin" }))}>
                  <option value="admin">Admin</option><option value="owner">Ega</option>
                </select>
              </td>
              <td><span className={`badge ${STATUS[a.status][1]}`}>{STATUS[a.status][0]}</span></td>
              <td>{when(a.last_login_at)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {a.status === "pending" && <button className="btn small ok" onClick={() => run(() => api.admin.updateAccount(a.id, { status: "active" }))}>Tasdiqlash</button>}{" "}
                {a.status === "active" && a.id !== meId && <button className="btn small ghost" onClick={() => run(() => api.admin.updateAccount(a.id, { status: "disabled" }))}>O'chirish</button>}
                {a.status === "disabled" && <button className="btn small ghost" onClick={() => run(() => api.admin.updateAccount(a.id, { status: "active" }))}>Yoqish</button>}{" "}
                {a.id !== meId && a.status !== "pending" && (
                  <button className="btn small ghost" onClick={() => run(async () => {
                    if (!confirm(`${a.email} paroli tiklansinmi? Eski parol ishlamay qoladi.`)) return;
                    setTemp({ email: a.email, password: (await api.admin.resetPassword(a.id)).temporary_password });
                  })}>Parolni tiklash</button>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export function MyAccount({ me }: { me: { name: string; email: string; role: string } }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError(""); setDone(false);
    if (next !== repeat) return setError("Yangi parollar bir xil emas");
    try {
      saveToken((await api.adminAuth.changePassword(current, next)).token);
      setDone(true); setCurrent(""); setNext(""); setRepeat("");
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="narrow">
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{me.name}</h3>
        <div className="hint">{me.email} · {me.role === "owner" ? "Ega" : "Admin"}</div>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Parolni o'zgartirish</h3>
        <p className="hint">O'zgartirgach, boshqa qurilmalardagi barcha kirishlar yopiladi. Shu oyna ochiq qoladi.</p>
        <label>Joriy parol</label>
        <input type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
        <label>Yangi parol (kamida 10 belgi)</label>
        <input type="password" value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
        <label>Yangi parolni takrorlang</label>
        <input type="password" value={repeat} autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} />
        <ErrorText error={error} />
        {done && <p className="notice">Parol o'zgartirildi.</p>}
        <button className="btn small" style={{ marginTop: 10 }} disabled={!current || next.length < 10 || !repeat} onClick={save}>Saqlash</button>
      </div>
    </div>
  );
}
