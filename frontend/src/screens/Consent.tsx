import { Req } from "../form";
import { t, useLang } from "../i18n";

// v2 (2026-10-13): approved employers see every student's name, study details, results and CV.
// The texts are s.consent.student and s.consent.employer in locales/parts/student.ts.

export function Consent({ value, onChange, employer = false, id = "f-consent", invalid = false }: {
  value: boolean; onChange: (v: boolean) => void; employer?: boolean; id?: string; invalid?: boolean;
}) {
  useLang();
  return (
    <label id={id} tabIndex={-1} className={invalid ? "invalid-group" : ""}
           style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "var(--text)", marginTop: 14, cursor: "pointer", fontWeight: 400 }}>
      <input type="checkbox" checked={value} style={{ width: 20, height: 20, flex: "none", marginTop: 2 }}
             onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 13 }}>{employer ? t("s.consent.employer") : t("s.consent.student")}<Req /></span>
    </label>
  );
}
