"""Student side of the early-career job board: browse, apply, answer employers' contact requests."""
from datetime import UTC, date, datetime

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_, select

from ..models import Application, ApplicationEvent, Company, ContactRequest, Job, User
from ..schemas import ApplyIn, ContactAnswerIn, JobOut, MyApplicationOut
from ..services import applications, inbox
from ..services.applications import company_staff_ids
from ..services.career import JOB_KIND_LABEL
from .deps import CurrentUser, Session

router = APIRouter(tags=["jobs"])


def job_out(job: Job, **extra) -> JobOut:
    return JobOut.model_validate(job).model_copy(update={
        "company_name": job.company.name, "company_industry": job.company.industry, **extra})


def match_score(job: Job, user: User) -> int:
    """0-100: shared skills plus being on a track the job asks for."""
    skills = {s.lower() for s in user.skills}
    wanted = {s.lower() for s in job.skills}
    skill_part = len(skills & wanted) / len(wanted) if wanted else 0.5
    track_part = 1.0 if user.track_id in job.track_ids else (0.5 if not job.track_ids else 0.0)
    return round(100 * (0.7 * skill_part + 0.3 * track_part))


def visible_jobs():
    """Approved jobs of approved companies whose deadline has not passed."""
    return (select(Job).join(Company)
            .where(Job.status == "approved", Company.status == "approved",
                   or_(Job.deadline.is_(None), Job.deadline >= date.today())))


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(user: CurrentUser, session: Session,
                    kind: str | None = None, work_mode: str | None = None,
                    city: str | None = Query(default=None, max_length=60),
                    paid_only: bool = False, practice_only: bool = False,
                    q: str | None = Query(default=None, max_length=80)) -> list[JobOut]:
    query = visible_jobs()
    if kind:
        query = query.where(Job.kind == kind)
    if work_mode:
        query = query.where(Job.work_mode == work_mode)
    if city:
        query = query.where(Job.city.ilike(city.strip()))
    if paid_only:
        query = query.where(Job.is_paid.is_(True))
    if practice_only:
        query = query.where(Job.counts_as_practice.is_(True))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(Job.title.ilike(like) | Company.name.ilike(like) | Job.description.ilike(like))
    jobs = (await session.execute(query.order_by(Job.created_at.desc()).limit(200))).scalars().all()
    mine = dict((await session.execute(select(Application.job_id, Application.status)
                                       .where(Application.user_id == user.id))).all())
    out = [job_out(j, applied=j.id in mine, application_status=mine.get(j.id), match=match_score(j, user)) for j in jobs]
    return sorted(out, key=lambda j: (-j.match, -j.created_at.timestamp()))


@router.get("/jobs/{job_id}", response_model=JobOut)
async def job_detail(job_id: int, user: CurrentUser, session: Session) -> JobOut:
    job = (await session.execute(visible_jobs().where(Job.id == job_id))).scalar_one_or_none()
    if job is None:
        raise HTTPException(404, "Vakansiya topilmadi yoki yopilgan")
    job.views += 1
    await session.commit()
    app = (await session.execute(select(Application).where(Application.job_id == job_id,
                                                           Application.user_id == user.id))).scalar_one_or_none()
    return job_out(job, applied=app is not None, application_status=app.status if app else None,
                   match=match_score(job, user))


async def my_applications_out(session: Session, apps: list[Application]) -> list[MyApplicationOut]:
    """The student's view, with each application's status history (one query for all of them)."""
    history: dict[int, list[dict]] = {a.id: [] for a in apps}
    if apps:
        for app_id, st, at in (await session.execute(
                select(ApplicationEvent.application_id, ApplicationEvent.to_status, ApplicationEvent.created_at)
                .where(ApplicationEvent.application_id.in_(list(history))).order_by(ApplicationEvent.id))).all():
            history[app_id].append({"status": st, "at": at})
    return [MyApplicationOut(id=a.id, status=a.status, note=a.note, created_at=a.created_at,
                             updated_at=a.updated_at, interview_at=a.interview_at, interview_place=a.interview_place,
                             history=history[a.id], job=job_out(a.job, applied=True, application_status=a.status))
            for a in apps]


