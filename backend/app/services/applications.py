"""The application pipeline: which status changes are allowed, the history, and the notices they send.

Hiring statistics (company dashboard, university outcomes, rankings) are built on these states,
so a hired student cannot silently become "rejected" and a rejected one cannot jump to "hired".
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ACTIVE_APPLICATION_STATES, Application, ApplicationEvent, User
from . import inbox

STATUS_LABEL = {
    "new": "Yuborildi", "viewed": "Ko'rib chiqilmoqda", "shortlisted": "Saralandi", "interview": "Suhbat",
    "offer": "Taklif", "hired": "Ishga olindi", "rejected": "Rad etildi", "withdrawn": "Qaytarib olindi",
}

# where a company may move an application from each state
EMPLOYER_MOVES: dict[str, set[str]] = {
    "new": {"viewed", "shortlisted", "interview", "offer", "hired", "rejected"},
    "viewed": {"shortlisted", "interview", "offer", "hired", "rejected"},
    "shortlisted": {"interview", "offer", "hired", "rejected"},
    "interview": {"interview", "offer", "hired", "rejected"},     # interview -> interview: a new time or place
    "offer": {"hired", "rejected"},
    "rejected": {"shortlisted"},                                  # the company reconsiders
    "hired": set(),
    "withdrawn": set(),
}

STUDENT_NOTICE = {
    "shortlisted": "«{job}» ({company}): arizangiz keyingi bosqichga o'tdi.",
    "interview": "«{job}» ({company}): sizni suhbatga taklif qilishdi.{when}",
    "offer": "«{job}» ({company}): sizga ish taklifi berildi. Kompaniya siz bilan bog'lanadi.",
    "hired": "Tabriklaymiz! «{job}» ({company}) bo'yicha sizni ishga qabul qilishdi.",
    "rejected": "«{job}» ({company}): arizangiz bu safar qabul qilinmadi. Boshqa vakansiyalarni ko'ring.",
}


def record(session: AsyncSession, app: Application, from_status: str, to_status: str, actor: str,
           actor_user_id: int | None, note: str = "") -> None:
    session.add(ApplicationEvent(application_id=app.id, from_status=from_status, to_status=to_status,
                                 actor=actor, actor_user_id=actor_user_id, note=note))


def _when(app: Application) -> str:
    parts = []
    if app.interview_at:
        parts.append(app.interview_at.astimezone().strftime("%d.%m.%Y %H:%M"))
    if app.interview_place:
        parts.append(app.interview_place)
    return f" Vaqt va joy: {', '.join(parts)}." if parts else ""


async def employer_move(session: AsyncSession, app: Application, employer: User, status: str | None,
                        interview_at: datetime | None = None, interview_place: str | None = None) -> bool:
    """Applies a company's decision and commits. Returns True when the student was told about a change."""
    current = app.status
    target = status or current
    rescheduling = target == "interview" and current == "interview" and (
        (interview_at is not None and interview_at != app.interview_at)
        or (interview_place is not None and interview_place.strip() != app.interview_place))
    if target == current and not rescheduling:
        await session.commit()                 # only the private note changed
        return False
    if target not in EMPLOYER_MOVES.get(current, set()):
        raise HTTPException(409, f"«{STATUS_LABEL[current]}» holatidagi arizani "
                                 f"«{STATUS_LABEL[target]}» holatiga o'tkazib bo'lmaydi")
    if target == "interview":
        if interview_at is not None:
            app.interview_at = interview_at
        if interview_place is not None:
            app.interview_place = interview_place.strip()
    app.status = target
    record(session, app, current, target, "employer", employer.id)
    await session.commit()
    if target in STUDENT_NOTICE:
        company = app.job.company.name
        await inbox.push(session, [app.user_id], "application_status",
                         STUDENT_NOTICE[target].format(job=app.job.title, company=company, when=_when(app)),
                         link="/talaba/arizalar",
                         params={"status": target, "job": app.job.title, "company": company})
    return True


async def mark_viewed(session: AsyncSession, apps: list[Application], employer: User) -> None:
    """Opening the candidate list counts as reviewing the new applications (no notice to the student)."""
    changed = [app for app in apps if app.status == "new"]
    for app in changed:
        app.status = "viewed"
        record(session, app, "new", "viewed", "employer", employer.id)
    await session.commit()
    for app in changed:                      # updated_at is set by the database
        await session.refresh(app)


async def withdraw(session: AsyncSession, app: Application, student: User) -> None:
    if app.status not in ACTIVE_APPLICATION_STATES:
        raise HTTPException(409, f"«{STATUS_LABEL[app.status]}» holatidagi arizani qaytarib bo'lmaydi")
    previous, app.status = app.status, "withdrawn"
    record(session, app, previous, "withdrawn", "student", student.id)
    await session.commit()
    await inbox.push(session, await company_staff_ids(session, app.job.company_id), "application_withdrawn",
                     f"{student.full_name} «{app.job.title}» bo'yicha arizasini qaytarib oldi.",
                     link="/korxona/nomzodlar", params={"job": app.job.title, "student": student.full_name})


async def company_staff_ids(session: AsyncSession, company_id: int) -> list[int]:
    """The company's HR accounts (user ids) that receive its notices."""
    return list((await session.execute(select(User.id).where(
        User.company_id == company_id, User.account_type == "employer", User.is_blocked.is_(False)))).scalars())
