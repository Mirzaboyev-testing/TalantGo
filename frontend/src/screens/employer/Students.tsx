import { useCallback, useEffect, useState } from "react";
import { t, tMaybe, useLang } from "../../i18n";
import { attemptStatusLabel, courseText, verificationLabel } from "../../labels";
import { kindLabel } from "../../format";
import { navigate, useSearch } from "../../router";
import { absoluteUrl, api, formatPhone, JOB_KIND, loadCatalog,
         type Catalog, type JobKind, type StudentDetail, type StudentRow, type Track, type University } from "../../api";
import { haptic, openAfter, openLink } from "../../tg";
import { Avatar, ErrorText, Sheet, message, toast } from "../../ui";

/** Opens the signed PDF link; in Telegram it opens in the phone's browser, which saves the file. */
export async function downloadCv(studentId: number): Promise<void> {
  try {
    await openAfter(async () => absoluteUrl((await api.employer.cvLink(studentId)).url));
  } catch (e) {
    toast(message(e), "error");
  }
}

const industryLabels = (keys: string[], catalog: Catalog | null) => keys.map((k) => tMaybe(`industry.${k}`) ?? catalog?.industries[k] ?? k);

export default function Students({ onTest }: { onTest?: (attemptId: number) => void }) {
  useLang();
  const [unis, setUnis] = useState<University[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const fromUrl = useSearch();         // /korxona/talabalar?university=<id> comes from a university page
  const [filters, setFilters] = useState({ q: "", university_id: fromUrl.university ?? "", track_id: "", course: "", industry: "", job_type: "",
                                           verified_only: false, open_only: false, sort: "rating" });
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.universities().then(setUnis, () => {});
    api.tracks().then(setTracks, () => {});
    loadCatalog().then(setCatalog, () => {});
  }, []);

  const search = useCallback((f = filters) => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v) params[k] = String(v);
    setRows(null); setError("");
    api.employer.students(params).then(setRows, (e) => setError(message(e)));
  }, [filters]);
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (k: keyof typeof filters, v: string | boolean, now = false) => {
    const next = { ...filters, [k]: v };
    setFilters(next);
    if (now) search(next);
  };

  return (
    <div>
      <h1>{t("nav.company.students")}</h1>
      <p className="hint">{t("p.students.hint")}</p>
      <div className="card">
        <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="grow" value={filters.q} placeholder={t("p.students.search_ph")} onChange={(e) => update("q", e.target.value)} />
          <button className="btn small" type="submit">{t("p.common.search")}</button>
        </form>
        <div className="row" style={{ marginTop: 8 }}>
          <select className="grow" value={filters.university_id} onChange={(e) => update("university_id", e.target.value, true)}>
            <option value="">{t("p.students.all_unis")}</option>
            {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name}</option>)}
          </select>
          <select className="grow" value={filters.track_id} onChange={(e) => update("track_id", e.target.value, true)}>
            <option value="">{t("p.common.all_tracks")}</option>
            {tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.title.split(":")[0]}</option>)}
          </select>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <select className="grow" value={filters.industry} onChange={(e) => update("industry", e.target.value, true)}>
            <option value="">{t("p.students.any_industry")}</option>
            {catalog && Object.entries(catalog.industries).map(([k, label]) => <option key={k} value={k}>{tMaybe(`industry.${k}`) ?? label}</option>)}
          </select>
          <select className="grow" value={filters.course} onChange={(e) => update("course", e.target.value, true)}>
            <option value="">{t("p.students.any_course")}</option>
            {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{courseText(c)}</option>)}
            <option value="7">{t("course.master")}</option>
          </select>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <select className="grow" value={filters.job_type} onChange={(e) => update("job_type", e.target.value, true)}>
            <option value="">{t("p.students.any_job_type")}</option>
            {(Object.keys(JOB_KIND) as JobKind[]).map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
          <select className="grow" value={filters.sort} onChange={(e) => update("sort", e.target.value, true)}>
            <option value="rating">{t("p.students.sort_rating")}</option>
            <option value="tests">{t("p.students.sort_tests")}</option>
            <option value="new">{t("p.students.sort_new")}</option>
          </select>
        </div>
        <div className="row wrap" style={{ marginTop: 8, gap: 14 }}>
          <label className="radio-line"><input type="checkbox" checked={filters.verified_only} onChange={(e) => update("verified_only", e.target.checked, true)} />{t("p.students.verified_only")}</label>
          <label className="radio-line"><input type="checkbox" checked={filters.open_only} onChange={(e) => update("open_only", e.target.checked, true)} />{t("p.students.open_only")}</label>
        </div>
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">{t("common.loading")}</div>}
      {rows?.length === 0 && <div className="center hint">{t("p.students.empty")}</div>}
      {rows && rows.length > 0 && <div className="hint" style={{ margin: "4px 0 8px" }}>{t("p.students.count", { n: rows.length })}</div>}
      {rows?.map((r) => (
        <div key={r.id} className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className={`rank ${r.rank <= 3 ? "top" : ""}`} title={t("p.students.rank_title")}>{r.rank}</span>
            <Avatar name={r.full_name} url={r.photo_url} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row between">
                <b>{r.full_name}</b>
                {r.verification === "verified" && <span className="badge peer_verified">{t("p.students.verified")}</span>}
              </div>
              <div className="hint">{[r.university, r.faculty, courseText(r.course), r.group_name && t("p.students.group", { name: r.group_name })].filter(Boolean).join(" · ")}</div>
              <div className="hint">
                {r.track?.split(":")[0] ?? t("p.common.no_track")} · <b style={{ color: "var(--text)" }}>{t("p.common.points_n", { n: r.points })}</b> · {t("p.common.verified_works", { n: r.verified_tasks })}
                {r.test_percent != null ? ` · ${t("p.students.tests_pct", { n: r.test_percent })}` : ""}
              </div>
              {r.work_industries.length > 0 && (
                <div className="chips" style={{ marginTop: 6 }}>
                  {industryLabels(r.work_industries, catalog).map((s) => <span key={s} className="chip">{s}</span>)}
                  {r.skills.slice(0, 4).map((s) => <span key={s} className="chip">{s}</span>)}
                </div>
              )}
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn small" onClick={() => setOpen(r.id)}>{t("p.common.profile")}</button>
            <button className="btn small ghost" onClick={() => downloadCv(r.id)}>{t("p.common.cv_download")}</button>
            <button className="btn small ghost" onClick={() => navigate(`/korxona/vazifalar?talaba=${r.id}`)}>{t("stud.give_task")}</button>
            {r.username && <button className="btn small ghost" onClick={() => openLink(`https://t.me/${r.username}`)}>Telegram</button>}
          </div>
        </div>
      ))}
      {open && <StudentSheet id={open} catalog={catalog} onClose={() => setOpen(null)} onTest={onTest} />}
    </div>
  );
}

