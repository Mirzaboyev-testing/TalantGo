"""The public website (no sign-in): live vacancies, approved companies and the headline numbers.

Only what a company publishes about itself is shown: no HR names, phone, email, Telegram or STIR,
and nothing about individual students.
"""
from datetime import date

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

from ..models import Application, Challenge, Company, EmploymentOutcome, Job, Partnership, Track, University, User
from ..services.outcomes import university_stats
from .deps import Session
from .jobs import visible_jobs

router = APIRouter(prefix="/public", tags=["public"])


def public_job(job: Job) -> dict:
    return {"id": job.id, "title": job.title, "kind": job.kind, "work_mode": job.work_mode, "city": job.city,
            "is_paid": job.is_paid, "salary_from": job.salary_from, "salary_to": job.salary_to,
            "hours_per_week": job.hours_per_week, "description": job.description, "requirements": job.requirements,
            "skills": job.skills, "counts_as_practice": job.counts_as_practice, "deadline": job.deadline,
            "created_at": job.created_at, "company_id": job.company_id, "company_name": job.company.name,
            "company_industry": job.company.industry, "company_city": job.company.city}


def public_company(c: Company, open_jobs: int) -> dict:
    return {"id": c.id, "name": c.name, "industry": c.industry, "city": c.city, "size": c.size,
            "website": c.website, "description": c.description, "open_jobs": open_jobs, "verified": True}


def _open_jobs_count():
    """Live jobs of the company in the outer query (the same rule as visible_jobs; the company is approved there)."""
    return (select(func.count()).select_from(Job).where(
        Job.company_id == Company.id, Job.status == "approved",
        or_(Job.deadline.is_(None), Job.deadline >= date.today())).correlate(Company).scalar_subquery())


@router.get("/stats")
async def stats(session: Session) -> dict:
    jobs = await session.scalar(select(func.count()).select_from(visible_jobs().subquery()))
    return {
        "jobs": jobs,
        "companies": await session.scalar(select(func.count()).select_from(Company).where(Company.status == "approved")),
        "students": await session.scalar(select(func.count()).select_from(User).where(
            User.account_type == "student", User.is_blocked.is_(False), User.consent_at.isnot(None))),
        "universities": await session.scalar(select(func.count()).select_from(University).where(University.is_active.is_(True))),
    }


@router.get("/jobs")
async def jobs(session: Session, q: str | None = Query(default=None, max_length=80),
               kind: str | None = Query(default=None, max_length=16),
               work_mode: str | None = Query(default=None, max_length=16),
               city: str | None = Query(default=None, max_length=60),
               industry: str | None = Query(default=None, max_length=24),
               company_id: int | None = None, paid_only: bool = False, practice_only: bool = False,
               limit: int = Query(default=20, ge=1, le=50), offset: int = Query(default=0, ge=0, le=5000)) -> dict:
    query = visible_jobs()
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(Job.title.ilike(like) | Company.name.ilike(like) | Job.description.ilike(like))
    if kind:
        query = query.where(Job.kind == kind)
    if work_mode:
        query = query.where(Job.work_mode == work_mode)
    if city and city.strip():
        query = query.where(Job.city.ilike(f"%{city.strip()}%"))
    if industry:
        query = query.where(Company.industry == industry)
    if company_id:
        query = query.where(Job.company_id == company_id)
    if paid_only:
        query = query.where(Job.is_paid.is_(True))
    if practice_only:
        query = query.where(Job.counts_as_practice.is_(True))
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await session.execute(query.order_by(Job.created_at.desc(), Job.id.desc()).offset(offset).limit(limit))).scalars()
    return {"items": [public_job(j) for j in rows], "total": total}


@router.get("/jobs/{job_id}")
async def job(job_id: int, session: Session) -> dict:
    found = (await session.execute(visible_jobs().where(Job.id == job_id))).scalar_one_or_none()
    if found is None:
        raise HTTPException(404, "Vakansiya topilmadi yoki yopilgan")
    return public_job(found)


@router.get("/companies")
async def companies(session: Session, q: str | None = Query(default=None, max_length=80),
                    industry: str | None = Query(default=None, max_length=24),
                    limit: int = Query(default=24, ge=1, le=60), offset: int = Query(default=0, ge=0, le=5000)) -> dict:
    open_jobs = _open_jobs_count().label("open_jobs")
    query = select(Company, open_jobs).where(Company.status == "approved")
    if q and q.strip():
        query = query.where(Company.name.ilike(f"%{q.strip()}%"))
    if industry:
        query = query.where(Company.industry == industry)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await session.execute(query.order_by(open_jobs.desc(), Company.name).offset(offset).limit(limit))).all()
    return {"items": [public_company(c, n) for c, n in rows], "total": total}


