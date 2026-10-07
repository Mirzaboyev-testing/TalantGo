// Typed API client. Tokens are kept in memory: every Telegram launch signs in again with fresh initData.

export type Role = "student" | "mentor" | "admin";
export type Status = "pending" | "peer_verified" | "mentor_verified" | "rejected";

export interface Track { id: number; slug: string; title: string; icon: string; description: string }
export interface Review { reviewer_name: string; kind: "peer" | "mentor"; approved: boolean; comment: string; created_at: string }
export interface Submission {
  id: number; task_id: number; proof_url: string; note: string; status: Status; round: number;
  points_awarded: number; created_at: string; verified_at: string | null; reviews: Review[];
}
export interface Task {
  id: number; track_id: number; week: number; title: string; description: string; proof_hint: string;
  points: number; kind: "submission" | "profile"; submission: Submission | null;
}
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
}
export type AccountType = "student" | "employer" | "university";
export type Verification = "none" | "pending" | "verified" | "rejected";
export type JobKind = "internship" | "part_time" | "junior" | "project";
export type WorkMode = "office" | "remote" | "hybrid";
export interface University { id: number; name: string; short_name: string; city: string }
export interface Company {
  id: number; name: string; stir: string | null; industry: string; website: string; city: string;
  description: string; status: "pending" | "approved" | "rejected"; review_note: string; created_at: string;
}
export interface Job {
  id: number; company_id: number; company_name: string; company_industry: string; title: string; kind: JobKind;
  work_mode: WorkMode; city: string; is_paid: boolean; salary_from: number | null; salary_to: number | null;
  hours_per_week: number | null; description: string; requirements: string; skills: string[]; track_ids: number[];
  counts_as_practice: boolean; deadline: string | null; status: string; review_note: string; views: number;
  created_at: string; applied: boolean; application_status: string | null; match: number; applications: number;
}
export type JobInput = Pick<Job, "title" | "kind" | "work_mode" | "city" | "is_paid" | "salary_from" | "salary_to" |
  "hours_per_week" | "description" | "requirements" | "skills" | "track_ids" | "counts_as_practice" | "deadline"> & { rules_accepted: boolean };
