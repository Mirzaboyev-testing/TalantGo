import { useEffect, useState, type ReactNode } from "react";
import { STATUS_LABEL, type Status } from "./api";

export function Avatar({ name, url }: { name: string; url?: string | null }) {
  return url ? <img className="avatar" src={url} alt="" /> : <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>;
}

export function StatusBadge({ status }: { status: Status | null }) {
  return <span className={`badge ${status ?? "todo"}`}>{status ? STATUS_LABEL[status] : "Bajarilmagan"}</span>;
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function ErrorText({ error }: { error: string }) {
  return error ? <div className="error">{error}</div> : null;
}

export const message = (e: unknown) => (e instanceof Error ? e.message : "Kutilmagan xato");

/** A short confirmation at the bottom of the screen ("Ma'lumotlar saqlandi"). Call from anywhere. */
export function toast(text: string, kind: "ok" | "error" = "ok"): void {
  window.dispatchEvent(new CustomEvent("cf-toast", { detail: { text, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string; kind: string }[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const { text, kind } = (e as CustomEvent<{ text: string; kind: string }>).detail;
      const id = Date.now() + Math.random();
      setItems((cur) => [...cur.slice(-2), { id, text, kind }]);
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 3200);
    };
    window.addEventListener("cf-toast", onToast);
    return () => window.removeEventListener("cf-toast", onToast);
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
