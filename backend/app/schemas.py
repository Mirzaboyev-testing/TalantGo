from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .models import ReviewKind, Role, Status


def _http_url(value: str) -> str:
    if value and not value.startswith(("https://", "http://")):
        raise ValueError("Havola https:// bilan boshlanishi kerak")
    return value


Url = Annotated[str, StringConstraints(strip_whitespace=True, max_length=512), AfterValidator(_http_url)]
Goal = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]
Tag = Goal
# Uzbek mobile number in international form, e.g. +998901234567
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^(\+998\d{9})?$")]
JobKind = Literal["internship", "part_time", "junior", "project"]
WorkMode = Literal["office", "remote", "hybrid"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- auth

class TelegramAuthIn(BaseModel):
    init_data: str = Field(min_length=10, max_length=4096)


class DevAuthIn(BaseModel):
    telegram_id: int
    full_name: str = Field(min_length=1, max_length=128)
    username: str | None = None


class AdminLoginIn(BaseModel):
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


class TokenOut(BaseModel):
    token: str


# --------------------------------------------------------------------------- tracks & tasks

class TrackOut(ORM):
    id: int
    slug: str
    title: str
    icon: str
    description: str


class ReviewOut(ORM):
    reviewer_name: str
    kind: ReviewKind
    approved: bool
    comment: str
    created_at: datetime


class SubmissionOut(ORM):
    id: int
    task_id: int
    proof_url: str
    note: str
    status: Status
    round: int
    points_awarded: int
    created_at: datetime
    verified_at: datetime | None
    reviews: list[ReviewOut] = []


class TaskOut(ORM):
    id: int
    track_id: int
    week: int
    title: str
    description: str
    proof_hint: str
    points: int
    submission: SubmissionOut | None = None


class SubmitIn(BaseModel):
    proof_url: Annotated[Url, StringConstraints(min_length=10)]
    note: str = Field(default="", max_length=1000)


class ReviewIn(BaseModel):
    approved: bool
    comment: str = Field(min_length=10, max_length=1000,
                         description="Kamida 10 belgi: nima yaxshi, nima yetishmaydi")


class QueueItem(BaseModel):
    submission_id: int
    status: Status
    task_title: str
    track_title: str
    proof_hint: str
    proof_url: str
    note: str
    author_name: str
    peer_reviews: int
    submitted_at: datetime


# --------------------------------------------------------------------------- people

class MeOut(ORM):
    id: int
    full_name: str
    username: str | None
    photo_url: str | None
    role: Role
    track: TrackOut | None
    university: str
    group_name: str
    bio: str
    goals: list[str]
    github_url: str
    linkedin_url: str
    points: int
    streak: int
    rank_overall: int
    cv_slug: str
    cv_public: bool
    is_owner: bool
    account_type: str
    has_consent: bool
    university_ref: "UniversityOut | None"
    faculty: str
    course: int | None
    graduation_year: int | None
    gpa: float | None
    gpa_scale: int
    student_number: str
    skills: list[str]
    languages: list[str]
    job_types: list[str]
    city: str
    open_to_work: bool
    verification: str
    verified_by: str
    verification_note: str
    company: "CompanyOut | None"
    staff_university: "UniversityOut | None"
    staff_status: str
    staff_position: str
    phone: str
    phone_verified: bool
    show_phone: bool
    invite_code: str
    invited_count: int
    completeness: dict


class MeUpdate(BaseModel):
    track_id: int | None = None
    university: str | None = Field(default=None, max_length=120)
    group_name: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=600)
    goals: list[Goal] | None = Field(default=None, max_length=8)
    github_url: Url | None = None
    linkedin_url: Url | None = None
    cv_public: bool | None = None
    consent: bool | None = None
    university_id: int | None = None
    faculty: str | None = Field(default=None, max_length=120)
    course: int | None = Field(default=None, ge=1, le=7)
    graduation_year: int | None = Field(default=None, ge=2020, le=2040)
    gpa: float | None = Field(default=None, ge=0, le=5)
    gpa_scale: Literal[4, 5] | None = None
    student_number: str | None = Field(default=None, max_length=32)
    skills: list[Tag] | None = Field(default=None, max_length=20)
    languages: list[Tag] | None = Field(default=None, max_length=6)
    job_types: list[JobKind] | None = None
    city: str | None = Field(default=None, max_length=60)
    open_to_work: bool | None = None
    phone: Phone | None = None
    show_phone: bool | None = None


