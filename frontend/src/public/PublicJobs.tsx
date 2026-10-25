import { useCallback, useEffect, useState } from "react";
import { api, loadCatalog, type Catalog, type Job, type JobKind, type Me, type PublicJob } from "../api";
import { dayLabel, industryLabel, kindLabel, modeLabel, salaryText } from "../format";
import { formatDateTime, t } from "../i18n";
import { Icon } from "../icons";
import { navigate, useSearch } from "../router";
import { statusLabel } from "../pipeline";
import { ErrorText, message, toast } from "../ui";

const KINDS: JobKind[] = ["internship", "part_time", "junior", "project"];
const PAGE = 20;

/** Bookmarks of a signed-in student; null for everyone else (the heart is hidden then). */
function useSaved(me: Me | null) {
  const student = me?.account_type === "student";
  const [ids, setIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (student) api.savedJobs().then((jobs) => setIds(new Set(jobs.map((j) => j.id))), () => setIds(new Set()));
  }, [student]);
  const toggle = useCallback(async (id: number) => {
    if (!ids) return;
    const on = !ids.has(id);
    setIds(new Set(on ? [...ids, id] : [...ids].filter((x) => x !== id)));
    try { await (on ? api.saveJob(id) : api.unsaveJob(id)); } catch (e) { toast(message(e)); }
  }, [ids]);
  return student ? { ids, toggle } : null;
}

export function PublicJobCard({ job, saved, onToggleSave }: { job: PublicJob | Job; saved?: boolean; onToggleSave?: () => void }) {
  return (
    <a className="card job-card tap" href={`/vakansiyalar/${job.id}`} onClick={(e) => { e.preventDefault(); navigate(`/vakansiyalar/${job.id}`); }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span className="avatar company-mark">{job.company_name.slice(0, 1).toUpperCase()}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="job-title">{job.title}</b>
          <div className="job-salary">{salaryText(job)}</div>
          <div className="hint">{job.company_name}{job.city ? ` · ${job.city}` : ""}</div>
        </div>
        {onToggleSave && (
          <button className={`icon-btn heart ${saved ? "on" : ""}`} title={t(saved ? "job.saved" : "job.save")} aria-label={t(saved ? "job.saved" : "job.save")}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
                 strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" /></svg>
          </button>
        )}
      </div>
      <div className="row between" style={{ marginTop: 8 }}>
        <div className="chips">
          <span className="chip">{kindLabel(job.kind)}</span>
          <span className="chip">{modeLabel(job.work_mode)}</span>
          {job.counts_as_practice && <span className="chip">{t("job.practice")}</span>}
        </div>
        <span className="hint" style={{ whiteSpace: "nowrap" }}>{dayLabel(job.created_at)}</span>
      </div>
    </a>
  );
}

export function JobsPage({ me }: { me: Me | null }) {
  const search = useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const [kind, setKind] = useState<JobKind | "">((search.kind as JobKind) ?? "");
  const [industry, setIndustry] = useState(search.industry ?? "");
  const [paid, setPaid] = useState(false);
  const [practice, setPractice] = useState(false);
  const [items, setItems] = useState<PublicJob[] | null>(null);
  const [total, setTotal] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const saved = useSaved(me);

  const params = useCallback((offset: number) => {
    const p: Record<string, string> = { limit: String(PAGE), offset: String(offset) };
    if (q.trim()) p.q = q.trim();
    if (kind) p.kind = kind;
    if (industry) p.industry = industry;
    if (paid) p.paid_only = "true";
    if (practice) p.practice_only = "true";
    return p;
  }, [q, kind, industry, paid, practice]);

  const load = useCallback(() => {
    setItems(null); setError("");
    api.public.jobs(params(0)).then((r) => { setItems(r.items); setTotal(r.total); }, (e) => setError(message(e)));
  }, [params]);

  useEffect(() => { void load(); }, [kind, industry, paid, practice]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadCatalog().then(setCatalog, () => {}); }, []);

  async function more() {
    try {
      const r = await api.public.jobs(params(items?.length ?? 0));
      setItems((cur) => [...(cur ?? []), ...r.items]); setTotal(r.total);
    } catch (e) { setError(message(e)); }
  }

  return (
    <div>
      <form className="pub-search" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input value={q} maxLength={80} placeholder={t("pub.hero.search")} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">{t("pub.hero.search_btn")}</button>
      </form>
      <div className="scroll-tabs" style={{ marginTop: 10 }}>
        <button className={`chip ${kind === "" ? "on" : ""}`} onClick={() => setKind("")}>{t("pub.filter.all")}</button>
        {KINDS.map((k) => <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{kindLabel(k)}</button>)}
        <button className={`chip ${paid ? "on" : ""}`} onClick={() => setPaid(!paid)}>{t("pub.filter.paid")}</button>
        <button className={`chip ${practice ? "on" : ""}`} onClick={() => setPractice(!practice)}>{t("pub.filter.practice")}</button>
      </div>
      {catalog && (
        <select className="pub-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">{t("pub.filter.any_industry")}</option>
          {Object.keys(catalog.industries).map((k) => <option key={k} value={k}>{industryLabel(k)}</option>)}
        </select>
      )}
      <ErrorText error={error} />
      {items && <div className="hint" style={{ margin: "12px 0 6px" }}>{t("pub.jobs.count", { n: total })}</div>}
      {!items && !error && <div className="hint">{t("common.loading")}</div>}
      {items?.length === 0 && <div className="card hint">{t("pub.jobs.empty")}</div>}
      <div className="job-grid">
        {items?.map((j) => (
          <PublicJobCard key={j.id} job={j} saved={saved?.ids?.has(j.id)} onToggleSave={saved?.ids ? () => saved.toggle(j.id) : undefined} />
        ))}
      </div>
      {items && items.length < total && <button className="btn ghost" style={{ marginTop: 12 }} onClick={more}>{t("pub.jobs.more")}</button>}
    </div>
  );
}

