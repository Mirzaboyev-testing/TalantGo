"""A university talking to its own students: messages to a chosen part of them, and events they sign up for.

Staff side under /university (approved staff only); the student side under /me/university. A message or an
event of a university only ever reaches that university's own students.
"""
import csv
import io
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select

from ..core import ratelimit
from ..models import EVENT_KINDS, AuditLog, EventRegistration, UniversityAnnouncement, UniversityEvent, User
from ..services import inbox
from .deps import CurrentUser, Session
from .university import Staff, StudentFilter, _roster_query, actor

TASHKENT = ZoneInfo("Asia/Tashkent")
router = APIRouter(prefix="/university", tags=["university"])
student_router = APIRouter(prefix="/me/university", tags=["university"])


class Audience(BaseModel):
    """Who a message or event is for; empty means every student of the university."""
    faculty: str | None = Field(default=None, max_length=120)
    course: int | None = Field(default=None, ge=1, le=7)
    group: str | None = Field(default=None, max_length=40)
    graduation_year: int | None = Field(default=None, ge=2000, le=2100)
    verified_only: bool = False
    open_to_work: bool | None = None

    def to_filter(self) -> StudentFilter:
        return StudentFilter(faculty=self.faculty or None, course=self.course, group=self.group or None,
                             graduation_year=self.graduation_year, open_to_work=self.open_to_work,
                             verification="verified" if self.verified_only else None)

    def matches(self, u: User) -> bool:
        return ((not self.faculty or u.faculty == self.faculty) and (not self.course or u.course == self.course)
                and (not self.group or u.group_name == self.group)
                and (not self.graduation_year or u.graduation_year == self.graduation_year)
                and (not self.verified_only or u.verification == "verified")
                and (self.open_to_work is None or u.open_to_work == self.open_to_work))


async def _audience_ids(session, uni_id: int, audience: Audience) -> list[int]:
    return list((await session.execute(_roster_query(uni_id, audience.to_filter()).with_only_columns(User.id))).scalars())


# --------------------------------------------------------------------------- messages

class AnnouncementIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    text: str = Field(min_length=5, max_length=2000)
    link: str = Field(default="", max_length=256)
    audience: Audience = Field(default_factory=Audience)


def _announcement_out(a: UniversityAnnouncement) -> dict:
    return {"id": a.id, "title": a.title, "text": a.text, "link": a.link, "audience": a.audience,
            "recipients": a.recipients, "author": a.author.full_name if a.author else None, "created_at": a.created_at}


@router.get("/announcements")
async def announcements(user: Staff, session: Session) -> list[dict]:
    rows = (await session.execute(select(UniversityAnnouncement).where(
        UniversityAnnouncement.university_id == user.staff_university_id)
        .order_by(UniversityAnnouncement.created_at.desc()).limit(100))).scalars()
    return [_announcement_out(a) for a in rows]


@router.post("/announcements/preview")
async def announcement_preview(body: Audience, user: Staff, session: Session) -> dict:
    """How many students a message with these filters would reach (shown before sending)."""
    return {"recipients": len(await _audience_ids(session, user.staff_university_id, body))}


@router.post("/announcements", status_code=201)
async def send_announcement(body: AnnouncementIn, user: Staff, session: Session) -> dict:
    uni = user.staff_university
    link = body.link.strip()
    if link and not (link.startswith("/") and not link.startswith("//")):
        raise HTTPException(422, "Havola ilova ichidagi sahifa bo'lsin (masalan /vakansiyalar/12)")
    ids = await _audience_ids(session, uni.id, body.audience)
    if not ids:
        raise HTTPException(422, "Bu filtrlar bo'yicha talaba topilmadi")
    ratelimit.limit(f"uni-announce:{uni.id}", 10, 24 * 3600, "Bir kunda 10 tadan ortiq xabar yuborib bo'lmaydi")
    row = UniversityAnnouncement(university_id=uni.id, author_id=user.id, title=body.title.strip(), text=body.text.strip(),
                                 link=link, audience=body.audience.model_dump(exclude_none=True, exclude_defaults=True),
                                 recipients=len(ids))
    session.add(row)
    session.add(AuditLog(actor=actor(user), action="university.announce", target=body.title[:200], details=f"{len(ids)} talaba"))
    await session.commit()
    await session.refresh(row)
    # the text is written by staff in one language, so it is stored and shown as written (no template)
    await inbox.push(session, ids, "university_announcement", f"{uni.short_name}: {row.title}\n{row.text}",
                     link=link or "/talaba/universitetim", params={"university": uni.short_name, "title": row.title})
    return _announcement_out(row)


