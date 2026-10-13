import { useCallback, useState, type ReactNode } from "react";
import { focusField, toast } from "./ui";

/** The red star after the label of a required field. */
export function Req() {
  return <span className="req" aria-label="majburiy">*</span>;
}

/** A labelled form field: red star when required, red message under it when it was left empty. */
export function Field({ id, label, required, error, hint, children }: {
  id: string; label: string; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <Req />}</label>
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="hint" style={{ marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

/** [element id, is it filled, what to tell the person]. */
export type Check = [string, boolean, string];

/**
 * Errors for required fields. `check` marks every empty one red, takes the person to the first
 * (scrolls it into view and puts the cursor there) and returns false; a field's mark clears as they type.
 */
export function useRequired() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const check = useCallback((checks: Check[]): boolean => {
    const next: Record<string, string> = {};
    for (const [id, ok, msg] of checks) if (!ok) next[id] = msg;
    setErrors(next);
    const first = checks.find((c) => !c[1]);
    if (!first) return true;
    toast(`To'ldirilmagan: ${first[2]}`, "error");
    setTimeout(() => focusField(first[0]), 30);        // after the red marks render
    return false;
  }, []);
  const clear = useCallback((id: string) => setErrors((cur) => {
    if (!(id in cur)) return cur;
    const next = { ...cur };
    delete next[id];
    return next;
  }), []);
  const cls = (id: string, base = "") => `${base} ${errors[id] ? "invalid" : ""}`.trim();
  const groupCls = (id: string, base = "") => `${base} ${errors[id] ? "invalid-group" : ""}`.trim();
  return { errors, check, clear, cls, groupCls };
}
