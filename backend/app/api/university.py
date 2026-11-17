"""University career-centre panel: verify their own students, find and segment them, see outcomes,
work with companies, run the team, and report.

Free for universities: they get verification power and reports, and in exchange vouch for their
students, which is what makes the profiles trustworthy for employers. A university only ever sees its
own students (`User.university_id`), never another university's.
"""
import csv
import io
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, select

from ..core import ratelimit
from ..models import (Application, AuditLog, Company, ContactRequest, EmploymentOutcome, EventRegistration, Job,
                      JobRecommendation, Partnership, Status, Submission, SubmissionFile, Track, University,
                      UniversityEvent, User)
from ..schemas import ReviewDecisionIn, Url
from ..services import files, inbox, outcomes, partnerships
from ..services import staff as staff_service
from ..services.applications import company_staff_ids
from ..services.career import completeness, decide_verification
from ..services.catalog import clean_faculties
from .deps import CurrentUser, Session
from .jobs import job_out, visible_jobs

router = APIRouter(prefix="/university", tags=["university"])
public_router = APIRouter(prefix="/public/universities", tags=["university"])


async def staff(user: CurrentUser) -> User:
    if user.account_type != "university" or user.staff_status != "approved" or user.staff_university_id is None:
        raise HTTPException(403, "Bu bo'lim tasdiqlangan universitet xodimlari uchun")
    if user.staff_university is None or not user.staff_university.is_active:     # the admin switched the university off
        raise HTTPException(403, "Universitet faol emas. Administratorga yozing.")
    return user


Staff = Annotated[User, Depends(staff)]


async def lead(user: Staff) -> User:
    if user.staff_role != "lead":
        raise HTTPException(403, "Bu amal universitet rahbari (karyera markazi rahbari) uchun")
    return user


Lead = Annotated[User, Depends(lead)]


def actor(user: User) -> str:
    return f"{user.full_name} ({user.staff_university.short_name})"[:160]


def _students(uni_id: int):
    return select(User).where(User.university_id == uni_id, User.account_type == "student", User.is_blocked.is_(False))


def _verified_count():
    return (select(func.count()).where(Submission.user_id == User.id,
                                       Submission.status.in_([Status.peer_verified, Status.mentor_verified]))
            .correlate(User).scalar_subquery())


def _applications_count():
    return select(func.count()).where(Application.user_id == User.id).correlate(User).scalar_subquery()


def _hired():
    return exists().where(Application.user_id == User.id, Application.status == "hired").correlate(User)


def _placed(uni_id: int):
    return exists().where(EmploymentOutcome.student_id == User.id, EmploymentOutcome.university_id == uni_id,
                          EmploymentOutcome.confirmed.is_(True)).correlate(User)


def logo_url(uni: University) -> str | None:
    return f"/api/v1/public/universities/{uni.id}/logo?v={uni.logo_file_id}" if uni.logo_file_id else None


# --------------------------------------------------------------------------- student filters (one place)

class StudentFilter(BaseModel):
    """The filters of the student table; also used for exports, messages and recommendations."""
    q: str | None = Field(default=None, max_length=80)
    faculty: str | None = Field(default=None, max_length=120)
    course: int | None = Field(default=None, ge=1, le=7)
    group: str | None = Field(default=None, max_length=40)
    verification: Literal["none", "pending", "verified", "rejected"] | None = None
    track_id: int | None = None
    open_to_work: bool | None = None
    cv_public: bool | None = None
    activity: Literal["7d", "30d", "inactive"] | None = None
    graduation_year: int | None = Field(default=None, ge=2000, le=2100)
    outcome: Literal["applied", "hired", "placed", "none"] | None = None


def apply_filter(query, f: StudentFilter, uni_id: int):
    now = datetime.now(UTC)
    if f.q and f.q.strip():
        like = f"%{f.q.strip()}%"
        query = query.where(User.full_name.ilike(like) | User.student_number.ilike(like) | User.faculty.ilike(like)
                            | User.group_name.ilike(like))
    if f.faculty:
        query = query.where(User.faculty == f.faculty)
    if f.course:
        query = query.where(User.course == f.course)
    if f.group:
        query = query.where(User.group_name == f.group)
    if f.verification:
        query = query.where(User.verification == f.verification)
    if f.track_id:
        query = query.where(User.track_id == f.track_id)
    if f.open_to_work is not None:
        query = query.where(User.open_to_work.is_(f.open_to_work))
    if f.cv_public is not None:
        query = query.where(User.cv_public.is_(f.cv_public))
    if f.activity == "7d":
        query = query.where(User.last_seen_at >= now - timedelta(days=7))
    elif f.activity == "30d":
        query = query.where(User.last_seen_at >= now - timedelta(days=30))
    elif f.activity == "inactive":
        query = query.where((User.last_seen_at.is_(None)) | (User.last_seen_at < now - timedelta(days=30)))
    if f.graduation_year:
        query = query.where(User.graduation_year == f.graduation_year)
    if f.outcome == "applied":
        query = query.where(_applications_count() > 0)
    elif f.outcome == "hired":
        query = query.where(_hired())
    elif f.outcome == "placed":
        query = query.where(_placed(uni_id))
    elif f.outcome == "none":
        query = query.where(_applications_count() == 0)
    return query


