import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { absoluteUrl, api, JOB_KIND, loadCatalog, type Catalog, type JobKind, type Me, type MyOutcome, type Portfolio,
         type PortfolioItem, type Trust, type University } from "../../api";
import { kindLabel } from "../../format";
import { formatDateTime, t, tMaybe, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { courseText } from "../../labels";
import { navigate } from "../../router";
import { haptic, openAfter, openLink } from "../../tg";
import { ErrorText, isFullName, message, toast } from "../../ui";
import { missingLabel } from "../StudentHome";
import Combo, { uniItems } from "./Combo";
import ImageCropper from "./ImageCropper";
import { ExperienceEditor, ItemEditor, TagInput } from "./PortfolioEditors";
import { FIELD_ICONS, fieldLabel, KIND_ICONS } from "./StudentSignup";

type Tab = "portfolio" | "experience" | "certificates" | "about";
const LANGUAGE_HINTS = ["O'zbek (ona tili)", "Rus B2", "Ingliz B1", "Ingliz B2", "Ingliz C1", "Koreys TOPIK 3", "Nemis B1", "Turk B1"];
const date = (iso: string | null | undefined) => (iso ? formatDateTime(iso, false) : "");
const range = (from: string | null | undefined, to: string | null | undefined, open = false) =>
  from ? `${date(from)} — ${to ? date(to) : open ? t("st.pf.now") : ""}`.replace(/ — $/, "") : "";

export function TrustBadge({ trust }: { trust: Trust }) {
  useLang();
  const icon: IconName = trust === "self" ? "user" : "verified";
  return <span className={`st-trust ${trust}`} title={t(`st.trust.${trust}_hint` as MsgKey)}><Icon name={icon} size={13} />{t(`st.trust.${trust}` as MsgKey)}</span>;
}

/** Student panel v2, phase 2: the LinkedIn/Instagram-style profile with portfolio, experience and certificates. */
export default function StudentProfile({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  useLang();
  const [tab, setTab] = useState<Tab>("portfolio");
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState<{ file: File; kind: "photo" | "cover" } | null>(null);
  const [editor, setEditor] = useState<{ kind: "project" | "certificate"; item?: PortfolioItem } | { kind: "experience"; item?: MyOutcome } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api.portfolio().then(setPf, (e) => setError(message(e))), []);
  useEffect(() => { void load(); loadCatalog().then(setCatalog, () => {}); }, [load]);
  const refresh = async () => { await load(); onSaved(await api.me()); };

  const study = [me.university_ref?.short_name, me.faculty, courseText(me.course)].filter(Boolean).join(" · ");
  const wins = pf?.verified.filter((v) => v.place).length ?? 0;
  const pick = (kind: "photo" | "cover") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast(t("st.pf.image_only"), "error"); return; }
    setCrop({ file, kind });
  };
  async function removeImage(kind: "photo" | "cover") {
    try { onSaved(kind === "photo" ? await api.setPhoto(null) : await api.setCover(null)); } catch (e) { toast(message(e), "error"); }
  }
  async function openCv() {
    try { await openAfter(async () => absoluteUrl((await api.myCvLink()).url)); } catch (e) { toast(message(e), "error"); }
  }

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "portfolio", label: t("st.pf.tab.portfolio"), n: (pf?.projects.length ?? 0) + (pf?.verified.length ?? 0) },
    { id: "experience", label: t("st.pf.tab.experience"), n: pf?.experience.length },
    { id: "certificates", label: t("st.pf.tab.certificates"), n: pf?.certificates.length },
    { id: "about", label: t("st.pf.tab.about") },
  ];

  return (
    <div className="co-page st-profile">
      <section className="st-pf-head">
        <div className="st-pf-cover" style={me.cover_url ? { backgroundImage: `url(${me.cover_url})` } : undefined}>
          <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick("cover")} />
          <div className="st-pf-cover-actions">
            <button className="st-glass" onClick={() => coverInput.current?.click()}><Icon name="camera" size={16} />{me.cover_url ? t("st.pf.cover_change") : t("st.pf.cover_add")}</button>
            {me.cover_url && <button className="st-glass" aria-label={t("st.pf.remove")} onClick={() => removeImage("cover")}><Icon name="trash" size={16} /></button>}
          </div>
        </div>
        <div className="st-pf-body">
          <div className="st-pf-avatar">
            {me.photo_url ? <img src={me.photo_url} alt="" /> : <span>{me.full_name.slice(0, 1).toUpperCase()}</span>}
            <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick("photo")} />
            <button className="st-pf-avatar-btn" aria-label={t("st.pf.photo_change")} title={t("st.pf.photo_change")} onClick={() => photoInput.current?.click()}>
              <Icon name="camera" size={16} />
            </button>
          </div>
          <div className="st-pf-main">
            <div className="st-pf-title">
              <div style={{ minWidth: 0 }}>
                <h1>{me.full_name}{me.verification === "verified" && <span className="side-verified" title={t("st.home.verified_by", { name: me.verified_by })}><Icon name="verified" size={20} /></span>}</h1>
                <div className="st-pf-headline">{me.headline || <button className="link-btn" onClick={() => setTab("about")}>{t("st.pf.add_headline")}</button>}</div>
                <div className="st-pf-meta">
                  {study && <span><Icon name="school" size={15} />{study}</span>}
                  {me.city && <span><Icon name="pin" size={15} />{tMaybe(`region.${me.city}`) ?? me.city}</span>}
                </div>
              </div>
              <div className="st-pf-actions">
                <button className="btn small" onClick={() => setEditor({ kind: "project" })}><Icon name="plus" size={16} />{t("st.pf.add_project")}</button>
                <button className="btn small ghost" onClick={openCv}><Icon name="file" size={16} />{t("st.pf.cv_pdf")}</button>
                {me.photo_url && me.has_photo_upload && <button className="btn small ghost" onClick={() => removeImage("photo")}>{t("st.pf.photo_remove")}</button>}
              </div>
            </div>
            <div className="st-pf-badges">
              {me.open_to_work && <span className="st-otw"><span />{t("st.home.open_to_work")}</span>}
              {me.job_fields.map((k) => <span key={k} className="co-tag"><Icon name={FIELD_ICONS[k] ?? "spark"} size={14} />{fieldLabel(k, catalog)}</span>)}
            </div>
          </div>
        </div>
        <div className="st-pf-counters">
          <div><b>{me.points}</b><span>{t("home.points")}</span></div>
          <div><b>{pf?.verified.length ?? "–"}</b><span>{t("st.home.verified_work")}</span></div>
          <div><b>{pf ? wins : "–"}</b><span>{t("st.pf.wins")}</span></div>
          <div><b>{pf?.projects.length ?? "–"}</b><span>{t("st.pf.projects")}</span></div>
          <div><b>{pf?.certificates.length ?? "–"}</b><span>{t("st.pf.certificates")}</span></div>
        </div>
      </section>

      <ErrorText error={error} />

      <div className="co-dash-grid">
        <div className="co-col">
          <div className="co-tabs">
            {tabs.map((x) => (
              <button key={x.id} className={tab === x.id ? "on" : ""} onClick={() => setTab(x.id)}>
                {x.label}{x.n ? <span className="co-tab-n">{x.n}</span> : null}
              </button>
            ))}
          </div>

          {!pf && !error && <div className="st-skeleton-grid"><span /><span /><span /></div>}

          {pf && tab === "portfolio" && (
            <>
              <div className="st-pf-grid">
                <button className="st-pf-add" onClick={() => setEditor({ kind: "project" })}>
                  <span><Icon name="plus" size={24} /></span><b>{t("st.pf.add_project")}</b><small>{t("st.pf.add_project_hint")}</small>
                </button>
                {pf.projects.map((p) => (
                  <button key={p.id} className="st-pf-card" onClick={() => setEditor({ kind: "project", item: p })}>
                    <div className="st-pf-shot" style={p.cover_url ? { backgroundImage: `url(${p.cover_url})` } : undefined}>
                      {!p.cover_url && <Icon name="grid" size={28} />}
                      <TrustBadge trust="self" />
                    </div>
                    <div className="st-pf-card-body">
                      <b>{p.title}</b>
                      <span className="hint">{[p.org, range(p.date_from, p.date_to)].filter(Boolean).join(" · ")}</span>
                      {p.skills.length > 0 && <div className="st-pf-skills">{p.skills.slice(0, 4).map((s) => <span key={s}>{s}</span>)}</div>}
                    </div>
                  </button>
                ))}
              </div>
              <div className="co-card">
                <div className="co-card-head">
                  <div><b>{t("st.pf.verified_title")}</b><div className="hint">{t("st.pf.verified_hint")}</div></div>
                  <a href="/talaba/topshiriqlar" onClick={(e) => { e.preventDefault(); navigate("/talaba/topshiriqlar"); }}>{t("st.nav.tasks")}</a>
                </div>
                {pf.verified.length === 0 && (
                  <div className="st-empty compact"><Icon name="verified" size={24} /><span className="hint">{t("st.pf.verified_empty")}</span></div>
                )}
                <div className="st-verified-list">
                  {pf.verified.map((v) => (
                    <div key={v.key} className="st-verified">
                      <span className={`st-verified-icon ${v.place ? "win" : ""}`}><Icon name={v.place ? "trophy" : v.kind === "task" ? "check" : "briefcase"} size={18} /></span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b className="ellipsis" style={{ display: "block" }}>{v.title}</b>
                        <div className="hint">{[v.by, v.place ? t("s.ch.place", { n: v.place }) : "", t("s.common.points", { n: v.points }), date(v.date)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <TrustBadge trust="platform" />
                      {v.link && <button className="icon-btn" aria-label={t("s.common.open_link")} onClick={() => openLink(v.link)}><Icon name="link" size={16} /></button>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {pf && tab === "experience" && (
            <div className="co-card">
              <div className="co-card-head">
                <div><b>{t("st.pf.tab.experience")}</b><div className="hint">{t("st.pf.exp_hint")}</div></div>
                <button className="btn small" style={{ width: "auto" }} onClick={() => setEditor({ kind: "experience" })}><Icon name="plus" size={16} />{t("st.pf.add_exp")}</button>
              </div>
              {pf.experience.length === 0 && (
                <div className="st-empty"><Icon name="briefcase" size={26} /><b>{t("st.pf.exp_empty")}</b><span className="hint">{t("st.pf.exp_empty_hint")}</span></div>
              )}
              <ol className="st-timeline">
                {pf.experience.map((o) => (
                  <li key={o.id}>
                    <span className="st-timeline-dot"><Icon name="building" size={16} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <b>{o.position || t(`outcome.kind.${o.kind}`)}</b>
                          <div>{o.company} · <span className="hint">{t(`outcome.kind.${o.kind}`)}</span></div>
                          <div className="hint">{range(o.started_on, o.ended_on, true)}</div>
                        </div>
                        <div className="row" style={{ gap: 6, flex: "none" }}>
                          <TrustBadge trust={o.trust ?? "self"} />
                          <button className="icon-btn" aria-label={t("st.pf.edit")} onClick={() => setEditor({ kind: "experience", item: o })}><Icon name="edit" size={16} /></button>
                        </div>
                      </div>
                      {o.description && <p className="st-pre">{o.description}</p>}
                      {!o.confirmed && o.company_id && <div className="hint" style={{ marginTop: 4 }}>{t("st.pf.exp_waiting")}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {pf && tab === "certificates" && (
            <div className="co-card">
              <div className="co-card-head">
                <div><b>{t("st.pf.tab.certificates")}</b><div className="hint">{t("st.pf.cert_hint")}</div></div>
                <button className="btn small" style={{ width: "auto" }} onClick={() => setEditor({ kind: "certificate" })}><Icon name="plus" size={16} />{t("st.pf.add_cert")}</button>
              </div>
              {pf.certificates.length === 0 && (
                <div className="st-empty"><Icon name="award" size={26} /><b>{t("st.pf.cert_empty")}</b><span className="hint">{t("st.pf.cert_empty_hint")}</span></div>
              )}
              <div className="st-card-grid two">
                {pf.certificates.map((c) => (
                  <div key={c.id} className="st-cert">
                    <span className="st-cert-icon"><Icon name="award" size={22} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b>{c.title}</b>
                      <div className="hint">{[c.org, c.date_from && t("st.pf.issued_on", { date: date(c.date_from) })].filter(Boolean).join(" · ")}</div>
                      {c.credential_id && <div className="hint">ID: {c.credential_id}</div>}
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <TrustBadge trust="self" />
                        {c.link && <button className="link-btn" onClick={() => openLink(c.link)}>{t("st.pf.check")}</button>}
                        {c.files[0] && <a className="link-btn" href={c.files[0].url} target="_blank" rel="noreferrer">{t("st.pf.open_file")}</a>}
                      </div>
                    </div>
                    <button className="icon-btn" aria-label={t("st.pf.edit")} onClick={() => setEditor({ kind: "certificate", item: c })}><Icon name="edit" size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "about" && <About me={me} catalog={catalog} onSaved={onSaved} />}
        </div>

        <div className="co-col">
          <Strength me={me} onGo={(k) => {
            if (k === "photo") photoInput.current?.click();
            else if (k === "portfolio") setEditor({ kind: "project" });
            else if (k === "verification") document.querySelector(".st-verify")?.scrollIntoView({ behavior: "smooth", block: "center" });
            else if (k === "phone") navigate("/talaba/sozlamalar");
            else setTab("about");
          }} />
          <Verification me={me} onSaved={onSaved} />
          <Visibility me={me} onSaved={onSaved} />
        </div>
      </div>

      {crop && (
        <ImageCropper file={crop.file} aspect={crop.kind === "photo" ? 1 : 4} outWidth={crop.kind === "photo" ? 512 : 1584}
                      round={crop.kind === "photo"} onClose={() => setCrop(null)}
                      onDone={async (up) => {
                        onSaved(crop.kind === "photo" ? await api.setPhoto(up.id) : await api.setCover(up.id));
                        haptic("success");
                        toast(crop.kind === "photo" ? t("st.pf.photo_saved") : t("st.pf.cover_saved"));
                        setCrop(null);
                      }} />
      )}
      {editor && editor.kind !== "experience" && (
        <ItemEditor kind={editor.kind} item={editor.item as PortfolioItem | undefined} onClose={() => setEditor(null)}
                    onSaved={async (p) => { setPf(p); onSaved(await api.me()); }} />
      )}
      {editor && editor.kind === "experience" && (
        <ExperienceEditor item={editor.item as MyOutcome | undefined} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
    </div>
  );
}

function Strength({ me, onGo }: { me: Me; onGo: (k: string) => void }) {
  useLang();
  const pct = me.completeness.percent;
  const r = 30, c = 2 * Math.PI * r;
  const level = pct >= 90 ? "star" : pct >= 60 ? "mid" : "start";
  return (
    <div className="co-card st-strength">
      <div className="row" style={{ gap: 14 }}>
        <span className="st-ring">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={r} className="st-ring-track" />
            <circle cx="36" cy="36" r={r} className="st-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
          </svg>
          <b>{pct}%</b>
        </span>
        <div>
          <b>{t(`st.pf.level.${level}` as MsgKey)}</b>
          <div className="hint">{t("st.pf.strength_hint")}</div>
        </div>
      </div>
      {me.completeness.missing.length > 0 && (
        <ul className="st-checklist" style={{ marginTop: 12 }}>
          {me.completeness.missing.map((m) => (
            <li key={m}><span /><button className="link-btn" onClick={() => onGo(m)}>{missingLabel(m)}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Verification({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  useLang();
  const [busy, setBusy] = useState(false);
  const state = me.verification;
  async function send() {
    setBusy(true);
    try { onSaved(await api.requestVerification()); haptic("success"); toast(t("s.career.verify_sent")); }
    catch (e) { toast(message(e), "error"); }
    finally { setBusy(false); }
  }
  return (
    <div className={`co-card st-verify ${state}`}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <span className="co-stat-icon"><Icon name={state === "verified" ? "verified" : "lock"} size={20} /></span>
        <div className="grow">
          <b>{t(`st.pf.verify.${state}` as MsgKey)}</b>
          <div className="hint">
            {state === "verified" ? t("st.home.verified_by", { name: me.verified_by })
              : state === "pending" ? t("s.career.pending")
              : state === "rejected" ? t("s.career.rejected", { note: me.verification_note || t("s.career.no_reason") })
              : t("st.pf.verify.none_hint")}
          </div>
        </div>
      </div>
      {(state === "none" || state === "rejected") && (
        <button className="btn small" style={{ marginTop: 12 }} disabled={busy} onClick={send}>{t("s.career.verify_send")}</button>
      )}
    </div>
  );
}

function Visibility({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  useLang();
  async function set(changes: Partial<Me>, done: string) {
    try { onSaved(await api.updateMe(changes)); toast(done); } catch (e) { toast(message(e), "error"); }
  }
  const row = (label: string, hint: string, on: boolean, change: (v: boolean) => void) => (
    <label className="st-switch-row">
      <span><b>{label}</b><small>{hint}</small></span>
      <input type="checkbox" className="st-switch" checked={on} onChange={(e) => change(e.target.checked)} />
    </label>
  );
  return (
    <div className="co-card">
      <div className="co-card-head"><b>{t("st.pf.visibility")}</b></div>
      {row(t("s.career.open_to_work"), t("s.career.open_to_work_hint"), me.open_to_work,
           (v) => set({ open_to_work: v }, v ? t("s.career.otw_on") : t("s.career.otw_off")))}
      {row(t("profile.visible.title"), t("profile.visible.hint"), me.visible_to_employers,
           (v) => set({ visible_to_employers: v }, t(v ? "profile.visible.on" : "profile.visible.off")))}
      {row(t("s.profile.my_cv"), t("st.pf.cv_public_hint"), me.cv_public,
           (v) => set({ cv_public: v }, v ? t("s.profile.cv_opened") : t("s.profile.cv_closed")))}
      {me.cv_public && (
        <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => openLink(`${window.location.origin}/cv/${me.cv_slug}`)}>
          <Icon name="eye" size={16} />{t("st.pf.cv_view")}
        </button>
      )}
    </div>
  );
}

/** An "about" card: shows the saved values, a pencil turns it into a form. */
function EditCard({ title, icon, view, form, onSave, empty }: {
  title: string; icon: IconName; view: ReactNode; form: () => ReactNode; onSave: () => Promise<boolean>; empty?: boolean;
}) {
  useLang();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="co-card st-about">
      <div className="co-card-head">
        <b className="row" style={{ gap: 8 }}><span className="st-about-icon"><Icon name={icon} size={16} /></span>{title}</b>
        {!editing && <button className="icon-btn" aria-label={t("st.pf.edit")} onClick={() => setEditing(true)}><Icon name="edit" size={16} /></button>}
      </div>
      {editing ? (
        <>
          {form()}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn ghost small" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
            <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave(); setBusy(false); if (ok) setEditing(false); }}>
              {busy ? t("s.common.saving") : t("common.save")}
            </button>
          </div>
        </>
      ) : empty ? <button className="link-btn" onClick={() => setEditing(true)}>{t("st.pf.fill")}</button> : view}
    </div>
  );
}

function About({ me, catalog, onSaved }: { me: Me; catalog: Catalog | null; onSaved: (m: Me) => void }) {
  useLang();
  const [unis, setUnis] = useState<University[]>([]);
  const [f, setF] = useState({
    full_name: me.full_name, headline: me.headline, bio: me.bio, skills: me.skills, languages: me.languages,
    github_url: me.github_url, linkedin_url: me.linkedin_url,
    university_id: me.university_ref ? String(me.university_ref.id) : "", faculty: me.faculty, course: me.course,
    group_name: me.group_name, graduation_year: me.graduation_year ? String(me.graduation_year) : "",
    gpa: me.gpa != null ? String(me.gpa) : "", gpa_scale: me.gpa_scale, student_number: me.student_number,
    job_fields: me.job_fields, job_types: me.job_types, city: me.city, work_industries: me.work_industries,
  });
  const [error, setError] = useState("");
  useEffect(() => { api.universities().then(setUnis, () => {}); }, []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const toggle = <T,>(list: T[], v: T, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].slice(0, max));
  const faculties = unis.find((u) => String(u.id) === f.university_id)?.faculties ?? [];
  const verifiedNow = me.verification === "verified" || me.verification === "pending";

  async function save(changes: Parameters<typeof api.updateMe>[0], check?: string): Promise<boolean> {
    if (check) { setError(check); return false; }
    setError("");
    try { onSaved(await api.updateMe(changes)); haptic("success"); toast(t("s.common.saved_ok")); return true; }
    catch (e) { setError(message(e)); return false; }
  }

  return (
    <>
      <ErrorText error={error} />
      <EditCard title={t("st.pf.about")} icon="user" empty={!me.headline && !me.bio}
        view={<>{me.headline && <div className="st-about-headline">{me.headline}</div>}{me.bio && <p className="st-pre">{me.bio}</p>}</>}
        form={() => (
          <>
            <label>{t("s.common.full_name")} *</label>
            <input value={f.full_name} maxLength={128} onChange={(e) => set("full_name", e.target.value)} />
            <label>{t("s.common.headline")}</label>
            <input value={f.headline} maxLength={120} placeholder={t("s.common.headline_ph")} onChange={(e) => set("headline", e.target.value)} />
            <label>{t("s.profile.bio_label")}</label>
            <textarea value={f.bio} maxLength={600} rows={5} placeholder={t("st.pf.bio_ph")} onChange={(e) => set("bio", e.target.value)} />
            <div className="hint" style={{ textAlign: "right" }}>{f.bio.length}/600</div>
          </>
        )}
        onSave={() => save({ full_name: f.full_name.trim(), headline: f.headline.trim(), bio: f.bio.trim() },
                           !isFullName(f.full_name) ? t("s.common.full_name_error")
                             : f.headline.trim() && f.headline.trim().length < 5 ? t("s.profile.headline_error") : undefined)} />

      <EditCard title={t("st.pf.skills_title")} icon="star" empty={!me.skills.length && !me.languages.length}
        view={<>
          {me.skills.length > 0 && <div className="st-pf-skills big">{me.skills.map((s) => <span key={s}>{s}</span>)}</div>}
          {me.languages.length > 0 && <div className="hint" style={{ marginTop: 8 }}><Icon name="translate" size={14} /> {me.languages.join(" · ")}</div>}
        </>}
        form={() => (
          <>
            <label>{t("st.pf.skills")}</label>
            <TagInput id="ab-skills" value={f.skills} max={20} placeholder={t("st.pf.skills_ph")} onChange={(v) => set("skills", v)} />
            <label>{t("s.common.langs_label").replace(/ \(.*\)/, "")}</label>
            <TagInput id="ab-langs" value={f.languages} max={6} placeholder={t("s.career.langs_ph")} suggestions={LANGUAGE_HINTS}
                      onChange={(v) => set("languages", v)} />
          </>
        )}
        onSave={() => save({ skills: f.skills, languages: f.languages })} />

      <EditCard title={t("st.pf.study")} icon="school"
        view={<>
          <div><b>{me.university_ref?.name ?? "—"}</b></div>
          <div className="hint">{[me.faculty, courseText(me.course), me.group_name && t("s.career.group_n", { group: me.group_name }),
                                  me.graduation_year && t("p.sheet.graduates", { year: me.graduation_year }), me.gpa != null && `GPA ${me.gpa}/${me.gpa_scale}`]
                                  .filter(Boolean).join(" · ")}</div>
          {me.student_number && <div className="hint">HEMIS ID: {me.student_number} · {t("st.pf.private")}</div>}
        </>}
        form={() => (
          <>
            {verifiedNow && <div className="co-note" style={{ marginBottom: 8 }}>{t("st.pf.study_reset")}</div>}
            <label>{t("s.common.university")}</label>
            <Combo id="ab-uni" items={uniItems(unis)} value={f.university_id} icon="school" placeholder={t("st.su.uni_ph")}
                   onChange={(v, custom) => { if (!custom) setF((cur) => ({ ...cur, university_id: v, faculty: v === cur.university_id ? cur.faculty : "" })); }} />
            <label htmlFor="ab-fac">{t("s.onb.faculty")}</label>
            <input id="ab-fac" value={f.faculty} maxLength={120} list="ab-faculties" onChange={(e) => set("faculty", e.target.value)} />
            <datalist id="ab-faculties">{faculties.map((x) => <option key={x} value={x} />)}</datalist>
            <label>{t("s.common.course")}</label>
            <div className="st-seg">
              {[1, 2, 3, 4, 5, 6, 7].map((c) => (
                <button key={c} type="button" className={f.course === c ? "on" : ""} onClick={() => set("course", c)}>{c === 7 ? t("course.master") : courseText(c)}</button>
              ))}
            </div>
            <div className="u-form-grid two st-two">
              <div><label>{t("s.common.group")}</label><input value={f.group_name} maxLength={40} onChange={(e) => set("group_name", e.target.value)} /></div>
              <div><label>{t("s.common.grad_year")}</label><input value={f.graduation_year} inputMode="numeric" maxLength={4} placeholder="2028" onChange={(e) => set("graduation_year", e.target.value.replace(/\D/g, ""))} /></div>
              <div><label>{t("s.career.gpa")}</label>
                <div className="row" style={{ gap: 6 }}>
                  <input value={f.gpa} inputMode="decimal" placeholder="4.2" onChange={(e) => set("gpa", e.target.value)} />
                  <select value={f.gpa_scale} style={{ width: 90 }} onChange={(e) => set("gpa_scale", Number(e.target.value))}>
                    <option value={5}>/ 5</option><option value={4}>/ 4</option>
                  </select>
                </div>
              </div>
              <div><label>{t("s.career.student_id")}</label><input value={f.student_number} maxLength={32} onChange={(e) => set("student_number", e.target.value)} /></div>
            </div>
            <div className="hint">{t("s.career.gpa_hint")}</div>
          </>
        )}
        onSave={() => {
          const gpa = f.gpa.trim() ? Number(f.gpa.replace(",", ".")) : null;
          return save({ university_id: f.university_id ? Number(f.university_id) : null, faculty: f.faculty.trim(), course: f.course,
                        group_name: f.group_name.trim().toUpperCase(), graduation_year: f.graduation_year ? Number(f.graduation_year) : null,
                        gpa: gpa != null && !Number.isNaN(gpa) ? gpa : null, gpa_scale: f.gpa_scale, student_number: f.student_number.trim() },
                      f.faculty.trim().length < 2 ? t("s.onb.faculty_error") : f.group_name.trim().length < 2 ? t("s.onb.group_error") : undefined);
        }} />

      <EditCard title={t("st.pf.prefs")} icon="target"
        view={<>
          <div className="st-pf-badges" style={{ marginTop: 0 }}>
            {me.job_fields.map((k) => <span key={k} className="co-tag"><Icon name={FIELD_ICONS[k] ?? "spark"} size={14} />{fieldLabel(k, catalog)}</span>)}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            {[me.job_types.map((k) => kindLabel(k)).join(", "), me.city, me.work_industries.map((k) => tMaybe(`industry.${k}`) ?? catalog?.industries[k] ?? k).join(", ")]
              .filter(Boolean).join(" · ")}
          </div>
        </>}
        form={() => (
          <>
            <label>{t("st.su.fields")} *</label>
            <div className="st-field-grid">
              {Object.keys(catalog?.job_fields ?? {}).map((k) => {
                const on = f.job_fields.includes(k);
                return (
                  <button key={k} type="button" className={`st-field ${on ? "on" : ""}`} disabled={!on && f.job_fields.length >= 5}
                          onClick={() => set("job_fields", toggle(f.job_fields, k, 5))}>
                    <span className="st-field-icon"><Icon name={FIELD_ICONS[k] ?? "spark"} size={18} /></span>
                    <span className="st-field-label">{fieldLabel(k, catalog)}</span>
                    {on && <span className="st-field-tick"><Icon name="tick" size={13} /></span>}
                  </button>
                );
              })}
            </div>
            <label>{t("s.onb.jobtype")} *</label>
            <div className="chips">
              {(Object.keys(JOB_KIND) as JobKind[]).map((k) => (
                <button key={k} type="button" className={`chip ${f.job_types.includes(k) ? "on" : ""}`} onClick={() => set("job_types", toggle(f.job_types, k))}>
                  <Icon name={KIND_ICONS[k]} size={14} /> {kindLabel(k)}
                </button>
              ))}
            </div>
            <label>{t("st.su.city")} *</label>
            <select value={catalog?.regions.includes(f.city) ? f.city : ""} onChange={(e) => set("city", e.target.value)}>
              <option value="">{t("task.f.choose")}</option>
              {catalog?.regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <label>{t("st.su.industries")} <span className="hint">· {t("st.su.optional")}</span></label>
            <div className="chips">
              {catalog && Object.entries(catalog.industries).map(([k, label]) => (
                <button key={k} type="button" className={`chip ${f.work_industries.includes(k) ? "on" : ""}`}
                        onClick={() => set("work_industries", toggle(f.work_industries, k, 6))}>{tMaybe(`industry.${k}`) ?? label}</button>
              ))}
            </div>
          </>
        )}
        onSave={() => save({ job_fields: f.job_fields, job_types: f.job_types, city: f.city, work_industries: f.work_industries },
                           !f.job_fields.length ? t("st.su.fields_err") : !f.job_types.length ? t("s.career.pick_jobtype")
                             : !catalog?.regions.includes(f.city) ? t("st.su.city_err") : undefined)} />

      <EditCard title={t("st.pf.links")} icon="link" empty={!me.github_url && !me.linkedin_url}
        view={<div className="st-links">
          {me.github_url && <button className="link-btn" onClick={() => openLink(me.github_url)}><Icon name="code" size={15} />GitHub</button>}
          {me.linkedin_url && <button className="link-btn" onClick={() => openLink(me.linkedin_url)}><Icon name="link" size={15} />LinkedIn</button>}
          {me.username && <button className="link-btn" onClick={() => openLink(`https://t.me/${me.username}`)}><Icon name="send" size={15} />@{me.username}</button>}
        </div>}
        form={() => (
          <>
            <label>GitHub</label>
            <input value={f.github_url} inputMode="url" placeholder={t("s.common.github_ph")} onChange={(e) => set("github_url", e.target.value)} />
            <label>LinkedIn</label>
            <input value={f.linkedin_url} inputMode="url" placeholder={t("s.common.linkedin_ph")} onChange={(e) => set("linkedin_url", e.target.value)} />
          </>
        )}
        onSave={() => save({ github_url: f.github_url.trim(), linkedin_url: f.linkedin_url.trim() })} />
    </>
  );
}