# --------------------------------------------------------------------------- events

class EventIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    kind: Literal[EVENT_KINDS] = "career_day"          # type: ignore[valid-type]
    description: str = Field(default="", max_length=3000)
    starts_at: datetime
    ends_at: datetime | None = None
    location: str = Field(default="", max_length=200)
    online_url: str = Field(default="", max_length=256)
    capacity: int | None = Field(default=None, ge=1, le=100000)
    companies: str = Field(default="", max_length=300)
    audience: Audience = Field(default_factory=Audience)
    notify: bool = True

    @model_validator(mode="after")
    def _times(self):
        # a time typed without a zone is Tashkent time (the form sends ISO with a zone anyway)
        if self.starts_at.tzinfo is None:
            self.starts_at = self.starts_at.replace(tzinfo=TASHKENT)
        if self.ends_at is not None and self.ends_at.tzinfo is None:
            self.ends_at = self.ends_at.replace(tzinfo=TASHKENT)
        if self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("Tugash vaqti boshlanishdan oldin bo'lmasin")
        if self.online_url and not self.online_url.startswith(("https://", "http://")):
            raise ValueError("Onlayn havola https:// bilan boshlansin")
        return self


async def _counts(session, event_ids: list[int]) -> dict[int, tuple[int, int]]:
    if not event_ids:
        return {}
    rows = (await session.execute(select(EventRegistration.event_id, func.count(),
                                         func.count().filter(EventRegistration.attended.is_(True)))
                                  .where(EventRegistration.event_id.in_(event_ids)).group_by(EventRegistration.event_id))).all()
    return {e: (n, a) for e, n, a in rows}


def _event_out(e: UniversityEvent, registered: int = 0, attended: int = 0, **extra) -> dict:
    return {"id": e.id, "title": e.title, "kind": e.kind, "description": e.description, "starts_at": e.starts_at,
            "ends_at": e.ends_at, "location": e.location, "online_url": e.online_url, "capacity": e.capacity,
            "companies": e.companies, "audience": e.audience, "status": e.status, "registered": registered,
            "attended": attended, "created_at": e.created_at, **extra}


async def _own_event(session, user: User, event_id: int) -> UniversityEvent:
    e = await session.get(UniversityEvent, event_id)
    if e is None or e.university_id != user.staff_university_id:
        raise HTTPException(404, "Tadbir topilmadi")
    return e


@router.get("/events")
async def events(user: Staff, session: Session, scope: Literal["upcoming", "past", "all"] = "upcoming") -> list[dict]:
    query = select(UniversityEvent).where(UniversityEvent.university_id == user.staff_university_id)
    cutoff = datetime.now(UTC) - timedelta(hours=6)
    if scope == "upcoming":
        query = query.where(UniversityEvent.starts_at >= cutoff).order_by(UniversityEvent.starts_at)
    elif scope == "past":
        query = query.where(UniversityEvent.starts_at < cutoff).order_by(UniversityEvent.starts_at.desc())
    else:
        query = query.order_by(UniversityEvent.starts_at.desc())
    rows = (await session.execute(query.limit(200))).scalars().all()
    counts = await _counts(session, [e.id for e in rows])
    return [_event_out(e, *counts.get(e.id, (0, 0))) for e in rows]