SORTS = {
    "points": lambda: (User.points.desc(), User.id),
    "name": lambda: (User.full_name, User.id),
    "recent": lambda: (User.created_at.desc(), User.id),
    "active": lambda: (User.last_seen_at.desc().nulls_last(), User.id),
    "works": lambda: (_verified_count().desc(), User.points.desc()),
    "pending": lambda: ((User.verification == "pending").desc(), User.created_at, User.id),
}


def _student_row(u: User, verified_tasks: int, applications: int = 0, hired: bool = False, placed: bool = False) -> dict:
    # never phone, email or Telegram: the student's consent opens contacts only to employers they apply to
    return {"id": u.id, "full_name": u.full_name, "photo_url": u.photo_url,
            "faculty": u.faculty, "course": u.course, "group_name": u.group_name, "student_number": u.student_number,
            "graduation_year": u.graduation_year, "verification": u.verification,
            "track": u.track.title if u.track else None, "track_id": u.track_id, "points": u.points,
            "verified_tasks": verified_tasks, "open_to_work": u.open_to_work, "cv_public": u.cv_public,
            "last_seen_at": u.last_seen_at, "created_at": u.created_at, "applications": applications,
            "hired": hired, "placed": placed, "skills": u.skills[:6]}


# --------------------------------------------------------------------------- dashboard

def _profile_missing(uni: University) -> list[str]:
    checks = {"description": len(uni.description.strip()) >= 40, "logo": bool(uni.logo_file_id),
              "website": bool(uni.website), "telegram": bool(uni.telegram), "contacts": bool(uni.email or uni.phone),
              "address": bool(uni.address), "students_total": bool(uni.students_total), "cooperation": bool(uni.cooperation)}
    return [k for k, ok in checks.items() if not ok]


@router.get("/dashboard")
async def dashboard(user: Staff, session: Session) -> dict:
    uni = user.staff_university_id
    university = user.staff_university
    base = _students(uni).subquery()
    count = lambda *where: session.scalar(select(func.count()).select_from(base).where(*where))  # noqa: E731
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)
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
    # hires: verified students only, each student once (the employment page has the full picture)
    hires = (await session.execute(
        select(User.full_name, Job.title, Company.name, Application.updated_at).select_from(Application)
        .join(User, User.id == Application.user_id).join(Job, Job.id == Application.job_id)
        .join(Company, Company.id == Job.company_id)
        .where(User.university_id == uni, User.verification == "verified", Application.status == "hired")
        .order_by(Application.updated_at.desc()).limit(20))).all()
    hired_students = await session.scalar(
        select(func.count(func.distinct(Application.user_id))).join(User, User.id == Application.user_id)
        .where(User.university_id == uni, User.verification == "verified", Application.status == "hired"))
    # new students per week, the last 8 weeks (oldest first), for the trend line
    weeks = []
    for i in range(7, -1, -1):
        start, end = now - timedelta(days=7 * (i + 1)), now - timedelta(days=7 * i)
        weeks.append(await count(base.c.created_at >= start, base.c.created_at < end))
    pct = lambda n: round(100 * n / total) if total else 0  # noqa: E731
    stats = {
        "verified": await count(base.c.verification == "verified"),
        "pending_verification": await count(base.c.verification == "pending"),
        "active_7d": await count(base.c.last_seen_at >= week_ago),
        "with_track": await count(base.c.track_id.isnot(None)),
        "cv_public": await count(base.c.cv_public.is_(True)),
        "open_to_work": await count(base.c.open_to_work.is_(True)),
    }
    placement = await outcomes.university_stats(session, uni)
    todo = {
        "pending_verification": stats["pending_verification"],
        "outcomes_to_confirm": await session.scalar(
            select(func.count()).select_from(EmploymentOutcome).join(User, User.id == EmploymentOutcome.student_id)
            .where(EmploymentOutcome.university_id == uni, User.university_id == uni, EmploymentOutcome.confirmed.is_(False))),
        "partner_requests": await session.scalar(select(func.count()).select_from(Partnership).where(
            Partnership.university_id == uni, Partnership.status == "pending", Partnership.initiated_by == "company")),
        "team_requests": await session.scalar(select(func.count()).select_from(User).where(
            User.staff_university_id == uni, User.staff_status == "pending")) if user.staff_role == "lead" else 0,
        "profile_missing": _profile_missing(university),
    }
    upcoming = (await session.execute(
        select(UniversityEvent, select(func.count()).where(EventRegistration.event_id == UniversityEvent.id)
               .correlate(UniversityEvent).scalar_subquery())
        .where(UniversityEvent.university_id == uni, UniversityEvent.status == "published",
               UniversityEvent.starts_at >= now - timedelta(hours=6))
        .order_by(UniversityEvent.starts_at).limit(3))).all()
    return {
        "university": university.name,
        "university_info": {"id": university.id, "name": university.name, "short_name": university.short_name,
                            "logo_url": logo_url(university), "students_total": university.students_total,
                            "city": university.city or university.region},
        "role": user.staff_role,
        "students": total,
        "new_7d": weeks[-1],
        "signups_weekly": weeks,
        **stats,
        "percent": {k: pct(v) for k, v in stats.items()},
        "applications": apps_by_status,
        "applications_total": sum(apps_by_status.values()),
        "hired": hired_students,
        "placed": placement["placed"], "placement_rate": placement["placement_rate"],
        "placement_students": placement["students"], "min_sample": placement["min_sample"],
        "partners": placement["partners"],
        "open_jobs": await session.scalar(select(func.count()).select_from(visible_jobs().subquery())),
        "companies_by_applications": [{"name": n, "count": c} for n, c in companies],
        "companies_by_contacts": [{"name": n, "count": c} for n, c in contacts],
        "by_course": [{"course": c, "count": n} for c, n in by_course],
        "by_faculty": [{"faculty": f or "—", "count": n} for f, n in by_faculty],
        "recent_hires": [{"student": s, "job": j, "company": c, "date": d} for s, j, c, d in hires],
        "todo": todo,
        "upcoming_events": [{"id": e.id, "title": e.title, "kind": e.kind, "starts_at": e.starts_at,
                             "location": e.location, "registered": n} for e, n in upcoming],
    }


