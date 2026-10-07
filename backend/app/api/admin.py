"""Management API for the admin website. Admin accounts (email + password) run the app; only owners
approve admins and change the bot token and review rules. Every change is written to the audit log."""
import csv
import io
import re
import secrets
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import aliased

from ..core.config import settings
from ..models import (AdminAccount, Announcement, Application, AuditLog, Company, Group, GroupMember, GroupMessage, Job,
                      Role, Status, Submission, Task, Track, University, User)
from ..schemas import (AdminSubmissionOut, AdminTaskOut, AdminTrackOut, AdminUserOut, AnnouncementIn,
                       AnnouncementOut, AuditOut, BotStatusOut, BotTokenIn, CompanyOut, PointsAdjustIn,
                       ReviewDecisionIn, ReviewOut, TaskIn, TaskPatch, TrackIn, TrackPatch, UniversityIn,
                       UniversityOut, UniversityPatch, UserPatch)
from ..services import announcements, notify, settings_store, telegram_bot
from ..services.admin_accounts import hash_password
from ..services.career import decide_verification
from ..services.rules import Rules, get_rules, save_rules
from .deps import AdminActor, OwnerActor, Session, audit
from ..seed import add_official_groups
from .jobs import company_hr_ids, job_out

router = APIRouter(prefix="/admin", tags=["admin"])
VERIFIED = (Status.peer_verified, Status.mentor_verified)


def _verified_count():
    return (select(func.count()).where(Submission.user_id == User.id, Submission.status.in_(VERIFIED))
            .correlate(User).scalar_subquery())


# --------------------------------------------------------------------------- who am I, overview

@router.get("/stats")
async def stats(_: AdminActor, session: Session) -> dict:
    week_ago = datetime.now(UTC) - timedelta(days=7)
    inviter = aliased(User)
    by_status = dict((await session.execute(
        select(Submission.status, func.count()).group_by(Submission.status))).all())
    per_track = (await session.execute(
        select(Track.icon, Track.title, func.count(User.id))
        .outerjoin(User, User.track_id == Track.id).group_by(Track.id).order_by(Track.sort_order))).all()
    top = (await session.execute(select(User.full_name, User.group_name, User.points)
                                 .where(User.is_blocked.is_(False)).order_by(User.points.desc()).limit(5))).all()
    count = lambda *where: session.scalar(select(func.count()).select_from(User).where(*where))  # noqa: E731
    return {
        "users": await count(),
        "with_track": await count(User.track_id.isnot(None)),
        "seen_7d": await count(User.last_seen_at >= week_ago),
        "active_7d": await count(User.last_active_on >= (datetime.now(UTC) - timedelta(days=7)).date()),
        "mentors": await count(User.role == Role.mentor),
        "blocked": await count(User.is_blocked.is_(True)),
        "submissions": {s.value: by_status.get(s, 0) for s in Status},
        "per_track": [{"icon": i, "title": t, "students": n} for i, t, n in per_track],
        "top": [{"name": n, "group": g, "points": p} for n, g, p in top],
        "top_inviters": [{"name": n, "count": c} for n, c in (await session.execute(
            select(inviter.full_name, func.count(User.id)).join(inviter, User.referred_by_id == inviter.id)
            .group_by(inviter.id, inviter.full_name).order_by(func.count(User.id).desc()).limit(5))).all()],
    }


# --------------------------------------------------------------------------- users

