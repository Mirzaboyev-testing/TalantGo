import { useEffect, useState } from "react";
import { api, type AiConversation, type AiMessage, type AiStatus, type AuditEntry, type BotStatus, type Rules } from "../../api";
import { BOT_URL } from "../../tg";
import { ErrorText, message } from "../../ui";

export function RulesCard({ canEdit }: { canEdit: boolean }) {
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
      {canEdit && <button className="btn small" style={{ marginTop: 10 }} onClick={save}>{saved ? "Saqlandi" : "Saqlash"}</button>}
    </div>
  );
}

export function ExportCard() {
  const [error, setError] = useState("");
  return (
    <div className="card">
      <b>Eksport</b>
      <p className="hint">Excel'da ochiladigan CSV fayllar.</p>
      <div className="row wrap">
        <button className="btn small ghost" onClick={() => api.admin.exportUsers().catch((e) => setError(message(e)))}>Talabalar ro'yxati</button>
        <button className="btn small ghost" onClick={() => api.admin.exportApplications().catch((e) => setError(message(e)))}>Arizalar</button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

export function BotCard() {
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

export function AiCard({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [chat, setChat] = useState(true);
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const apply = (s: AiStatus) => { setStatus(s); setEnabled(s.enabled); setChat(s.assistant); setModel(s.model); };
  useEffect(() => { api.admin.ai().then(apply, (e) => setError(message(e))); }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true); setError(""); setResult("");
    try { setResult(await action()); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  if (!status) return <ErrorText error={error} />;
  return (
    <div className="card">
      <div className="row between">
        <b>AI yordamchi (Google Gemini)</b>
        <span className={`badge ${status.enabled ? "peer_verified" : "todo"}`}>{status.enabled ? "Yoqilgan" : "O'chirilgan"}</span>
      </div>
      <p className="hint">
        Yoqilsa, talaba topshirgan har bir ishni (fayllar, havola, izoh) AI topshiriq sharti va mezonlariga qarab tekshiradi
        va izoh yozadi. Uning bahosi bitta tengdosh ovozi hisoblanadi: «Nechta tengdosh tasdig'i kerak» 1 bo'lsa, AI o'zi
        hal qiladi, 2 bo'lsa yana bitta tengdosh kerak. Mentor har doim qarorni o'zgartira oladi.
      </p>
      {!canEdit && <p className="hint">Faqat ilova egasi o'zgartira oladi.</p>}
      {status.hint && <p className="hint">Saqlangan kalit: {status.hint}</p>}
      <label>API kalit (aistudio.google.com/apikey sahifasidan oling)</label>
      <input type="password" value={key} disabled={!canEdit} placeholder={status.configured ? "Almashtirish uchun yangisini kiriting" : "AIza…"}
             autoComplete="off" onChange={(e) => setKey(e.target.value.trim())} />
      <label>Model</label>
      <input value={model} list="ai-models" disabled={!canEdit} onChange={(e) => setModel(e.target.value.trim())} />
      <datalist id="ai-models">{status.models.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="hint">Ishlarni tekshirish uchun. gemini-3.5-flash tez va barqaror (tavsiya etiladi); gemini-3.8-flash aniqroq, lekin sekin va ba'zan band bo'ladi. Tanlangan model band bo'lsa, avtomatik gemini-3.5-flash ishlatiladi. CareerFlow.ai chat doim tezkor gemini-3.5-flash'da ishlaydi.</div>
      <label className="row" style={{ gap: 8, marginTop: 12, cursor: canEdit ? "pointer" : "default" }}>
        <input type="checkbox" checked={enabled} disabled={!canEdit} style={{ width: "auto" }} onChange={(e) => setEnabled(e.target.checked)} />
        Ishlarni AI bilan tekshirish
      </label>
      <label className="row" style={{ gap: 8, marginTop: 6, cursor: canEdit ? "pointer" : "default" }}>
        <input type="checkbox" checked={chat} disabled={!canEdit} style={{ width: "auto" }} onChange={(e) => setChat(e.target.checked)} />
        Talabalar uchun CareerFlow.ai chat (ilova burchagidagi tugma, kuniga 60 ta savolgacha)
      </label>
      <div className="row wrap" style={{ marginTop: 10 }}>
        {canEdit && (
          <button className="btn small" disabled={busy || !model}
                  onClick={() => run(async () => {
                    apply(await api.admin.saveAi({ enabled, assistant: chat, model, ...(key ? { api_key: key } : {}) }));
                    setKey("");
                    return enabled ? "Saqlandi va tekshirildi: yangi ishlarni AI tekshiradi." : "Saqlandi. AI tekshiruvi o'chiq.";
                  })}>{busy ? "Tekshirilmoqda…" : "Saqlash"}</button>
        )}
        <button className="btn small ghost" disabled={busy || !status.configured}
                onClick={() => run(async () => { const r = await api.admin.testAi(); return `Ishlayapti: ${r.model} javob berdi («${r.reply}»).`; })}>Tekshirish</button>
      </div>
      {result && <p className="notice" style={{ marginTop: 10 }}>{result}</p>}
      <ErrorText error={error} />
    </div>
  );
}

export function AiConversations() {
  const [rows, setRows] = useState<AiConversation[] | null>(null);
  const [open, setOpen] = useState<AiConversation | null>(null);
  const [chat, setChat] = useState<AiMessage[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.admin.aiConversations().then(setRows, (e) => setError(message(e))); }, []);

  async function show(c: AiConversation) {
    setOpen(c); setChat(null); setError("");
    try { setChat(await api.admin.aiConversation(c.user_id)); } catch (e) { setError(message(e)); }
  }

  if (open) {
    return (
      <div className="card">
        <div className="row between">
          <b>{open.full_name}</b>
          <button className="btn small ghost" onClick={() => setOpen(null)}>Orqaga</button>
        </div>
        <p className="hint">{open.track ?? "Yo'nalish tanlanmagan"} · {open.questions} ta savol. Ko'rganingiz jurnalga yoziladi.</p>
        <ErrorText error={error} />
        {!chat && !error && <div className="hint">Yuklanmoqda…</div>}
        {chat?.map((m) => (
          <div key={m.id} className={`review ${m.role === "user" ? "" : "yes"}`}>
            <div className="hint">{m.role === "user" ? open.full_name : "CareerFlow.ai"} · {new Date(m.created_at).toLocaleString()}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="card">
      <b>CareerFlow.ai suhbatlari</b>
      <p className="hint">Har bir talaba va mentorning suhbati alohida, ularni boshqa foydalanuvchilar ko'rmaydi. Bu yerda faqat adminlar ko'radi.</p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="hint">Hali hech kim yozmagan.</div>}
      {rows?.map((c) => (
        <div key={c.user_id} className="review" style={{ cursor: "pointer" }} onClick={() => show(c)}>
          <div className="row between">
            <b>{c.full_name}</b>
            <span className="hint">{c.questions} ta savol</span>
          </div>
          <div className="hint">{c.role === "student" ? "Talaba" : "Mentor"}{c.track ? ` · ${c.track.split(":")[0]}` : ""} · oxirgi: {new Date(c.last_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "user.update": "Foydalanuvchi o'zgartirildi", "user.points": "Ball tuzatildi", "submission.delete": "Ish o'chirildi",
  "track.create": "Yo'nalish qo'shildi", "track.update": "Yo'nalish o'zgartirildi", "task.create": "Topshiriq qo'shildi",
  "task.update": "Topshiriq o'zgartirildi", "announcement.send": "E'lon yuborildi", "rules.update": "Qoidalar o'zgartirildi",
  "bot.token": "Bot tokeni almashtirildi", "ai.update": "AI sozlamalari o'zgartirildi", "assistant.view": "CareerFlow.ai suhbati ko'rildi", "bot.connect": "Bot ulandi", "export.users": "Ro'yxat yuklab olindi",
};

export function AuditCard() {
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

export function PartnerLinks() {
  const links = [
    ["HR va kompaniyalar uchun", `${BOT_URL}?start=hr`],
    ["Universitet karyera markazi uchun", `${BOT_URL}?start=uni`],
  ];
  return (
    <div className="card">
      <b>Hamkor havolalari</b>
      <p className="hint">Talabalar oddiy havola orqali faqat talaba sifatida kiradi. Kompaniya va universitet xodimlariga shu havolalarni yuboring: ular ochganda tegishli ro'yxatdan o'tish chiqadi.</p>
      {links.map(([label, url]) => (
        <div key={url} style={{ marginTop: 8 }}>
          <div className="hint">{label}</div>
          <div className="row">
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn small ghost" onClick={() => navigator.clipboard.writeText(url).catch(() => {})}>Nusxa</button>
          </div>
        </div>
      ))}
    </div>
  );
}
