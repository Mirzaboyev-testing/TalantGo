from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from datetime import UTC, datetime

from ..models import Company, Role, Status, Submission, Track, University, User
from ..schemas import (CompanyOut, EmployerSignupIn, LeaderboardOut, LeaderRow, MeOut, MeUpdate, PeerOut,
                       StaffRequestIn, TrackOut, UniversityOut)
from ..core import ratelimit
from ..services import inbox, notify
from ..services.career import completeness, signup_missing
from ..services.catalog import CONSENT_VERSION, as_dict as catalog_dict
from ..core.security import read_token
from ..services import cv_pdf
from ..services.cv import build_cv
from ..services.progress import current_streak, rank_of
from .deps import CurrentUser, Session

router = APIRouter(tags=["people"])


async def me_out(session: Session, user: User) -> MeOut:
    return MeOut(
        id=user.id, full_name=user.full_name, username=user.username, photo_url=user.photo_url,
        role=user.role, track=TrackOut.model_validate(user.track) if user.track else None,
        university=user.university, group_name=user.group_name, bio=user.bio, goals=user.goals,
        github_url=user.github_url, linkedin_url=user.linkedin_url, points=user.points,
        streak=current_streak(user), rank_overall=await rank_of(session, user),
        cv_slug=user.cv_slug, cv_public=user.cv_public, is_owner=user.is_owner,
        account_type=user.account_type, has_consent=user.consent_at is not None,
        university_ref=UniversityOut.model_validate(user.university_ref) if user.university_ref else None,
        faculty=user.faculty, course=user.course, graduation_year=user.graduation_year, gpa=user.gpa,
        gpa_scale=user.gpa_scale, student_number=user.student_number, skills=user.skills,
        languages=user.languages, job_types=user.job_types, city=user.city, open_to_work=user.open_to_work,
        verification=user.verification, verified_by=user.verified_by, verification_note=user.verification_note,
        company=CompanyOut.model_validate(user.company) if user.company else None,
        staff_university=UniversityOut.model_validate(user.staff_university) if user.staff_university else None,
        staff_status=user.staff_status, staff_position=user.staff_position,
        phone=user.phone, phone_verified=user.phone_verified, show_phone=user.show_phone,
        invite_code=f"r{user.id}", headline=user.headline,
        invited_count=await session.scalar(select(func.count()).select_from(User).where(User.referred_by_id == user.id)),
        completeness=completeness(user), consent_current=user.consent_version >= CONSENT_VERSION,
        work_industries=user.work_industries, job_title=user.job_title, signup_missing=signup_missing(user),
        email=user.email, has_password=bool(user.password_hash), has_telegram=user.telegram_id is not None,
        language=user.language, visible_to_employers=user.visible_to_employers)


# Changing any of these after verification means the old check no longer covers the profile.
IDENTITY_FIELDS = ("full_name", "university_id", "faculty", "course", "student_number")


@router.get("/me", response_model=MeOut)
async def get_me(user: CurrentUser, session: Session) -> MeOut:
    from .groups import ensure_official_memberships      # late import: groups imports this module's deps
    await ensure_official_memberships(session, user)
    return await me_out(session, user)


@router.patch("/me", response_model=MeOut)
async def update_me(body: MeUpdate, user: CurrentUser, session: Session) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    if changes.get("track_id") is not None:
        track = await session.get(Track, changes["track_id"])
        if track is None or not track.is_active:
            raise HTTPException(404, "Bunday yo'l yo'q")
    if changes.get("university_id") is not None:
        uni = await session.get(University, changes["university_id"])
        if uni is None or not uni.is_active:
            raise HTTPException(404, "Universitet topilmadi")
    for key in ("goals", "skills", "languages", "job_types"):
        if changes.get(key) is not None:
            changes[key] = list(dict.fromkeys(changes[key]))
    if changes.get("full_name"):
        changes["full_name"] = " ".join(changes["full_name"].split())
        user.name_set_by_user = True        # Telegram sign-in no longer overwrites it
    if changes.pop("consent", None):
        user.consent_at = user.consent_at or datetime.now(UTC)
        user.consent_version = CONSENT_VERSION
    if changes.get("job_title") is not None:
        changes["job_title"] = " ".join(changes["job_title"].split())
    if changes.get("work_industries") is not None:
        changes["work_industries"] = list(dict.fromkeys(changes["work_industries"]))
    if (gpa := changes.get("gpa")) is not None and gpa > (changes.get("gpa_scale") or user.gpa_scale):
        raise HTTPException(422, "O'rtacha baho shkaladan katta bo'lishi mumkin emas")
    if "phone" in changes and changes["phone"] != user.phone:
        user.phone_verified = False        # typed by hand: only a number shared via Telegram is confirmed
    if user.verification in ("pending", "verified") and any(
            k in changes and changes[k] != getattr(user, k) for k in IDENTITY_FIELDS):
        user.verification, user.verified_by, user.verified_at = "none", "", None
    for field, value in changes.items():
        if value is not None or field in ("track_id", "gpa", "graduation_year"):     # these can be cleared
            setattr(user, field, value)
    await session.commit()
    await session.refresh(user)
    if "track_id" in changes:                            # a new path: join that path's group
        from .groups import ensure_official_memberships
        await ensure_official_memberships(session, user)
    return await me_out(session, user)


