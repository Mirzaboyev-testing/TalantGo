from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from .models import ReviewKind, Role, Status


def _http_url(value: str) -> str:
    if value and not value.startswith(("https://", "http://")):
        raise ValueError("Havola https:// bilan boshlanishi kerak")
    return value


Url = Annotated[str, StringConstraints(strip_whitespace=True, max_length=512), AfterValidator(_http_url)]
Goal = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]


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


class MeUpdate(BaseModel):
    track_id: int | None = None
    university: str | None = Field(default=None, max_length=120)
    group_name: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=600)
    goals: list[Goal] | None = Field(default=None, max_length=8)
    github_url: Url | None = None
    linkedin_url: Url | None = None
    cv_public: bool | None = None


class PeerOut(BaseModel):
    id: int
    full_name: str
    username: str | None
    photo_url: str | None
    track_title: str | None
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
    verified_tasks: int = 0
    last_seen_at: datetime | None
    created_at: datetime


class UserPatch(BaseModel):
    role: Role | None = None
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
