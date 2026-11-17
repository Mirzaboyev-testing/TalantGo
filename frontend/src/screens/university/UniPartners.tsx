import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCatalog } from "../../api";
import { industryLabel } from "../../format";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate } from "../../router";
import { haptic } from "../../tg";
import { ErrorText, Sheet, message, toast } from "../../ui";
import { uapi, type DirectoryCompany, type PartnerRow } from "./uapi";
import type { Go } from "./UniversityApp";
import { Empty, Kpi, PageHead, Tabs, UIcon, UniLogo } from "./ukit";

type View = "partners" | "requests" | "directory";

/** Companies the university works with: partners, open requests both ways, and a directory to invite more. */
export default function UniPartners({ sub, go, onChanged }: { sub: string; go: Go; onChanged: () => void }) {
  useLang();
  const view: View = sub === "requests" || sub === "directory" ? sub : "partners";
  const [rows, setRows] = useState<PartnerRow[] | null>(null);
  const [asking, setAsking] = useState<DirectoryCompany | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => uapi.partners().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  const accepted = rows?.filter((p) => p.status === "accepted") ?? [];
  const incoming = rows?.filter((p) => p.status === "pending" && p.initiated_by === "company") ?? [];
  const outgoing = rows?.filter((p) => p.status === "pending" && p.initiated_by === "university") ?? [];
  const rejected = rows?.filter((p) => p.status === "rejected") ?? [];
  const sum = (k: "open_jobs" | "our_applicants" | "our_hires") => accepted.reduce((n, p) => n + p[k], 0);

  async function decide(p: PartnerRow, accept: boolean) {
    try {
      await uapi.decidePartner(p.id, accept);
      haptic("success");
      toast(accept ? t("u.pa.accepted_toast", { name: p.company }) : t("u.pa.rejected_toast"));
      void load(); onChanged();
    } catch (e) { setError(message(e)); }
  }

  return (
    <>
      <PageHead title={t("u.nav.partners")} sub={t("partners.intro")}
                actions={<button className="btn small" onClick={() => go("partners", "directory")}><Icon name="plus" size={16} />{t("u.pa.find")}</button>} />
      <div className="u-kpis" style={{ ["--n" as string]: 4 }}>
        <Kpi icon="building" label={t("u.pa.k.partners")} value={accepted.length} sub={t("u.pa.k.requests", { n: incoming.length + outgoing.length })} />
        <Kpi icon="briefcase" tone="blue" label={t("u.pa.k.jobs")} value={sum("open_jobs")} onClick={() => go("opportunities")} />
        <Kpi icon="inbox" tone="violet" label={t("u.pa.k.applicants")} value={sum("our_applicants")} />
        <Kpi icon="star" tone="amber" label={t("u.pa.k.hires")} value={sum("our_hires")} />
      </div>
      <Tabs value={view} onChange={(v) => go("partners", v === "partners" ? undefined : v)}
            items={[{ id: "partners", label: t("u.pa.tab_partners"), count: accepted.length || undefined, soft: true },
                    { id: "requests", label: t("u.pa.tab_requests"), count: incoming.length || undefined },
                    { id: "directory", label: t("u.pa.tab_directory") }]} />
      <ErrorText error={error} />
      {!rows && view !== "directory" && <div className="u-skel" style={{ minHeight: 200 }} />}

      {rows && view === "partners" && (accepted.length === 0
        ? <div className="u-panel"><Empty icon="building" tone="blue" title={t("u.pa.none")} text={t("u.pa.none_sub")}
                                         action={<button className="btn small" onClick={() => go("partners", "directory")}>{t("u.pa.find")}</button>} /></div>
        : <div className="u-cards">{accepted.map((p) => <PartnerCard key={p.id} p={p} />)}</div>)}

      {rows && view === "requests" && (
        <>
          {incoming.length + outgoing.length + rejected.length === 0 && <div className="u-panel"><Empty icon="inbox" title={t("partners.empty")} /></div>}
          {incoming.length > 0 && <h2>{t("u.pa.incoming")}</h2>}
          <div className="u-cards">
            {incoming.map((p) => (
              <PartnerCard key={p.id} p={p} foot={
                <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
                  <button className="btn small ghost" onClick={() => decide(p, false)}>{t("partners.reject")}</button>
                  <button className="btn small" onClick={() => decide(p, true)}><Icon name="tick" size={15} />{t("partners.accept")}</button>
                </div>} />
            ))}
          </div>
          {outgoing.length > 0 && <h2>{t("u.pa.outgoing")}</h2>}
          <div className="u-cards">{outgoing.map((p) => <PartnerCard key={p.id} p={p} foot={<span className="u-tag amber">{t("partners.pending_out")}</span>} />)}</div>
          {rejected.length > 0 && <h2>{t("u.pa.declined")}</h2>}
          <div className="u-cards">{rejected.map((p) => <PartnerCard key={p.id} p={p} foot={<span className="u-tag red">{t("partners.rejected")}</span>} />)}</div>
        </>
      )}

      {view === "directory" && <Directory onAsk={setAsking} />}
      {asking && <AskCompany company={asking} onClose={() => setAsking(null)} onSent={() => { setAsking(null); void load(); go("partners", "requests"); }} />}
    </>
  );
}

