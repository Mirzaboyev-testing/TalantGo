// Competitions, teams and rankings in «Topshiriqlar» (docs/13-musobaqalar.md, section 6 is the contract).
// One file for the types and calls, shared by the student screens, the organizer manager (company, university,
// admin) and the public highlights block, so the parts are built in parallel against the same shapes.
import { request } from "./api";

export type CompetitionMode = "individual" | "team";
export type TeamKind = "persistent" | "one_time";
export type CompetitionTeamKind = "any" | TeamKind;
export type CompetitionAudience = "all" | "fields" | "university";
export type CompetitionStatus = "draft" | "published" | "results" | "archived";
export type CompetitionPhase = "upcoming" | "registration" | "running" | "reviewing" | "finished";
export type StagePhase = "upcoming" | "open" | "reviewing" | "closed";
export type EntryStatus = "registered" | "eliminated" | "withdrawn" | "finished";

export interface PersonOut { user_id: number; name: string; photo_url: string | null; subtitle: string }
export interface TeamMember extends PersonOut { role: "captain" | "member"; joined_at: string }
export interface TeamHistoryRow { competition_id: number; title: string; place: number | null; score: number | null }
export interface TeamOut {
  id: number; name: string; kind: TeamKind; competition_id: number | null; competition_title: string | null;
  description: string; captain_id: number; members: TeamMember[]; size_max: number; points: number;
  competitions_n: number; wins: number; created_at: string; mine: boolean; is_captain: boolean;
  invite_code: string | null; invite_url: string | null; history?: TeamHistoryRow[];
}
export interface TeamPreview {
  id: number; name: string; kind: TeamKind; members_n: number; size_max: number; competition_title: string | null; captain_name: string;
}
export interface StageOut {
  id: number; order: number; title: string; description: string; starts_at: string; ends_at: string;
  advance_count: number | null; phase: StagePhase;
}
export interface Organizer { kind: "company" | "university" | "platform"; id: number | null; name: string; logo_url: string | null }
export interface Submission {
  stage_id: number; proof_url: string; note: string; files: { id: number; url: string; name: string }[];
  score: number | null; comment: string; submitted_at: string; reviewed_at: string | null; submitted_by: string;
}
export interface MyEntry {
  id: number; team: TeamOut | null; status: EntryStatus; place: number | null; rank: number | null;
  total_score: number | null; submissions: Submission[];
}
export interface Competition {
  id: number; title: string; description: string; prize: string; organizer: Organizer; mode: CompetitionMode;
  team_kind: CompetitionTeamKind; team_min: number; team_max: number; audience: CompetitionAudience;
  job_fields: string[]; university_id: number | null; registration_ends_at: string; starts_at: string; ends_at: string;
  status: CompetitionStatus; phase: CompetitionPhase; stages: StageOut[]; entries_n: number; my_entry: MyEntry | null;
  can_register: boolean; why_not: string | null; place_points: number[];
  to_score?: number;                                   // organizer lists only
  is_hidden?: boolean;                                 // admin lists only: hidden by an admin (hide / restore)
}
export interface LeaderRow {
  rank: number; entry_id: number; name: string; subtitle: string; photo_url: string | null; team_id: number | null;
  members: string[]; score: number | null; percent: number | null; stage_reached: number; status: EntryStatus;
  place: number | null; is_me: boolean;
}
export interface Leaderboard {
  rows: LeaderRow[]; total: number; my_rank: number | null; my_percentile: number | null;
  average_percent: number | null; stage_id: number | null;
}
export interface TestStats {
  my_score: number; max_score: number; percent: number; rank: number; of: number; percentile: number;
  average_percent: number; best_percent: number; distribution: number[];
}
export interface TeamRankRow {
  rank: number; team_id: number; name: string; members_n: number; points: number; competitions_n: number; wins: number;
  universities: string[];
}
export interface StageInput { title: string; description: string; starts_at: string; ends_at: string; advance_count?: number | null }
export interface CompetitionInput {
  title: string; description: string; prize: string; mode: CompetitionMode; team_kind: CompetitionTeamKind;
  team_min: number; team_max: number; audience: CompetitionAudience; job_fields: string[]; university_id?: number | null;
  registration_ends_at: string; place_points?: number[]; stages: StageInput[]; publish: boolean;
}
export interface OrganizerEntry {
  entry_id: number; name: string; team: TeamOut | null; members: PersonOut[]; status: EntryStatus;
  submission: Submission | null; total_score: number | null;
}
export interface Highlights {
  show: boolean;
  winners: { competition_id: number; title: string; organizer: string; place: number; name: string; kind: "student" | "team" }[];
  teams: TeamRankRow[];
}