@router.get("/faculties")
async def faculties(user: Staff, session: Session) -> list[dict]:
    """Every faculty with its numbers: the table on the dashboard and the faculty report."""
    uni = user.staff_university_id
    week_ago = datetime.now(UTC) - timedelta(days=7)
    rows = (await session.execute(
        select(User.faculty, func.count(),
               func.count().filter(User.verification == "verified"),
               func.count().filter(User.verification == "pending"),
               func.count().filter(User.last_seen_at >= week_ago),
               func.count().filter(User.open_to_work.is_(True)),
               func.count().filter(User.cv_public.is_(True)),
               func.count().filter(User.track_id.isnot(None)),
               func.count().filter(_applications_count() > 0),
               func.count().filter(_hired()),
               func.count().filter(_placed(uni)))
        .where(User.university_id == uni, User.account_type == "student", User.is_blocked.is_(False))
        .group_by(User.faculty).order_by(func.count().desc()))).all()
    keys = ("students", "verified", "pending", "active_7d", "open_to_work", "cv_public", "with_track", "applied",
            "hired", "placed")
    return [{"faculty": f or "", **dict(zip(keys, nums))} for f, *nums in rows]


# --------------------------------------------------------------------------- students

@router.get("/students")
async def students(user: Staff, session: Session, q: str | None = Query(default=None, max_length=80),
                   verification: str | None = None, course: int | None = None) -> list[dict]:
    """Older list (kept for existing clients): the verification queue first, then the strongest profiles."""
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
    rows = (await session.execute(query.order_by((User.verification == "pending").desc(), User.points.desc())
                                  .limit(500))).all()
    return [_student_row(u, n) for u, n in rows]


def _roster_query(uni_id: int, f: StudentFilter):
    return apply_filter(select(User).where(User.university_id == uni_id, User.account_type == "student",
                                           User.is_blocked.is_(False)), f, uni_id)


@router.get("/roster")
async def roster(user: Staff, session: Session, f: Annotated[StudentFilter, Query()],
                 sort: Literal["points", "name", "recent", "active", "works", "pending"] = "points",
                 page: int = Query(default=1, ge=1, le=10000), limit: int = Query(default=25, ge=5, le=200)) -> dict:
    """The student table: every filter, a sort and pages."""
    uni = user.staff_university_id
    base = _roster_query(uni, f)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    query = (base.add_columns(_verified_count().label("works"), _applications_count().label("apps"),
                              _hired().label("hired"), _placed(uni).label("placed"))
             .order_by(*SORTS[sort]()).offset((page - 1) * limit).limit(limit))
    rows = (await session.execute(query)).all()
    return {"items": [_student_row(u, w, a, h, p) for u, w, a, h, p in rows], "total": total, "page": page, "limit": limit}


@router.get("/roster/facets")
async def roster_facets(user: Staff, session: Session, faculty: str | None = Query(default=None, max_length=120)) -> dict:
    """What the filters can offer, with counts; groups are narrowed to the chosen faculty."""
    uni = user.staff_university_id
    where = (User.university_id == uni, User.account_type == "student", User.is_blocked.is_(False))
    month_ago = datetime.now(UTC) - timedelta(days=30)

    async def grouped(column, *extra):
        return (await session.execute(select(column, func.count()).where(*where, *extra).group_by(column)
                                      .order_by(func.count().desc()))).all()

    tracks = (await session.execute(select(Track.id, Track.title, func.count(User.id)).join(User, User.track_id == Track.id)
                                    .where(*where).group_by(Track.id, Track.title).order_by(func.count(User.id).desc()))).all()
    counts = (await session.execute(select(
        func.count(), func.count().filter(User.verification == "pending"), func.count().filter(User.verification == "verified"),
        func.count().filter(User.verification == "rejected"), func.count().filter(User.verification == "none"),
        func.count().filter(User.open_to_work.is_(True)), func.count().filter(User.cv_public.is_(True)),
        func.count().filter((User.last_seen_at.is_(None)) | (User.last_seen_at < month_ago))).where(*where))).one()
    return {
        "faculties": [{"value": v, "count": n} for v, n in await grouped(User.faculty, User.faculty != "")],
        "groups": [{"value": v, "count": n} for v, n in await grouped(User.group_name, User.group_name != "",
                                                                       *([User.faculty == faculty] if faculty else []))][:200],
        "courses": sorted([{"value": v, "count": n} for v, n in await grouped(User.course, User.course.isnot(None))],
                          key=lambda r: r["value"]),
        "years": sorted([{"value": v, "count": n} for v, n in await grouped(User.graduation_year, User.graduation_year.isnot(None))],
                        key=lambda r: r["value"]),
        "tracks": [{"id": i, "title": t, "count": n} for i, t, n in tracks],
        "counts": dict(zip(("all", "pending", "verified", "rejected", "none", "open_to_work", "cv_public", "inactive"), counts)),
    }


