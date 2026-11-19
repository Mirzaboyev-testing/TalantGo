import { useCallback, useEffect, useState } from "react";
import { api, type PasswordRequestRow } from "../../api";
import { formatDateTime } from "../../i18n";
import { ask } from "../../tg";
import { ErrorText, message } from "../../ui";

const PANEL: Record<string, string> = { student: "Talaba", employer: "Korxona", university: "Universitet xodimi" };

/** Owner only: people without Telegram who forgot a password, and admins who forgot theirs.
 *  The owner compares what they wrote with what the platform knows, calls them, then hands over a temporary password. */
export default function PasswordRequests({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<PasswordRequestRow[] | null>(null);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.passwordRequests().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function act(r: PasswordRequestRow, reset: boolean) {
    if (reset && !(await ask(`${r.email} uchun vaqtinchalik parol yaratilsinmi? Eski parol va barcha kirishlar bekor bo'ladi.`))) return;
    setBusy(r.id); setError("");
    try {
      if (reset) setTemp({ email: r.email, password: (await api.admin.resetPasswordRequest(r.id)).temporary_password });
      else await api.admin.closePasswordRequest(r.id);
      onChanged();
      await load();
    } catch (e) { setError(message(e)); } finally { setBusy(0); }
  }

  if (!rows?.length && !temp && !error) return null;
  return (
    <div className="card">
      <b>Parolni tiklash so'rovlari</b>
      <p className="hint">Telegram'i ulanmagan foydalanuvchilar va adminlar. Avval telefon orqali egasi ekanini tekshiring:
        yozgan ismi va telefoni platformadagi ma'lumot bilan mos kelsin.</p>
      {temp && (
        <div className="card" style={{ background: "var(--brand-soft)" }}>
          {temp.email} uchun vaqtinchalik parol: <b style={{ userSelect: "all" }}>{temp.password}</b>. Uni egasiga ayting yoki yuboring.
          Kirganda yangi parol qo'yish so'raladi. Bu parol qayta ko'rsatilmaydi.
        </div>
      )}
      <ErrorText error={error} />
      {rows?.map((r) => (
        <div key={r.id} className="row between" style={{ gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div><b>{r.full_name || r.email}</b> · {r.email} {r.kind === "admin" && <span className="badge pending">admin hisobi</span>}</div>
            <div className="hint">
              {r.phone && <>Yozgan telefoni: <b>{r.phone}</b> · </>}{formatDateTime(r.created_at)}
              {r.note && <> · «{r.note}»</>}
            </div>
            <div className="hint">
              {!r.account ? <span style={{ color: "var(--bad)" }}>Bu email bilan akkaunt topilmadi</span>
                : r.kind === "admin" ? <>Platformada: {r.account.name}, {r.account.role}, {r.account.status}</>
                : <>Platformada: {r.account.name}, {PANEL[r.account.account_type ?? ""] ?? r.account.account_type}
                    {r.account.phone ? `, telefon ${r.account.phone}` : ", telefon yo'q"}
                    {r.account.has_telegram ? ", Telegram ulangan (o'zi botda /parol bilan tiklay oladi)" : ""}
                    {r.account.blocked ? ", bloklangan" : ""}</>}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {r.account && <button className="btn small" disabled={busy === r.id} onClick={() => act(r, true)}>Parolni tiklash</button>}
            <button className="btn small ghost" disabled={busy === r.id} onClick={() => act(r, false)}>Yopish</button>
          </div>
        </div>
      ))}
    </div>
  );
}
