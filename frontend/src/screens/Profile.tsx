import { useState } from "react";
import { absoluteUrl, api, type Me } from "../api";
import { t, useLang } from "../i18n";
import { haptic, openAfter, openLink } from "../tg";
import { Avatar, ErrorText, focusField, isFullName, message, toast } from "../ui";
import CareerProfile from "./CareerProfile";
import PhoneField from "./PhoneField";
import InviteCard from "./InviteCard";
import LoginMethods from "./LoginMethods";

export default function ProfileScreen({ me, onSaved, onChangeTrack }: { me: Me; onSaved: (m: Me) => void; onChangeTrack: () => void }) {
  useLang();
  const [form, setForm] = useState({
    full_name: me.full_name, group_name: me.group_name, bio: me.bio, headline: me.headline,
    github_url: me.github_url, linkedin_url: me.linkedin_url, goals: me.goals.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  const cvUrl = `${window.location.origin}/cv/${me.cv_slug}`;

  // the name and the field are required; everything else here is optional
  const nameOk = isFullName(form.full_name);
  const headlineOk = form.headline.trim().length === 0 || form.headline.trim().length >= 5;
  const groupOk = form.group_name.trim().length >= 2;

  async function save(extra: Partial<Me> = {}) {
    const isCvToggle = "cv_public" in extra;
    if (!isCvToggle && (!nameOk || !headlineOk || !groupOk)) {
      setTried(true);
      toast(!nameOk ? t("s.common.full_name_error") : !headlineOk ? t("s.profile.headline_needed") : t("s.profile.group_needed"), "error");
      focusField(!nameOk ? "pf-name" : !headlineOk ? "pf-headline" : "pf-group");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { goals: _unused, ...rest } = form;
      void _unused;
      onSaved(await api.updateMe(isCvToggle ? extra : { ...rest, full_name: rest.full_name.trim(), group_name: rest.group_name.trim().toUpperCase(), ...extra }));
      haptic("success");
      setSaved(true);
      toast("cv_public" in extra ? (extra.cv_public ? t("s.profile.cv_opened") : t("s.profile.cv_closed")) : t("s.common.saved_ok"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ margin: "8px 0 14px" }}>
        <Avatar name={me.full_name} url={me.photo_url} />
        <div className="grow">
          <h1 style={{ margin: 0 }}>{me.full_name}</h1>
          {me.headline && <div style={{ fontWeight: 600 }}>{me.headline}</div>}
          <div className="hint">{me.track?.title}{me.role !== "student" ? t("s.common.mentor_suffix") : ""}</div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <b>{t("s.profile.my_cv")}</b>
          <span className={`badge ${me.cv_public ? "peer_verified" : "todo"}`}>{me.cv_public ? t("s.profile.open") : t("s.profile.closed")}</span>
        </div>
        <p className="hint">{t("s.profile.cv_hint")}</p>
        <div className="stack">
          <button className="btn" disabled={busy} onClick={() => save({ cv_public: !me.cv_public })}>
            {me.cv_public ? t("s.profile.cv_close") : t("s.profile.cv_open")}
          </button>
          <button className="btn ghost" onClick={async () => {
            try { await openAfter(async () => absoluteUrl((await api.myCvLink()).url)); } catch (e) { toast(message(e), "error"); }
          }}>{t("s.profile.cv_pdf")}</button>
          {me.cv_public && (
            <div className="row">
              <button className="btn ghost" onClick={() => openLink(cvUrl)}>{t("s.profile.view")}</button>
              <button className="btn ghost" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(cvUrl)}&text=${encodeURIComponent(t("s.profile.share_text"))}`)}>{t("s.common.share")}</button>
            </div>
          )}
        </div>
      </div>

      <InviteCard me={me} />

      <div className="card">
        <b>{t("s.profile.phone")}</b>
        <div style={{ marginTop: 8 }}><PhoneField me={me} onChanged={onSaved} /></div>
      </div>

      <CareerProfile me={me} onSaved={onSaved} />

      <div className="card">
        <b>{t("s.profile.basic")}</b>
        <p className="hint" style={{ marginTop: 4 }}>{t("s.profile.required_note")}</p>
        <label htmlFor="pf-name">{t("s.common.full_name")} *</label>
        <input id="pf-name" className={tried && !nameOk ? "invalid" : ""} value={form.full_name} maxLength={128}
               autoComplete="name" placeholder={t("s.common.name_ph")} onChange={set("full_name")} />
        {tried && !nameOk && <div className="field-error">{t("s.common.full_name_error")}</div>}
        <label htmlFor="pf-headline">{t("s.common.headline")}</label>
        <input id="pf-headline" className={tried && !headlineOk ? "invalid" : ""} value={form.headline} maxLength={120}
               placeholder={t("s.common.headline_ph")} onChange={set("headline")} />
        {tried && !headlineOk && <div className="field-error">{t("s.profile.headline_error")}</div>}
        <label htmlFor="pf-group">{t("s.common.group")} *</label>
        <input id="pf-group" className={tried && !groupOk ? "invalid" : ""} value={form.group_name} maxLength={40}
               placeholder={t("s.profile.group_ph")} onChange={set("group_name")} />
        {tried && !groupOk && <div className="field-error">{t("s.profile.group_needed")}</div>}
        <label>{t("s.profile.bio_label")}</label>
        <textarea value={form.bio} maxLength={600} placeholder={t("s.profile.bio_ph")} onChange={set("bio")} />
        <label>{t("s.profile.github")}</label>
        <input value={form.github_url} placeholder={t("s.common.github_ph")} inputMode="url" onChange={set("github_url")} />
        <label>{t("s.profile.linkedin")}</label>
        <input value={form.linkedin_url} placeholder={t("s.common.linkedin_ph")} inputMode="url" onChange={set("linkedin_url")} />
        <ErrorText error={error} />
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={() => save()}>{saved ? t("s.common.saved") : t("common.save")}</button>
          <button className="btn ghost" onClick={onChangeTrack}>{t("s.profile.change_track")}</button>
        </div>
      </div>
      <LoginMethods me={me} onChanged={onSaved} />
    </div>
  );
}