export interface MyApplication { id: number; status: string; note: string; created_at: string; updated_at: string; job: Job }
export interface TalentCard {
  id: number; code: string; headline: string; university: string | null; university_name: string | null; faculty: string;
  course: number | null; graduation_year: number | null; gpa: number | null; gpa_scale: number; track: string | null;
  track_icon: string; skills: string[]; languages: string[]; job_types: string[]; city: string; points: number;
  verified_tasks: number; verification: Verification; verified_by: string; contact_status?: string | null;
}
export interface Identity { full_name: string; username: string | null; photo_url: string | null; cv_url: string | null; github_url: string; linkedin_url: string }
export interface Applicant { id: number; status: string; note: string; employer_note: string; created_at: string; card: TalentCard; identity: Identity }
export interface EmployerContact { id: number; status: string; message: string; created_at: string; job_title: string | null; card: TalentCard; identity: Identity | null }
export interface StudentContact { id: number; company: string; industry: string; message: string; job_title: string | null; status: string; created_at: string }
export interface QueueItem {
  submission_id: number; status: Status; task_title: string; track_title: string; proof_hint: string;
  proof_url: string; note: string; author_name: string; peer_reviews: number; submitted_at: string;
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
export interface BotStatus { configured: boolean; hint: string | null; public_url: string }
export interface AdminUser {
  id: number; full_name: string; username: string | null; role: Role; is_owner: boolean; is_blocked: boolean;
  track_id: number | null; university: string; group_name: string; points: number; verified_tasks: number;
  last_seen_at: string | null; created_at: string;
}
export interface AdminSubmission {
  id: number; status: Status; round: number; points_awarded: number; proof_url: string; note: string;
  task_title: string; track_title: string; author_id: number; author_name: string; reviews: Review[]; updated_at: string;
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
export const setAdminUnauthorizedHandler = (fn: () => void) => { onAdminUnauthorized = fn; };
export const setUserToken = (t: string) => { userToken = t; };
export const setAdminToken = (t: string) => { adminToken = t; };

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string };
    return (first.msg ?? "Ma'lumot noto'g'ri").replace(/^Value error, /, "");
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
  const data = resp.headers.get("content-type")?.includes("json") ? await resp.json() : null;
  if (resp.status === 401 && admin) onAdminUnauthorized();
  if (!resp.ok) throw new ApiError(resp.status, describe(data?.detail));
  return data as T;
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
  mode: () => request<{ dev: boolean }>("GET", "/auth/mode"),
  telegramLogin: (init_data: string) => request<{ token: string }>("POST", "/auth/telegram", { init_data }),
  devLogin: (telegram_id: number, full_name: string) =>
    request<{ token: string }>("POST", "/auth/dev", { telegram_id, full_name }),
  me: () => request<Me>("GET", "/me"),
  updateMe: (changes: Partial<Omit<Me, "track" | "university_ref" | "company" | "staff_university" | "completeness">> &
    { track_id?: number | null; university_id?: number | null; consent?: boolean }) => request<Me>("PATCH", "/me", changes),
  tracks: () => request<Track[]>("GET", "/tracks"),
  rules: () => request<Rules>("GET", "/rules"),
  universities: () => request<University[]>("GET", "/universities"),
  requestVerification: () => request<Me>("POST", "/me/verification"),
  registerCompany: (c: Omit<Company, "id" | "status" | "review_note" | "created_at">) => request<Me>("POST", "/me/company", c),
  requestStaff: (university_id: number, position: string) => request<Me>("POST", "/me/staff-request", { university_id, position }),
  backToStudent: () => request<Me>("POST", "/me/account-type/student"),
  jobs: (params: Record<string, string>) => request<Job[]>("GET", `/jobs?${new URLSearchParams(params)}`),
  job: (id: number) => request<Job>("GET", `/jobs/${id}`),
  apply: (id: number, note: string) => request<MyApplication>("POST", `/jobs/${id}/apply`, { note }),
  myApplications: () => request<MyApplication[]>("GET", "/me/applications"),
  withdraw: (id: number) => request<null>("POST", `/me/applications/${id}/withdraw`),
  myContacts: () => request<StudentContact[]>("GET", "/me/contacts"),
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
    editCompany: (c: Omit<Company, "id" | "status" | "review_note" | "created_at">) => request<Company>("PATCH", "/employer/company", c),
    jobs: () => request<Job[]>("GET", "/employer/jobs"),
    createJob: (j: JobInput) => request<Job>("POST", "/employer/jobs", j),
    editJob: (id: number, j: JobInput) => request<Job>("PUT", `/employer/jobs/${id}`, j),
    closeJob: (id: number) => request<Job>("POST", `/employer/jobs/${id}/close`),
    applicants: (jobId: number) => request<Applicant[]>("GET", `/employer/jobs/${jobId}/applicants`),
    updateApplication: (id: number, changes: { status?: string; employer_note?: string }) =>
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
  },
  tasks: (trackId: number) => request<Task[]>("GET", `/tracks/${trackId}/tasks`),
  completeProfile: (taskId: number) => request<Submission>("POST", `/tasks/${taskId}/complete-profile`),
  submit: (taskId: number, proof_url: string, note: string) =>
    request<Submission>("POST", `/tasks/${taskId}/submit`, { proof_url, note }),
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
    updateAccount: (id: number, changes: { role?: "owner" | "admin"; status?: "active" | "disabled" }) =>
      request<AdminAccount>("PATCH", `/admin/accounts/${id}`, changes, true),
    resetPassword: (id: number) => request<{ temporary_password: string }>("POST", `/admin/accounts/${id}/reset-password`, undefined, true),
    groups: () => request<AdminGroup[]>("GET", "/admin/groups", undefined, true),
    groupMessages: (id: number) => request<{ id: number; author: string; text: string; deleted: boolean; created_at: string }[]>("GET", `/admin/groups/${id}/messages`, undefined, true),
    deleteGroupMessage: (messageId: number) => request<null>("DELETE", `/admin/group-messages/${messageId}`, undefined, true),
    archiveGroup: (id: number) => request<{ is_archived: boolean }>("POST", `/admin/groups/${id}/archive`, undefined, true),
    exportApplications: () => download("/admin/export/applications.csv", "careerflow-arizalar.csv"),
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
    connectBot: () => request<{ username: string }>("POST", "/admin/bot/connect", undefined, true),
    exportUsers: () => download("/admin/export/users.csv", "careerflow-talabalar.csv"),
    inbox: () => request<{ verifications: number; companies: number; jobs: number; staff: number }>("GET", "/admin/inbox", undefined, true),
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
  new: "Yuborildi", viewed: "Ko'rildi", shortlisted: "Keyingi bosqich", rejected: "Rad etildi", hired: "Qabul qilindi",
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
  id: number; name: string; email: string; role: "owner" | "admin"; status: "pending" | "active" | "disabled";
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
  applications: Record<"new" | "viewed" | "shortlisted" | "hired" | "rejected", number>;
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
