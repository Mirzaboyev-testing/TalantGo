export const CONSENT_TEXT =
  "Shaxsga doir ma'lumotlarim (ism, universitet, ko'nikmalar, natijalar) TalantGo tomonidan " +
  "«Shaxsga doir ma'lumotlar to'g'risida»gi qonunga muvofiq qayta ishlanishiga roziman. " +
  "Profilim ish beruvchilarga faqat men o'zim ochiq qilganimda ko'rinadi.";

export function Consent({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row" style={{ alignItems: "flex-start", gap: 10, color: "var(--text)", marginTop: 14, cursor: "pointer" }}>
      <input type="checkbox" checked={value} style={{ width: 20, height: 20, flex: "none", marginTop: 2 }}
             onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 13 }}>{CONSENT_TEXT}</span>
    </label>
  );
}
