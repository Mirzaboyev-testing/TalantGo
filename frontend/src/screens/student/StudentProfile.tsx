import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { absoluteUrl, api, JOB_KIND, loadCatalog, type Catalog, type JobKind, type Me, type MyOutcome, type Portfolio,
         type PortfolioItem, type Trust, type University } from "../../api";
import { kindLabel } from "../../format";
import { formatDateTime, t, tMaybe, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { courseText } from "../../labels";
import { navigate } from "../../router";
import { haptic, openAfter, openLink } from "../../tg";
import { ErrorText, initials, isFullName, message, nameTone, Sheet, toast } from "../../ui";
import { missingLabel } from "../StudentHome";
import Combo, { uniItems } from "./Combo";
import ImageCropper from "./ImageCropper";
import ChangePassword from "../ChangePassword";
import FacultyPicker from "./FacultyPicker";
import { UserPosts } from "./Feed";
import { ExperienceEditor, ItemEditor, TagInput } from "./PortfolioEditors";
import { FIELD_ICONS, fieldLabel, KIND_ICONS } from "./StudentSignup";

// One LinkedIn-style page (2026-11-19, user decision): every section is on the page with its own pencil or «+»;
// «Profilni tahrirlash» at the top opens the name, headline and region. The strength checklist opens the right card.
const EDIT_EVENT = "st-pf-edit";
const openSection = (id: string) => window.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: id }));
const LANGUAGE_HINTS = ["O'zbek (ona tili)", "Rus B2", "Ingliz B1", "Ingliz B2", "Ingliz C1", "Koreys TOPIK 3", "Nemis B1", "Turk B1"];
const date = (iso: string | null | undefined) => (iso ? formatDateTime(iso, false) : "");
const range = (from: string | null | undefined, to: string | null | undefined, open = false) =>
  from ? `${date(from)} — ${to ? date(to) : open ? t("st.pf.now") : ""}`.replace(/ — $/, "") : "";

export function TrustBadge({ trust }: { trust: Trust }) {
  useLang();
  const icon: IconName = trust === "self" ? "user" : "verified";
  return <span className={`st-trust ${trust}`} title={t(`st.trust.${trust}_hint` as MsgKey)}><Icon name={icon} size={13} />{t(`st.trust.${trust}` as MsgKey)}</span>;
}