async def _own_student(session, user: User, student_id: int) -> User:
    student = await session.get(User, student_id)
    if student is None or student.university_id != user.staff_university_id or student.account_type != "student":
        raise HTTPException(404, "Bu talaba sizning universitetingizda emas")
    return student


@router.get("/students/{student_id}")
async def student_detail(student_id: int, user: Staff, session: Session) -> dict:
    """One of the university's own students in full: profile, progress, applications, work, events."""
    uni = user.staff_university_id
    s = await _own_student(session, user, student_id)
    works = await session.scalar(select(func.count()).select_from(Submission).where(
        Submission.user_id == s.id, Submission.status.in_([Status.peer_verified, Status.mentor_verified])))
    apps = (await session.execute(select(Application, Job.title, Company.name).join(Job, Job.id == Application.job_id)
                                  .join(Company, Company.id == Job.company_id).where(Application.user_id == s.id)
                                  .order_by(Application.updated_at.desc()).limit(30))).all()
    outs = (await session.execute(select(EmploymentOutcome).where(EmploymentOutcome.student_id == s.id)
                                  .order_by(EmploymentOutcome.created_at.desc()))).scalars().all()
    events = (await session.execute(select(UniversityEvent.title, UniversityEvent.starts_at, EventRegistration.attended)
                                    .join(EventRegistration, EventRegistration.event_id == UniversityEvent.id)
                                    .where(EventRegistration.user_id == s.id, UniversityEvent.university_id == uni)
                                    .order_by(UniversityEvent.starts_at.desc()).limit(20))).all()
    hired = any(a.status == "hired" for a, _, _ in apps)
    placed = any(o.confirmed and o.university_id == uni for o in outs)
    return {
        **_student_row(s, works, len(apps), hired, placed),
        "skills": s.skills, "languages": s.languages, "job_types": s.job_types, "city": s.city, "bio": s.bio,
        "headline": s.headline, "gpa": s.gpa, "gpa_scale": s.gpa_scale,
        "github_url": s.github_url, "linkedin_url": s.linkedin_url, "verified_by": s.verified_by,
        "verified_at": s.verified_at, "verification_note": s.verification_note,
        "cv_slug": s.cv_slug, "completeness": completeness(s), "streak": s.streak_count,
        "applications_list": [{"job": t, "company": c, "status": a.status, "updated_at": a.updated_at} for a, t, c in apps],
        "outcomes": [{"company": o.company_name, "position": o.position, "kind": o.kind, "confirmed": o.confirmed,
                      "confirmed_by": o.confirmed_by, "started_on": o.started_on} for o in outs],
        "events": [{"title": t, "starts_at": d, "attended": a} for t, d, a in events],
    }


class BulkVerifyIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)
    approve: bool
    note: str = Field(default="", max_length=500)


@router.post("/verifications/bulk")
async def verify_bulk(body: BulkVerifyIn, user: Staff, session: Session) -> dict:
    """Several waiting students at once (only the university's own, only those still waiting)."""
    if not body.approve and len(body.note.strip()) < 3:
        raise HTTPException(422, "Rad etish sababini yozing")
    verifier = f"{user.staff_university.short_name} karyera markazi"
    rows = (await session.execute(select(User).where(User.id.in_(body.ids), User.university_id == user.staff_university_id,
                                                     User.account_type == "student", User.verification == "pending"))).scalars().all()
    for student in rows:
        session.add(AuditLog(actor=actor(user), action="student.verify" if body.approve else "student.reject",
                             target=student.full_name[:200], details="bulk"))
        await decide_verification(session, student, body.approve, verifier, body.note.strip())
    return {"done": len(rows), "skipped": len(set(body.ids)) - len(rows)}


@router.post("/verifications/{student_id}")
async def verify(student_id: int, body: ReviewDecisionIn, user: Staff, session: Session) -> dict:
    student = await _own_student(session, user, student_id)
    verifier = f"{user.staff_university.short_name} karyera markazi"
    session.add(AuditLog(actor=actor(user), action="student.verify" if body.approve else "student.reject",
                         target=student.full_name[:200]))
    await decide_verification(session, student, body.approve, verifier, body.note.strip())
    return {"verification": student.verification}


