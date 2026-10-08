"""Mentor tools (their own tasks and challenges) and the student side of challenges."""
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select, update

from ..models import Challenge, ChallengeEntry, Role, Task, Track, User
from ..schemas import Url
from ..services import notify
from .deps import CurrentUser, Session

router = APIRouter(tags=["challenges"])
TASHKENT = ZoneInfo("Asia/Tashkent")
PLACE_BONUS = {1: 30, 2: 20, 3: 10}
MAX_TASK_POINTS = 50
MAX_CHALLENGE_POINTS = 100


async def mentor(user: CurrentUser) -> User:
    if user.role not in (Role.mentor, Role.admin):
        raise HTTPException(403, "Bu bo'lim mentorlar uchun")
    return user


Mentor = Annotated[User, Depends(mentor)]


# --------------------------------------------------------------------------- mentor: tasks

class MentorTaskIn(BaseModel):
    track_id: int
    week: int = Field(ge=1, le=52)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=10, max_length=4000)
    proof_hint: str = Field(default="", max_length=500)
    criteria: str = Field(default="", max_length=2000)
    points: int = Field(ge=1, le=MAX_TASK_POINTS)


class MentorTaskPatch(BaseModel):
    week: int | None = Field(default=None, ge=1, le=52)
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, min_length=10, max_length=4000)
    proof_hint: str | None = Field(default=None, max_length=500)
    criteria: str | None = Field(default=None, max_length=2000)
    points: int | None = Field(default=None, ge=1, le=MAX_TASK_POINTS)
    is_active: bool | None = None


def task_out(t: Task) -> dict:
    return {"id": t.id, "track_id": t.track_id, "track": t.track.title, "week": t.week, "title": t.title,
            "description": t.description, "proof_hint": t.proof_hint, "criteria": t.criteria, "points": t.points,
            "is_active": t.is_active}


@router.get("/mentor/tasks")
async def my_tasks(user: Mentor, session: Session) -> list[dict]:
    rows = (await session.execute(select(Task).where(Task.created_by_id == user.id)
                                  .order_by(Task.track_id, Task.sort_order))).scalars()
    return [task_out(t) for t in rows]


@router.post("/mentor/tasks", status_code=201)
async def create_task(body: MentorTaskIn, user: Mentor, session: Session) -> dict:
    track = await session.get(Track, body.track_id)
    if track is None or not track.is_active:
        raise HTTPException(404, "Yo'nalish topilmadi")
    last = await session.scalar(select(func.max(Task.sort_order)).where(Task.track_id == body.track_id))
    task = Task(**body.model_dump(), sort_order=(last or 0) + 1, created_by_id=user.id)
    session.add(task)
    await session.commit()
    students = (await session.execute(select(User.telegram_id).where(
        User.track_id == body.track_id, User.account_type == "student", User.is_blocked.is_(False),
        User.id != user.id))).scalars().all()
    notify.send(list(students), f"Yangi topshiriq: «{task.title}» ({task.points} ball). Mentor: {user.full_name}.")
    return task_out(task)


async def _own_task(session: Session, user: User, task_id: int) -> Task:
    task = await session.get(Task, task_id)
    if task is None or task.created_by_id != user.id:
        raise HTTPException(404, "Topshiriq topilmadi")
    return task


@router.patch("/mentor/tasks/{task_id}")
async def edit_task(task_id: int, body: MentorTaskPatch, user: Mentor, session: Session) -> dict:
    task = await _own_task(session, user, task_id)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(task, field, value)
    await session.commit()
    return task_out(task)


# --------------------------------------------------------------------------- mentor: challenges

def end_of_day(d: date) -> datetime:
    return datetime.combine(d, time(23, 59), TASHKENT)


class ChallengeIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    track_id: int | None = None
    prize: str = Field(default="", max_length=300)
    points: int = Field(default=20, ge=0, le=MAX_CHALLENGE_POINTS)
    starts_on: date | None = None
    ends_on: date

    @model_validator(mode="after")
    def _dates(self):
        today = datetime.now(TASHKENT).date()
        if self.ends_on < (self.starts_on or today):
            raise ValueError("Tugash sanasi boshlanishidan oldin bo'lmasin")
        if self.ends_on > today + timedelta(days=120):
            raise ValueError("Chellenj ko'pi bilan 4 oy davom etadi")
        return self


class ChallengePatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    prize: str | None = Field(default=None, max_length=300)
    ends_on: date | None = None
    is_archived: bool | None = None


class ReviewEntryIn(BaseModel):
    accept: bool
    score: int | None = Field(default=None, ge=0, le=100)
    place: Literal[1, 2, 3] | None = None
    comment: str = Field(default="", max_length=1000)


