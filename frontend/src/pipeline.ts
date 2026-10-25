// The application pipeline as the screens show it. EMPLOYER_MOVES mirrors
// backend/app/services/applications.py; the server enforces it, the UI only offers the allowed buttons.
import { t, tMaybe } from "./i18n";

export const EMPLOYER_MOVES: Record<string, string[]> = {
  new: ["shortlisted", "interview", "offer", "hired", "rejected"],
  viewed: ["shortlisted", "interview", "offer", "hired", "rejected"],
  shortlisted: ["interview", "offer", "hired", "rejected"],
  interview: ["interview", "offer", "hired", "rejected"],
  offer: ["hired", "rejected"],
  rejected: ["shortlisted"],
  hired: [],
  withdrawn: [],
};

/** States a student can still withdraw from. */
export const ACTIVE_STATES = ["new", "viewed", "shortlisted", "interview", "offer"];

export function statusLabel(status: string): string {
  return tMaybe(`app.status.${status}`) ?? status;
}

/** The badge colour class used across the app (green = moving forward, red = closed). */
export function statusBadge(status: string): string {
  if (["shortlisted", "interview", "offer", "hired"].includes(status)) return "peer_verified";
  if (status === "rejected" || status === "withdrawn") return "rejected";
  return "pending";
}

export function actionLabel(from: string, to: string): string {
  if (from === "rejected" && to === "shortlisted") return t("app.action.reconsider");
  if (from === "interview" && to === "interview") return t("app.action.reschedule");
  return tMaybe(`app.action.${to}`) ?? to;
}