const q = (params: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]));
  return s.toString() ? `?${s}` : "";
};

/** Calls of the organizer manager: `/organizer/competitions` for a company or university, `/admin/competitions` for admins. */
function organizerCalls(base: string, admin: boolean) {
  return {
    list: () => request<Competition[]>("GET", base, undefined, admin),
    create: (b: CompetitionInput) => request<Competition>("POST", base, b, admin),
    edit: (id: number, b: Partial<CompetitionInput>) => request<Competition>("PATCH", `${base}/${id}`, b, admin),
    publish: (id: number) => request<Competition>("POST", `${base}/${id}/publish`, undefined, admin),
    archive: (id: number) => request<Competition>("POST", `${base}/${id}/archive`, undefined, admin),
    entries: (id: number, stageId?: number | null) => request<OrganizerEntry[]>("GET", `${base}/${id}/entries${q({ stage_id: stageId })}`, undefined, admin),
    score: (id: number, stageId: number, b: { entry_id: number; score: number; comment: string }) =>
      request<OrganizerEntry>("POST", `${base}/${id}/stages/${stageId}/score`, b, admin),
    closeStage: (id: number, stageId: number, advance_entry_ids?: number[]) =>
      request<Competition>("POST", `${base}/${id}/stages/${stageId}/close`, advance_entry_ids ? { advance_entry_ids } : {}, admin),
    results: (id: number) => request<Competition>("POST", `${base}/${id}/results`, undefined, admin),
  };
}
export type OrganizerApi = ReturnType<typeof organizerCalls>;

export const competitionsApi = {
  // student
  list: (scope: "open" | "mine" | "finished" = "open") => request<Competition[]>("GET", `/competitions${q({ scope })}`),
  get: (id: number) => request<Competition>("GET", `/competitions/${id}`),
  register: (id: number, team_id?: number) => request<Competition>("POST", `/competitions/${id}/register`, team_id ? { team_id } : {}),
  withdraw: (id: number) => request<Competition>("POST", `/competitions/${id}/withdraw`),
  submit: (id: number, stageId: number, b: { proof_url: string; note: string; file_ids: number[] }) =>
    request<MyEntry>("POST", `/competitions/${id}/stages/${stageId}/submit`, b),
  leaderboard: (id: number, stageId?: number | null) => request<Leaderboard>("GET", `/competitions/${id}/leaderboard${q({ stage_id: stageId })}`),
  testStats: (testId: number) => request<TestStats>("GET", `/tests/${testId}/stats`),
  // teams
  myTeams: () => request<TeamOut[]>("GET", "/teams/mine"),
  createTeam: (b: { name: string; kind: TeamKind; competition_id?: number | null; description?: string }) => request<TeamOut>("POST", "/teams", b),
  previewTeam: (code: string) => request<TeamPreview>("GET", `/teams/join/${encodeURIComponent(code.trim().toUpperCase())}`),
  joinTeam: (code: string) => request<TeamOut>("POST", "/teams/join", { code: code.trim().toUpperCase() }),
  team: (id: number) => request<TeamOut>("GET", `/teams/${id}`),
  leaveTeam: (id: number) => request<{ ok: boolean }>("POST", `/teams/${id}/leave`),
  removeMember: (id: number, userId: number) => request<TeamOut>("DELETE", `/teams/${id}/members/${userId}`),
  makeCaptain: (id: number, userId: number) => request<TeamOut>("POST", `/teams/${id}/captain`, { user_id: userId }),
  newCode: (id: number) => request<TeamOut>("POST", `/teams/${id}/code`),
  editTeam: (id: number, b: { name?: string; description?: string }) => request<TeamOut>("PATCH", `/teams/${id}`, b),
  teamRanking: (universityId?: number | null) => request<TeamRankRow[]>("GET", `/teams/ranking${q({ university_id: universityId })}`),
  // organizers
  organizer: organizerCalls("/organizer/competitions", false),
  admin: {
    ...organizerCalls("/admin/competitions", true),
    hide: (id: number) => request<Competition>("POST", `/admin/competitions/${id}/hide`, undefined, true),
    restore: (id: number) => request<Competition>("POST", `/admin/competitions/${id}/restore`, undefined, true),
    home: () => request<{ show: boolean }>("GET", "/admin/competitions/home", undefined, true),
    setHome: (show: boolean) => request<{ show: boolean }>("PUT", "/admin/competitions/home", { show }, true),
  },
  // public site
  highlights: () => request<Highlights>("GET", "/public/competitions/highlights"),
};
