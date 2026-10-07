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
  points: number; submission: Submission | null;
}
export interface Me {
  id: number; full_name: string; username: string | null; photo_url: string | null; role: Role;
  track: Track | null; university: string; group_name: string; bio: string; goals: string[];
  github_url: string; linkedin_url: string; points: number; streak: number; rank_overall: number;
  cv_slug: string; cv_public: boolean; is_owner: boolean;
}
export interface QueueItem {
  submission_id: number; status: Status; task_title: string; track_title: string; proof_hint: string;
  proof_url: string; note: string; author_name: string; peer_reviews: number; submitted_at: string;
}
export interface Peer {
  id: number; full_name: string; username: string | null; photo_url: string | null; track_title: string | null;
  group_name: string; goals: string[]; points: number; streak: number; verified_tasks: number;
}
export interface LeaderRow { rank: number; id: number; full_name: string; group_name: string; track_icon: string; points: number; is_me: boolean }
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
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let userToken = "";
let adminToken = "";
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
  updateMe: (changes: Partial<Omit<Me, "track">> & { track_id?: number | null }) => request<Me>("PATCH", "/me", changes),
  tracks: () => request<Track[]>("GET", "/tracks"),
  tasks: (trackId: number) => request<Task[]>("GET", `/tracks/${trackId}/tasks`),
  submit: (taskId: number, proof_url: string, note: string) =>
    request<Submission>("POST", `/tasks/${taskId}/submit`, { proof_url, note }),
  queue: () => request<QueueItem[]>("GET", "/reviews/queue"),
  review: (submissionId: number, approved: boolean, comment: string) =>
    request<Submission>("POST", `/submissions/${submissionId}/reviews`, { approved, comment }),
  peers: (goal?: string) => request<Peer[]>("GET", `/peers${goal ? `?goal=${encodeURIComponent(goal)}` : ""}`),
  leaderboard: (scope: "all" | "track" | "group") => request<Leaderboard>("GET", `/leaderboard?scope=${scope}`),

  admin: {
    login: (password: string) => request<{ token: string }>("POST", "/auth/admin", { password }),
    me: () => request<{ name: string; is_owner: boolean }>("GET", "/admin/me", undefined, true),
    stats: () => request<AdminStats>("GET", "/admin/stats", undefined, true),
    users: (params: Record<string, string>) => request<AdminUser[]>("GET", `/admin/users?${new URLSearchParams(params)}`, undefined, true),
    updateUser: (id: number, changes: Partial<Pick<AdminUser, "role" | "is_owner" | "is_blocked" | "group_name" | "university">>) =>
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
  },
};

export const STATUS_LABEL: Record<Status, string> = {
  pending: "Tekshiruvda",
  peer_verified: "Tengdoshlar tasdiqladi",
  mentor_verified: "Mentor tasdiqladi",
  rejected: "Qaytarildi",
};
