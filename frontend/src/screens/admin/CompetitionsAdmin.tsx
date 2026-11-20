// Admin → Musobaqalar: every organizer's competitions through the shared CompetitionManager (admins may also run
// their own), «Yashirish / Tiklash» on each, and the switch for the site's home page block
// «G'oliblar va top jamoalar» (docs/13-musobaqalar.md §6, admin_access permission "tests").
import { useEffect, useState } from "react";
import { competitionsApi, type Competition } from "../../competitionsApi";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { ask } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import CompetitionManager from "../competitions/CompetitionManager";

export default function CompetitionsAdmin() {
  return (
    <CompetitionManager api={competitionsApi.admin} kind="admin" top={<HomeSwitch />}
                        renderActions={(c, update) => <HideButton c={c} update={update} />} />
  );
}

function HideButton({ c, update }: { c: Competition; update: (c: Competition) => void }) {
  useLang();
  const [busy, setBusy] = useState(false);
  const hidden = Boolean(c.is_hidden);
  async function toggle() {
    if (!hidden && !(await ask(t("corg.admin.hide_confirm", { title: c.title })))) return;
    setBusy(true);
    try {
      const saved = hidden ? await competitionsApi.admin.restore(c.id) : await competitionsApi.admin.hide(c.id);
      update({ ...saved, is_hidden: saved.is_hidden ?? !hidden });
      toast(hidden ? t("corg.admin.restored") : t("corg.admin.hidden"));
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={`btn small ${hidden ? "soft" : "bad"}`} disabled={busy} onClick={toggle}>
      <Icon name={hidden ? "eye" : "close"} size={15} />{hidden ? t("corg.admin.restore") : t("corg.admin.hide")}
    </button>
  );
}

/** «Saytning bosh sahifasida g'oliblar va top jamoalar»: on or off (GET/PUT /admin/competitions/home). */
function HomeSwitch() {
  useLang();
  const [show, setShow] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { competitionsApi.admin.home().then((r) => setShow(r.show), (e) => setError(message(e))); }, []);

  async function toggle(next: boolean) {
    setBusy(true); setError("");
    try {
      const r = await competitionsApi.admin.setHome(next);
      setShow(r.show);
      toast(r.show ? t("corg.admin.home_on") : t("corg.admin.home_off"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="co-card corg-switch-card">
      <span className="corg-switch-icon"><Icon name="globe" size={20} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{t("corg.admin.home_title")}</b>
        <p className="hint">{show === null && !error ? t("common.loading") : show ? t("corg.admin.home_on_hint") : t("corg.admin.home_off_hint")}</p>
        <ErrorText error={error} />
      </div>
      <label className="corg-switch">
        <input type="checkbox" role="switch" aria-label={t("corg.admin.home_title")} checked={Boolean(show)} disabled={show === null || busy}
               onChange={(e) => toggle(e.target.checked)} />
        <span aria-hidden="true" />
      </label>
    </div>
  );
}
