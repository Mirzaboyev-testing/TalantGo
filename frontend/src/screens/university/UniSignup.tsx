import { useEffect, useMemo, useState } from "react";
import { api, loadCatalog, type Me, type SubmittedFile, type University } from "../../api";
import { Field, Req, useRequired, type Check } from "../../form";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { haptic } from "../../tg";
import { ErrorText, LogoutLink, isFullName, message, toast } from "../../ui";
import PhoneField from "../PhoneField";
import { COOPERATION, POSITIONS, staffOf, uapi } from "./uapi";
import { FileDrop, Pill, UIcon } from "./ukit";
import { BrandLogo } from "../../brand";

const OTHER = "other";

/** Steps on the left; used by the form and by the waiting screen. */
export function SignupSide({ step, compact }: { step: 1 | 2 | 3; compact?: boolean }) {
  useLang();
  const steps = [[t("u.su.step1"), t("u.su.step1_sub")], [t("u.su.step2"), t("u.su.step2_sub")], [t("u.su.step3"), t("u.su.step3_sub")]];
  return (
    <aside className="u-signup-side">
      <div className="row" style={{ gap: 10, fontWeight: 700, color: "var(--uni-ink)" }}><BrandLogo size={36} /></div>
      {!compact && <h1>{t("u.su.side_title")}</h1>}
      {!compact && <p>{t("u.su.side_text")}</p>}
      <ol className="u-steps">
        {steps.map(([label, sub], i) => (
          <li key={i} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""}>
            <b>{i + 1 < step ? <Icon name="tick" size={15} /> : i + 1}</b>
            <span className="lbl">{label}<small>{sub}</small></span>
          </li>
        ))}
      </ol>
      {!compact && (
        <ul className="u-perks">
          {(["shield", "chart", "building", "megaphone"] as const).map((ic, i) => (
            <li key={ic}><span><UIcon name={ic} size={13} /></span>{t(`u.su.perk${i + 1}` as "u.su.perk1")}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/**
 * University staff sign-up (step 2 of 3): university, the responsible person, the position document,
 * what the university can do on the platform, channels and pledges. Also used to fix and re-send a request.
 */
export default function UniSignup({ me, onChanged, onBack, onLogout }: {
  me: Me; onChanged: (m: Me) => void; onBack?: () => void; onLogout?: () => void;
}) {
  useLang();
  const s = staffOf(me);
  const [unis, setUnis] = useState<University[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const knownPos = (POSITIONS as readonly string[]).includes(me.staff_position);
  const [f, setF] = useState({
    uniId: me.staff_university?.id ? String(me.staff_university.id) : "", uniQuery: me.staff_university?.name ?? "",
    newUni: false, newName: "", newRegion: "",
    fullName: me.full_name, position: me.staff_position ? (knownPos ? me.staff_position : OTHER) : "",
    positionOther: me.staff_position && !knownPos ? me.staff_position : "",
    department: s?.department ?? "", workEmail: s?.work_email ?? me.email ?? "",
    website: s?.website ?? "", telegram: s?.telegram ?? "", social: s?.social ?? "",
  });
  const [doc, setDoc] = useState<SubmittedFile | null>(s?.doc ?? null);
  const [mou, setMou] = useState<SubmittedFile | null>(s?.mou ?? null);
  const [coop, setCoop] = useState<string[]>(s?.cooperation ?? []);
  const [consent, setConsent] = useState(me.has_consent);
  const [pledge, setPledge] = useState(Boolean(s));
  const [partner, setPartner] = useState(s?.show_as_partner ?? false);
  const [comboOpen, setComboOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { errors, check, clear, cls, groupCls } = useRequired();

  useEffect(() => {
    api.universities().then(setUnis, (e) => setError(message(e)));
    loadCatalog().then((c) => setRegions(c.regions), () => {});
  }, []);

  const matches = useMemo(() => {
    const q = f.uniQuery.trim().toLowerCase();
    return (q ? unis.filter((u) => `${u.name} ${u.short_name}`.toLowerCase().includes(q)) : unis).slice(0, 40);
  }, [f.uniQuery, unis]);
  const chosen = unis.find((u) => String(u.id) === f.uniId) ?? (me.staff_university && String(me.staff_university.id) === f.uniId ? me.staff_university : null);
  const set = (k: keyof typeof f, id?: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (id) clear(id);
  };

  async function submit() {
    const position = f.position === OTHER ? f.positionOther.trim() : f.position;
    const checks: Check[] = [
      ["u-uni", f.newUni ? f.newName.trim().length >= 3 : Boolean(f.uniId), t("u.su.req.uni")],
      ...(f.newUni ? [["u-region", Boolean(f.newRegion), t("u.su.req.region")] as Check] : []),
      ["u-name", isFullName(f.fullName), t("u.su.req.name")],
      ["u-pos", position.length >= 3, t("u.su.req.position")],
      ["u-phone", Boolean(me.phone), t("u.su.req.phone")],
      ["u-doc", Boolean(doc), t("u.su.req.doc")],
      ["u-coop", coop.length > 0, t("u.su.req.coop")],
      ["u-consent", consent, t("u.su.req.consent")],
      ["u-pledge", pledge, t("u.su.req.pledge")],
    ];
    if (!check(checks)) return;
    setBusy(true); setError("");
    try {
      const saved = await uapi.requestStaff({
        university_id: f.newUni ? null : Number(f.uniId), new_university: f.newUni ? f.newName.trim() : null,
        new_university_region: f.newUni ? f.newRegion : "", position, full_name: f.fullName.trim(),
        department: f.department.trim(), work_email: f.workEmail.trim(), doc_id: doc?.id ?? null, mou_id: mou?.id ?? null,
        cooperation: coop, website: f.website.trim(), telegram: f.telegram.trim(), social: f.social.trim(),
        data_pledge: pledge, show_as_partner: partner,
      });
      if (!me.has_consent) await api.updateMe({ consent: true }).catch(() => {});
      haptic("success");
      toast(t("u.su.sent"));
      onChanged(saved);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const editing = Boolean(s);
  return (
    <div className="uni-page">
      <div className="row between" style={{ marginBottom: 10 }}>
        {onBack ? <button className="btn small ghost" onClick={onBack}><Icon name="back" size={16} />{t("common.back")}</button> : <span />}
        <LogoutLink onLogout={onLogout} />
      </div>
      <div className="u-signup">
        <SignupSide step={2} />
        <section className="u-signup-card">
          <div className="u-account">
            <span className="u-ic"><Icon name="tick" size={18} /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{t("u.su.account_ok")}</b>
              <div className="hint ellipsis">{me.email || (me.username ? `@${me.username}` : me.full_name)}</div>
            </div>
          </div>
          <h2>{editing ? t("u.su.edit_title") : t("u.su.title")}</h2>
          <p className="hint" style={{ margin: "0 0 18px" }}>{t("u.su.intro")} <Req />{t("p.common.required_note")}</p>
          {s?.review_note && me.staff_status !== "pending" && (
            <div className={`u-note ${me.staff_status === "rejected" ? "red" : ""}`} style={{ marginBottom: 16 }}>
              <b>{t("u.su.admin_note")}</b>{s.review_note}
            </div>
          )}

          <fieldset className="u-fieldset">
            <legend><i>1</i>{t("u.su.f_uni")}</legend>
            {!f.newUni ? (
              <Field id="u-uni" label={t("s.common.university")} required error={errors["u-uni"] && t("u.su.req.uni")}>
                <div className="u-combo">
                  <input id="u-uni" className={cls("u-uni")} value={f.uniQuery} autoComplete="off" placeholder={t("u.su.uni_ph")}
                         onFocus={() => setComboOpen(true)} onBlur={() => setTimeout(() => setComboOpen(false), 150)}
                         onChange={(e) => { setF({ ...f, uniQuery: e.target.value, uniId: "" }); setComboOpen(true); clear("u-uni"); }} />
                  {comboOpen && (
                    <div className="u-combo-list">
                      {matches.map((u) => (
                        <button key={u.id} type="button" className={String(u.id) === f.uniId ? "on" : ""}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setF({ ...f, uniId: String(u.id), uniQuery: u.name }); setComboOpen(false); clear("u-uni"); }}>
                          {u.name}<span>{[u.short_name !== u.name ? u.short_name : "", u.city].filter(Boolean).join(" · ")}</span>
                        </button>
                      ))}
                      {matches.length === 0 && <div className="hint" style={{ padding: "8px 10px" }}>{t("u.su.uni_none")}</div>}
                      <button type="button" className="add" onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setF({ ...f, newUni: true, newName: f.uniQuery, uniId: "" }); setComboOpen(false); }}>
                        <Icon name="plus" size={16} />{t("u.su.uni_add")}
                      </button>
                    </div>
                  )}
                </div>
                {chosen && <div className="hint" style={{ marginTop: 4 }}>✓ {chosen.name}</div>}
              </Field>
            ) : (
              <>
                <div className="u-form-grid two">
                  <Field id="u-uni" label={t("u.su.new_name")} required error={errors["u-uni"] && t("u.su.req.uni")}>
                    <input id="u-uni" className={cls("u-uni")} value={f.newName} maxLength={200} onChange={set("newName", "u-uni")} />
                  </Field>
                  <Field id="u-region" label={t("u.su.region")} required error={errors["u-region"] && t("p.common.pick")}>
                    <select id="u-region" className={cls("u-region")} value={f.newRegion} onChange={set("newRegion", "u-region")}>
                      <option value="">{t("task.f.choose")}</option>
                      {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="hint" style={{ marginTop: 6 }}>{t("u.su.new_hint")}{" "}
                  <button type="button" className="link-btn" onClick={() => setF({ ...f, newUni: false })}>{t("u.su.back_to_list")}</button>
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="u-fieldset">
            <legend><i>2</i>{t("u.su.f_person")}</legend>
            <div className="u-form-grid two">
              <Field id="u-name" label={t("p.signup.name")} required error={errors["u-name"] && t("p.signup.name_err")}>
                <input id="u-name" className={cls("u-name")} value={f.fullName} maxLength={128} placeholder={t("p.signup.name_ph")} onChange={set("fullName", "u-name")} />
              </Field>
              <Field id="u-pos" label={t("u.su.position")} required error={errors["u-pos"] && t("u.su.req.position")}>
                <select id="u-pos" className={cls("u-pos")} value={f.position} onChange={set("position", "u-pos")}>
                  <option value="">{t("task.f.choose")}</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{t(`u.pos.${p}`)}</option>)}
                  <option value={OTHER}>{t("u.pos.other")}</option>
                </select>
              </Field>
              {f.position === OTHER && (
                <Field id="u-pos-other" label={t("u.su.position_other")} required>
                  <input id="u-pos-other" value={f.positionOther} maxLength={120} placeholder={t("u.su.position_other_ph")}
                         onChange={(e) => { setF({ ...f, positionOther: e.target.value }); clear("u-pos"); }} />
                </Field>
              )}
              <Field id="u-dep" label={t("u.su.department")} hint={t("u.su.department_hint")}>
                <input id="u-dep" value={f.department} maxLength={120} placeholder={t("u.su.department_ph")} onChange={set("department")} />
              </Field>
              <Field id="u-mail" label={t("u.su.work_email")} hint={t("u.su.work_email_hint")}>
                <input id="u-mail" type="email" value={f.workEmail} maxLength={120} placeholder="karyera@universitet.uz" onChange={set("workEmail")} />
              </Field>
            </div>
            <div id="u-phone" tabIndex={-1} className={groupCls("u-phone")} style={{ marginTop: 12 }}>
              <label style={{ marginTop: 0 }}>{t("u.su.phone")}<Req /></label>
              <PhoneField me={me} onChanged={(m) => { onChanged(m); if (m.phone) clear("u-phone"); }} />
              <div className="hint" style={{ marginTop: 4 }}>{t("u.su.phone_hint")}</div>
              {errors["u-phone"] && <div className="field-error">{t("p.signup.phone_err")}</div>}
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ marginTop: 0 }}>{t("u.su.doc")}<Req /></label>
              <FileDrop id="u-doc" file={doc} invalid={Boolean(errors["u-doc"])} hint={t("u.su.doc_hint")} onFile={(file) => { setDoc(file); clear("u-doc"); }} />
              {errors["u-doc"] ? <div className="field-error">{t("u.su.req.doc")}</div> : <div className="hint" style={{ marginTop: 4 }}>{t("u.su.doc_why")}</div>}
            </div>
          </fieldset>

          <fieldset className="u-fieldset">
            <legend><i>3</i>{t("u.su.f_coop")}<Req /></legend>
            <p className="hint">{t("u.su.coop_hint")}</p>
            <div id="u-coop" tabIndex={-1} className={`u-pills ${groupCls("u-coop")}`}>
              {COOPERATION.map((c) => (
                <Pill key={c} on={coop.includes(c)} onChange={(on) => { setCoop(on ? [...coop, c] : coop.filter((x) => x !== c)); clear("u-coop"); }}>
                  {t(`u.coop.${c}`)}
                </Pill>
              ))}
            </div>
            {errors["u-coop"] && <div className="field-error">{t("u.su.req.coop")}</div>}
          </fieldset>

          <fieldset className="u-fieldset">
            <legend><i>4</i>{t("u.su.f_channels")}</legend>
            <p className="hint">{t("u.su.channels_hint")}</p>
            <label style={{ marginTop: 6 }}>{t("u.su.mou")}</label>
            <FileDrop file={mou} hint={t("u.su.mou_hint")} onFile={setMou} />
            <div className="u-form-grid two" style={{ marginTop: 4 }}>
              <Field id="u-site" label={t("p.signup.site")}><input id="u-site" value={f.website} inputMode="url" maxLength={256} placeholder="universitet.uz" onChange={set("website")} /></Field>
              <Field id="u-tg" label={t("p.signup.telegram")}><input id="u-tg" value={f.telegram} maxLength={128} placeholder="@universitet" onChange={set("telegram")} /></Field>
              <Field id="u-soc" label={t("u.su.social")}><input id="u-soc" value={f.social} maxLength={256} placeholder="Instagram, LinkedIn" onChange={set("social")} /></Field>
            </div>
          </fieldset>

          {!me.has_consent && (
            <label id="u-consent" tabIndex={-1} className={`u-check-line ${groupCls("u-consent")}`}>
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); clear("u-consent"); }} />
              <span>{t("u.su.consent")}<Req /></span>
            </label>
          )}
          <label id="u-pledge" tabIndex={-1} className={`u-check-line ${groupCls("u-pledge")}`}>
            <input type="checkbox" checked={pledge} onChange={(e) => { setPledge(e.target.checked); clear("u-pledge"); }} />
            <span>{t("u.su.pledge")}<Req /></span>
          </label>
          <label className="u-check-line">
            <input type="checkbox" checked={partner} onChange={(e) => setPartner(e.target.checked)} />
            <span>{t("u.su.show_partner")}</span>
          </label>
          <ErrorText error={error} />
          <div className="save-bar">
            <button className="btn" disabled={busy} onClick={submit} style={{ padding: "14px 16px", fontSize: 15.5 }}>
              <Icon name="send" size={18} />{busy ? t("p.common.sending") : editing ? t("u.su.resend") : t("u.su.send")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
