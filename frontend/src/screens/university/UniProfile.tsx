import { useCallback, useEffect, useState } from "react";
import { loadCatalog, type Me, type SubmittedFile } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate } from "../../router";
import { ask, haptic } from "../../tg";
import { Avatar, ErrorText, message, toast } from "../../ui";
import { COOPERATION, uapi, type StaffRow, type UniProfile as Profile } from "./uapi";
import type { Go } from "./UniversityApp";
import LoginMethods from "../LoginMethods";
import NotificationSettings from "../NotificationSettings";
import { posLabel } from "./UniPending";
import { CopyField, Empty, FileDrop, PageHead, Panel, Pill, Ring, Tabs, UIcon, UniLogo, ago, pct } from "./ukit";

type View = "profile" | "team" | "invite" | "login";

/** The university's public profile, its team on the platform, and links to invite students and colleagues. */
export default function UniProfile({ me, sub, go, onChanged, onMe }: { me: Me; sub: string; go: Go; onChanged: () => void; onMe: (m: Me) => void }) {
  useLang();
  const view: View = sub === "team" || sub === "invite" || sub === "login" ? sub : "profile";
  const [teamCount, setTeamCount] = useState(0);
  useEffect(() => { uapi.team().then((r) => setTeamCount(r.rows.filter((x) => x.status === "pending").length), () => {}); }, [view]);
  return (
    <>
      <PageHead title={t("u.nav.profile")} sub={t("u.pr.sub")}
                actions={me.staff_university && <button className="btn small ghost" onClick={() => navigate(`/universitetlar/${me.staff_university!.id}`)}><UIcon name="eye" size={16} />{t("uprof.open_public")}</button>} />
      <Tabs value={view} onChange={(v) => go("profile", v === "profile" ? undefined : v)}
            items={[{ id: "profile", label: t("u.pr.tab_profile") }, { id: "team", label: t("u.pr.tab_team"), count: teamCount || undefined },
                    { id: "invite", label: t("u.pr.tab_invite") }, { id: "login", label: t("u.pr.tab_login") }]} />
      {view === "profile" && <ProfileForm />}
      {view === "team" && <Team onChanged={() => { onChanged(); setTeamCount(0); }} />}
      {view === "invite" && <Invite me={me} />}
      {view === "login" && <div style={{ maxWidth: 640 }}><LoginMethods me={me} onChanged={onMe} />
        <NotificationSettings me={me} onChanged={onMe} /></div>}
    </>
  );
}

