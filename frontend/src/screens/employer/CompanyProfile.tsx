import { useEffect, useState } from "react";
import { api, loadCatalog, type Catalog, type Me, type SubmittedFile, type Track } from "../../api";
import { Field, Req, useRequired, type Check } from "../../form";
import { t, useLang, type MsgKey } from "../../i18n";
import { Icon, type IconName } from "../../icons";
import { navigate } from "../../router";
import { ask, haptic } from "../../tg";
import { ErrorText, isFullName, message, Sheet, toast } from "../../ui";
import ChangePassword from "../ChangePassword";
import LoginMethods from "../LoginMethods";
import NotificationSettings from "../NotificationSettings";
import PhoneField from "../PhoneField";
import { coopLabel, industryLabel, legalLabel, ownershipLabel, sizeLabel } from "./CompanySignup";
import { CompanyMark, FileDrop, PageHead, Tabs } from "./kit";

type Section = "company" | "person" | "goals" | "docs" | "login";
const SECTIONS: { key: Section; icon: IconName }[] = [
  { key: "company", icon: "building" }, { key: "person", icon: "user" }, { key: "goals", icon: "spark" },
  { key: "docs", icon: "lock" }, { key: "login", icon: "globe" },
];
type Files = { registration: SubmittedFile | null; authority: SubmittedFile | null; logo: SubmittedFile | null };
const FILE_FIELDS = { registration: "registration_doc_id", authority: "authority_doc_id", logo: "logo_file_id" } as const;
/** Only the listed files are sent: a field left out keeps what is saved on the server. */
const fileIds = (fl: Files, keys: (keyof Files)[]) =>
  Object.fromEntries(keys.map((k) => [FILE_FIELDS[k], fl[k]?.id ?? null])) as Partial<Record<(typeof FILE_FIELDS)[keyof Files], number | null>>;

