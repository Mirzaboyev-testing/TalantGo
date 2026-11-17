"""Employer (HR) side: company profile, job posts, applicants, anonymous talent search, contacts.

Students stay anonymous to an employer until they apply to its job or accept its contact request.
"""
from datetime import UTC, datetime, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import false, func, select

from ..models import (Application, ApplicationEvent, Challenge, ChallengeEntry, Company, ContactRequest, EmploymentOutcome,
                      Job, Partnership, Role, Status, Submission, SubmissionFile, Track, University, User)
from ..schemas import (ApplicantOut, ApplicationPatch, CompanyIn, CompanyOut, ContactIn, JobIn, JobOut)
from ..core import ratelimit
from ..services import applications, files, inbox, notify, partnerships
from ..core.security import create_token
from ..models import CompanyTest, TestAttempt
from ..services.career import JOB_KIND_LABEL, anonymous_card, identity, student_row
from ..services.catalog import CONSENT_VERSION
from ..services.cv import build_cv
from .deps import CurrentUser, Session
from .jobs import job_out, match_score

router = APIRouter(prefix="/employer", tags=["employer"])
CONTACTS_PER_DAY = 20          # per company: keeps students from being spammed
TASHKENT = ZoneInfo("Asia/Tashkent")


async def employer(user: CurrentUser) -> User:
    if user.account_type != "employer" or user.company is None:
        raise HTTPException(403, "Bu bo'lim ish beruvchilar uchun")
    return user


async def approved_employer(user: Annotated[User, Depends(employer)]) -> User:
    if user.company.status != "approved":
        raise HTTPException(403, "Kompaniyangiz hali tekshirilmoqda. Tasdiqlangach vakansiya joylay olasiz.")
    return user


Employer = Annotated[User, Depends(employer)]
ApprovedEmployer = Annotated[User, Depends(approved_employer)]


def _verified_count():
    return (select(func.count()).where(Submission.user_id == User.id,
                                       Submission.status.in_([Status.peer_verified, Status.mentor_verified]))
            .correlate(User).scalar_subquery())


async def _notify_admins(session: Session, text: str) -> None:
    ids = (await session.execute(select(User.telegram_id).where(
        (User.role == Role.admin) | User.is_owner, User.is_blocked.is_(False)))).scalars().all()
    notify.send(list(ids), text)


# --------------------------------------------------------------------------- company

@router.get("/company", response_model=CompanyOut)
async def my_company(user: Employer) -> Company:
    return user.company


@router.patch("/company", response_model=CompanyOut)
async def edit_company(body: CompanyIn, user: Employer, session: Session) -> Company:
    company = user.company
    if body.stir and body.stir != company.stir and await session.scalar(
            select(func.count()).select_from(Company).where(Company.stir == body.stir)):
        raise HTTPException(409, "Bu STIR boshqa kompaniyaga tegishli")
    # a new name, or a STIR that replaces an earlier one, has to be checked again; a STIR added for the
    # first time (older accounts had none) keeps the approval and is only reported to the admins
    identity_changed = body.name != company.name or bool(company.stir and body.stir != company.stir)
    first_stir = not company.stir and bool(body.stir)
    changes = body.model_dump(exclude_unset=True)
    # files must be the person's own uploads; a new registration document is checked again like a new STIR
    for key, kinds, what in (("registration_doc_id", files.DOC_TYPES, "Kompaniya hujjati"),
                             ("authority_doc_id", files.DOC_TYPES, "Vakolat xati"),
                             ("logo_file_id", files.LOGO_TYPES, "Logotip")):
        if key in changes and changes[key] != getattr(company, key):
            changes[key] = await files.company_file(session, user.id, changes[key], kinds, what)
    new_document = "registration_doc_id" in changes and changes["registration_doc_id"] not in (None, company.registration_doc_id)
    for field, value in changes.items():
        setattr(company, field, value)
    resubmitted = company.status == "rejected"          # fixing a rejected company sends it back for review
    if resubmitted or (identity_changed and company.status == "approved"):
        company.status, company.review_note = "pending", ""
        company.submitted_at = datetime.now(UTC)
    await session.commit()
    if resubmitted:
        await _notify_admins(session, f"Rad etilgan kompaniya ma'lumotlarini tuzatib qayta yubordi: {company.name} (STIR {company.stir}).")
    elif identity_changed or first_stir or new_document:
        await _notify_admins(session, f"Kompaniya ma'lumotlari o'zgardi: {company.name} (STIR {company.stir}).")
    return company


async def company_documents(session: Session, company: Company) -> list[dict]:
    """The company's own files with signed links (for its staff and for admins)."""
    ids = {"registration": company.registration_doc_id, "authority": company.authority_doc_id, "logo": company.logo_file_id}
    rows = {f.id: f for f in (await session.execute(select(SubmissionFile).where(
        SubmissionFile.id.in_([i for i in ids.values() if i])))).scalars()}
    return [{"kind": kind, **files.file_out(rows[i])} for kind, i in ids.items() if i in rows]


