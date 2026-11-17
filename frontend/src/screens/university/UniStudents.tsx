import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { courseText, verificationLabel } from "../../labels";
import { statusLabel } from "../../pipeline";
import { haptic } from "../../tg";
import { Avatar, ErrorText, message, toast } from "../../ui";
import { uapi, type Facets, type RosterRow, type StudentCard, type StudentFilter } from "./uapi";
import type { Go } from "./UniversityApp";
import { Drawer, Empty, PageHead, Panel, Tabs, Toggle, UIcon, ago } from "./ukit";

const BADGE: Record<Verification, string> = { verified: "green", pending: "amber", rejected: "red", none: "" };
const REASONS = ["id", "faculty", "not_ours", "name"] as const;
const SORTS = ["points", "name", "recent", "active", "works", "pending"] as const;

export function VerifyBadge({ v }: { v: Verification }) {
  return <span className={`u-tag ${BADGE[v]}`}>{verificationLabel(v)}</span>;
}

/** Students of the university: a filterable table with a card per student, and the verification queue. */
export default function UniStudents({ sub, go, onChanged }: { sub: string; go: Go; onChanged: () => void }) {
  useLang();
  const view = sub === "queue" ? "queue" : "all";
  const [pending, setPending] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => { setVersion((v) => v + 1); onChanged(); }, [onChanged]);
  useEffect(() => { uapi.facets().then((f) => setPending(f.counts.pending), () => {}); }, [version]);
  const preset = sub.startsWith("faculty:") ? sub.slice(8) : "";

  return (
    <>
      <PageHead title={t("u.nav.students")} sub={t("u.st.sub")}
                actions={<button className="btn small ghost" onClick={() => go("profile", "invite")}><UIcon name="link" size={16} />{t("u.st.invite")}</button>} />
      <Tabs value={view} onChange={(v) => go("students", v === "queue" ? "queue" : undefined)}
            items={[{ id: "all", label: t("u.st.tab_all") }, { id: "queue", label: t("u.st.tab_queue"), count: pending ?? undefined }]} />
      {view === "all" ? <Roster key={`r${version}`} preset={preset} onOpen={setOpenId} onChanged={refresh} />
        : <Queue key={`q${version}`} onOpen={setOpenId} onChanged={refresh} />}
      {openId !== null && <StudentDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </>
  );
}

// ------------------------------------------------------------------ the table

