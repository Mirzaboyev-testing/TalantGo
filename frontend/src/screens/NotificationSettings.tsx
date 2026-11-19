import { useState } from "react";
import { api, type Me, type NotifyCategory } from "../api";
import { t, useLang, type MsgKey } from "../i18n";
import { Icon } from "../icons";
import { BOT_URL } from "../tg";
import { message, toast } from "../ui";

// what each panel can switch off (services/notify.py CATEGORY); the rest (applications, checks, passwords) always goes
const FOR: Record<string, NotifyCategory[]> = {
  student: ["chat", "opportunities", "reminders", "news"],
  employer: ["chat", "news"],
  university: ["news"],
};

/** "Bot xabarlari": which bell notices also come to Telegram. The bell itself keeps everything. */
export default function NotificationSettings({ me, onChanged, className = "card" }: {
  me: Me; onChanged: (m: Me) => void; className?: string;
}) {
  useLang();
  const prefs = me.notify_prefs ?? { telegram: true, muted: [] };
  const [busy, setBusy] = useState(false);
  async function save(next: { telegram: boolean; muted: NotifyCategory[] }) {
    setBusy(true);
    try { onChanged(await api.setNotifyPrefs(next)); toast(t("ns.saved")); } catch (e) { toast(message(e), "error"); }
    finally { setBusy(false); }
  }
  const off = !me.has_telegram || !prefs.telegram;
  const row = (key: string, label: string, hint: string, on: boolean, change: (v: boolean) => void, disabled = false) => (
    <label key={key} className="st-switch-row">
      <span><b>{label}</b><small>{hint}</small></span>
      <input type="checkbox" className="st-switch" checked={on} disabled={busy || disabled} onChange={(e) => change(e.target.checked)} />
    </label>
  );
  return (
    <div className={className}>
      <b className="row" style={{ gap: 8 }}><Icon name="bell" size={18} />{t("ns.title")}</b>
      <p className="hint" style={{ marginTop: 4 }}>{t("ns.hint")}</p>
      {!me.has_telegram && <p className="hint">{t("ns.no_telegram")}</p>}
      {me.has_telegram && me.telegram_blocked && (
        <p className="hint" style={{ color: "var(--warn)" }}>
          {t("ns.blocked")} <a href={BOT_URL} target="_blank" rel="noreferrer">{t("bot.open")}</a>
        </p>
      )}
      {row("telegram", t("ns.telegram"), t("ns.telegram_hint"), me.has_telegram && prefs.telegram,
           (v) => save({ telegram: v, muted: prefs.muted }), !me.has_telegram)}
      {(FOR[me.account_type] ?? FOR.student).map((c) => row(
        c, t(`ns.cat.${c}` as MsgKey), t(`ns.cat.${c}_hint` as MsgKey), !off && !prefs.muted.includes(c),
        (v) => save({ telegram: prefs.telegram, muted: v ? prefs.muted.filter((x) => x !== c) : [...prefs.muted, c] }), off))}
      <p className="hint" style={{ marginBottom: 0 }}>{t("ns.always")}</p>
    </div>
  );
}
