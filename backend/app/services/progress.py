"""Submissions, reviews, points and streaks: the rules that make the portfolio trustworthy.

A submission earns its task's points only after `peer_approvals_required` peers on the same track
approve it, and a mentor's sign-off adds a bonus (both tunable by the owner, see rules.py). A mentor's rejection takes awarded points back,
which is what keeps peers honest. Reviewers earn a small reward per written review.
"""
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Review, ReviewKind, Role, Status, Submission, Task, User
from . import notify
from .rules import get_rules

TASHKENT = ZoneInfo("Asia/Tashkent")


def today() -> date:
    return datetime.now(TASHKENT).date()


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def touch_streak(user: User) -> None:
    """Weekly streak: tasks are weekly, so a week with any submission or review keeps it alive."""
    now = today()
    this_week = week_start(now)
    last_week = week_start(user.last_active_on) if user.last_active_on else None
    if last_week != this_week:
        user.streak_count = user.streak_count + 1 if last_week == this_week - timedelta(weeks=1) else 1
    user.last_active_on = now


def current_streak(user: User) -> int:
    """Alive while the student was active this week or last week (this week is not over yet)."""
    if user.last_active_on and week_start(user.last_active_on) >= week_start(today()) - timedelta(weeks=1):
        return user.streak_count
    return 0


async def _add_points(session: AsyncSession, user_id: int, delta: int) -> None:
    if delta:
        await session.execute(update(User).where(User.id == user_id)
                              .values(points=func.greatest(User.points + delta, 0)))


async def submit(session: AsyncSession, user: User, task_id: int, proof_url: str, note: str) -> Submission:
    task = await session.get(Task, task_id)
    if not task or not task.is_active or not task.track.is_active:
        raise HTTPException(404, "Topshiriq topilmadi")
    if task.track_id != user.track_id:
        raise HTTPException(403, "Bu topshiriq sizning yo'lingizda emas")
    if task.kind == "profile":
        raise HTTPException(409, "Bu topshiriq ilovaning o'zida bajariladi: profilni to'ldiring")
    sub = (await session.execute(
        select(Submission).where(Submission.user_id == user.id, Submission.task_id == task_id)
        .with_for_update(of=Submission))).scalar_one_or_none()
    if sub is None:
        sub = Submission(user_id=user.id, task_id=task_id, proof_url=proof_url, note=note)
        session.add(sub)
    elif sub.status is Status.rejected:
        sub.proof_url, sub.note, sub.round = proof_url, note, sub.round + 1
        sub.status, sub.verified_at = Status.pending, None
    else:
        raise HTTPException(409, "Bu topshiriq allaqachon topshirilgan")
    touch_streak(user)
    await session.commit()
    rules = await get_rules(session)
    peers = (await session.execute(select(User.telegram_id).where(
        User.track_id == task.track_id, User.id != user.id, User.account_type == "student",
        User.is_blocked.is_(False)))).scalars().all()
    notify.send(list(peers), f"📝 {user.full_name} «{task.title}» ishini topshirdi. "
                             f"«Tekshirish» bo'limida baholang va +{rules.review_points} ball oling.")
    return await _reload(session, sub.id)


PROFILE_RULES = [
    ("headline", "qisqa sarlavha (kamida 10 belgi)", lambda u: len(u.headline.strip()) >= 10),
    ("bio", "o'zingiz haqingizda (kamida 60 belgi)", lambda u: len(u.bio.strip()) >= 60),
    ("skills", "kamida 3 ta ko'nikma", lambda u: len(u.skills) >= 3),
    ("languages", "kamida 1 ta til", lambda u: len(u.languages) >= 1),
    ("cv_public", "CV ochiq bo'lishi", lambda u: u.cv_public),
]


def profile_missing(user: User) -> list[str]:
    return [label for _, label, ok in PROFILE_RULES if not ok(user)]


async def complete_profile_task(session: AsyncSession, user: User, task_id: int) -> Submission:
    """A 'profile' task is done inside the app: the system checks the profile and awards the points."""
    task = await session.get(Task, task_id)
    if not task or task.kind != "profile" or not task.is_active:
        raise HTTPException(404, "Topshiriq topilmadi")
    if task.track_id != user.track_id:
        raise HTTPException(403, "Bu topshiriq sizning yo'lingizda emas")
    if await session.scalar(select(Submission.id).where(Submission.user_id == user.id, Submission.task_id == task_id)):
        raise HTTPException(409, "Bu topshiriq bajarilgan")
    if missing := profile_missing(user):
        raise HTTPException(422, "Profilda yetishmayapti: " + ", ".join(missing))
    from ..core.config import settings
    sub = Submission(user_id=user.id, task_id=task_id, proof_url=f"{settings.public_url}/cv/{user.cv_slug}",
                     note="Tizim tekshirdi: profil to'liq", status=Status.peer_verified,
                     points_awarded=task.points, verified_at=datetime.now(UTC))
    session.add(sub)
    touch_streak(user)
    await session.flush()
    await _add_points(session, user.id, task.points)
    await session.commit()
    return await _reload(session, sub.id)


