import { useCallback, useEffect, useState } from "react";
import { api, type PartnershipRow, type PublicUniversity, type UniversityProfile } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate } from "../../router";
import { haptic } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { UniversityFacts } from "../../public/PublicUniversities";
import { PartnershipCard } from "../university/UniCollab";

type Row = PublicUniversity & { partnership: PartnershipRow | null };

/** Universities for a company: verified students, placement figures and the partnership with each. */
export default function CompanyUniversities() {
  useLang();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.universities(q.trim()).then(setRows, (e) => setError(message(e))), [q]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (open) return <UniversityDetail id={open} onBack={() => { setOpen(null); void load(); }} />;
  return (
    <div>
      <h1>{t("nav.company.universities")}</h1>
      <p className="hint">{t("cuni.intro")}</p>
      <form className="pub-search" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input value={q} maxLength={80} placeholder={t("uni.search")} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit"><Icon name="search" size={18} /></button>
      </form>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint" style={{ marginTop: 10 }}>{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="card hint">{t("uni.empty")}</div>}
      <div style={{ marginTop: 10 }}>
        {rows?.map((u) => (
          <div key={u.id} className="card tap" onClick={() => setOpen(u.id)}>
            <div className="row between">
              <b>{u.short_name} · {u.name}</b>
              {u.partnership && <span className={`badge ${u.partnership.status === "accepted" ? "peer_verified" : u.partnership.status === "rejected" ? "rejected" : "pending"}`}>
                {u.partnership.status === "accepted" ? t("partners.accepted") : u.partnership.status === "rejected" ? t("partners.rejected")
                  : u.partnership.initiated_by === "company" ? t("partners.pending_out") : t("partners.pending_in")}
              </span>}
            </div>
            <div className="hint">{[u.city, t("uni.students_n", { n: u.students })].filter(Boolean).join(" · ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UniversityDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [u, setU] = useState<(UniversityProfile & { partnership: PartnershipRow | null }) | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.university(id).then(setU, (e) => setError(message(e))), [id]);
  useEffect(() => { void load(); }, [load]);

  async function ask() {
    try { await api.employer.askPartnership(id, text.trim()); toast(t("partners.sent")); void load(); } catch (e) { setError(message(e)); }
  }
  async function decide(accept: boolean) {
    if (!u?.partnership) return;
    try { await api.employer.decidePartnership(u.partnership.id, accept); haptic("success"); void load(); } catch (e) { setError(message(e)); }
  }

  if (!u) return error ? <ErrorText error={error} /> : <div className="hint">{t("common.loading")}</div>;
  const canAsk = !u.partnership || u.partnership.status === "rejected";
  return (
    <div>
      <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />{t("uni.back")}</button>
      <h1>{u.name}</h1>
      <UniversityFacts u={u} />
      <button className="btn ghost" onClick={() => navigate(`/korxona/talabalar?university=${u.id}`)}>{t("nav.company.students")}</button>
      {u.partnership && <PartnershipCard p={u.partnership} side="company" title={t("nav.university.partners")} onDecide={decide} />}
      {canAsk && (
        <div className="card">
          <b>{t("partners.ask")}</b>
          <label>{t("partners.message")}</label>
          <textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
          <ErrorText error={error} />
          <button className="btn" style={{ marginTop: 10 }} onClick={ask}>{t("partners.send")}</button>
        </div>
      )}
    </div>
  );
}
