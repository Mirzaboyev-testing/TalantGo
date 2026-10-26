import { useCallback, useEffect, useState } from "react";
import { api, type Job, type Me, type MyOutcome, type OutcomeKind, type PublicCompany, type UniversityProfile } from "../api";
import { formatDateTime, t, useLang } from "../i18n";
import { navigate } from "../router";
import { PublicJobCard } from "../public/PublicJobs";
import { UniversityFacts } from "../public/PublicUniversities";
import { ErrorText, message, toast } from "../ui";

const KINDS: OutcomeKind[] = ["internship", "part_time", "full_time", "dual_education"];

/** The student's university: its page, the vacancies it recommends, and where the student works. */
export default function MyUniversity({ me }: { me: Me }) {
  useLang();
  const [data, setData] = useState<{ university: UniversityProfile | null; verified?: boolean; recommended: (Job & { note: string })[]; outcomes: MyOutcome[] } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.myUniversity().then(setData, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <div className="hint">{t("common.loading")}</div>;
  return (
    <div>
      <h1>{data.university?.name ?? t("nav.student.university")}</h1>
      {!data.university && (
        <div className="notice">{t("my.no_university")}{" "}
          <a href="/talaba/profil" onClick={(e) => { e.preventDefault(); navigate("/talaba/profil"); }}>{t("job.open_profile")}</a>
        </div>
      )}
      {data.university && me.verification !== "verified" && <div className="notice" style={{ marginBottom: 10 }}>{t("my.not_verified")}</div>}

      {data.university && (
        <>
          <h2 className="pub-h2">{t("my.recommended")}</h2>
          {data.recommended.length === 0 && <div className="card hint">{t("my.no_recommended")}</div>}
          <div className="job-grid">
            {data.recommended.map((j) => (
              <div key={j.id}>
                <PublicJobCard job={j} />
                {j.note && <p className="hint" style={{ margin: "4px 4px 0" }}>{j.note}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <MyWork outcomes={data.outcomes} onChanged={load} />

      {data.university && (
        <>
          <h2 className="pub-h2">{data.university.short_name}</h2>
          <UniversityFacts u={data.university} />
        </>
      )}
    </div>
  );
}

const OTHER = "other";

function MyWork({ outcomes, onChanged }: { outcomes: MyOutcome[]; onChanged: () => void }) {
  const [f, setF] = useState({ company: "", company_name: "", position: "", kind: "internship" as OutcomeKind, started_on: "" });
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api.public.companies({ limit: "60" }).then((r) => setCompanies(r.items), () => {}); }, []);
  const other = f.company === OTHER;
  const ready = other ? f.company_name.trim().length >= 2 : !!f.company;

  async function add() {
    setError("");
    try {
      await api.addOutcome({ company_id: other ? null : Number(f.company), company_name: other ? f.company_name.trim() : "",
                             position: f.position.trim(), kind: f.kind, started_on: f.started_on || null });
      setF({ company: "", company_name: "", position: "", kind: "internship", started_on: "" });
      toast(t("my.added"));
      onChanged();
    } catch (e) { setError(message(e)); }
  }
  async function remove(id: number) {
    try { await api.deleteOutcome(id); onChanged(); } catch (e) { setError(message(e)); }
  }
  return (
    <>
      <h2 className="pub-h2">{t("my.work")}</h2>
      {outcomes.map((o) => (
        <div key={o.id} className="card">
          <div className="row between">
            <b>{o.company}</b>
            <span className={`badge ${o.confirmed ? (o.confirmed_by === "company" ? "peer_verified" : "todo") : "pending"}`}>
              {o.confirmed ? t(o.confirmed_by === "company" ? "my.confirmed_company" : "my.confirmed_university") : t("my.pending")}
            </span>
          </div>
          <div className="hint">{[o.position, t(`outcome.kind.${o.kind}`), o.started_on && formatDateTime(o.started_on, false)].filter(Boolean).join(" · ")}</div>
          {o.source === "self" && <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => remove(o.id)}>{t("my.remove")}</button>}
        </div>
      ))}
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>{t("my.work_hint")}</p>
        <label>{t("my.company_pick")}</label>
        <select value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })}>
          <option value="">{t("task.f.choose")}</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value={OTHER}>{t("my.company_other")}</option>
        </select>
        {other && (
          <>
            <label>{t("my.company")}</label>
            <input value={f.company_name} maxLength={160} onChange={(e) => setF({ ...f, company_name: e.target.value })} />
          </>
        )}
        <label>{t("my.position")}</label>
        <input value={f.position} maxLength={160} onChange={(e) => setF({ ...f, position: e.target.value })} />
        <div className="row">
          <div className="grow"><label>{t("my.kind")}</label>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as OutcomeKind })}>
              {KINDS.map((k) => <option key={k} value={k}>{t(`outcome.kind.${k}`)}</option>)}
            </select>
          </div>
          <div className="grow"><label>{t("my.started")}</label><input type="date" value={f.started_on} onChange={(e) => setF({ ...f, started_on: e.target.value })} /></div>
        </div>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 10 }} disabled={!ready} onClick={add}>{t("my.add")}</button>
      </div>
    </>
  );
}