class UniversityOut(ORM):
    id: int
    name: str
    short_name: str
    city: str


class CompanyOut(ORM):
    id: int
    name: str
    stir: str | None
    industry: str
    website: str
    city: str
    description: str
    status: str
    review_note: str


class CompanyIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    stir: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{9}$")] | None = None
    industry: str = Field(default="", max_length=80)
    website: Url = ""
    city: str = Field(default="", max_length=60)
    description: str = Field(default="", max_length=2000)


class StaffRequestIn(BaseModel):
    university_id: int
    position: str = Field(min_length=3, max_length=120)


class JobIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    kind: JobKind
    work_mode: WorkMode = "office"
    city: str = Field(default="", max_length=60)
    is_paid: bool = True
    salary_from: int | None = Field(default=None, ge=0, le=1_000_000_000)
    salary_to: int | None = Field(default=None, ge=0, le=1_000_000_000)
    hours_per_week: int | None = Field(default=None, ge=1, le=60)
    description: str = Field(min_length=20, max_length=5000)
    requirements: str = Field(default="", max_length=3000)
    skills: list[Tag] = Field(default_factory=list, max_length=15)
    track_ids: list[int] = Field(default_factory=list, max_length=10)
    counts_as_practice: bool = False
    deadline: date | None = None
    # Platform rule (as on Handshake): no MLM, no commission-only pay, no fees charged to students
    rules_accepted: bool = Field(exclude=True)

    @model_validator(mode="after")
    def _salary(self):
        if not self.rules_accepted:
            raise ValueError("Platforma qoidalarini tasdiqlang: MLM, faqat foizga ishlash va talabadan pul olish taqiqlangan")
        if self.salary_from is not None and self.salary_to is not None and self.salary_to < self.salary_from:
            raise ValueError("Maosh oralig'i noto'g'ri: «gacha» qiymati «dan» dan kichik")
        if not self.is_paid:
            self.salary_from = self.salary_to = None
        return self


class JobOut(ORM):
    id: int
    company_id: int
    company_name: str = ""
    company_industry: str = ""
    title: str
    kind: str
    work_mode: str
    city: str
    is_paid: bool
    salary_from: int | None
    salary_to: int | None
    hours_per_week: int | None
    description: str
    requirements: str
    skills: list[str]
    track_ids: list[int]
    counts_as_practice: bool
    deadline: date | None
    status: str
    review_note: str
    views: int
    created_at: datetime
    applied: bool = False
    application_status: str | None = None
    match: int = 0
    applications: int = 0


class ApplyIn(BaseModel):
    note: str = Field(default="", max_length=1500)


class MyApplicationOut(BaseModel):
    id: int
    status: str
    note: str
    created_at: datetime
    updated_at: datetime
    job: JobOut


class ApplicantOut(BaseModel):
    id: int
    status: str
    note: str
    employer_note: str
    created_at: datetime
    card: dict
    identity: dict


class ApplicationPatch(BaseModel):
    status: Literal["viewed", "shortlisted", "rejected", "hired"] | None = None
    employer_note: str | None = Field(default=None, max_length=1000)


class ContactIn(BaseModel):
    message: str = Field(min_length=10, max_length=1000)
    job_id: int | None = None


class ContactAnswerIn(BaseModel):
    accept: bool


class ReviewDecisionIn(BaseModel):
    approve: bool
    note: str = Field(default="", max_length=500)


