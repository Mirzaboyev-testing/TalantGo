// A password field with an eye button that shows what was typed: on a phone people typed blind and mistyped
// (2026-11-20). One component for sign-in, sign-up, password recovery, the panels' password card and the admin site.
import { useState } from "react";
import { t } from "../i18n";
import { Icon } from "../icons";

export default function PasswordInput({ id, value, onChange, className = "", autoComplete, placeholder, disabled }: {
  id?: string; value: string; onChange: (value: string) => void; className?: string; autoComplete: string;
  placeholder?: string; disabled?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const label = shown ? t("cp.hide") : t("cp.show");
  return (
    <div className="cp-secret">
      <input id={id} type={shown ? "text" : "password"} className={className} value={value} maxLength={128}
             autoComplete={autoComplete} placeholder={placeholder} disabled={disabled}
             autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className={`cp-eye ${shown ? "on" : ""}`} aria-label={label} title={label} aria-pressed={shown}
              onClick={() => setShown(!shown)}><Icon name="eye" size={17} /></button>
    </div>
  );
}
