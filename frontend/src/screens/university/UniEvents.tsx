import { useCallback, useEffect, useState } from "react";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { courseText } from "../../labels";
import { ask, haptic } from "../../tg";
import { ErrorText, Sheet, message, toast } from "../../ui";
import { EVENT_KINDS, uapi, type EventInput, type Facets, type Registration, type UniEvent } from "./uapi";
import type { Go } from "./UniversityApp";
import { Empty, Kpi, PageHead, Panel, Tabs, UIcon, dayMonth, pct, timeOf } from "./ukit";

/** ISO time -> the value of <input type="datetime-local"> in Tashkent time. */
function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);          // Tashkent is UTC+5, no daylight saving
  return d.toISOString().slice(0, 16);
}
const fromLocal = (v: string) => (v ? `${v}:00+05:00` : null);

/** Career days, job fairs, hackathons: create them, students sign up in the app, mark who came. */
export default function UniEvents({ sub, go }: { sub: string; go: Go }) {
  useLang();
  const scope = sub === "past" ? "past" : "upcoming";
  const [rows, setRows] = useState<UniEvent[] | null>(null);
  const [editing, setEditing] = useState<UniEvent | "new" | null>(sub === "new" ? "new" : null);
  const [people, setPeople] = useState<UniEvent | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { setRows(null); uapi.events(scope).then(setRows, (e) => setError(message(e))); }, [scope]);
  useEffect(() => { load(); }, [load]);

  const live = rows?.filter((e) => e.status === "published") ?? [];
  const regs = live.reduce((n, e) => n + e.registered, 0);
  const came = live.reduce((n, e) => n + e.attended, 0);

  async function cancel(e: UniEvent) {
    if (!(await ask(t("u.ev.cancel_confirm", { title: e.title })))) return;
    try { await uapi.cancelEvent(e.id); toast(t("u.ev.cancelled")); load(); } catch (err) { setError(message(err)); }
  }

  return (
    <>
      <PageHead title={t("u.nav.events")} sub={t("u.ev.sub")}
                actions={<button className="btn small" onClick={() => setEditing("new")}><Icon name="plus" size={16} />{t("u.ev.new")}</button>} />
      <div className="u-kpis" style={{ ["--n" as string]: 3 }}>
        <Kpi icon="calendar" tone="blue" label={scope === "past" ? t("u.ev.k.past") : t("u.ev.k.upcoming")} value={rows ? live.length : "…"} />
        <Kpi icon="users" label={t("u.ev.k.registered")} value={regs} />
        <Kpi icon="tick" tone="violet" label={t("u.ev.k.attended")} value={scope === "past" ? `${pct(came, regs)}%` : came}
             sub={scope === "past" ? t("u.ev.k.attended_sub", { n: came, total: regs }) : t("u.ev.k.attended_hint")} />
      </div>
      <Tabs value={scope} onChange={(v) => go("events", v === "past" ? "past" : undefined)}
            items={[{ id: "upcoming", label: t("u.ev.tab_upcoming") }, { id: "past", label: t("u.ev.tab_past") }]} />
      <ErrorText error={error} />
      {!rows ? <div className="u-skel" style={{ minHeight: 220 }} /> : rows.length === 0 ? (
        <div className="u-panel">
          <Empty icon="calendar" tone="blue" title={scope === "past" ? t("u.ev.none_past") : t("u.ev.none")} text={t("u.ev.none_sub")}
                 action={<button className="btn small" onClick={() => setEditing("new")}><Icon name="plus" size={16} />{t("u.ev.new")}</button>} />
          <div className="u-chipline" style={{ justifyContent: "center", paddingBottom: 18 }}>
            {EVENT_KINDS.slice(0, 5).map((k) => <span key={k} className="u-tag blue">{t(`u.ev.kind.${k}` as "u.ev.kind.career_day")}</span>)}
          </div>
        </div>
      ) : (
        <div className="u-cards">
          {rows.map((e) => {
            const [day, mon] = dayMonth(e.starts_at);
            const full = e.capacity ? pct(e.registered, e.capacity) : null;
            return (
              <div key={e.id} className={`u-card ${e.status === "cancelled" ? "cancelled" : ""}`}>
                <div className="u-card-top">
                  <span className="u-date lg"><b>{day}</b><span>{mon}</span></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <span className="u-tag blue" style={{ marginBottom: 4 }}>{t(`u.ev.kind.${e.kind}` as "u.ev.kind.career_day")}</span>
                    <b>{e.title}</b>
                    <span><UIcon name="clock" size={12} /> {timeOf(e.starts_at)}{e.ends_at ? `–${timeOf(e.ends_at)}` : ""}</span>
                  </div>
                </div>
                {(e.location || e.online_url) && <div className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <UIcon name={e.online_url ? "link" : "pin"} size={14} />{e.location || t("u.ev.online")}</div>}
                {e.companies && <div className="hint"><Icon name="building" size={13} /> {e.companies}</div>}
                <div>
                  <div className="row between" style={{ fontSize: 13 }}>
                    <span>{t("u.ev.registered_n", { n: e.registered })}{e.capacity ? ` / ${e.capacity}` : ""}</span>
                    {e.attended > 0 && <span className="u-dim">{t("u.ev.came_n", { n: e.attended })}</span>}
                  </div>
                  {full !== null && <div className="u-meter"><span style={{ width: `${full}%`, background: full >= 100 ? "var(--warn)" : undefined }} /></div>}
                </div>
                {e.audience && Object.keys(e.audience).length > 0 && (
                  <div className="u-chipline">{e.audience.faculty && <span className="u-tag">{e.audience.faculty}</span>}
                    {e.audience.course && <span className="u-tag">{courseText(e.audience.course)}</span>}</div>
                )}
                <div className="u-card-foot">
                  {e.status === "cancelled" ? <span className="u-tag red">{t("u.ev.status_cancelled")}</span> : (
                    <>
                      <button className="btn small ghost" onClick={() => setPeople(e)}><Icon name="users" size={15} />{t("u.ev.people")}</button>
                      {scope === "upcoming" && (
                        <div className="row" style={{ gap: 6 }}>
                          <button className="icon-btn" title={t("u.ev.edit")} aria-label={t("u.ev.edit")} onClick={() => setEditing(e)}><UIcon name="edit" size={16} /></button>
                          <button className="icon-btn" title={t("u.ev.cancel")} aria-label={t("u.ev.cancel")} onClick={() => cancel(e)}><Icon name="trash" size={16} /></button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <EventForm event={editing === "new" ? null : editing} onClose={() => { setEditing(null); if (sub === "new") go("events"); }}
                             onSaved={() => { setEditing(null); if (sub === "new") go("events"); else load(); }} />}
      {people && <People event={people} onClose={() => { setPeople(null); load(); }} />}
    </>
  );
}

function EventForm({ event, onClose, onSaved }: { event: UniEvent | null; onClose: () => void; onSaved: () => void }) {
  useLang();
  const [f, setF] = useState({
    title: event?.title ?? "", kind: event?.kind ?? "career_day", description: event?.description ?? "",
    starts: toLocal(event?.starts_at ?? null), ends: toLocal(event?.ends_at ?? null), location: event?.location ?? "",
    online_url: event?.online_url ?? "", capacity: event?.capacity ? String(event.capacity) : "", companies: event?.companies ?? "",
    faculty: event?.audience.faculty ?? "", course: event?.audience.course ? String(event.audience.course) : "",
  });
  const [notify, setNotify] = useState(!event);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [reach, setReach] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { uapi.facets().then(setFacets, () => {}); }, []);
  useEffect(() => {
    uapi.previewAudience({ faculty: f.faculty || undefined, course: f.course ? Number(f.course) : undefined }).then((r) => setReach(r.recipients), () => {});
  }, [f.faculty, f.course]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (f.title.trim().length < 3 || !f.starts) { setError(t("u.ev.req")); return; }
    const body: EventInput = {
      title: f.title.trim(), kind: f.kind as EventInput["kind"], description: f.description.trim(), starts_at: fromLocal(f.starts)!,
      ends_at: fromLocal(f.ends), location: f.location.trim(), online_url: f.online_url.trim(),
      capacity: f.capacity ? Number(f.capacity) : null, companies: f.companies.trim(),
      audience: { ...(f.faculty ? { faculty: f.faculty } : {}), ...(f.course ? { course: Number(f.course) } : {}) }, notify,
    };
    setBusy(true); setError("");
    try {
      const saved = event ? await uapi.editEvent(event.id, body) : await uapi.createEvent(body);
      haptic("success");
      toast(event ? t("u.ev.saved") : t("u.ev.created", { n: saved.notified ?? 0 }));
      onSaved();
    } catch (e) { setError(message(e)); setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <h1>{event ? t("u.ev.edit") : t("u.ev.new")}</h1>
      <div className="u-form-grid two">
        <div className="span-all"><label>{t("u.ev.f.title")}</label><input value={f.title} maxLength={160} placeholder={t("u.ev.f.title_ph")} onChange={set("title")} /></div>
        <div><label>{t("u.ev.f.kind")}</label><select value={f.kind} onChange={set("kind")}>
          {EVENT_KINDS.map((k) => <option key={k} value={k}>{t(`u.ev.kind.${k}` as "u.ev.kind.career_day")}</option>)}</select></div>
        <div><label>{t("u.ev.f.capacity")}</label><input type="number" min={1} value={f.capacity} placeholder={t("u.ev.f.capacity_ph")} onChange={set("capacity")} /></div>
        <div><label>{t("u.ev.f.starts")}</label><input type="datetime-local" value={f.starts} onChange={set("starts")} /></div>
        <div><label>{t("u.ev.f.ends")}</label><input type="datetime-local" value={f.ends} onChange={set("ends")} /></div>
        <div><label>{t("u.ev.f.location")}</label><input value={f.location} maxLength={200} placeholder={t("u.ev.f.location_ph")} onChange={set("location")} /></div>
        <div><label>{t("u.ev.f.online")}</label><input value={f.online_url} maxLength={256} placeholder="https://" onChange={set("online_url")} /></div>
        <div className="span-all"><label>{t("u.ev.f.companies")}</label><input value={f.companies} maxLength={300} placeholder={t("u.ev.f.companies_ph")} onChange={set("companies")} /></div>
        <div className="span-all"><label>{t("u.ev.f.description")}</label><textarea value={f.description} rows={4} maxLength={3000} onChange={set("description")} /></div>
        <div><label>{t("u.ev.f.faculty")}</label><select value={f.faculty} onChange={set("faculty")}><option value="">{t("emp.all_faculties")}</option>
          {facets?.faculties.map((x) => <option key={x.value} value={x.value}>{x.value}</option>)}</select></div>
        <div><label>{t("u.ev.f.course")}</label><select value={f.course} onChange={set("course")}><option value="">{t("u.st.all_courses")}</option>
          {facets?.courses.map((x) => <option key={x.value} value={x.value}>{courseText(x.value)}</option>)}</select></div>
      </div>
      {!event && (
        <label className="u-check-line"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>{t("u.ev.f.notify", { n: reach ?? "…" })}</span></label>
      )}
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? t("p.common.saving") : event ? t("common.save") : t("u.ev.publish")}</button>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>{t("common.cancel")}</button>
    </Sheet>
  );
}

function People({ event, onClose }: { event: UniEvent; onClose: () => void }) {
  useLang();
  const [rows, setRows] = useState<Registration[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => uapi.registrations(event.id).then(setRows, (e) => setError(message(e))), [event.id]);
  useEffect(() => { void load(); }, [load]);
  async function mark(ids: number[], attended: boolean) {
    try { await uapi.attendance(event.id, ids, attended); void load(); } catch (e) { setError(message(e)); }
  }
  return (
    <Sheet onClose={onClose}>
      <span className="hint">{formatDateTime(event.starts_at)}</span>
      <h1>{event.title}</h1>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 8 }}>
        <span className="hint">{rows ? t("u.ev.people_n", { n: rows.length, came: rows.filter((r) => r.attended).length }) : t("common.loading")}</span>
        <div className="row" style={{ gap: 6 }}>
          {rows && rows.length > 0 && <button className="btn small ghost" onClick={() => mark(rows.map((r) => r.user_id), true)}>{t("u.ev.all_came")}</button>}
          <button className="btn small soft" onClick={() => uapi.exportEvent(event.id).catch((e) => toast(message(e), "error"))}><UIcon name="download" size={15} />Excel</button>
        </div>
      </div>
      <ErrorText error={error} />
      <Panel>
        {rows?.length === 0 ? <Empty small icon="users" title={t("u.ev.no_people")} /> : (
          <div className="u-list">
            {rows?.map((r) => (
              <label key={r.user_id} className="u-list-row" style={{ cursor: "pointer", margin: 0, color: "var(--text)", fontWeight: 400 }}>
                <input type="checkbox" checked={r.attended} style={{ width: 18, height: 18 }} onChange={(e) => mark([r.user_id], e.target.checked)} />
                <span className="grow" style={{ minWidth: 0 }}><b>{r.full_name}</b><span>{[r.faculty, courseText(r.course), r.group_name].filter(Boolean).join(" · ")}</span></span>
                {r.attended && <span className="u-tag green">{t("u.ev.attended")}</span>}
              </label>
            ))}
          </div>
        )}
      </Panel>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>{t("common.close")}</button>
    </Sheet>
  );
}
