import { useState } from "react";
import type { Company } from "../../api";
import { ErrorText, message } from "../../ui";
import { Consent } from "../Consent";

type CompanyInput = Omit<Company, "id" | "status" | "review_note" | "created_at">;

export default function CompanyForm({ initial, submitLabel, onSubmit, requireConsent = false }: {
  initial?: Company; submitLabel: string; onSubmit: (c: CompanyInput) => Promise<void>; requireConsent?: boolean;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "", stir: initial?.stir ?? "", industry: initial?.industry ?? "",
    website: initial?.website ?? "", city: initial?.city ?? "Toshkent", description: initial?.description ?? "",
  });
  const [consent, setConsent] = useState(!requireConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true); setError("");
    try {
      await onSubmit({ ...f, stir: f.stir.trim() || null, website: f.website.trim(), name: f.name.trim() });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const stirOk = !f.stir || /^\d{9}$/.test(f.stir.trim());
  return (
    <div className="card">
      <label>Kompaniya nomi</label>
      <input value={f.name} maxLength={160} placeholder="Masalan: Data Solutions MChJ" onChange={set("name")} />
      <label>STIR (9 raqam)</label>
      <input value={f.stir} inputMode="numeric" maxLength={9} placeholder="301234567" onChange={set("stir")} />
      {!stirOk && <div className="error">STIR 9 ta raqamdan iborat</div>}
      <div className="hint">STIR bo'lsa, tekshiruv tezroq o'tadi. Uni davlat reyestrida tekshiramiz.</div>
      <label>Soha</label>
      <input value={f.industry} maxLength={80} placeholder="IT, bank, savdo, logistika…" onChange={set("industry")} />
      <label>Shahar</label>
      <input value={f.city} maxLength={60} onChange={set("city")} />
      <label>Sayt (ixtiyoriy)</label>
      <input value={f.website} inputMode="url" placeholder="https://…" onChange={set("website")} />
      <label>Kompaniya haqida</label>
      <textarea value={f.description} maxLength={2000} placeholder="Nima bilan shug'ullanasiz, talabalarga nimani o'rgatasiz" onChange={set("description")} />
      {requireConsent && <Consent value={consent} onChange={setConsent} />}
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={busy || f.name.trim().length < 2 || !stirOk || !consent} onClick={submit}>
        {busy ? "Yuborilmoqda…" : submitLabel}
      </button>
    </div>
  );
}
