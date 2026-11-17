import { useEffect, useState } from "react";
import { api, loadCatalog, type Catalog, type Me, type SubmittedFile, type Track } from "../../api";
import { Field, Req, useRequired, type Check } from "../../form";
import { t, tMaybe, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { haptic, insideTelegram } from "../../tg";
import { ErrorText, isFullName, message, toast } from "../../ui";
import { Consent } from "../Consent";
import LangSwitch from "../LangSwitch";
import PhoneField from "../PhoneField";
import { FileDrop } from "./kit";

/** Older companies typed the field and city by hand: match them to the lists where possible. */
function guessIndustry(value: string, catalog: Catalog): string {
  if (!value) return "";
  if (value in catalog.industries) return value;
  const v = value.trim().toLowerCase();
  return Object.entries(catalog.industries).find(([k, label]) => k === v || label.toLowerCase().startsWith(v))?.[0] ?? "";
}
function guessRegion(value: string, catalog: Catalog): string {
  if (!value) return "";
  if (catalog.regions.includes(value)) return value;
  if (value.trim().toLowerCase() === "toshkent") return "Toshkent shahri";
  return catalog.regions.find((r) => r.toLowerCase().startsWith(value.trim().toLowerCase())) ?? "";
}

export const ownershipLabel = (k: string, catalog: Catalog | null) => tMaybe(`co.own.${k}`) ?? catalog?.ownership[k] ?? k;
export const coopLabel = (k: string, catalog: Catalog | null) => tMaybe(`co.coop.${k}`) ?? catalog?.cooperation[k] ?? k;
export const legalLabel = (k: string, catalog: Catalog | null) => tMaybe(`co.legal.${k}`) ?? catalog?.legal_forms_all[k] ?? k;
export const sizeLabel = (k: string, catalog: Catalog | null) => tMaybe(`co.size.${k}`) ?? catalog?.company_sizes[k] ?? k;
export const industryLabel = (k: string, catalog: Catalog | null) => tMaybe(`industry.${k}`) ?? catalog?.industries[k] ?? k;

const STEPS: { key: "person" | "company" | "docs" | "goals"; icon: IconName }[] = [
  { key: "person", icon: "user" }, { key: "company", icon: "building" }, { key: "docs", icon: "lock" }, { key: "goals", icon: "spark" },
];
const COOP_ICONS: Record<string, IconName> = {
  internship: "school", part_time: "briefcase", junior: "user", projects: "flag", tests: "check", hackathon: "flame", dual: "users",
};

type Files = { registration: SubmittedFile | null; authority: SubmittedFile | null; logo: SubmittedFile | null };
const draftKey = (id: number) => `tg_company_draft_${id}`;
type Draft = { f?: Record<string, unknown>; files?: Files; step?: number };
function readDraft(id: number): Draft | null {
  try { return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null"); } catch { return null; }
}

/**
 * Company sign-up in four steps: the person, the company, documents for the check, what the company wants
 * from students. A new company is created on the last step (and goes to an admin); a company still waiting
 * or sent back edits the same steps. The unfinished form is kept on this device.
 */
export default function CompanySignup({ me, onSaved, onBack, onLogout }: {
  me: Me; onSaved: (m: Me) => void; onBack?: () => void; onLogout?: () => void;
}) {
  useLang();
  const c = me.company;
  const isNew = !c;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  // a new sign-up continues from the draft kept on this device (read once, before the first render)
  const [draft] = useState(() => (isNew ? readDraft(me.id) : null));
  const [step, setStep] = useState<number>(draft?.step ?? 0);
  const [f, setF] = useState({
    full_name: me.full_name, job_title: me.job_title, contact_role: c?.contact_role ?? "",
    name: c?.name ?? "", legal_form: c?.legal_form ?? "", ownership: c?.ownership ?? "", size: c?.size ?? "",
    industry: c?.industry ?? "", city: c?.city ?? "", stir: c?.stir ?? "", description: c?.description ?? "",
    website: c?.website ?? "", telegram: c?.telegram ?? "", email: c?.email ?? "", address: c?.address ?? "",
    cooperation: c?.cooperation ?? [] as string[], wanted_track_ids: c?.wanted_track_ids ?? [] as number[],
    show_as_partner: c?.show_as_partner ?? false,
    ...(draft?.f ?? {}),
  });
  const [files, setFiles] = useState<Files>(draft?.files ?? { registration: null, authority: null, logo: null });
  // an existing company's documents load first; until then a save must not send empty ids (that removes them)
  const [docsReady, setDocsReady] = useState(!c);
  const [consent, setConsent] = useState(me.consent_current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restored = Boolean(draft && (draft.step || draft.f?.name || draft.f?.stir || draft.files?.registration));
  const { errors, check, clear, cls, groupCls } = useRequired();

  useEffect(() => {
    loadCatalog().then((cat) => {
      setCatalog(cat);
      setF((cur) => ({ ...cur, industry: guessIndustry(cur.industry, cat), city: guessRegion(cur.city, cat) }));
    }, (e) => setError(message(e)));
    api.tracks().then(setTracks, () => {});
    if (c) {
      api.employer.documents().then((docs) => {
        setFiles({
          registration: docs.find((d) => d.kind === "registration") ?? null,
          authority: docs.find((d) => d.kind === "authority") ?? null,
          logo: docs.find((d) => d.kind === "logo") ?? null,
        });
        setDocsReady(true);
      }, () => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the unfinished sign-up survives a reload or a closed tab
  useEffect(() => {
    if (!isNew) return;
    try { localStorage.setItem(draftKey(me.id), JSON.stringify({ f, files, step })); } catch { /* storage blocked */ }
  }, [f, files, step, isNew, me.id]);

  const set = (k: keyof typeof f, id: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setF((cur) => ({ ...cur, [k]: value }));
    clear(id);
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const aboutMin = isNew ? 50 : 20;

  const checksFor = (n: number): Check[] => {
    if (n === 0) return [
      ["e-name", isFullName(f.full_name), t("p.signup.req.name")],
      ["e-title", f.job_title.trim().length >= 2, t("p.signup.req.title")],
      ["e-phone", Boolean(me.phone), t("p.signup.req.phone")],
      ["e-role", Boolean(f.contact_role), t("co.su.req.role")],
      ["e-authority", f.contact_role !== "representative" || Boolean(files.authority), t("co.su.req.authority")],
    ];
    if (n === 1) return [
      ["e-company", f.name.trim().length >= 2, t("p.signup.req.company")],
      ["e-form", Boolean(f.legal_form), t("co.su.req.legal")],
      ["e-own", Boolean(f.ownership), t("co.su.req.ownership")],
      ["e-size", Boolean(f.size), t("p.signup.req.size")],
      ["e-industry", Boolean(f.industry), t("p.signup.req.industry")],
      ["e-city", Boolean(f.city), t("p.signup.req.city")],
      ["e-stir", /^\d{9}$/.test(f.stir.trim()), t("p.signup.req.stir")],
      ["e-about", f.description.trim().length >= aboutMin, t("co.su.req.about", { n: aboutMin })],
    ];
    if (n === 2) return [["e-doc", Boolean(files.registration) || (!docsReady && Boolean(c?.registration_doc_id)), t("co.su.req.doc")]];
    return [
      ["e-coop", f.cooperation.length > 0, t("co.su.req.coop")],
      ["e-consent", consent, t("p.signup.req.consent")],
    ];
  };

  function next() {
    if (!check(checksFor(step))) return;
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  }

  function goTo(n: number) {
    // earlier steps are always open; later ones only once everything before them is filled in
    for (let i = 0; i < n; i++) if (!check(checksFor(i))) { setStep(i); return; }
    setStep(n);
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    for (let i = 0; i < STEPS.length; i++) if (!check(checksFor(i))) { setStep(i); return; }
    const company = {
      name: f.name.trim(), legal_form: f.legal_form, ownership: f.ownership, industry: f.industry, size: f.size, city: f.city,
      stir: f.stir.trim(), description: f.description.trim(), website: f.website.trim(), telegram: f.telegram.trim(),
      address: f.address.trim(), email: f.email.trim(), contact_role: f.contact_role, cooperation: f.cooperation,
      wanted_track_ids: f.wanted_track_ids, show_as_partner: f.show_as_partner,
      // a file is sent when its current state is known (loaded, or picked here); otherwise the saved one stays
      ...(docsReady || files.registration ? { registration_doc_id: files.registration?.id ?? null } : {}),
      ...(docsReady || files.authority || f.contact_role !== "representative"
        ? { authority_doc_id: f.contact_role === "representative" ? files.authority?.id ?? null : null } : {}),
      ...(docsReady || files.logo ? { logo_file_id: files.logo?.id ?? null } : {}),
    };
    setBusy(true); setError("");
    try {
      let saved: Me;
      if (isNew) {
        saved = await api.registerCompany({
          ...company, registration_doc_id: files.registration?.id ?? null, logo_file_id: files.logo?.id ?? null,
          authority_doc_id: f.contact_role === "representative" ? files.authority?.id ?? null : null,
          full_name: f.full_name.trim(), job_title: f.job_title.trim(), consent: true, data_pledge: true,   // the consent text holds the pledge
        });
        try { localStorage.removeItem(draftKey(me.id)); } catch { /* storage blocked */ }
      } else {
        await api.updateMe({ full_name: f.full_name.trim(), job_title: f.job_title.trim(), ...(me.consent_current ? {} : { consent: true }) });
        await api.employer.editCompany(company);
        saved = await api.me();
      }
      haptic("success");
      toast(t("p.signup.saved_review"));
      onSaved(saved);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const options = (entries: [string, string][]) => [<option key="" value="">{t("task.f.choose")}</option>,
    ...entries.map(([k, label]) => <option key={k} value={k}>{label}</option>)];
  const legalKeys = Object.keys(catalog?.legal_forms ?? {});
  if (f.legal_form && !legalKeys.includes(f.legal_form)) legalKeys.push(f.legal_form);   // an older choice stays shown
  const current = STEPS[step].key;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="co-signup">
      <aside className="co-signup-side">
        <div className="co-signup-brand">
          <span className="brand-mark">T</span><b className="grow">TalantGo</b>
          <LangSwitch />
        </div>
        <div className="co-signup-intro">
          <span className="co-chip-soft"><Icon name="building" size={15} />{t("co.su.badge")}</span>
          <h1>{isNew ? t("co.su.title") : t("co.su.title_edit")}</h1>
          <p>{t("co.su.intro")}</p>
        </div>
        <ol className="co-steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`${i === step ? "on" : ""} ${i < step ? "done" : ""}`}>
              <button type="button" onClick={() => (i < step ? goTo(i) : i > step ? goTo(i) : undefined)}>
                <span className="co-step-n">{i < step ? <Icon name="tick" size={15} /> : i + 1}</span>
                <span className="co-step-text"><b>{t(`co.su.step.${s.key}` as MsgKey)}</b><small>{t(`co.su.step.${s.key}_hint` as MsgKey)}</small></span>
              </button>
            </li>
          ))}
        </ol>
        <div className="co-why">
          <span className="co-why-icon"><Icon name="lock" size={18} /></span>
          <div><b>{t("co.su.why_title")}</b><p>{t(`co.su.why.${current}` as MsgKey)}</p></div>
        </div>
        <ul className="co-perks">
          {(["students", "jobs", "unis"] as const).map((k) => (
            <li key={k}><span><Icon name="tick" size={14} /></span>{t(`co.su.perk.${k}` as MsgKey)}</li>
          ))}
        </ul>
        <div className="co-signup-foot">
          {onBack && <button className="link-btn" onClick={onBack}>{t("common.back")}</button>}
          {onLogout && !insideTelegram && <button className="link-btn" onClick={onLogout}>{t("shell.logout")}</button>}
        </div>
      </aside>

      <section className="co-signup-main">
        <div className="co-progress-row">
          <span>{t("co.su.step_n", { n: step + 1, total: STEPS.length })}</span>
          <div className="co-progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
        {restored && step === 0 && <div className="notice" style={{ marginBottom: 12 }}>{t("co.su.restored")}</div>}
        {c?.status === "rejected" && (
          <div className="notice warn" style={{ marginBottom: 12 }}>
            {t("p.signup.rejected", { note: c.review_note ? `: ${c.review_note.replace(/[.\s]+$/, "")}` : "" })}
          </div>
        )}
        <div className="co-form-card" key={current}>
          <div className="co-form-title">
            <span className="co-form-icon"><Icon name={STEPS[step].icon} size={22} /></span>
            <div><h2>{t(`co.su.step.${current}` as MsgKey)}</h2><p>{t(`co.su.sub.${current}` as MsgKey)}</p></div>
          </div>

          {current === "person" && (
            <>
              <div className="co-form-grid">
                <Field id="e-name" label={t("p.signup.name")} required error={errors["e-name"] && t("p.signup.name_err")}>
                  <input id="e-name" className={cls("e-name")} value={f.full_name} maxLength={128} autoComplete="name"
                         placeholder={t("p.signup.name_ph")} onChange={set("full_name", "e-name")} />
                </Field>
                <Field id="e-title" label={t("p.signup.position")} required error={errors["e-title"] && t("p.signup.position_err")}>
                  <input id="e-title" className={cls("e-title")} value={f.job_title} maxLength={120} autoComplete="organization-title"
                         placeholder={t("p.signup.position_ph")} onChange={set("job_title", "e-title")} />
                </Field>
              </div>
              <div id="e-phone" tabIndex={-1} className={groupCls("e-phone", "co-block")}>
                <label style={{ marginTop: 0 }}>{t("p.signup.phone")}<Req /></label>
                <PhoneField me={me} onChanged={(m) => { onSaved(m); if (m.phone) clear("e-phone"); }} />
                {errors["e-phone"] && <div className="field-error">{t("p.signup.phone_err")}</div>}
              </div>
              <div id="e-role" tabIndex={-1} className={groupCls("e-role", "co-block")}>
                <label style={{ marginTop: 0 }}>{t("co.su.role")}<Req /></label>
                <div className="co-choice-row">
                  {(["director", "representative"] as const).map((r) => (
                    <button key={r} type="button" className={`co-choice ${f.contact_role === r ? "on" : ""}`}
                            onClick={() => { setF({ ...f, contact_role: r }); clear("e-role"); }}>
                      <span className="co-choice-icon"><Icon name={r === "director" ? "verified" : "user"} size={20} /></span>
                      <span><b>{t(`co.role.${r}`)}</b><small>{t(`co.role.${r}_hint`)}</small></span>
                      <span className="co-choice-tick"><Icon name="tick" size={14} /></span>
                    </button>
                  ))}
                </div>
                {errors["e-role"] && <div className="field-error">{t("co.su.role_err")}</div>}
              </div>
              {f.contact_role === "representative" && (
                <FileDrop id="e-authority" label={t("co.su.authority")} hint={t("co.su.authority_hint")} accept=".pdf,.jpg,.jpeg,.png,.webp"
                          required file={files.authority} invalid={Boolean(errors["e-authority"])}
                          onFile={(x) => { setFiles({ ...files, authority: x }); clear("e-authority"); }} />
              )}
            </>
          )}

          {current === "company" && (
            <>
              <div className="co-form-grid">
                <Field id="e-company" label={t("p.signup.company")} required error={errors["e-company"] && t("p.signup.company_err")}>
                  <input id="e-company" className={cls("e-company")} value={f.name} maxLength={160} autoComplete="organization"
                         placeholder={t("p.signup.company_ph")} onChange={set("name", "e-company")} />
                </Field>
                <Field id="e-stir" label={t("p.signup.stir")} required error={errors["e-stir"] && t("p.signup.stir_err")} hint={t("p.signup.stir_hint")}>
                  <input id="e-stir" className={cls("e-stir")} value={f.stir} inputMode="numeric" maxLength={9} placeholder="301234567"
                         onChange={(e) => { setF({ ...f, stir: e.target.value.replace(/\D/g, "") }); clear("e-stir"); }} />
                </Field>
                <Field id="e-form" label={t("co.su.legal")} required error={errors["e-form"] && t("p.common.pick")}>
                  <select id="e-form" className={cls("e-form")} value={f.legal_form} onChange={set("legal_form", "e-form")}>
                    {options(legalKeys.map((k) => [k, legalLabel(k, catalog)]))}
                  </select>
                </Field>
                <Field id="e-own" label={t("co.su.ownership")} required error={errors["e-own"] && t("p.common.pick")}>
                  <select id="e-own" className={cls("e-own")} value={f.ownership} onChange={set("ownership", "e-own")}>
                    {options(Object.keys(catalog?.ownership ?? {}).map((k) => [k, ownershipLabel(k, catalog)]))}
                  </select>
                </Field>
                <Field id="e-industry" label={t("p.signup.industry")} required error={errors["e-industry"] && t("p.signup.industry_err")}>
                  <select id="e-industry" className={cls("e-industry")} value={f.industry} onChange={set("industry", "e-industry")}>
                    {options(Object.keys(catalog?.industries ?? {}).map((k) => [k, industryLabel(k, catalog)]))}
                  </select>
                </Field>
                <Field id="e-size" label={t("p.signup.size")} required error={errors["e-size"] && t("p.common.pick")}>
                  <select id="e-size" className={cls("e-size")} value={f.size} onChange={set("size", "e-size")}>
                    {options(Object.keys(catalog?.company_sizes ?? {}).map((k) => [k, sizeLabel(k, catalog)]))}
                  </select>
                </Field>
                <Field id="e-city" label={t("p.signup.city")} required error={errors["e-city"] && t("p.common.pick")}>
                  <select id="e-city" className={cls("e-city")} value={f.city} onChange={set("city", "e-city")}>
                    {options((catalog?.regions ?? []).map((r) => [r, r]))}
                  </select>
                </Field>
              </div>
              <Field id="e-about" label={t("p.signup.about")} required
                     error={errors["e-about"] && t("co.su.req.about", { n: aboutMin })}
                     hint={<span className={f.description.trim().length >= aboutMin ? "co-count ok" : "co-count"}>
                       {t("co.su.about_count", { n: f.description.trim().length, min: aboutMin })}</span>}>
                <textarea id="e-about" className={cls("e-about")} value={f.description} maxLength={2000} rows={5}
                          placeholder={t("p.signup.about_ph")} onChange={set("description", "e-about")} />
              </Field>
              <FileDrop id="e-logo" label={t("co.su.logo")} hint={t("co.su.logo_hint")} accept=".png,.jpg,.jpeg,.webp"
                        file={files.logo} onFile={(x) => setFiles({ ...files, logo: x })} />
            </>
          )}

          {current === "docs" && (
            <>
              <FileDrop id="e-doc" label={t("co.su.doc")} hint={t("co.su.doc_hint")} accept=".pdf,.jpg,.jpeg,.png,.webp"
                        required file={files.registration} invalid={Boolean(errors["e-doc"])}
                        onFile={(x) => { setFiles({ ...files, registration: x }); clear("e-doc"); }} />
              <div className="co-safe"><Icon name="lock" size={16} />{t("co.su.doc_private")}</div>
              <h3 className="co-sub-title">{t("co.su.contacts")}<span className="hint"> · {t("co.su.optional")}</span></h3>
              <div className="co-form-grid">
                <Field id="e-site" label={t("p.signup.site")}><input id="e-site" value={f.website} inputMode="url" placeholder="kompaniya.uz" onChange={set("website", "e-site")} /></Field>
                <Field id="e-tg" label={t("p.signup.telegram")}><input id="e-tg" value={f.telegram} maxLength={128} placeholder="@kompaniya" onChange={set("telegram", "e-tg")} /></Field>
                <Field id="e-email" label={t("co.su.hr_email")}><input id="e-email" value={f.email} inputMode="email" maxLength={120} placeholder="hr@kompaniya.uz" onChange={set("email", "e-email")} /></Field>
                <Field id="e-addr" label={t("p.signup.address")}><input id="e-addr" value={f.address} maxLength={200} onChange={set("address", "e-addr")} /></Field>
              </div>
            </>
          )}

          {current === "goals" && (
            <>
              <div id="e-coop" tabIndex={-1} className={groupCls("e-coop", "co-block")}>
                <label style={{ marginTop: 0 }}>{t("co.su.coop")}<Req /></label>
                <div className="co-coop-grid">
                  {Object.keys(catalog?.cooperation ?? {}).map((k) => (
                    <button key={k} type="button" className={`co-coop ${f.cooperation.includes(k) ? "on" : ""}`}
                            onClick={() => { setF({ ...f, cooperation: toggle(f.cooperation, k) }); clear("e-coop"); }}>
                      <Icon name={COOP_ICONS[k] ?? "spark"} size={18} /><span>{coopLabel(k, catalog)}</span>
                    </button>
                  ))}
                </div>
                {errors["e-coop"] && <div className="field-error">{t("co.su.coop_err")}</div>}
              </div>
              <div className="co-block">
                <label style={{ marginTop: 0 }}>{t("co.su.tracks")}</label>
                <div className="chips">
                  {tracks.map((tr) => (
                    <button key={tr.id} type="button" className={`chip ${f.wanted_track_ids.includes(tr.id) ? "on" : ""}`}
                            onClick={() => setF({ ...f, wanted_track_ids: toggle(f.wanted_track_ids, tr.id) })}>{tr.title.split(":")[0]}</button>
                  ))}
                </div>
              </div>
              <div className="co-consents">
                {(isNew || !me.consent_current) && (
                  <Consent employer value={consent} id="e-consent" invalid={Boolean(errors["e-consent"])} onChange={(v) => { setConsent(v); clear("e-consent"); }} />
                )}
                <label className="radio-line co-check">
                  <input type="checkbox" checked={f.show_as_partner} onChange={(e) => setF({ ...f, show_as_partner: e.target.checked })} />
                  <span>{t("co.su.partner_list")}</span>
                </label>
              </div>
              <div className="co-summary">
                <b>{t("co.su.summary")}</b>
                <div className="co-summary-grid">
                  <span>{t("p.signup.company")}</span><b>{f.name || "—"}</b>
                  <span>STIR</span><b>{f.stir || "—"}</b>
                  <span>{t("p.signup.industry")}</span><b>{f.industry ? industryLabel(f.industry, catalog) : "—"}</b>
                  <span>{t("co.su.doc_short")}</span><b>{files.registration ? files.registration.name : "—"}</b>
                </div>
                <p className="hint" style={{ margin: "8px 0 0" }}>{t("co.su.after_submit")}</p>
              </div>
            </>
          )}

          <ErrorText error={error} />
          <div className="co-nav">
            {step > 0 ? <button className="btn ghost" onClick={() => { setStep(step - 1); window.scrollTo({ top: 0 }); }}><Icon name="back" size={16} />{t("common.back")}</button> : <span />}
            {step < STEPS.length - 1
              ? <button className="btn" onClick={next}>{t("co.su.next")}<Icon name="back" size={16} className="flip" /></button>
              : <button className="btn" disabled={busy} onClick={submit}><Icon name="send" size={16} />{busy ? t("p.common.sending") : t("p.common.save_submit")}</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
