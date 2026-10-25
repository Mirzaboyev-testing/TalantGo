"""Tasks a company gives students: a short real-world assignment for everyone, a track, one university
or students it picked. Students submit work, the company scores it, winners get points and it goes to their CV.

Built on the challenge tables, so students see company tasks next to mentor challenges in "Yo'l".
"""
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select

from ..core import ratelimit
from ..models import Challenge, ChallengeEntry, Role, Track, University, User
from ..services import inbox
from .challenges import (TASHKENT, ReviewEntryIn, _counts, apply_review, challenge_out, end_of_day, entry_out)
from .deps import Session
from .employer import ApprovedEmployer, _visible_students

router = APIRouter(prefix="/employer/tasks", tags=["company tasks"])
MAX_COMPANY_TASK_POINTS = 50          # lower than mentor challenges: companies cannot inflate the rating
MAX_INVITED = 50


class TaskIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    prize: str = Field(default="", max_length=300)
    points: int = Field(default=20, ge=0, le=MAX_COMPANY_TASK_POINTS)
    starts_on: date | None = None
    ends_on: date
    audience: Literal["all", "track", "university", "selected"] = "all"
    track_id: int | None = None
    university_id: int | None = None
    student_ids: list[int] = Field(default_factory=list, max_length=MAX_INVITED)

    @model_validator(mode="after")
    def _check(self):
        today = datetime.now(TASHKENT).date()
        if self.starts_on and self.starts_on < today:
            raise ValueError("Boshlanish sanasi o'tib ketgan")
        if self.ends_on < (self.starts_on or today):
            raise ValueError("Tugash sanasi boshlanishidan oldin bo'lmasin")
        if self.ends_on > today + timedelta(days=120):
            raise ValueError("Vazifa ko'pi bilan 4 oy davom etadi")
        if self.audience == "track" and not self.track_id:
            raise ValueError("Yo'nalishni tanlang")
        if self.audience == "university" and not self.university_id:
            raise ValueError("Universitetni tanlang")
        if self.audience == "selected" and not self.student_ids:
            raise ValueError("Kamida bitta talabani tanlang")
        return self


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    prize: str | None = Field(default=None, max_length=300)
    ends_on: date | None = None
    is_archived: bool | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.ends_on and self.ends_on > datetime.now(TASHKENT).date() + timedelta(days=120):
            raise ValueError("Vazifa ko'pi bilan 4 oy davom etadi")
        return self


async def _own_task(session: Session, user: User, task_id: int) -> Challenge:
    c = await session.get(Challenge, task_id)
    if c is None or c.company_id != user.company_id:
        raise HTTPException(404, "Vazifa topilmadi")
    return c


def _audience_query(c: Challenge):
    query = select(User.id).where(User.account_type == "student", User.role == Role.student, User.is_blocked.is_(False))
    if c.audience == "track":
        return query.where(User.track_id == c.track_id)
    if c.audience == "university":
        return query.where(User.university_id == c.university_id)
    if c.audience == "selected":
        return query.where(User.id.in_(c.invited_ids))
    return query


@router.get("")
async def list_tasks(user: ApprovedEmployer, session: Session) -> list[dict]:
    now = datetime.now(UTC)
    rows = (await session.execute(select(Challenge).where(Challenge.company_id == user.company_id)
                                  .order_by(Challenge.ends_at.desc()))).scalars().all()
    return [challenge_out(c, now, **await _counts(session, c.id)) for c in rows]


@router.post("", status_code=201)
async def create_task(body: TaskIn, user: ApprovedEmployer, session: Session) -> dict:
    ratelimit.limit(f"company-task:{user.company_id}", 10, 24 * 3600, "Bir kunda 10 tadan ortiq vazifa berib bo'lmaydi")
    if body.audience != "selected":           # these reach many students at once
        ratelimit.limit(f"company-task-broad:{user.company_id}", 2, 24 * 3600,
                        "Bir kunda 2 tadan ortiq ommaviy vazifa berib bo'lmaydi")
    if body.audience == "track" and not await session.get(Track, body.track_id):
        raise HTTPException(404, "Yo'nalish topilmadi")
    if body.audience == "university" and not await session.get(University, body.university_id):
        raise HTTPException(404, "Universitet topilmadi")
    invited: list[int] = []
    if body.audience == "selected":
        # only students this company may already see by name (the student list rule)
        invited = list((await session.execute(select(User.id).where(
            User.id.in_(set(body.student_ids)), *_visible_students()))).scalars())
        if len(invited) != len(set(body.student_ids)):
            raise HTTPException(404, "Tanlangan talabalardan ba'zilari topilmadi")
    now = datetime.now(UTC)
    starts = datetime.combine(body.starts_on, time(0, 0), TASHKENT) if body.starts_on else now
    c = Challenge(title=body.title.strip(), description=body.description.strip(), prize=body.prize.strip(),
                  points=body.points, starts_at=starts, ends_at=end_of_day(body.ends_on), created_by_id=user.id,
                  company_id=user.company_id, audience=body.audience,
                  track_id=body.track_id if body.audience == "track" else None,
                  university_id=body.university_id if body.audience == "university" else None, invited_ids=invited)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    prize = f" Sovrin: {c.prize}." if c.prize else ""
    await inbox.push(session, (await session.execute(_audience_query(c))).scalars().all(), "company_task_new",
                     f"{user.company.name} sizga vazifa berdi: «{c.title}». Muddat: {body.ends_on.strftime('%d.%m.%Y')}.{prize}",
                     link="/talaba/yol", params={"task": c.title, "company": user.company.name})
    return challenge_out(c, now, entries=0, to_review=0)


@router.patch("/{task_id}")
async def edit_task(task_id: int, body: TaskPatch, user: ApprovedEmployer, session: Session) -> dict:
    c = await _own_task(session, user, task_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "ends_on" in changes:
        ends = end_of_day(changes.pop("ends_on"))
        if ends <= c.starts_at:
            raise HTTPException(422, "Tugash sanasi boshlanishidan oldin bo'lmasin")
        c.ends_at = ends
    for field, value in changes.items():
        setattr(c, field, value.strip() if isinstance(value, str) else value)
    await session.commit()
    return challenge_out(c, datetime.now(UTC), **await _counts(session, c.id))


@router.get("/{task_id}/entries")
async def task_entries(task_id: int, user: ApprovedEmployer, session: Session) -> list[dict]:
    await _own_task(session, user, task_id)
    rows = (await session.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == task_id)
                                  .order_by((ChallengeEntry.status == "submitted").desc(), ChallengeEntry.place.nulls_last(),
                                            ChallengeEntry.score.desc().nulls_last(), ChallengeEntry.created_at))).scalars()
    return [entry_out(e, with_username=False) for e in rows]


@router.post("/{task_id}/entries/{entry_id}/review")
async def review_task_entry(task_id: int, entry_id: int, body: ReviewEntryIn, user: ApprovedEmployer, session: Session) -> dict:
    c = await _own_task(session, user, task_id)
    entry = await session.get(ChallengeEntry, entry_id)
    if entry is None or entry.challenge_id != c.id:
        raise HTTPException(404, "Ish topilmadi")
    await apply_review(session, c, entry, body)
    return entry_out(entry, with_username=False)