class PeerOut(BaseModel):
    id: int
    full_name: str
    username: str | None
    photo_url: str | None
    track_title: str | None
    track_icon: str = ""
    university: str | None = None
    faculty: str = ""
    course: int | None = None
    phone: str | None = None              # only when the student chose to show it
    group_name: str
    goals: list[str]
    points: int
    streak: int
    verified_tasks: int


class LeaderRow(BaseModel):
    rank: int
    id: int
    full_name: str
    group_name: str
    university: str | None = None
    course: int | None = None
    track_icon: str
    points: int
    is_me: bool


class LeaderboardOut(BaseModel):
    rows: list[LeaderRow]
    my_rank: int


# --------------------------------------------------------------------------- admin

class BotTokenIn(BaseModel):
    token: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{5,}:[A-Za-z0-9_-]{30,}$")]


class BotStatusOut(BaseModel):
    configured: bool
    hint: str | None
    public_url: str


class AdminMeOut(BaseModel):
    name: str
    is_owner: bool


class AdminUserOut(ORM):
    id: int
    full_name: str
    username: str | None
    role: Role
    is_owner: bool
    is_blocked: bool
    track_id: int | None
    university: str
    group_name: str
    points: int
    account_type: str = "student"
    verification: str = "none"
    company_id: int | None = None
    verified_tasks: int = 0
    last_seen_at: datetime | None
    created_at: datetime


class UserPatch(BaseModel):
    role: Role | None = None
    company_id: int | None = None          # attach an HR person to an existing company
    is_owner: bool | None = None
    is_blocked: bool | None = None
    group_name: str | None = Field(default=None, max_length=40)
    university: str | None = Field(default=None, max_length=120)


class PointsAdjustIn(BaseModel):
    delta: int = Field(ge=-1000, le=1000)
    reason: str = Field(min_length=5, max_length=300)


class AdminSubmissionOut(BaseModel):
    id: int
    status: Status
    round: int
    points_awarded: int
    proof_url: str
    note: str
    task_title: str
    track_title: str
    author_id: int
    author_name: str
    reviews: list[ReviewOut]
    updated_at: datetime


class AdminTrackOut(ORM):
    id: int
    slug: str
    title: str
    icon: str
    description: str
    sort_order: int
    is_active: bool
    student_count: int = 0
    task_count: int = 0


class TrackIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    icon: str = Field(default="📘", max_length=8)
    description: str = Field(default="", max_length=600)
    slug: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[a-z0-9-]{2,40}$")] | None = None


class TrackPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=120)
    icon: str | None = Field(default=None, max_length=8)
    description: str | None = Field(default=None, max_length=600)
    sort_order: int | None = Field(default=None, ge=0, le=1000)
    is_active: bool | None = None


class AdminTaskOut(ORM):
    id: int
    track_id: int
    week: int
    sort_order: int
    title: str
    description: str
    proof_hint: str
    points: int
    is_active: bool


class TaskIn(BaseModel):
    track_id: int
    week: int = Field(ge=1, le=52)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=10)
    proof_hint: str = ""
    points: int = Field(ge=1, le=200)


class TaskPatch(BaseModel):
    week: int | None = Field(default=None, ge=1, le=52)
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, min_length=10)
    proof_hint: str | None = None
    points: int | None = Field(default=None, ge=1, le=200)
    is_active: bool | None = None


class AnnouncementIn(BaseModel):
    text: str = Field(min_length=3, max_length=3500)
    track_id: int | None = None
    group_name: str | None = Field(default=None, max_length=40)


class AnnouncementOut(ORM):
    id: int
    text: str
    audience: str
    created_by: str
    total: int
    sent: int
    failed: int
    created_at: datetime
    finished_at: datetime | None


class AuditOut(ORM):
    id: int
    actor: str
    action: str
    target: str
    details: str
    created_at: datetime


MeOut.model_rebuild()


class UniversityIn(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    short_name: str = Field(min_length=2, max_length=40)
    city: str = Field(default="", max_length=60)


class UniversityPatch(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=200)
    short_name: str | None = Field(default=None, min_length=2, max_length=40)
    city: str | None = Field(default=None, max_length=60)
    is_active: bool | None = None
