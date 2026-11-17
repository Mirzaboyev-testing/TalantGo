import { useCallback, useEffect, useState } from "react";
import { api, type PartnershipRow, type PublicUniversity, type UniversityProfile } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate, useSearch } from "../../router";
import { haptic } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import { UniversityFacts } from "../../public/PublicUniversities";
import { PartnershipCard } from "../university/UniCollab";
import { EmptyState, PageHead, Tabs } from "./kit";

type Row = PublicUniversity & { partnership: PartnershipRow | null };

type UniTab = "all" | "partners" | "requests";
const partnerState = (u: Row) => (!u.partnership ? null : u.partnership.status === "accepted" ? "accepted"
  : u.partnership.status === "rejected" ? "rejected" : u.partnership.initiated_by === "company" ? "pending_out" : "pending_in");

/** Universities for a company: verified students, placement figures and the partnership with each. */
export default function CompanyUniversities() {
  useLang();
  const search = useSearch();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<UniTab>(search.tab === "requests" ? "requests" : search.tab === "partners" ? "partners" : "all");
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.universities(q.trim()).then(setRows, (e) => setError(message(e))), [q]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (open) return <UniversityDetail id={open} onBack={() => { setOpen(null); void load(); }} />;
  const isPartner = (u: Row) => partnerState(u) === "accepted";
  const isRequest = (u: Row) => ["pending_in", "pending_out"].includes(partnerState(u) ?? "");
  const shown = (rows ?? []).filter((u) => tab === "all" || (tab === "partners" ? isPartner(u) : isRequest(u)));
  const students = (rows ?? []).reduce((n, u) => n + u.students, 0);
  return (
    <div className="co-page">
      <PageHead title={t("nav.company.universities")} sub={t("cuni.intro")} />
      {rows && (
        <div className="co-mini-stats">
          <div><b>{rows.length}</b><span>{t("co.uni.count")}</span></div>
          <div><b>{rows.filter(isPartner).length}</b><span>{t("co.uni.partners")}</span></div>
          <div className={rows.some((u) => partnerState(u) === "pending_in") ? "warn" : ""}><b>{rows.filter(isRequest).length}</b><span>{t("co.uni.requests")}</span></div>
          <div><b>{students}</b><span>{t("co.uni.verified_students")}</span></div>
        </div>
      )}
      <div className="co-toolbar">
        <Tabs items={[["all", t("co.all"), rows?.length], ["partners", t("co.uni.partners"), rows?.filter(isPartner).length],
                      ["requests", t("co.uni.requests"), rows?.filter(isRequest).length]] as [UniTab, string, number?][]}
              value={tab} onChange={setTab} />
        <form className="co-search" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <Icon name="search" size={18} />
          <input value={q} maxLength={80} placeholder={t("uni.search")} onChange={(e) => setQ(e.target.value)} />
          <button className="btn small" type="submit">{t("p.common.search")}</button>
        </form>
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="co-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="co-sk-block" style={{ height: 150 }} />)}</div>}
      {rows && shown.length === 0 && (
        <EmptyState icon="school" title={tab === "all" ? t("uni.empty") : t("co.uni.none")} text={tab === "all" ? undefined : t("co.uni.none_text")} />
      )}
      <div className="co-grid">
        {shown.map((u) => {
          const st = partnerState(u);
          return (
            <button key={u.id} className="co-uni" onClick={() => setOpen(u.id)}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <span className="co-uni-mark">{u.short_name.slice(0, 4)}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="co-clamp two">{u.name}</b>
                  <div className="hint">{[u.short_name, u.city].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <div className="co-uni-foot">
                <span><Icon name="users" size={15} /><b>{u.students}</b> {t("co.uni.students_short")}</span>
                {st ? <span className={`badge ${st === "accepted" ? "peer_verified" : st === "rejected" ? "rejected" : "pending"}`}>{t(`partners.${st}`)}</span>
                  : <span className="co-link">{t("co.uni.propose")} →</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UniversityDetail({ id, onBack }: { id: number; onBack: () => void }) {
  useLang();
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
    <div className="co-page">
      <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("uni.back")}</button>
      <div className="co-uni-hero">
        <span className="co-uni-mark big">{u.short_name.slice(0, 4)}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h1>{u.name}</h1>
          <div className="hint">{[u.short_name, u.city, u.region].filter(Boolean).join(" · ")}</div>
          {u.website && <a href={u.website} target="_blank" rel="noreferrer">{u.website.replace(/^https?:\/\//, "")}</a>}
        </div>
        <button className="btn" style={{ width: "auto" }} onClick={() => navigate(`/korxona/talabalar?university=${u.id}`)}>
          <Icon name="users" size={16} />{t("co.uni.see_students")}
        </button>
      </div>
      <div className="co-form-layout">
        <div className="co-col">
          <div className="co-card"><UniversityFacts u={u} /></div>
        </div>
        <aside className="co-col">
          {u.partnership && <PartnershipCard p={u.partnership} side="company" title={t("nav.university.partners")} onDecide={decide} />}
          {canAsk && (
            <div className="co-card">
              <div className="co-card-head"><b>{t("partners.ask")}</b></div>
              <p className="hint" style={{ marginTop: 0 }}>{t("co.uni.ask_hint")}</p>
              <label>{t("partners.message")}</label>
              <textarea value={text} maxLength={1000} rows={4} placeholder={t("co.uni.ask_ph")} onChange={(e) => setText(e.target.value)} />
              <ErrorText error={error} />
              <button className="btn" style={{ marginTop: 10 }} onClick={ask}><Icon name="send" size={16} />{t("partners.send")}</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
