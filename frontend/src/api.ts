// Typed API client. Tokens are kept in memory: every Telegram launch signs in again with fresh initData.

export type Role = "student" | "mentor" | "admin";
export type Status = "pending" | "peer_verified" | "mentor_verified" | "rejected";

export interface Track { id: number; slug: string; title: string; icon: string; description: string }
export interface Review { reviewer_name: string; kind: "peer" | "mentor" | "ai"; approved: boolean; comment: string; created_at: string }
export interface SubmittedFile { id: number; name: string; size: number; mime: string; url: string }
export type AiState = "" | "checking" | "done" | "unsure" | "failed";
export interface Submission {
  id: number; task_id: number; proof_url: string; note: string; status: Status; round: number;
  points_awarded: number; created_at: string; verified_at: string | null; reviews: Review[];
  files: SubmittedFile[]; ai_state: AiState; ai_note: string;
}
export interface Task {
  id: number; track_id: number; week: number; title: string; description: string; proof_hint: string;
  points: number; kind: "submission" | "profile"; mentor: string | null; submission: Submission | null;
  criteria: string; questions: number;
}
export interface TaskQuestion {
  id: number; task_id: number; task_title: string; track: string; text: string; author: string; is_mine: boolean;
  answer: string; answered_by: string | null; created_at: string; answered_at: string | null;
}
export interface AiStatus { enabled: boolean; assistant: boolean; model: string; configured: boolean; hint: string | null; models: string[] }
export interface AiMessage { id: number; role: "user" | "model"; text: string; created_at: string }
export interface AiConversation { user_id: number; full_name: string; username: string | null; role: Role; track: string | null; questions: number; last_at: string; account_type?: AccountType; company?: string | null }
export interface Me {
  id: number; full_name: string; username: string | null; photo_url: string | null; role: Role;
  track: Track | null; university: string; group_name: string; bio: string; goals: string[];
  github_url: string; linkedin_url: string; points: number; streak: number; rank_overall: number;
  cv_slug: string; cv_public: boolean; is_owner: boolean;
  account_type: AccountType; has_consent: boolean; university_ref: University | null; faculty: string;
  course: number | null; graduation_year: number | null; gpa: number | null; gpa_scale: number;
  student_number: string; skills: string[]; languages: string[]; job_types: JobKind[]; city: string;
  open_to_work: boolean; verification: Verification; verified_by: string; verification_note: string;
  company: Company | null; staff_university: University | null; staff_status: string; staff_position: string;
  phone: string; phone_verified: boolean; show_phone: boolean; invite_code: string; invited_count: number; headline: string;
  completeness: { percent: number; missing: string[] };
  consent_current: boolean; work_industries: string[]; job_title: string; signup_missing: string[];
  email: string | null; has_password: boolean; has_telegram: boolean;
  language: "uz" | "ru" | "en"; visible_to_employers: boolean;
}
export interface BotLink { code: string; url: string; expires_in: number }
export type BotLoginStatus = { status: "pending" | "claimed" | "awaiting_pin" | "rejected" | "conflict" | "used" | "expired"; note?: string };
export type AccountType = "student" | "employer" | "university";
export type Verification = "none" | "pending" | "verified" | "rejected";
export type JobKind = "internship" | "part_time" | "junior" | "project";
export type WorkMode = "office" | "remote" | "hybrid";
export interface University { id: number; name: string; short_name: string; city: string }
export interface Company {
  id: number; name: string; stir: string | null; industry: string; website: string; city: string;
  description: string; status: "pending" | "approved" | "rejected"; review_note: string; created_at: string;
  legal_form: string; size: string; telegram: string; address: string; email: string;
}
export type CompanyInput = Omit<Company, "id" | "status" | "review_note" | "created_at" | "stir"> & { stir: string };
export interface Catalog {
  industries: Record<string, string>; legal_forms: Record<string, string>; company_sizes: Record<string, string>; regions: string[];
}
export interface StudentRow extends TalentCard {
  full_name: string; username: string | null; photo_url: string | null; group_name: string; bio: string;
  work_industries: string[]; open_to_work: boolean; github_url: string; linkedin_url: string;
  rank: number; tests_taken: number; test_percent: number | null;
}
export interface CvData {
  full_name: string; headline: string; university: string; faculty: string; course: number | null; bio: string;
  skills: string[]; languages: string[]; track: string | null; github_url: string; linkedin_url: string;
  stats: { points: number; streak: number; verified_tasks: number; mentor_verified: number; rank_overall: number; rank_in_track: number | null };
  achievements: { task: string; track: string; level_label: string; points: number; proof_url: string; mentor_comment: string | null;
                  verified_by: { name: string; kind: string }[] }[];
  challenges: { title: string; place: number | null; score: number | null }[];
}
export interface StudentDetail extends StudentRow {
  cv: CvData; phone: string | null; contact_status: string | null; applied: boolean;
  tests: { attempt_id: number; test_id: number; title: string; status: AttemptStatus; score: number; max_score: number; submitted_at: string | null }[];
}
export type QuestionKind = "single" | "multi" | "text";
export type TestStatus = "draft" | "pending" | "approved" | "rejected" | "closed";
export type AttemptStatus = "in_progress" | "submitted" | "graded";
export interface TestQuestion { id: number; kind: QuestionKind; text: string; options: string[]; points: number; correct?: number[] }
export interface QuestionInput { kind: QuestionKind; text: string; options: string[]; correct: number[]; points: number }
export interface CompanyTestSummary {
  id: number; title: string; description: string; status: TestStatus; review_note: string; audience: "all" | "tracks" | "applicants";
  track_ids: number[]; job_id: number | null; job_title: string | null; deadline: string | null; time_limit_min: number | null;
  questions_count: number; max_score: number; is_survey: boolean; company: string; company_industry: string;
  attempts: number; to_grade: number; created_at: string; updated_at: string;
}
export interface CompanyTestFull extends CompanyTestSummary { questions: TestQuestion[] }
export interface TestInput {
  title: string; description: string; job_id: number | null; audience: "all" | "tracks" | "applicants"; track_ids: number[];
  deadline: string | null; time_limit_min: number | null; questions: QuestionInput[]; submit: boolean;
}
export interface StudentBrief {
  id: number; full_name: string; username: string | null; photo_url: string | null; university: string | null;
  faculty: string; course: number | null; group_name: string; track: string | null; points: number;
}
export interface TestResultRow {
  attempt_id: number; place: number; student: StudentBrief; status: AttemptStatus; score: number; max_score: number;
  percent: number | null; late: boolean; submitted_at: string | null;
}
export interface AttemptItem {
  question: TestQuestion; scored: boolean; choice: number[]; text: string; points: number | null; comment: string;
}
export interface AttemptDetail {
  id: number; test_id: number; title: string; status: AttemptStatus; score: number; max_score: number; late: boolean;
  feedback: string; started_at: string; submitted_at: string | null; graded_at: string | null; items: AttemptItem[];
  student?: StudentBrief;
}
export interface StudentTestCard {
  id: number; title: string; description: string; status: TestStatus; audience: string; job_id: number | null; job_title: string | null;
  deadline: string | null; time_limit_min: number | null; questions_count: number; max_score: number; is_survey: boolean;
  company: string; company_industry: string; open: boolean;
  my_attempt: { id: number; status: AttemptStatus; score: number; max_score: number; submitted_at: string | null } | null;
}
export interface StartedTest extends StudentTestCard { attempt_id: number; started_at: string; ends_at: string | null; questions: TestQuestion[] }
export interface Job {
  id: number; company_id: number; company_name: string; company_industry: string; title: string; kind: JobKind;
  work_mode: WorkMode; city: string; is_paid: boolean; salary_from: number | null; salary_to: number | null;
  hours_per_week: number | null; description: string; requirements: string; skills: string[]; track_ids: number[];
  counts_as_practice: boolean; deadline: string | null; status: string; review_note: string; views: number;
  created_at: string; applied: boolean; application_status: string | null; match: number; applications: number; saved?: boolean;
}
export type JobInput = Pick<Job, "title" | "kind" | "work_mode" | "city" | "is_paid" | "salary_from" | "salary_to" |
  "hours_per_week" | "description" | "requirements" | "skills" | "track_ids" | "counts_as_practice" | "deadline"> & { rules_accepted: boolean };
