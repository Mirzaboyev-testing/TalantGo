// University panel API (v2): types and calls. Kept apart from api.ts so the university and company panels
// can change without touching each other's code.
import { download, request, type Job, type Me, type NewsCategory, type NewsItem, type OutcomeKind, type PartnershipRow, type SubmittedFile, type Verification } from "../../api";

export type StaffStatus = "" | "pending" | "needs_info" | "approved" | "rejected";
export type StaffRole = "" | "lead" | "member";

export interface StaffInfo {
  role: StaffRole; department: string; work_email: string; doc: SubmittedFile | null; cooperation: string[];
  website: string; telegram: string; social: string; show_as_partner: boolean; mou: SubmittedFile | null;
  review_note: string; reviewed_by: string; submitted_at: string | null; reviewed_at: string | null;
  decided_by_lead: boolean; leads: string[]; university_active: boolean; university_students: number;
  university_verified: number;
}
export const staffOf = (me: Me): StaffInfo | null => (me as Me & { staff?: StaffInfo | null }).staff ?? null;

export interface StaffRequestBody {
  university_id?: number | null; new_university?: string | null; new_university_region?: string;
  position: string; full_name: string; department: string; work_email: string; doc_id?: number | null;
  mou_id?: number | null; cooperation: string[]; website: string; telegram: string; social: string;
  data_pledge: boolean; show_as_partner: boolean;
}

export interface StaffRow {
  id: number; full_name: string; username: string | null; phone: string; email: string | null; photo_url: string | null;
  position: string; status: StaffStatus; role: StaffRole; university: string | null; university_id: number | null;
  new_university: boolean; university_region: string; department: string; work_email: string;
  doc: SubmittedFile | null; cooperation: string[]; website: string; telegram: string; social: string;
  mou: SubmittedFile | null; show_as_partner: boolean; review_note: string; reviewed_by: string;
  submitted_at: string | null; reviewed_at: string | null; leads: string[]; last_seen_at: string | null; created_at: string;
}

export interface Dashboard {
  university: string; university_info: { id: number; name: string; short_name: string; logo_url: string | null; students_total: number | null; city: string };
  role: StaffRole; students: number; new_7d: number; signups_weekly: number[];
  verified: number; pending_verification: number; active_7d: number; with_track: number; cv_public: number; open_to_work: number;
  percent: Record<string, number>; applications: Record<string, number>; applications_total: number; hired: number;
  placed: number; placement_rate: number | null; placement_students: number; min_sample: number; partners: number; open_jobs: number;
  companies_by_applications: { name: string; count: number }[]; companies_by_contacts: { name: string; count: number }[];
  by_course: { course: number | null; count: number }[]; by_faculty: { faculty: string; count: number }[];
  recent_hires: { student: string; job: string; company: string; date: string }[];
  todo: { pending_verification: number; outcomes_to_confirm: number; partner_requests: number; team_requests: number; profile_missing: string[] };
  upcoming_events: { id: number; title: string; kind: string; starts_at: string; location: string; registered: number }[];
}

export interface FacultyRow {
  faculty: string; students: number; verified: number; pending: number; active_7d: number; open_to_work: number;
  cv_public: number; with_track: number; applied: number; hired: number; placed: number;
}

export interface RosterRow {
  id: number; full_name: string; photo_url: string | null; faculty: string; course: number | null;
  group_name: string; student_number: string; graduation_year: number | null; verification: Verification;
  track: string | null; track_id: number | null; points: number; verified_tasks: number; open_to_work: boolean;
  cv_public: boolean; last_seen_at: string | null; created_at: string; applications: number; hired: boolean; placed: boolean;
  skills: string[];
}
export interface StudentCard extends RosterRow {
  languages: string[]; job_types: string[]; city: string; bio: string; headline: string; gpa: number | null; gpa_scale: number;
  github_url: string; linkedin_url: string; verified_by: string; verified_at: string | null;
  verification_note: string; cv_slug: string; completeness: { percent: number; missing: string[] }; streak: number;
  applications_list: { job: string; company: string; status: string; updated_at: string }[];
  outcomes: { company: string; position: string; kind: OutcomeKind; confirmed: boolean; confirmed_by: string; started_on: string | null }[];
  events: { title: string; starts_at: string; attended: boolean }[];
}
export interface Facets {
  faculties: { value: string; count: number }[]; groups: { value: string; count: number }[];
  courses: { value: number; count: number }[]; years: { value: number; count: number }[];
  tracks: { id: number; title: string; count: number }[];
  counts: { all: number; pending: number; verified: number; rejected: number; none: number; open_to_work: number; cv_public: number; inactive: number };
}
export type StudentFilter = Partial<Record<"q" | "faculty" | "course" | "group" | "verification" | "track_id" | "open_to_work"
  | "cv_public" | "activity" | "graduation_year" | "outcome", string>>;

