// Shared status and choice labels in the current language, for the student, company, mentor and
// university screens. (The admin site keeps the Uzbek constants in api.ts.)
import type { AttemptStatus, QuestionKind, Status, TestStatus, Verification } from "./api";
import { t } from "./i18n";

export const workStatusLabel = (s: Status | null | undefined) => t(`work.status.${s ?? "todo"}`);
export const verificationLabel = (v: Verification) => t(`verification.${v}`);
export const courseText = (c: number | null | undefined) => (!c ? "" : c === 7 ? t("course.master") : t("course.n", { n: c }));
export const attemptStatusLabel = (s: AttemptStatus) => t(`attempt.${s}`);
export const questionKindLabel = (k: QuestionKind) => t(`question.${k}`);
export type JobStatus = "pending" | "approved" | "rejected" | "closed";
export const jobStatusLabel = (s: JobStatus) => t(`jobstatus.${s}`);

const TEST_BADGE: Record<TestStatus, string> = { draft: "todo", pending: "pending", approved: "peer_verified", rejected: "rejected", closed: "todo" };
/** [label, badge class] like api.TEST_STATUS. */
export const testStatus = (s: TestStatus): [string, string] => [t(`test.status.${s}`), TEST_BADGE[s]];
