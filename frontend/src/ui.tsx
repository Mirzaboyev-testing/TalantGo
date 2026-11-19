import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { absoluteUrl, fileSize, type Review, type Status, type SubmittedFile } from "./api";
import { t, useLang } from "./i18n";
import { workStatusLabel } from "./labels";
import { insideTelegram, openLink } from "./tg";

/** Up to two capital letters from a name ("Azizbek O'rinboyev" → "AO"), for avatars without a photo. */
export function initials(name: string): string {
  return name.split(/\s+/).map((w) => w.match(/\p{L}|\p{N}/u)?.[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

// soft background hues for initials avatars; the name picks one, so a person keeps the same colour everywhere
const TONES = [145, 205, 28, 265, 340, 178, 48, 228, 302, 8, 95, 248];
/** Background and text colour for a name's initials avatar (same name, same colour, in every panel). */
export function nameTone(name: string): { background: string; color: string } {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const hue = TONES[h % TONES.length];
  return { background: `hsl(${hue} 72% 91%)`, color: `hsl(${hue} 62% 27%)` };
}

export function Avatar({ name, url, className = "" }: { name: string; url?: string | null; className?: string }) {
  return url ? <img className={`avatar ${className}`} src={url} alt="" />
    : <div className={`avatar ${className}`} style={nameTone(name)} aria-hidden="true">{initials(name)}</div>;
}

export function StatusBadge({ status }: { status: Status | null }) {
  useLang();
  return <span className={`badge ${status ?? "todo"}`}>{workStatusLabel(status)}</span>;
}

let openSheets = 0;

/**
 * A modal panel: a bottom sheet on a phone, a centred card on a computer. Drawn straight into <body> (a portal),
 * so a sticky sidebar or top bar it was opened from cannot trap it under the page. Escape closes the top one,
 * and the page behind does not scroll while it is open.
 */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const back = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const sheets = document.querySelectorAll(".sheet-back");
      if (e.key === "Escape" && sheets[sheets.length - 1] === back.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    openSheets += 1;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      openSheets -= 1;
      if (openSheets === 0) document.body.style.overflow = "";
    };
  }, [onClose]);
  return createPortal(
    <div ref={back} className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
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