function Roster({ preset, onOpen, onChanged }: { preset: string; onOpen: (id: number) => void; onChanged: () => void }) {
  useLang();
  const [f, setF] = useState<StudentFilter>(preset ? { faculty: preset } : {});
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("points");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState<{ items: RosterRow[]; total: number } | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [more, setMore] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const typing = useRef<number | undefined>(undefined);

  useEffect(() => { uapi.facets(f.faculty).then(setFacets, () => {}); }, [f.faculty]);
  useEffect(() => {
    setData(null);
    uapi.roster(f, sort, page, limit).then(setData, (e) => setError(message(e)));
  }, [f, sort, page, limit]);
  useEffect(() => {          // search as you type, after a short pause
    window.clearTimeout(typing.current);
    typing.current = window.setTimeout(() => setF((cur) => (cur.q ?? "") === q.trim() ? cur : { ...cur, q: q.trim() || undefined }), 350);
    return () => window.clearTimeout(typing.current);
  }, [q]);

  const setFilter = (k: keyof StudentFilter, v: string | undefined) => {
    setPage(1); setSelected(new Set());
    setF((cur) => { const next = { ...cur, [k]: v || undefined }; if (k === "faculty") delete next.group; return next; });
  };
  const segment = (patch: StudentFilter) => { setPage(1); setSelected(new Set()); setQ(""); setF(patch); };
  const isSeg = (patch: StudentFilter) => JSON.stringify(Object.fromEntries(Object.entries(f).filter(([, v]) => v))) === JSON.stringify(patch);
  const active = Object.entries(f).filter(([k, v]) => v && k !== "q") as [keyof StudentFilter, string][];
  const pages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  const pendingSelected = data?.items.filter((r) => selected.has(r.id) && r.verification === "pending").map((r) => r.id) ?? [];

  const labelOf = (k: keyof StudentFilter, v: string): string => {
    if (k === "course") return courseText(Number(v));
    if (k === "verification") return verificationLabel(v as Verification);
    if (k === "track_id") return facets?.tracks.find((x) => String(x.id) === v)?.title ?? v;
    if (k === "open_to_work") return t("u.st.f.ready");
    if (k === "cv_public") return t("u.st.f.cv");
    if (k === "activity") return t(`u.st.act.${v}` as "u.st.act.7d");
    if (k === "outcome") return t(`u.st.out.${v}` as "u.st.out.applied");
    if (k === "graduation_year") return t("u.st.grad", { year: v });
    return v;
  };

  async function bulk(approve: boolean, note = "") {
    try {
      const r = await uapi.verifyBulk(pendingSelected, approve, note);
      haptic("success");
      toast(t(approve ? "u.st.bulk_ok" : "u.st.bulk_no", { n: r.done }));
      setSelected(new Set()); setRejecting(false); onChanged();
    } catch (e) { toast(message(e), "error"); }
  }

  const counts = facets?.counts;
  return (
    <>
      <div className="u-segments">
        {([["all", {}, counts?.all], ["pending", { verification: "pending" }, counts?.pending], ["verified", { verification: "verified" }, counts?.verified],
           ["ready", { open_to_work: "true" }, counts?.open_to_work], ["cv", { cv_public: "true" }, counts?.cv_public],
           ["inactive", { activity: "inactive" }, counts?.inactive]] as [string, StudentFilter, number | undefined][]).map(([key, patch, n]) => (
          <button key={key} className={`u-seg ${isSeg(patch) ? "on" : ""} ${key === "pending" && n ? "amber" : ""}`} onClick={() => segment(patch)}>
            <b>{n ?? "…"}</b><span>{t(`u.st.seg.${key}` as "u.st.seg.all")}</span>
          </button>
        ))}
      </div>

      <Panel className="flush">
        <div style={{ padding: 14 }}>
          <div className="u-filters">
            <div className="u-filter-row">
              <div className="u-search">
                <span className="si"><Icon name="search" size={17} /></span>
                <input value={q} placeholder={t("u.st.search_ph")} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className={f.faculty ? "on" : ""} value={f.faculty ?? ""} onChange={(e) => setFilter("faculty", e.target.value)} aria-label={t("u.col.faculty")}>
                <option value="">{t("emp.all_faculties")}</option>
                {facets?.faculties.map((x) => <option key={x.value} value={x.value}>{x.value} ({x.count})</option>)}
              </select>
              <select className={f.course ? "on" : ""} value={f.course ?? ""} onChange={(e) => setFilter("course", e.target.value)} aria-label={t("u.col.course")}>
                <option value="">{t("u.st.all_courses")}</option>
                {facets?.courses.map((x) => <option key={x.value} value={x.value}>{courseText(x.value)} ({x.count})</option>)}
              </select>
              <select className={f.verification ? "on" : ""} value={f.verification ?? ""} onChange={(e) => setFilter("verification", e.target.value)} aria-label={t("u.col.status")}>
                <option value="">{t("u.st.all_status")}</option>
                {(["pending", "verified", "rejected", "none"] as Verification[]).map((v) => <option key={v} value={v}>{verificationLabel(v)}</option>)}
              </select>
              <button className={`u-toggle ${more ? "on" : ""}`} onClick={() => setMore(!more)}><UIcon name="filter" size={16} />{t("u.st.more")}{active.length > 0 && <span className="u-tag green" style={{ padding: "0 7px" }}>{active.length}</span>}</button>
            </div>
            {more && (
              <div className="u-filter-row">
                <select className={f.group ? "on" : ""} value={f.group ?? ""} onChange={(e) => setFilter("group", e.target.value)} aria-label={t("u.col.group")}>
                  <option value="">{t("u.st.all_groups")}</option>
                  {facets?.groups.map((x) => <option key={x.value} value={x.value}>{x.value} ({x.count})</option>)}
                </select>
                <select className={f.track_id ? "on" : ""} value={f.track_id ?? ""} onChange={(e) => setFilter("track_id", e.target.value)} aria-label={t("u.col.track")}>
                  <option value="">{t("p.common.all_tracks")}</option>
                  {facets?.tracks.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.count})</option>)}
                </select>
                <select className={f.graduation_year ? "on" : ""} value={f.graduation_year ?? ""} onChange={(e) => setFilter("graduation_year", e.target.value)} aria-label={t("u.st.grad_label")}>
                  <option value="">{t("u.st.all_years")}</option>
                  {facets?.years.map((x) => <option key={x.value} value={x.value}>{t("u.st.grad", { year: x.value })} ({x.count})</option>)}
                </select>
                <select className={f.activity ? "on" : ""} value={f.activity ?? ""} onChange={(e) => setFilter("activity", e.target.value)} aria-label={t("u.col.active")}>
                  <option value="">{t("u.st.any_activity")}</option>
                  {["7d", "30d", "inactive"].map((v) => <option key={v} value={v}>{t(`u.st.act.${v}` as "u.st.act.7d")}</option>)}
                </select>
                <select className={f.outcome ? "on" : ""} value={f.outcome ?? ""} onChange={(e) => setFilter("outcome", e.target.value)} aria-label={t("u.st.outcome")}>
                  <option value="">{t("u.st.any_outcome")}</option>
                  {["applied", "hired", "placed", "none"].map((v) => <option key={v} value={v}>{t(`u.st.out.${v}` as "u.st.out.applied")}</option>)}
                </select>
                <Toggle on={f.open_to_work === "true"} onChange={(on) => setFilter("open_to_work", on ? "true" : undefined)}>{t("u.st.f.ready")}</Toggle>
                <Toggle on={f.cv_public === "true"} onChange={(on) => setFilter("cv_public", on ? "true" : undefined)}>{t("u.st.f.cv")}</Toggle>
              </div>
            )}
            <div className="row between wrap" style={{ gap: 8 }}>
              <div className="u-active">
                {active.map(([k, v]) => (
                  <span key={k} className="chip on">{labelOf(k, v)}<button aria-label={t("u.st.remove_filter")} onClick={() => setFilter(k, undefined)}><Icon name="close" size={11} /></button></span>
                ))}
                {active.length > 0 && <button className="link-btn" onClick={() => segment({})}>{t("u.st.clear")}</button>}
                <span className="hint">{data ? t("u.st.found", { n: data.total }) : t("common.loading")}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} style={{ width: "auto", height: 36, fontSize: 13.5 }} aria-label={t("u.st.sort")}>
                  {SORTS.map((s) => <option key={s} value={s}>{t(`u.st.sort.${s}` as "u.st.sort.points")}</option>)}
                </select>
                <button className="btn small ghost" onClick={() => uapi.exportStudents(f).catch((e) => toast(message(e), "error"))}><UIcon name="download" size={16} />Excel</button>
              </div>
            </div>
          </div>
        </div>
        <ErrorText error={error} />
        {data && data.items.length === 0 ? (
          <Empty icon="search" title={active.length || f.q ? t("u.st.none_filtered") : t("p.uni.no_students")}
                 text={active.length || f.q ? t("u.st.none_filtered_sub") : t("u.st.none_sub")}
                 action={active.length || f.q ? <button className="btn small soft" onClick={() => segment({})}>{t("u.st.clear")}</button> : undefined} />
        ) : (
          <div className="u-table-wrap">
            <table className="u-table cards">
              <thead><tr>
                <th className="ck"><input type="checkbox" aria-label={t("u.st.select_all")} checked={!!data && data.items.length > 0 && data.items.every((r) => selected.has(r.id))}
                                          onChange={(e) => setSelected(e.target.checked ? new Set(data?.items.map((r) => r.id)) : new Set())} /></th>
                <th>{t("u.col.student")}</th><th>{t("u.col.faculty")}</th><th>{t("u.col.course")}</th><th>{t("u.col.status")}</th>
                <th className="hide-md">{t("u.col.track")}</th><th className="num">{t("u.col.points")}</th><th className="num">{t("u.col.apps")}</th>
                <th>{t("u.col.last_seen")}</th><th>{t("u.col.flags")}</th>
              </tr></thead>
              <tbody>
                {!data && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={10}><div className="u-skel" style={{ minHeight: 26 }} /></td></tr>)}
                {data?.items.map((r) => (
                  <tr key={r.id} className={selected.has(r.id) ? "sel" : ""} onClick={() => onOpen(r.id)}>
                    <td className="ck" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={r.full_name} checked={selected.has(r.id)}
                             onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(r.id); else next.delete(r.id); setSelected(next); }} />
                    </td>
                    <td className="main"><div className="u-person"><Avatar name={r.full_name} url={r.photo_url} />
                      <div style={{ minWidth: 0 }}><b>{r.full_name}</b><span>{r.student_number ? `ID ${r.student_number}` : "—"}</span></div></div></td>
                    <td data-label={t("u.col.faculty")}>{r.faculty || "—"}{r.group_name && <div className="u-dim">{r.group_name}</div>}</td>
                    <td data-label={t("u.col.course")} className="nowrap">{courseText(r.course) || "—"}</td>
                    <td data-label={t("u.col.status")}><VerifyBadge v={r.verification} /></td>
                    <td data-label={t("u.col.track")} className="hide-sm hide-md"><span className="u-dim nowrap" title={r.track ?? ""}>{r.track ? r.track.split(":")[0] : "—"}</span></td>
                    <td className="num" data-label={t("u.col.points")}>{r.points}</td>
                    <td className="num" data-label={t("u.col.apps")}>{r.applications}</td>
                    <td data-label={t("u.col.last_seen")}><span className="u-dim nowrap">{ago(r.last_seen_at)}</span></td>
                    <td data-label={t("u.col.flags")}>{(r.placed || r.hired || r.open_to_work || r.cv_public) && <div className="u-flags" style={{ minWidth: 90 }}>
                      {r.placed && <span className="u-tag green">{t("u.st.flag.placed")}</span>}
                      {!r.placed && r.hired && <span className="u-tag green">{t("u.st.flag.hired")}</span>}
                      {r.open_to_work && <span className="u-tag blue">{t("u.st.flag.ready")}</span>}
                      {r.cv_public && <span className="u-tag">CV</span>}
                    </div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="u-pager">
            <span>{t("u.st.range", { from: (page - 1) * limit + 1, to: Math.min(page * limit, data.total), total: data.total })}</span>
            <div className="row">
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} aria-label={t("u.st.per_page")}>
                {[25, 50, 100].map((n) => <option key={n} value={n}>{t("u.st.per_page_n", { n })}</option>)}
              </select>
              <button className="icon-btn" disabled={page <= 1} aria-label={t("u.prev")} onClick={() => setPage(page - 1)}><UIcon name="left" size={16} /></button>
              <span>{page} / {pages}</span>
              <button className="icon-btn" disabled={page >= pages} aria-label={t("u.next")} onClick={() => setPage(page + 1)}><UIcon name="right" size={16} /></button>
            </div>
          </div>
        )}
      </Panel>

      {selected.size > 0 && (
        <div className="u-bulk">
          <b>{t("u.st.selected", { n: selected.size })}</b>
          <span style={{ opacity: .8, fontSize: 13 }}>{pendingSelected.length > 0 ? t("u.st.selected_pending", { n: pendingSelected.length }) : t("u.st.selected_none_pending")}</span>
          <span className="grow" />
          {rejecting ? <RejectBox onCancel={() => setRejecting(false)} onReject={(note) => bulk(false, note)} dark />
            : <>
                <button className="btn small ghost" onClick={() => setSelected(new Set())}>{t("common.cancel")}</button>
                <button className="btn small bad" disabled={!pendingSelected.length} onClick={() => setRejecting(true)}>{t("p.uni.reject")}</button>
                <button className="btn small" disabled={!pendingSelected.length} onClick={() => bulk(true)} style={{ background: "#22c55e" }}><Icon name="verified" size={16} />{t("u.st.verify_n", { n: pendingSelected.length })}</button>
              </>}
        </div>
      )}
    </>
  );
}

