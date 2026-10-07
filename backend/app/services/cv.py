"""The auto-generated CV: only verified work, each item showing who verified it."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models import ReviewKind, Status, Submission, Task, User
from .progress import current_streak, rank_of

VERIFIED = (Status.peer_verified, Status.mentor_verified)
LEVEL_LABEL = {Status.peer_verified: "Tengdoshlar tasdiqlagan", Status.mentor_verified: "Mentor tasdiqlagan"}


async def build_cv(session: AsyncSession, user: User) -> dict:
    subs = (await session.execute(
        select(Submission).join(Task)
        .where(Submission.user_id == user.id, Submission.status.in_(VERIFIED))
        .order_by(Task.track_id, Task.sort_order))).scalars().all()

    achievements = []
    for sub in subs:
        approvers = [r for r in sub.current_reviews if r.approved]
        achievements.append({
            "task": sub.task.title,
            "track": sub.task.track.title,
            "week": sub.task.week,
            "proof_url": sub.proof_url,
            "level": sub.status.value,
            "level_label": LEVEL_LABEL[sub.status],
            "points": sub.points_awarded,
            "verified_at": sub.verified_at.isoformat() if sub.verified_at else None,
            "verified_by": [{"name": r.reviewer.full_name, "kind": r.kind.value} for r in approvers],
            "mentor_comment": next((r.comment for r in approvers if r.kind is ReviewKind.mentor), None),
        })

    return {
        "full_name": user.full_name,
        "username": user.username,
        "photo_url": user.photo_url,
        "university": user.university,
        "group_name": user.group_name,
        "bio": user.bio,
        "goals": user.goals,
        "track": user.track.title if user.track else None,
        "github_url": user.github_url,
        "linkedin_url": user.linkedin_url,
        "stats": {
            "points": user.points,
            "streak": current_streak(user),
            "verified_tasks": len(achievements),
            "mentor_verified": sum(a["level"] == Status.mentor_verified.value for a in achievements),
            "rank_overall": await rank_of(session, user),
            "rank_in_track": await rank_of(session, user, user.track_id) if user.track_id else None,
        },
        "achievements": achievements,
        "public_url": f"{settings.public_url}/cv/{user.cv_slug}",
        "is_public": user.cv_public,
    }