export interface UniProfile {
  id: number; name: string; short_name: string; city: string; region: string; description: string; website: string;
  telegram: string; social: string; email: string; phone: string; address: string; founded_year: number | null;
  students_total: number | null; cooperation: string[]; show_as_partner: boolean; logo_url: string | null;
  mou: SubmittedFile | null; missing: string[]; faculties: string[];
}

export interface PartnerRow extends PartnershipRow { city: string; open_jobs: number; our_applicants: number; our_hires: number }
export interface DirectoryCompany {
  id: number; name: string; industry: string; city: string; size: string; website: string; logo_url: string | null;
  open_jobs: number; our_applicants: number; our_hires: number;
  partnership: { id: number; status: "pending" | "accepted" | "rejected"; initiated_by: "company" | "university" } | null;
}
export interface Opportunity extends Job { partner: boolean; recommended: boolean; our_applicants: number }

export interface Audience { faculty?: string; course?: number; group?: string; graduation_year?: number; verified_only?: boolean; open_to_work?: boolean }
export type Channel = "students" | "companies" | "public";
/** The staff's view of an announcement: the reader's card plus filters, channels, reach and author. */
export interface Announcement extends NewsItem { audience: Audience; channels: Channel[]; recipients: number; company_recipients: number; author: string | null }
export interface AnnouncementInput { title: string; text: string; link: string; audience: Audience; channels: Channel[]; category: NewsCategory; photo_ids: number[] }

export type EventKind = "career_day" | "job_fair" | "hackathon" | "workshop" | "open_day" | "meetup" | "other";
export const EVENT_KINDS: EventKind[] = ["career_day", "job_fair", "hackathon", "workshop", "open_day", "meetup", "other"];
export interface UniEvent {
  id: number; title: string; kind: EventKind; description: string; starts_at: string; ends_at: string | null; location: string;
  online_url: string; capacity: number | null; companies: string; audience: Audience; status: "published" | "cancelled";
  registered: number; attended: number; created_at: string; notified?: number; me_registered?: boolean;
}
export interface EventInput {
  title: string; kind: EventKind; description: string; starts_at: string; ends_at: string | null; location: string;
  online_url: string; capacity: number | null; companies: string; audience: Audience; notify: boolean;
}
export interface Registration { user_id: number; full_name: string; faculty: string; course: number | null; group_name: string; attended: boolean; created_at: string }