@router.get("/me/cv")
async def my_cv(user: CurrentUser, session: Session) -> dict:
    return await build_cv(session, user)


@router.get("/me/cv-link")
async def my_cv_link(user: CurrentUser) -> dict:
    from .employer import cv_pdf_link
    return {"url": cv_pdf_link(user.id)}


@router.get("/cv-pdf/{user_id}", include_in_schema=False)
async def cv_pdf_file(user_id: int, t: str, session: Session) -> Response:
    """The CV as a PDF. The signed link is the permission: the app hands it only to the student
    themselves and to approved employers, and it expires after a couple of hours."""
    if read_token(t, "cvpdf") != str(user_id):
        raise HTTPException(403, "Havola eskirgan: CV'ni ilovadan qayta yuklab oling")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Talaba topilmadi")
    extra = {"city": user.city, "gpa": user.gpa, "gpa_scale": user.gpa_scale,
             "work_industries": user.work_industries, "job_types": user.job_types}
    pdf = cv_pdf.render(await build_cv(session, user), extra)
    name = cv_pdf.filename(user.full_name)
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{name.encode("ascii", "replace").decode()}"',
        "Cache-Control": "private, no-store"})


@router.get("/cv/{slug}")
async def public_cv(slug: str, session: Session) -> dict:
    user = (await session.execute(select(User).where(User.cv_slug == slug))).scalar_one_or_none()
    if user is None or not user.cv_public:
        raise HTTPException(404, "CV topilmadi yoki yopiq")
    return await build_cv(session, user)


def _verified_count():
    return (select(func.count()).where(Submission.user_id == User.id,
                                       Submission.status.in_([Status.peer_verified, Status.mentor_verified]))
            .correlate(User).scalar_subquery())


@router.get("/peers", response_model=list[PeerOut])
async def peers(user: CurrentUser, session: Session,
                goal: str | None = Query(default=None, max_length=40),
                track_id: int | None = None) -> list[PeerOut]:
    """Students on the same path by default; a goal search looks across all paths. Only for students, and only
    students who agreed to be shown."""
    if user.account_type != "student":
        raise HTTPException(403, "Bu bo'lim talabalar uchun")
    verified = _verified_count().label("verified")
    query = select(User, verified).where(User.id != user.id, User.is_blocked.is_(False), User.account_type == "student",
                                         User.consent_at.isnot(None))
    if goal:
        query = query.where(User.goals.contains([goal.strip()]) | User.skills.contains([goal.strip()]))
    else:
        wanted = track_id or user.track_id
        if wanted is None:
            return []
        query = query.where(User.track_id == wanted)
    rows = (await session.execute(query.order_by(User.points.desc(), User.id).limit(100))).all()
    return [PeerOut(id=u.id, full_name=u.full_name, username=u.username, photo_url=u.photo_url,
                    track_title=u.track.title if u.track else None, track_icon=u.track.icon if u.track else "",
                    university=u.university_ref.short_name if u.university_ref else None, faculty=u.faculty,
                    course=u.course, phone=u.phone if u.show_phone and u.phone else None,
                    group_name=u.group_name, goals=u.goals,
                    points=u.points, streak=current_streak(u), verified_tasks=n) for u, n in rows]