@router.get("/users", response_model=list[AdminUserOut])
async def users(_: AdminActor, session: Session,
                q: str | None = Query(default=None, max_length=80),
                role: Role | None = None, track_id: int | None = None,
                blocked: bool | None = None) -> list[AdminUserOut]:
    verified = _verified_count().label("verified")
    query = select(User, verified)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(User.full_name.ilike(like) | User.username.ilike(like) | User.group_name.ilike(like))
    if role:
        query = query.where(User.role == role)
    if track_id:
        query = query.where(User.track_id == track_id)
    if blocked is not None:
        query = query.where(User.is_blocked.is_(blocked))
    rows = (await session.execute(query.order_by(User.created_at.desc()).limit(500))).all()
    return [AdminUserOut.model_validate(u).model_copy(update={"verified_tasks": n}) for u, n in rows]


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(user_id: int, body: UserPatch, actor: AdminActor, session: Session) -> AdminUserOut:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    changes.pop("is_owner", None)                # admin rights live in website accounts, not Telegram users
    if changes.get("role") is Role.admin:
        raise HTTPException(422, "Telegram foydalanuvchisiga faqat talaba yoki mentor roli beriladi")
    if "company_id" in changes:
        if not await session.get(Company, changes["company_id"]):
            raise HTTPException(404, "Kompaniya topilmadi")
        changes["account_type"] = "employer"
    before = {k: getattr(user, k) for k in changes}
    for field, value in changes.items():
        setattr(user, field, value)
    audit(session, actor, "user.update", f"{user.full_name} (#{user.id})",
          ", ".join(f"{k}: {getattr(before[k], 'value', before[k])} → {getattr(v, 'value', v)}" for k, v in changes.items()))
    await session.commit()
    verified = await session.scalar(select(func.count()).where(Submission.user_id == user.id,
                                                               Submission.status.in_(VERIFIED)))
    return AdminUserOut.model_validate(user).model_copy(update={"verified_tasks": verified})


