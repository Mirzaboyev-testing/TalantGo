import type { ReactNode } from "react";
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