export interface MyApplication {
  id: number; status: string; note: string; created_at: string; updated_at: string; job: Job;
  interview_at: string | null; interview_place: string; history: { status: string; at: string }[];
}
export interface PublicJob {
  id: number; title: string; kind: JobKind; work_mode: WorkMode; city: string; is_paid: boolean;
  salary_from: number | null; salary_to: number | null; hours_per_week: number | null; description: string;
  requirements: string; skills: string[]; counts_as_practice: boolean; deadline: string | null; created_at: string;
  company_id: number; company_name: string; company_industry: string; company_city: string;
}
export interface PublicCompany {
  id: number; name: string; industry: string; city: string; size: string; website: string; description: string;
  open_jobs: number; verified: boolean;
}
export interface PublicStats { jobs: number; companies: number; students: number; universities: number }
export interface StudentDashboard {
  applications: Record<string, number>; active_applications: number;
  interviews: { application_id: number; job: string; company: string; at: string | null; place: string }[];
  recent: { id: number; job: string; company: string; status: string; updated_at: string }[];
  recommended: Job[]; saved: number; open_jobs: number;
}
export interface EmployerDashboard {
  days: number; jobs: Record<"approved" | "pending" | "rejected" | "closed", number>;
  pipeline: Record<string, number>; applications_total: number; received: number; hired: number;
  interviews: { application_id: number; student: string; job: string; at: string | null; place: string }[];
  recent: { application_id: number; student: string; job: string; status: string; created_at: string }[];
}
export interface CandidateRow extends Applicant { job_id: number; job_title: string; match: number }
export type OutcomeKind = "full_time" | "part_time" | "internship" | "dual_education";
export interface UniversityStats {
  min_sample: number; students: number; with_graduation_year: number; placed: number; employed: number; interned: number;
  placement_rate: number | null; employed_rate: number | null; intern_rate: number | null;
  where: Record<OutcomeKind | "seeking" | "unknown", number>; self_reported: number; hires_on_platform: number;
  top_employers: { name: string; count: number }[]; partners: number; cohorts: number[]; faculties: string[];
}
export interface UniversityOutcome {
  id: number; student_id: number; student: string; faculty: string; graduation_year: number | null; company: string;
  position: string; kind: OutcomeKind; started_on: string | null; source: "application" | "self"; confirmed: boolean;
  confirmed_by: string; created_at: string;
}
export interface PartnershipRow {
  id: number; company_id: number; company: string; industry: string; university_id: number; university: string;
  university_short: string; status: "pending" | "accepted" | "rejected"; initiated_by: "company" | "university";
  message: string; created_at: string; decided_at: string | null;
}
export interface UniversityProfile {
  id: number; name: string; short_name: string; city: string; region: string; description: string; website: string;
  students: number; placed: number | null; employed: number | null; interned: number | null; placement_rate: number | null; min_sample: number;
  top_employers: { name: string; count: number }[]; hires_on_platform: number;
  partners: { id: number; name: string }[]; tracks: { title: string; count: number }[];
}
export interface PublicUniversity { id: number; name: string; short_name: string; city: string; region: string; students: number; partners: number }
export interface MyOutcome { id: number; company: string; position: string; kind: OutcomeKind; started_on: string | null; source: string; confirmed: boolean; confirmed_by: string }
export interface Opportunity extends Job { partner: boolean; recommended: boolean; our_applicants: number }
export type AdminRole = "owner" | "admin" | "moderator" | "analyst";
export interface RankingRow {
  university_id: number; name: string; short_name: string; city: string; students: number; employed: number | null;
  interned: number | null; score: number | null; rank: number | null; confirmed_only_by_university?: number | null;
}
export interface RankingMethod { internship_weight: number; min_sample: number; formula: string }
export interface RankingSnapshot { id: number; period: string; config: { internship_weight: number; min_sample: number }; published_by: string; published_at: string; rows?: RankingRow[] }
export interface AdminComplaint {
  id: number; target_kind: "job" | "company" | "task" | "user"; target_id: number; target: string; reason: string; text: string;
  status: "open" | "resolved" | "dismissed"; admin_note: string; reporter: string | null; created_at: string; resolved_at: string | null;
}
export interface AdminOutcome {
  id: number; student: string; university: string | null; company: string; position: string; kind: OutcomeKind; source: string;
  confirmed: boolean; confirmed_by: string; created_at: string;
}
export interface CompanyActivity { applications: number; answer_rate: number | null; hires: number; tasks: number; min_applications: number }
export interface AppNotification {
  id: number; kind: string; text: string; link: string; params: Record<string, string | number | boolean | null>;
  created_at: string; read: boolean;
}
export interface TalentCard {
  id: number; code: string; headline: string; university: string | null; university_name: string | null; faculty: string;
  course: number | null; graduation_year: number | null; gpa: number | null; gpa_scale: number; track: string | null;
  track_icon: string; skills: string[]; languages: string[]; job_types: string[]; city: string; points: number;
  verified_tasks: number; verification: Verification; verified_by: string; contact_status?: string | null;
}
export interface Identity { full_name: string; username: string | null; photo_url: string | null; cv_url: string | null; github_url: string; linkedin_url: string; phone?: string | null }
export interface Applicant {
  id: number; status: string; note: string; employer_note: string; created_at: string; updated_at: string | null;
  interview_at: string | null; interview_place: string; card: TalentCard; identity: Identity;
}
export interface EmployerContact { id: number; status: string; message: string; created_at: string; job_title: string | null; card: TalentCard; identity: Identity | null }
export interface StudentContact { id: number; company: string; industry: string; message: string; job_title: string | null; status: string; created_at: string }
export interface QueueItem {
  submission_id: number; status: Status; task_title: string; track_title: string; proof_hint: string;
  proof_url: string; note: string; author_name: string; peer_reviews: number; submitted_at: string;
  criteria: string; files: SubmittedFile[];
}
export interface Peer {
  id: number; full_name: string; username: string | null; photo_url: string | null; track_title: string | null;
  track_icon: string; university: string | null; faculty: string; course: number | null; phone: string | null;
  group_name: string; goals: string[]; points: number; streak: number; verified_tasks: number;
}
export interface LeaderRow {
  rank: number; id: number; full_name: string; group_name: string; university: string | null; course: number | null;
  track_icon: string; points: number; is_me: boolean;
}
export interface Leaderboard { rows: LeaderRow[]; my_rank: number }
export interface BotStatus {
  configured: boolean; hint: string | null; public_url: string; username: string | null; previous_username: string | null;
}
export interface AdminUser {
  id: number; full_name: string; username: string | null; role: Role; is_owner: boolean; is_blocked: boolean;
  track_id: number | null; university: string; group_name: string; points: number; verified_tasks: number;
  verification: Verification;
  last_seen_at: string | null; created_at: string;
  account_type: AccountType; email: string | null; has_telegram: boolean;
}
export interface AdminSubmission {
  id: number; status: Status; round: number; points_awarded: number; proof_url: string; note: string;
  task_title: string; track_title: string; author_id: number; author_name: string; reviews: Review[]; updated_at: string;
  files: SubmittedFile[]; ai_note: string;
}
export interface AdminTrack extends Track { sort_order: number; is_active: boolean; student_count: number; task_count: number }
export interface AdminTask { id: number; track_id: number; week: number; sort_order: number; title: string; description: string; proof_hint: string; points: number; is_active: boolean }
export interface Announcement { id: number; text: string; audience: string; created_by: string; total: number; sent: number; failed: number; created_at: string; finished_at: string | null }
export interface AuditEntry { id: number; actor: string; action: string; target: string; details: string; created_at: string }
export interface Rules { peer_approvals_required: number; review_points: number; mentor_bonus_percent: number }
export interface AdminStats {
  users: number; with_track: number; seen_7d: number; active_7d: number; mentors: number; blocked: number;
  submissions: Record<Status, number>;
  per_track: { icon: string; title: string; students: number }[];
  top: { name: string; group: string; points: number }[];
  top_inviters: { name: string; count: number }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let userToken = "";
let adminToken = "";
let onAdminUnauthorized: () => void = () => {};
let onUserUnauthorized: () => void = () => {};
/** The website returns to the sign-in screen when a user session has run out. */
export const setUserUnauthorizedHandler = (fn: () => void) => { onUserUnauthorized = fn; };
export const setAdminUnauthorizedHandler = (fn: () => void) => { onAdminUnauthorized = fn; };
export const setUserToken = (t: string) => { userToken = t; };
export const setAdminToken = (t: string) => { adminToken = t; };

// Field names the server reports, in the words the forms use.
const FIELD: Record<string, string> = {
  email: "email", phone: "telefon", hours_per_week: "soat/hafta", time_limit_min: "vaqt chegarasi", salary_from: "maosh",
  salary_to: "maosh", stir: "STIR", website: "sayt", pin: "kod", password: "parol", full_name: "ism va familiya",
  description: "tavsif", title: "nomi", points: "ball", gpa: "GPA", graduation_year: "bitirish yili",
};

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; type?: string; loc?: (string | number)[]; ctx?: Record<string, unknown> };
    const key = String(first.loc?.[first.loc.length - 1] ?? "");
    const field = FIELD[key] ?? "maydon";
    // the server's own Uzbek messages come as "Value error, ..."; the generic ones are translated here
    if (first.msg?.startsWith("Value error, ")) return first.msg.replace(/^Value error, /, "");
    switch (first.type) {
      case "string_pattern_mismatch": return `${field}: format noto'g'ri`;
      case "string_too_short": return `${field}: kamida ${first.ctx?.min_length ?? ""} belgi kerak`;
      case "string_too_long": return `${field}: juda uzun`;
      case "greater_than_equal": case "greater_than": return `${field}: qiymat juda kichik`;
      case "less_than_equal": case "less_than": return `${field}: qiymat juda katta`;
      case "missing": return `${field}: to'ldirilmagan`;
      case "int_parsing": case "float_parsing": return `${field}: son kiriting`;
    }
    return "Ma'lumot noto'g'ri";
  }
  return "Kutilmagan xato";
}

