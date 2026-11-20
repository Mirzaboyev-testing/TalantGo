// Small pieces shared by the student's competition, team and ranking screens (docs/13-musobaqalar.md):
// addresses, phase and mode chips, organizer line, stage progress, the next deadline, medals and copying.
import type { ReactNode } from "react";
import type { Competition, CompetitionPhase, EntryStatus, MyEntry, Organizer, StageOut, StagePhase, TeamKind } from "../../../competitionsApi";
import { formatDateTime, t, useLang, type MsgKey } from "../../../i18n";
import { Icon, type IconName } from "../../../icons";
import { BRAND } from "../../../brand";
import { CompanyMark } from "../../employer/kit";
import { initials, nameTone, toast } from "../../../ui";

export const COMP_PATH = "/talaba/topshiriqlar/musobaqalar";
export const TEAM_PATH = "/talaba/topshiriqlar/jamoa";
export const compLink = (id: number) => `${COMP_PATH}?id=${id}`;
export const teamLink = (id: number) => `${TEAM_PATH}?id=${id}`;
/** The share link of a team code: opening it shows the team and a «Qo'shilish» button. */
export const joinLink = (code: string) => `${window.location.origin}${TEAM_PATH}?kod=${encodeURIComponent(code)}`;

const DAY = 86_400_000;
/** "3 kun qoldi", "5 soat qoldi"; null once the moment has passed. */
export function timeLeft(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return null;
  if (ms < DAY) return t("cm.left.hours", { n: Math.max(1, Math.ceil(ms / 3_600_000)) });
  return t("cm.left.days", { n: Math.ceil(ms / DAY) });
}
export const isSoon = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); return ms > 0 && ms < 2 * DAY; };
export const day = (iso: string) => formatDateTime(iso, false);
/** 85 or 72.5: scores keep one decimal at most. */
export const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** «eng yaxshi X%»: the share of participants at or above this place (computed from the rank, so it reads the same everywhere). */
export const topPercent = (rank: number, of: number) => Math.max(1, Math.min(100, Math.round((100 * rank) / Math.max(1, of))));
const range = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);

/** Registration takes entries until its deadline (it may stay open after the first stage started). */
export const registrationOpen = (c: Competition) => c.status === "published" && Date.now() <= new Date(c.registration_ends_at).getTime();
export const sortedStages = (c: Competition) => [...c.stages].sort((a, b) => a.order - b.order);
export const openStage = (c: Competition): StageOut | null => sortedStages(c).find((s) => s.phase === "open") ?? null;
/** The stage under way (open or being reviewed) as a 1-based number; all closed → the last; none started → 0. */
export function stageNumber(c: Competition): number {
  const st = sortedStages(c);
  const i = st.findIndex((s) => s.phase === "open" || s.phase === "reviewing");
  if (i >= 0) return i + 1;
  return st.length > 0 && st.every((s) => s.phase === "closed") ? st.length : 0;
}

export function PhaseChip({ phase }: { phase: CompetitionPhase }) {
  useLang();
  return <span className={`cm-phase ${phase}`}><i />{t(`cm.phase.${phase}` as MsgKey)}</span>;
}

export function StagePhaseChip({ phase }: { phase: StagePhase }) {
  useLang();
  return <span className={`cm-phase s-${phase}`}><i />{t(`cm.sphase.${phase}` as MsgKey)}</span>;
}

export function ModeBadge({ c }: { c: Pick<Competition, "mode" | "team_min" | "team_max"> }) {
  useLang();
  return (
    <span className="co-pill cm-pill-soft">
      <Icon name={c.mode === "team" ? "users" : "user"} size={13} />
      {c.mode === "team" ? t("cm.mode.team", { range: range(c.team_min, c.team_max) }) : t("cm.mode.individual")}
    </span>
  );
}

export function KindBadge({ kind }: { kind: TeamKind }) {
  useLang();
  return <span className={`cm-kind ${kind}`}>{t(kind === "persistent" ? "cm.kind.persistent" : "cm.kind.one_time")}</span>;
}

