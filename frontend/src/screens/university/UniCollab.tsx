import { useCallback, useEffect, useState } from "react";
import { api, type Opportunity, type PartnershipRow, type PublicCompany } from "../../api";
import { industryLabel, kindLabel, modeLabel, salaryText } from "../../format";
import { t, useLang } from "../../i18n";
import { navigate } from "../../router";
import { haptic } from "../../tg";
import { ErrorText, Sheet, message, toast } from "../../ui";

/** One partnership row as either side sees it: state, and the answer buttons for the side that was asked. */
export function PartnershipCard({ p, side, title, onDecide }: {
  p: PartnershipRow; side: "company" | "university"; title: string; onDecide: (accept: boolean) => void;
}) {
  const asked = p.status === "pending" && p.initiated_by !== side;
  const [label, badge] = p.status === "accepted" ? [t("partners.accepted"), "peer_verified"]
    : p.status === "rejected" ? [t("partners.rejected"), "rejected"]
    : asked ? [t("partners.pending_in"), "pending"] : [t("partners.pending_out"), "todo"];
  return (
    <div className="card">
      <div className="row between">
        <b>{title}</b>
        <span className={`badge ${badge}`}>{label}</span>
      </div>
      {p.message && <p style={{ whiteSpace: "pre-line", margin: "6px 0 0" }}>{p.message}</p>}
      {asked && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small ghost" onClick={() => onDecide(false)}>{t("partners.reject")}</button>
          <button className="btn small ok" onClick={() => onDecide(true)}>{t("partners.accept")}</button>
        </div>
      )}
    </div>
  );
}

export function UniPartners() {
  useLang();
  const [rows, setRows] = useState<PartnershipRow[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => api.university.partners().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function decide(p: PartnershipRow, accept: boolean) {
    try { await api.university.decidePartner(p.id, accept); haptic("success"); void load(); } catch (e) { setError(message(e)); }
  }

  return (
    <div>
      <div className="row between wrap">
        <h1 style={{ margin: 0 }}>{t("nav.university.partners")}</h1>
        <button className="btn small" onClick={() => setAsking(true)}>{t("partners.ask")}</button>
      </div>
      <p className="hint">{t("partners.intro")}</p>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="card hint">{t("partners.empty")}</div>}
      {rows?.map((p) => (
        <PartnershipCard key={p.id} p={p} side="university" title={`${p.company} · ${industryLabel(p.industry)}`}
                         onDecide={(accept) => decide(p, accept)} />
      ))}
      {asking && <AskCompany onClose={() => setAsking(false)} onSent={() => { setAsking(false); void load(); }} />}
    </div>
  );
}

function AskCompany({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api.public.companies({ limit: "60" }).then((r) => setCompanies(r.items), (e) => setError(message(e))); }, []);
  async function send() {
    try {
      await api.university.askPartner(Number(companyId), text.trim());
      toast(t("partners.sent"));
      onSent();
    } catch (e) { setError(message(e)); }
  }
  return (
    <Sheet onClose={onClose}>
      <h1>{t("partners.ask")}</h1>
      <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
        <option value="">{t("partners.choose_company")}</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label>{t("partners.message")}</label>
      <textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={!companyId} onClick={send}>{t("partners.send")}</button>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
    </Sheet>
  );
}

export function UniOpportunities() {
  useLang();
  const [rows, setRows] = useState<Opportunity[] | null>(null);
  const [recommending, setRecommending] = useState<Opportunity | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.university.opportunities().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h1>{t("nav.university.opportunities")}</h1>
      <p className="hint">{t("opp.intro")}</p>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="card hint">{t("opp.empty")}</div>}
      {rows?.map((j) => (
        <div key={j.id} className="card">
          <div className="row between">
            <span className="hint">{j.company_name}</span>
            <span className="chips">
              {j.partner && <span className="badge peer_verified">{t("opp.partner")}</span>}
              {j.recommended && <span className="badge pending">{t("opp.recommended")}</span>}
            </span>
          </div>
          <a href={`/vakansiyalar/${j.id}`} onClick={(e) => { e.preventDefault(); navigate(`/vakansiyalar/${j.id}`); }}><b>{j.title}</b></a>
          <div className="hint">{kindLabel(j.kind)} · {modeLabel(j.work_mode)} · {salaryText(j)}</div>
          {j.our_applicants > 0 && <div className="hint">{t("opp.our_applicants", { n: j.our_applicants })}</div>}
          {!j.recommended && <button className="btn small" style={{ marginTop: 8 }} onClick={() => setRecommending(j)}>{t("opp.recommend")}</button>}
        </div>
      ))}
      {recommending && <Recommend job={recommending} onClose={() => setRecommending(null)} onDone={() => { setRecommending(null); void load(); }} />}
    </div>
  );
}

function Recommend({ job, onClose, onDone }: { job: Opportunity; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setBusy(true);
    try {
      const r = await api.university.recommend(job.id, note.trim());
      toast(t("opp.sent", { n: r.students }));
      onDone();
    } catch (e) { setError(message(e)); setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <span className="hint">{job.company_name}</span>
      <h1>{job.title}</h1>
      <label>{t("opp.note")}</label>
      <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={send}>{t("opp.recommend")}</button>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
    </Sheet>
  );
}

export function UniProfile() {
  useLang();
  const [f, setF] = useState<{ id: number; name: string; description: string; website: string; city: string; region: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.university.profile().then(setF, (e) => setError(message(e))); }, []);
  async function save() {
    if (!f) return;
    try {
      setF(await api.university.editProfile({ description: f.description, website: f.website || undefined, city: f.city, region: f.region }));
      toast(t("uprof.saved"));
    } catch (e) { setError(message(e)); }
  }
  if (!f) return error ? <ErrorText error={error} /> : <div className="hint">{t("common.loading")}</div>;
  return (
    <div>
      <h1>{f.name}</h1>
      <p className="hint">{t("uprof.hint")}</p>
      <div className="card">
        <label>{t("uprof.description")}</label>
        <textarea value={f.description} rows={6} maxLength={3000} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <label>{t("uprof.website")}</label>
        <input value={f.website} maxLength={256} placeholder="https://" onChange={(e) => setF({ ...f, website: e.target.value })} />
        <div className="row">
          <div className="grow"><label>{t("uprof.city")}</label><input value={f.city} maxLength={60} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
          <div className="grow"><label>{t("uprof.region")}</label><input value={f.region} maxLength={60} onChange={(e) => setF({ ...f, region: e.target.value })} /></div>
        </div>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 12 }} onClick={save}>{t("common.save")}</button>
      </div>
      <button className="btn ghost" onClick={() => navigate(`/universitetlar/${f.id}`)}>{t("uprof.open_public")}</button>
    </div>
  );
}
