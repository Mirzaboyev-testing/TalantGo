"""Events in one list for the student (student panel v2, phase 3): their university's events (audience rules of the
university panel, and only once that university verified them) and company events open to every student. Companies create and manage their own events here;
a student who registers for a company event shares their name with that company (the app says so)."""
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from ..core import ratelimit
from ..models import (Application, Challenge, ChallengeEntry, Company, Conversation, EventRegistration, Job, Partnership,
                      UniversityEvent, User)
from ..services import inbox, uni_news
from ..services.files import logo_url
from .deps import CurrentUser, Session
from .employer import ApprovedEmployer
from .uni_comms import TASHKENT, Audience, EventIn, _counts, _event_out

router = APIRouter(tags=["events"])


def _organiser(e: UniversityEvent) -> dict:
    if e.company_id:
        co = e.company
        return {"organiser": "company", "organiser_id": e.company_id, "organiser_name": co.name if co else "",
                "organiser_logo": logo_url(co.id, co.logo_file_id, co.status) if co else None}
    u = e.university
    return {"organiser": "university", "organiser_id": e.university_id, "organiser_name": u.short_name if u else "",
            "organiser_logo": None}


def _open_to(e: UniversityEvent, user: User) -> bool:
    if e.company_id:
        return bool(e.company and e.company.status == "approved")     # a company sent back to review loses its events
    # a university's events are for the students it verified (the university on a profile is self-declared)
    return uni_news.is_member(user, e.university_id) and Audience(**e.audience).matches(user)


@router.get("/me/events")
async def my_events(user: CurrentUser, session: Session, scope: Literal["upcoming", "mine", "past"] = "upcoming") -> list[dict]:
    cutoff = datetime.now(UTC) - timedelta(hours=6)
    query = select(UniversityEvent).where(UniversityEvent.status == "published", or_(
        UniversityEvent.company_id.in_(select(Company.id).where(Company.status == "approved")),
        (UniversityEvent.university_id == user.university_id) if user.university_id else UniversityEvent.id < 0))
    registered_ids = set((await session.execute(select(EventRegistration.event_id).where(
        EventRegistration.user_id == user.id))).scalars())
    if scope == "past":
        query = query.where(UniversityEvent.starts_at < cutoff).order_by(UniversityEvent.starts_at.desc())
    else:
        query = query.where(UniversityEvent.starts_at >= cutoff).order_by(UniversityEvent.starts_at)
    if scope == "mine":
        query = query.where(UniversityEvent.id.in_(registered_ids or {-1}))
    rows = [e for e in (await session.execute(query.limit(100))).scalars().all() if e.id in registered_ids or _open_to(e, user)]
    counts = await _counts(session, [e.id for e in rows])
    return [_event_out(e, counts.get(e.id, (0, 0))[0], me_registered=e.id in registered_ids, **_organiser(e)) for e in rows]


async def _event_for(session, user: User, event_id: int, lock: bool = False) -> UniversityEvent:
    e = await session.get(UniversityEvent, event_id, with_for_update=lock)   # the lock keeps the capacity honest
    if e is None or user.account_type != "student" or not (e.company_id or e.university_id == user.university_id):
        raise HTTPException(404, "Tadbir topilmadi")
    return e


@router.post("/me/events/{event_id}/register", status_code=201)
async def register(event_id: int, user: CurrentUser, session: Session) -> dict:
    from sqlalchemy import func
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    e = await _event_for(session, user, event_id, lock=True)
    if e.status != "published" or e.starts_at < datetime.now(UTC) - timedelta(hours=6):
        raise HTTPException(409, "Bu tadbirga ro'yxatdan o'tib bo'lmaydi")
    if not _open_to(e, user):
        raise HTTPException(403, uni_news.LOCKED if e.university_id and not uni_news.is_member(user, e.university_id)
                            else "Bu tadbir boshqa fakultet yoki kurs uchun")
    if await session.scalar(select(EventRegistration.id).where(EventRegistration.event_id == e.id, EventRegistration.user_id == user.id)):
        return {"registered": True}
    if e.capacity:
        taken = await session.scalar(select(func.count()).select_from(EventRegistration).where(EventRegistration.event_id == e.id))
        if taken >= e.capacity:
            raise HTTPException(409, "Joylar to'lgan")
    await session.execute(pg_insert(EventRegistration).values(event_id=e.id, user_id=user.id)
                          .on_conflict_do_nothing(index_elements=["event_id", "user_id"]))
    await session.commit()
    return {"registered": True}


@router.delete("/me/events/{event_id}/register")
async def unregister(event_id: int, user: CurrentUser, session: Session) -> dict:
    e = await _event_for(session, user, event_id)
    row = (await session.execute(select(EventRegistration).where(EventRegistration.event_id == e.id,
                                                                  EventRegistration.user_id == user.id))).scalar_one_or_none()
    if row is not None:
        await session.delete(row)
        await session.commit()
    return {"registered": False}