async function request<T>(method: string, path: string, body?: unknown, admin = false): Promise<T> {
  // the admin API accepts the owner's password session or an admin's own Telegram session
  const token = admin ? adminToken || userToken : userToken;
  let resp: Response;
  try {
    resp = await fetch(`/api/v1${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Internet aloqasi yo'q");
  }
  // 204 answers (save, withdraw...) can carry a JSON content type with an empty body
  const text = resp.status === 204 ? "" : await resp.text();
  const data = text && resp.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null;
  if (resp.status === 401 && admin) onAdminUnauthorized();
  if (resp.status === 401 && !admin && token && !path.startsWith("/auth/")) onUserUnauthorized();
  if (!resp.ok) throw new ApiError(resp.status, describe(data?.detail));
  return data as T;
}

/** Step one of a file submission; the returned id is sent with the work. */
async function uploadFile(file: File): Promise<SubmittedFile> {
  const body = new FormData();
  body.append("file", file);
  let resp: Response;
  try {
    resp = await fetch("/api/v1/uploads", { method: "POST", body, headers: userToken ? { Authorization: `Bearer ${userToken}` } : {} });
  } catch {
    throw new ApiError(0, "Internet aloqasi yo'q");
  }
  const data = resp.headers.get("content-type")?.includes("json") ? await resp.json() : null;
  if (!resp.ok) throw new ApiError(resp.status, resp.status === 413 ? "Fayl juda katta" : describe(data?.detail));
  return data as SubmittedFile;
}

export const absoluteUrl = (url: string) => new URL(url, window.location.origin).href;
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function download(path: string, filename: string): Promise<void> {
  const resp = await fetch(`/api/v1${path}`, { headers: { Authorization: `Bearer ${adminToken || userToken}` } });
  if (!resp.ok) throw new ApiError(resp.status, "Yuklab bo'lmadi");
  const url = URL.createObjectURL(await resp.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  mode: () => request<{ dev: boolean; bot_username: string | null }>("GET", "/auth/mode"),
  telegramWebLogin: (user: object) => request<{ token: string }>("POST", "/auth/telegram-web", user),
  telegramLogin: (init_data: string) => request<{ token: string; moved_to?: string | null }>("POST", "/auth/telegram", { init_data }),
  devLogin: (telegram_id: number, full_name: string) =>
    request<{ token: string }>("POST", "/auth/dev", { telegram_id, full_name }),
  me: () => request<Me>("GET", "/me"),
  botLoginStart: () => request<BotLink>("POST", "/auth/bot-login"),
  botLoginStatus: (code: string) => request<BotLoginStatus>("GET", `/auth/bot-login/${encodeURIComponent(code)}`),
  botLoginVerify: (code: string, pin: string) => request<{ token: string }>("POST", `/auth/bot-login/${encodeURIComponent(code)}/verify`, { pin }),
  telegramLinkVerify: (code: string, pin: string) => request<Me>("POST", `/me/telegram-link/${encodeURIComponent(code)}/verify`, { pin }),
  emailRegister: (full_name: string, email: string, password: string) =>
    request<{ token: string }>("POST", "/auth/register", { full_name, email, password }),
  emailLogin: (email: string, password: string) => request<{ token: string }>("POST", "/auth/login", { email, password }),
  setPassword: (email: string, password: string, current_password: string) =>
    request<Me>("PUT", "/me/password", { email, password, current_password }),
  telegramLinkStart: () => request<BotLink>("POST", "/me/telegram-link"),
  updateMe: (changes: Partial<Omit<Me, "track" | "university_ref" | "company" | "staff_university" | "completeness">> &
    { track_id?: number | null; university_id?: number | null; consent?: boolean }) => request<Me>("PATCH", "/me", changes),
  tracks: () => request<Track[]>("GET", "/tracks"),
  rules: () => request<Rules>("GET", "/rules"),
  universities: () => request<University[]>("GET", "/universities"),
  addUniversity: (name: string) => request<University>("POST", "/universities", { name }),
  requestVerification: () => request<Me>("POST", "/me/verification"),
  registerCompany: (c: CompanyInput & { full_name: string; job_title: string; consent: boolean }) => request<Me>("POST", "/me/company", c),
  catalog: () => request<Catalog>("GET", "/catalog"),
  myCvLink: () => request<{ url: string }>("GET", "/me/cv-link"),
  tests: {
    list: () => request<StudentTestCard[]>("GET", "/tests"),
    start: (id: number) => request<StartedTest>("POST", `/tests/${id}/start`),
    submit: (id: number, answers: { question_id: number; choice: number[]; text: string }[]) =>
      request<AttemptDetail>("POST", `/tests/${id}/submit`, { answers }),
    result: (id: number) => request<AttemptDetail>("GET", `/tests/${id}/result`),
  },
  requestStaff: (university_id: number, position: string) => request<Me>("POST", "/me/staff-request", { university_id, position }),
  backToStudent: () => request<Me>("POST", "/me/account-type/student"),
  jobs: (params: Record<string, string>) => request<Job[]>("GET", `/jobs?${new URLSearchParams(params)}`),
  job: (id: number) => request<Job>("GET", `/jobs/${id}`),
  saveJob: (id: number) => request<null>("POST", `/jobs/${id}/save`),
  unsaveJob: (id: number) => request<null>("DELETE", `/jobs/${id}/save`),
  savedJobs: () => request<Job[]>("GET", "/me/saved-jobs"),
  studentDashboard: () => request<StudentDashboard>("GET", "/me/dashboard"),
  myUniversity: () => request<{ university: UniversityProfile | null; verified?: boolean; recommended: (Job & { note: string })[]; outcomes: MyOutcome[] }>("GET", "/me/university"),
  addOutcome: (o: { company_name: string; position: string; kind: OutcomeKind; started_on?: string | null }) => request<MyOutcome>("POST", "/me/outcomes", o),
  deleteOutcome: (id: number) => request<null>("DELETE", `/me/outcomes/${id}`),
  complain: (c: { target_kind: "job" | "company" | "task" | "user"; target_id: number; reason: string; text: string }) =>
    request<{ status: string }>("POST", "/complaints", c),
  public: {
    stats: () => request<PublicStats>("GET", "/public/stats"),
    jobs: (params: Record<string, string>) => request<{ items: PublicJob[]; total: number }>("GET", `/public/jobs?${new URLSearchParams(params)}`),
    job: (id: number) => request<PublicJob>("GET", `/public/jobs/${id}`),
    companies: (params: Record<string, string>) => request<{ items: PublicCompany[]; total: number }>("GET", `/public/companies?${new URLSearchParams(params)}`),
    company: (id: number) => request<PublicCompany & { jobs: PublicJob[]; activity: CompanyActivity }>("GET", `/public/companies/${id}`),
    universities: (q = "") => request<{ items: PublicUniversity[]; total: number }>("GET", `/public/universities${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    ranking: () => request<{ published: RankingSnapshot | null; live: { method: RankingMethod; rows: RankingRow[]; computed_at: string } }>("GET", "/public/ranking"),
    university: (id: number) => request<UniversityProfile>("GET", `/public/universities/${id}`),
  },
  apply: (id: number, note: string) => request<MyApplication>("POST", `/jobs/${id}/apply`, { note }),
  myApplications: () => request<MyApplication[]>("GET", "/me/applications"),
  withdraw: (id: number) => request<null>("POST", `/me/applications/${id}/withdraw`),
  myContacts: () => request<StudentContact[]>("GET", "/me/contacts"),
  notifications: {
    list: (beforeId?: number) => request<{ items: AppNotification[]; unread: number; more: boolean }>(
      "GET", `/me/notifications${beforeId ? `?before_id=${beforeId}` : ""}`),
    unread: () => request<{ unread: number }>("GET", "/me/notifications/unread"),
    read: (ids?: number[]) => request<{ unread: number }>("POST", "/me/notifications/read", ids ? { ids } : {}),
  },
  answerContact: (id: number, accept: boolean) => request<{ status: string }>("POST", `/me/contacts/${id}`, { accept }),

  adminAuth: {
    status: () => request<{ needs_owner: boolean }>("GET", "/admin-auth/status"),
    register: (b: { name: string; email: string; password: string; setup_code?: string }) =>
      request<{ status: "active" | "pending"; token?: string }>("POST", "/admin-auth/register", b),
    login: (email: string, password: string) => request<{ token: string }>("POST", "/admin-auth/login", { email, password }),
    me: () => request<{ id: number; name: string; email: string; role: string; is_owner: boolean }>("GET", "/admin-auth/me", undefined, true),
    changePassword: (current_password: string, new_password: string) =>
      request<{ token: string }>("PUT", "/admin-auth/password", { current_password, new_password }, true),
  },

  mentor: {
    tasks: () => request<MentorTask[]>("GET", "/mentor/tasks"),
    questions: (openOnly = true) => request<TaskQuestion[]>("GET", `/mentor/questions?open_only=${openOnly}`),
    answer: (id: number, answer: string) => request<TaskQuestion>("POST", `/questions/${id}/answer`, { answer }),
    createTask: (t: Omit<MentorTask, "id" | "track" | "is_active">) => request<MentorTask>("POST", "/mentor/tasks", t),
    editTask: (id: number, changes: Partial<MentorTask>) => request<MentorTask>("PATCH", `/mentor/tasks/${id}`, changes),
    challenges: () => request<Challenge[]>("GET", "/mentor/challenges"),
    createChallenge: (c: ChallengeInput) => request<Challenge>("POST", "/mentor/challenges", c),
    editChallenge: (id: number, changes: Partial<ChallengeInput> & { is_archived?: boolean }) =>
      request<Challenge>("PATCH", `/mentor/challenges/${id}`, changes),
    entries: (id: number) => request<ChallengeEntry[]>("GET", `/mentor/challenges/${id}/entries`),
    review: (id: number, entryId: number, r: { accept: boolean; score?: number | null; place?: 1 | 2 | 3 | null; comment: string }) =>
      request<ChallengeEntry>("POST", `/mentor/challenges/${id}/entries/${entryId}/review`, r),
  },
  challenges: {
    list: () => request<Challenge[]>("GET", "/challenges"),
    detail: (id: number) => request<Challenge>("GET", `/challenges/${id}`),
    enter: (id: number, proof_url: string, note: string) => request<ChallengeEntry>("POST", `/challenges/${id}/enter`, { proof_url, note }),
  },

  groups: {
    list: () => request<{ mine: GroupCard[]; discover: GroupCard[] }>("GET", "/groups"),
    unread: () => request<{ unread: number }>("GET", "/groups/unread"),
    create: (name: string, description: string) => request<GroupCard>("POST", "/groups", { name, description }),
    joinPublic: (id: number) => request<GroupCard>("POST", `/groups/${id}/join`),
    joinByCode: (code: string) => request<GroupCard>("POST", "/groups/join", { code }),
    detail: (id: number) => request<GroupDetail>("GET", `/groups/${id}`),
    edit: (id: number, name: string, description: string) => request<GroupCard>("PATCH", `/groups/${id}`, { name, description }),
    remove: (id: number) => request<null>("DELETE", `/groups/${id}`),
    leave: (id: number) => request<null>("POST", `/groups/${id}/leave`),
    removeMember: (id: number, userId: number) => request<null>("DELETE", `/groups/${id}/members/${userId}`),
    resetInvite: (id: number) => request<{ invite_code: string }>("POST", `/groups/${id}/invite/reset`),
    messages: (id: number, params: { after?: number; before?: number }) =>
      request<ChatMessage[]>("GET", `/groups/${id}/messages?${new URLSearchParams(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, String(v)]))}`),
    send: (id: number, text: string) => request<ChatMessage>("POST", `/groups/${id}/messages`, { text }),
    deleteMessage: (id: number, messageId: number) => request<null>("DELETE", `/groups/${id}/messages/${messageId}`),
  },

  employer: {
    company: () => request<Company>("GET", "/employer/company"),
    editCompany: (c: CompanyInput) => request<Company>("PATCH", "/employer/company", c),
    students: (params: Record<string, string>) => request<StudentRow[]>("GET", `/employer/students?${new URLSearchParams(params)}`),
    student: (id: number) => request<StudentDetail>("GET", `/employer/students/${id}`),
    cvLink: (id: number) => request<{ url: string }>("GET", `/employer/students/${id}/cv-link`),
    tests: () => request<CompanyTestSummary[]>("GET", "/employer/tests"),
    test: (id: number) => request<CompanyTestFull>("GET", `/employer/tests/${id}`),
    createTest: (t: TestInput) => request<CompanyTestFull>("POST", "/employer/tests", t),
    editTest: (id: number, t: TestInput) => request<CompanyTestFull>("PUT", `/employer/tests/${id}`, t),
    closeTest: (id: number) => request<CompanyTestSummary>("POST", `/employer/tests/${id}/close`),
    deleteTest: (id: number) => request<null>("DELETE", `/employer/tests/${id}`),
    testResults: (id: number) => request<{ test: CompanyTestSummary; rows: TestResultRow[] }>("GET", `/employer/tests/${id}/results`),
    attempt: (id: number) => request<AttemptDetail>("GET", `/employer/test-attempts/${id}`),
    grade: (id: number, grades: { question_id: number; points: number; comment: string }[], feedback: string) =>
      request<AttemptDetail>("POST", `/employer/test-attempts/${id}/grade`, { grades, feedback }),
    jobs: () => request<Job[]>("GET", "/employer/jobs"),
    createJob: (j: JobInput) => request<Job>("POST", "/employer/jobs", j),
    editJob: (id: number, j: JobInput) => request<Job>("PUT", `/employer/jobs/${id}`, j),
    closeJob: (id: number) => request<Job>("POST", `/employer/jobs/${id}/close`),
    applicants: (jobId: number) => request<Applicant[]>("GET", `/employer/jobs/${jobId}/applicants`),
    dashboard: (days = 30) => request<EmployerDashboard>("GET", `/employer/dashboard?days=${days}`),
    universities: (q = "") => request<(PublicUniversity & { partnership: PartnershipRow | null })[]>("GET", `/employer/universities${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    university: (id: number) => request<UniversityProfile & { partnership: PartnershipRow | null }>("GET", `/employer/universities/${id}`),
    askPartnership: (universityId: number, message: string) => request<PartnershipRow>("POST", `/employer/universities/${universityId}/partnership`, { message }),
    decidePartnership: (id: number, accept: boolean) => request<PartnershipRow>("POST", `/employer/partnerships/${id}/decide`, { accept }),
    tasks: () => request<Challenge[]>("GET", "/employer/tasks"),
    createTask: (task: CompanyTaskInput) => request<Challenge>("POST", "/employer/tasks", task),
    editTask: (id: number, changes: { title?: string; description?: string; prize?: string; ends_on?: string; is_archived?: boolean }) =>
      request<Challenge>("PATCH", `/employer/tasks/${id}`, changes),
    taskEntries: (id: number) => request<ChallengeEntry[]>("GET", `/employer/tasks/${id}/entries`),
    reviewTaskEntry: (id: number, entryId: number, r: { accept: boolean; score: number | null; place: 1 | 2 | 3 | null; comment: string }) =>
      request<ChallengeEntry>("POST", `/employer/tasks/${id}/entries/${entryId}/review`, r),
    candidates: (params: Record<string, string>) =>
      request<{ items: CandidateRow[]; total: number; jobs: { id: number; title: string }[] }>("GET", `/employer/applications?${new URLSearchParams(params)}`),
    updateApplication: (id: number, changes: { status?: string; employer_note?: string; interview_at?: string; interview_place?: string }) =>
      request<Applicant>("PATCH", `/employer/applications/${id}`, changes),
    talent: (params: Record<string, string>) => request<TalentCard[]>("GET", `/employer/talent?${new URLSearchParams(params)}`),
    contact: (studentId: number, message: string) => request<{ status: string }>("POST", `/employer/talent/${studentId}/contact`, { message }),
    contacts: () => request<EmployerContact[]>("GET", "/employer/contacts"),
  },

  university: {
    dashboard: () => request<UniversityDashboard>("GET", "/university/dashboard"),
    students: (params: Record<string, string>) => request<UniversityStudent[]>("GET", `/university/students?${new URLSearchParams(params)}`),
    verify: (id: number, approve: boolean, note: string) => request<{ verification: string }>("POST", `/university/verifications/${id}`, { approve, note }),
    exportCsv: () => download("/university/export.csv", "talabalar-hisobot.csv"),
    profile: () => request<{ id: number; name: string; short_name: string; city: string; region: string; description: string; website: string }>("GET", "/university/profile"),
    editProfile: (changes: { description?: string; website?: string; city?: string; region?: string }) =>
      request<{ id: number; name: string; short_name: string; city: string; region: string; description: string; website: string }>("PATCH", "/university/profile", changes),
    stats: (params: Record<string, string>) => request<UniversityStats>("GET", `/university/stats?${new URLSearchParams(params)}`),
    outcomes: (confirmed?: boolean) => request<UniversityOutcome[]>("GET", `/university/outcomes${confirmed === undefined ? "" : `?confirmed=${confirmed}`}`),
    decideOutcome: (id: number, confirm: boolean, note = "") => request<{ confirmed: boolean }>("POST", `/university/outcomes/${id}`, { confirm, note }),
    partners: () => request<PartnershipRow[]>("GET", "/university/partners"),
    askPartner: (companyId: number, message: string) => request<PartnershipRow>("POST", "/university/partners", { company_id: companyId, message }),
    decidePartner: (id: number, accept: boolean) => request<PartnershipRow>("POST", `/university/partners/${id}/decide`, { accept }),
    opportunities: () => request<Opportunity[]>("GET", "/university/opportunities"),
    recommend: (jobId: number, note: string) => request<{ recommended: boolean; students: number }>("POST", `/university/jobs/${jobId}/recommend`, { note }),
  },
  tasks: (trackId: number) => request<Task[]>("GET", `/tracks/${trackId}/tasks`),
  completeProfile: (taskId: number) => request<Submission>("POST", `/tasks/${taskId}/complete-profile`),
  upload: uploadFile,
  assistantStatus: () => request<{ available: boolean; daily_limit: number }>("GET", "/assistant/status"),
  assistantMessages: () => request<AiMessage[]>("GET", "/assistant/messages"),
  assistantChat: (text: string) => request<{ question: AiMessage; answer: AiMessage }>("POST", "/assistant/chat", { text }),
  submit: (taskId: number, proof_url: string, note: string, file_ids: number[] = []) =>
    request<Submission>("POST", `/tasks/${taskId}/submit`, { proof_url, note, file_ids }),
  questions: (taskId: number) => request<TaskQuestion[]>("GET", `/tasks/${taskId}/questions`),
  ask: (taskId: number, text: string) => request<TaskQuestion>("POST", `/tasks/${taskId}/questions`, { text }),
  queue: () => request<QueueItem[]>("GET", "/reviews/queue"),
  review: (submissionId: number, approved: boolean, comment: string) =>
    request<Submission>("POST", `/submissions/${submissionId}/reviews`, { approved, comment }),
  peers: (goal?: string) => request<Peer[]>("GET", `/peers${goal ? `?goal=${encodeURIComponent(goal)}` : ""}`),
  leaderboard: (scope: "all" | "track" | "group" | "university") => request<Leaderboard>("GET", `/leaderboard?scope=${scope}`),

  admin: {
    dashboard: (from: string, to: string) => request<Dashboard>("GET", `/admin/dashboard?from=${from}&to=${to}`, undefined, true),
    applications: (params: Record<string, string>) => request<AdminApplication[]>("GET", `/admin/applications?${new URLSearchParams(params)}`, undefined, true),
    allJobs: (status: string) => request<Job[]>("GET", `/admin/jobs${status ? `?status=${status}` : ""}`, undefined, true),
    accounts: () => request<AdminAccount[]>("GET", "/admin/accounts", undefined, true),
    updateAccount: (id: number, changes: { role?: AdminRole; status?: "active" | "disabled" }) =>
      request<AdminAccount>("PATCH", `/admin/accounts/${id}`, changes, true),
    complaints: (status = "open") => request<AdminComplaint[]>("GET", `/admin/complaints?status=${status}`, undefined, true),
    decideComplaint: (id: number, status: "resolved" | "dismissed", note: string) =>
      request<{ status: string }>("POST", `/admin/complaints/${id}`, { status, note }, true),
    ranking: () => request<{ method: RankingMethod; rows: RankingRow[]; snapshots: RankingSnapshot[] }>("GET", "/admin/ranking", undefined, true),
    saveRanking: (c: { internship_weight: number; min_sample: number }) => request<RankingMethod>("PUT", "/admin/ranking/config", c, true),
    publishRanking: (period: string) => request<RankingSnapshot>("POST", "/admin/ranking/publish", { period }, true),
    partnerships: () => request<PartnershipRow[]>("GET", "/admin/partnerships", undefined, true),
    outcomes: () => request<AdminOutcome[]>("GET", "/admin/outcomes", undefined, true),
    resetPassword: (id: number) => request<{ temporary_password: string }>("POST", `/admin/accounts/${id}/reset-password`, undefined, true),
    resetUserPassword: (id: number) => request<{ temporary_password: string; email: string }>("POST", `/admin/users/${id}/reset-password`, undefined, true),
    groups: () => request<AdminGroup[]>("GET", "/admin/groups", undefined, true),
    groupMessages: (id: number) => request<{ id: number; author: string; text: string; deleted: boolean; created_at: string }[]>("GET", `/admin/groups/${id}/messages`, undefined, true),
    deleteGroupMessage: (messageId: number) => request<null>("DELETE", `/admin/group-messages/${messageId}`, undefined, true),
    archiveGroup: (id: number) => request<{ is_archived: boolean }>("POST", `/admin/groups/${id}/archive`, undefined, true),
    challenges: () => request<AdminChallenge[]>("GET", "/admin/challenges", undefined, true),
    archiveChallenge: (id: number) => request<{ is_archived: boolean }>("POST", `/admin/challenges/${id}/archive`, undefined, true),
    exportApplications: () => download("/admin/export/applications.csv", "talantgo-arizalar.csv"),
    stats: () => request<AdminStats>("GET", "/admin/stats", undefined, true),
    users: (params: Record<string, string>) => request<AdminUser[]>("GET", `/admin/users?${new URLSearchParams(params)}`, undefined, true),
    updateUser: (id: number, changes: Partial<Pick<AdminUser, "role" | "is_blocked" | "group_name" | "university">>) =>
      request<AdminUser>("PATCH", `/admin/users/${id}`, changes, true),
    adjustPoints: (id: number, delta: number, reason: string) => request<{ points: number }>("POST", `/admin/users/${id}/points`, { delta, reason }, true),
    submissions: (params: Record<string, string>) => request<AdminSubmission[]>("GET", `/admin/submissions?${new URLSearchParams(params)}`, undefined, true),
    deleteSubmission: (id: number, reason: string) => request<null>("DELETE", `/admin/submissions/${id}?reason=${encodeURIComponent(reason)}`, undefined, true),
    tracks: () => request<AdminTrack[]>("GET", "/admin/tracks", undefined, true),
    createTrack: (t: { title: string; icon: string; description: string }) => request<AdminTrack>("POST", "/admin/tracks", t, true),
    updateTrack: (id: number, changes: Partial<AdminTrack>) => request<AdminTrack>("PATCH", `/admin/tracks/${id}`, changes, true),
    tasks: (trackId: number) => request<AdminTask[]>("GET", `/admin/tasks?track_id=${trackId}`, undefined, true),
    createTask: (t: Omit<AdminTask, "id" | "sort_order" | "is_active">) => request<AdminTask>("POST", "/admin/tasks", t, true),
    updateTask: (id: number, changes: Partial<AdminTask>) => request<AdminTask>("PATCH", `/admin/tasks/${id}`, changes, true),
    announcements: () => request<Announcement[]>("GET", "/admin/announcements", undefined, true),
    announce: (a: { text: string; track_id: number | null; group_name: string | null }) => request<Announcement>("POST", "/admin/announcements", a, true),
    rules: () => request<Rules>("GET", "/admin/rules", undefined, true),
    saveRules: (r: Rules) => request<Rules>("PUT", "/admin/rules", r, true),
    audit: () => request<AuditEntry[]>("GET", "/admin/audit", undefined, true),
    bot: () => request<BotStatus>("GET", "/admin/bot", undefined, true),
    saveBot: (token: string) => request<BotStatus>("PUT", "/admin/bot", { token }, true),
    testBot: () => request<{ username: string }>("POST", "/admin/bot/test", undefined, true),
    connectBot: () => request<{ username: string; previous_username: string | null; previous_error: string | null }>("POST", "/admin/bot/connect", undefined, true),
    setPreviousBot: (token: string) => request<BotStatus>("PUT", "/admin/bot/previous", { token }, true),
    forgetPreviousBot: () => request<BotStatus>("POST", "/admin/bot/previous/forget", undefined, true),
    ai: () => request<AiStatus>("GET", "/admin/ai", undefined, true),
    saveAi: (b: { enabled: boolean; assistant: boolean; model: string; api_key?: string }) => request<AiStatus>("PUT", "/admin/ai", b, true),
    aiConversations: () => request<AiConversation[]>("GET", "/admin/assistant/users", undefined, true),
    aiConversation: (userId: number) => request<AiMessage[]>("GET", `/admin/assistant/users/${userId}/messages`, undefined, true),
    testAi: () => request<{ model: string; reply: string }>("POST", "/admin/ai/test", undefined, true),
    exportUsers: () => download("/admin/export/users.csv", "talantgo-talabalar.csv"),
    inbox: () => request<{ verifications: number; companies: number; jobs: number; staff: number; tests: number }>("GET", "/admin/inbox", undefined, true),
    tests: (status: string) => request<CompanyTestFull[]>("GET", `/admin/tests${status ? `?status=${status}` : ""}`, undefined, true),
    reviewTest: (id: number, approve: boolean, note: string) => request<CompanyTestFull>("POST", `/admin/tests/${id}/review`, { approve, note }, true),
    verifications: () => request<PendingStudent[]>("GET", "/admin/verifications", undefined, true),
    decideVerification: (id: number, approve: boolean, note: string) => request<unknown>("POST", `/admin/verifications/${id}`, { approve, note }, true),
    companies: (status: string) => request<Company[]>("GET", `/admin/companies?status=${status}`, undefined, true),
    reviewCompany: (id: number, approve: boolean, note: string) => request<Company>("POST", `/admin/companies/${id}/review`, { approve, note }, true),
    pendingJobs: () => request<Job[]>("GET", "/admin/jobs?status=pending", undefined, true),
    reviewJob: (id: number, approve: boolean, note: string) => request<Job>("POST", `/admin/jobs/${id}/review`, { approve, note }, true),
    staff: () => request<StaffRequest[]>("GET", "/admin/staff", undefined, true),
    reviewStaff: (id: number, approve: boolean) => request<unknown>("POST", `/admin/staff/${id}/review`, { approve, note: "" }, true),
    universities: () => request<(University & { is_active: boolean; students: number })[]>("GET", "/admin/universities", undefined, true),
    addUniversity: (u: { name: string; short_name: string; city: string }) => request<University>("POST", "/admin/universities", u, true),
    editUniversity: (id: number, changes: Partial<University & { is_active: boolean }>) => request<University>("PATCH", `/admin/universities/${id}`, changes, true),
  },
};

export const STATUS_LABEL: Record<Status, string> = {
  pending: "Tekshiruvda",
  peer_verified: "Tengdoshlar tasdiqladi",
  mentor_verified: "Mentor tasdiqladi",
  rejected: "Qaytarildi",
};

export interface PendingStudent {
  id: number; full_name: string; username: string | null; university: string | null; faculty: string;
  course: number | null; group_name: string; student_number: string; verification: string; verified_by: string;
}
export interface StaffRequest { id: number; full_name: string; username: string | null; position: string; university: string | null; status: string }
export interface UniversityStudent {
  id: number; full_name: string; username: string | null; faculty: string; course: number | null; group_name: string;
  student_number: string; verification: Verification; track: string | null; points: number; verified_tasks: number;
  open_to_work: boolean; cv_public: boolean; last_seen_at: string | null;
}
export interface UniversityDashboard {
  university: string; students: number; verified: number; pending_verification: number; active_7d: number;
  with_track: number; cv_public: number; open_to_work: number; percent: Record<string, number>;
  applications: Record<string, number>; hired: number;
  companies_by_applications: { name: string; count: number }[]; companies_by_contacts: { name: string; count: number }[];
  by_course: { course: number | null; count: number }[]; by_faculty: { faculty: string; count: number }[];
  recent_hires: { student: string; job: string; company: string; date: string }[];
}

export const JOB_KIND: Record<JobKind, string> = { internship: "Amaliyot", part_time: "Yarim stavka", junior: "Junior", project: "Loyiha" };
export const WORK_MODE: Record<WorkMode, string> = { office: "Ofisda", remote: "Masofaviy", hybrid: "Aralash" };
export const APPLICATION_STATUS: Record<string, string> = {
  new: "Yuborildi", viewed: "Ko'rib chiqilmoqda", shortlisted: "Saralandi", interview: "Suhbat", offer: "Taklif",
  hired: "Ishga olindi", rejected: "Rad etildi", withdrawn: "Qaytarib olindi",
};
export const VERIFICATION_LABEL: Record<Verification, string> = {
  none: "Tasdiqlanmagan", pending: "Tasdiqlash kutilmoqda", verified: "Talabalik tasdiqlangan", rejected: "Rad etilgan",
};

export function salary(job: Pick<Job, "is_paid" | "salary_from" | "salary_to">): string {
  if (!job.is_paid) return "To'lanmaydi";
  const f = (n: number) => `${(n / 1_000_000).toLocaleString("uz", { maximumFractionDigits: 1 })} mln`;
  if (job.salary_from && job.salary_to) return `${f(job.salary_from)}–${f(job.salary_to)} so'm`;
  if (job.salary_from) return `${f(job.salary_from)} so'mdan`;
  if (job.salary_to) return `${f(job.salary_to)} so'mgacha`;
  return "To'lanadi (kelishiladi)";
}

/** +998901234567 -> +998 90 123 45 67 */
export const formatPhone = (p: string) => p.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4");
export const courseLabel = (c: number | null | undefined) => (!c ? "" : c === 7 ? "magistratura" : `${c}-kurs`);

export interface AdminAccount {
  id: number; name: string; email: string; role: AdminRole; status: "pending" | "active" | "disabled";
  created_at: string; last_login_at: string | null;
}
export interface AdminApplication {
  id: number; candidate: string; username: string | null; phone: string; university: string | null; job: string;
  kind: JobKind; company: string; status: string; note: string; created_at: string; updated_at: string;
}
export interface Dashboard {
  from: string; to: string;
  kpis: { students: number; new_students: number; active_7d: number; verified_students: number; submissions: number;
          awaiting_review: number; companies: number; live_jobs: number; queue: number };
  applications: Record<"new" | "viewed" | "shortlisted" | "interview" | "offer" | "hired" | "rejected" | "withdrawn", number>;
  submissions_by_status: Record<Status, number>;
  series: { dates: string[]; registrations: number[]; submissions: number[]; applications: number[] };
  recent_applications: { id: number; candidate: string; job: string; company: string; status: string; created_at: string }[];
  recent_submissions: { id: number; student: string; task: string; track: string; status: Status; created_at: string }[];
  per_track: { icon: string; title: string; students: number }[];
  per_university: { name: string; students: number }[];
}

export interface GroupCard {
  id: number; name: string; description: string; is_private: boolean; is_official: boolean; members: number;
  unread: number; my_role: "owner" | "member" | null;
  last_message: { author: string; text: string; created_at: string } | null;
}
export interface GroupDetail extends GroupCard {
  invite_code: string | null;
  member_list: { user_id: number; name: string; badge: string; role: "owner" | "member"; username: string | null }[];
}
export interface ChatMessage {
  id: number; text: string | null; deleted: boolean; created_at: string; mine: boolean; user_id: number | null;
  author: string; badge: string;
}
export interface AdminGroup {
  id: number; name: string; is_private: boolean; is_official: boolean; is_archived: boolean; members: number;
  messages: number; created_at: string;
}

export interface MentorTask {
  id: number; track_id: number; track: string; week: number; title: string; description: string; proof_hint: string;
  criteria: string; points: number; is_active: boolean;
}
export interface ChallengeEntry {
  id: number; user_id: number; student: string; username: string | null; university: string | null; proof_url: string;
  note: string; status: "submitted" | "accepted" | "rejected"; score: number | null; place: 1 | 2 | 3 | null;
  comment: string; points_awarded: number; created_at: string;
}
export interface Challenge {
  id: number; title: string; description: string; track_id: number | null; track: string | null; prize: string;
  points: number; starts_at: string; ends_at: string; state: "upcoming" | "active" | "finished"; is_archived: boolean;
  mentor: string | null; entries: number; to_review?: number; my_entry?: ChallengeEntry | null;
  company_id?: number | null; company?: string | null; audience?: "all" | "track" | "university" | "selected";
  university_id?: number | null; invited?: number;
  results?: { student: string; place: number | null; score: number | null }[];
}
export interface ChallengeInput {
  title: string; description: string; track_id: number | null; prize: string; points: number; starts_on?: string | null; ends_on: string;
}
export interface CompanyTaskInput {
  title: string; description: string; prize: string; points: number; starts_on?: string | null; ends_on: string;
  audience: "all" | "track" | "university" | "selected"; track_id?: number | null; university_id?: number | null; student_ids?: number[];
}
export interface AdminChallenge {
  id: number; title: string; track: string; prize: string; points: number; mentor: string | null; entries: number;
  starts_at: string; ends_at: string; is_archived: boolean;
}

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
/** 2026-10-15T18:59Z -> "15-oktabr" (Tashkent time; browsers often lack Uzbek month names). */
export const uzDate = (iso: string) => {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`;
};
/** Days left until a deadline, for "3 kun qoldi". */
export const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

export const ATTEMPT_STATUS: Record<AttemptStatus, string> = { in_progress: "Ishlanmoqda", submitted: "Baholanmoqda", graded: "Baholangan" };
export const TEST_STATUS: Record<TestStatus, [string, string]> = {
  draft: ["Qoralama", "todo"], pending: ["Tekshiruvda", "pending"], approved: ["E'lon qilingan", "peer_verified"],
  rejected: ["Qaytarilgan", "rejected"], closed: ["Yopilgan", "todo"],
};
export const QUESTION_KIND: Record<QuestionKind, string> = { single: "Bitta javob", multi: "Bir nechta javob", text: "Yozma javob" };

let catalogCache: Promise<Catalog> | null = null;
/** The choice lists rarely change: fetched once per app launch. */
export function loadCatalog(): Promise<Catalog> {
  catalogCache ??= api.catalog().catch((e) => { catalogCache = null; throw e; });
  return catalogCache;
}
