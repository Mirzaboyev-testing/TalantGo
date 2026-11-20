// Small pieces shared by the organizer's competition screens (CompetitionManager, the form, the detail page):
// labels for status / phase / mode, Tashkent-time conversions for <input type="datetime-local">, the stage bar.
import type { Competition, CompetitionPhase, CompetitionStatus, StageOut, StagePhase } from "../../competitionsApi";
import { formatDateTime, t, tMaybe, useLang } from "../../i18n";

export type OrgKind = "company" | "university" | "admin";

export const STATUS_BADGE: Record<CompetitionStatus, string> = {
  draft: "todo", published: "peer_verified", results: "mentor_verified", archived: "rejected",
};
export const statusLabel = (s: CompetitionStatus) => t(`corg.status.${s}`);
export const phaseLabel = (p: CompetitionPhase) => t(`corg.phase.${p}`);
export const stagePhaseLabel = (p: StagePhase) => t(`corg.stage_phase.${p}`);

/** The list filters: a published competition stays «Faol» until its results are announced. */
export type ListFilter = "active" | "draft" | "finished" | "archived";
export const filterOf = (c: Competition): ListFilter =>
  c.status === "draft" ? "draft" : c.status === "archived" ? "archived" : c.status === "results" ? "finished" : "active";

export function modeLabel(c: Pick<Competition, "mode" | "team_min" | "team_max">): string {
  if (c.mode === "individual") return t("corg.mode.individual");
  return c.team_min === c.team_max ? t("corg.mode.team_one", { n: c.team_max }) : t("corg.mode.team_n", { min: c.team_min, max: c.team_max });
}

export function audienceText(c: Competition, universityName?: string | null): string {
  if (c.audience === "fields") return c.job_fields.map((k) => tMaybe(`field.${k}`) ?? k).join(", ") || t("corg.aud.fields");
  if (c.audience === "university") return universityName || t("corg.aud.university");
  return t("corg.aud.all");
}

export const sortedStages = (c: Pick<Competition, "stages">): StageOut[] => [...c.stages].sort((a, b) => a.order - b.order);
export const stagesClosed = (c: Pick<Competition, "stages">) => c.stages.filter((s) => s.phase === "closed").length;
/** Every stage is closed: the organizer may announce the results. */
export const readyForResults = (c: Competition) => c.status === "published" && c.stages.length > 0 && c.stages.every((s) => s.phase === "closed");

/** The stage that needs the organizer now: the one being scored, else the open one, else the next, else the last. */
export function currentStage(c: Pick<Competition, "stages">): StageOut | undefined {
  const st = sortedStages(c);
  return st.find((s) => s.phase === "reviewing") ?? st.find((s) => s.phase === "open") ?? st.find((s) => s.phase === "upcoming") ?? st[st.length - 1];
}

// ---- dates: the form works in Tashkent time (+05:00, no daylight saving), like the rest of the panels
const TZ_MS = 5 * 3_600_000;
/** ISO time → "YYYY-MM-DDTHH:mm" for a datetime-local input, in Tashkent time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() + TZ_MS).toISOString().slice(0, 16);
}
/** Milliseconds of a datetime-local value read as Tashkent time (NaN when empty). */
export const localMs = (v: string) => (v ? new Date(`${v}:00+05:00`).getTime() : NaN);
export const fromLocalInput = (v: string) => new Date(localMs(v)).toISOString();
/** A datetime-local value `days` from now at `hour`:00 Tashkent time. */
export function localInDays(days: number, hour = 18): string {
  const d = new Date(Date.now() + TZ_MS + days * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}
/** A datetime-local value moved by whole days. */
export function localPlusDays(v: string, days: number): string {
  const ms = localMs(v);
  return Number.isNaN(ms) ? "" : toLocalInput(new Date(ms + days * 86_400_000).toISOString());
}

export const stageDates = (s: Pick<StageOut, "starts_at" | "ends_at">) => `${formatDateTime(s.starts_at)} – ${formatDateTime(s.ends_at)}`;

/** One segment per stage, coloured by its phase, with the stage that matters now named under it. */
export function StageBar({ c }: { c: Competition }) {
  useLang();
  const stages = sortedStages(c);
  if (stages.length === 0) return null;
  const now = currentStage(c);
  return (
    <div className="corg-stagebar">
      <div className="corg-stagebar-track" aria-hidden="true">
        {stages.map((s) => <span key={s.id} className={`sp-${s.phase}`} />)}
      </div>
      <div className="corg-stagebar-label">
        <span>{t("corg.card.stages", { done: stagesClosed(c), n: stages.length })}</span>
        {now && c.status === "published" && now.phase !== "closed" && (
          <span className="ellipsis">{now.order}. {now.title} · {stagePhaseLabel(now.phase)}</span>
        )}
      </div>
    </div>
  );
}

/** A team's mark: its first letters on the colour its name picks. */
export function TeamMark({ name, className = "" }: { name: string; className?: string }) {
  const letters = name.split(/\s+/).map((w) => w.match(/\p{L}|\p{N}/u)?.[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const hue = [145, 205, 28, 265, 340, 178, 48, 228][h % 8];
  return <span className={`corg-team-mark ${className}`} style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 26%)` }} aria-hidden="true">{letters}</span>;
}