# --------------------------------------------------------------------------- company side

class CompanyEventIn(EventIn):
    audience: Audience = Field(default_factory=Audience, exclude=True)     # company events are open to all students
    notify: bool = False


async def _own(session, user: User, event_id: int) -> UniversityEvent:
    e = await session.get(UniversityEvent, event_id)
    if e is None or e.company_id != user.company_id:
        raise HTTPException(404, "Tadbir topilmadi")
    return e


@router.get("/employer/events")
async def company_events(user: ApprovedEmployer, session: Session) -> list[dict]:
    rows = (await session.execute(select(UniversityEvent).where(UniversityEvent.company_id == user.company_id)
                                  .order_by(UniversityEvent.starts_at.desc()).limit(200))).scalars().all()
    counts = await _counts(session, [e.id for e in rows])
    return [_event_out(e, *counts.get(e.id, (0, 0))) for e in rows]


@router.post("/employer/events", status_code=201)
async def create_company_event(body: CompanyEventIn, user: ApprovedEmployer, session: Session) -> dict:
    ratelimit.limit(f"company-event:{user.company_id}", 10, 24 * 3600, "Bir kunda 10 tadan ortiq tadbir yaratib bo'lmaydi")
    e = UniversityEvent(university_id=None, company_id=user.company_id, created_by_id=user.id,
                        **body.model_dump(exclude={"audience", "notify"}), audience={})
    session.add(e)
    await session.commit()
    await session.refresh(e)
    if e.starts_at > datetime.now(UTC):
        when = e.starts_at.astimezone(TASHKENT).strftime("%d.%m.%Y %H:%M")
        await inbox.push(session, await company_circle(session, user.company_id), "company_event",
                         f"{user.company.name}: «{e.title}» ({when}). Tadbirlar bo'limida ro'yxatdan o'ting.",
                         link="/talaba/tadbirlar", params={"company": user.company.name, "title": e.title})
    return _event_out(e)


async def company_circle(session, company_id: int) -> list[int]:
    """Students who know this company: applied to its jobs, entered its tasks, chatted with it, or study at a
    partner university. A company event is open to every student, but only these people get a notice."""
    applied = select(Application.user_id).join(Job, Job.id == Application.job_id).where(Job.company_id == company_id)
    entered = select(ChallengeEntry.user_id).join(Challenge, Challenge.id == ChallengeEntry.challenge_id).where(
        Challenge.company_id == company_id)
    chatted = select(Conversation.student_id).where(Conversation.company_id == company_id)
    partners = select(Partnership.university_id).where(Partnership.company_id == company_id, Partnership.status == "accepted")
    return list((await session.execute(select(User.id).where(
        User.account_type == "student", User.is_blocked.is_(False),
        or_(User.id.in_(applied), User.id.in_(entered), User.id.in_(chatted), User.university_id.in_(partners))))).scalars())


@router.put("/employer/events/{event_id}")
async def edit_company_event(event_id: int, body: CompanyEventIn, user: ApprovedEmployer, session: Session) -> dict:
    e = await _own(session, user, event_id)
    if e.status == "cancelled":
        raise HTTPException(409, "Bekor qilingan tadbirni tahrirlab bo'lmaydi")
    for field, value in body.model_dump(exclude={"audience", "notify"}).items():
        setattr(e, field, value)
    await session.commit()
    n, a = (await _counts(session, [e.id])).get(e.id, (0, 0))
    return _event_out(e, n, a)


@router.post("/employer/events/{event_id}/cancel")
async def cancel_company_event(event_id: int, user: ApprovedEmployer, session: Session) -> dict:
    e = await _own(session, user, event_id)
    e.status = "cancelled"
    await session.commit()
    ids = list((await session.execute(select(EventRegistration.user_id).where(EventRegistration.event_id == e.id))).scalars())
    await inbox.push(session, ids, "event_cancelled", f"«{e.title}» tadbiri bekor qilindi.", link="/talaba/tadbirlar",
                     params={"title": e.title})
    return _event_out(e)


@router.get("/employer/events/{event_id}/registrations")
async def company_event_registrations(event_id: int, user: ApprovedEmployer, session: Session) -> list[dict]:
    e = await _own(session, user, event_id)
    rows = (await session.execute(select(EventRegistration).where(EventRegistration.event_id == e.id)
                                  .order_by(EventRegistration.created_at))).scalars().all()
    return [{"id": r.id, "user_id": r.user_id, "full_name": r.user.full_name,
             "university": r.user.university_ref.short_name if r.user.university_ref else "",
             "faculty": r.user.faculty, "course": r.user.course, "registered_at": r.created_at} for r in rows]