def challenge_out(c: Challenge, now: datetime, **extra) -> dict:
    state = "upcoming" if now < c.starts_at else "active" if now <= c.ends_at else "finished"
    return {"id": c.id, "title": c.title, "description": c.description, "track_id": c.track_id,
            "track": c.track.title if c.track else None, "prize": c.prize, "points": c.points,
            "starts_at": c.starts_at, "ends_at": c.ends_at, "state": state, "is_archived": c.is_archived,
            "mentor": c.created_by.full_name if c.created_by else None, **extra}


def entry_out(e: ChallengeEntry) -> dict:
    return {"id": e.id, "user_id": e.user_id, "student": e.user.full_name, "username": e.user.username,
            "university": e.user.university_ref.short_name if e.user.university_ref else None,
            "proof_url": e.proof_url, "note": e.note, "status": e.status, "score": e.score, "place": e.place,
            "comment": e.comment, "points_awarded": e.points_awarded, "created_at": e.created_at}


async def _counts(session: Session, challenge_id: int) -> dict:
    rows = dict((await session.execute(select(ChallengeEntry.status, func.count()).where(
        ChallengeEntry.challenge_id == challenge_id).group_by(ChallengeEntry.status))).all())
    return {"entries": sum(rows.values()), "to_review": rows.get("submitted", 0)}


@router.get("/mentor/challenges")
async def my_challenges(user: Mentor, session: Session) -> list[dict]:
    now = datetime.now(UTC)
    rows = (await session.execute(select(Challenge).where(Challenge.created_by_id == user.id)
                                  .order_by(Challenge.ends_at.desc()))).scalars().all()
    return [challenge_out(c, now, **await _counts(session, c.id)) for c in rows]


@router.post("/mentor/challenges", status_code=201)
async def create_challenge(body: ChallengeIn, user: Mentor, session: Session) -> dict:
    if body.track_id is not None and not await session.get(Track, body.track_id):
        raise HTTPException(404, "Yo'nalish topilmadi")
    now = datetime.now(UTC)
    starts = datetime.combine(body.starts_on, time(0, 0), TASHKENT) if body.starts_on else now
    c = Challenge(title=body.title.strip(), description=body.description.strip(), track_id=body.track_id,
                  prize=body.prize.strip(), points=body.points, starts_at=starts, ends_at=end_of_day(body.ends_on),
                  created_by_id=user.id)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    audience = select(User.telegram_id).where(User.account_type == "student", User.is_blocked.is_(False))
    if body.track_id:
        audience = audience.where(User.track_id == body.track_id)
    prize = f" Sovrin: {c.prize}." if c.prize else ""
    notify.send(list((await session.execute(audience)).scalars()),
                f"Yangi chellenj: «{c.title}». Muddat: {body.ends_on.strftime('%d.%m.%Y')}.{prize} "
                f"Ilovadagi «Yo'l» bo'limida qatnashing.")
    return challenge_out(c, now, entries=0, to_review=0)


async def _own_challenge(session: Session, user: User, challenge_id: int) -> Challenge:
    c = await session.get(Challenge, challenge_id)
    if c is None or (c.created_by_id != user.id and user.role is not Role.admin):
        raise HTTPException(404, "Chellenj topilmadi")
    return c


@router.patch("/mentor/challenges/{challenge_id}")
async def edit_challenge(challenge_id: int, body: ChallengePatch, user: Mentor, session: Session) -> dict:
    c = await _own_challenge(session, user, challenge_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "ends_on" in changes:
        ends = end_of_day(changes.pop("ends_on"))
        if ends <= c.starts_at:
            raise HTTPException(422, "Tugash sanasi boshlanishidan oldin bo'lmasin")
        c.ends_at = ends
    for field, value in changes.items():
        setattr(c, field, value)
    await session.commit()
    return challenge_out(c, datetime.now(UTC), **await _counts(session, c.id))


@router.get("/mentor/challenges/{challenge_id}/entries")
async def challenge_entries(challenge_id: int, user: Mentor, session: Session) -> list[dict]:
    await _own_challenge(session, user, challenge_id)
    rows = (await session.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == challenge_id)
                                  .order_by((ChallengeEntry.status == "submitted").desc(), ChallengeEntry.place.nulls_last(),
                                            ChallengeEntry.score.desc().nulls_last(), ChallengeEntry.created_at))).scalars()
    return [entry_out(e) for e in rows]


async def _set_award(session: Session, entry: ChallengeEntry, total: int) -> None:
    delta = total - entry.points_awarded
    if delta:
        await session.execute(update(User).where(User.id == entry.user_id)
                              .values(points=func.greatest(User.points + delta, 0)))
    entry.points_awarded = total


