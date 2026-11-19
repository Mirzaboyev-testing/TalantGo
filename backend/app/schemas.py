from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from pydantic import (AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, computed_field, field_validator,
                      model_validator)

from .models import ReviewKind, Role, Status
from .services.catalog import (COMPANY_SIZES, CONTACT_ROLES, COOPERATION, INDUSTRIES, JOB_FIELDS, LEGAL_FORMS, OWNERSHIP,
                               REGIONS)
from .services.files import logo_url


def _http_url(value: str) -> str:
    """Accept links typed without the scheme ("github.com/me"); an empty value means "not given"."""
    if not value:
        return value
    if not value.startswith(("https://", "http://")):
        value = f"https://{value}"
    host = value.split("://", 1)[1].split("/", 1)[0]
    if "." not in host or " " in value:
        raise ValueError("Havola noto'g'ri: masalan, github.com/ismingiz")
    return value


Url = Annotated[str, StringConstraints(strip_whitespace=True, max_length=512), AfterValidator(_http_url)]
Goal = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]
Tag = Goal
# Uzbek mobile number in international form, e.g. +998901234567
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^(\+\d{8,15})?$")]
JobKind = Literal["internship", "part_time", "junior", "project"]
WorkMode = Literal["office", "remote", "hybrid"]


def _one_of(values, what: str):
    def check(value: str) -> str:
        if value not in values:
            raise ValueError(f"{what} ro'yxatdan tanlang")
        return value
    return AfterValidator(check)


Industry = Annotated[str, _one_of(INDUSTRIES, "Sohani")]
JobField = Annotated[str, _one_of(JOB_FIELDS, "Kasb yo'nalishini")]


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
    moved_to: str | None = None      # opened from the old bot: the new bot's @username


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


class FileOut(BaseModel):
    id: int
    name: str
    size: int
    mime: str
    url: str                 # a signed link, valid for a few hours


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
    files: list[FileOut] = []
    ai_state: str = ""
    ai_note: str = ""


class TaskOut(ORM):
    id: int
    track_id: int
    week: int
    title: str
    description: str
    proof_hint: str
    points: int
    kind: str = "submission"
    mentor: str | None = None
    criteria: str = ""
    questions: int = 0
    submission: SubmissionOut | None = None


class SubmitIn(BaseModel):
    proof_url: Url = ""
    note: str = Field(default="", max_length=1000)
    file_ids: list[int] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def _has_proof(self):
        if not self.proof_url and not self.file_ids:
            raise ValueError("Havola qo'shing yoki kamida bitta fayl yuklang")
        return self


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
    criteria: str = ""
    files: list[FileOut] = []


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
    show_telegram: bool = False
    invite_code: str
    invited_count: int
    headline: str
    completeness: dict
    consent_current: bool = False
    work_industries: list[str] = []
    job_fields: list[str] = []
    cover_url: str | None = None
    has_photo_upload: bool = False
    portfolio_n: int = 0
    job_title: str = ""
    signup_missing: list[str] = []
    email: str | None = None
    has_password: bool = False
    must_change_password: bool = False   # signed in with a temporary password from the owner: set a new one first
    token: str | None = None             # a fresh session after a password change (the old ones end)
    notify_prefs: dict = {}              # bot settings: {"telegram": bool, "muted": [category, ...]} (services/notify.py)
    telegram_blocked: bool = False       # the bot could not reach them last time (blocked it or deleted the chat)
    has_telegram: bool = True
    language: str = "uz"
    visible_to_employers: bool = True
    staff: dict | None = None          # a university staff request: role, details, review note (api/university.py)


class MeUpdate(BaseModel):
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=128)] | None = None
    track_id: int | None = None
    university: str | None = Field(default=None, max_length=120)
    group_name: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=600)
    headline: str | None = Field(default=None, max_length=120)
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
    show_telegram: bool | None = None
    work_industries: list[Industry] | None = Field(default=None, max_length=6)
    job_fields: list[JobField] | None = Field(default=None, max_length=5)
    job_title: str | None = Field(default=None, max_length=120)
    language: Literal["uz", "ru", "en"] | None = None
    visible_to_employers: bool | None = None


class UniversityOut(ORM):
    id: int
    name: str
    short_name: str
    city: str
    faculties: list[str] = []


class CompanyOut(ORM):
    id: int
    name: str
    stir: str | None
    industry: str
    website: str
    city: str
    description: str
    legal_form: str = ""
    size: str = ""
    telegram: str = ""
    address: str = ""
    email: str = ""
    status: str
    review_note: str
    created_at: datetime
    ownership: str = ""
    contact_role: str = ""
    cooperation: list[str] = []
    wanted_track_ids: list[int] = []
    show_as_partner: bool = False
    registration_doc_id: int | None = None
    authority_doc_id: int | None = None
    logo_file_id: int | None = None
    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None

    @computed_field
    @property
    def logo_url(self) -> str | None:
        return logo_url(self.id, self.logo_file_id, self.status)


def _optional_one_of(values, what: str):
    def check(value: str) -> str:
        if value and value not in values:
            raise ValueError(f"{what} ro'yxatdan tanlang")
        return value
    return AfterValidator(check)


def _all_in(values, what: str):
    def check(items: list[str]) -> list[str]:
        if any(i not in values for i in items):
            raise ValueError(f"{what} ro'yxatdan tanlang")
        return list(dict.fromkeys(items))
    return AfterValidator(check)