/** Student panel v2: the LinkedIn/Instagram-style profile with experience, projects, certificates and every detail. */
export default function StudentProfile({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  useLang();
  const [intro, setIntro] = useState(false);
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
            {me.photo_url ? <img src={me.photo_url} alt="" /> : <span className="st-pf-initials" style={nameTone(me.full_name)}>{initials(me.full_name)}</span>}
            <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick("photo")} />
            <button className="st-pf-avatar-btn" aria-label={t("st.pf.photo_change")} title={t("st.pf.photo_change")} onClick={() => photoInput.current?.click()}>
              <Icon name="camera" size={16} />
            </button>
          </div>
          <div className="st-pf-main">
            <div className="st-pf-title">
              <div style={{ minWidth: 0 }}>
                <h1>{me.full_name}{me.verification === "verified" && <span className="side-verified" title={t("st.home.verified_by", { name: me.verified_by })}><Icon name="verified" size={20} /></span>}</h1>
                <div className="st-pf-headline">{me.headline || <button className="link-btn" onClick={() => setIntro(true)}>{t("st.pf.add_headline")}</button>}</div>
                <div className="st-pf-meta">
                  {study && <span><Icon name="school" size={15} />{study}</span>}
                  {me.city && <span><Icon name="pin" size={15} />{tMaybe(`region.${me.city}`) ?? me.city}</span>}
                </div>
              </div>
              <div className="st-pf-actions">
                <button className="btn small" onClick={() => setIntro(true)}><Icon name="edit" size={16} />{t("st.pf2.edit")}</button>
                <button className="btn small ghost" onClick={() => setEditor({ kind: "project" })}><Icon name="plus" size={16} />{t("st.pf.add_project")}</button>
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
          <ProfileSections me={me} catalog={catalog} onSaved={onSaved}>
            {(form) => (
              <>
                {form.about}
                <UserPosts userId={me.id} mine />
                <Section id="experience" title={t("st.pf.tab.experience")} icon="briefcase" hint={t("st.pf.exp_hint")}
                         onAdd={() => setEditor({ kind: "experience" })} addLabel={t("st.pf.add_exp")}>
                  {!pf && !error && <div className="st-skeleton-grid"><span /></div>}
                  {pf && pf.experience.length === 0 && (
                    <div className="st-empty compact"><Icon name="briefcase" size={24} /><b>{t("st.pf.exp_empty")}</b><span className="hint">{t("st.pf.exp_empty_hint")}</span></div>
                  )}
                  {pf && pf.experience.length > 0 && (
                    <ol className="st-timeline">
                      {pf.experience.map((o) => (
                        <li key={o.id}>
                          <span className="st-timeline-dot"><Icon name="building" size={16} /></span>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="row between st-exp-row" style={{ alignItems: "flex-start", gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <b>{o.position || t(`outcome.kind.${o.kind}`)}</b>
                                <div>{o.company} · <span className="hint">{t(`outcome.kind.${o.kind}`)}</span></div>
                                <div className="hint">{range(o.started_on, o.ended_on, true)}</div>
                              </div>
                              <div className="row st-exp-actions" style={{ gap: 6, flex: "none" }}>
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
                  )}
                </Section>

                <Section id="projects" title={t("st.pf.projects")} icon="grid" hint={t("st.pf.add_project_hint")}
                         onAdd={() => setEditor({ kind: "project" })} addLabel={t("st.pf.add_project")}>
                  {pf && (
                    <div className="st-pf-grid">
                      {pf.projects.length === 0 && (
                        <button className="st-pf-add" onClick={() => setEditor({ kind: "project" })}>
                          <span><Icon name="plus" size={24} /></span><b>{t("st.pf.add_project")}</b><small>{t("st.pf.add_project_hint")}</small>
                        </button>
                      )}
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
                  )}
                </Section>

                <Section id="verified" title={t("st.pf.verified_title")} icon="verified" hint={t("st.pf.verified_hint")}
                         action={<a href="/talaba/topshiriqlar" onClick={(e) => { e.preventDefault(); navigate("/talaba/topshiriqlar"); }}>{t("st.nav.tasks")}</a>}>
                  {pf && pf.verified.length === 0 && (
                    <div className="st-empty compact"><Icon name="verified" size={24} /><span className="hint">{t("st.pf.verified_empty")}</span></div>
                  )}
                  <div className="st-verified-list">
                    {pf?.verified.map((v) => (
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
                </Section>

                <Section id="certificates" title={t("st.pf.tab.certificates")} icon="award" hint={t("st.pf.cert_hint")}
                         onAdd={() => setEditor({ kind: "certificate" })} addLabel={t("st.pf.add_cert")}>
                  {pf && pf.certificates.length === 0 && (
                    <div className="st-empty compact"><Icon name="award" size={24} /><b>{t("st.pf.cert_empty")}</b><span className="hint">{t("st.pf.cert_empty_hint")}</span></div>
                  )}
                  <div className="st-card-grid two">
                    {pf?.certificates.map((c) => (
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
                </Section>

                {form.skills}
                {form.study}
                {form.prefs}
                {form.links}
              </>
            )}
          </ProfileSections>
        </div>

        <div className="co-col">
          <Strength me={me} onGo={(k) => {
            if (k === "photo") photoInput.current?.click();
            else if (k === "portfolio") setEditor({ kind: "project" });
            else if (k === "verification") document.querySelector(".st-verify")?.scrollIntoView({ behavior: "smooth", block: "center" });
            else if (k === "phone") navigate("/talaba/sozlamalar");
            else if (k === "headline") setIntro(true);
            else openSection(SECTION_OF[k] ?? "about");
          }} />
          <Contact me={me} onSaved={onSaved} />
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
      {intro && <IntroEditor me={me} catalog={catalog} onSaved={onSaved} onClose={() => setIntro(false)} />}
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

// which card the strength checklist opens for each missing item
const SECTION_OF: Record<string, string> = {
  bio: "about", skills: "skills", languages: "skills", university: "study", faculty: "study", course: "study",
  job_fields: "prefs", job_types: "prefs",
};

/** A section of the page with its title, a hint and a «+» (experience, projects, certificates). */
function Section({ id, title, icon, hint, onAdd, addLabel, action, children }: {
  id: string; title: string; icon: IconName; hint?: string; onAdd?: () => void; addLabel?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={`pf-${id}`} className="co-card st-about st-section">
      <div className="co-card-head">
        <div style={{ minWidth: 0 }}>
          <b className="row" style={{ gap: 8 }}><span className="st-about-icon"><Icon name={icon} size={16} /></span>{title}</b>
          {hint && <div className="hint st-section-hint">{hint}</div>}
        </div>
        {onAdd && <button className="icon-btn st-add-btn" aria-label={addLabel} title={addLabel} onClick={onAdd}><Icon name="plus" size={18} /></button>}
        {action}
      </div>
      {children}
    </section>
  );
}

/** A card that shows the saved values; the pencil (or the checklist) turns it into a form. */
function EditCard({ id, title, icon, view, form, onSave, onCancel, empty }: {
  id: string; title: string; icon: IconName; view: ReactNode; form: () => ReactNode; onSave: () => Promise<boolean>;
  onCancel: () => void; empty?: boolean;
}) {
  useLang();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const open = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) return;
      setEditing(true);
      requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener(EDIT_EVENT, open);
    return () => window.removeEventListener(EDIT_EVENT, open);
  }, [id]);
  return (
    <section ref={box} id={`pf-${id}`} className={`co-card st-about ${editing ? "editing" : ""}`}>
      <div className="co-card-head">
        <b className="row" style={{ gap: 8 }}><span className="st-about-icon"><Icon name={icon} size={16} /></span>{title}</b>
        {!editing && <button className="icon-btn" aria-label={t("st.pf.edit")} title={t("st.pf.edit")} onClick={() => setEditing(true)}><Icon name="edit" size={16} /></button>}
      </div>
      {editing ? (
        <>
          {form()}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn ghost small" onClick={() => { onCancel(); setEditing(false); }}>{t("common.cancel")}</button>
            <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave(); setBusy(false); if (ok) setEditing(false); }}>
              {busy ? t("s.common.saving") : t("common.save")}
            </button>
          </div>
        </>
      ) : empty ? <button className="link-btn" onClick={() => setEditing(true)}>{t("st.pf.fill")}</button> : view}
    </section>
  );
}

const OTHER_UNI = "__new__";
const draftOf = (me: Me) => ({
  bio: me.bio, skills: me.skills, languages: me.languages, github_url: me.github_url, linkedin_url: me.linkedin_url,
  university_id: me.university_ref ? String(me.university_ref.id) : "", otherUni: "", faculty: me.faculty, course: me.course,
  group_name: me.group_name, graduation_year: me.graduation_year ? String(me.graduation_year) : "",
  gpa: me.gpa != null ? String(me.gpa) : "", gpa_scale: me.gpa_scale, student_number: me.student_number,
  job_fields: me.job_fields, job_types: me.job_types, work_industries: me.work_industries,
});
type Draft = ReturnType<typeof draftOf>;
type Cards = Record<"about" | "skills" | "study" | "prefs" | "links", ReactNode>;

/** The editable cards of the page; the parent places them between experience, projects and certificates. */
function ProfileSections({ me, catalog, onSaved, children }: {
  me: Me; catalog: Catalog | null; onSaved: (m: Me) => void; children: (cards: Cards) => ReactNode;
}) {
  useLang();
  const [unis, setUnis] = useState<University[]>([]);
  const [f, setF] = useState<Draft>(() => draftOf(me));
  const [error, setError] = useState("");
  const [errorAt, setErrorAt] = useState("");
  useEffect(() => { api.universities().then(setUnis, (e) => setError(message(e))); }, []);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const reset = (keys: (keyof Draft)[]) => { setF((cur) => ({ ...cur, ...Object.fromEntries(keys.map((k) => [k, draftOf(me)[k]])) })); setErrorAt(""); };
  const toggle = <T,>(list: T[], v: T, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].slice(0, max));
  const faculties = unis.find((u) => String(u.id) === f.university_id)?.faculties ?? [];
  const verifiedNow = me.verification === "verified" || me.verification === "pending";
  const regionLabel = (r: string) => tMaybe(`region.${r}`) ?? r;

  async function save(card: string, changes: () => Promise<Parameters<typeof api.updateMe>[0]>, check?: string): Promise<boolean> {
    setErrorAt(card);
    if (check) { setError(check); return false; }
    setError("");
    try { onSaved(await api.updateMe(await changes())); haptic("success"); toast(t("s.common.saved_ok")); setErrorAt(""); return true; }
    catch (e) { setError(message(e)); return false; }
  }
  const err = (card: string) => (errorAt === card ? <ErrorText error={error} /> : null);

  const cards: Cards = {
    about: (
      <EditCard id="about" title={t("st.pf.about")} icon="user" empty={!me.bio} onCancel={() => reset(["bio"])}
        view={<p className="st-pre" style={{ margin: 0 }}>{me.bio}</p>}
        form={() => (
          <>
            <textarea value={f.bio} maxLength={600} rows={5} placeholder={t("st.pf.bio_ph")} onChange={(e) => set("bio", e.target.value)} />
            <div className="hint" style={{ textAlign: "right" }}>{f.bio.length}/600</div>
            {err("about")}
          </>
        )}
        onSave={() => save("about", async () => ({ bio: f.bio.trim() }))} />
    ),
    skills: (
      <EditCard id="skills" title={t("st.pf.skills_title")} icon="star" empty={!me.skills.length && !me.languages.length}
        onCancel={() => reset(["skills", "languages"])}
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
            {err("skills")}
          </>
        )}
        onSave={() => save("skills", async () => ({ skills: f.skills, languages: f.languages }))} />
    ),
    study: (
      <EditCard id="study" title={t("st.pf.study")} icon="school"
        onCancel={() => reset(["university_id", "otherUni", "faculty", "course", "group_name", "graduation_year", "gpa", "gpa_scale", "student_number"])}
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
            <Combo id="ab-uni" items={uniItems(unis)} value={f.university_id === OTHER_UNI ? "" : f.university_id}
                   customValue={f.university_id === OTHER_UNI ? f.otherUni : ""} icon="school" placeholder={t("st.su.uni_ph")}
                   customLabel={(q) => t("st.su.uni_add", { name: q })}
                   onChange={(v, custom) => setF((cur) => ({ ...cur, university_id: custom ? OTHER_UNI : v, otherUni: custom ? v : "",
                                                            faculty: !custom && v === cur.university_id ? cur.faculty : "" }))} />
            {f.university_id === OTHER_UNI && <div className="co-note" style={{ marginTop: 8 }}>{t("st.su.uni_new_note", { name: f.otherUni })}</div>}
            <label htmlFor="ab-fac">{t("s.onb.faculty")}</label>
            <FacultyPicker key={f.university_id} id="ab-fac" faculties={f.university_id === OTHER_UNI ? [] : faculties} value={f.faculty}
                           disabled={!f.university_id} onChange={(v) => set("faculty", v)} />
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
            {err("study")}
          </>
        )}
        onSave={() => {
          const gpa = f.gpa.trim() ? Number(f.gpa.replace(",", ".")) : null;
          return save("study", async () => {
            const universityId = f.university_id === OTHER_UNI ? (await api.addUniversity(f.otherUni.trim())).id
              : f.university_id ? Number(f.university_id) : null;
            return { university_id: universityId, faculty: f.faculty.trim(), course: f.course,
                     group_name: f.group_name.trim().toUpperCase(), graduation_year: f.graduation_year ? Number(f.graduation_year) : null,
                     gpa: gpa != null && !Number.isNaN(gpa) ? gpa : null, gpa_scale: f.gpa_scale, student_number: f.student_number.trim() };
          }, !f.university_id || (f.university_id === OTHER_UNI && f.otherUni.trim().length < 3) ? t("s.onb.uni_error")
            : f.faculty.trim().length < 2 ? t("s.onb.faculty_error") : f.group_name.trim().length < 2 ? t("s.onb.group_error") : undefined);
        }} />
    ),
    prefs: (
      <EditCard id="prefs" title={t("st.pf.prefs")} icon="target" onCancel={() => reset(["job_fields", "job_types", "work_industries"])}
        view={<>
          <div className="st-pf-badges" style={{ marginTop: 0 }}>
            {me.job_fields.map((k) => <span key={k} className="co-tag"><Icon name={FIELD_ICONS[k] ?? "spark"} size={14} />{fieldLabel(k, catalog)}</span>)}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            {[me.job_types.map((k) => kindLabel(k)).join(", "), me.city && regionLabel(me.city),
              me.work_industries.map((k) => tMaybe(`industry.${k}`) ?? catalog?.industries[k] ?? k).join(", ")].filter(Boolean).join(" · ")}
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
            <label>{t("st.su.industries")} <span className="hint">· {t("st.su.optional")}</span></label>
            <div className="chips">
              {catalog && Object.entries(catalog.industries).map(([k, label]) => (
                <button key={k} type="button" className={`chip ${f.work_industries.includes(k) ? "on" : ""}`}
                        onClick={() => set("work_industries", toggle(f.work_industries, k, 6))}>{tMaybe(`industry.${k}`) ?? label}</button>
              ))}
            </div>
            {err("prefs")}
          </>
        )}
        onSave={() => save("prefs", async () => ({ job_fields: f.job_fields, job_types: f.job_types, work_industries: f.work_industries }),
                           !f.job_fields.length ? t("st.su.fields_err") : !f.job_types.length ? t("s.career.pick_jobtype") : undefined)} />
    ),
    links: (
      <EditCard id="links" title={t("st.pf.links")} icon="link" empty={!me.github_url && !me.linkedin_url && !me.username}
        onCancel={() => reset(["github_url", "linkedin_url"])}
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
            {err("links")}
          </>
        )}
        onSave={() => save("links", async () => ({ github_url: f.github_url.trim(), linkedin_url: f.linkedin_url.trim() }))} />
    ),
  };
  return <>{errorAt === "" && <ErrorText error={error} />}{children(cards)}</>;
}