@router.post("/users/{user_id}/points")
async def adjust_points(user_id: int, body: PointsAdjustIn, actor: OwnerActor, session: Session) -> dict:
    """Manual correction (e.g. an offline workshop). Owner only, always with a reason in the log."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    user.points = max(user.points + body.delta, 0)
    audit(session, actor, "user.points", f"{user.full_name} (#{user.id})", f"{body.delta:+d}: {body.reason}")
    await session.commit()
    return {"points": user.points}


# --------------------------------------------------------------------------- submissions

def _submission_out(s: Submission) -> AdminSubmissionOut:
    return AdminSubmissionOut(
        id=s.id, status=s.status, round=s.round, points_awarded=s.points_awarded, proof_url=s.proof_url,
        note=s.note, task_title=s.task.title, track_title=s.task.track.title, author_id=s.user_id,
        author_name=s.user.full_name, updated_at=s.updated_at,
        reviews=[ReviewOut(reviewer_name=r.reviewer.full_name, kind=r.kind, approved=r.approved,
                           comment=r.comment, created_at=r.created_at) for r in s.current_reviews])


@router.get("/submissions", response_model=list[AdminSubmissionOut])
async def submissions(_: AdminActor, session: Session, status: Status | None = None,
                      track_id: int | None = None, user_id: int | None = None) -> list[AdminSubmissionOut]:
    query = select(Submission).join(Task)
    if status:
        query = query.where(Submission.status == status)
    if track_id:
        query = query.where(Task.track_id == track_id)
    if user_id:
        query = query.where(Submission.user_id == user_id)
    rows = (await session.execute(query.order_by(Submission.updated_at.desc()).limit(200))).scalars()
    return [_submission_out(s) for s in rows]


@router.delete("/submissions/{submission_id}", status_code=204)
async def delete_submission(submission_id: int, actor: AdminActor, session: Session,
                            reason: str = Query(min_length=5, max_length=300)) -> None:
    """Removes spam or copied work and takes back the points it earned."""
    sub = await session.get(Submission, submission_id)
    if sub is None:
        raise HTTPException(404, "Ish topilmadi")
    author = await session.get(User, sub.user_id)
    author.points = max(author.points - sub.points_awarded, 0)
    audit(session, actor, "submission.delete", f"{author.full_name}: {sub.task.title}",
          f"-{sub.points_awarded} ball. Sabab: {reason}")
    await session.delete(sub)
    await session.commit()


# --------------------------------------------------------------------------- tracks and tasks

@router.get("/tracks", response_model=list[AdminTrackOut])
async def all_tracks(_: AdminActor, session: Session) -> list[AdminTrackOut]:
    students = select(func.count()).where(User.track_id == Track.id).correlate(Track).scalar_subquery()
    tasks = select(func.count()).where(Task.track_id == Track.id).correlate(Track).scalar_subquery()
    rows = (await session.execute(select(Track, students, tasks).order_by(Track.sort_order, Track.id))).all()
    return [AdminTrackOut.model_validate(t).model_copy(update={"student_count": s, "task_count": n}) for t, s, n in rows]


def _slugify(title: str) -> str:
    table = str.maketrans({"ʻ": "", "'": "", "’": "", "ʼ": ""})
    return re.sub(r"[^a-z0-9]+", "-", title.lower().translate(table)).strip("-")[:40] or "yonalish"


@router.post("/tracks", response_model=AdminTrackOut, status_code=201)
async def create_track(body: TrackIn, actor: AdminActor, session: Session) -> AdminTrackOut:
    slug, n = body.slug or _slugify(body.title), 1
    base = slug
    while await session.scalar(select(func.count()).select_from(Track).where(Track.slug == slug)):
        n += 1
        slug = f"{base[:36]}-{n}"
    last = await session.scalar(select(func.max(Track.sort_order)))
    track = Track(slug=slug, title=body.title, icon=body.icon or "📘", description=body.description,
                  sort_order=(last or 0) + 1)
    session.add(track)
    audit(session, actor, "track.create", body.title)
    await session.commit()
    await add_official_groups(session)              # every track gets its open group
    return AdminTrackOut.model_validate(track)


@router.patch("/tracks/{track_id}", response_model=AdminTrackOut)
async def update_track(track_id: int, body: TrackPatch, actor: AdminActor, session: Session) -> AdminTrackOut:
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(404, "Yo'nalish topilmadi")
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in changes.items():
        setattr(track, field, value)
    audit(session, actor, "track.update", track.title, ", ".join(f"{k}: {v}" for k, v in changes.items()))
    await session.commit()
    return AdminTrackOut.model_validate(track)


@router.get("/tasks", response_model=list[AdminTaskOut])
async def all_tasks(_: AdminActor, session: Session, track_id: int | None = None) -> list[Task]:
    query = select(Task).join(Track)
    if track_id:
        query = query.where(Task.track_id == track_id)
    return list((await session.execute(query.order_by(Track.sort_order, Task.sort_order))).scalars())


@router.post("/tasks", response_model=AdminTaskOut, status_code=201)
async def create_task(body: TaskIn, actor: AdminActor, session: Session) -> Task:
    track = await session.get(Track, body.track_id)
    if track is None:
        raise HTTPException(404, "Yo'nalish topilmadi")
    last = await session.scalar(select(func.max(Task.sort_order)).where(Task.track_id == body.track_id))
    task = Task(**body.model_dump(), sort_order=(last or 0) + 1)
    session.add(task)
    audit(session, actor, "task.create", f"{track.title}: {body.title}")
    await session.commit()
    return task


@router.patch("/tasks/{task_id}", response_model=AdminTaskOut)
async def update_task(task_id: int, body: TaskPatch, actor: AdminActor, session: Session) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Topshiriq topilmadi")
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in changes.items():
        setattr(task, field, value)
    audit(session, actor, "task.update", task.title, ", ".join(f"{k}: {v}" for k, v in changes.items() if k != "description"))
    await session.commit()
    return task


# --------------------------------------------------------------------------- announcements

@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements(_: AdminActor, session: Session) -> list[Announcement]:
    return list((await session.execute(select(Announcement).order_by(Announcement.id.desc()).limit(30))).scalars())


@router.post("/announcements", response_model=AnnouncementOut, status_code=201)
async def send_announcement(body: AnnouncementIn, actor: AdminActor, session: Session) -> Announcement:
    if not await settings_store.get_value(session, settings_store.BOT_TOKEN):
        raise HTTPException(400, "Bot tokeni sozlanmagan")
    group = (body.group_name or "").strip() or None
    track = await session.get(Track, body.track_id) if body.track_id else None
    chat_ids = list((await session.execute(announcements.audience_query(body.track_id, group))).scalars())
    if not chat_ids:
        raise HTTPException(400, "Bu auditoriyada hech kim yo'q")
    audience = " · ".join(filter(None, [track.title if track else "Hamma", f"guruh {group}" if group else None]))
    row = Announcement(text=body.text.strip(), audience=audience, created_by=actor.name, total=len(chat_ids))
    session.add(row)
    audit(session, actor, "announcement.send", audience, body.text[:200])
    await session.commit()
    announcements.start(row.id, chat_ids)
    return row


# --------------------------------------------------------------------------- owner settings

@router.get("/rules", response_model=Rules)
async def read_rules(_: AdminActor, session: Session) -> Rules:
    return await get_rules(session)


@router.put("/rules", response_model=Rules)
async def update_rules(body: Rules, actor: OwnerActor, session: Session) -> Rules:
    audit(session, actor, "rules.update", "", body.model_dump_json())
    return await save_rules(session, body)


@router.get("/bot", response_model=BotStatusOut)
async def bot_status(_: AdminActor, session: Session) -> BotStatusOut:
    hint = await settings_store.get_hint(session, settings_store.BOT_TOKEN)
    return BotStatusOut(configured=hint is not None, hint=hint, public_url=settings.public_url)


@router.put("/bot", response_model=BotStatusOut)
async def save_bot_token(body: BotTokenIn, actor: OwnerActor, session: Session) -> BotStatusOut:
    try:
        await telegram_bot.call(body.token, "getMe")
    except telegram_bot.BotError as exc:
        raise HTTPException(400, f"Token ishlamadi: {exc}") from exc
    audit(session, actor, "bot.token", "", "token almashtirildi")
    hint = await settings_store.set_value(session, settings_store.BOT_TOKEN, body.token)
    return BotStatusOut(configured=True, hint=hint, public_url=settings.public_url)


async def _bot_token(session: Session) -> str:
    token = await settings_store.get_value(session, settings_store.BOT_TOKEN)
    if not token:
        raise HTTPException(400, "Avval bot tokenini saqlang")
    return token


@router.post("/bot/test")
async def test_bot(_: AdminActor, session: Session) -> dict:
    try:
        me = await telegram_bot.call(await _bot_token(session), "getMe")
    except telegram_bot.BotError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "username": me.get("username"), "name": me.get("first_name")}


@router.post("/bot/connect")
async def connect_bot(actor: OwnerActor, session: Session) -> dict:
    """Points the bot's menu button and webhook at this server. Needs a public https address."""
    if not settings.public_url.startswith("https://"):
        raise HTTPException(400, "Telegram faqat https manzil bilan ishlaydi: PUBLIC_URL serverdagi domen bo'lishi kerak")
    try:
        me = await telegram_bot.connect(await _bot_token(session), settings.public_url)
    except telegram_bot.BotError as exc:
        raise HTTPException(400, str(exc)) from exc
    audit(session, actor, "bot.connect", settings.public_url)
    await session.commit()
    return {"ok": True, "username": me.get("username")}


