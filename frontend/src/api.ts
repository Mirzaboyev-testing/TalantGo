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
  cv_slug: string; cv_public: boolean;
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
export interface AdminUser { id: number; full_name: string; username: string | null; role: Role; group_name: string; points: number; created_at: string }
export interface BotStatus { configured: boolean; hint: string | null; public_url: string }

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
  const token = admin ? adminToken : userToken;
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
    bot: () => request<BotStatus>("GET", "/admin/bot", undefined, true),
    saveBot: (token: string) => request<BotStatus>("PUT", "/admin/bot", { token }, true),
    testBot: () => request<{ username: string }>("POST", "/admin/bot/test", undefined, true),
    connectBot: () => request<{ username: string }>("POST", "/admin/bot/connect", undefined, true),
    stats: () => request<{ users: number; with_track: number; submissions: Record<Status, number> }>("GET", "/admin/stats", undefined, true),
    users: () => request<AdminUser[]>("GET", "/admin/users", undefined, true),
    setRole: (id: number, role: Role) => request<AdminUser>("PATCH", `/admin/users/${id}`, { role }, true),
  },
};

export const STATUS_LABEL: Record<Status, string> = {
  pending: "Tekshiruvda",
  peer_verified: "Tengdoshlar tasdiqladi",
  mentor_verified: "Mentor tasdiqladi",
  rejected: "Qaytarildi",
};