/** A student's full profile: study details, results, verified work, this company's tests, contact. */
export function StudentSheet({ id, catalog, onClose, onTest }: {
  id: number; catalog: Catalog | null; onClose: () => void; onTest?: (attemptId: number) => void;
}) {
  useLang();
  const [s, setS] = useState<StudentDetail | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [writing, setWriting] = useState(false);
  const load = useCallback(() => api.employer.student(id).then(setS, (e) => setError(message(e))), [id]);
  useEffect(() => { void load(); }, [load]);

  async function contact() {
    try {
      await api.employer.contact(id, msg.trim());
      haptic("success");
      toast(t("p.sheet.sent"));
      setWriting(false);
      void load();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <Sheet onClose={onClose}>
      <ErrorText error={error} />
      {!s && !error && <div className="hint">{t("common.loading")}</div>}
      {s && (
        <div>
          <div className="row">
            <Avatar name={s.full_name} url={s.photo_url} />
            <div className="grow">
              <h1 style={{ margin: 0 }}>{s.full_name}</h1>
              {s.headline && <div style={{ fontWeight: 600 }}>{s.headline}</div>}
              <div className="hint">{verificationLabel(s.verification)}{s.verified_by ? ` · ${s.verified_by}` : ""}</div>
            </div>
            <span className="rank top">{s.rank}</span>
          </div>
          <div className="stat-row" style={{ marginTop: 12 }}>
            <div className="card"><b>{s.points}</b><span className="hint">{t("home.points")}</span></div>
            <div className="card"><b>{s.verified_tasks}</b><span className="hint">{t("p.sheet.verified_works_stat")}</span></div>
            <div className="card"><b>{s.test_percent != null ? `${s.test_percent}%` : "—"}</b><span className="hint">{t("p.sheet.your_tests_stat")}</span></div>
          </div>
          <div className="card">
            <b>{t("p.sheet.study")}</b>
            <div>{s.university_name ?? s.university ?? "—"}</div>
            <div className="hint">{[s.faculty, courseText(s.course), s.group_name && t("p.students.group", { name: s.group_name }),
                                    s.graduation_year && t("p.sheet.graduates", { year: s.graduation_year }), s.gpa != null && `GPA ${s.gpa}/${s.gpa_scale}`].filter(Boolean).join(" · ")}</div>
            <div className="hint">{t("p.sheet.track", { track: s.track ?? "—" })}{s.city ? ` · ${s.city}` : ""}</div>
          </div>
          <div className="card">
            <b>{t("p.sheet.interests")}</b>
            {s.work_industries.length > 0 && <div className="hint">{t("p.sheet.industries", { list: industryLabels(s.work_industries, catalog).join(", ") })}</div>}
            {s.job_types.length > 0 && <div className="hint">{t("p.sheet.job_types", { list: s.job_types.map((k) => tMaybe(`job.kind.${k}`) ?? k).join(", ") })}</div>}
            {s.skills.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{s.skills.map((x) => <span key={x} className="chip">{x}</span>)}</div>}
            {s.languages.length > 0 && <div className="hint" style={{ marginTop: 6 }}>{t("p.sheet.languages", { list: s.languages.join(", ") })}</div>}
            {s.bio && <p style={{ whiteSpace: "pre-line" }}>{s.bio}</p>}
          </div>
          {s.cv.achievements.length > 0 && (
            <div className="card">
              <b>{t("p.sheet.verified_works")}</b>
              {s.cv.achievements.map((a, i) => (
                <div key={i} style={{ marginTop: 8 }}>
                  <div>{a.task}</div>
                  <div className="hint">{a.level_label} · {t("p.common.points_n", { n: a.points })}{a.verified_by.length ? ` · ${a.verified_by.map((v) => v.name).join(", ")}` : ""}</div>
                  {a.proof_url && <a href={a.proof_url} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); openLink(a.proof_url); }}>{t("p.sheet.view_work")}</a>}
                </div>
              ))}
            </div>
          )}
          {s.tests.length > 0 && (
            <div className="card">
              <b>{t("p.sheet.your_tests")}</b>
              {s.tests.map((x) => (
                <div key={x.attempt_id} className="row between" style={{ marginTop: 6 }}>
                  <span>{x.title}<div className="hint">{attemptStatusLabel(x.status)}</div></span>
                  {onTest ? <button className="btn small ghost" onClick={() => onTest(x.attempt_id)}>{x.score}/{x.max_score}</button>
                    : <b>{x.score}/{x.max_score}</b>}
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <b>{t("p.sheet.contact")}</b>
            {s.phone ? <div>{t("p.sheet.phone", { phone: formatPhone(s.phone) })}</div>
              : <div className="hint">{t("p.sheet.phone_hidden")}</div>}
            <div className="row wrap" style={{ marginTop: 8 }}>
              {s.username && <button className="btn small" onClick={() => openLink(`https://t.me/${s.username}`)}>{t("p.common.write_telegram")}</button>}
              <button className="btn small ghost" onClick={() => downloadCv(s.id)}>{t("p.common.cv_download")}</button>
              {s.github_url && <button className="btn small ghost" onClick={() => openLink(s.github_url)}>GitHub</button>}
              {s.linkedin_url && <button className="btn small ghost" onClick={() => openLink(s.linkedin_url)}>LinkedIn</button>}
            </div>
            {s.contact_status ? (
              <div className="hint" style={{ marginTop: 8 }}>{t("p.sheet.contact_status", {
                status: s.contact_status === "accepted" ? t("p.sheet.st_accepted") : s.contact_status === "declined" ? t("p.sheet.st_declined") : t("p.sheet.st_waiting"),
              })}</div>
            ) : writing ? (
              <div style={{ marginTop: 8 }}>
                <textarea value={msg} maxLength={1000} placeholder={t("p.sheet.msg_ph")} onChange={(e) => setMsg(e.target.value)} />
                <button className="btn small" style={{ marginTop: 6 }} disabled={msg.trim().length < 10} onClick={contact}>{t("p.sheet.send_bot")}</button>
              </div>
            ) : (
              <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setWriting(true)}>{t("p.sheet.request")}</button>
            )}
          </div>
          <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
        </div>
      )}
    </Sheet>
  );
}
