// The platform's name and logo in one place (Careerup since 2026-11-17, before that TalantGo).
// The mark and icon files live in public/brand (SVG, drawn from the brand board) and public/ (PNG icons).

export const BRAND = "Careerup";
export const AI_NAME = "Careerup AI";

/** The mark alone: the green "C" with the rising arrow. `light` is the version for dark backgrounds. */
export function BrandMark({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return <img className="brand-logo-mark" src={light ? "/brand/careerup-mark-light.svg" : "/brand/careerup-mark.svg"}
              width={size} height={size} alt="" aria-hidden="true" />;
}

/** Mark plus the word "Careerup" ("up" in green), as on the brand board. */
export function BrandLogo({ size = 32, light = false, suffix }: { size?: number; light?: boolean; suffix?: string }) {
  return (
    <span className={`brand-logo ${light ? "light" : ""}`} style={{ fontSize: Math.round(size * 0.66) }} aria-label={BRAND}>
      <BrandMark size={size} light={light} />
      <span className="brand-word" aria-hidden="true">Career<span>up</span></span>
      {suffix && <span className="brand-suffix">{suffix}</span>}
    </span>
  );
}