@router.post("/events", status_code=201)
async def create_event(body: EventIn, user: Staff, session: Session) -> dict:
    uni = user.staff_university
    ratelimit.limit(f"uni-event:{uni.id}", 20, 24 * 3600, "Bir kunda 20 tadan ortiq tadbir yaratib bo'lmaydi")
    e = UniversityEvent(university_id=uni.id, created_by_id=user.id, **body.model_dump(exclude={"audience", "notify"}),
                        audience=body.audience.model_dump(exclude_none=True, exclude_defaults=True))
    session.add(e)
    session.add(AuditLog(actor=actor(user), action="university.event", target=body.title[:200]))
    await session.commit()
    await session.refresh(e)
    notified = 0
    if body.notify:
        ids = await _audience_ids(session, uni.id, body.audience)
        notified = len(ids)
        when = e.starts_at.astimezone(UTC).strftime("%d.%m.%Y")
        await inbox.push(session, ids, "university_event", f"{uni.short_name}: «{e.title}» ({when}). Ro'yxatdan o'ting.",
                         link="/talaba/universitetim", params={"university": uni.short_name, "title": e.title})
    return _event_out(e, notified=notified)


@router.patch("/events/{event_id}")
async def edit_event(event_id: int, body: EventIn, user: Staff, session: Session) -> dict:
    e = await _own_event(session, user, event_id)
    if e.status == "cancelled":
        raise HTTPException(409, "Bekor qilingan tadbirni tahrirlab bo'lmaydi")
    for field, value in body.model_dump(exclude={"audience", "notify"}).items():
        setattr(e, field, value)
    e.audience = body.audience.model_dump(exclude_none=True, exclude_defaults=True)
    await session.commit()
    n, a = (await _counts(session, [e.id])).get(e.id, (0, 0))
    return _event_out(e, n, a)


@router.post("/events/{event_id}/cancel")
async def cancel_event(event_id: int, user: Staff, session: Session) -> dict:
    e = await _own_event(session, user, event_id)
    e.status = "cancelled"
    session.add(AuditLog(actor=actor(user), action="university.event_cancel", target=e.title[:200]))
    await session.commit()
    ids = (await session.execute(select(EventRegistration.user_id).where(EventRegistration.event_id == e.id))).scalars().all()
    await inbox.push(session, ids, "university_event_cancelled", f"«{e.title}» tadbiri bekor qilindi.",
                     link="/talaba/universitetim", params={"title": e.title})
    return _event_out(e)


@router.get("/events/{event_id}/registrations")
async def registrations(event_id: int, user: Staff, session: Session) -> list[dict]:
    e = await _own_event(session, user, event_id)
    rows = (await session.execute(select(EventRegistration).where(EventRegistration.event_id == e.id)
                                  .order_by(EventRegistration.created_at))).scalars()
    return [{"user_id": r.user_id, "full_name": r.user.full_name, "faculty": r.user.faculty, "course": r.user.course,
             "group_name": r.user.group_name, "phone": r.user.phone, "attended": r.attended, "created_at": r.created_at}
            for r in rows]


class AttendanceIn(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=2000)
    attended: bool


@router.post("/events/{event_id}/attendance")
async def attendance(event_id: int, body: AttendanceIn, user: Staff, session: Session) -> dict:
    e = await _own_event(session, user, event_id)
    rows = (await session.execute(select(EventRegistration).where(EventRegistration.event_id == e.id,
                                                                  EventRegistration.user_id.in_(body.user_ids)))).scalars().all()
    for r in rows:
        r.attended = body.attended
    await session.commit()
    return {"updated": len(rows)}