MIN_APPLICATIONS = 5


async def company_activity(session, company_id: int) -> dict:
    """How the company works with students: answered applications, hires, tasks. Facts, not stars.
    The answer share needs at least MIN_APPLICATIONS applications behind it."""
    statuses = dict((await session.execute(select(Application.status, func.count()).join(Job, Job.id == Application.job_id)
                                           .where(Job.company_id == company_id).group_by(Application.status))).all())
    total = sum(n for s, n in statuses.items() if s != "withdrawn")
    answered = sum(n for s, n in statuses.items() if s in ("shortlisted", "interview", "offer", "hired", "rejected"))
    tasks = await session.scalar(select(func.count()).select_from(Challenge).where(Challenge.company_id == company_id))
    hires = await session.scalar(select(func.count()).select_from(EmploymentOutcome).where(
        EmploymentOutcome.company_id == company_id, EmploymentOutcome.source == "application"))
    return {"applications": total, "answer_rate": round(100 * answered / total) if total >= MIN_APPLICATIONS else None,
            "hires": hires, "tasks": tasks, "min_applications": MIN_APPLICATIONS}


@router.get("/companies/{company_id}")
async def company(company_id: int, session: Session) -> dict:
    found = await session.get(Company, company_id)
    if found is None or found.status != "approved":
        raise HTTPException(404, "Kompaniya topilmadi")
    rows = (await session.execute(visible_jobs().where(Job.company_id == company_id)
                                  .order_by(Job.created_at.desc()).limit(50))).scalars().all()
    return {**public_company(found, len(rows)), "jobs": [public_job(j) for j in rows],
            "activity": await company_activity(session, company_id)}


def _verified_students(university_id):
    return (select(func.count()).select_from(User).where(
        User.university_id == university_id, User.account_type == "student", User.verification == "verified",
        User.is_blocked.is_(False)))


async def university_profile(session, uni: University) -> dict:
    """Aggregates only: no student is named. Shares follow the minimum-sample rule of university_stats."""
    data = await university_stats(session, uni.id)
    enough = data["students"] >= data["min_sample"]       # below it, counts would reveal individual students
    partners = (await session.execute(select(Company.id, Company.name).join(Partnership, Partnership.company_id == Company.id)
                                      .where(Partnership.university_id == uni.id, Partnership.status == "accepted",
                                             Company.status == "approved").order_by(Company.name))).all()
    tracks = (await session.execute(select(Track.title, func.count()).join(User, User.track_id == Track.id).where(
        User.university_id == uni.id, User.account_type == "student", User.verification == "verified")
        .group_by(Track.title).order_by(func.count().desc()).limit(5))).all()
    return {"id": uni.id, "name": uni.name, "short_name": uni.short_name, "city": uni.city, "region": uni.region,
            "description": uni.description, "website": uni.website,
            "students": data["students"], "placed": data["placed"] if enough else None,
            "employed": data["employed"] if enough else None, "interned": data["interned"] if enough else None,
            "placement_rate": data["placement_rate"], "min_sample": data["min_sample"],
            "top_employers": data["top_platform_employers"][:5] if enough else [],
            "hires_on_platform": data["hires_on_platform"],
            "partners": [{"id": i, "name": n} for i, n in partners], "tracks": [{"title": t, "count": c} for t, c in tracks]}


@router.get("/universities")
async def universities(session: Session, q: str | None = Query(default=None, max_length=80),
                       limit: int = Query(default=60, ge=1, le=100), offset: int = Query(default=0, ge=0)) -> dict:
    students = _verified_students(University.id).correlate(University).scalar_subquery().label("students")
    partners = (select(func.count()).select_from(Partnership).where(
        Partnership.university_id == University.id, Partnership.status == "accepted")
        .correlate(University).scalar_subquery().label("partners"))
    query = select(University, students, partners).where(University.is_active.is_(True))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(University.name.ilike(like) | University.short_name.ilike(like))
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await session.execute(query.order_by(students.desc(), University.name).offset(offset).limit(limit))).all()
    return {"items": [{"id": u.id, "name": u.name, "short_name": u.short_name, "city": u.city, "region": u.region,
                       "students": s, "partners": p} for u, s, p in rows], "total": total}


@router.get("/universities/{university_id}")
async def university(university_id: int, session: Session) -> dict:
    uni = await session.get(University, university_id)
    if uni is None or not uni.is_active:
        raise HTTPException(404, "Universitet topilmadi")
    return await university_profile(session, uni)
