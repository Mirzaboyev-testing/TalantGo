import enum
import secrets
from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey,
                        Index, Integer, String, Text, UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import ARRAY
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


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(cls, name=name, values_callable=lambda e: [m.value for m in e])


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(8), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

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

    track: Mapped[Track] = relationship(back_populates="tasks", lazy="selectin")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("points >= 0", name="user_points_nonnegative"),
        CheckConstraint("streak_count >= 0", name="user_streak_nonnegative"),
        Index("ix_users_goals", "goals", postgresql_using="gin"),
        Index("ix_users_track_points", "track_id", "points"),
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
    goals: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, server_default="{}")
    github_url: Mapped[str] = mapped_column(String(256), default="")
    linkedin_url: Mapped[str] = mapped_column(String(256), default="")
    points: Mapped[int] = mapped_column(Integer, default=0)
    streak_count: Mapped[int] = mapped_column(Integer, default=0)
    last_active_on: Mapped[date | None] = mapped_column(Date)
    cv_slug: Mapped[str] = mapped_column(String(16), unique=True, default=lambda: secrets.token_urlsafe(8))
    cv_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    track: Mapped[Track | None] = relationship(lazy="selectin")


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

    task: Mapped[Task] = relationship(lazy="selectin")
    user: Mapped[User] = relationship(lazy="selectin")
    reviews: Mapped[list["Review"]] = relationship(back_populates="submission", lazy="selectin",
                                                   order_by="Review.created_at", cascade="all, delete-orphan")

    @property
    def current_reviews(self) -> list["Review"]:
        return [r for r in self.reviews if r.round == self.round]


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("submission_id", "reviewer_id", "round"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    kind: Mapped[ReviewKind] = mapped_column(_enum(ReviewKind, "review_kind"))
    approved: Mapped[bool] = mapped_column(Boolean)
    comment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submission: Mapped[Submission] = relationship(back_populates="reviews", lazy="raise")
    reviewer: Mapped[User] = relationship(lazy="selectin")


class AppSetting(Base):
    """Encrypted operator settings pasted in the admin page (bot token, later AI keys)."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    ciphertext: Mapped[str] = mapped_column(Text)
    hint: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