function PartnerCard({ p, foot }: { p: PartnerRow; foot?: React.ReactNode }) {
  useLang();
  return (
    <div className="u-card">
      <div className="u-card-top">
        <UniLogo small name={p.company} />
        <div className="grow" style={{ minWidth: 0 }}>
          <a href={`/korxonalar/${p.company_id}`} onClick={(e) => { e.preventDefault(); navigate(`/korxonalar/${p.company_id}`); }}><b>{p.company}</b></a>
          <span>{[industryLabel(p.industry), p.city].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      {p.message && <p style={{ margin: 0, fontSize: 13.5, whiteSpace: "pre-line", color: "var(--hint)" }}>“{p.message}”</p>}
      <div className="u-card-stats">
        <div><b>{p.open_jobs}</b><span>{t("u.pa.s.jobs")}</span></div>
        <div><b>{p.our_applicants}</b><span>{t("u.pa.s.applicants")}</span></div>
        <div><b>{p.our_hires}</b><span>{t("u.pa.s.hires")}</span></div>
      </div>
      <div className="u-card-foot">
        <span className="u-dim">{p.status === "accepted" && p.decided_at ? t("u.pa.since", { date: formatDateTime(p.decided_at, false) }) : formatDateTime(p.created_at, false)}</span>
        {foot}
      </div>
    </div>
  );
}

function Directory({ onAsk }: { onAsk: (c: DirectoryCompany) => void }) {
  useLang();
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [rows, setRows] = useState<DirectoryCompany[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { loadCatalog().then((c) => setIndustries(Object.keys(c.industries)), () => {}); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => uapi.companies(q.trim(), industry).then(setRows, (e) => setError(message(e))), 300);
    return () => window.clearTimeout(timer);
  }, [q, industry]);
  const shown = useMemo(() => rows ?? [], [rows]);
  return (
    <>
      <div className="u-filter-row" style={{ marginBottom: 12 }}>
        <div className="u-search"><span className="si"><Icon name="search" size={17} /></span>
          <input value={q} placeholder={t("u.pa.search_ph")} onChange={(e) => setQ(e.target.value)} /></div>
        <select className={industry ? "on" : ""} value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label={t("p.signup.industry")}>
          <option value="">{t("u.pa.all_industries")}</option>
          {industries.map((k) => <option key={k} value={k}>{industryLabel(k)}</option>)}
        </select>
      </div>
      <ErrorText error={error} />
      {!rows ? <div className="u-skel" style={{ minHeight: 200 }} /> : shown.length === 0 ? (
        <div className="u-panel"><Empty icon="search" title={t("u.pa.dir_none")} /></div>
      ) : (
        <div className="u-cards">
          {shown.map((c) => (
            <div key={c.id} className="u-card">
              <div className="u-card-top">
                <UniLogo small url={c.logo_url} name={c.name} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <a href={`/korxonalar/${c.id}`} onClick={(e) => { e.preventDefault(); navigate(`/korxonalar/${c.id}`); }}><b>{c.name}</b></a>
                  <span>{[industryLabel(c.industry), c.city].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
              <div className="u-card-stats">
                <div><b>{c.open_jobs}</b><span>{t("u.pa.s.jobs")}</span></div>
                <div><b>{c.our_applicants}</b><span>{t("u.pa.s.applicants")}</span></div>
                <div><b>{c.our_hires}</b><span>{t("u.pa.s.hires")}</span></div>
              </div>
              <div className="u-card-foot">
                {c.website ? <a className="u-link" href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer"><UIcon name="external" size={13} /> {t("p.signup.site")}</a> : <span />}
                {c.partnership?.status === "accepted" ? <span className="u-tag green"><Icon name="tick" size={12} />{t("partners.accepted")}</span>
                  : c.partnership?.status === "pending" ? <span className="u-tag amber">{c.partnership.initiated_by === "university" ? t("partners.pending_out") : t("partners.pending_in")}</span>
                  : <button className="btn small" onClick={() => onAsk(c)}><UIcon name="send" size={15} />{t("partners.ask")}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AskCompany({ company, onClose, onSent }: { company: DirectoryCompany; onClose: () => void; onSent: () => void }) {
  useLang();
  const [text, setText] = useState(t("u.pa.template", { company: company.name }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setBusy(true);
    try {
      await uapi.askPartner(company.id, text.trim());
      toast(t("partners.sent"));
      onSent();
    } catch (e) { setError(message(e)); setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <span className="hint">{t("partners.ask")}</span>
      <h1>{company.name}</h1>
      <label>{t("partners.message")}</label>
      <textarea value={text} rows={6} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      <p className="hint">{t("u.pa.ask_hint")}</p>
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={send}><UIcon name="send" size={16} />{t("partners.send")}</button>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>{t("common.cancel")}</button>
    </Sheet>
  );
}
