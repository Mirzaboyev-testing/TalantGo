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
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..core import ratelimit
from ..models import (Application, AuditLog, Company, ContactRequest, EmploymentOutcome, Job, JobRecommendation,
                      Partnership, Status, Submission, University, User)
from ..schemas import ReviewDecisionIn, Url
from ..services import inbox, outcomes, partnerships
from ..services.applications import company_staff_ids
from ..services.career import decide_verification
from .deps import CurrentUser, Session
from .jobs import job_out, visible_jobs

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
        "hired": hired_students,
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
    session.add(AuditLog(actor=f"{user.full_name} ({user.staff_university.short_name})"[:160],
                         action="student.verify" if body.approve else "student.reject", target=student.full_name[:200]))
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


# --------------------------------------------------------------------------- profile, outcomes, partners, opportunities

class ProfileIn(BaseModel):
    description: str | None = Field(default=None, max_length=3000)
    website: Url | None = None
    city: str | None = Field(default=None, max_length=60)
    region: str | None = Field(default=None, max_length=60)


def _profile(u: University) -> dict:
    return {"id": u.id, "name": u.name, "short_name": u.short_name, "city": u.city, "region": u.region,
            "description": u.description, "website": u.website}


@router.get("/profile")
async def profile(user: Staff) -> dict:
    return _profile(user.staff_university)


@router.patch("/profile")
async def edit_profile(body: ProfileIn, user: Staff, session: Session) -> dict:
    if body.website and len(body.website) > 256:
        raise HTTPException(422, "Veb-sayt manzili juda uzun")
    uni = await session.get(University, user.staff_university_id)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(uni, field, value.strip())
    await session.commit()
    return _profile(uni)


@router.get("/stats")
async def stats(user: Staff, session: Session, cohort: int | None = Query(default=None, ge=2000, le=2100),
                faculty: str | None = Query(default=None, max_length=120)) -> dict:
    faculties = (await session.execute(select(User.faculty, func.count()).where(
        User.university_id == user.staff_university_id, User.account_type == "student",
        User.verification == "verified", User.faculty != "").group_by(User.faculty).order_by(func.count().desc()))).all()
    data = await outcomes.university_stats(session, user.staff_university_id, cohort, faculty)
    return {**data, "faculties": [f for f, _ in faculties]}


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
    if o.source == "application":
        raise HTTPException(409, "Platformadagi ishga olish allaqachon tasdiqlangan")
    student_id, company = o.student_id, o.company_name
    session.add(AuditLog(actor=f"{user.full_name} ({user.staff_university.short_name})"[:160], action="outcome.confirm"
                         if body.confirm else "outcome.remove", target=f"{o.student.full_name}: {company}"[:200]))
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


@router.get("/partners")
async def partners(user: Staff, session: Session) -> list[dict]:
    rows = (await session.execute(select(Partnership).where(Partnership.university_id == user.staff_university_id)
                                  .order_by((Partnership.status == "pending").desc(), Partnership.created_at.desc()))).scalars()
    return [partnerships.out(p) for p in rows]


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
    students = (await session.execute(select(User.id).where(
        User.university_id == uni, User.account_type == "student", User.verification == "verified",
        User.is_blocked.is_(False)))).scalars().all()
    note = f" {body.note.strip()}" if body.note.strip() else ""
    await inbox.push(session, students, "job_recommended",
                     f"{user.staff_university.short_name} karyera markazi tavsiya qiladi: «{job.title}» ({job.company.name}).{note}",
                     link=f"/vakansiyalar/{job.id}",
                     params={"university": user.staff_university.short_name, "job": job.title, "company": job.company.name})
    return {"recommended": True, "students": len(students)}
