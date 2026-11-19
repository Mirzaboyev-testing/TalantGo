// The faculty field after a university is picked, the same way in the sign-up and the profile (2026-11-19):
// a searchable list for a long catalogue, a select with «Boshqa» for a short one, free text when there is no list
// or the student's faculty is not on it.
import { useState } from "react";
import { t, useLang } from "../../i18n";
import Combo from "./Combo";

const OTHER = "__other__";

export default function FacultyPicker({ id, faculties, value, onChange, disabled, invalid, inputClass = "" }: {
  id: string; faculties: string[]; value: string; onChange: (v: string) => void;
  disabled?: boolean; invalid?: boolean; inputClass?: string;
}) {
  useLang();
  const [other, setOther] = useState(false);
  if (disabled) return <input id={id} disabled placeholder={t("st.su.faculty_first")} />;

  // a faculty saved earlier that is not on a short list stays as typed text
  const typed = other || faculties.length === 0 || (Boolean(value) && !faculties.includes(value) && faculties.length <= 12);
  if (!typed && faculties.length > 12) {
    return (
      <Combo id={id} items={faculties.map((x) => ({ value: x, label: x }))} value={faculties.includes(value) ? value : ""}
             customValue={faculties.includes(value) ? "" : value} limit={20} invalid={invalid}
             placeholder={t("st.su.faculty_search")} customLabel={(q) => t("st.su.faculty_add", { name: q })}
             onChange={(v) => onChange(v)} />
    );
  }
  if (!typed) {
    return (
      <select id={id} className={inputClass} value={value}
              onChange={(e) => { if (e.target.value === OTHER) { setOther(true); onChange(""); } else onChange(e.target.value); }}>
        <option value="">{t("task.f.choose")}</option>
        {faculties.map((x) => <option key={x} value={x}>{x}</option>)}
        <option value={OTHER}>{t("st.su.faculty_other")}</option>
      </select>
    );
  }
  return (
    <>
      <input id={id} className={inputClass} value={value} maxLength={120} autoFocus={other}
             placeholder={t("s.onb.faculty_ph")} onChange={(e) => onChange(e.target.value)} />
      {other && faculties.length > 0 && (
        <button type="button" className="link-btn" style={{ marginTop: 6 }} onClick={() => { setOther(false); onChange(""); }}>
          {t("st.su.faculty_back")}
        </button>
      )}
    </>
  );
}
