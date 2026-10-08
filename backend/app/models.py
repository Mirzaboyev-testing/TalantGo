import enum
import secrets
from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, Date, DateTime, Enum, Float, ForeignKey,
                        Index, Integer, String, Text, UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .core.db import Base


class Role(str, enum.Enum):
    student = "student"
    mentor = "mentor"
    admin = "admin"


class Status(str, enum.Enum):
    pending = "pending"                  # waiting for reviews
    peer_verified = "peer_verified"      # enough peers approved: points awarded
    mentor_verified = "mentor_verified"  # a mentor signed off: bonus awarded, highest trust
    rejected = "rejected"                # can be resubmitted as a new round


class ReviewKind(str, enum.Enum):
    peer = "peer"
    mentor = "mentor"
    ai = "ai"                            # the Gemini first pass: counts as one peer vote


AI_REVIEWER_NAME = "AI yordamchi"


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(cls, name=name, values_callable=lambda e: [m.value for m in e])


# Plain strings with CHECK constraints (not PostgreSQL enums) for values that will keep growing.
ACCOUNT_TYPES = ("student", "employer", "university")
VERIFICATION = ("none", "pending", "verified", "rejected")
REVIEW_STATES = ("pending", "approved", "rejected")
JOB_KINDS = ("internship", "part_time", "junior", "project")
WORK_MODES = ("office", "remote", "hybrid")
JOB_STATES = ("pending", "approved", "rejected", "closed")
APPLICATION_STATES = ("new", "viewed", "shortlisted", "rejected", "hired")
CONTACT_STATES = ("pending", "accepted", "declined")