class CompanyIn(BaseModel):
    """Everything marked required on the sign-up form is required here too."""
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
    stir: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{9}$")]
    legal_form: Annotated[str, _one_of(LEGAL_FORMS, "Kompaniya turini")]
    industry: Industry
    size: Annotated[str, _one_of(COMPANY_SIZES, "Xodimlar sonini")]
    city: Annotated[str, _one_of(REGIONS, "Viloyat yoki shaharni")]
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=2000)]
    website: Url = ""
    telegram: Annotated[str, StringConstraints(strip_whitespace=True, max_length=128)] = ""
    address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120,
                                            pattern=r"^([^@\s]+@[^@\s]+\.[^@\s]+)?$")] = ""
    # asked since 2026-11-17; an edit that leaves them out keeps what is saved
    ownership: Annotated[str, _optional_one_of(OWNERSHIP, "Kompaniya turini")] = ""
    contact_role: Annotated[str, _optional_one_of(CONTACT_ROLES, "Kompaniyadagi rolingizni")] = ""
    cooperation: Annotated[list[str], Field(max_length=len(COOPERATION)), _all_in(COOPERATION, "Hamkorlik turini")] = []
    wanted_track_ids: Annotated[list[int], Field(max_length=20)] = []
    show_as_partner: bool = False
    registration_doc_id: int | None = None
    authority_doc_id: int | None = None
    logo_file_id: int | None = None


class EmployerSignupIn(CompanyIn):
    """Sign-up as an employer, in steps on the form: the person, the company, documents, what it wants from
    students. Everything starred there is required here: an admin checks the STIR against the document."""
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=128)]
    job_title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=50, max_length=2000)]
    ownership: Annotated[str, _one_of(OWNERSHIP, "Kompaniya turini")]
    contact_role: Annotated[str, _one_of(CONTACT_ROLES, "Kompaniyadagi rolingizni")]
    cooperation: Annotated[list[str], Field(min_length=1, max_length=len(COOPERATION)),
                           _all_in(COOPERATION, "Hamkorlik turini")]
    registration_doc_id: int
    consent: bool
    data_pledge: bool          # student data only for hiring, never passed on

    @model_validator(mode="after")
    def _consent(self):
        if not self.consent:
            raise ValueError("Shaxsiy ma'lumotlarni qayta ishlashga rozilik bering")
        if not self.data_pledge:
            raise ValueError("Talabalar ma'lumotlaridan faqat ishga olish uchun foydalanishga rozilik bering")
        if self.contact_role == "representative" and not self.authority_doc_id:
            raise ValueError("Direktor bo'lmasangiz, vakolat xati yoki ishonchnomani yuklang")
        return self


class StaffRequestIn(BaseModel):
    """University career-centre staff ask for access. Older clients send only the university and position;
    the website form (2026-11-17) sends the rest. A university not in the list is proposed by name."""
    university_id: int | None = None
    new_university: str | None = Field(default=None, min_length=3, max_length=200)
    new_university_region: str = Field(default="", max_length=60)
    position: str = Field(min_length=3, max_length=120)
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=128)] | None = None
    department: str = Field(default="", max_length=120)
    work_email: str = Field(default="", max_length=120)
    doc_id: int | None = None
    mou_id: int | None = None
    cooperation: list[str] = Field(default_factory=list, max_length=12)
    website: str = Field(default="", max_length=256)
    telegram: str = Field(default="", max_length=128)
    social: str = Field(default="", max_length=256)
    data_pledge: bool = False          # "only my own students; personal data only with their consent"
    show_as_partner: bool = False

    @model_validator(mode="after")
    def _one_university(self):
        if not self.university_id and not self.new_university:
            raise ValueError("Universitetni tanlang yoki nomini yozing")
        return self


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
    job_fields: list[JobField] = Field(default_factory=list, max_length=3)
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
    company_logo_url: str | None = None        # an approved company's logo, public (job_out fills it)
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
    job_fields: list[str] = []
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
    saved: bool = False
    # the company's own list only: universities that recommended this vacancy to their students
    recommended_by: list[dict] = []


class ApplyIn(BaseModel):
    note: str = Field(default="", max_length=1500)


class MyApplicationOut(BaseModel):
    id: int
    status: str
    note: str
    created_at: datetime
    updated_at: datetime
    interview_at: datetime | None = None
    interview_place: str = ""
    history: list[dict] = []          # [{status, at}], oldest first
    job: JobOut


class ApplicantOut(BaseModel):
    id: int
    status: str
    note: str
    employer_note: str
    created_at: datetime
    updated_at: datetime | None = None
    interview_at: datetime | None = None
    interview_place: str = ""
    card: dict
    identity: dict


class ApplicationPatch(BaseModel):
    status: Literal["viewed", "shortlisted", "interview", "offer", "hired", "rejected"] | None = None
    employer_note: str | None = Field(default=None, max_length=1000)
    interview_at: datetime | None = None
    interview_place: str | None = Field(default=None, max_length=300)

    @field_validator("interview_at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        # a time typed without a zone is Tashkent time
        v = v.replace(tzinfo=ZoneInfo("Asia/Tashkent")) if v is not None and v.tzinfo is None else v
        if v is not None and v < datetime.now(ZoneInfo("Asia/Tashkent")) - timedelta(days=1):
            raise ValueError("Suhbat vaqti o'tib ketgan")
        return v


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
    username: str | None = None
    previous_username: str | None = None      # the old bot that sends people to the new one


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
    email: str | None = None
    has_telegram: bool = True
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
    files: list[FileOut] = []
    ai_note: str = ""


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
    audience: Literal["students", "companies", "universities", "all"] = "students"
    track_id: int | None = None                     # the three filters below narrow "students" only
    group_name: str | None = Field(default=None, max_length=40)
    university_id: int | None = None


class AnnouncementOut(ORM):
    id: int
    text: str
    audience: str
    created_by: str
    total: int
    sent: int
    failed: int
    in_app: int = 0
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
    faculties: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]] | None = Field(default=None, max_length=60)
