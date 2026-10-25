import { useEffect, useState } from "react";
import { api, loadCatalog, type Catalog, type Me } from "../../api";
import { Field, Req, useRequired, type Check } from "../../form";
import { ask, haptic } from "../../tg";
import { LogoutLink } from "../../ui";
import { ErrorText, isFullName, message, toast } from "../../ui";
import { t, tMaybe, useLang } from "../../i18n";
import { Consent } from "../Consent";
import PhoneField from "../PhoneField";

/** Older companies typed the field and city by hand: match them to the lists where possible. */
function guessIndustry(value: string, catalog: Catalog | null): string {
  if (!catalog || !value) return "";
  if (value in catalog.industries) return value;
  const v = value.trim().toLowerCase();
  const hit = Object.entries(catalog.industries).find(([k, label]) => k === v || label.toLowerCase().startsWith(v));
  return hit ? hit[0] : "";
}
function guessRegion(value: string, catalog: Catalog | null): string {
  if (!catalog || !value) return "";
  if (catalog.regions.includes(value)) return value;
  if (value.trim().toLowerCase() === "toshkent") return "Toshkent shahri";
  return catalog.regions.find((r) => r.toLowerCase().startsWith(value.trim().toLowerCase())) ?? "";
}

/**
 * Employer sign-up: the person and the company on one page. Without a company it creates one (sent to an
 * admin for the STIR check); with a company it edits both, which is also the employer's "Profilim".
 */