# --------------------------------------------------------------------------- audit and export

@router.get("/audit", response_model=list[AuditOut])
async def audit_log(_: AdminActor, session: Session) -> list[AuditLog]:
    return list((await session.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(200))).scalars())


@router.get("/export/users.csv")
async def export_users(actor: AdminActor, session: Session) -> StreamingResponse:
    verified = _verified_count().label("verified")
    rows = (await session.execute(select(User, verified).order_by(User.points.desc()))).all()
    buf = io.StringIO()
    buf.write("﻿")                                  # Excel opens UTF-8 correctly with a BOM
    out = csv.writer(buf)
    out.writerow(["Ism", "Username", "Universitet", "Guruh", "Yo'nalish", "Rol", "Ball",
                  "Tasdiqlangan ishlar", "Seriya", "CV ochiq", "Ro'yxatdan o'tgan"])
    for u, n in rows:
        out.writerow([u.full_name, u.username or "", u.university, u.group_name, u.track.title if u.track else "",
                      u.role.value, u.points, n, u.streak_count, "ha" if u.cv_public else "yo'q",
                      u.created_at.date().isoformat()])
    audit(session, actor, "export.users", f"{len(rows)} qator")
    await session.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="careerflow-talabalar.csv"'})


# --------------------------------------------------------------------------- moderation queues

@router.get("/inbox")
async def inbox(_: AdminActor, session: Session) -> dict:
    """Counts behind the badges: everything that waits for an admin decision."""
    count = lambda model, *where: session.scalar(select(func.count()).select_from(model).where(*where))  # noqa: E731
    return {
        "verifications": await count(User, User.verification == "pending"),
        "companies": await count(Company, Company.status == "pending"),
        "jobs": await count(Job, Job.status == "pending"),
        "staff": await count(User, User.staff_status == "pending"),
    }