def cell(value):
    """Text a student typed (name, group, company) must not run as a formula when Excel opens the file."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def _csv(rows: list[list], header: list[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("﻿")                      # Excel opens UTF-8 with a BOM correctly
    out = csv.writer(buf)
    out.writerow(header)
    out.writerows([cell(v) for v in row] for row in rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/export.csv")
async def export(user: Staff, session: Session, f: Annotated[StudentFilter, Query()]) -> StreamingResponse:
    """The student list as a spreadsheet, with the same filters as the table."""
    uni = user.staff_university_id
    rows = (await session.execute(_roster_query(uni, f).add_columns(
        _verified_count(), _applications_count(), _hired(), _placed(uni))
        .order_by(User.faculty, User.course, User.group_name, User.full_name))).all()
    yes = lambda v: "ha" if v else "yo'q"  # noqa: E731
    return _csv([[u.full_name, u.faculty, u.course or "", u.group_name, u.student_number, u.graduation_year or "",
                  u.verification, u.track.title if u.track else "", u.points, w, a, yes(h), yes(p), yes(u.open_to_work),
                  yes(u.cv_public),
                  u.last_seen_at.strftime("%d.%m.%Y") if u.last_seen_at else ""] for u, w, a, h, p in rows],
                ["Ism", "Fakultet", "Kurs", "Guruh", "Talaba ID", "Bitirish yili", "Tasdiq", "Yo'nalish", "Ball",
                 "Tasdiqlangan ishlar", "Arizalar", "Ishga olingan", "Ish joyi tasdiqlangan", "Ishga tayyor", "CV ochiq",
                 "Oxirgi kirish"], "talabalar-hisobot.csv")


@router.get("/faculties.csv")
async def faculties_csv(user: Staff, session: Session) -> StreamingResponse:
    data = await faculties(user, session)
    return _csv([[r["faculty"] or "—", r["students"], r["verified"], r["pending"], r["active_7d"], r["open_to_work"],
                  r["cv_public"], r["with_track"], r["applied"], r["hired"], r["placed"]] for r in data],
                ["Fakultet", "Talabalar", "Tasdiqlangan", "Kutmoqda", "7 kunda faol", "Ishga tayyor", "CV ochiq",
                 "Yo'nalish tanlagan", "Ariza bergan", "Ishga olingan", "Ish joyi tasdiqlangan"], "fakultetlar-hisobot.csv")


@router.get("/outcomes.csv")
async def outcomes_csv(user: Staff, session: Session) -> StreamingResponse:
    data = await outcomes_list(user, session)
    return _csv([[o["student"], o["faculty"], o["graduation_year"] or "", o["company"], o["position"], o["kind"],
                  o["started_on"] or "", "ha" if o["confirmed"] else "yo'q", o["confirmed_by"], o["source"]] for o in data],
                ["Talaba", "Fakultet", "Bitirish yili", "Korxona", "Lavozim", "Turi", "Boshlagan", "Tasdiqlangan",
                 "Kim tasdiqlagan", "Manba"], "bandlik-yozuvlari.csv")


# --------------------------------------------------------------------------- profile

class ProfileIn(BaseModel):
    description: str | None = Field(default=None, max_length=3000)
    website: Url | None = None
    city: str | None = Field(default=None, max_length=60)
    region: str | None = Field(default=None, max_length=60)
    telegram: str | None = Field(default=None, max_length=128)
    social: str | None = Field(default=None, max_length=256)
    email: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=200)
    founded_year: int | None = Field(default=None, ge=1800, le=2100)
    students_total: int | None = Field(default=None, ge=0, le=500000)
    cooperation: list[str] | None = Field(default=None, max_length=12)
    faculties: list[str] | None = Field(default=None, max_length=60)
    show_as_partner: bool | None = None
    logo_id: int | None = None
    mou_id: int | None = None
    remove_logo: bool = False


async def _profile(session, u: University) -> dict:
    mou = await session.get(SubmissionFile, u.mou_file_id) if u.mou_file_id else None
    return {"id": u.id, "name": u.name, "short_name": u.short_name, "city": u.city, "region": u.region,
            "description": u.description, "website": u.website, "telegram": u.telegram, "social": u.social,
            "email": u.email, "phone": u.phone, "address": u.address, "founded_year": u.founded_year,
            "students_total": u.students_total, "cooperation": u.cooperation, "show_as_partner": u.show_as_partner,
            "faculties": u.faculties,
            "logo_url": logo_url(u), "mou": files.file_out(mou) if mou else None, "missing": _profile_missing(u)}


@router.get("/profile")
async def profile(user: Staff, session: Session) -> dict:
    return await _profile(session, user.staff_university)


@router.patch("/profile")
async def edit_profile(body: ProfileIn, user: Staff, session: Session) -> dict:
    if body.website and len(body.website) > 256:
        raise HTTPException(422, "Veb-sayt manzili juda uzun")
    uni = await session.get(University, user.staff_university_id)
    data = body.model_dump(exclude_unset=True, exclude={"logo_id", "mou_id", "remove_logo", "cooperation", "faculties",
                                                         "founded_year", "students_total", "show_as_partner"})
    for field, value in data.items():
        if value is not None:
            setattr(uni, field, value.strip())
    for field in ("founded_year", "students_total"):
        if field in body.model_fields_set:
            setattr(uni, field, getattr(body, field))
    if body.cooperation is not None:
        uni.cooperation = [c for c in dict.fromkeys(body.cooperation) if c in staff_service.COOPERATION]
    if body.faculties is not None:            # the list students pick from at sign-up
        uni.faculties = clean_faculties(body.faculties)
    if body.show_as_partner is not None:
        uni.show_as_partner = body.show_as_partner
    if body.logo_id:
        uni.logo_file_id = await files.company_file(session, user.id, body.logo_id, files.LOGO_TYPES, "Logotip")
    elif body.remove_logo:
        uni.logo_file_id = None
    if body.mou_id:
        uni.mou_file_id = await files.company_file(session, user.id, body.mou_id, files.DOC_TYPES, "Hamkorlik xati")
    session.add(AuditLog(actor=actor(user), action="university.profile", target=uni.name[:200]))
    await session.commit()
    return await _profile(session, uni)


@public_router.get("/{university_id}/logo", include_in_schema=False)
async def university_logo(university_id: int, session: Session) -> FileResponse:
    uni = await session.get(University, university_id)
    row = await session.get(SubmissionFile, uni.logo_file_id) if uni and uni.is_active and uni.logo_file_id else None
    path = files.root() / row.stored_name if row else None
    if row is None or row.mime not in files.LOGO_TYPES or not path.is_file():
        raise HTTPException(404, "Logotip yo'q")
    return FileResponse(path, media_type=row.mime, headers={"X-Content-Type-Options": "nosniff",
                                                            "Cache-Control": "public, max-age=86400"})


# --------------------------------------------------------------------------- team

@router.get("/team")
async def team(user: Staff, session: Session) -> dict:
    rows = await staff_service.team(session, user.staff_university_id)
    if user.staff_role != "lead":           # members see who is on the team, not colleagues' documents and contacts
        rows = [r if r["id"] == user.id else {**r, "phone": "", "email": None, "work_email": "", "doc": None, "mou": None,
                                              "review_note": ""} for r in rows]
    return {"me": {"id": user.id, "role": user.staff_role}, "rows": rows}


async def _colleague(session, user: User, colleague_id: int) -> User:
    other = await session.get(User, colleague_id)
    if other is None or other.staff_university_id != user.staff_university_id or other.account_type != "university":
        raise HTTPException(404, "Xodim topilmadi")
    return other


class TeamDecisionIn(BaseModel):
    decision: Literal["approve", "needs_info", "reject"]
    note: str = Field(default="", max_length=500)


@router.post("/team/{colleague_id}/decide")
async def team_decide(colleague_id: int, body: TeamDecisionIn, user: Lead, session: Session) -> dict:
    """The university's lead decides on a colleague's request (the app owner sees it too)."""
    other = await _colleague(session, user, colleague_id)
    if other.id == user.id:
        raise HTTPException(403, "O'zingizning so'rovingizni tasdiqlay olmaysiz")
    session.add(AuditLog(actor=actor(user), action="staff.team_review", target=other.full_name[:200], details=body.decision))
    await staff_service.decide(session, other, body.decision, body.note, actor(user))
    return await staff_service.row(session, other)


class RevokeIn(BaseModel):
    note: str = Field(default="", max_length=500)


@router.post("/team/{colleague_id}/revoke")
async def team_revoke(colleague_id: int, body: RevokeIn, user: Lead, session: Session) -> dict:
    other = await _colleague(session, user, colleague_id)
    if other.id == user.id:
        raise HTTPException(409, "O'zingizni jamoadan chiqara olmaysiz")
    session.add(AuditLog(actor=actor(user), action="staff.team_revoke", target=other.full_name[:200], details=body.note))
    await staff_service.revoke(session, other, body.note, actor(user))
    return {"status": other.staff_status}


class RoleIn(BaseModel):
    role: Literal["lead", "member"]


@router.post("/team/{colleague_id}/role")
async def team_role(colleague_id: int, body: RoleIn, user: Lead, session: Session) -> dict:
    other = await _colleague(session, user, colleague_id)
    session.add(AuditLog(actor=actor(user), action="staff.team_role", target=other.full_name[:200], details=body.role))
    await staff_service.set_role(session, other, body.role)
    return {"role": other.staff_role}


# --------------------------------------------------------------------------- employment outcomes

@router.get("/stats")
async def stats(user: Staff, session: Session, cohort: int | None = Query(default=None, ge=2000, le=2100),
                faculty: str | None = Query(default=None, max_length=120)) -> dict:
    faculties_ = (await session.execute(select(User.faculty, func.count()).where(
        User.university_id == user.staff_university_id, User.account_type == "student",
        User.verification == "verified", User.faculty != "").group_by(User.faculty).order_by(func.count().desc()))).all()
    data = await outcomes.university_stats(session, user.staff_university_id, cohort, faculty)
    return {**data, "faculties": [f for f, _ in faculties_]}


def outcome_out(o: EmploymentOutcome) -> dict:
    return {"id": o.id, "student_id": o.student_id, "student": o.student.full_name, "faculty": o.student.faculty,
            "graduation_year": o.student.graduation_year, "company": o.company_name, "position": o.position,
            "kind": o.kind, "started_on": o.started_on, "source": o.source, "confirmed": o.confirmed,
            "confirmed_by": o.confirmed_by, "created_at": o.created_at}


@router.get("/outcomes")
async def outcomes_list(user: Staff, session: Session, confirmed: bool | None = None) -> list[dict]:
    query = (select(EmploymentOutcome).join(User, User.id == EmploymentOutcome.student_id)
             .where(EmploymentOutcome.university_id == user.staff_university_id,
                    User.university_id == user.staff_university_id))          # not students who moved away
    if confirmed is not None:
        query = query.where(EmploymentOutcome.confirmed.is_(confirmed))
    rows = (await session.execute(query.order_by(EmploymentOutcome.confirmed, EmploymentOutcome.created_at.desc())
                                  .limit(500))).scalars().all()
    return [outcome_out(o) for o in rows]


class OutcomeDecisionIn(BaseModel):
    confirm: bool
    note: str = Field(default="", max_length=500)


@router.post("/outcomes/{outcome_id}")
async def decide_outcome(outcome_id: int, body: OutcomeDecisionIn, user: Staff, session: Session) -> dict:
    """The career centre confirms a student's own report (it then counts) or removes a wrong one."""
    o = await session.get(EmploymentOutcome, outcome_id)
    if o is None or o.university_id != user.staff_university_id or o.student.university_id != user.staff_university_id:
        raise HTTPException(404, "Yozuv topilmadi")
    if o.source == "application" or o.confirmed_by == "company":
        raise HTTPException(409, "Bu ish joyini korxona allaqachon tasdiqlagan")
    student_id, company = o.student_id, o.company_name
    session.add(AuditLog(actor=actor(user), action="outcome.confirm" if body.confirm else "outcome.remove",
                         target=f"{o.student.full_name}: {company}"[:200]))
    if body.confirm:
        o.confirmed, o.confirmed_by = True, "university"
    else:
        await session.delete(o)
    await session.commit()
    await inbox.push(session, [student_id], "outcome_review",
                     f"Universitet «{company}» bo'yicha ish joyingizni tasdiqladi." if body.confirm
                     else f"Universitet «{company}» bo'yicha yozuvingizni tasdiqlamadi. {body.note}".strip(),
                     link="/talaba/universitetim", params={"approved": body.confirm, "company": company, "note": body.note})
    return {"confirmed": body.confirm}


