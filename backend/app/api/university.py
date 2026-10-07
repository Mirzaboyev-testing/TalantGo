"""University career-centre dashboard: verify their own students and see outcomes.

Free for universities: they get verification power and reports, and in exchange vouch for their
students, which is what makes the profiles trustworthy for employers.
"""
import csv
import io
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from ..models import Application, Company, ContactRequest, Job, Status, Submission, User
from ..schemas import ReviewDecisionIn
from ..services.career import decide_verification
from .deps import CurrentUser, Session

router = APIRouter(prefix="/university", tags=["university"])


async def staff(user: CurrentUser) -> User:
    if user.account_type != "university" or user.staff_status != "approved" or user.staff_university_id is None:
        raise HTTPException(403, "Bu bo'lim tasdiqlangan universitet xodimlari uchun")
    return user


Staff = Annotated[User, Depends(staff)]


def _students(uni_id: int):
    return select(User).where(User.university_id == uni_id, User.account_type == "student", User.is_blocked.is_(False))


def _verified_count():
    return (select(func.count()).where(Submission.user_id == User.id,
                                       Submission.status.in_([Status.peer_verified, Status.mentor_verified]))
            .correlate(User).scalar_subquery())


@router.get("/dashboard")
async def dashboard(user: Staff, session: Session) -> dict:
    uni = user.staff_university_id
    base = _students(uni).subquery()
    count = lambda *where: session.scalar(select(func.count()).select_from(base).where(*where))  # noqa: E731
    week_ago = datetime.now(UTC) - timedelta(days=7)
    total = await count()
    apps_by_status = dict((await session.execute(
        select(Application.status, func.count()).join(User, User.id == Application.user_id)
        .where(User.university_id == uni).group_by(Application.status))).all())
    companies = (await session.execute(
        select(Company.name, func.count(Application.id)).select_from(Application)
        .join(Job, Job.id == Application.job_id).join(Company, Company.id == Job.company_id)
        .join(User, User.id == Application.user_id).where(User.university_id == uni)
        .group_by(Company.name).order_by(func.count(Application.id).desc()).limit(10))).all()
    contacts = (await session.execute(
        select(Company.name, func.count(ContactRequest.id)).select_from(ContactRequest)
        .join(Company, Company.id == ContactRequest.company_id).join(User, User.id == ContactRequest.student_id)
        .where(User.university_id == uni).group_by(Company.name)
        .order_by(func.count(ContactRequest.id).desc()).limit(10))).all()
    by_course = (await session.execute(select(base.c.course, func.count()).group_by(base.c.course)
                                       .order_by(base.c.course))).all()
    by_faculty = (await session.execute(select(base.c.faculty, func.count()).group_by(base.c.faculty)
                                        .order_by(func.count().desc()).limit(15))).all()
    hires = (await session.execute(
        select(User.full_name, Job.title, Company.name, Application.updated_at).select_from(Application)
        .join(User, User.id == Application.user_id).join(Job, Job.id == Application.job_id)
        .join(Company, Company.id == Job.company_id)
        .where(User.university_id == uni, Application.status == "hired")
        .order_by(Application.updated_at.desc()).limit(20))).all()
    pct = lambda n: round(100 * n / total) if total else 0  # noqa: E731
    stats = {
        "verified": await count(base.c.verification == "verified"),
        "pending_verification": await count(base.c.verification == "pending"),
        "active_7d": await count(base.c.last_seen_at >= week_ago),
        "with_track": await count(base.c.track_id.isnot(None)),
        "cv_public": await count(base.c.cv_public.is_(True)),
        "open_to_work": await count(base.c.open_to_work.is_(True)),
    }
    return {
        "university": user.staff_university.name,
        "students": total,
        **stats,
        "percent": {k: pct(v) for k, v in stats.items()},
        "applications": apps_by_status,
        "hired": apps_by_status.get("hired", 0),
        "companies_by_applications": [{"name": n, "count": c} for n, c in companies],
        "companies_by_contacts": [{"name": n, "count": c} for n, c in contacts],
        "by_course": [{"course": c, "count": n} for c, n in by_course],
        "by_faculty": [{"faculty": f or "—", "count": n} for f, n in by_faculty],
        "recent_hires": [{"student": s, "job": j, "company": c, "date": d} for s, j, c, d in hires],
    }


def _student_row(u: User, verified_tasks: int) -> dict:
    return {"id": u.id, "full_name": u.full_name, "username": u.username, "faculty": u.faculty, "course": u.course,
            "group_name": u.group_name, "student_number": u.student_number, "verification": u.verification,
            "track": u.track.title if u.track else None, "points": u.points, "verified_tasks": verified_tasks,
            "open_to_work": u.open_to_work, "cv_public": u.cv_public, "last_seen_at": u.last_seen_at}


@router.get("/students")
async def students(user: Staff, session: Session, q: str | None = Query(default=None, max_length=80),
                   verification: str | None = None, course: int | None = None) -> list[dict]:
    verified = _verified_count().label("verified")
    query = select(User, verified).where(User.university_id == user.staff_university_id,
                                         User.account_type == "student")
    if q:
        like = f"%{q.strip()}%"
        query = query.where(User.full_name.ilike(like) | User.student_number.ilike(like) | User.faculty.ilike(like))
    if verification:
        query = query.where(User.verification == verification)
    if course:
        query = query.where(User.course == course)
    # the verification queue first, then the strongest profiles
    rows = (await session.execute(query.order_by((User.verification == "pending").desc(), User.points.desc())
                                  .limit(500))).all()
    return [_student_row(u, n) for u, n in rows]


@router.post("/verifications/{student_id}")
async def verify(student_id: int, body: ReviewDecisionIn, user: Staff, session: Session) -> dict:
    student = await session.get(User, student_id)
    if student is None or student.university_id != user.staff_university_id:
        raise HTTPException(404, "Bu talaba sizning universitetingizda emas")
    verifier = f"{user.staff_university.short_name} karyera markazi"
    await decide_verification(session, student, body.approve, verifier, body.note.strip())
    return {"verification": student.verification}


@router.get("/export.csv")
async def export(user: Staff, session: Session) -> StreamingResponse:
    verified = _verified_count().label("verified")
    rows = (await session.execute(select(User, verified).where(
        User.university_id == user.staff_university_id, User.account_type == "student")
        .order_by(User.faculty, User.course, User.full_name))).all()
    buf = io.StringIO()
    buf.write("﻿")
    out = csv.writer(buf)
    out.writerow(["Ism", "Fakultet", "Kurs", "Guruh", "Talaba ID", "Tasdiq", "Yo'nalish", "Ball",
                  "Tasdiqlangan ishlar", "Ishga tayyor", "CV ochiq"])
    for u, n in rows:
        out.writerow([u.full_name, u.faculty, u.course or "", u.group_name, u.student_number, u.verification,
                      u.track.title if u.track else "", u.points, n, "ha" if u.open_to_work else "yo'q",
                      "ha" if u.cv_public else "yo'q"])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="talabalar-hisobot.csv"'})