@router.get("/leaderboard", response_model=LeaderboardOut)
async def leaderboard(user: CurrentUser, session: Session,
                      scope: Literal["all", "track", "group", "university"] = "all") -> LeaderboardOut:
    if user.account_type != "student":
        raise HTTPException(403, "Reyting talabalar uchun")
    # only students who agreed to the processing of their data are shown to others
    query = select(User).where(User.is_blocked.is_(False), User.account_type == "student", User.consent_at.isnot(None))
    rank_query = select(func.count()).select_from(User).where(User.points > user.points, User.is_blocked.is_(False),
                                                              User.account_type == "student", User.consent_at.isnot(None))
    if scope == "track":
        query = query.where(User.track_id == user.track_id)
        rank_query = rank_query.where(User.track_id == user.track_id)
    elif scope == "university":
        query = query.where(User.university_id == user.university_id)
        rank_query = rank_query.where(User.university_id == user.university_id)
    elif scope == "group":
        query = query.where(User.group_name == user.group_name)
        rank_query = rank_query.where(User.group_name == user.group_name)
    users = (await session.execute(query.order_by(User.points.desc(), User.id).limit(50))).scalars().all()
    rows, rank, previous = [], 0, None
    for position, u in enumerate(users, start=1):
        if u.points != previous:          # equal points share a rank
            rank, previous = position, u.points
        rows.append(LeaderRow(rank=rank, id=u.id, full_name=u.full_name, group_name=u.group_name,
                              university=u.university_ref.short_name if u.university_ref else None, course=u.course,
                              track_icon=u.track.icon if u.track else "", points=u.points, is_me=u.id == user.id))
    return LeaderboardOut(rows=rows, my_rank=(await session.scalar(rank_query)) + 1)


# --------------------------------------------------------------------------- universities, verification, roles

@router.get("/universities", response_model=list[UniversityOut])
async def universities(session: Session) -> list[University]:
    return list((await session.execute(select(University).where(University.is_active)
                                       .order_by(University.city != "Toshkent", University.name))).scalars())


class UniversityIn(BaseModel):
    name: str = Field(min_length=3, max_length=200)


@router.post("/universities", response_model=UniversityOut)
async def add_university(body: UniversityIn, user: CurrentUser, session: Session) -> University:
    """A student whose university is not listed types its name, so sign-up never stops there.
    An existing name (any letter case) is reused; admins can tidy the list later."""
    name = " ".join(body.name.split())
    existing = (await session.execute(select(University).where(func.lower(University.name) == name.lower()))).scalar_one_or_none()
    if existing:
        if not existing.is_active:              # switched off by an admin: only an admin brings it back
            raise HTTPException(409, "Bu universitet ro'yxatdan olib tashlangan. Ro'yxatdan tanlang "
                                     "yoki administratorga murojaat qiling.")
        return existing
    ratelimit.limit(f"university-create:{user.id}", 3, 24 * 3600,
                    "Bir kunda 3 tadan ortiq yangi universitet qo'shib bo'lmaydi")
    uni = University(name=name, short_name=name[:40], city="")
    session.add(uni)
    await session.commit()
    return uni


@router.post("/me/verification", response_model=MeOut)
async def request_verification(user: CurrentUser, session: Session) -> MeOut:
    """Asks the student's university (its career centre staff) or a CareerFlow admin to confirm
    that the student really studies there. Needs the university, faculty, course and student ID."""
    if user.verification == "verified":
        raise HTTPException(409, "Siz allaqachon tasdiqlangansiz")
    # the student number (HEMIS) helps the checker but is optional for now
    missing = [label for label, ok in (("universitet", user.university_id), ("fakultet", user.faculty),
                                       ("kurs", user.course)) if not ok]
    if missing:
        raise HTTPException(422, "To'ldiring: " + ", ".join(missing))
    if user.consent_at is None:
        raise HTTPException(422, "Avval shaxsiy ma'lumotlarni qayta ishlashga rozilik bering")
    user.verification, user.verification_note = "pending", ""
    await session.commit()
    staff = (await session.execute(select(User.id).where(
        User.staff_university_id == user.university_id, User.staff_status == "approved"))).scalars().all()
    await inbox.push(session, staff, "verification_request",
                     f"Yangi talaba tasdiqlashni kutmoqda: {user.full_name}, {user.faculty}, {user.course}-kurs.",
                     link="/universitet/tasdiqlash", params={"student": user.full_name})
    await session.refresh(user)
    return await me_out(session, user)


class PasswordIn(BaseModel):
    email: str = Field(max_length=160)
    password: str = Field(min_length=8, max_length=128)
    current_password: str = Field(default="", max_length=128)


@router.put("/me/password", response_model=MeOut)
async def set_password(body: PasswordIn, user: CurrentUser, session: Session) -> MeOut:
    """Email and password for the website, on the same account as the bot."""
    from ..services.admin_accounts import check_password, hash_password
    from .auth import _email
    try:
        email = _email(body.email)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    import asyncio
    if user.password_hash and not await asyncio.to_thread(check_password, body.current_password, user.password_hash):
        raise HTTPException(403, "Joriy parol noto'g'ri")
    if await session.scalar(select(User.id).where(User.email == email, User.id != user.id)):
        raise HTTPException(409, "Bu email boshqa akkauntga bog'langan")
    user.email, user.password_hash = email, await asyncio.to_thread(hash_password, body.password)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