@router.post("/jobs/{job_id}/apply", response_model=MyApplicationOut, status_code=201)
async def apply(job_id: int, body: ApplyIn, user: CurrentUser, session: Session) -> MyApplicationOut:
    if user.account_type != "student":
        raise HTTPException(403, "Ariza faqat talaba akkauntidan topshiriladi")
    if user.verification not in ("pending", "verified"):
        raise HTTPException(422, "Avval profilda talabalik ma'lumotlaringizni tasdiqlashga yuboring: "
                                 "ish beruvchilar faqat haqiqiy talabalarni ko'radi")
    job = (await session.execute(visible_jobs().where(Job.id == job_id))).scalar_one_or_none()
    if job is None:
        raise HTTPException(404, "Vakansiya topilmadi yoki yopilgan")
    app = (await session.execute(select(Application).where(Application.job_id == job_id,
                                                           Application.user_id == user.id))).scalar_one_or_none()
    if app is not None and app.status != "withdrawn":
        raise HTTPException(409, "Siz bu vakansiyaga ariza topshirgansiz")
    if app is None:
        app = Application(job_id=job_id, user_id=user.id, note=body.note.strip())
        session.add(app)
        await session.flush()
        applications.record(session, app, "", "new", "student", user.id)
    else:                                  # applying again after withdrawing: the same row comes back
        app.status, app.note = "new", body.note.strip()
        app.interview_at, app.interview_place = None, ""
        applications.record(session, app, "withdrawn", "new", "student", user.id)
    await session.commit()
    await inbox.push(session, await company_staff_ids(session, job.company_id), "application_new",
                     f"Yangi ariza: «{job.title}» ({JOB_KIND_LABEL[job.kind]}). Nomzod: {user.full_name}.",
                     link="/korxona/nomzodlar", params={"job": job.title, "student": user.full_name})
    await session.refresh(app)
    return (await my_applications_out(session, [app]))[0]


@router.get("/me/applications", response_model=list[MyApplicationOut])
async def my_applications(user: CurrentUser, session: Session) -> list[MyApplicationOut]:
    apps = (await session.execute(select(Application).where(Application.user_id == user.id)
                                  .order_by(Application.updated_at.desc()).limit(200))).scalars().all()
    return await my_applications_out(session, list(apps))


@router.post("/me/applications/{application_id}/withdraw", status_code=204)
async def withdraw(application_id: int, user: CurrentUser, session: Session) -> None:
    app = await session.get(Application, application_id)
    if app is None or app.user_id != user.id:
        raise HTTPException(404, "Ariza topilmadi")
    await applications.withdraw(session, app, user)


@router.get("/me/contacts")
async def my_contacts(user: CurrentUser, session: Session) -> list[dict]:
    rows = (await session.execute(select(ContactRequest).where(ContactRequest.student_id == user.id)
                                  .order_by(ContactRequest.created_at.desc()))).scalars()
    return [{"id": c.id, "company": c.company.name, "industry": c.company.industry, "message": c.message,
             "job_title": c.job.title if c.job else None, "status": c.status, "created_at": c.created_at}
            for c in rows]


@router.post("/me/contacts/{contact_id}")
async def answer_contact(contact_id: int, body: ContactAnswerIn, user: CurrentUser, session: Session) -> dict:
    contact = await session.get(ContactRequest, contact_id)
    if contact is None or contact.student_id != user.id:
        raise HTTPException(404, "So'rov topilmadi")
    if contact.status != "pending":
        raise HTTPException(409, "Bu so'rovga javob berilgan")
    contact.status = "accepted" if body.accept else "declined"
    contact.answered_at = datetime.now(UTC)
    await session.commit()
    if body.accept:
        await inbox.push(session, await company_staff_ids(session, contact.company_id), "contact_accepted",
                         f"Talaba {user.full_name} bog'lanishga rozi bo'ldi: ma'lumotlari ochildi.",
                         link="/korxona/talabalar", params={"student": user.full_name})
    return {"status": contact.status}