export function StageProgress({ c }: { c: Competition }) {
  useLang();
  if (c.stages.length < 2) return null;
  const n = stageNumber(c);
  return (
    <span className="co-pill cm-pill-soft"><Icon name="flag" size={13} />
      {n ? t("cm.stage.progress", { n, of: c.stages.length }) : t("cm.stage.count", { n: c.stages.length })}
    </span>
  );
}

export const organizerName = (o: Organizer) => (o.kind === "platform" ? o.name || BRAND : o.name);

export function OrganizerLine({ o, size = 24 }: { o: Organizer; size?: number }) {
  useLang();
  const name = organizerName(o);
  return (
    <span className="cm-org">
      <CompanyMark name={name} url={o.logo_url} size={size} />
      <span className="ellipsis">{name}</span>
    </span>
  );
}

/** The next date that matters: the open stage of a registered student, registration closing, the start, or the end. */
export function NextDeadline({ c }: { c: Competition }) {
  useLang();
  const open = openStage(c);
  const entered = c.my_entry?.status === "registered";
  let text: string; let iso: string | null = null; let icon: IconName = "clock";
  if (open && (entered || !registrationOpen(c))) {
    iso = open.ends_at;
    const left = timeLeft(open.ends_at);
    text = left ? t("cm.next.stage", { stage: open.title, left }) : t("cm.sphase.reviewing");
  } else if (registrationOpen(c) && !entered) {
    iso = c.registration_ends_at;
    text = t("cm.next.registration", { left: timeLeft(c.registration_ends_at) ?? day(c.registration_ends_at) });
  } else if (c.phase === "upcoming" || c.phase === "registration") {
    icon = "calendar";
    text = t("cm.next.starts", { date: day(c.starts_at) });
  } else if (c.phase === "running" && sortedStages(c).some((s) => s.phase === "upcoming")) {
    const nextStage = sortedStages(c).find((s) => s.phase === "upcoming")!;
    icon = "calendar";
    text = t("cm.next.stage_starts", { stage: nextStage.title, date: day(nextStage.starts_at) });
  } else if (c.phase === "reviewing" || c.phase === "running") {
    text = t("cm.next.waiting");
  } else {
    icon = "flag";
    text = t("cm.next.finished", { date: day(c.ends_at) });
  }
  return (
    <span className={`st-deadline ${iso && isSoon(iso) ? "soon" : ""}`}>
      <Icon name={icon} size={13} />{text}
    </span>
  );
}

export function EntryBadge({ e }: { e: MyEntry }) {
  useLang();
  if (e.place) return <span className="co-pill warn"><Icon name="trophy" size={13} />{t("cm.place", { n: e.place })}</span>;
  return <span className={`cm-entry ${e.status}`}>{t(`cm.entry.${e.status}` as MsgKey)}</span>;
}

export function StatusText({ status }: { status: EntryStatus }) {
  useLang();
  return <span className={`cm-entry ${status}`}>{t(`cm.entry.${status}` as MsgKey)}</span>;
}

/** Gold, silver and bronze for the first three, a plain number after. */
export function Rank({ n }: { n: number }) {
  return <span className={`cm-rank ${n >= 1 && n <= 3 ? `m${n}` : ""}`}>{n}</span>;
}

/** A team's mark: its initials on the colour its name picks (the same team, the same colour). */
export function TeamMark({ name, big }: { name: string; big?: boolean }) {
  return <span className={`cm-team-mark ${big ? "big" : ""}`} style={nameTone(name)} aria-hidden="true">{initials(name)}</span>;
}

/** Copies text; older Telegram webviews have no clipboard API, so a hidden field and execCommand stand in. */
export async function copyText(text: string, done: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) throw new Error("copy");
    }
    toast(done);
  } catch {
    toast(t("cm.copy_failed"), "error");
  }
}

/** A row of filter chips (scope, stage, ranking kind): 40px touch targets, wraps on a phone. */
export function FilterChips<K extends string | number>({ items, value, onChange, label }: {
  items: [K, ReactNode, number?][]; value: K; onChange: (k: K) => void; label?: string;
}) {
  return (
    <div className="cm-filters" role="tablist" aria-label={label}>
      {items.map(([k, text, n]) => (
        <button key={String(k)} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {text}{n !== undefined && <span className="cm-filter-n">{n}</span>}
        </button>
      ))}
    </div>
  );
}