# --------------------------------------------------------------------------- companies and partners

async def _company_numbers(session, uni: int) -> tuple[dict, dict, dict]:
    live = visible_jobs().subquery()
    open_jobs = dict((await session.execute(select(live.c.company_id, func.count()).group_by(live.c.company_id))).all())
    applied = dict((await session.execute(select(Job.company_id, func.count(func.distinct(Application.user_id)))
                                          .join(Job, Job.id == Application.job_id).join(User, User.id == Application.user_id)
                                          .where(User.university_id == uni).group_by(Job.company_id))).all())
    hired = dict((await session.execute(select(Job.company_id, func.count(func.distinct(Application.user_id)))
                                        .join(Job, Job.id == Application.job_id).join(User, User.id == Application.user_id)
                                        .where(User.university_id == uni, Application.status == "hired")
                                        .group_by(Job.company_id))).all())
    return open_jobs, applied, hired


@router.get("/partners")
async def partners(user: Staff, session: Session) -> list[dict]:
    uni = user.staff_university_id
    rows = (await session.execute(select(Partnership).where(Partnership.university_id == uni)
                                  .order_by((Partnership.status == "pending").desc(), Partnership.created_at.desc()))).scalars().all()
    open_jobs, applied, hired = await _company_numbers(session, uni)
    return [{**partnerships.out(p), "city": p.company.city, "open_jobs": open_jobs.get(p.company_id, 0),
             "our_applicants": applied.get(p.company_id, 0), "our_hires": hired.get(p.company_id, 0)} for p in rows]