@router.get("/verifications")
async def verifications(_: AdminActor, session: Session, status: str = "pending") -> list[dict]:
    rows = (await session.execute(select(User).where(User.verification == status, User.account_type == "student")
                                  .order_by(User.created_at).limit(200))).scalars()
    return [{"id": u.id, "full_name": u.full_name, "username": u.username,
             "university": u.university_ref.name if u.university_ref else None, "faculty": u.faculty,
             "course": u.course, "group_name": u.group_name, "student_number": u.student_number,
             "verification": u.verification, "verified_by": u.verified_by} for u in rows]


@router.post("/verifications/{user_id}")
async def decide(user_id: int, body: ReviewDecisionIn, actor: AdminActor, session: Session) -> dict:
    student = await session.get(User, user_id)
    if student is None:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    audit(session, actor, "verification.decide", f"{student.full_name} (#{student.id})",
          ("tasdiqlandi" if body.approve else "rad etildi") + (f": {body.note}" if body.note else ""))
    await decide_verification(session, student, body.approve, "CareerFlow", body.note.strip())
    return {"verification": student.verification}


@router.get("/companies", response_model=list[CompanyOut])
async def companies(_: AdminActor, session: Session, status: str | None = None) -> list[Company]:
    query = select(Company)
    if status:
        query = query.where(Company.status == status)
    return list((await session.execute(query.order_by(Company.created_at.desc()).limit(300))).scalars())


@router.post("/companies/{company_id}/review", response_model=CompanyOut)
async def review_company(company_id: int, body: ReviewDecisionIn, actor: AdminActor, session: Session) -> Company:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(404, "Kompaniya topilmadi")
    company.status, company.review_note = ("approved" if body.approve else "rejected"), body.note.strip()
    audit(session, actor, "company.review", company.name, f"{company.status}: STIR {company.stir or '-'} {body.note}")
    await session.commit()
    notify.send(await company_hr_ids(session, company.id),
                f"✅ {company.name} tasdiqlandi. Endi vakansiya joylashingiz va talabalarni qidirishingiz mumkin."
                if body.approve else f"{company.name} tasdiqlanmadi. Izoh: {body.note or '-'}")
    return company


@router.get("/jobs")
async def jobs(_: AdminActor, session: Session, status: str | None = None) -> list:
    query = select(Job)
    if status:
        query = query.where(Job.status == status)
    return [job_out(j) for j in (await session.execute(query.order_by(Job.created_at.desc()).limit(300))).scalars()]


@router.post("/jobs/{job_id}/review")
async def review_job(job_id: int, body: ReviewDecisionIn, actor: AdminActor, session: Session):
    job = await session.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Vakansiya topilmadi")
    if body.approve and job.company.status != "approved":
        raise HTTPException(409, "Avval kompaniyani tasdiqlang")
    job.status, job.review_note = ("approved" if body.approve else "rejected"), body.note.strip()
    audit(session, actor, "job.review", f"{job.company.name}: {job.title}", f"{job.status} {body.note}")
    await session.commit()
    notify.send(await company_hr_ids(session, job.company_id),
                f"✅ «{job.title}» vakansiyasi e'lon qilindi." if body.approve
                else f"«{job.title}» vakansiyasi qaytarildi. Izoh: {body.note or '-'}")
    return job_out(job)


@router.get("/staff")
async def staff_requests(_: AdminActor, session: Session, status: str = "pending") -> list[dict]:
    rows = (await session.execute(select(User).where(User.staff_status == status).order_by(User.created_at))).scalars()
    return [{"id": u.id, "full_name": u.full_name, "username": u.username, "position": u.staff_position,
             "university": u.staff_university.name if u.staff_university else None, "status": u.staff_status}
            for u in rows]


@router.post("/staff/{user_id}/review")
async def review_staff(user_id: int, body: ReviewDecisionIn, actor: OwnerActor, session: Session) -> dict:
    """Owner only: staff can verify students, so this access is checked by a person (call the university)."""
    user = await session.get(User, user_id)
    if user is None or not user.staff_status:
        raise HTTPException(404, "So'rov topilmadi")
    user.staff_status = "approved" if body.approve else "rejected"
    uni = user.staff_university.name if user.staff_university else "?"
    audit(session, actor, "staff.review", f"{user.full_name} ({uni})", user.staff_status)
    await session.commit()
    notify.send([user.telegram_id], f"✅ {uni} karyera markazi paneliga kirish berildi." if body.approve
                else "Universitet xodimi sifatidagi so'rovingiz tasdiqlanmadi.")
    return {"status": user.staff_status}