function ProfileForm() {
  useLang();
  const [p, setP] = useState<Profile | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [logo, setLogo] = useState<SubmittedFile | null>(null);
  const [mou, setMou] = useState<SubmittedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    uapi.profile().then(setP, (e) => setError(message(e)));
    loadCatalog().then((c) => setRegions(c.regions), () => {});
  }, []);
  if (!p) return error ? <ErrorText error={error} /> : <div className="u-skel" style={{ minHeight: 360 }} />;
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });
  const num = (k: "founded_year" | "students_total") => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value ? Number(e.target.value) : null });

  async function save() {
    if (!p) return;
    setBusy(true); setError("");
    try {
      const saved = await uapi.editProfile({
        description: p.description, website: p.website || undefined, city: p.city, region: p.region, telegram: p.telegram,
        social: p.social, email: p.email, phone: p.phone, address: p.address, founded_year: p.founded_year,
        students_total: p.students_total, cooperation: p.cooperation, show_as_partner: p.show_as_partner,
        faculties: p.faculties,
        ...(logo ? { logo_id: logo.id } : {}), ...(mou ? { mou_id: mou.id } : {}),
      });
      setP(saved); setLogo(null); setMou(null);
      haptic("success");
      toast(t("uprof.saved"));
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  const done = 8 - p.missing.length;

  return (
    <div className="u-grid c21" style={{ alignItems: "start" }}>
      <div>
        <Panel title={t("u.pr.main")} icon="globe">
          <div className="u-logo-edit">
            <UniLogo url={logo ? logo.url : p.logo_url} name={p.short_name} />
            <div className="grow">
              <b>{p.name}</b>
              <div className="hint">{t("u.pr.logo_hint")}</div>
              <div style={{ marginTop: 8, maxWidth: 360 }}><FileDrop file={logo} accept=".png,.jpg,.jpeg,.webp" hint={t("u.pr.logo_types")} onFile={setLogo} /></div>
              {p.logo_url && !logo && <button className="link-btn" style={{ marginTop: 6 }} onClick={async () => { try { setP(await uapi.editProfile({ remove_logo: true })); } catch (e) { setError(message(e)); } }}>{t("u.pr.logo_remove")}</button>}
            </div>
          </div>
          <label>{t("uprof.description")}</label>
          <textarea value={p.description} rows={6} maxLength={3000} placeholder={t("u.pr.description_ph")} onChange={set("description")} />
          <div className="hint" style={{ textAlign: "right" }}>{p.description.length}/3000</div>
          <div className="u-form-grid two">
            <div><label>{t("u.pr.students_total")}</label><input type="number" min={0} value={p.students_total ?? ""} placeholder="15000" onChange={num("students_total")} />
              <div className="hint" style={{ marginTop: 4 }}>{t("u.pr.students_total_hint")}</div></div>
            <div><label>{t("u.pr.founded")}</label><input type="number" min={1800} max={2100} value={p.founded_year ?? ""} placeholder="1931" onChange={num("founded_year")} /></div>
          </div>
        </Panel>
        <Panel title={t("u.pr.contacts")} icon="phone">
          <div className="u-form-grid two">
            <div><label>{t("uprof.website")}</label><input value={p.website} maxLength={256} placeholder="https://" onChange={set("website")} /></div>
            <div><label>Telegram</label><input value={p.telegram} maxLength={128} placeholder="@universitet" onChange={set("telegram")} /></div>
            <div><label>Email</label><input type="email" value={p.email} maxLength={120} placeholder="info@universitet.uz" onChange={set("email")} /></div>
            <div><label>{t("u.su.phone")}</label><input value={p.phone} maxLength={20} placeholder="+998 71 000 00 00" onChange={set("phone")} /></div>
            <div><label>{t("u.su.social")}</label><input value={p.social} maxLength={256} placeholder="instagram.com/…" onChange={set("social")} /></div>
            <div><label>{t("uprof.region")}</label><select value={p.region} onChange={set("region")}><option value="">{t("task.f.choose")}</option>
              {[...new Set([p.region, ...regions].filter(Boolean))].map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label>{t("uprof.city")}</label><input value={p.city} maxLength={60} onChange={set("city")} /></div>
            <div><label>{t("u.pr.address")}</label><input value={p.address} maxLength={200} onChange={set("address")} /></div>
          </div>
        </Panel>
        <Panel title={t("u.su.f_coop")} icon="building" sub={t("u.pr.coop_sub")}>
          <div className="u-pills">
            {COOPERATION.map((c) => (
              <Pill key={c} on={p.cooperation.includes(c)} onChange={(on) => setP({ ...p, cooperation: on ? [...p.cooperation, c] : p.cooperation.filter((x) => x !== c) })}>
                {t(`u.coop.${c}` as "u.coop.job_fair")}
              </Pill>
            ))}
          </div>
          <label style={{ marginTop: 16 }}>{t("u.su.mou")}</label>
          {p.mou && !mou && <a className="file-chip" href={p.mou.url} target="_blank" rel="noreferrer" style={{ marginBottom: 8 }}><span className="file-ext">PDF</span><span className="file-name">{p.mou.name}</span></a>}
          <FileDrop file={mou} hint={t("u.su.mou_hint")} onFile={setMou} />
          <label className="u-check-line"><input type="checkbox" checked={p.show_as_partner} onChange={(e) => setP({ ...p, show_as_partner: e.target.checked })} />
            <span>{t("u.su.show_partner")}</span></label>
        </Panel>
        <Panel title={t("u.pr.fac")} icon="school" sub={t("u.pr.fac_sub")}>
          <FacultyEditor value={p.faculties ?? []} onChange={(faculties) => setP({ ...p, faculties })} />
        </Panel>
        <ErrorText error={error} />
        <div className="save-bar"><button className="btn" disabled={busy} onClick={save}>{busy ? t("p.common.saving") : t("common.save")}</button></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20 }}>
        <Panel title={t("u.pr.completeness")} icon="target">
          <div className="row" style={{ gap: 16 }}>
            <Ring big blue pct={pct(done, 8)} />
            <div className="grow">
              {p.missing.length === 0 ? <b>{t("u.pr.complete")}</b> : (
                <>
                  <div className="hint" style={{ marginBottom: 6 }}>{t("u.pr.missing")}</div>
                  <div className="u-chipline">{p.missing.map((m) => <span key={m} className="u-tag amber">{t(`u.missing.${m}` as "u.missing.logo")}</span>)}</div>
                </>
              )}
            </div>
          </div>
        </Panel>
        <Panel title={t("u.pr.preview")} icon="eye">
          <div className="u-preview">
            <div className="u-preview-cover" />
            <div className="u-preview-body">
              <UniLogo url={logo ? logo.url : p.logo_url} name={p.short_name} />
              <b style={{ display: "block", marginTop: 8 }}>{p.name}</b>
              <div className="hint">{[p.city || p.region, p.founded_year && t("u.pr.since", { year: p.founded_year })].filter(Boolean).join(" · ")}</div>
              <p style={{ fontSize: 13.5, margin: "8px 0", color: p.description ? "var(--text)" : "var(--hint)" }}>
                {p.description ? (p.description.length > 180 ? `${p.description.slice(0, 180)}…` : p.description) : t("u.pr.no_description")}</p>
              <div className="u-chipline">
                {p.website && <span className="u-tag"><Icon name="globe" size={12} />{p.website.replace(/^https?:\/\//, "")}</span>}
                {p.telegram && <span className="u-tag blue">{p.telegram}</span>}
                {p.show_as_partner && <span className="u-tag green"><Icon name="verified" size={12} />{t("u.pr.partner_badge")}</span>}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Team({ onChanged }: { onChanged: () => void }) {
  useLang();
  const [data, setData] = useState<{ me: { id: number; role: string }; rows: StaffRow[] } | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: number; decision: "needs_info" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => uapi.team().then(setData, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  const isLead = data?.me.role === "lead";

  async function run(p: Promise<unknown>, done: string) {
    try { await p; haptic("success"); toast(done); setNoteFor(null); setNote(""); void load(); onChanged(); } catch (e) { setError(message(e)); }
  }
  if (!data) return error ? <ErrorText error={error} /> : <div className="u-skel" style={{ minHeight: 240 }} />;
  const members = data.rows.filter((r) => r.status === "approved");
  const requests = data.rows.filter((r) => r.status !== "approved");

  return (
    <div className="u-grid c21" style={{ alignItems: "start" }}>
      <div>
        <Panel title={t("u.tm.requests", { n: requests.length })} icon="inbox">
          {requests.length === 0 ? <Empty small icon="users" title={t("u.tm.no_requests")} text={t("u.tm.no_requests_sub")} /> : requests.map((r) => (
            <div key={r.id} className="u-member">
              <Avatar name={r.full_name} url={r.photo_url} />
              <div className="grow">
                <b>{r.full_name}</b>
                <span>{[posLabel(r.position), r.department, r.phone, r.work_email].filter(Boolean).join(" · ")}</span>
                <div className="u-chipline" style={{ marginTop: 6 }}>
                  <span className={`u-tag ${r.status === "needs_info" ? "amber" : "blue"}`}>{t(`u.tm.status.${r.status}` as "u.tm.status.pending")}</span>
                  {r.doc && <a className="u-tag" href={r.doc.url} target="_blank" rel="noreferrer"><UIcon name="file" size={12} />{t("u.tm.doc")}</a>}
                  {r.submitted_at && <span className="u-dim">{formatDateTime(r.submitted_at, false)}</span>}
                </div>
                {noteFor?.id === r.id && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input value={note} placeholder={t("u.tm.note_ph")} onChange={(e) => setNote(e.target.value)} />
                    <button className="btn small ghost" onClick={() => setNoteFor(null)}>{t("common.cancel")}</button>
                    <button className="btn small bad" disabled={note.trim().length < 3}
                            onClick={() => run(uapi.teamDecide(r.id, noteFor.decision, note.trim()), t("u.tm.done"))}>{t("u.tm.send")}</button>
                  </div>
                )}
              </div>
              {isLead && r.status === "pending" && noteFor?.id !== r.id && (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn small ghost" onClick={() => setNoteFor({ id: r.id, decision: "needs_info" })}>{t("u.tm.ask_info")}</button>
                  <button className="btn small bad" onClick={() => setNoteFor({ id: r.id, decision: "reject" })}>{t("p.uni.reject")}</button>
                  <button className="btn small" onClick={() => run(uapi.teamDecide(r.id, "approve"), t("u.tm.approved", { name: r.full_name }))}><Icon name="tick" size={15} />{t("p.uni.verify")}</button>
                </div>
              )}
            </div>
          ))}
          {!isLead && requests.length > 0 && <p className="hint" style={{ marginBottom: 0 }}>{t("u.tm.only_lead")}</p>}
        </Panel>
        <Panel title={t("u.tm.members", { n: members.length })} icon="users">
          {members.map((r) => (
            <div key={r.id} className="u-member">
              <Avatar name={r.full_name} url={r.photo_url} />
              <div className="grow">
                <b>{r.full_name}{r.id === data.me.id && <span className="u-dim"> · {t("u.tm.you")}</span>}</b>
                <span>{[posLabel(r.position), r.department].filter(Boolean).join(" · ")}</span>
                <div className="u-dim">{t("u.tm.last_seen", { when: ago(r.last_seen_at) })}</div>
              </div>
              <span className={`u-role ${r.role === "lead" ? "lead" : ""}`}>{t(r.role === "lead" ? "u.role.lead" : "u.role.member")}</span>
              {isLead && r.id !== data.me.id && (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn small ghost" onClick={() => run(uapi.teamRole(r.id, r.role === "lead" ? "member" : "lead"), t("u.tm.role_changed"))}>
                    {r.role === "lead" ? t("u.tm.make_member") : t("u.tm.make_lead")}</button>
                  <button className="icon-btn" title={t("u.tm.revoke")} aria-label={t("u.tm.revoke")}
                          onClick={async () => { if (await ask(t("u.tm.revoke_confirm", { name: r.full_name }))) void run(uapi.teamRevoke(r.id), t("u.tm.revoked")); }}>
                    <Icon name="trash" size={16} /></button>
                </div>
              )}
              {isLead && r.id === data.me.id && members.filter((m) => m.role === "lead").length > 1 && (
                <button className="btn small ghost" onClick={() => run(uapi.teamRole(r.id, "member"), t("u.tm.role_changed"))}>{t("u.tm.step_down")}</button>
              )}
            </div>
          ))}
        </Panel>
        <ErrorText error={error} />
      </div>
      <Panel title={t("u.tm.how")} icon="shield">
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
          <li>{t("u.tm.how1")}</li><li>{t("u.tm.how2")}</li><li>{t("u.tm.how3")}</li>
        </ul>
        <label style={{ marginTop: 14 }}>{t("u.tm.invite_label")}</label>
        <CopyField value={`${window.location.origin}/kirish/universitet`} />
      </Panel>
    </div>
  );
}

function Invite({ me }: { me: Me }) {
  useLang();
  const link = `${window.location.origin}/kirish/talaba`;
  const name = me.staff_university?.short_name ?? "";
  const text = t("u.inv.text", { uni: name, link });
  return (
    <div className="u-grid c2" style={{ alignItems: "start" }}>
      <Panel title={t("u.inv.students")} icon="school" sub={t("u.inv.students_sub")}>
        <label>{t("u.inv.link")}</label>
        <CopyField value={link} />
        <label>{t("u.inv.message")}</label>
        <textarea readOnly value={text} rows={6} onFocus={(e) => e.target.select()} />
        <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
          <button className="btn small soft" onClick={() => navigator.clipboard?.writeText(text).then(() => toast(t("u.copied")), () => {})}><Icon name="copy" size={15} />{t("u.inv.copy_text")}</button>
          <a className="btn small ghost" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t("u.inv.short", { uni: name }))}`} target="_blank" rel="noreferrer"><Icon name="send" size={15} />Telegram</a>
        </div>
      </Panel>
      <Panel title={t("u.inv.steps_title")} icon="rocket">
        <ol className="u-timeline">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}><i>{n}</i><div><b>{t(`u.inv.step${n}` as "u.inv.step1")}</b><span>{t(`u.inv.step${n}_sub` as "u.inv.step1_sub")}</span></div></li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

/** The faculty list students pick from at sign-up (student panel v2): add, remove; saved with the profile. */
function FacultyEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  useLang();
  const [name, setName] = useState("");
  const clean = name.trim().replace(/\s+/g, " ");
  const add = () => {
    if (clean.length < 2 || value.some((x) => x.toLowerCase() === clean.toLowerCase())) return;
    onChange([...value, clean]);
    setName("");
  };
  return (
    <>
      {value.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>{t("u.pr.fac_empty")}</p>
        : <div className="hint" style={{ marginBottom: 8 }}>{t("u.pr.fac_n", { n: value.length })}</div>}
      <div className="chips">
        {value.map((x) => (
          <span key={x} className="chip on" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {x}
            <button type="button" className="link-btn" aria-label={t("u.pr.fac_remove")} title={t("u.pr.fac_remove")}
                    style={{ padding: 0, lineHeight: 1 }} onClick={() => onChange(value.filter((y) => y !== x))}>×</button>
          </span>
        ))}
      </div>
      <form className="row" style={{ marginTop: 10, gap: 8 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="grow" value={name} maxLength={120} placeholder={t("u.pr.fac_add")} onChange={(e) => setName(e.target.value)} />
        <button className="btn small" type="submit" style={{ width: "auto" }} disabled={clean.length < 2 || value.length >= 60}>{t("u.pr.fac_add_btn")}</button>
      </form>
    </>
  );
}