class LinkPinIn(BaseModel):
    pin: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/me/telegram-link/{code}/verify", response_model=MeOut)
async def telegram_link_verify(code: str, body: LinkPinIn, user: CurrentUser, session: Session) -> MeOut:
    from ..services import web_login
    await web_login.verify_link(session, code[:40], body.pin, user)
    await session.refresh(user)
    return await me_out(session, user)


@router.post("/me/telegram-link")
async def telegram_link(user: CurrentUser, session: Session) -> dict:
    """A one-time bot link that ties this (website) account to the Telegram account that confirms it."""
    from ..services import bots, telegram_bot, web_login
    if user.telegram_id is not None:
        raise HTTPException(409, "Telegram allaqachon ulangan")
    username = await bots.username(session)
    if not username:
        raise HTTPException(503, "Bot hali sozlanmagan")
    code = await web_login.create(session, "link", user.id)
    return {"code": code, "url": telegram_bot.start_link(username, web_login.PREFIX + code),
            "expires_in": int(web_login.TTL.total_seconds())}


@router.get("/catalog")
async def catalog() -> dict:
    """Choice lists for the sign-up forms (fields of business, company types, sizes, regions)."""
    return catalog_dict()


@router.post("/me/company", response_model=MeOut, status_code=201)
async def register_company(body: EmployerSignupIn, user: CurrentUser, session: Session) -> MeOut:
    """Turns the account into an employer account. The company is hidden until an admin checks it
    (for example its STIR on orginfo.uz)."""
    if user.company_id:
        raise HTTPException(409, "Siz allaqachon kompaniyaga bog'langansiz")
    if not user.phone:
        raise HTTPException(422, "Telefon raqamingizni kiriting")
    if await session.scalar(select(func.count()).select_from(Company).where(Company.stir == body.stir)):
        raise HTTPException(409, "Bu STIR bilan kompaniya ro'yxatdan o'tgan. Jamoaga qo'shilish uchun adminga yozing.")
    company = Company(**body.model_dump(exclude={"full_name", "job_title", "consent"}))
    session.add(company)
    await session.flush()
    user.company_id, user.account_type = company.id, "employer"
    user.full_name, user.name_set_by_user = " ".join(body.full_name.split()), True
    user.job_title = " ".join(body.job_title.split())
    user.consent_at = user.consent_at or datetime.now(UTC)
    user.consent_version = CONSENT_VERSION
    await session.commit()
    await session.refresh(user)
    admins = (await session.execute(select(User.telegram_id).where(
        (User.role == Role.admin) | User.is_owner, User.is_blocked.is_(False)))).scalars().all()
    notify.send(list(admins), f"Yangi kompaniya tekshiruvni kutmoqda: {company.name} (STIR {company.stir}).")
    return await me_out(session, user)


@router.post("/me/staff-request", response_model=MeOut, status_code=201)
async def request_staff(body: StaffRequestIn, user: CurrentUser, session: Session) -> MeOut:
    """University career-centre staff ask for access to their university's dashboard."""
    if not await session.get(University, body.university_id):
        raise HTTPException(404, "Universitet topilmadi")
    user.account_type, user.staff_university_id = "university", body.university_id
    user.staff_position, user.staff_status = body.position, "pending"
    user.consent_at = user.consent_at or datetime.now(UTC)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.post("/me/account-type/student", response_model=MeOut)
async def back_to_student(user: CurrentUser, session: Session) -> MeOut:
    """Leaves a pending employer or staff request and returns to the student experience."""
    if (user.company is not None and user.company.status == "approved") or user.staff_status == "approved":
        raise HTTPException(409, "Tasdiqlangan kompaniya yoki universitet hisobini talaba hisobiga aylantirib "
                                 "bo'lmaydi. Talaba sifatida alohida hisob oching.")
    user.account_type = "student"
    if user.staff_status != "approved":
        user.staff_university_id, user.staff_status = None, ""
    company = user.company
    if company is not None and company.status != "approved":
        # an unapproved company request is withdrawn, so the person can sign up as an employer again later
        user.company_id = None
        await session.flush()
        if not await session.scalar(select(func.count()).select_from(User).where(User.company_id == company.id)):
            await session.delete(company)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)
