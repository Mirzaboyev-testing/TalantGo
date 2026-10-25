// Job and company labels in the current language (the older JOB_KIND / salary() in api.ts stay Uzbek-only).
import type { JobKind, WorkMode } from "./api";
import { formatDateTime, t, tMaybe } from "./i18n";

export const kindLabel = (k: JobKind) => t(`job.kind.${k}`);
export const modeLabel = (m: WorkMode) => t(`job.mode.${m}`);
export const industryLabel = (key: string) => (key ? tMaybe(`industry.${key}`) ?? key : "");

type Pay = { is_paid: boolean; salary_from: number | null; salary_to: number | null };
const mln = (n: number) => (n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 });

export function salaryText(job: Pay): string {
  if (!job.is_paid) return t("job.salary.unpaid");
  if (job.salary_from && job.salary_to) return t("job.salary.range", { from: mln(job.salary_from), to: mln(job.salary_to) });
  if (job.salary_from) return t("job.salary.from", { from: mln(job.salary_from) });
  if (job.salary_to) return t("job.salary.to", { to: mln(job.salary_to) });
  return t("job.salary.negotiable");
}

/** "Today", "Yesterday" or the date, in Tashkent time. */
export function dayLabel(iso: string): string {
  const day = (d: Date) => formatDateTime(d.toISOString(), false);
  const now = new Date();
  if (day(new Date(iso)) === day(now)) return t("job.today");
  if (day(new Date(iso)) === day(new Date(now.getTime() - 86_400_000))) return t("job.yesterday");
  return formatDateTime(iso, false);
}
