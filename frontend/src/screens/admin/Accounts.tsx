import { Fragment, useCallback, useEffect, useState } from "react";
import { api, type AdminAccount, type AdminMe, type AdminPermissionCatalog, type AdminRole } from "../../api";
import { BotWaiting, useBotLink } from "../BotLink";
import { saveToken } from "./session";
import { ErrorText, message } from "../../ui";

const STATUS: Record<AdminAccount["status"], [string, string]> = {
  pending: ["Tasdiq kutmoqda", "pending"], active: ["Faol", "peer_verified"], disabled: ["O'chirilgan", "rejected"],
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString("uz") : "hali kirmagan");

/** Owner only: approve new admins, make owners, disable, reset passwords. */
export function Accounts({ meId }: { meId: number }) {
  const [rows, setRows] = useState<AdminAccount[] | null>(null);
  const [catalog, setCatalog] = useState<AdminPermissionCatalog | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.accounts().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); api.admin.permissions().then(setCatalog, () => {}); }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try { await action(); await load(); } catch (e) { setError(message(e)); }
  }

  return (
    <div className="panel">
      <p className="hint" style={{ marginTop: 0 }}>
        Yangi admin saytdagi «Ro'yxatdan o'tish» orqali email va parol bilan so'rov yuboradi. Siz tasdiqlaguningizcha u kira olmaydi.
        Ega hamma narsani qiladi. Boshqalarga nima ruxsat berilishini «Ruxsatlar» tugmasi orqali o'zingiz yoqasiz yoki o'chirasiz:
        yangi rol tanlanganda o'sha rolning standart ruxsatlari qo'yiladi. Adminlarni tayinlash, bot tokeni, AI kalitlari va qoidalarni
        o'zgartirish har doim faqat egada qoladi.
      </p>
      <ErrorText error={error} />
      {temp && (
        <div className="notice" style={{ margin: "8px 0" }}>
          {temp.email} uchun vaqtinchalik parol: <b style={{ userSelect: "all" }}>{temp.password}</b>. Uni egasiga yuboring; kirgach, «Profilim»da almashtirsin. Bu parol qayta ko'rsatilmaydi.
        </div>
      )}
      {rows && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Ism</th><th>Email</th><th>Rol</th><th>Ruxsatlar</th><th>Holat</th><th>Oxirgi kirish</th><th /></tr></thead>
          <tbody>{rows.map((a) => (
            <Fragment key={a.id}>
            <tr>
              <td><b>{a.name}</b>{a.id === meId && <span className="hint"> (siz)</span>}</td>
              <td>{a.email}</td>
              <td>
                <select value={a.role} disabled={a.status !== "active"} onChange={(e) => run(() => api.admin.updateAccount(a.id, { role: e.target.value as AdminRole }))}>
                  <option value="admin">Admin</option><option value="moderator">Moderator</option>
                  <option value="analyst">Tahlilchi (faqat ko'radi)</option><option value="owner">Ega</option>
                </select>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {a.role === "owner" ? <span className="hint">Hammasi</span> : (
                  <button className={`btn small ghost ${open === a.id ? "on" : ""}`} onClick={() => setOpen(open === a.id ? null : a.id)}>
                    {summary(a, catalog)}{a.custom_permissions && <span className="badge pending" style={{ marginLeft: 6 }}>sozlangan</span>}
                  </button>
                )}
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
            {open === a.id && a.role !== "owner" && catalog && (
              <tr className="perm-row"><td colSpan={7}>
                <Permissions account={a} catalog={catalog} onChange={(changes) => run(() => api.admin.updateAccount(a.id, changes))} />
              </td></tr>
            )}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function summary(a: AdminAccount, catalog: AdminPermissionCatalog | null): string {
  const total = catalog?.permissions.length ?? 0;
  if (a.permissions.length === 0) return "Faqat ko'radi";
  if (total && a.permissions.length >= total) return "Hammasi";
  return `${a.permissions.length} ta ruxsat`;
}

/** The owner switches each permission on or off for one account; saved at once. */
function Permissions({ account, catalog, onChange }: {
  account: AdminAccount; catalog: AdminPermissionCatalog;
  onChange: (changes: { permissions?: string[]; reset_permissions?: boolean }) => void;
}) {
  const on = new Set(account.permissions);
  const groups = [...new Set(catalog.permissions.map((p) => p.group))];
  const toggle = (key: string) => {
    const next = new Set(on);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange({ permissions: [...next] });
  };
  const roleName = ({ admin: "Admin", moderator: "Moderator", analyst: "Tahlilchi" } as Record<string, string>)[account.role] ?? account.role;
  return (
    <div className="perm-box">
      <div className="row between" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="hint">
          {account.name}: {account.custom_permissions ? "siz sozlagan ruxsatlar" : `«${roleName}» rolining standart ruxsatlari`}. Belgilash darhol saqlanadi.
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small ghost" onClick={() => onChange({ permissions: catalog.permissions.map((p) => p.key) })}>Hammasini yoqish</button>
          <button className="btn small ghost" onClick={() => onChange({ permissions: [] })}>Faqat ko'rish</button>
          {account.custom_permissions && <button className="btn small ghost" onClick={() => onChange({ reset_permissions: true })}>Rol standartiga qaytarish</button>}
        </div>
      </div>
      <div className="perm-groups">
        {groups.map((g) => (
          <div key={g} className="perm-group">
            <b>{g}</b>
            {catalog.permissions.filter((p) => p.group === g).map((p) => (
              <label key={p.key} className="perm-item">
                <input type="checkbox" checked={on.has(p.key)} onChange={() => toggle(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Change this account's password. `forced`: signed in with a temporary password from the owner, which must be
 * replaced before anything else opens (the server refuses other admin calls until then). */
export function AdminPasswordForm({ forced = false, onChanged }: { forced?: boolean; onChanged?: () => void }) {
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
      onChanged?.();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{forced ? "Yangi parol qo'ying" : "Parolni o'zgartirish"}</h3>
      <p className="hint">{forced
        ? "Siz ilova egasi bergan vaqtinchalik parol bilan kirdingiz. Uni ega ham biladi, shuning uchun admin sayti o'zingizning parolingizni qo'ygandan keyin ochiladi."
        : "O'zgartirgach, boshqa qurilmalardagi barcha kirishlar yopiladi. Shu oyna ochiq qoladi."}</p>
      <label>{forced ? "Vaqtinchalik parol" : "Joriy parol"}</label>
      <input type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
      <label>Yangi parol (kamida 10 belgi)</label>
      <input type="password" value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
      <label>Yangi parolni takrorlang</label>
      <input type="password" value={repeat} autoComplete="new-password" onChange={(e) => setRepeat(e.target.value)} />
      <ErrorText error={error} />
      {done && <p className="notice">Parol o'zgartirildi.</p>}
      <button className="btn small" style={{ marginTop: 10 }} disabled={!current || next.length < 10 || !repeat} onClick={save}>Saqlash</button>
    </div>
  );
}

export function MyAccount({ me }: { me: { name: string; email: string; role: string; permissions: string[]; telegram_linked?: boolean } }) {
  const [catalog, setCatalog] = useState<AdminPermissionCatalog | null>(null);
  useEffect(() => { api.admin.permissions().then(setCatalog, () => {}); }, []);

  return (
    <div className="narrow">
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{me.name}</h3>
        <div className="hint">{me.email} · {({ owner: "Ega", admin: "Admin", moderator: "Moderator", analyst: "Tahlilchi" } as Record<string, string>)[me.role] ?? me.role}</div>
        {catalog && me.role !== "owner" && (
          <>
            <b style={{ display: "block", marginTop: 12 }}>Ruxsatlaringiz</b>
            {me.permissions.length === 0
              ? <div className="hint">Siz faqat ko'ra olasiz. Ruxsatni ilova egasi beradi.</div>
              : <div className="chips" style={{ marginTop: 6 }}>{catalog.permissions.filter((p) => me.permissions.includes(p.key)).map((p) => <span key={p.key} className="chip on">{p.label}</span>)}</div>}
          </>
        )}
      </div>
      <AdminPasswordForm />
      <AdminTelegram linked={Boolean(me.telegram_linked)} />
    </div>
  );
}

/** Bot copies of this account's bell: link a Telegram account through the bot (link, "Ha" in the bot, the PIN here). */
function AdminTelegram({ linked: initial }: { linked: boolean }) {
  const [linked, setLinked] = useState(initial);
  const [error, setError] = useState("");
  const link = useBotLink(api.adminAuth.telegramLinkStart, api.adminAuth.telegramLinkVerify,
                          useCallback((m: AdminMe) => setLinked(Boolean(m.telegram_linked)), []));
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Telegram</h3>
      <p className="hint">Ulangan bo'lsa, admin bildirishnomalari (yangi korxona, vakansiya, shikoyat, parol so'rovi va boshqalar)
        botga ham keladi. Tugma admin saytining kerakli sahifasini ochadi.</p>
      {linked ? (
        <div className="row between">
          <span className="badge peer_verified">Ulangan</span>
          <button className="btn small ghost" onClick={async () => {
            try { setLinked(Boolean((await api.adminAuth.telegramUnlink()).telegram_linked)); } catch (e) { setError(message(e)); }
          }}>Uzish</button>
        </div>
      ) : (
        <button className="btn small" disabled={link.state !== "idle"} onClick={link.begin}>Telegram'ni ulash</button>
      )}
      {link.link && link.state !== "idle" && <BotWaiting link={link.link} state={link.state} onCancel={link.stop} onPin={link.submitPin} />}
      <ErrorText error={error || link.error} />
    </div>
  );
}