export interface UniversityStats {
  min_sample: number; students: number; with_graduation_year: number; placed: number; employed: number; interned: number;
  placement_rate: number | null; employed_rate: number | null; intern_rate: number | null;
  where: Record<OutcomeKind | "seeking" | "unknown", number>; self_reported: number; university_confirmed: number; hires_on_platform: number;
  top_employers: { name: string; count: number }[]; partners: number; cohorts: number[]; faculties: string[];
}
export interface OutcomeRow {
  id: number; student_id: number; student: string; faculty: string; graduation_year: number | null; company: string;
  position: string; kind: OutcomeKind; started_on: string | null; source: "application" | "self"; confirmed: boolean;
  confirmed_by: string; created_at: string;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const uapi = {
  requestStaff: (body: StaffRequestBody) => request<Me>("POST", "/me/staff-request", body),
  dashboard: () => request<Dashboard>("GET", "/university/dashboard"),
  faculties: () => request<FacultyRow[]>("GET", "/university/faculties"),
  roster: (f: StudentFilter, sort: string, page: number, limit: number) =>
    request<{ items: RosterRow[]; total: number; page: number; limit: number }>("GET", `/university/roster${qs({ ...f, sort, page, limit })}`),
  facets: (faculty?: string) => request<Facets>("GET", `/university/roster/facets${qs({ faculty })}`),
  student: (id: number) => request<StudentCard>("GET", `/university/students/${id}`),
  verify: (id: number, approve: boolean, note: string) => request<{ verification: string }>("POST", `/university/verifications/${id}`, { approve, note }),
  verifyBulk: (ids: number[], approve: boolean, note: string) => request<{ done: number; skipped: number }>("POST", "/university/verifications/bulk", { ids, approve, note }),
  exportStudents: (f: StudentFilter) => download(`/university/export.csv${qs(f)}`, "talabalar.csv"),
  exportFaculties: () => download("/university/faculties.csv", "fakultetlar.csv"),
  exportOutcomes: () => download("/university/outcomes.csv", "bandlik-yozuvlari.csv"),
  exportEvent: (id: number) => download(`/university/events/${id}/registrations.csv`, `tadbir-${id}.csv`),
  profile: () => request<UniProfile>("GET", "/university/profile"),
  editProfile: (changes: Partial<Omit<UniProfile, "id" | "name" | "short_name" | "logo_url" | "mou" | "missing">> & { logo_id?: number; mou_id?: number; remove_logo?: boolean }) =>
    request<UniProfile>("PATCH", "/university/profile", changes),
  team: () => request<{ me: { id: number; role: StaffRole }; rows: StaffRow[] }>("GET", "/university/team"),
  teamDecide: (id: number, decision: "approve" | "needs_info" | "reject", note = "") => request<StaffRow>("POST", `/university/team/${id}/decide`, { decision, note }),
  teamRevoke: (id: number, note = "") => request<{ status: string }>("POST", `/university/team/${id}/revoke`, { note }),
  teamRole: (id: number, role: "lead" | "member") => request<{ role: string }>("POST", `/university/team/${id}/role`, { role }),
  stats: (params: Record<string, string>) => request<UniversityStats>("GET", `/university/stats${qs(params)}`),
  outcomes: () => request<OutcomeRow[]>("GET", "/university/outcomes"),
  decideOutcome: (id: number, confirm: boolean, note = "") => request<{ confirmed: boolean }>("POST", `/university/outcomes/${id}`, { confirm, note }),
  partners: () => request<PartnerRow[]>("GET", "/university/partners"),
  companies: (q = "", industry = "") => request<DirectoryCompany[]>("GET", `/university/companies${qs({ q, industry })}`),
  askPartner: (companyId: number, message: string) => request<PartnershipRow>("POST", "/university/partners", { company_id: companyId, message }),
  decidePartner: (id: number, accept: boolean) => request<PartnershipRow>("POST", `/university/partners/${id}/decide`, { accept }),
  opportunities: () => request<Opportunity[]>("GET", "/university/opportunities"),
  unrecommend: (jobId: number) => request<{ recommended: boolean }>("DELETE", `/university/jobs/${jobId}/recommend`),
  recommend: (jobId: number, note: string, faculty?: string, course?: number) =>
    request<{ recommended: boolean; students: number }>("POST", `/university/jobs/${jobId}/recommend`, { note, faculty: faculty || null, course: course || null }),
  announcements: () => request<Announcement[]>("GET", "/university/announcements"),
  previewAudience: (a: Audience, channels: Channel[] = ["students"]) =>
    request<{ recipients: number; companies: number }>("POST", "/university/announcements/preview", { ...a, channels }),
  announce: (body: AnnouncementInput) => request<Announcement>("POST", "/university/announcements", body),
  deleteAnnouncement: (id: number) => request<{ deleted: boolean }>("DELETE", `/university/announcements/${id}`),
  events: (scope: "upcoming" | "past" | "all") => request<UniEvent[]>("GET", `/university/events?scope=${scope}`),
  createEvent: (e: EventInput) => request<UniEvent>("POST", "/university/events", e),
  editEvent: (id: number, e: EventInput) => request<UniEvent>("PATCH", `/university/events/${id}`, e),
  cancelEvent: (id: number) => request<UniEvent>("POST", `/university/events/${id}/cancel`),
  registrations: (id: number) => request<Registration[]>("GET", `/university/events/${id}/registrations`),
  attendance: (id: number, userIds: number[], attended: boolean) => request<{ updated: number }>("POST", `/university/events/${id}/attendance`, { user_ids: userIds, attended }),
  // the student side
  registerEvent: (id: number) => request<{ registered: boolean }>("POST", `/me/university/events/${id}/register`),
  unregisterEvent: (id: number) => request<{ registered: boolean }>("DELETE", `/me/university/events/${id}/register`),
  // admin
  adminStaff: (status: string) => request<StaffRow[]>("GET", `/admin/staff?status=${status}`, undefined, true),
  adminDecide: (id: number, decision: "approve" | "needs_info" | "reject", note = "") =>
    request<{ status: string; role: string }>("POST", `/admin/staff/${id}/review`, { decision, note }, true),
  adminRevoke: (id: number, note = "") => request<{ status: string }>("POST", `/admin/staff/${id}/revoke`, { note }, true),
};

export const COOPERATION = ["invite_students", "verify_students", "ambassadors", "introduce_companies", "dual", "venue",
  "job_fair", "hackathon", "announce"] as const;
export const POSITIONS = ["career_head", "career_staff", "vice_rector", "dean_deputy"] as const;
