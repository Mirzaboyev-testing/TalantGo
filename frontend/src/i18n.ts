// Interface language: Uzbek (default), Russian, English. Texts live in locales/*.ts under stable keys;
// ru and en are typed against uz, so a missing translation is a type error, not a blank label.
// Screens written before the switch still have Uzbek text inline; they move to keys step by step.
import { useSyncExternalStore } from "react";
import { en } from "./locales/en";
import { ru } from "./locales/ru";
import { uz, type MsgKey } from "./locales/uz";

export type Lang = "uz" | "ru" | "en";
export type { MsgKey };
export const LANGS: { id: Lang; label: string }[] = [
  { id: "uz", label: "O'zbekcha" }, { id: "ru", label: "Русский" }, { id: "en", label: "English" },
];

const KEY = "tg_lang";
const DICTS: Record<Lang, Record<MsgKey, string>> = { uz, ru, en };
const isLang = (v: unknown): v is Lang => v === "uz" || v === "ru" || v === "en";

function stored(): Lang | null {
  try { const v = localStorage.getItem(KEY); return isLang(v) ? v : null; } catch { return null; }
}

let current: Lang = stored() ?? "uz";
const listeners = new Set<() => void>();

export function getLang(): Lang { return current; }
/** True when the person picked a language on this device (it then wins over the profile setting). */
export function hasChosenLang(): boolean { return stored() !== null; }

export function setLang(lang: Lang, remember = true): void {
  if (!isLang(lang) || lang === current) return;
  current = lang;
  if (remember) { try { localStorage.setItem(KEY, lang); } catch { /* storage blocked */ } }
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

/** Re-renders the caller when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}

/** The text for `key` in the current language; {name} placeholders are filled from `params`. */
export function t(key: MsgKey, params?: Record<string, string | number>): string {
  const text = DICTS[current][key] ?? uz[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m)) : text;
}

/** Looks a key up only if it exists (for keys built from data, e.g. a status name). */
export function tMaybe(key: string, params?: Record<string, string | number>): string | null {
  return key in uz ? t(key as MsgKey, params) : null;
}

/** 02.11.2026 10:30 in Tashkent time: digits read the same in every language. */
export function formatDateTime(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("day")}.${get("month")}.${get("year")}`;
  return withTime ? `${date} ${get("hour")}:${get("minute")}` : date;
}

document.documentElement.lang = current;