export default function EmployerSignup({ me, onSaved, onBack, onLogout }: {
  me: Me; onSaved: (m: Me) => void; onBack?: () => void; onLogout?: () => void;
}) {
  useLang();
  const c = me.company;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [f, setF] = useState({
    full_name: me.full_name, job_title: me.job_title, name: c?.name ?? "", legal_form: c?.legal_form ?? "",
    industry: c?.industry ?? "", size: c?.size ?? "", city: c?.city ?? "", stir: c?.stir ?? "",
    description: c?.description ?? "", website: c?.website ?? "", telegram: c?.telegram ?? "",
    address: c?.address ?? "", email: c?.email ?? "",
  });
  const [consent, setConsent] = useState(me.consent_current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls, groupCls } = useRequired();

  useEffect(() => {
    loadCatalog().then((cat) => {
      setCatalog(cat);
      setF((cur) => ({ ...cur, industry: guessIndustry(cur.industry, cat), city: guessRegion(cur.city, cat) }));
    }, (e) => setError(message(e)));
  }, []);

  const set = (k: keyof typeof f, id: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    clear(id);
  };

  async function save() {
    const checks: Check[] = [
      ["e-name", isFullName(f.full_name), t("p.signup.req.name")],
      ["e-title", f.job_title.trim().length >= 2, t("p.signup.req.title")],
      ["e-phone", Boolean(me.phone), t("p.signup.req.phone")],
      ["e-company", f.name.trim().length >= 2, t("p.signup.req.company")],
      ["e-form", Boolean(f.legal_form), t("p.signup.req.form")],
      ["e-industry", Boolean(f.industry), t("p.signup.req.industry")],
      ["e-size", Boolean(f.size), t("p.signup.req.size")],
      ["e-city", Boolean(f.city), t("p.signup.req.city")],
      ["e-stir", /^\d{9}$/.test(f.stir.trim()), t("p.signup.req.stir")],
      ["e-about", f.description.trim().length >= 20, t("p.signup.req.about")],
      ["e-consent", consent, t("p.signup.req.consent")],
    ];
    if (!check(checks)) return;
    const company = {
      name: f.name.trim(), legal_form: f.legal_form, industry: f.industry, size: f.size, city: f.city, stir: f.stir.trim(),
      description: f.description.trim(), website: f.website.trim(), telegram: f.telegram.trim(), address: f.address.trim(),
      email: f.email.trim(),
    };
    const identityChanged = c && (company.name !== c.name || Boolean(c.stir && company.stir !== c.stir));
    if (c?.status === "approved" && identityChanged &&
        !(await ask(t("p.signup.identity_confirm")))) return;
    setBusy(true); setError("");
    try {
      let saved: Me;
      if (!c) {
        saved = await api.registerCompany({ ...company, full_name: f.full_name.trim(), job_title: f.job_title.trim(), consent: true });
      } else {
        await api.updateMe({ full_name: f.full_name.trim(), job_title: f.job_title.trim(), ...(me.consent_current ? {} : { consent: true }) });
        await api.employer.editCompany(company);
        saved = await api.me();
      }
      haptic("success");
      toast(c ? t("p.signup.saved") : t("p.signup.saved_review"));
      onSaved(saved);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const options = (entries: [string, string][]) => [<option key="" value="">{t("task.f.choose")}</option>,
    ...entries.map(([k, label]) => <option key={k} value={k}>{label}</option>)];

  return (
    <div>
      <LogoutLink onLogout={onLogout} />
      {onBack && <button className="btn small ghost" onClick={onBack}>{t("common.back")}</button>}
      <h1>{c ? t("nav.company.profile") : t("p.signup.title")}</h1>
      {!c && <p className="hint">{t("p.signup.intro")}</p>}
      {c?.status === "pending" && <p className="notice">{t("p.signup.pending")}</p>}
      {c?.status === "rejected" && <p className="notice">{t("p.signup.rejected", { note: c.review_note ? `: ${c.review_note}` : "" })}</p>}
      {c?.status === "approved" && <p className="hint">{t("p.signup.approved_hint")}</p>}
      <p className="form-note"><Req />{t("p.common.required_note")}</p>

      <h2>{t("p.signup.s1")}</h2>
      <div className="card">
        <Field id="e-name" label={t("p.signup.name")} required error={errors["e-name"] && t("p.signup.name_err")}>
          <input id="e-name" className={cls("e-name")} value={f.full_name} maxLength={128} placeholder={t("p.signup.name_ph")} onChange={set("full_name", "e-name")} />
        </Field>
        <Field id="e-title" label={t("p.signup.position")} required error={errors["e-title"] && t("p.signup.position_err")}>
          <input id="e-title" className={cls("e-title")} value={f.job_title} maxLength={120} placeholder={t("p.signup.position_ph")} onChange={set("job_title", "e-title")} />
        </Field>
        <div id="e-phone" tabIndex={-1} className={groupCls("e-phone")} style={{ marginTop: 12 }}>
          <label style={{ marginTop: 0 }}>{t("p.signup.phone")}<Req /></label>
          <PhoneField me={me} onChanged={(m) => { onSaved(m); if (m.phone) clear("e-phone"); }} />
          {errors["e-phone"] && <div className="field-error">{t("p.signup.phone_err")}</div>}
        </div>
      </div>

      <h2>{t("p.signup.s2")}</h2>
      <div className="card">
        <Field id="e-company" label={t("p.signup.company")} required error={errors["e-company"] && t("p.signup.company_err")}>
          <input id="e-company" className={cls("e-company")} value={f.name} maxLength={160} placeholder={t("p.signup.company_ph")} onChange={set("name", "e-company")} />
        </Field>
        <div className="row">
          <div className="grow">
            <Field id="e-form" label={t("p.signup.form")} required error={errors["e-form"] && t("p.common.pick")}>
              <select id="e-form" className={cls("e-form")} value={f.legal_form} onChange={set("legal_form", "e-form")}>
                {options(Object.entries(catalog?.legal_forms ?? {}))}
              </select>
            </Field>
          </div>
          <div className="grow">
            <Field id="e-size" label={t("p.signup.size")} required error={errors["e-size"] && t("p.common.pick")}>
              <select id="e-size" className={cls("e-size")} value={f.size} onChange={set("size", "e-size")}>
                {options(Object.entries(catalog?.company_sizes ?? {}))}
              </select>
            </Field>
          </div>
        </div>
        <Field id="e-industry" label={t("p.signup.industry")} required error={errors["e-industry"] && t("p.signup.industry_err")}>
          <select id="e-industry" className={cls("e-industry")} value={f.industry} onChange={set("industry", "e-industry")}>
            {options(Object.entries(catalog?.industries ?? {}).map(([k, label]) => [k, tMaybe(`industry.${k}`) ?? label]))}
          </select>
        </Field>
        <Field id="e-city" label={t("p.signup.city")} required error={errors["e-city"] && t("p.common.pick")}>
          <select id="e-city" className={cls("e-city")} value={f.city} onChange={set("city", "e-city")}>
            {options((catalog?.regions ?? []).map((r) => [r, r]))}
          </select>
        </Field>
        <Field id="e-stir" label={t("p.signup.stir")} required error={errors["e-stir"] && t("p.signup.stir_err")}
               hint={t("p.signup.stir_hint")}>
          <input id="e-stir" className={cls("e-stir")} value={f.stir} inputMode="numeric" maxLength={9} placeholder="301234567"
                 onChange={(e) => { setF({ ...f, stir: e.target.value.replace(/\D/g, "") }); clear("e-stir"); }} />
        </Field>
        <Field id="e-about" label={t("p.signup.about")} required error={errors["e-about"] && t("p.common.min20")}>
          <textarea id="e-about" className={cls("e-about")} value={f.description} maxLength={2000}
                    placeholder={t("p.signup.about_ph")} onChange={set("description", "e-about")} />
        </Field>
      </div>

      <h2>{t("p.signup.s3")}</h2>
      <div className="card">
        <Field id="e-site" label={t("p.signup.site")}><input id="e-site" value={f.website} inputMode="url" placeholder="kompaniya.uz" onChange={set("website", "e-site")} /></Field>
        <Field id="e-tg" label={t("p.signup.telegram")}><input id="e-tg" value={f.telegram} maxLength={128} placeholder="@kompaniya" onChange={set("telegram", "e-tg")} /></Field>
        <Field id="e-email" label="Email"><input id="e-email" value={f.email} inputMode="email" maxLength={120} placeholder="hr@kompaniya.uz" onChange={set("email", "e-email")} /></Field>
        <Field id="e-addr" label={t("p.signup.address")}><input id="e-addr" value={f.address} maxLength={200} onChange={set("address", "e-addr")} /></Field>
      </div>

      {(!c || !me.consent_current) && (
        <>
          <Consent employer value={consent} id="e-consent" invalid={Boolean(errors["e-consent"])} onChange={(v) => { setConsent(v); clear("e-consent"); }} />
          {errors["e-consent"] && <div className="field-error">{t("p.signup.consent_err")}</div>}
        </>
      )}
      <ErrorText error={error} />
      <div className="save-bar">
        <button className="btn" disabled={busy} onClick={save}>{busy ? t("p.common.saving") : c ? t("common.save") : t("p.common.save_submit")}</button>
      </div>
    </div>
  );
}
