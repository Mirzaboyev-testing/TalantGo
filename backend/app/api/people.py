from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from ..models import Status, Submission, Track, User
from ..schemas import LeaderboardOut, LeaderRow, MeOut, MeUpdate, PeerOut, TrackOut
from ..services.cv import build_cv
from ..services.progress import current_streak, rank_of
from .deps import CurrentUser, Session

router = APIRouter(tags=["people"])


async def me_out(session: Session, user: User) -> MeOut:
    return MeOut(
        id=user.id, full_name=user.full_name, username=user.username, photo_url=user.photo_url,
        role=user.role, track=TrackOut.model_validate(user.track) if user.track else None,
        university=user.university, group_name=user.group_name, bio=user.bio, goals=user.goals,
        github_url=user.github_url, linkedin_url=user.linkedin_url, points=user.points,
        streak=current_streak(user), rank_overall=await rank_of(session, user),
        cv_slug=user.cv_slug, cv_public=user.cv_public)


@router.get("/me", response_model=MeOut)
async def get_me(user: CurrentUser, session: Session) -> MeOut:
    return await me_out(session, user)


@router.patch("/me", response_model=MeOut)
async def update_me(body: MeUpdate, user: CurrentUser, session: Session) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    if "track_id" in changes and changes["track_id"] is not None and not await session.get(Track, changes["track_id"]):
        raise HTTPException(404, "Bunday yo'l yo'q")
    if "goals" in changes:
        changes["goals"] = list(dict.fromkeys(changes["goals"] or []))
    for field, value in changes.items():
        if value is not None or field == "track_id":     # only the path can be cleared
            setattr(user, field, value)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.get("/me/cv")
async def my_cv(user: CurrentUser, session: Session) -> dict:
    return await build_cv(session, user)


@router.get("/cv/{slug}")
async def public_cv(slug: str, session: Session) -> dict:
    user = (await session.execute(select(User).where(User.cv_slug == slug))).scalar_one_or_none()
    if user is None or not user.cv_public:
        raise HTTPException(404, "CV topilmadi yoki yopiq")
    return await build_cv(session, user)


def _verified_count():
    return (select(func.count()).where(Submission.user_id == User.id,
                                       Submission.status.in_([Status.peer_verified, Status.mentor_verified]))
            .correlate(User).scalar_subquery())


@router.get("/peers", response_model=list[PeerOut])
async def peers(user: CurrentUser, session: Session,
                goal: str | None = Query(default=None, max_length=40),
                track_id: int | None = None) -> list[PeerOut]:
    """Students on the same path by default; a goal search looks across all paths."""
    verified = _verified_count().label("verified")
    query = select(User, verified).where(User.id != user.id)
    if goal:
        query = query.where(User.goals.contains([goal.strip()]))
    else:
        wanted = track_id or user.track_id
        if wanted is None:
            return []
        query = query.where(User.track_id == wanted)
    rows = (await session.execute(query.order_by(User.points.desc(), User.id).limit(100))).all()
    return [PeerOut(id=u.id, full_name=u.full_name, username=u.username, photo_url=u.photo_url,
                    track_title=u.track.title if u.track else None, group_name=u.group_name, goals=u.goals,
                    points=u.points, streak=current_streak(u), verified_tasks=n) for u, n in rows]


@router.get("/leaderboard", response_model=LeaderboardOut)
async def leaderboard(user: CurrentUser, session: Session,
                      scope: Literal["all", "track", "group"] = "all") -> LeaderboardOut:
    query = select(User)
    rank_query = select(func.count()).select_from(User).where(User.points > user.points)
    if scope == "track":
        query = query.where(User.track_id == user.track_id)
        rank_query = rank_query.where(User.track_id == user.track_id)
    elif scope == "group":
        query = query.where(User.group_name == user.group_name)
        rank_query = rank_query.where(User.group_name == user.group_name)
    users = (await session.execute(query.order_by(User.points.desc(), User.id).limit(50))).scalars().all()
    rows, rank, previous = [], 0, None
    for position, u in enumerate(users, start=1):
        if u.points != previous:          # equal points share a rank
            rank, previous = position, u.points
        rows.append(LeaderRow(rank=rank, id=u.id, full_name=u.full_name, group_name=u.group_name,
                              track_icon=u.track.icon if u.track else "", points=u.points, is_me=u.id == user.id))
    return LeaderboardOut(rows=rows, my_rank=(await session.scalar(rank_query)) + 1)