@router.get("/companies")
async def companies(user: Staff, session: Session, q: str | None = Query(default=None, max_length=80),
                    industry: str | None = Query(default=None, max_length=80)) -> list[dict]:
    """Approved companies to work with: partners and those our students apply to first."""
    uni = user.staff_university_id
    query = select(Company).where(Company.status == "approved")
    if q and q.strip():
        query = query.where(Company.name.ilike(f"%{q.strip()}%"))
    if industry:
        query = query.where(Company.industry == industry)
    rows = (await session.execute(query.order_by(Company.name).limit(300))).scalars().all()
    links = {p.company_id: p for p in (await session.execute(select(Partnership).where(Partnership.university_id == uni))).scalars()}
    open_jobs, applied, hired = await _company_numbers(session, uni)
    out = [{"id": c.id, "name": c.name, "industry": c.industry, "city": c.city, "size": c.size, "website": c.website,
            "logo_url": files.logo_url(c.id, getattr(c, "logo_file_id", None), c.status),
            "open_jobs": open_jobs.get(c.id, 0), "our_applicants": applied.get(c.id, 0), "our_hires": hired.get(c.id, 0),
            "partnership": {"id": links[c.id].id, "status": links[c.id].status, "initiated_by": links[c.id].initiated_by}
            if c.id in links else None} for c in rows]
    rank = {"accepted": 0, "pending": 1}
    return sorted(out, key=lambda c: (rank.get((c["partnership"] or {}).get("status"), 2), -c["our_applicants"], -c["open_jobs"]))[:120]