/** «Profilni tahrirlash»: name, headline and region, the first things a company reads. */
function IntroEditor({ me, catalog, onSaved, onClose }: { me: Me; catalog: Catalog | null; onSaved: (m: Me) => void; onClose: () => void }) {
  useLang();
  const [f, setF] = useState({ full_name: me.full_name, headline: me.headline, city: me.city });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!isFullName(f.full_name)) return setError(t("s.common.full_name_error"));
    if (f.headline.trim() && f.headline.trim().length < 5) return setError(t("s.profile.headline_error"));
    if (!catalog?.regions.includes(f.city)) return setError(t("st.su.city_err"));
    setBusy(true); setError("");
    try {
      onSaved(await api.updateMe({ full_name: f.full_name.trim(), headline: f.headline.trim(), city: f.city }));
      haptic("success"); toast(t("s.common.saved_ok")); onClose();
    } catch (e) { setError(message(e)); setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <div className="st-intro-editor">
        <h2 style={{ margin: "0 0 4px" }}>{t("st.pf2.intro_title")}</h2>
        <p className="hint" style={{ margin: 0 }}>{t("st.pf2.intro_hint")}</p>
        <label>{t("s.common.full_name")} *</label>
        <input value={f.full_name} maxLength={128} autoComplete="name" onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <label>{t("s.common.headline")}</label>
        <input value={f.headline} maxLength={120} placeholder={t("s.common.headline_ph")} onChange={(e) => setF({ ...f, headline: e.target.value })} />
        <div className="hint">{f.headline.length}/120</div>
        <label>{t("st.pf2.region")} *</label>
        <select value={catalog?.regions.includes(f.city) ? f.city : ""} onChange={(e) => setF({ ...f, city: e.target.value })}>
          <option value="">{t("task.f.choose")}</option>
          {catalog?.regions.map((r) => <option key={r} value={r}>{tMaybe(`region.${r}`) ?? r}</option>)}
        </select>
        <label>{t("st.pf2.phone")}</label>
        <div className="st-intro-phone">
          <span>{me.phone || t("st.pf2.no_phone")}</span>
          <button className="link-btn" onClick={() => { onClose(); navigate("/talaba/sozlamalar"); }}>{t("st.pf2.phone_change")}</button>
        </div>
        <ErrorText error={error} />
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? t("s.common.saving") : t("common.save")}</button>
        </div>
      </div>
    </Sheet>
  );
}

