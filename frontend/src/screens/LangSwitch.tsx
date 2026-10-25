import { LANGS, setLang, t, useLang, type Lang } from "../i18n";
import { Icon } from "../icons";

/** UZ / RU / EN. Signed-in screens pass `onChange` to keep the choice in the profile too. */
export default function LangSwitch({ onChange }: { onChange?: (lang: Lang) => void }) {
  const lang = useLang();
  return (
    <label className="lang-switch" title={t("shell.language")}>
      <Icon name="globe" size={16} />
      <select value={lang} aria-label={t("shell.language")}
              onChange={(e) => { const next = e.target.value as Lang; setLang(next); onChange?.(next); }}>
        {LANGS.map((l) => <option key={l.id} value={l.id}>{l.id.toUpperCase()}</option>)}
      </select>
    </label>
  );
}