class PartnerRequestIn(BaseModel):
    company_id: int
    message: str = Field(default="", max_length=1000)


@router.post("/partners", status_code=201)
async def request_partner(body: PartnerRequestIn, user: Staff, session: Session) -> dict:
    company = await session.get(Company, body.company_id)
    if company is None or company.status != "approved":
        raise HTTPException(404, "Kompaniya topilmadi")
    ratelimit.limit(f"partner-ask:u{user.staff_university_id}", 20, 24 * 3600, "Bir kunda 20 tadan ortiq taklif yuborib bo'lmaydi")
    p = await partnerships.open_request(session, company, user.staff_university, "university", body.message)
    await inbox.push(session, await company_staff_ids(session, company.id), "partnership_request",
                     f"{user.staff_university.name} hamkorlik taklif qildi.", link="/korxona/universitetlar",
                     params={"university": user.staff_university.name})
    return partnerships.out(p)


class DecisionIn(BaseModel):
    accept: bool


@router.post("/partners/{partnership_id}/decide")
async def decide_partner(partnership_id: int, body: DecisionIn, user: Staff, session: Session) -> dict:
    p = await session.get(Partnership, partnership_id)
    if p is None or p.university_id != user.staff_university_id:
        raise HTTPException(404, "So'rov topilmadi")
    await partnerships.decide(session, p, "university", body.accept)
    verdict = "qabul qildi" if body.accept else "rad etdi"
    await inbox.push(session, await company_staff_ids(session, p.company_id), "partnership_decision",
                     f"{p.university.name} hamkorlik so'rovingizni {verdict}.",
                     link="/korxona/universitetlar", params={"approved": body.accept, "university": p.university.name})
    return partnerships.out(p)


# --------------------------------------------------------------------------- opportunities

@router.get("/opportunities")
async def opportunities(user: Staff, session: Session) -> list[dict]:
    """Live vacancies, partners first, with how many of this university's students applied."""
    uni = user.staff_university_id
    partner_ids = set((await session.execute(select(Partnership.company_id).where(
        Partnership.university_id == uni, Partnership.status == "accepted"))).scalars())
    recommended = set((await session.execute(select(JobRecommendation.job_id).where(
        JobRecommendation.university_id == uni))).scalars())
    applied = dict((await session.execute(select(Application.job_id, func.count()).join(User, User.id == Application.user_id)
                                          .where(User.university_id == uni).group_by(Application.job_id))).all())
    jobs = (await session.execute(visible_jobs().order_by(Job.created_at.desc()).limit(200))).scalars().all()
    out = [{**job_out(j).model_dump(), "partner": j.company_id in partner_ids, "recommended": j.id in recommended,
            "our_applicants": applied.get(j.id, 0)} for j in jobs]
    return sorted(out, key=lambda j: (not j["partner"], not j["recommended"]))


class RecommendIn(BaseModel):
    note: str = Field(default="", max_length=500)
    faculty: str | None = Field(default=None, max_length=120)      # only these students get the notice
    course: int | None = Field(default=None, ge=1, le=7)


@router.post("/jobs/{job_id}/recommend", status_code=201)
async def recommend(job_id: int, body: RecommendIn, user: Staff, session: Session) -> dict:
    job = (await session.execute(visible_jobs().where(Job.id == job_id))).scalar_one_or_none()
    if job is None:
        raise HTTPException(404, "Vakansiya topilmadi yoki yopilgan")
    uni = user.staff_university_id
    if await session.scalar(select(JobRecommendation.id).where(JobRecommendation.university_id == uni,
                                                               JobRecommendation.job_id == job_id)):
        raise HTTPException(409, "Bu vakansiya allaqachon tavsiya qilingan")
    ratelimit.limit(f"recommend:{uni}", 20, 24 * 3600, "Bir kunda 20 tadan ortiq vakansiya tavsiya qilib bo'lmaydi")
    session.add(JobRecommendation(university_id=uni, job_id=job_id, note=body.note.strip(), created_by_id=user.id))
    await session.commit()
    f = StudentFilter(verification="verified", faculty=body.faculty or None, course=body.course)
    students = (await session.execute(_roster_query(uni, f).with_only_columns(User.id))).scalars().all()
    note = f" {body.note.strip()}" if body.note.strip() else ""
    await inbox.push(session, students, "job_recommended",
                     f"{user.staff_university.short_name} karyera markazi tavsiya qiladi: «{job.title}» ({job.company.name}).{note}",
                     link=f"/vakansiyalar/{job.id}",
                     params={"university": user.staff_university.short_name, "job": job.title, "company": job.company.name})
    return {"recommended": True, "students": len(students)}