def _in(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    return CheckConstraint(f"{column} IN ({', '.join(repr(v) for v in values)})", name=name)


class University(Base):
    __tablename__ = "universities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    short_name: Mapped[str] = mapped_column(String(40))
    city: Mapped[str] = mapped_column(String(60), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (_in("status", REVIEW_STATES, "company_status_valid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    stir: Mapped[str | None] = mapped_column(String(9), unique=True)     # taxpayer ID, checked by an admin
    industry: Mapped[str] = mapped_column(String(80), default="")
    website: Mapped[str] = mapped_column(String(256), default="")
    city: Mapped[str] = mapped_column(String(60), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    review_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(8), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    tasks: Mapped[list["Task"]] = relationship(back_populates="track", order_by="Task.sort_order", lazy="raise")


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("track_id", "sort_order"),
        CheckConstraint("points > 0", name="task_points_positive"),
        CheckConstraint("week > 0", name="task_week_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    week: Mapped[int] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    proof_hint: Mapped[str] = mapped_column(Text, default="")
    points: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # "submission": a proof link reviewed by peers; "profile": done inside the app, checked by the system
    kind: Mapped[str] = mapped_column(String(16), default="submission", server_default="submission")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))  # a mentor's task
    criteria: Mapped[str] = mapped_column(Text, default="", server_default="")   # how the work is judged (people and AI)

    track: Mapped[Track] = relationship(back_populates="tasks", lazy="selectin")
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id], lazy="selectin")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("points >= 0", name="user_points_nonnegative"),
        CheckConstraint("streak_count >= 0", name="user_streak_nonnegative"),
        Index("ix_users_goals", "goals", postgresql_using="gin"),
        Index("ix_users_track_points", "track_id", "points"),
        Index("ix_users_skills", "skills", postgresql_using="gin"),
        _in("account_type", ACCOUNT_TYPES, "user_account_type_valid"),
        _in("verification", VERIFICATION, "user_verification_valid"),
        CheckConstraint("course IS NULL OR course BETWEEN 1 AND 7", name="user_course_range"),
        CheckConstraint("gpa IS NULL OR (gpa >= 0 AND gpa <= gpa_scale)", name="user_gpa_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    username: Mapped[str | None] = mapped_column(String(64))
    full_name: Mapped[str] = mapped_column(String(128))
    photo_url: Mapped[str | None] = mapped_column(String(512))
    role: Mapped[Role] = mapped_column(_enum(Role, "user_role"), default=Role.student)
    track_id: Mapped[int | None] = mapped_column(ForeignKey("tracks.id", ondelete="SET NULL"))
    university: Mapped[str] = mapped_column(String(120), default="")
    group_name: Mapped[str] = mapped_column(String(40), default="", index=True)
    bio: Mapped[str] = mapped_column(Text, default="")
    headline: Mapped[str] = mapped_column(String(120), default="", server_default="")   # "Iqtisodiyot talabasi | Data Analytics"
    goals: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, server_default="{}")
    github_url: Mapped[str] = mapped_column(String(256), default="")
    linkedin_url: Mapped[str] = mapped_column(String(256), default="")
    points: Mapped[int] = mapped_column(Integer, default=0)
    streak_count: Mapped[int] = mapped_column(Integer, default=0)
    last_active_on: Mapped[date | None] = mapped_column(Date)
    cv_slug: Mapped[str] = mapped_column(String(16), unique=True, default=lambda: secrets.token_urlsafe(8))
    cv_public: Mapped[bool] = mapped_column(Boolean, default=False)
    is_owner: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    account_type: Mapped[str] = mapped_column(String(16), default="student", server_default="student")
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))   # personal-data consent
    # student career profile (what employers filter on)
    university_id: Mapped[int | None] = mapped_column(ForeignKey("universities.id", ondelete="SET NULL"), index=True)
    faculty: Mapped[str] = mapped_column(String(120), default="", server_default="")
    course: Mapped[int | None] = mapped_column(Integer)
    graduation_year: Mapped[int | None] = mapped_column(Integer)
    gpa: Mapped[float | None] = mapped_column(Float)
    gpa_scale: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    student_number: Mapped[str] = mapped_column(String(32), default="", server_default="")   # HEMIS ID, private
    skills: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, server_default="{}")
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, server_default="{}")
    job_types: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list, server_default="{}")
    city: Mapped[str] = mapped_column(String(60), default="", server_default="")
    phone: Mapped[str] = mapped_column(String(20), default="", server_default="")
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")   # shared via Telegram
    show_phone: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")       # visible to peers
    referred_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    open_to_work: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    verification: Mapped[str] = mapped_column(String(16), default="none", server_default="none")
    verified_by: Mapped[str] = mapped_column(String(160), default="", server_default="")
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_note: Mapped[str] = mapped_column(Text, default="", server_default="")
    # employer and university staff accounts
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    staff_university_id: Mapped[int | None] = mapped_column(ForeignKey("universities.id", ondelete="SET NULL"))
    staff_status: Mapped[str] = mapped_column(String(16), default="", server_default="")
    staff_position: Mapped[str] = mapped_column(String(120), default="", server_default="")
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    track: Mapped[Track | None] = relationship(lazy="selectin")
    university_ref: Mapped[University | None] = relationship(foreign_keys=[university_id], lazy="selectin")
    company: Mapped[Company | None] = relationship(lazy="selectin")
    staff_university: Mapped[University | None] = relationship(foreign_keys=[staff_university_id], lazy="selectin")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("user_id", "task_id"),
        CheckConstraint("points_awarded >= 0", name="submission_points_nonnegative"),
        CheckConstraint("round >= 1", name="submission_round_positive"),
        Index("ix_submissions_status_task", "status", "task_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    proof_url: Mapped[str] = mapped_column(String(512))
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[Status] = mapped_column(_enum(Status, "submission_status"), default=Status.pending)
    round: Mapped[int] = mapped_column(Integer, default=1)
    points_awarded: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # AI first pass for the current round: "" (off), checking, done, unsure (left to people), failed
    ai_state: Mapped[str] = mapped_column(String(16), default="", server_default="")
    ai_note: Mapped[str] = mapped_column(Text, default="", server_default="")    # the AI's remark when unsure

    task: Mapped[Task] = relationship(lazy="selectin")
    user: Mapped[User] = relationship(lazy="selectin")
    reviews: Mapped[list["Review"]] = relationship(back_populates="submission", lazy="selectin",
                                                   order_by="Review.created_at", cascade="all, delete-orphan")
    files: Mapped[list["SubmissionFile"]] = relationship(back_populates="submission", lazy="selectin",
                                                         order_by="SubmissionFile.id", cascade="all, delete-orphan")

    @property
    def current_reviews(self) -> list["Review"]:
        return [r for r in self.reviews if r.round == self.round]

    @property
    def current_files(self) -> list["SubmissionFile"]:
        return [f for f in self.files if f.round == self.round]


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("submission_id", "reviewer_id", "round"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # empty: AI
    round: Mapped[int] = mapped_column(Integer)
    kind: Mapped[ReviewKind] = mapped_column(_enum(ReviewKind, "review_kind"))
    approved: Mapped[bool] = mapped_column(Boolean)
    comment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submission: Mapped[Submission] = relationship(back_populates="reviews", lazy="raise")
    reviewer: Mapped[User | None] = relationship(lazy="selectin")

    @property
    def reviewer_name(self) -> str:
        return self.reviewer.full_name if self.reviewer else AI_REVIEWER_NAME


class SubmissionFile(Base):
    """A file attached to a submission (Excel, PDF, screenshot...). Uploaded first, attached on submit."""
    __tablename__ = "submission_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    submission_id: Mapped[int | None] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer, default=1)
    filename: Mapped[str] = mapped_column(String(200))
    stored_name: Mapped[str] = mapped_column(String(64), unique=True)       # random name on disk
    mime: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submission: Mapped[Submission | None] = relationship(back_populates="files", lazy="raise")


class AssistantMessage(Base):
    """One turn of a person's CareerFlow.ai conversation. Readable by that person and admins only."""
    __tablename__ = "assistant_messages"
    __table_args__ = (CheckConstraint("role IN ('user', 'model')", name="assistant_role_valid"),
                      Index("ix_assistant_messages_user_id_id", "user_id", "id"))

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(8))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskQuestion(Base):
    """A student's question about a task. Answers are visible to everyone on the track, like a FAQ."""
    __tablename__ = "task_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    answered_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship(lazy="selectin")
    user: Mapped[User] = relationship(foreign_keys=[user_id], lazy="selectin")
    answered_by: Mapped[User | None] = relationship(foreign_keys=[answered_by_id], lazy="selectin")


class AppSetting(Base):
    """Encrypted operator settings pasted in the admin page (bot token, later AI keys)."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    ciphertext: Mapped[str] = mapped_column(Text)
    hint: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AppConfig(Base):
    """Plain (non-secret) settings the owner can change, such as the review rules."""
    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    """Every management action, so admins are accountable for what they change."""
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(60))
    target: Mapped[str] = mapped_column(String(200), default="")
    details: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    audience: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[str] = mapped_column(String(160))
    total: Mapped[int] = mapped_column(Integer, default=0)
    sent: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Job(Base):
    """Early-career only: internships, part-time, junior roles and paid projects."""
    __tablename__ = "jobs"
    __table_args__ = (
        _in("kind", JOB_KINDS, "job_kind_valid"),
        _in("work_mode", WORK_MODES, "job_work_mode_valid"),
        _in("status", JOB_STATES, "job_status_valid"),
        CheckConstraint("salary_from IS NULL OR salary_from >= 0", name="job_salary_nonnegative"),
        CheckConstraint("salary_to IS NULL OR salary_from IS NULL OR salary_to >= salary_from", name="job_salary_order"),
        Index("ix_jobs_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(16))
    work_mode: Mapped[str] = mapped_column(String(16), default="office")
    city: Mapped[str] = mapped_column(String(60), default="")
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)
    salary_from: Mapped[int | None] = mapped_column(Integer)          # so'm per month
    salary_to: Mapped[int | None] = mapped_column(Integer)
    hours_per_week: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    requirements: Mapped[str] = mapped_column(Text, default="")
    skills: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, server_default="{}")
    track_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list, server_default="{}")
    counts_as_practice: Mapped[bool] = mapped_column(Boolean, default=False)   # usable as malakaviy amaliyot
    deadline: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    review_note: Mapped[str] = mapped_column(Text, default="")
    views: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped[Company] = relationship(lazy="selectin")


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("job_id", "user_id"), _in("status", APPLICATION_STATES, "application_status_valid"))

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="new")
    employer_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    job: Mapped[Job] = relationship(lazy="selectin")
    user: Mapped[User] = relationship(lazy="selectin")


class ContactRequest(Base):
    """An employer asks to see an anonymous student's identity; the student decides."""
    __tablename__ = "contact_requests"
    __table_args__ = (UniqueConstraint("company_id", "student_id"), _in("status", CONTACT_STATES, "contact_status_valid"))

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    employer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    company: Mapped[Company] = relationship(lazy="selectin")
    student: Mapped[User] = relationship(foreign_keys=[student_id], lazy="selectin")
    job: Mapped[Job | None] = relationship(lazy="selectin")


class AdminAccount(Base):
    """A person who manages CareerFlow on the admin website. Not a Telegram user."""
    __tablename__ = "admin_accounts"
    __table_args__ = (_in("role", ("owner", "admin"), "admin_role_valid"),
                      _in("status", ("pending", "active", "disabled"), "admin_status_valid"))

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(16), default="admin")
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Group(Base):
    """A chat space inside CareerFlow. Official groups (the whole community, one per track) are open;
    groups people create themselves are private: invisible to others, joined only with the invite code."""
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(300), default="")
    is_private: Mapped[bool] = mapped_column(Boolean, default=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_join_all: Mapped[bool] = mapped_column(Boolean, default=False)     # the whole-community group
    track_id: Mapped[int | None] = mapped_column(ForeignKey("tracks.id", ondelete="SET NULL"))  # track members auto-join
    invite_code: Mapped[str] = mapped_column(String(16), unique=True, default=lambda: secrets.token_urlsafe(9))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id"), _in("role", ("owner", "member"), "group_member_role_valid"))

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="member")
    last_read_id: Mapped[int] = mapped_column(Integer, default=0)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(lazy="selectin")