@router.get("/universities")
async def admin_universities(_: AdminActor, session: Session) -> list[dict]:
    students = (select(func.count()).where(User.university_id == University.id, User.account_type == "student")
                .correlate(University).scalar_subquery())
    rows = (await session.execute(select(University, students).order_by(University.name))).all()
    return [{**UniversityOut.model_validate(u).model_dump(), "is_active": u.is_active, "students": n} for u, n in rows]


@router.post("/universities", response_model=UniversityOut, status_code=201)
async def add_university(body: UniversityIn, actor: AdminActor, session: Session) -> University:
    if await session.scalar(select(func.count()).select_from(University).where(University.name == body.name.strip())):
        raise HTTPException(409, "Bu universitet ro'yxatda bor")
    uni = University(name=body.name.strip(), short_name=body.short_name.strip(), city=body.city.strip())
    session.add(uni)
    audit(session, actor, "university.create", uni.name)
    await session.commit()
    return uni


@router.patch("/universities/{university_id}", response_model=UniversityOut)
async def edit_university(university_id: int, body: UniversityPatch, actor: AdminActor, session: Session) -> University:
    uni = await session.get(University, university_id)
    if uni is None:
        raise HTTPException(404, "Universitet topilmadi")
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(uni, field, value)
    audit(session, actor, "university.update", uni.name)
    await session.commit()
    return uni


# --------------------------------------------------------------------------- dashboard

TASHKENT = ZoneInfo("Asia/Tashkent")