function RejectBox({ onReject, onCancel, dark }: { onReject: (note: string) => void; onCancel: () => void; dark?: boolean }) {
  useLang();
  const [note, setNote] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 560 }}>
      <div className="u-reasons">
        {REASONS.map((r) => (
          <button key={r} className="chip" style={dark ? { background: "rgba(255,255,255,.12)", color: "#fff", borderColor: "rgba(255,255,255,.3)" } : undefined}
                  onClick={() => setNote(t(`u.st.reason.${r}` as "u.st.reason.id"))}>{t(`u.st.reason.${r}` as "u.st.reason.id")}</button>
        ))}
      </div>
      <div className="row">
        <input value={note} placeholder={t("p.uni.note_ph")} onChange={(e) => setNote(e.target.value)} style={dark ? { color: "var(--text)" } : undefined} />
        <button className="btn small ghost" onClick={onCancel}>{t("common.cancel")}</button>
        <button className="btn small bad" disabled={note.trim().length < 3} onClick={() => onReject(note.trim())}>{t("p.uni.reject")}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the verification queue

function Queue({ onOpen, onChanged }: { onOpen: (id: number) => void; onChanged: () => void }) {
  useLang();
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectFor, setRejectFor] = useState<number | "bulk" | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => uapi.roster({ verification: "pending" }, "pending", 1, 200).then((r) => setRows(r.items), (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function decide(ids: number[], approve: boolean, note = "") {
    try {
      if (ids.length === 1) await uapi.verify(ids[0], approve, note); else await uapi.verifyBulk(ids, approve, note);
      haptic("success");
      toast(t(approve ? "u.st.bulk_ok" : "u.st.bulk_no", { n: ids.length }));
      setSelected(new Set()); setRejectFor(null); onChanged();
    } catch (e) { toast(message(e), "error"); }
  }

  if (error) return <ErrorText error={error} />;
  if (!rows) return <div className="u-skel" style={{ minHeight: 240 }} />;
  if (rows.length === 0) {
    return <Panel><Empty icon="verified" title={t("u.st.queue_empty")} text={t("u.st.queue_empty_sub")} /></Panel>;
  }
  return (
    <>
      <div className="u-grid c21" style={{ alignItems: "start" }}>
        <div>
          <div className="row between wrap" style={{ marginBottom: 10, gap: 8 }}>
            <label className="u-toggle" style={{ background: "var(--bg)" }}>
              <input type="checkbox" checked={rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
              {t("u.st.select_all_n", { n: rows.length })}
            </label>
            {selected.size > 0 && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn small bad" onClick={() => setRejectFor("bulk")}>{t("p.uni.reject")}</button>
                <button className="btn small" onClick={() => decide([...selected], true)}><Icon name="verified" size={16} />{t("u.st.verify_n", { n: selected.size })}</button>
              </div>
            )}
          </div>
          {rejectFor === "bulk" && <Panel><RejectBox onCancel={() => setRejectFor(null)} onReject={(note) => decide([...selected], false, note)} /></Panel>}
          <div className="u-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
            {rows.map((r) => (
              <div key={r.id} className="u-card" style={selected.has(r.id) ? { borderColor: "var(--brand)", boxShadow: "0 0 0 3px rgba(22,163,74,.12)" } : undefined}>
                <div className="u-card-top">
                  <input type="checkbox" style={{ width: 18, height: 18, marginTop: 10 }} aria-label={r.full_name} checked={selected.has(r.id)}
                         onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(r.id); else next.delete(r.id); setSelected(next); }} />
                  <Avatar name={r.full_name} url={r.photo_url} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <button className="link-btn" style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600, fontSize: 15 }} onClick={() => onOpen(r.id)}>{r.full_name}</button>
                    <span style={{ display: "block" }}>{t("u.st.waiting_since", { when: ago(r.created_at) })}</span>
                  </div>
                </div>
                <dl className="u-dl">
                  <dt>{t("u.st.check.id")}</dt><dd>{r.student_number || <span className="u-tag red">{t("u.st.missing")}</span>}</dd>
                  <dt>{t("u.col.faculty")}</dt><dd>{r.faculty || "—"}</dd>
                  <dt>{t("u.col.course")} / {t("u.col.group")}</dt><dd>{[courseText(r.course), r.group_name].filter(Boolean).join(" · ") || "—"}</dd>
                </dl>
                {rejectFor === r.id ? <RejectBox onCancel={() => setRejectFor(null)} onReject={(note) => decide([r.id], false, note)} /> : (
                  <div className="u-card-foot">
                    <button className="btn small ghost" onClick={() => onOpen(r.id)}><UIcon name="eye" size={15} />{t("u.st.open")}</button>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn small bad" onClick={() => setRejectFor(r.id)}>{t("p.uni.reject")}</button>
                      <button className="btn small" onClick={() => decide([r.id], true)}><Icon name="tick" size={15} />{t("p.uni.verify")}</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <Panel title={t("u.st.how_title")} icon="shield">
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
            <li>{t("u.st.how1")}</li><li>{t("u.st.how2")}</li><li>{t("u.st.how3")}</li><li>{t("u.st.how4")}</li>
          </ol>
          <p className="hint" style={{ marginBottom: 0 }}>{t("p.uni.verify_hint")}</p>
        </Panel>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ one student

function StudentDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  useLang();
  const [s, setS] = useState<StudentCard | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { uapi.student(id).then(setS, (e) => setError(message(e))); }, [id]);

  async function decide(approve: boolean, note = "") {
    try {
      await uapi.verify(id, approve, note);
      haptic("success");
      toast(approve ? t("u.st.verified_one") : t("u.st.rejected_one"));
      onChanged(); onClose();
    } catch (e) { setError(message(e)); }
  }
  const head = s ? (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <Avatar name={s.full_name} url={s.photo_url} />
      <div style={{ minWidth: 0 }}>
        <h2>{s.full_name}</h2>
        <div className="u-chipline" style={{ marginTop: 6 }}>
          <VerifyBadge v={s.verification} />
          {s.open_to_work && <span className="u-tag blue">{t("u.st.flag.ready")}</span>}
          {s.placed && <span className="u-tag green">{t("u.st.flag.placed")}</span>}
        </div>
      </div>
    </div>
  ) : <b>{t("common.loading")}</b>;
  const foot = s && s.verification === "pending" ? (
    rejecting ? <RejectBox onCancel={() => setRejecting(false)} onReject={(note) => decide(false, note)} /> : (
      <div className="row">
        <button className="btn bad" onClick={() => setRejecting(true)}>{t("p.uni.reject")}</button>
        <button className="btn" onClick={() => decide(true)}><Icon name="verified" size={17} />{t("p.uni.verify")}</button>
      </div>
    )
  ) : s?.cv_public ? <a className="btn ghost" href={`/cv/${s.cv_slug}`} target="_blank" rel="noreferrer"><UIcon name="external" size={16} />{t("u.st.open_cv")}</a> : undefined;

  const study = useMemo(() => s ? [
    [t("u.st.check.id"), s.student_number || "—"], [t("u.col.faculty"), s.faculty || "—"], [t("u.col.course"), courseText(s.course) || "—"],
    [t("u.col.group"), s.group_name || "—"], [t("u.st.grad_label"), s.graduation_year ?? "—"],
    [t("u.st.gpa"), s.gpa != null ? `${s.gpa} / ${s.gpa_scale}` : "—"],
  ] : [], [s]);

  return (
    <Drawer onClose={onClose} head={head} foot={foot}>
      <ErrorText error={error} />
      {!s ? <div className="u-skel" style={{ minHeight: 300 }} /> : (
        <>
          <div className="u-card-stats" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", background: "var(--bg)", border: "1px solid var(--line)" }}>
            <div><b>{s.points}</b><span>{t("u.col.points")}</span></div>
            <div><b>{s.verified_tasks}</b><span>{t("u.st.works")}</span></div>
            <div><b>{s.applications}</b><span>{t("u.col.apps")}</span></div>
            <div><b>{s.completeness.percent}%</b><span>{t("u.st.profile")}</span></div>
          </div>
          <Panel title={t("u.st.study")} icon="school">
            <dl className="u-dl">{study.map(([k, v]) => [<dt key={`k${k}`}>{k}</dt>, <dd key={`v${k}`}>{v}</dd>])}</dl>
            {s.verified_by && <p className="hint" style={{ margin: "10px 0 0" }}>{t("u.st.verified_by", { who: s.verified_by, when: formatDateTime(s.verified_at, false) })}</p>}
            {s.verification === "rejected" && s.verification_note && <div className="u-note red" style={{ marginTop: 10 }}>{s.verification_note}</div>}
          </Panel>
          {/* no phone, email or Telegram here: the student's consent opens contacts only to employers they apply to */}
          <Panel title={t("u.st.career")} icon="target">
            <dl className="u-dl">
              <dt>{t("u.col.track")}</dt><dd>{s.track ?? "—"}</dd>
              <dt>{t("u.col.last_seen")}</dt><dd>{ago(s.last_seen_at)}</dd>
              {s.headline && <><dt>{t("u.st.headline")}</dt><dd>{s.headline}</dd></>}
              {s.city && <><dt>{t("p.signup.city")}</dt><dd>{s.city}</dd></>}
            </dl>
            {s.skills.length > 0 && <div className="u-chipline" style={{ marginTop: 10 }}>{s.skills.map((x) => <span key={x} className="u-tag">{x}</span>)}</div>}
            {s.languages.length > 0 && <div className="u-chipline" style={{ marginTop: 6 }}>{s.languages.map((x) => <span key={x} className="u-tag blue">{x}</span>)}</div>}
            {s.bio && <p style={{ margin: "10px 0 0", fontSize: 13.5, whiteSpace: "pre-line" }}>{s.bio}</p>}
          </Panel>
          <Panel title={t("u.st.apps_title", { n: s.applications_list.length })} icon="inbox">
            {s.applications_list.length === 0 ? <p className="hint" style={{ margin: 0 }}>{t("u.st.no_apps")}</p> : (
              <div className="u-list">
                {s.applications_list.map((a, i) => (
                  <div key={i} className="u-list-row">
                    <span className="grow" style={{ minWidth: 0 }}><b>{a.job}</b><span>{a.company} · {formatDateTime(a.updated_at, false)}</span></span>
                    <span className={`u-tag ${a.status === "hired" ? "green" : a.status === "rejected" ? "red" : "blue"}`}>{statusLabel(a.status)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          {(s.outcomes.length > 0 || s.events.length > 0) && (
            <Panel title={t("u.st.work_events")} icon="briefcase">
              <div className="u-list">
                {s.outcomes.map((o, i) => (
                  <div key={`o${i}`} className="u-list-row">
                    <span className="grow"><b>{o.company}</b><span>{[o.position, t(`outcome.kind.${o.kind}`)].filter(Boolean).join(" · ")}</span></span>
                    <span className={`u-tag ${o.confirmed ? "green" : "amber"}`}>{o.confirmed ? t("emp.confirm") : t("emp.pending")}</span>
                  </div>
                ))}
                {s.events.map((e, i) => (
                  <div key={`e${i}`} className="u-list-row">
                    <span className="grow"><b>{e.title}</b><span>{formatDateTime(e.starts_at, false)}</span></span>
                    <span className={`u-tag ${e.attended ? "green" : ""}`}>{e.attended ? t("u.ev.attended") : t("u.ev.signed_up")}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </Drawer>
  );
}
