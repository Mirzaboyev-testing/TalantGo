import { Req } from "../form";

// v2 (2026-10-13): approved employers see every student's name, study details, results and CV.
export const CONSENT_TEXT =
  "Shaxsga doir ma'lumotlarim (ism-familiya, universitet, yo'nalish, kurs, guruh, ko'nikmalar, natijalar va CV) " +
  "TalantGo tomonidan «Shaxsga doir ma'lumotlar to'g'risida»gi qonunga muvofiq qayta ishlanishiga va TalantGo " +
  "tekshirgan ish beruvchilarga ko'rsatilishiga roziman. Telefon raqamim faqat men ariza bersam yoki bog'lanishga rozi bo'lsam ochiladi.";

export const EMPLOYER_CONSENT_TEXT =
  "Mening va kompaniyamning ma'lumotlari TalantGo tomonidan qayta ishlanishiga roziman. Talabalar haqidagi " +
  "ma'lumotlardan faqat ishga va amaliyotga olish uchun foydalanaman, ularni uchinchi shaxslarga bermayman.";

export function Consent({ value, onChange, employer = false, id = "f-consent", invalid = false }: {
  value: boolean; onChange: (v: boolean) => void; employer?: boolean; id?: string; invalid?: boolean;
}) {
  return (
    <label id={id} tabIndex={-1} className={invalid ? "invalid-group" : ""}
           style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "var(--text)", marginTop: 14, cursor: "pointer", fontWeight: 400 }}>
      <input type="checkbox" checked={value} style={{ width: 20, height: 20, flex: "none", marginTop: 2 }}
             onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 13 }}>{employer ? EMPLOYER_CONSENT_TEXT : CONSENT_TEXT}<Req /></span>
    </label>
  );
}
