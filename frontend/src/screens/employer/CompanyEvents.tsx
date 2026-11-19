// Company events (student panel v2, phase 3): open days, webinars, hackathons the company runs for students.
// Every student sees them in "Tadbirlar"; whoever registers shares their name with the company.
import { useCallback, useEffect, useState } from "react";
import { api, type EventInput, type EventItem } from "../../api";
import { Field } from "../../form";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { ask, haptic } from "../../tg";
import { ErrorText, Sheet, message, toast } from "../../ui";
import { eventKind } from "../student/Events";
import { EmptyState, PageHead } from "./kit";

const KINDS = ["open_day", "workshop", "meetup", "hackathon", "career_day", "job_fair", "other"];
const local = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${tz.getFullYear()}-${pad(tz.getMonth() + 1)}-${pad(tz.getDate())}T${pad(tz.getHours())}:${pad(tz.getMinutes())}`;
};
const toIso = (v: string) => (v ? `${v}:00+05:00` : null);        // the form is in Tashkent time

export default function CompanyEvents() {
  useLang();
  const [rows, setRows] = useState<EventItem[] | null>(null);
  const [editing, setEditing] = useState<EventItem | "new" | null>(null);
  const [regsOf, setRegsOf] = useState<EventItem | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.employer.events().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  const upcoming = (rows ?? []).filter((e) => new Date(e.starts_at).getTime() >= Date.now() - 6 * 3600 * 1000);
  const past = (rows ?? []).filter((e) => !upcoming.includes(e));

  async function cancel(e: EventItem) {
    if (!(await ask(t("co.ev.cancel_confirm")))) return;
    try { await api.employer.cancelEvent(e.id); toast(t("co.ev.cancelled")); void load(); } catch (err) { setError(message(err)); }
  }
  const card = (e: EventItem) => (
    <div key={e.id} className={`co-card st-event-row ${e.status === "cancelled" ? "cancelled" : ""}`}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="co-pill">{eventKind(e.kind)}</span>
        {e.status === "cancelled" ? <span className="co-pill warn">{t("co.ev.cancelled")}</span> : <span className="hint">{formatDateTime(e.starts_at)}</span>}
      </div>
      <b style={{ fontSize: 16 }}>{e.title}</b>
      <div className="st-event-meta">
        {e.location && <span><Icon name="pin" size={14} />{e.location}</span>}
        {e.online_url && <span><Icon name="globe" size={14} />{t("st.ev.online")}</span>}
        <span><Icon name="users" size={14} />{e.capacity ? t("st.ev.seats", { n: e.registered, max: e.capacity }) : t("st.ev.going", { n: e.registered })}</span>
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn small ghost" style={{ width: "auto" }} onClick={() => setRegsOf(e)}><Icon name="users" size={16} />{t("co.ev.registrations", { n: e.registered })}</button>
        {e.status !== "cancelled" && <button className="btn small ghost" style={{ width: "auto" }} onClick={() => setEditing(e)}><Icon name="edit" size={16} />{t("st.pf.edit")}</button>}
        {e.status !== "cancelled" && <button className="btn small ghost" style={{ width: "auto" }} onClick={() => cancel(e)}>{t("co.ev.cancel")}</button>}
      </div>
    </div>
  );

  return (
    <div className="co-page">
      <PageHead title={t("co.ev.title")} sub={t("co.ev.sub")}
                actions={<button className="btn" onClick={() => setEditing("new")}><Icon name="plus" size={18} />{t("co.ev.new")}</button>} />
      <ErrorText error={error} />
      {rows && rows.length === 0 && (
        <EmptyState icon="calendar" title={t("co.ev.empty")} text={t("co.ev.empty_hint")}
                    action={<button className="btn" onClick={() => setEditing("new")}>{t("co.ev.new")}</button>} />
      )}
      {upcoming.length > 0 && <div className="st-card-grid two">{upcoming.map(card)}</div>}
      {past.length > 0 && (<><b>{t("co.ev.past")}</b><div className="st-card-grid two">{past.map(card)}</div></>)}
      {editing && <EventForm event={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {regsOf && <Registrations event={regsOf} onClose={() => setRegsOf(null)} />}
    </div>
  );
}

function EventForm({ event, onClose, onSaved }: { event?: EventItem; onClose: () => void; onSaved: () => void }) {
  useLang();
  const [f, setF] = useState({
    title: event?.title ?? "", kind: event?.kind ?? "open_day", description: event?.description ?? "",
    starts: local(event?.starts_at ?? null), ends: local(event?.ends_at ?? null), location: event?.location ?? "",
    online_url: event?.online_url ?? "", capacity: event?.capacity ? String(event.capacity) : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (f.title.trim().length < 3) { setError(t("co.ev.title_err")); return; }
    if (!f.starts) { setError(t("co.ev.starts_err")); return; }
    setBusy(true); setError("");
    const body: EventInput = {
      title: f.title.trim(), kind: f.kind, description: f.description.trim(), starts_at: toIso(f.starts)!, ends_at: toIso(f.ends),
      location: f.location.trim(), online_url: f.online_url.trim(), capacity: f.capacity ? Number(f.capacity) : null, companies: "",
    };
    try {
      if (event) await api.employer.editEvent(event.id, body); else await api.employer.createEvent(body);
      haptic("success"); toast(t("s.common.saved_ok")); onSaved();
    } catch (e) { setError(message(e)); setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{event ? t("co.ev.edit") : t("co.ev.new")}</h2>
      <Field id="ce-title" label={t("co.ev.f.title")} required>
        <input id="ce-title" value={f.title} maxLength={160} placeholder={t("co.ev.f.title_ph")} onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, title: v })); }} />
      </Field>
      <label>{t("co.ev.f.kind")}</label>
      <div className="st-seg">
        {KINDS.map((k) => <button key={k} type="button" className={f.kind === k ? "on" : ""} onClick={() => setF((cur) => ({ ...cur, kind: k }))}>{eventKind(k)}</button>)}
      </div>
      <div className="u-form-grid two st-two">
        <Field id="ce-start" label={t("co.ev.f.starts")} required><input id="ce-start" type="datetime-local" value={f.starts} onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, starts: v })); }} /></Field>
        <Field id="ce-end" label={t("co.ev.f.ends")}><input id="ce-end" type="datetime-local" value={f.ends} onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, ends: v })); }} /></Field>
        <Field id="ce-loc" label={t("co.ev.f.location")}><input id="ce-loc" value={f.location} maxLength={200} placeholder={t("co.ev.f.location_ph")} onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, location: v })); }} /></Field>
        <Field id="ce-url" label={t("co.ev.f.online")}><input id="ce-url" value={f.online_url} maxLength={256} placeholder="https://meet.google.com/…" onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, online_url: v })); }} /></Field>
        <Field id="ce-cap" label={t("co.ev.f.capacity")}><input id="ce-cap" value={f.capacity} inputMode="numeric" placeholder="50" onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setF((cur) => ({ ...cur, capacity: v })); }} /></Field>
      </div>
      <Field id="ce-desc" label={t("co.ev.f.desc")}>
        <textarea id="ce-desc" value={f.description} maxLength={3000} rows={5} placeholder={t("co.ev.f.desc_ph")} onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, description: v })); }} />
      </Field>
      <p className="hint">{t("co.ev.privacy")}</p>
      <ErrorText error={error} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? t("s.common.saving") : t("common.save")}</button>
      </div>
    </Sheet>
  );
}

function Registrations({ event, onClose }: { event: EventItem; onClose: () => void }) {
  useLang();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.employer.eventRegistrations>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.employer.eventRegistrations(event.id).then(setRows, (e) => setError(message(e))); }, [event.id]);
  return (
    <Sheet onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{event.title}</h2>
      <p className="hint" style={{ marginTop: 0 }}>{t("co.ev.registrations", { n: rows?.length ?? event.registered })}</p>
      <ErrorText error={error} />
      {rows?.length === 0 && <p className="hint">{t("co.ev.no_regs")}</p>}
      {rows?.map((r) => (
        <div key={r.id} className="row between list-row">
          <div style={{ minWidth: 0 }}><b>{r.full_name}</b><div className="hint">{[r.university, r.faculty, r.course && `${r.course}-kurs`].filter(Boolean).join(" · ")}</div></div>
          <span className="hint">{formatDateTime(r.registered_at, false)}</span>
        </div>
      ))}
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={onClose}>{t("common.close")}</button>
    </Sheet>
  );
}
