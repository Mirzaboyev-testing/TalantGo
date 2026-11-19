import { absoluteUrl, api, type Me } from "../../api";
import { LANGS, getLang, setLang, t, useLang, type Lang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate } from "../../router";
import { insideTelegram, openAfter, openLink } from "../../tg";
import { message, toast } from "../../ui";
import { PageHead } from "../employer/kit";
import InviteCard from "../InviteCard";
import LoginMethods from "../LoginMethods";
import NotificationSettings from "../NotificationSettings";
import PhoneField from "../PhoneField";

/** "Sozlamalar" (student panel v2): account, sign-in, privacy, CV and language, apart from the profile itself. */
export default function StudentSettings({ me, onSaved, onLogout }: { me: Me; onSaved: (m: Me) => void; onLogout: () => void }) {
  useLang();
  async function set(changes: Partial<Me>, done: string) {
    try { onSaved(await api.updateMe(changes)); toast(done); } catch (e) { toast(message(e), "error"); }
  }
  const sw = (label: string, hint: string, on: boolean, change: (v: boolean) => void) => (
    <label className="st-switch-row">
      <span><b>{label}</b><small>{hint}</small></span>
      <input type="checkbox" className="st-switch" checked={on} onChange={(e) => change(e.target.checked)} />
    </label>
  );
  const cvUrl = `${window.location.origin}/cv/${me.cv_slug}`;

  return (
    <div className="co-page st-page">
      <PageHead title={t("st.set.title")} sub={t("st.set.sub")} />
      <div className="st-settings">
        <div className="co-col">
          <div className="co-card">
            <div className="co-card-head"><b className="row" style={{ gap: 8 }}><Icon name="phone" size={18} />{t("s.profile.phone")}</b></div>
            <PhoneField me={me} onChanged={onSaved} />
          </div>
          <LoginMethods me={me} onChanged={onSaved} />
          <div className="co-card">
            <div className="co-card-head"><b className="row" style={{ gap: 8 }}><Icon name="globe" size={18} />{t("shell.language")}</b></div>
            <div className="st-seg">
              {LANGS.map((l) => (
                <button key={l.id} type="button" className={getLang() === l.id ? "on" : ""}
                        onClick={() => { setLang(l.id as Lang); api.updateMe({ language: l.id as Lang }).catch(() => {}); }}>{l.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="co-col">
          <div className="co-card">
            <div className="co-card-head"><b className="row" style={{ gap: 8 }}><Icon name="lock" size={18} />{t("st.set.privacy")}</b></div>
            {sw(t("s.career.open_to_work"), t("s.career.open_to_work_hint"), me.open_to_work,
                (v) => set({ open_to_work: v }, v ? t("s.career.otw_on") : t("s.career.otw_off")))}
            {sw(t("profile.visible.title"), t("profile.visible.hint"), me.visible_to_employers,
                (v) => set({ visible_to_employers: v }, t(v ? "profile.visible.on" : "profile.visible.off")))}
          </div>
          <NotificationSettings me={me} onChanged={onSaved} className="co-card" />
          <div className="co-card">
            <div className="co-card-head">
              <b className="row" style={{ gap: 8 }}><Icon name="file" size={18} />{t("s.profile.my_cv")}</b>
              <span className={`co-pill ${me.cv_public ? "" : "warn"}`}>{me.cv_public ? t("s.profile.open") : t("s.profile.closed")}</span>
            </div>
            <p className="hint" style={{ marginTop: 0 }}>{t("s.profile.cv_hint")}</p>
            {sw(t("st.set.cv_public"), t("st.pf.cv_public_hint"), me.cv_public,
                (v) => set({ cv_public: v }, v ? t("s.profile.cv_opened") : t("s.profile.cv_closed")))}
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn small ghost" style={{ width: "auto" }} onClick={async () => {
                try { await openAfter(async () => absoluteUrl((await api.myCvLink()).url)); } catch (e) { toast(message(e), "error"); }
              }}><Icon name="file" size={16} />{t("s.profile.cv_pdf")}</button>
              {me.cv_public && <button className="btn small ghost" style={{ width: "auto" }} onClick={() => openLink(cvUrl)}><Icon name="eye" size={16} />{t("s.profile.view")}</button>}
              {me.cv_public && (
                <button className="btn small ghost" style={{ width: "auto" }} onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(cvUrl)}&text=${encodeURIComponent(t("s.profile.share_text"))}`)}>
                  <Icon name="send" size={16} />{t("s.common.share")}
                </button>
              )}
            </div>
          </div>
          <div className="co-card">
            <div className="co-card-head"><b className="row" style={{ gap: 8 }}><Icon name="path" size={18} />{t("st.tasks.tab.weekly")}</b></div>
            <p className="hint" style={{ marginTop: 0 }}>{me.track ? me.track.title : t("st.set.no_track")}</p>
            <button className="btn small ghost" style={{ width: "auto" }} onClick={() => navigate("/talaba/yol")}>{me.track ? t("s.path.change_track") : t("st.weekly.pick")}</button>
          </div>
          <InviteCard me={me} />
          {!insideTelegram && (
            <button className="btn ghost" onClick={onLogout}><Icon name="logout" size={18} />{t("shell.logout")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