/** The approved company's profile: what students see on its page, the person, documents and sign-in methods. */
export default function CompanyProfile({ me, onChanged }: { me: Me; onChanged: (m: Me) => void }) {
  useLang();
  const c = me.company!;
  const [section, setSection] = useState<Section>("company");
  const [password, setPassword] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [files, setFiles] = useState<Files>({ registration: null, authority: null, logo: null });
  // until the saved documents arrive, a save must not send empty ids (that would remove the files)
  const [docsReady, setDocsReady] = useState(false);
  const [f, setF] = useState({
    full_name: me.full_name, job_title: me.job_title, contact_role: c.contact_role,
    name: c.name, legal_form: c.legal_form, ownership: c.ownership, size: c.size, industry: c.industry, city: c.city,
    stir: c.stir ?? "", description: c.description, website: c.website, telegram: c.telegram, email: c.email, address: c.address,
    cooperation: c.cooperation, wanted_track_ids: c.wanted_track_ids, show_as_partner: c.show_as_partner,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls } = useRequired();

  useEffect(() => {
    loadCatalog().then(setCatalog, (e) => setError(message(e)));
    api.tracks().then(setTracks, () => {});
    api.employer.documents().then((docs) => {
      setFiles({
        registration: docs.find((d) => d.kind === "registration") ?? null,
        authority: docs.find((d) => d.kind === "authority") ?? null,
        logo: docs.find((d) => d.kind === "logo") ?? null,
      });
      setDocsReady(true);
    }, () => {});
  }, []);

  const set = (k: keyof typeof f, id = "") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setF((cur) => ({ ...cur, [k]: value }));
    if (id) clear(id);
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save(changedFiles: Partial<Files> = {}) {
    const fl = { ...files, ...changedFiles };
    const checks: Check[] = [
      ["e-name", isFullName(f.full_name), t("p.signup.req.name")],
      ["e-title", f.job_title.trim().length >= 2, t("p.signup.req.title")],
      ["e-company", f.name.trim().length >= 2, t("p.signup.req.company")],
      ["e-stir", /^\d{9}$/.test(f.stir.trim()), t("p.signup.req.stir")],
      ["e-about", f.description.trim().length >= 20, t("p.signup.req.about")],
    ];
    if (!check(checks)) {
      const first = checks.find((x) => !x[1])![0];
      setSection(["e-name", "e-title"].includes(first) ? "person" : "company");
      return;
    }
    const identityChanged = f.name.trim() !== c.name || Boolean(c.stir && f.stir.trim() !== c.stir);
    if (identityChanged && !(await ask(t("p.signup.identity_confirm")))) return;
    setBusy(true); setError("");
    try {
      await api.updateMe({ full_name: f.full_name.trim(), job_title: f.job_title.trim() });
      await api.employer.editCompany({
        name: f.name.trim(), legal_form: f.legal_form, ownership: f.ownership, industry: f.industry, size: f.size, city: f.city,
        stir: f.stir.trim(), description: f.description.trim(), website: f.website.trim(), telegram: f.telegram.trim(),
        email: f.email.trim(), address: f.address.trim(), contact_role: f.contact_role, cooperation: f.cooperation,
        wanted_track_ids: f.wanted_track_ids, show_as_partner: f.show_as_partner,
        ...fileIds(fl, docsReady ? ["registration", "authority", "logo"] : Object.keys(changedFiles) as (keyof Files)[]),
      });
      onChanged(await api.me());
      haptic("success");
      toast(t("p.signup.saved"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const changeFile = (kind: keyof Files) => (x: SubmittedFile | null) => {
    setFiles({ ...files, [kind]: x });
    void save({ [kind]: x });       // a file change is saved at once
  };
  const options = (entries: [string, string][]) => [<option key="" value="">{t("task.f.choose")}</option>,
    ...entries.map(([k, label]) => <option key={k} value={k}>{label}</option>)];
  const legalKeys = Object.keys(catalog?.legal_forms ?? {});
  if (f.legal_form && !legalKeys.includes(f.legal_form)) legalKeys.push(f.legal_form);
  const filled = [c.logo_url, c.description.length >= 120, c.website, c.telegram || c.email, c.address, c.cooperation.length,
                  c.wanted_track_ids.length, c.registration_doc_id].filter(Boolean).length;
  const percent = Math.round((100 * filled) / 8);
  const saveBar = (
    <div className="co-save-row">
      <ErrorText error={error} />
      <button className="btn" disabled={busy} onClick={() => save()}>{busy ? t("p.common.saving") : t("common.save")}</button>
    </div>
  );

  return (
    <div className="co-page">
      <PageHead title={t("nav.company.profile")} sub={t("co.prof.sub")} />
      <div className="co-prof-hero">
        <div className="co-prof-cover" />
        <div className="co-prof-body">
          <label className="co-prof-logo" title={t("co.prof.logo_change")}>
            <CompanyMark name={c.name} url={c.logo_url} size={88} />
            <span className="co-prof-logo-edit"><Icon name="upload" size={15} /></span>
            <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try { changeFile("logo")(await api.upload(file)); } catch (err) { setError(message(err)); }
            }} />
          </label>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="co-prof-name">
              <h2>{c.name}</h2>
              <span className="co-verified-pill"><Icon name="verified" size={14} />{t("co.verified")}</span>
            </div>
            <div className="hint">{[industryLabel(c.industry, catalog), c.city, c.size && sizeLabel(c.size, catalog)].filter(Boolean).join(" · ")}</div>
            <div className="chips" style={{ marginTop: 8 }}>
              {c.cooperation.slice(0, 4).map((k) => <span key={k} className="chip">{coopLabel(k, catalog)}</span>)}
            </div>
          </div>
          <div className="co-prof-side">
            <div className="co-prof-meter">
              <div className="row between"><span className="hint">{t("co.dash.profile")}</span><b>{percent}%</b></div>
              <div className="co-progress small"><span style={{ width: `${percent}%` }} /></div>
            </div>
            <button className="btn ghost small" onClick={() => navigate(`/korxonalar/${c.id}`)}><Icon name="globe" size={15} />{t("co.prof.public")}</button>
          </div>
        </div>
      </div>

      <Tabs items={SECTIONS.map((s) => [s.key, t(`co.prof.tab.${s.key}` as MsgKey)] as [Section, string])} value={section} onChange={setSection} />

      {section === "company" && (
        <div className="co-card">
          <div className="co-form-grid">
            <Field id="e-company" label={t("p.signup.company")} required error={errors["e-company"] && t("p.signup.company_err")}>
              <input id="e-company" className={cls("e-company")} value={f.name} maxLength={160} onChange={set("name", "e-company")} />
            </Field>
            <Field id="e-stir" label={t("p.signup.stir")} required error={errors["e-stir"] && t("p.signup.stir_err")} hint={t("p.signup.approved_hint")}>
              <input id="e-stir" className={cls("e-stir")} value={f.stir} inputMode="numeric" maxLength={9}
                     onChange={(e) => { setF({ ...f, stir: e.target.value.replace(/\D/g, "") }); clear("e-stir"); }} />
            </Field>
            <Field id="e-form" label={t("co.su.legal")}>
              <select id="e-form" value={f.legal_form} onChange={set("legal_form")}>{options(legalKeys.map((k) => [k, legalLabel(k, catalog)]))}</select>
            </Field>
            <Field id="e-own" label={t("co.su.ownership")}>
              <select id="e-own" value={f.ownership} onChange={set("ownership")}>{options(Object.keys(catalog?.ownership ?? {}).map((k) => [k, ownershipLabel(k, catalog)]))}</select>
            </Field>
            <Field id="e-industry" label={t("p.signup.industry")}>
              <select id="e-industry" value={f.industry} onChange={set("industry")}>{options(Object.keys(catalog?.industries ?? {}).map((k) => [k, industryLabel(k, catalog)]))}</select>
            </Field>
            <Field id="e-size" label={t("p.signup.size")}>
              <select id="e-size" value={f.size} onChange={set("size")}>{options(Object.keys(catalog?.company_sizes ?? {}).map((k) => [k, sizeLabel(k, catalog)]))}</select>
            </Field>
            <Field id="e-city" label={t("p.signup.city")}>
              <select id="e-city" value={f.city} onChange={set("city")}>{options((catalog?.regions ?? []).map((r) => [r, r]))}</select>
            </Field>
            <Field id="e-site" label={t("p.signup.site")}><input id="e-site" value={f.website} inputMode="url" placeholder="kompaniya.uz" onChange={set("website")} /></Field>
            <Field id="e-tg" label={t("p.signup.telegram")}><input id="e-tg" value={f.telegram} maxLength={128} placeholder="@kompaniya" onChange={set("telegram")} /></Field>
            <Field id="e-email" label={t("co.su.hr_email")}><input id="e-email" value={f.email} inputMode="email" maxLength={120} onChange={set("email")} /></Field>
          </div>
          <Field id="e-addr" label={t("p.signup.address")}><input id="e-addr" value={f.address} maxLength={200} onChange={set("address")} /></Field>
          <Field id="e-about" label={t("p.signup.about")} required error={errors["e-about"] && t("p.common.min20")}
                 hint={<span className={f.description.trim().length >= 120 ? "co-count ok" : "co-count"}>{t("co.prof.about_hint", { n: f.description.trim().length })}</span>}>
            <textarea id="e-about" className={cls("e-about")} value={f.description} rows={6} maxLength={2000} onChange={set("description", "e-about")} />
          </Field>
          {saveBar}
        </div>
      )}

      {section === "person" && (
        <div className="co-card">
          <div className="co-form-grid">
            <Field id="e-name" label={t("p.signup.name")} required error={errors["e-name"] && t("p.signup.name_err")}>
              <input id="e-name" className={cls("e-name")} value={f.full_name} maxLength={128} onChange={set("full_name", "e-name")} />
            </Field>
            <Field id="e-title" label={t("p.signup.position")} required error={errors["e-title"] && t("p.signup.position_err")}>
              <input id="e-title" className={cls("e-title")} value={f.job_title} maxLength={120} onChange={set("job_title", "e-title")} />
            </Field>
          </div>
          <div className="co-block">
            <label style={{ marginTop: 0 }}>{t("p.signup.phone")}<Req /></label>
            <PhoneField me={me} onChanged={onChanged} />
          </div>
          {/* the person signs in with their own e-mail and password: changing it is one tap away (2026-11-19) */}
          <div className="co-block co-pass-row">
            <Icon name="lock" size={16} />
            <span className="grow">{me.has_password && me.email ? t("cp.login_email", { email: me.email }) : t("cp.hint_new")}</span>
            <button type="button" className="btn small ghost" onClick={() => setPassword(true)}>{me.has_password ? t("cp.open") : t("cp.set")}</button>
          </div>
          <div className="co-block">
            <label style={{ marginTop: 0 }}>{t("co.su.role")}</label>
            <div className="co-choice-row">
              {(["director", "representative"] as const).map((r) => (
                <button key={r} type="button" className={`co-choice ${f.contact_role === r ? "on" : ""}`} onClick={() => setF({ ...f, contact_role: r })}>
                  <span className="co-choice-icon"><Icon name={r === "director" ? "verified" : "user"} size={20} /></span>
                  <span><b>{t(`co.role.${r}`)}</b><small>{t(`co.role.${r}_hint`)}</small></span>
                  <span className="co-choice-tick"><Icon name="tick" size={14} /></span>
                </button>
              ))}
            </div>
          </div>
          {saveBar}
        </div>
      )}

      {section === "goals" && (
        <div className="co-card">
          <label style={{ marginTop: 0 }}>{t("co.su.coop")}</label>
          <div className="co-coop-grid">
            {Object.keys(catalog?.cooperation ?? {}).map((k) => (
              <button key={k} type="button" className={`co-coop ${f.cooperation.includes(k) ? "on" : ""}`}
                      onClick={() => setF({ ...f, cooperation: toggle(f.cooperation, k) })}>
                <Icon name="tick" size={16} /><span>{coopLabel(k, catalog)}</span>
              </button>
            ))}
          </div>
          <label>{t("co.su.tracks")}</label>
          <div className="chips">
            {tracks.map((tr) => (
              <button key={tr.id} type="button" className={`chip ${f.wanted_track_ids.includes(tr.id) ? "on" : ""}`}
                      onClick={() => setF({ ...f, wanted_track_ids: toggle(f.wanted_track_ids, tr.id) })}>{tr.title.split(":")[0]}</button>
            ))}
          </div>
          <label className="radio-line co-check" style={{ marginTop: 16 }}>
            <input type="checkbox" checked={f.show_as_partner} onChange={(e) => setF({ ...f, show_as_partner: e.target.checked })} />
            <span>{t("co.su.partner_list")}</span>
          </label>
          {saveBar}
        </div>
      )}

      {section === "docs" && (
        <div className="co-card">
          <p className="hint" style={{ marginTop: 0 }}>{t("co.prof.docs_hint")}</p>
          <div className="co-form-grid">
            <FileDrop id="d-reg" label={t("co.su.doc")} hint={t("co.su.doc_hint")} accept=".pdf,.jpg,.jpeg,.png,.webp"
                      file={files.registration} onFile={changeFile("registration")} />
            <FileDrop id="d-auth" label={t("co.su.authority")} hint={t("co.su.authority_hint")} accept=".pdf,.jpg,.jpeg,.png,.webp"
                      file={files.authority} onFile={changeFile("authority")} />
            <FileDrop id="d-logo" label={t("co.su.logo")} hint={t("co.su.logo_hint")} accept=".png,.jpg,.jpeg,.webp"
                      file={files.logo} onFile={changeFile("logo")} />
          </div>
          <div className="co-safe"><Icon name="lock" size={16} />{t("co.su.doc_private")}</div>
          <ErrorText error={error} />
        </div>
      )}

      {section === "login" && <div className="co-narrow-block"><ChangePassword me={me} onChanged={onChanged} />
        <LoginMethods me={me} onChanged={onChanged} withPassword={false} />
        <NotificationSettings me={me} onChanged={onChanged} /></div>}
      {password && (
        <Sheet onClose={() => setPassword(false)}>
          <h2 style={{ margin: "0 0 6px" }}>{t("cp.title")}</h2>
          <ChangePassword me={me} onChanged={onChanged} bare />
        </Sheet>
      )}
    </div>
  );
}