@router.post("/mentor/challenges/{challenge_id}/entries/{entry_id}/review")
async def review_entry(challenge_id: int, entry_id: int, body: ReviewEntryIn, user: Mentor, session: Session) -> dict:
    c = await _own_challenge(session, user, challenge_id)
    entry = await session.get(ChallengeEntry, entry_id)
    if entry is None or entry.challenge_id != c.id:
        raise HTTPException(404, "Ish topilmadi")
    if entry.user_id == user.id:
        raise HTTPException(403, "O'z ishingizni baholay olmaysiz")
    if body.place and not body.accept:
        raise HTTPException(422, "Rad etilgan ishga o'rin berilmaydi")
    if body.place:
        # one winner per place: whoever held it loses the place and its bonus
        holder = (await session.execute(select(ChallengeEntry).where(
            ChallengeEntry.challenge_id == c.id, ChallengeEntry.place == body.place,
            ChallengeEntry.id != entry.id))).scalar_one_or_none()
        if holder:
            holder.place = None
            await _set_award(session, holder, c.points if holder.status == "accepted" else 0)
    entry.status = "accepted" if body.accept else "rejected"
    entry.score, entry.place, entry.comment = body.score, body.place, body.comment.strip()
    entry.reviewed_at = datetime.now(UTC)
    await _set_award(session, entry, (c.points + PLACE_BONUS.get(body.place or 0, 0)) if body.accept else 0)
    await session.commit()
    place = f" Siz {body.place}-o'rinni egalladingiz!" if body.place else ""
    notify.send([entry.user.telegram_id],
                f"«{c.title}» chellenjidagi ishingiz qabul qilindi: +{entry.points_awarded} ball.{place}" if body.accept
                else f"«{c.title}» chellenjidagi ishingiz qabul qilinmadi. Izoh: {entry.comment or '-'}")
    return entry_out(entry)


# --------------------------------------------------------------------------- students

def _for_user(user: User):
    """Challenges a student sees: everyone's and their own track's; finished ones for 30 days."""
    recent = datetime.now(UTC) - timedelta(days=30)
    return select(Challenge).where(Challenge.is_archived.is_(False), Challenge.ends_at >= recent,
                                   Challenge.track_id.is_(None) | (Challenge.track_id == user.track_id))


@router.get("/challenges")
async def challenges(user: CurrentUser, session: Session) -> list[dict]:
    now = datetime.now(UTC)
    rows = (await session.execute(_for_user(user).order_by(Challenge.ends_at))).scalars().all()
    mine = {e.challenge_id: e for e in (await session.execute(select(ChallengeEntry).where(
        ChallengeEntry.user_id == user.id, ChallengeEntry.challenge_id.in_([c.id for c in rows])))).scalars()}
    out = []
    for c in rows:
        entries = await session.scalar(select(func.count()).select_from(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id))
        out.append(challenge_out(c, now, entries=entries, my_entry=entry_out(mine[c.id]) if c.id in mine else None))
    order = {"active": 0, "upcoming": 1, "finished": 2}
    return sorted(out, key=lambda x: order[x["state"]])


@router.get("/challenges/{challenge_id}")
async def challenge_detail(challenge_id: int, user: CurrentUser, session: Session) -> dict:
    c = (await session.execute(_for_user(user).where(Challenge.id == challenge_id))).scalar_one_or_none()
    if c is None:
        raise HTTPException(404, "Chellenj topilmadi")
    mine = (await session.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id,
                                                               ChallengeEntry.user_id == user.id))).scalar_one_or_none()
    winners = (await session.execute(select(ChallengeEntry).where(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.status == "accepted")
        .order_by(ChallengeEntry.place.nulls_last(), ChallengeEntry.score.desc().nulls_last()).limit(10))).scalars()
    entries = await session.scalar(select(func.count()).select_from(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id))
    return challenge_out(c, datetime.now(UTC), entries=entries, my_entry=entry_out(mine) if mine else None,
                         results=[{"student": w.user.full_name, "place": w.place, "score": w.score} for w in winners])


class EntryIn(BaseModel):
    proof_url: Annotated[Url, Field(min_length=10)]
    note: str = Field(default="", max_length=1000)


@router.post("/challenges/{challenge_id}/enter", status_code=201)
async def enter(challenge_id: int, body: EntryIn, user: CurrentUser, session: Session) -> dict:
    if user.account_type != "student":
        raise HTTPException(403, "Chellenjda talabalar qatnashadi")
    c = (await session.execute(_for_user(user).where(Challenge.id == challenge_id))).scalar_one_or_none()
    now = datetime.now(UTC)
    if c is None:
        raise HTTPException(404, "Chellenj topilmadi")
    if not (c.starts_at <= now <= c.ends_at):
        raise HTTPException(409, "Chellenj hozir ish qabul qilmaydi")
    entry = (await session.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id,
                                                                ChallengeEntry.user_id == user.id))).scalar_one_or_none()
    if entry and entry.status != "submitted":
        raise HTTPException(409, "Ishingiz allaqachon baholangan")
    if entry is None:
        entry = ChallengeEntry(challenge_id=c.id, user_id=user.id, proof_url=body.proof_url, note=body.note.strip())
        session.add(entry)
    else:
        entry.proof_url, entry.note = body.proof_url, body.note.strip()      # can be improved until reviewed
    await session.commit()
    await session.refresh(entry)
    return entry_out(entry)
