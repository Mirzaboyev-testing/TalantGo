import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { absoluteUrl, fileSize, type Review, type Status, type SubmittedFile } from "./api";
import { t, useLang } from "./i18n";
import { workStatusLabel } from "./labels";
import { insideTelegram, openLink } from "./tg";

export function Avatar({ name, url }: { name: string; url?: string | null }) {
  return url ? <img className="avatar" src={url} alt="" /> : <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>;
}

export function StatusBadge({ status }: { status: Status | null }) {
  useLang();
  return <span className={`badge ${status ?? "todo"}`}>{workStatusLabel(status)}</span>;
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

export function FileList({ files }: { files: SubmittedFile[] }) {
  useLang();
  if (!files.length) return null;
  return (
    <div className="files">
      {files.map((f) => (
        <button key={f.id} type="button" className="file-chip" onClick={() => openLink(absoluteUrl(f.url))}>
          <span className="file-ext">{(f.name.split(".").pop() ?? "").slice(0, 4).toUpperCase() || t("s.ui.file")}</span>
          <span className="file-name">{f.name}</span>
          <span className="hint">{fileSize(f.size)}</span>
        </button>
      ))}
    </div>
  );
}

const reviewerKind = (kind: Review["kind"]) => (kind === "mentor" ? t("s.common.mentor_suffix") : "");

export function ReviewList({ reviews }: { reviews: Review[] }) {
  useLang();
  return (
    <>
      {reviews.map((r, i) => (
        <div key={i} className={`review ${r.approved ? "yes" : "no"}`}>
          <div className="hint">{r.reviewer_name}{reviewerKind(r.kind)} · {r.approved ? t("s.ui.approved") : t("s.ui.returned")}</div>
          <div>{r.comment}</div>
        </div>
      ))}
    </>
  );
}

export const message = (e: unknown) => (e instanceof Error ? e.message : t("s.ui.unexpected_error"));

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

/** Enter sends on a computer. On a phone the keyboard's Enter key starts a new line and only the send button sends. */
export function sendsOnEnter(e: KeyboardEvent): boolean {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return false;
  return !window.matchMedia("(pointer: coarse)").matches;
}

/** Lets a one-line message box grow with its text, up to the height set in CSS. */
export function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Name and surname: at least two words of two or more letters. Mirrors the server's rule. */
export const isFullName = (name: string) => name.split(/\s+/).filter((w) => w.length >= 2).length >= 2;

/** Brings a form field into view and puts the cursor in it (used to lead the person to what is missing). */
export function focusField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  // an instant jump: smooth scrolling silently does nothing in some Telegram webviews
  el.scrollIntoView({ block: "center" });
  el.focus({ preventScroll: true });
}

/** A small "Chiqish" button for the website (inside Telegram there is nothing to sign out of). */
export function LogoutLink({ onLogout }: { onLogout?: () => void }) {
  useLang();
  if (insideTelegram || !onLogout) return null;
  return <div style={{ textAlign: "right" }}><button className="btn small ghost" onClick={onLogout}>{t("shell.logout")}</button></div>;
}