@router.get("/events/{event_id}/registrations.csv")
async def registrations_csv(event_id: int, user: Staff, session: Session) -> StreamingResponse:
    e = await _own_event(session, user, event_id)
    rows = await registrations(event_id, user, session)
    buf = io.StringIO()
    buf.write("﻿")
    out = csv.writer(buf)
    out.writerow(["Ism", "Fakultet", "Kurs", "Guruh", "Telefon", "Qatnashdi", "Ro'yxatdan o'tgan"])
    for r in rows:
        out.writerow([r["full_name"], r["faculty"], r["course"] or "", r["group_name"], r["phone"],
                      "ha" if r["attended"] else "yo'q", r["created_at"].strftime("%d.%m.%Y %H:%M")])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="tadbir-{e.id}.csv"'})


# --------------------------------------------------------------------------- the student side

@student_router.get("/feed")
async def my_feed(user: CurrentUser, session: Session) -> dict:
    """The student's university: its recent messages and the events open to them."""
    if not user.university_id:
        return {"announcements": [], "events": []}
    msgs = (await session.execute(select(UniversityAnnouncement).where(
        UniversityAnnouncement.university_id == user.university_id)
        .order_by(UniversityAnnouncement.created_at.desc()).limit(30))).scalars().all()
    mine = [a for a in msgs if Audience(**a.audience).matches(user)][:8]
    rows = (await session.execute(select(UniversityEvent).where(
        UniversityEvent.university_id == user.university_id, UniversityEvent.status == "published",
        UniversityEvent.starts_at >= datetime.now(UTC) - timedelta(hours=6)).order_by(UniversityEvent.starts_at).limit(30))).scalars().all()
    registered = set((await session.execute(select(EventRegistration.event_id).where(
        EventRegistration.user_id == user.id, EventRegistration.event_id.in_([e.id for e in rows])))).scalars()) if rows else set()
    counts = await _counts(session, [e.id for e in rows])
    events_out = [_event_out(e, *counts.get(e.id, (0, 0)), me_registered=e.id in registered) for e in rows
                  if e.id in registered or Audience(**e.audience).matches(user)]
    return {"announcements": [{"id": a.id, "title": a.title, "text": a.text, "link": a.link, "created_at": a.created_at}
                              for a in mine], "events": events_out}


async def _open_event(session, user: User, event_id: int) -> UniversityEvent:
    e = await session.get(UniversityEvent, event_id)
    # Company events (university_id NULL) register through /me/events; a student without a university must not match them here
    if e is None or e.university_id is None or e.university_id != user.university_id or user.account_type != "student":
        raise HTTPException(404, "Tadbir topilmadi")
    return e


@student_router.post("/events/{event_id}/register", status_code=201)
async def register(event_id: int, user: CurrentUser, session: Session) -> dict:
    e = await _open_event(session, user, event_id)
    if e.status != "published" or e.starts_at < datetime.now(UTC) - timedelta(hours=6):
        raise HTTPException(409, "Bu tadbirga ro'yxatdan o'tib bo'lmaydi")
    if not Audience(**e.audience).matches(user):
        raise HTTPException(403, "Bu tadbir boshqa fakultet yoki kurs uchun")
    if await session.scalar(select(EventRegistration.id).where(EventRegistration.event_id == e.id,
                                                               EventRegistration.user_id == user.id)):
        return {"registered": True}
    if e.capacity:
        taken = await session.scalar(select(func.count()).select_from(EventRegistration).where(EventRegistration.event_id == e.id))
        if taken >= e.capacity:
            raise HTTPException(409, "Joylar to'lgan")
    session.add(EventRegistration(event_id=e.id, user_id=user.id))
    await session.commit()
    return {"registered": True}


@student_router.delete("/events/{event_id}/register")
async def unregister(event_id: int, user: CurrentUser, session: Session) -> dict:
    e = await _open_event(session, user, event_id)
    row = (await session.execute(select(EventRegistration).where(EventRegistration.event_id == e.id,
                                                                  EventRegistration.user_id == user.id))).scalar_one_or_none()
    if row is not None:
        await session.delete(row)
        await session.commit()
    return {"registered": False}