def _period(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    to = date_to or datetime.now(TASHKENT).date()
    frm = date_from or to - timedelta(days=29)
    if frm > to:
        raise HTTPException(422, "«Dan» sanasi «gacha» sanasidan keyin bo'lmasin")
    if (to - frm).days > 366:
        raise HTTPException(422, "Oraliq bir yildan oshmasin")
    return frm, to


async def _per_day(session: Session, column, frm: date, to: date, *where) -> list[int]:
    day = func.date(func.timezone("Asia/Tashkent", column))
    rows = dict((await session.execute(select(day, func.count()).where(day >= frm, day <= to, *where)
                                       .group_by(day))).all())
    return [rows.get(frm + timedelta(days=i), 0) for i in range((to - frm).days + 1)]


@router.get("/dashboard")
async def dashboard(_: AdminActor, session: Session,
                    date_from: date | None = Query(default=None, alias="from"),
                    date_to: date | None = Query(default=None, alias="to")) -> dict:
    """Numbers for the admin home page within a date range (Tashkent days, both ends included)."""
    frm, to = _period(date_from, date_to)
    day = lambda col: func.date(func.timezone("Asia/Tashkent", col))  # noqa: E731
    in_period = lambda col: (day(col) >= frm) & (day(col) <= to)  # noqa: E731
    students = User.account_type == "student"
    count = lambda model, *where: session.scalar(select(func.count()).select_from(model).where(*where))  # noqa: E731
    week_ago = datetime.now(UTC) - timedelta(days=7)

    apps_by_status = dict((await session.execute(
        select(Application.status, func.count()).where(in_period(Application.created_at))
        .group_by(Application.status))).all())
    subs_by_status = dict((await session.execute(
        select(Submission.status, func.count()).where(in_period(Submission.created_at))
        .group_by(Submission.status))).all())
    recent_apps = (await session.execute(
        select(Application).where(in_period(Application.created_at))
        .order_by(Application.created_at.desc()).limit(10))).scalars().all()
    recent_subs = (await session.execute(
        select(Submission).where(in_period(Submission.created_at))
        .order_by(Submission.created_at.desc()).limit(10))).scalars().all()
    per_track = (await session.execute(
        select(Track.icon, Track.title, func.count(User.id)).outerjoin(User, (User.track_id == Track.id) & students)
        .group_by(Track.id).order_by(func.count(User.id).desc()))).all()
    per_uni = (await session.execute(
        select(University.short_name, func.count(User.id)).join(User, User.university_id == University.id)
        .where(students).group_by(University.id).order_by(func.count(User.id).desc()).limit(6))).all()

    return {
        "from": frm, "to": to,
        "kpis": {
            "students": await count(User, students),
            "new_students": await count(User, students, in_period(User.created_at)),
            "active_7d": await count(User, students, User.last_seen_at >= week_ago),
            "verified_students": await count(User, students, User.verification == "verified"),
            "submissions": sum(subs_by_status.values()),
            "awaiting_review": await count(Submission, Submission.status.in_([Status.pending, Status.peer_verified])),
            "companies": await count(Company, Company.status == "approved"),
            "live_jobs": await count(Job, Job.status == "approved"),
            "queue": (await count(User, User.verification == "pending")) + (await count(Company, Company.status == "pending"))
                     + (await count(Job, Job.status == "pending")) + (await count(User, User.staff_status == "pending"))
                     + (await count(AdminAccount, AdminAccount.status == "pending")),
        },
        "applications": {s: apps_by_status.get(s, 0) for s in ("new", "viewed", "shortlisted", "hired", "rejected")},
        "submissions_by_status": {s.value: subs_by_status.get(s, 0) for s in Status},
        "series": {
            "dates": [frm + timedelta(days=i) for i in range((to - frm).days + 1)],
            "registrations": await _per_day(session, User.created_at, frm, to, students),
            "submissions": await _per_day(session, Submission.created_at, frm, to),
            "applications": await _per_day(session, Application.created_at, frm, to),
        },
        "recent_applications": [{"id": a.id, "candidate": a.user.full_name, "job": a.job.title,
                                 "company": a.job.company.name, "status": a.status, "created_at": a.created_at}
                                for a in recent_apps],
        "recent_submissions": [{"id": s.id, "student": s.user.full_name, "task": s.task.title,
                                "track": s.task.track.title, "status": s.status.value, "created_at": s.created_at}
                               for s in recent_subs],
        "per_track": [{"icon": i, "title": t, "students": n} for i, t, n in per_track],
        "per_university": [{"name": n, "students": c} for n, c in per_uni],
    }


# --------------------------------------------------------------------------- applications

@router.get("/applications")
async def applications(_: AdminActor, session: Session, status: str | None = None,
                       q: str | None = Query(default=None, max_length=80),
                       date_from: date | None = Query(default=None, alias="from"),
                       date_to: date | None = Query(default=None, alias="to")) -> list[dict]:
    query = select(Application).join(Job).join(Company).join(User, User.id == Application.user_id)
    if status:
        query = query.where(Application.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(User.full_name.ilike(like) | Job.title.ilike(like) | Company.name.ilike(like))
    if date_from or date_to:
        frm, to = _period(date_from, date_to)
        day = func.date(func.timezone("Asia/Tashkent", Application.created_at))
        query = query.where(day >= frm, day <= to)
    rows = (await session.execute(query.order_by(Application.created_at.desc()).limit(500))).scalars()
    return [{"id": a.id, "candidate": a.user.full_name, "username": a.user.username, "phone": a.user.phone,
             "university": a.user.university_ref.short_name if a.user.university_ref else None,
             "job": a.job.title, "kind": a.job.kind, "company": a.job.company.name, "status": a.status,
             "note": a.note, "created_at": a.created_at, "updated_at": a.updated_at} for a in rows]


# --------------------------------------------------------------------------- admin accounts (owner)

def _account_out(a: AdminAccount) -> dict:
    return {"id": a.id, "name": a.name, "email": a.email, "role": a.role, "status": a.status,
            "created_at": a.created_at, "last_login_at": a.last_login_at}


@router.get("/accounts")
async def accounts(_: OwnerActor, session: Session) -> list[dict]:
    rows = (await session.execute(select(AdminAccount).order_by(
        (AdminAccount.status == "pending").desc(), AdminAccount.created_at))).scalars()
    return [_account_out(a) for a in rows]


class AccountPatch(BaseModel):
    role: Literal["owner", "admin"] | None = None
    status: Literal["active", "disabled"] | None = None


@router.patch("/accounts/{account_id}")
async def update_account(account_id: int, body: AccountPatch, actor: OwnerActor, session: Session) -> dict:
    account = await session.get(AdminAccount, account_id)
    if account is None:
        raise HTTPException(404, "Hisob topilmadi")
    changes = body.model_dump(exclude_none=True)
    losing_owner = account.role == "owner" and account.status == "active" and (
        changes.get("role") == "admin" or changes.get("status") == "disabled")
    if losing_owner and await session.scalar(select(func.count()).select_from(AdminAccount).where(
            AdminAccount.role == "owner", AdminAccount.status == "active")) <= 1:
        raise HTTPException(400, "Kamida bitta faol ega qolishi kerak")
    for field, value in changes.items():
        setattr(account, field, value)
    audit(session, actor, "account.update", account.email, ", ".join(f"{k}: {v}" for k, v in changes.items()))
    await session.commit()
    return _account_out(account)


@router.post("/accounts/{account_id}/reset-password")
async def reset_password(account_id: int, actor: OwnerActor, session: Session) -> dict:
    """Sets a temporary password, shown once; the person changes it after signing in."""
    account = await session.get(AdminAccount, account_id)
    if account is None:
        raise HTTPException(404, "Hisob topilmadi")
    temporary = secrets.token_urlsafe(9)
    account.password_hash = hash_password(temporary)
    audit(session, actor, "account.reset", account.email)
    await session.commit()
    return {"temporary_password": temporary}


@router.get("/export/applications.csv")
async def export_applications(actor: AdminActor, session: Session) -> StreamingResponse:
    rows = await applications(actor, session)
    buf = io.StringIO()
    buf.write("\ufeff")
    out = csv.writer(buf)
    out.writerow(["Nomzod", "Telefon", "Universitet", "Vakansiya", "Kompaniya", "Holat", "Sana"])
    for r in rows:
        out.writerow([r["candidate"], r["phone"], r["university"] or "", r["job"], r["company"], r["status"],
                      r["created_at"].astimezone(TASHKENT).strftime("%Y-%m-%d %H:%M")])
    audit(session, actor, "export.applications", f"{len(rows)} qator")
    await session.commit()
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="careerflow-arizalar.csv"'})


# --------------------------------------------------------------------------- groups

@router.get("/groups")
async def admin_groups(_: AdminActor, session: Session) -> list[dict]:
    """All groups with sizes. Private groups show only their name and size: their messages stay private
    unless someone reports a problem and the owner decides to archive the group."""
    members = select(func.count()).where(GroupMember.group_id == Group.id).correlate(Group).scalar_subquery()
    msgs = select(func.count()).where(GroupMessage.group_id == Group.id).correlate(Group).scalar_subquery()
    rows = (await session.execute(select(Group, members, msgs).order_by(Group.is_official.desc(), Group.created_at.desc()))).all()
    return [{"id": g.id, "name": g.name, "is_private": g.is_private, "is_official": g.is_official,
             "is_archived": g.is_archived, "members": m, "messages": n, "created_at": g.created_at} for g, m, n in rows]


@router.get("/groups/{group_id}/messages")
async def admin_group_messages(group_id: int, _: AdminActor, session: Session) -> list[dict]:
    group = await session.get(Group, group_id)
    if group is None:
        raise HTTPException(404, "Guruh topilmadi")
    if group.is_private:
        raise HTTPException(403, "Shaxsiy guruh xabarlari faqat a'zolarga ko'rinadi")
    rows = (await session.execute(select(GroupMessage).where(GroupMessage.group_id == group_id)
                                  .order_by(GroupMessage.id.desc()).limit(200))).scalars()
    return [{"id": m.id, "author": m.user.full_name if m.user else "—", "text": m.text, "deleted": m.deleted_at is not None,
             "created_at": m.created_at} for m in rows]


@router.delete("/group-messages/{message_id}", status_code=204)
async def admin_delete_message(message_id: int, actor: AdminActor, session: Session) -> None:
    msg = await session.get(GroupMessage, message_id)
    if msg is None:
        raise HTTPException(404, "Xabar topilmadi")
    msg.deleted_at = datetime.now(UTC)
    audit(session, actor, "group.message.delete", f"guruh #{msg.group_id}", msg.text[:200])
    await session.commit()


@router.post("/groups/{group_id}/archive")
async def archive_group(group_id: int, actor: AdminActor, session: Session) -> dict:
    group = await session.get(Group, group_id)
    if group is None:
        raise HTTPException(404, "Guruh topilmadi")
    group.is_archived = not group.is_archived
    audit(session, actor, "group.archive" if group.is_archived else "group.restore", group.name)
    await session.commit()
    return {"is_archived": group.is_archived}