@router.get("/company/documents")
async def my_company_documents(user: Employer, session: Session) -> list[dict]:
    return await company_documents(session, user.company)


def _visible_students_count(*extra):
    return select(func.count()).select_from(User).where(*_visible_students(), *extra)


@router.get("/review-status")
async def review_status(user: Employer, session: Session) -> dict:
    """What a company waiting for the admin check sees: where it is in the queue, how long checks usually
    take, and real numbers about the students it will reach once approved."""
    company = user.company
    submitted = company.submitted_at or company.created_at
    position = None
    if company.status == "pending":
        position = 1 + await session.scalar(select(func.count()).select_from(Company).where(
            Company.status == "pending", Company.id != company.id,
            func.coalesce(Company.submitted_at, Company.created_at) < submitted))
    # the median time of the checks done in the last 90 days (needs at least 3 of them)
    since = datetime.now(UTC) - timedelta(days=90)
    durations = sorted((r - (s or c)).total_seconds() / 3600 for r, s, c in (await session.execute(select(
        Company.reviewed_at, Company.submitted_at, Company.created_at).where(
        Company.reviewed_at.isnot(None), Company.reviewed_at >= since))).all())
    typical = round(durations[len(durations) // 2], 1) if len(durations) >= 3 else None
    tracks = (await session.execute(select(Track.title, func.count()).join(User, User.track_id == Track.id)
                                    .where(*_visible_students()).group_by(Track.title)
                                    .order_by(func.count().desc()).limit(5))).all()
    universities = await session.scalar(select(func.count(func.distinct(User.university_id))).where(
        *_visible_students(), User.university_id.isnot(None)))
    return {
        "status": company.status, "review_note": company.review_note, "submitted_at": submitted,
        "reviewed_at": company.reviewed_at, "queue_position": position, "typical_hours": typical,
        "students": await session.scalar(_visible_students_count()),
        "open_to_work": await session.scalar(_visible_students_count(User.open_to_work.is_(True))),
        "verified": await session.scalar(_visible_students_count(User.verification == "verified")),
        "in_industry": await session.scalar(_visible_students_count(User.work_industries.contains([company.industry])))
        if company.industry else 0,
        "universities": universities,
        "companies": await session.scalar(select(func.count()).select_from(Company).where(Company.status == "approved")),
        "top_tracks": [{"title": t.split(":")[0], "students": n} for t, n in tracks],
        "documents": await company_documents(session, company),
    }


@router.get("/counters")
async def counters(user: ApprovedEmployer, session: Session) -> dict:
    """Numbers for the sidebar badges and the dashboard's "needs attention" list."""
    cid = user.company_id
    new_apps = await session.scalar(select(func.count()).select_from(Application).join(Job).where(
        Job.company_id == cid, Application.status == "new"))
    to_grade = await session.scalar(select(func.count()).select_from(TestAttempt).join(
        CompanyTest, CompanyTest.id == TestAttempt.test_id).where(CompanyTest.company_id == cid,
                                                                   TestAttempt.status == "submitted"))
    to_review = await session.scalar(select(func.count()).select_from(ChallengeEntry).join(
        Challenge, Challenge.id == ChallengeEntry.challenge_id).where(Challenge.company_id == cid,
                                                                       ChallengeEntry.status == "submitted"))
    outcomes = await session.scalar(select(func.count()).select_from(EmploymentOutcome).where(
        EmploymentOutcome.company_id == cid, EmploymentOutcome.source == "self",
        EmploymentOutcome.confirmed_by != "company"))
    partnerships_in = await session.scalar(select(func.count()).select_from(Partnership).where(
        Partnership.company_id == cid, Partnership.status == "pending", Partnership.initiated_by == "university"))
    rejected_jobs = await session.scalar(select(func.count()).select_from(Job).where(
        Job.company_id == cid, Job.status == "rejected"))
    since = datetime.now(UTC) - timedelta(days=7)
    contacts_accepted = await session.scalar(select(func.count()).select_from(ContactRequest).where(
        ContactRequest.company_id == cid, ContactRequest.status == "accepted", ContactRequest.created_at >= since))
    return {"new_applications": new_apps, "to_grade": to_grade, "to_review": to_review, "outcomes": outcomes,
            "partnerships_in": partnerships_in, "rejected_jobs": rejected_jobs, "contacts_accepted": contacts_accepted}


# --------------------------------------------------------------------------- jobs

@router.get("/jobs", response_model=list[JobOut])
async def my_jobs(user: Employer, session: Session) -> list[JobOut]:
    counts = (select(func.count()).where(Application.job_id == Job.id).correlate(Job).scalar_subquery())
    rows = (await session.execute(select(Job, counts).where(Job.company_id == user.company_id)
                                  .order_by(Job.created_at.desc()))).all()
    return [job_out(j, applications=n) for j, n in rows]


@router.post("/jobs", response_model=JobOut, status_code=201)
async def create_job(body: JobIn, user: ApprovedEmployer, session: Session) -> JobOut:
    ratelimit.limit(f"job-create:{user.company_id}", 20, 24 * 3600,
                    "Bir kunda 20 tadan ortiq vakansiya yaratib bo'lmaydi")
    job = Job(**body.model_dump(), company_id=user.company_id, created_by_id=user.id)
    session.add(job)
    await session.commit()
    await session.refresh(job)
    await _notify_admins(session, f"Yangi vakansiya tekshiruvni kutmoqda: {user.company.name}, «{job.title}».")
    return job_out(job)


async def _own_job(session: Session, user: User, job_id: int) -> Job:
    job = await session.get(Job, job_id)
    if job is None or job.company_id != user.company_id:
        raise HTTPException(404, "Vakansiya topilmadi")
    return job


@router.put("/jobs/{job_id}", response_model=JobOut)
async def edit_job(job_id: int, body: JobIn, user: ApprovedEmployer, session: Session) -> JobOut:
    job = await _own_job(session, user, job_id)
    if job.status == "closed":
        raise HTTPException(409, "Yopilgan vakansiyani tahrirlab bo'lmaydi")
    for field, value in body.model_dump().items():
        setattr(job, field, value)
    job.status, job.review_note = "pending", ""        # every edit is checked again before students see it
    await session.commit()
    return job_out(job)


@router.post("/jobs/{job_id}/close", response_model=JobOut)
async def close_job(job_id: int, user: Employer, session: Session) -> JobOut:
    job = await _own_job(session, user, job_id)
    job.status = "closed"
    await session.commit()
    return job_out(job)


def applicant_out(app: Application, verified_tasks: int) -> ApplicantOut:
    # the student chose to apply: identity is shared; withdrawing takes the contact details back
    who = identity(app.user)
    if app.status == "withdrawn":
        who = {**who, "username": None, "phone": None, "cv_url": None, "github_url": "", "linkedin_url": ""}
    return ApplicantOut(id=app.id, status=app.status, note=app.note, employer_note=app.employer_note,
                        created_at=app.created_at, updated_at=app.updated_at, interview_at=app.interview_at,
                        interview_place=app.interview_place, card=anonymous_card(app.user, verified_tasks),
                        identity=who)


@router.get("/jobs/{job_id}/applicants", response_model=list[ApplicantOut])
async def applicants(job_id: int, user: ApprovedEmployer, session: Session) -> list[ApplicantOut]:
    await _own_job(session, user, job_id)
    verified = _verified_count().label("verified")
    rows = (await session.execute(select(Application, verified).join(User, User.id == Application.user_id)
                                  .where(Application.job_id == job_id)
                                  .order_by(Application.created_at.desc()))).all()
    await applications.mark_viewed(session, [app for app, _ in rows], user)
    return [applicant_out(app, n) for app, n in rows]


@router.patch("/applications/{application_id}", response_model=ApplicantOut)
async def update_application(application_id: int, body: ApplicationPatch, user: ApprovedEmployer, session: Session) -> ApplicantOut:
    # locked: two HR users (or a student withdrawing) cannot both move it from the same old state
    app = (await session.execute(select(Application).where(Application.id == application_id)
                                 .with_for_update(of=Application))).scalar_one_or_none()
    if app is None or app.job.company_id != user.company_id:
        raise HTTPException(404, "Ariza topilmadi")
    if body.employer_note is not None:
        app.employer_note = body.employer_note
    await applications.employer_move(session, app, user, body.status, body.interview_at, body.interview_place)
    await session.refresh(app)
    n = await session.scalar(select(func.count()).where(Submission.user_id == app.user_id,
                                                        Submission.status.in_([Status.peer_verified, Status.mentor_verified])))
    return applicant_out(app, n)


# --------------------------------------------------------------------------- talent search

@router.get("/talent")
async def talent(user: ApprovedEmployer, session: Session,
                 university_id: int | None = None, track_id: int | None = None,
                 course: int | None = Query(default=None, ge=1, le=7),
                 skill: str | None = Query(default=None, max_length=40),
                 job_type: str | None = None, city: str | None = Query(default=None, max_length=60),
                 verified_only: bool = False, min_points: int = Query(default=0, ge=0)) -> list[dict]:
    """Anonymous cards of students who said they are open to work."""
    verified = _verified_count().label("verified")
    query = select(User, verified).where(*_visible_students(), User.open_to_work.is_(True),
                                         User.verification != "rejected", User.points >= min_points)
    if university_id:
        query = query.where(User.university_id == university_id)
    if track_id:
        query = query.where(User.track_id == track_id)
    if course:
        query = query.where(User.course == course)
    if skill:
        query = query.where(User.skills.contains([skill.strip()]))
    if job_type:
        query = query.where(User.job_types.contains([job_type]))
    if city:
        query = query.where(User.city.ilike(city.strip()))
    if verified_only:
        query = query.where(User.verification == "verified")
    rows = (await session.execute(query.order_by((User.verification == "verified").desc(), User.points.desc())
                                  .limit(60))).all()
    contacted = dict((await session.execute(select(ContactRequest.student_id, ContactRequest.status)
                                            .where(ContactRequest.company_id == user.company_id))).all())
    return [{**anonymous_card(u, n), "contact_status": contacted.get(u.id)} for u, n in rows]


@router.post("/talent/{student_id}/contact", status_code=201)
async def contact(student_id: int, body: ContactIn, user: ApprovedEmployer, session: Session) -> dict:
    student = await _visible_student(session, student_id)
    if await session.scalar(select(ContactRequest.id).where(ContactRequest.company_id == user.company_id,
                                                            ContactRequest.student_id == student_id)):
        raise HTTPException(409, "Bu talabaga allaqachon so'rov yuborgansiz")
    since = datetime.now(UTC) - timedelta(days=1)
    sent_today = await session.scalar(select(func.count()).select_from(ContactRequest).where(
        ContactRequest.company_id == user.company_id, ContactRequest.created_at >= since))
    if sent_today >= CONTACTS_PER_DAY:
        raise HTTPException(429, f"Bir kunda {CONTACTS_PER_DAY} tadan ortiq so'rov yuborib bo'lmaydi")
    if body.job_id and not await session.scalar(select(Job.id).where(Job.id == body.job_id, Job.company_id == user.company_id)):
        raise HTTPException(404, "Vakansiya topilmadi")
    session.add(ContactRequest(company_id=user.company_id, employer_id=user.id, student_id=student_id,
                               job_id=body.job_id, message=body.message.strip()))
    await session.commit()
    await inbox.push(session, [student.id], "contact_request",
                     f"{user.company.name} siz bilan bog'lanmoqchi: {body.message.strip()}\n\n"
                     "Rozilik bersangiz, telefoningiz va kontaktlaringiz ularga ochiladi.",
                     link="/talaba/arizalar", params={"company": user.company.name})
    return {"status": "pending"}


@router.get("/contacts")
async def contacts(user: ApprovedEmployer, session: Session) -> list[dict]:
    verified = _verified_count().label("verified")
    rows = (await session.execute(select(ContactRequest, verified).join(User, User.id == ContactRequest.student_id)
                                  .where(ContactRequest.company_id == user.company_id)
                                  .order_by(ContactRequest.created_at.desc()))).all()
    return [{"id": c.id, "status": c.status, "message": c.message, "created_at": c.created_at,
             "job_title": c.job.title if c.job else None, "card": anonymous_card(c.student, n),
             "identity": identity(c.student) if c.status == "accepted" else None} for c, n in rows]


@router.get("/stats")
async def employer_stats(user: Employer, session: Session) -> dict:
    jobs = (await session.execute(select(Job.status, func.count()).where(Job.company_id == user.company_id)
                                  .group_by(Job.status))).all()
    apps = (await session.execute(select(Application.status, func.count()).join(Job)
                                  .where(Job.company_id == user.company_id).group_by(Application.status))).all()
    return {"jobs": dict(jobs), "applications": dict(apps), "kinds": JOB_KIND_LABEL}


# --------------------------------------------------------------------------- students (named, by rating)

def _visible_students():
    """Students who gave the current consent (v2: approved employers see name, study details, results
    and CV) and did not hide themselves from companies. Blocked accounts and mentors are left out."""
    return (User.account_type == "student", User.role == Role.student, User.is_blocked.is_(False),
            User.consent_version >= CONSENT_VERSION, User.visible_to_employers.is_(True))


async def _test_results(session: Session, company_id: int, user_ids: list[int]) -> dict[int, dict]:
    """The company's own test results per student: tests taken and the share of points earned."""
    if not user_ids:
        return {}
    query = (select(TestAttempt.user_id, func.count(), func.sum(TestAttempt.score), func.sum(TestAttempt.max_score))
             .join(CompanyTest, CompanyTest.id == TestAttempt.test_id)
             .where(CompanyTest.company_id == company_id, TestAttempt.status != "in_progress",
                    TestAttempt.user_id.in_(user_ids))
             .group_by(TestAttempt.user_id))
    out = {}
    for uid, n, score, max_score in (await session.execute(query)).all():
        out[uid] = {"tests_taken": n, "test_percent": round(100 * (score or 0) / max_score) if max_score else None}
    return out


@router.get("/students")
async def students(user: ApprovedEmployer, session: Session,
                   q: str | None = Query(default=None, max_length=80),
                   university_id: int | None = None, track_id: int | None = None,
                   course: int | None = Query(default=None, ge=1, le=7),
                   industry: str | None = Query(default=None, max_length=24),
                   job_type: str | None = Query(default=None, max_length=16),
                   skill: str | None = Query(default=None, max_length=40),
                   verified_only: bool = False, open_only: bool = False,
                   sort: str = Query(default="rating", pattern="^(rating|tests|new)$")) -> list[dict]:
    """All students with their name and study details, best first. The rank is by points (verified work)."""
    verified = _verified_count().label("verified")
    query = select(User, verified).where(*_visible_students())
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(User.full_name.ilike(like) | User.group_name.ilike(like) | User.faculty.ilike(like))
    if university_id:
        query = query.where(User.university_id == university_id)
    if track_id:
        query = query.where(User.track_id == track_id)
    if course:
        query = query.where(User.course == course)
    if industry:
        query = query.where(User.work_industries.contains([industry]))
    if job_type:
        query = query.where(User.job_types.contains([job_type]))
    if skill and skill.strip():
        query = query.where(User.skills.contains([skill.strip()]))
    if verified_only:
        query = query.where(User.verification == "verified")
    if open_only:
        query = query.where(User.open_to_work.is_(True))
    order = (User.created_at.desc(),) if sort == "new" else (User.points.desc(), User.id)
    rows = (await session.execute(query.order_by(*order).limit(300))).all()
    tests = await _test_results(session, user.company_id, [u.id for u, _ in rows])
    # the overall rank among all visible students, by points (equal points share a rank)
    all_points = (await session.execute(select(User.points).where(*_visible_students())
                                        .order_by(User.points.desc()))).scalars().all()
    ranks: dict[int, int] = {}
    for position, pts in enumerate(all_points, start=1):
        ranks.setdefault(pts, position)
    out = [{**student_row(u, n), "rank": ranks.get(u.points, len(all_points)),
            "tests_taken": tests.get(u.id, {}).get("tests_taken", 0),
            "test_percent": tests.get(u.id, {}).get("test_percent")} for u, n in rows]
    if sort == "tests":
        out.sort(key=lambda r: (r["test_percent"] is None, -(r["test_percent"] or 0), r["rank"]))
    return out


async def _visible_student(session: Session, student_id: int, company_id: int | None = None) -> User:
    """A student in the named list, or (for this company) one who applied to its job or took its test."""
    visible = await session.scalar(select(User.id).where(User.id == student_id, *_visible_students()))
    if not visible and company_id:
        visible = (await session.scalar(select(Application.id).join(Job).where(
            Application.user_id == student_id, Job.company_id == company_id,
            Application.status != "withdrawn").limit(1))) or \
            (await session.scalar(select(TestAttempt.id).join(CompanyTest, CompanyTest.id == TestAttempt.test_id).where(
                TestAttempt.user_id == student_id, CompanyTest.company_id == company_id).limit(1)))
    if not visible:
        raise HTTPException(404, "Talaba topilmadi")
    return await session.get(User, student_id)


@router.get("/students/{student_id}")
async def student_detail(student_id: int, user: ApprovedEmployer, session: Session) -> dict:
    """The full profile with the verified-work CV, this company's test results, and whether contact
    details are shared (the student applied to one of the company's jobs or accepted its request)."""
    student = await _visible_student(session, student_id, user.company_id)
    n = await session.scalar(select(func.count()).where(Submission.user_id == student.id,
                                                        Submission.status.in_([Status.peer_verified, Status.mentor_verified])))
    applied = await session.scalar(select(func.count()).select_from(Application).join(Job).where(
        Application.user_id == student.id, Job.company_id == user.company_id, Application.status != "withdrawn"))
    contact = await session.scalar(select(ContactRequest.status).where(
        ContactRequest.company_id == user.company_id, ContactRequest.student_id == student.id))
    attempts = (await session.execute(select(TestAttempt).join(CompanyTest, CompanyTest.id == TestAttempt.test_id).where(
        CompanyTest.company_id == user.company_id, TestAttempt.user_id == student.id,
        TestAttempt.status != "in_progress").order_by(TestAttempt.submitted_at.desc()))).scalars().all()
    shared = bool(applied) or contact == "accepted"
    return {
        **student_row(student, n),
        "cv": await build_cv(session, student),
        "phone": student.phone if shared and student.phone else None,
        "username": student.username if shared else None,
        "contact_status": contact,
        "applied": bool(applied),
        "tests": [{"attempt_id": a.id, "test_id": a.test_id, "title": a.test.title, "status": a.status,
                   "score": a.score, "max_score": a.max_score, "submitted_at": a.submitted_at} for a in attempts],
    }


CV_LINK_HOURS = 2


def cv_pdf_link(student_id: int) -> str:
    """A short-lived signed link: it works when opened in an outside browser, where there is no app session."""
    return f"/api/v1/cv-pdf/{student_id}?t={create_token(str(student_id), 'cvpdf', CV_LINK_HOURS)}"


@router.get("/students/{student_id}/cv-link")
async def student_cv_link(student_id: int, user: ApprovedEmployer, session: Session) -> dict:
    await _visible_student(session, student_id, user.company_id)
    return {"url": cv_pdf_link(student_id)}


# --------------------------------------------------------------------------- dashboard and candidates

@router.get("/dashboard")
async def dashboard(user: ApprovedEmployer, session: Session, days: int = Query(default=30, ge=1, le=365)) -> dict:
    """Pipeline numbers for the company. `pipeline` counts applications by their current stage;
    `received` and `hired` count what happened inside the chosen period."""
    since = datetime.now(UTC) - timedelta(days=days)
    company_apps = select(Application.id).join(Job).where(Job.company_id == user.company_id)
    jobs_by_status = dict((await session.execute(select(Job.status, func.count()).where(Job.company_id == user.company_id)
                                                 .group_by(Job.status))).all())
    pipeline = dict((await session.execute(select(Application.status, func.count()).join(Job)
                                           .where(Job.company_id == user.company_id).group_by(Application.status))).all())
    received = await session.scalar(select(func.count()).select_from(Application).join(Job).where(
        Job.company_id == user.company_id, Application.created_at >= since))
    hired = await session.scalar(select(func.count(func.distinct(ApplicationEvent.application_id))).where(
        ApplicationEvent.application_id.in_(company_apps), ApplicationEvent.to_status == "hired",
        ApplicationEvent.created_at >= since))
    now = datetime.now(UTC)
    upcoming = (await session.execute(select(Application).join(Job).where(
        Job.company_id == user.company_id, Application.status == "interview",
        Application.interview_at >= now).order_by(Application.interview_at).limit(5))).scalars().all()
    recent = (await session.execute(select(Application).join(Job).where(Job.company_id == user.company_id)
                                    .order_by(Application.created_at.desc()).limit(6))).scalars().all()
    # the same numbers for the period before, to show the change
    before = since - timedelta(days=days)
    prev_received = await session.scalar(select(func.count()).select_from(Application).join(Job).where(
        Job.company_id == user.company_id, Application.created_at >= before, Application.created_at < since))
    prev_hired = await session.scalar(select(func.count(func.distinct(ApplicationEvent.application_id))).where(
        ApplicationEvent.application_id.in_(company_apps), ApplicationEvent.to_status == "hired",
        ApplicationEvent.created_at >= before, ApplicationEvent.created_at < since))
    return {
        **await _dashboard_extras(session, user.company, since, days),
        "previous": {"received": prev_received, "hired": prev_hired},
        "days": days,
        "jobs": {s: jobs_by_status.get(s, 0) for s in ("approved", "pending", "rejected", "closed")},
        "pipeline": {s: pipeline.get(s, 0) for s in ("new", "viewed", "shortlisted", "interview", "offer", "hired",
                                                     "rejected", "withdrawn")},
        "applications_total": sum(pipeline.values()),
        "received": received,
        "hired": hired,
        "interviews": [{"application_id": a.id, "student": a.user.full_name, "job": a.job.title,
                        "at": a.interview_at, "place": a.interview_place} for a in upcoming],
        "recent": [{"application_id": a.id, "student": a.user.full_name, "job": a.job.title, "status": a.status,
                    "created_at": a.created_at} for a in recent],
    }


def company_profile_check(company: Company) -> dict:
    """What a student sees on the company page and what makes it trusted: filled in or not."""
    checks = {"logo": bool(company.logo_file_id), "about": len(company.description.strip()) >= 120,
              "website": bool(company.website), "contacts": bool(company.telegram or company.email),
              "address": bool(company.address), "cooperation": bool(company.cooperation),
              "tracks": bool(company.wanted_track_ids), "document": bool(company.registration_doc_id)}
    return {"percent": round(100 * sum(checks.values()) / len(checks)), "missing": [k for k, ok in checks.items() if not ok]}


async def _dashboard_extras(session: Session, company: Company, since: datetime, days: int) -> dict:
    cid = company.id
    # applications per day (per week for a year) in Tashkent time, with empty days filled in
    local_day = func.date(func.timezone("Asia/Tashkent", Application.created_at))
    per_day = dict((await session.execute(select(local_day, func.count()).join(Job).where(
        Job.company_id == cid, Application.created_at >= since).group_by(local_day))).all())
    today = datetime.now(TASHKENT).date()
    step = 7 if days > 90 else 1
    buckets = []
    for i in range(days // step - 1, -1, -1):
        end = today - timedelta(days=i * step)
        start = end - timedelta(days=step - 1)
        n = sum(v for d, v in per_day.items() if start <= d <= end)
        buckets.append({"date": start.isoformat(), "applications": n})
    counts = (select(func.count()).where(Application.job_id == Job.id).correlate(Job).scalar_subquery())
    hired = (select(func.count()).where(Application.job_id == Job.id, Application.status == "hired")
             .correlate(Job).scalar_subquery())
    top = (await session.execute(select(Job, counts.label("n"), hired.label("h")).where(Job.company_id == cid)
                                 .order_by(counts.desc(), Job.created_at.desc()).limit(5))).all()
    unis = (await session.execute(select(University.short_name, func.count()).select_from(Application)
                                  .join(Job, Job.id == Application.job_id).join(User, User.id == Application.user_id)
                                  .join(University, University.id == User.university_id)
                                  .where(Job.company_id == cid).group_by(University.short_name)
                                  .order_by(func.count().desc()).limit(5))).all()
    views = await session.scalar(select(func.coalesce(func.sum(Job.views), 0)).where(Job.company_id == cid))
    tasks = await session.scalar(select(func.count()).select_from(Challenge).where(Challenge.company_id == cid))
    tests = await session.scalar(select(func.count()).select_from(CompanyTest).where(CompanyTest.company_id == cid))
    partners = await session.scalar(select(func.count()).select_from(Partnership).where(
        Partnership.company_id == cid, Partnership.status != "rejected"))
    jobs_total = await session.scalar(select(func.count()).select_from(Job).where(Job.company_id == cid))
    profile = company_profile_check(company)
    return {
        "trend": buckets, "trend_step": step, "views": views,
        "top_jobs": [{"id": j.id, "title": j.title, "status": j.status, "kind": j.kind, "views": j.views,
                      "applications": n, "hired": h} for j, n, h in top],
        "universities": [{"name": name, "applications": n} for name, n in unis],
        "profile": profile,
        "first_steps": {"profile": profile["percent"] >= 75, "job": jobs_total > 0, "task": tasks > 0,
                        "test": tests > 0, "partnership": partners > 0},
    }


@router.get("/applications")
async def all_applications(user: ApprovedEmployer, session: Session, job_id: int | None = None,
                           status: str | None = Query(default=None, max_length=16),
                           q: str | None = Query(default=None, max_length=80),
                           limit: int = Query(default=25, ge=1, le=200), offset: int = Query(default=0, ge=0)) -> dict:
    """Every application to the company's jobs in one table (the "Nomzodlar" page), newest first."""
    verified = _verified_count().label("verified")
    query = (select(Application, verified).join(Job, Job.id == Application.job_id)
             .join(User, User.id == Application.user_id).where(Job.company_id == user.company_id))
    if job_id:
        query = query.where(Application.job_id == job_id)
    if status:
        query = query.where(Application.status == status)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(User.full_name.ilike(like) | Job.title.ilike(like))
    total = await session.scalar(select(func.count()).select_from(query.with_only_columns(Application.id).subquery()))
    rows = (await session.execute(query.order_by(Application.created_at.desc(), Application.id.desc())
                                  .offset(offset).limit(limit))).all()
    jobs = (await session.execute(select(Job.id, Job.title).where(Job.company_id == user.company_id)
                                  .order_by(Job.created_at.desc()))).all()
    stage_query = select(Application.status, func.count()).join(Job, Job.id == Application.job_id).where(
        Job.company_id == user.company_id)
    if job_id:
        stage_query = stage_query.where(Application.job_id == job_id)
    stages = dict((await session.execute(stage_query.group_by(Application.status))).all())
    return {
        "items": [{**applicant_out(a, n).model_dump(), "job_id": a.job_id, "job_title": a.job.title,
                   "match": match_score(a.job, a.user)} for a, n in rows],
        "total": total,
        "stages": stages,
        "jobs": [{"id": i, "title": t} for i, t in jobs],
    }



# --------------------------------------------------------------------------- universities and partnerships

@router.get("/universities")
async def universities_for_company(user: ApprovedEmployer, session: Session,
                                   q: str | None = Query(default=None, max_length=80)) -> list[dict]:
    """Universities with their verified students and this company's partnership state."""
    students = (select(func.count()).select_from(User).where(
        User.university_id == University.id, User.account_type == "student", User.verification == "verified",
        User.is_blocked.is_(False)).correlate(University).scalar_subquery().label("students"))
    query = select(University, students).where(University.is_active.is_(True))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(University.name.ilike(like) | University.short_name.ilike(like))
    mine = {p.university_id: p for p in (await session.execute(select(Partnership).where(
        Partnership.company_id == user.company_id))).scalars()}
    # ~200 universities since 2026-11-17: the company's own partners always come first, then by verified students
    partner_first = University.id.in_(list(mine)) if mine else false()
    rows = (await session.execute(query.order_by(partner_first.desc(), students.desc(), University.name).limit(100))).all()
    return [{"id": u.id, "name": u.name, "short_name": u.short_name, "city": u.city, "students": n,
             "partnership": partnerships.out(mine[u.id]) if u.id in mine else None} for u, n in rows]


@router.get("/universities/{university_id}")
async def university_for_company(university_id: int, user: ApprovedEmployer, session: Session) -> dict:
    from .public import university_profile
    uni = await session.get(University, university_id)
    if uni is None or not uni.is_active:
        raise HTTPException(404, "Universitet topilmadi")
    p = (await session.execute(select(Partnership).where(Partnership.company_id == user.company_id,
                                                         Partnership.university_id == university_id))).scalar_one_or_none()
    return {**await university_profile(session, uni), "partnership": partnerships.out(p) if p else None}


class PartnershipIn(BaseModel):
    message: str = Field(default="", max_length=1000)


@router.post("/universities/{university_id}/partnership", status_code=201)
async def ask_partnership(university_id: int, body: PartnershipIn, user: ApprovedEmployer, session: Session) -> dict:
    uni = await session.get(University, university_id)
    if uni is None or not uni.is_active:
        raise HTTPException(404, "Universitet topilmadi")
    ratelimit.limit(f"partner-ask:c{user.company_id}", 20, 24 * 3600, "Bir kunda 20 tadan ortiq taklif yuborib bo'lmaydi")
    p = await partnerships.open_request(session, user.company, uni, "company", body.message)
    staff = (await session.execute(select(User.id).where(User.staff_university_id == uni.id,
                                                         User.staff_status == "approved"))).scalars().all()
    await inbox.push(session, staff, "partnership_request", f"{user.company.name} hamkorlik taklif qildi.",
                     link="/universitet/hamkorlar", params={"company": user.company.name})
    return partnerships.out(p)


class PartnershipDecisionIn(BaseModel):
    accept: bool


@router.post("/partnerships/{partnership_id}/decide")
async def decide_partnership(partnership_id: int, body: PartnershipDecisionIn, user: ApprovedEmployer, session: Session) -> dict:
    p = await session.get(Partnership, partnership_id)
    if p is None or p.company_id != user.company_id:
        raise HTTPException(404, "So'rov topilmadi")
    await partnerships.decide(session, p, "company", body.accept)
    staff = (await session.execute(select(User.id).where(User.staff_university_id == p.university_id,
                                                         User.staff_status == "approved"))).scalars().all()
    verdict = "qabul qildi" if body.accept else "rad etdi"
    await inbox.push(session, staff, "partnership_decision", f"{user.company.name} hamkorlik taklifingizni {verdict}.",
                     link="/universitet/hamkorlar", params={"approved": body.accept, "company": user.company.name})
    return partnerships.out(p)



# --------------------------------------------------------------------------- confirming where students work

@router.get("/outcomes")
async def outcome_requests(user: ApprovedEmployer, session: Session) -> list[dict]:
    """Students who said they work or intern at this company and wait for its confirmation."""
    rows = (await session.execute(select(EmploymentOutcome).where(
        EmploymentOutcome.company_id == user.company_id, EmploymentOutcome.source == "self",
        EmploymentOutcome.confirmed_by != "company").order_by(EmploymentOutcome.created_at.desc()).limit(200))).scalars().all()
    return [{"id": o.id, "student": o.student.full_name,
             "university": o.student.university_ref.short_name if o.student.university_ref else None,
             "position": o.position, "kind": o.kind, "started_on": o.started_on, "created_at": o.created_at} for o in rows]


class OutcomeDecisionIn(BaseModel):
    confirm: bool


@router.post("/outcomes/{outcome_id}")
async def decide_outcome_request(outcome_id: int, body: OutcomeDecisionIn, user: ApprovedEmployer, session: Session) -> dict:
    """Confirming counts the student as placed for their university; declining removes the claim."""
    o = await session.get(EmploymentOutcome, outcome_id)
    if o is None or o.company_id != user.company_id or o.source != "self":
        raise HTTPException(404, "So'rov topilmadi")
    student_id, company = o.student_id, o.company_name
    if body.confirm:
        o.confirmed, o.confirmed_by = True, "company"
    else:
        await session.delete(o)
    await session.commit()
    await inbox.push(session, [student_id], "outcome_company_review",
                     f"{company} sizning ish joyingizni tasdiqladi." if body.confirm
                     else f"{company} ish joyingiz haqidagi yozuvni tasdiqlamadi.",
                     link="/talaba/universitetim", params={"approved": body.confirm, "company": company})
    return {"confirmed": body.confirm}