async def review(session: AsyncSession, reviewer: User, submission_id: int, approved: bool, comment: str) -> Submission:
    sub = (await session.execute(select(Submission).where(Submission.id == submission_id)
                                 .with_for_update(of=Submission))).scalar_one_or_none()
    if sub is None:
        raise HTTPException(404, "Ish topilmadi")
    if sub.user_id == reviewer.id:
        raise HTTPException(403, "O'z ishingizni baholay olmaysiz")
    is_mentor = reviewer.role in (Role.mentor, Role.admin)
    if is_mentor:
        if sub.status in (Status.mentor_verified, Status.rejected):
            raise HTTPException(409, "Bu ish bo'yicha yakuniy qaror chiqarilgan")
    else:
        if reviewer.track_id != sub.task.track_id:
            raise HTTPException(403, "Faqat o'z yo'lingizdagi ishlarni baholaysiz")
        if sub.status is not Status.pending:
            raise HTTPException(409, "Bu ish allaqachon ko'rib chiqilgan")
    if any(r.reviewer_id == reviewer.id for r in sub.current_reviews):
        raise HTTPException(409, "Siz bu ishni allaqachon baholagansiz")

    rules = await get_rules(session)
    old_status = sub.status
    kind = ReviewKind.mentor if is_mentor else ReviewKind.peer
    peer_votes = [r.approved for r in sub.current_reviews if r.kind is ReviewKind.peer]
    session.add(Review(submission_id=sub.id, reviewer_id=reviewer.id, round=sub.round,
                       kind=kind, approved=approved, comment=comment))
    touch_streak(reviewer)
    if not is_mentor:
        await _add_points(session, reviewer.id, rules.review_points)

    task_points = sub.task.points
    if is_mentor:
        if approved:
            gain = (task_points if sub.points_awarded == 0 else 0) + task_points * rules.mentor_bonus_percent // 100
            sub.status, sub.verified_at = Status.mentor_verified, datetime.now(UTC)
            sub.points_awarded += gain
            await _add_points(session, sub.user_id, gain)
        else:
            await _add_points(session, sub.user_id, -sub.points_awarded)
            sub.status, sub.points_awarded, sub.verified_at = Status.rejected, 0, None
    else:
        votes = peer_votes + [approved]
        if votes.count(True) >= rules.peer_approvals_required:
            sub.status, sub.verified_at = Status.peer_verified, datetime.now(UTC)
            sub.points_awarded = task_points
            await _add_points(session, sub.user_id, task_points)
        elif votes.count(False) >= rules.peer_approvals_required:
            sub.status = Status.rejected

    await session.commit()
    fresh = await _reload(session, submission_id)
    await _announce_decision(session, fresh, old_status)
    return fresh


async def _announce_decision(session: AsyncSession, sub: Submission, old_status: Status) -> None:
    """Tell the author when their work changes state, and mentors when it is ready for them."""
    if sub.status == old_status:
        return
    title = sub.task.title
    message = {
        Status.peer_verified: f"🎉 «{title}» ishingiz tasdiqlandi: +{sub.points_awarded} ball. Portfolioingizga qo'shildi.",
        Status.mentor_verified: f"🏆 Mentor «{title}» ishingizni tasdiqladi. Endi jami {sub.points_awarded} ball.",
        Status.rejected: f"«{title}» ishingiz qaytarildi. Izohlarni o'qib, tuzating va qayta topshiring.",
    }.get(sub.status)
    if message:
        notify.send([sub.user.telegram_id], message)
    if sub.status is Status.peer_verified:
        mentors = (await session.execute(select(User.telegram_id).where(
            User.role.in_([Role.mentor, Role.admin]), User.is_blocked.is_(False)))).scalars().all()
        notify.send(list(mentors), f"✅ «{title}» ({sub.user.full_name}) tengdoshlar tasdiqladi. Mentor bahosini kutmoqda.")


async def _reload(session: AsyncSession, submission_id: int) -> Submission:
    session.expire_all()
    return (await session.execute(select(Submission).where(Submission.id == submission_id))).scalar_one()


async def review_queue(session: AsyncSession, reviewer: User, limit: int = 30) -> list[Submission]:
    already = (select(Review.id)
               .where(Review.submission_id == Submission.id, Review.reviewer_id == reviewer.id,
                      Review.round == Submission.round)
               .exists())
    query = (select(Submission).join(Task).join(User, User.id == Submission.user_id)
             .where(Submission.user_id != reviewer.id, ~already, User.is_blocked.is_(False),
                    Task.kind == "submission"))           # system-checked tasks need no human review
    if reviewer.role in (Role.mentor, Role.admin):
        query = query.where(Submission.status.in_([Status.pending, Status.peer_verified]))
    elif reviewer.track_id is None:
        return []
    else:
        query = query.where(Submission.status == Status.pending, Task.track_id == reviewer.track_id)
    return list((await session.execute(query.order_by(Submission.updated_at).limit(limit))).scalars())


async def rank_of(session: AsyncSession, user: User, track_id: int | None = None) -> int:
    query = select(func.count()).select_from(User).where(User.points > user.points, User.is_blocked.is_(False),
                                                         User.account_type == "student")
    if track_id is not None:
        query = query.where(User.track_id == track_id)
    return (await session.scalar(query)) + 1