/** Phone and Telegram as companies will see them after the student applies, and the password (2026-11-19). */
function Contact({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  useLang();
  const [password, setPassword] = useState(false);
  return (
    <div className="co-card st-contact">
      <div className="co-card-head"><b>{t("st.pf2.contact")}</b></div>
      <div className="st-contact-row"><Icon name="phone" size={16} /><span className="grow">{me.phone || t("st.pf2.no_phone")}</span>
        <button className="link-btn" onClick={() => navigate("/talaba/sozlamalar")}>{t("st.pf.edit")}</button></div>
      {me.username && <div className="st-contact-row"><Icon name="send" size={16} /><span className="grow">@{me.username}</span></div>}
      <p className="hint" style={{ margin: "8px 0 0" }}>{t("st.pf2.contact_hint")}</p>
      <div className="st-contact-row st-contact-pass">
        <Icon name="lock" size={16} /><span className="grow">{me.has_password ? t("cp.title") : t("cp.no_password")}</span>
        <button className="btn small ghost" style={{ width: "auto" }} onClick={() => setPassword(true)}>{me.has_password ? t("cp.open") : t("cp.set")}</button>
      </div>
      {password && (
        <Sheet onClose={() => setPassword(false)}>
          <h2 style={{ margin: "0 0 6px" }}>{t("cp.title")}</h2>
          <ChangePassword me={me} onChanged={(m) => { onSaved(m); }} bare />
        </Sheet>
      )}
    </div>
  );
}
