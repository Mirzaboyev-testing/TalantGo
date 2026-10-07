import { useEffect, useState } from "react";
import { api, type AuditEntry, type BotStatus, type Rules } from "../../api";
import { ErrorText, message } from "../../ui";
import type { AdminCtx } from "./AdminPanel";

export default function Settings({ ctx }: { ctx: AdminCtx }) {
  return (
    <div>
      <RulesCard canEdit={ctx.isOwner} />
      <ExportCard />
      {ctx.isOwner && <BotCard />}
      <AuditCard />
    </div>
  );
}

function RulesCard({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.admin.rules().then(setRules, (e) => setError(message(e))); }, []);
  if (!rules) return <ErrorText error={error} />;

  const field = (key: keyof Rules, label: string, hint: string) => (
    <>
      <label>{label}</label>
      <input value={rules[key]} inputMode="numeric" disabled={!canEdit}
             onChange={(e) => { setSaved(false); setRules({ ...rules, [key]: Number(e.target.value.replace(/\D/g, "")) }); }} />
      <div className="hint">{hint}</div>
    </>
  );

  async function save() {
    try {
      setRules(await api.admin.saveRules(rules!));
      setSaved(true); setError("");
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="card">
      <b>Baholash qoidalari</b>
      {!canEdit && <p className="hint">Faqat ilova egasi o'zgartira oladi.</p>}
      {field("peer_approvals_required", "Nechta tengdosh tasdig'i kerak (1–5)", "Shuncha tengdosh tasdiqlasa ish portfolioga tushadi va ball beriladi.")}
      {field("review_points", "Bitta baho uchun ball (0–20)", "Tengdosh ishini yozma baholagan talabaga beriladi.")}
      {field("mentor_bonus_percent", "Mentor tasdig'i bonusi, % (0–200)", "Topshiriq ballidan foiz hisobida qo'shiladi.")}
      <ErrorText error={error} />
      {canEdit && <button className="btn small" style={{ marginTop: 10 }} onClick={save}>{saved ? "Saqlandi ✓" : "Saqlash"}</button>}
    </div>
  );
}

function ExportCard() {
  const [error, setError] = useState("");
  return (
    <div className="card">
      <b>Eksport</b>
      <p className="hint">Barcha talabalar ro'yxati: ball, tasdiqlangan ishlar, guruh. Excel'da ochiladi. Kompyuterdan /admin sahifasida yuklash qulayroq.</p>
      <button className="btn small ghost" onClick={() => api.admin.exportUsers().catch((e) => setError(message(e)))}>CSV yuklab olish</button>
      <ErrorText error={error} />
    </div>
  );
}

function BotCard() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const load = () => api.admin.bot().then(setStatus, (e) => setError(message(e)));
  useEffect(() => { void load(); }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true); setError(""); setResult("");
    try { setResult(await action()); void load(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  if (!status) return <ErrorText error={error} />;
  return (
    <div className="card">
      <div className="row between">
        <b>Telegram bot</b>
        <span className={`badge ${status.configured ? "peer_verified" : "rejected"}`}>{status.configured ? "Sozlangan" : "Sozlanmagan"}</span>
      </div>
      {status.hint && <p className="hint">Saqlangan token: {status.hint}</p>}
      <label>Yangi token (BotFather beradi; saqlangach faqat qisqartirilgan ko'rinishi qoladi)</label>
      <input type="password" value={token} placeholder="123456789:AA…" autoComplete="off" onChange={(e) => setToken(e.target.value.trim())} />
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button className="btn small" disabled={busy || !token}
                onClick={() => run(async () => { await api.admin.saveBot(token); setToken(""); return "Token saqlandi va tekshirildi. Endi «Botni ulash»ni bosing."; })}>Saqlash</button>
        <button className="btn small ghost" disabled={busy || !status.configured}
                onClick={() => run(async () => `Ishlayapti: @${(await api.admin.testBot()).username}`)}>Tekshirish</button>
        <button className="btn small ghost" disabled={busy || !status.configured}
                onClick={() => run(async () => `@${(await api.admin.connectBot()).username} ilovaga ulandi.`)}>Botni ulash</button>
      </div>
      {result && <p className="notice" style={{ marginTop: 10 }}>{result}</p>}
      <ErrorText error={error} />
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "user.update": "Foydalanuvchi o'zgartirildi", "user.points": "Ball tuzatildi", "submission.delete": "Ish o'chirildi",
  "track.create": "Yo'nalish qo'shildi", "track.update": "Yo'nalish o'zgartirildi", "task.create": "Topshiriq qo'shildi",
  "task.update": "Topshiriq o'zgartirildi", "announcement.send": "E'lon yuborildi", "rules.update": "Qoidalar o'zgartirildi",
  "bot.token": "Bot tokeni almashtirildi", "bot.connect": "Bot ulandi", "export.users": "Ro'yxat yuklab olindi",
};

function AuditCard() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.admin.audit().then(setEntries, (e) => setError(message(e))); }, []);
  return (
    <div className="card">
      <b>Jurnal</b>
      <p className="hint">Har bir boshqaruv amali: kim, qachon, nima qildi.</p>
      <ErrorText error={error} />
      {entries?.length === 0 && <div className="hint">Hali amal yo'q</div>}
      {entries?.map((e) => (
        <div key={e.id} className="review">
          <div className="hint">{new Date(e.created_at).toLocaleString()} · {e.actor}</div>
          <div>{ACTION_LABEL[e.action] ?? e.action}{e.target ? `: ${e.target}` : ""}</div>
          {e.details && <div className="hint">{e.details}</div>}
        </div>
      ))}
    </div>
  );
}