class GroupMessage(Base):
    __tablename__ = "group_messages"
    __table_args__ = (Index("ix_group_messages_group_id_id", "group_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User | None] = relationship(lazy="selectin")


class Challenge(Base):
    """A time-boxed contest a mentor runs: students submit work, the mentor scores it and names winners."""
    __tablename__ = "challenges"
    __table_args__ = (CheckConstraint("points >= 0", name="challenge_points_nonnegative"),
                      CheckConstraint("ends_at > starts_at", name="challenge_dates_order"))

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    track_id: Mapped[int | None] = mapped_column(ForeignKey("tracks.id", ondelete="SET NULL"))   # None: everyone
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    prize: Mapped[str] = mapped_column(String(300), default="")
    points: Mapped[int] = mapped_column(Integer, default=20)          # for every accepted entry
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    track: Mapped[Track | None] = relationship(lazy="selectin")
    created_by: Mapped[User | None] = relationship(lazy="selectin")


class ChallengeEntry(Base):
    __tablename__ = "challenge_entries"
    __table_args__ = (UniqueConstraint("challenge_id", "user_id"),
                      _in("status", ("submitted", "accepted", "rejected"), "challenge_entry_status_valid"),
                      CheckConstraint("place IS NULL OR place BETWEEN 1 AND 3", name="challenge_entry_place_range"),
                      CheckConstraint("score IS NULL OR score BETWEEN 0 AND 100", name="challenge_entry_score_range"))

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    proof_url: Mapped[str] = mapped_column(String(512))
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="submitted")
    score: Mapped[int | None] = mapped_column(Integer)
    place: Mapped[int | None] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    points_awarded: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    challenge: Mapped[Challenge] = relationship(lazy="selectin")
    user: Mapped[User] = relationship(lazy="selectin")