export function JobPage({ id, me }: { id: number; me: Me | null }) {
  const [job, setJob] = useState<PublicJob | null>(null);
  const [mine, setMine] = useState<Job | null>(null);          // the signed-in student's view: applied? saved?
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const student = me?.account_type === "student";

  useEffect(() => {
    api.public.job(id).then(setJob, (e) => setError(message(e)));
    if (student) api.job(id).then(setMine, () => {});
  }, [id, student]);

  async function apply() {
    setBusy(true); setError("");
    try {
      await api.apply(id, note.trim());
      setMine(await api.job(id));
      toast(t("job.applied_ok"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (!mine) return;
    try {
      await (mine.saved ? api.unsaveJob(id) : api.saveJob(id));
      setMine({ ...mine, saved: !mine.saved });
    } catch (e) { setError(message(e)); }
  }

  if (error && !job) return <ErrorText error={error} />;
  if (!job) return <div className="hint">{t("common.loading")}</div>;
  const notReady = me?.verification === "none" || me?.verification === "rejected";
  const applied = mine?.applied && mine.application_status !== "withdrawn";

  return (
    <div className="job-page">
      <button className="btn small ghost" onClick={() => navigate("/vakansiyalar")}><Icon name="back" size={16} />{t("job.back")}</button>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <span className="avatar company-mark">{job.company_name.slice(0, 1).toUpperCase()}</span>
          <div className="grow">
            <h1 style={{ margin: "0 0 4px" }}>{job.title}</h1>
            <div className="job-salary">{salaryText(job)}</div>
            <a href={`/korxonalar/${job.company_id}`} onClick={(e) => { e.preventDefault(); navigate(`/korxonalar/${job.company_id}`); }}>
              {job.company_name}
            </a>
            <span className="hint"> · {industryLabel(job.company_industry)}{job.city ? ` · ${job.city}` : ""}</span>
            <div className="hint" style={{ marginTop: 2 }}><Icon name="verified" size={14} /> {t("job.verified_company")}</div>
          </div>
          {mine && (
            <button className={`icon-btn heart ${mine.saved ? "on" : ""}`} title={t(mine.saved ? "job.saved" : "job.save")} onClick={toggleSave}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={mine.saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8"
                   strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" /></svg>
            </button>
          )}
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          <span className="chip">{kindLabel(job.kind)}</span>
          <span className="chip">{modeLabel(job.work_mode)}</span>
          {job.hours_per_week && <span className="chip">{t("job.hours", { n: job.hours_per_week })}</span>}
          {job.deadline && <span className="chip">{t("job.deadline", { date: formatDateTime(job.deadline, false) })}</span>}
          {job.counts_as_practice && <span className="chip">{t("job.practice")}</span>}
        </div>
      </div>
      <div className="card">
        <b>{t("job.description")}</b>
        <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{job.description}</p>
      </div>
      {job.requirements && (
        <div className="card">
          <b>{t("job.requirements")}</b>
          <p style={{ whiteSpace: "pre-line", marginBottom: 0 }}>{job.requirements}</p>
        </div>
      )}
      {job.skills.length > 0 && <div className="chips" style={{ marginBottom: 12 }}>{job.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>}

      <div className="card">
        {!me && <button className="btn" onClick={() => navigate(`/kirish/talaba?next=/vakansiyalar/${id}`)}>{t("job.apply_login")}</button>}
        {me && !student && <p className="hint" style={{ margin: 0 }}>{t("job.only_students")}</p>}
        {student && applied && (
          <p className="notice" style={{ margin: 0 }}>
            {t("app.mine.applied", { status: statusLabel(mine?.application_status ?? "new") })}{" "}
            <a href="/talaba/arizalar" onClick={(e) => { e.preventDefault(); navigate("/talaba/arizalar"); }}>{t("jobs.tab.mine")}</a>
          </p>
        )}
        {student && !applied && notReady && (
          <p className="notice" style={{ margin: 0 }}>
            {t("job.need_verification")}{" "}
            <a href="/talaba/profil" onClick={(e) => { e.preventDefault(); navigate("/talaba/profil"); }}>{t("job.open_profile")}</a>
          </p>
        )}
        {student && !applied && !notReady && (
          <>
            <b>{t("job.apply")}</b>
            <textarea value={note} maxLength={1500} placeholder={t("job.apply_note")} onChange={(e) => setNote(e.target.value)} />
            <ErrorText error={error} />
            <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={apply}>{t("job.apply")}</button>
          </>
        )}
      </div>
    </div>
  );
}
